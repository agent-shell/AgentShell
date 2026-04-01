/// Session manager — owns the registry of all SSH and local PTY sessions.
///
/// # Lock ordering (MUST be respected to avoid deadlocks)
///
/// Global registry lock (acquire briefly, RELEASE before taking any per-session lock):
///   0. sessions  — HashMap<Uuid, Arc<SessionHandle>>
///
/// Per-session locks (when holding multiple, acquire in this strict order):
///   1. ssh_channel  (write: send_input, resize)
///   2. scrollback   (read/write: AI context, recording)
///   3. pty_mode     (read: frequently; write: rare — use RwLock)
///
/// `ssh_transport` is an independent lock, only taken during connect/disconnect.
/// It is never held simultaneously with locks 1-3.
///
/// INVARIANT: never hold `sessions` (lock 0) while holding any per-session lock (1-3).
/// INVARIANT: never acquire a higher-numbered lock while holding a lower-numbered one.
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;

use crate::pty::local::spawn_local_shell;
use crate::ssh::client::{drive_channel_output, SshConnectParams, SshHandle, SshSession};

/// Max scrollback buffer size (bytes). Overflow: drop oldest bytes in 4KB batches.
const SCROLLBACK_MAX_BYTES: usize = 1_024 * 1_024; // 1 MB per session

/// Batch PTY output for 10ms before emitting to the frontend (reduces IPC calls ~100x).
const PTY_BATCH_MS: u64 = 10;

#[derive(Debug, Clone, PartialEq)]
pub enum PtyMode {
    Normal,
    Zmodem,
}

/// Abstraction over SSH channel writer and local PTY writer.
/// Both implement AsyncWrite — we use tokio's BoxWriter.
pub type BoxWriter = Box<dyn tokio::io::AsyncWrite + Send + Unpin>;

/// A live session handle.
pub struct SessionHandle {
    /// Lock 1 (acquire first): PTY input writer.
    pub ssh_channel: Arc<Mutex<Option<BoxWriter>>>,

    /// SSH transport handle (SSH sessions only; None for local PTY).
    /// Kept alive here so the russh session task doesn't drop the transport.
    /// Only taken during disconnect — never held alongside locks 1-3.
    pub ssh_transport: Arc<Mutex<Option<SshHandle>>>,

    /// Lock 2 (acquire second): raw PTY output bytes.
    /// Shared between recording task and AI context extraction.
    pub scrollback: Arc<Mutex<VecDeque<u8>>>,

    /// Lock 3 (acquire third): current PTY mode.
    /// RwLock because health monitor reads frequently, writes are rare.
    pub pty_mode: Arc<RwLock<PtyMode>>,

    /// Local PTY child killer (Local sessions only; None for SSH sessions).
    /// Stored separately from ssh_transport. Calling kill() closes the slave PTY,
    /// which causes the blocking reader to return EOF, naturally stopping Tasks 1 & 2.
    pub local_killer: Arc<Mutex<Option<Box<dyn portable_pty::ChildKiller + Send + Sync>>>>,

    /// Zmodem receiver fed by the batcher task while in PtyMode::Zmodem.
    /// Taken out by `start_zmodem_send` to drive the sender state machine.
    pub zmodem_input_rx:
        Arc<Mutex<Option<tokio::sync::mpsc::UnboundedReceiver<Vec<u8>>>>>,
}

/// Detect the 4-byte Zmodem ZRINIT magic in a raw PTY byte slice.
/// Returns the byte offset of `**\x18B` (ZPAD ZPAD ZDLE ZHEX) if present.
fn find_zrinit(data: &[u8]) -> Option<usize> {
    data.windows(4).position(|w| w == b"**\x18B")
}

/// Global session registry.
pub struct SessionManager {
    sessions: Mutex<HashMap<Uuid, Arc<SessionHandle>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Get a session by ID. Acquires `sessions` briefly, releases before returning.
    pub async fn get(&self, id: Uuid) -> Option<Arc<SessionHandle>> {
        self.sessions.lock().await.get(&id).cloned()
    }

    /// Connect a new SSH session and start the PTY output loop.
    /// Returns the session UUID.
    pub async fn connect_ssh(
        self: Arc<Self>,
        app: tauri::AppHandle,
        params: SshConnectParams,
    ) -> anyhow::Result<Uuid> {
        use tauri::Emitter;

        let id = Uuid::new_v4();
        let mut ssh = SshSession::connect(params).await?;
        let channel = ssh.open_pty_shell(220, 50).await?;

        // Keep the SSH transport handle alive in SessionHandle.
        // Dropping it would shut down the russh session task.
        let transport_handle = ssh.handle;

        // Channel writer for sending input to the PTY.
        let writer: BoxWriter = Box::new(channel.make_writer());

        let scrollback: Arc<Mutex<VecDeque<u8>>> = Arc::new(Mutex::new(VecDeque::new()));
        let pty_mode: Arc<RwLock<PtyMode>> = Arc::new(RwLock::new(PtyMode::Normal));

        let handle = Arc::new(SessionHandle {
            ssh_channel: Arc::new(Mutex::new(Some(writer))),
            ssh_transport: Arc::new(Mutex::new(Some(transport_handle))),
            scrollback: scrollback.clone(),
            pty_mode: pty_mode.clone(),
            local_killer: Arc::new(Mutex::new(None)),
            zmodem_input_rx: Arc::new(Mutex::new(None)),
        });

        self.sessions.lock().await.insert(id, handle.clone());

        // Unbounded channel: output task → scrollback+batcher task
        let (raw_tx, mut raw_rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();

        // Task 1: drive SSH channel output, forward each chunk to raw_tx.
        // No per-chunk spawning — raw_tx.send is non-blocking.
        let manager_for_cleanup = Arc::clone(&self);
        let app_for_disconnect = app.clone();
        let session_id_str = id.to_string();

        tokio::spawn(async move {
            drive_channel_output(channel, |data| {
                let _ = raw_tx.send(data);
            })
            .await;

            // Channel ended — notify frontend and remove from registry.
            let _ = app_for_disconnect.emit(
                &format!("session-disconnected-{}", session_id_str),
                (),
            );
            manager_for_cleanup.sessions.lock().await.remove(&id);
        });

        // Task 2: consume raw_rx, write to scrollback, batch-emit to frontend.
        // Also detects Zmodem ZRINIT and switches to Zmodem forwarding mode.
        let app_batch = app.clone();
        let sid_str = id.to_string();
        let pty_mode_batcher = pty_mode.clone();
        let zmodem_rx_arc = handle.zmodem_input_rx.clone();

        tokio::spawn(async move {
            // Local Zmodem sender (Some while in Zmodem mode).
            let mut zmodem_tx: Option<tokio::sync::mpsc::UnboundedSender<Vec<u8>>> = None;

            loop {
                let mut buf: Vec<u8> = Vec::with_capacity(8192);
                let deadline = tokio::time::Instant::now()
                    + tokio::time::Duration::from_millis(PTY_BATCH_MS);

                loop {
                    match tokio::time::timeout_at(deadline, raw_rx.recv()).await {
                        Ok(Some(chunk)) => {
                            let in_zmodem =
                                *pty_mode_batcher.read().await == PtyMode::Zmodem;

                            if in_zmodem {
                                // Forward raw bytes to the Zmodem sender task.
                                if let Some(ref tx) = zmodem_tx {
                                    if tx.send(chunk).is_err() {
                                        // Receiver gone (transfer ended).
                                        zmodem_tx = None;
                                        *pty_mode_batcher.write().await = PtyMode::Normal;
                                    }
                                }
                            } else if let Some(pos) = find_zrinit(&chunk) {
                                // ZRINIT detected: flush display bytes before the magic.
                                let pre = chunk[..pos].to_vec();
                                if !pre.is_empty() {
                                    {
                                        let mut sb = scrollback.lock().await;
                                        sb.extend(pre.iter().copied());
                                        while sb.len() > SCROLLBACK_MAX_BYTES {
                                            let n = 4096.min(sb.len() - SCROLLBACK_MAX_BYTES);
                                            sb.drain(..n);
                                        }
                                    }
                                    buf.extend_from_slice(&pre);
                                }
                                if !buf.is_empty() {
                                    let _ = app_batch.emit(
                                        &format!("pty-output-{}", sid_str),
                                        std::mem::take(&mut buf),
                                    );
                                }

                                // Create the Zmodem input channel.
                                let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
                                *zmodem_rx_arc.lock().await = Some(rx);
                                // Send ZRINIT + tail bytes as the first Zmodem chunk.
                                let _ = tx.send(chunk[pos..].to_vec());
                                zmodem_tx = Some(tx);

                                *pty_mode_batcher.write().await = PtyMode::Zmodem;
                                let _ = app_batch
                                    .emit(&format!("zmodem-start-{}", sid_str), ());
                            } else {
                                // Normal mode: write scrollback + accumulate for display.
                                {
                                    let mut sb = scrollback.lock().await;
                                    sb.extend(chunk.iter().copied());
                                    while sb.len() > SCROLLBACK_MAX_BYTES {
                                        let n = 4096.min(sb.len() - SCROLLBACK_MAX_BYTES);
                                        sb.drain(..n);
                                    }
                                }
                                buf.extend_from_slice(&chunk);
                            }
                        }
                        Ok(None) => {
                            // raw_tx dropped (Task 1 ended): flush and exit.
                            if !buf.is_empty() {
                                let _ = app_batch
                                    .emit(&format!("pty-output-{}", sid_str), buf);
                            }
                            return;
                        }
                        Err(_) => break, // 10ms deadline: flush
                    }
                }

                if !buf.is_empty() {
                    let _ = app_batch.emit(
                        &format!("pty-output-{}", sid_str),
                        std::mem::take(&mut buf),
                    );
                }
            }
        });

        Ok(id)
    }

    /// Spawn a local shell PTY and start its output loop.
    /// Returns the session UUID.
    pub async fn connect_local_shell(
        self: Arc<Self>,
        app: tauri::AppHandle,
    ) -> anyhow::Result<Uuid> {
        use std::io::Read;
        use tauri::Emitter;

        let id = Uuid::new_v4();

        let (pty_writer, mut reader, killer) = spawn_local_shell()?;
        let writer: BoxWriter = Box::new(pty_writer);

        let scrollback: Arc<Mutex<VecDeque<u8>>> = Arc::new(Mutex::new(VecDeque::new()));
        let pty_mode: Arc<RwLock<PtyMode>> = Arc::new(RwLock::new(PtyMode::Normal));

        let handle = Arc::new(SessionHandle {
            ssh_channel: Arc::new(Mutex::new(Some(writer))),
            ssh_transport: Arc::new(Mutex::new(None)),
            scrollback: scrollback.clone(),
            pty_mode: pty_mode.clone(),
            local_killer: Arc::new(Mutex::new(Some(killer))),
            zmodem_input_rx: Arc::new(Mutex::new(None)),
        });

        self.sessions.lock().await.insert(id, handle.clone());

        let (raw_tx, mut raw_rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();

        // Task 1: blocking read from PTY reader → raw_tx
        let manager_for_cleanup = Arc::clone(&self);
        let app_for_disconnect = app.clone();
        let session_id_str = id.to_string();
        let raw_tx_clone = raw_tx.clone();

        tokio::task::spawn_blocking(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if raw_tx_clone.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                }
            }
            // Shell exited — notify frontend
            let rt = tokio::runtime::Handle::current();
            rt.spawn(async move {
                let _ = app_for_disconnect.emit(
                    &format!("session-disconnected-{}", session_id_str),
                    (),
                );
                manager_for_cleanup.sessions.lock().await.remove(&id);
            });
        });

        // Task 2: batcher with Zmodem detection — same as SSH version.
        let app_batch = app.clone();
        let sid_str = id.to_string();
        let pty_mode_batcher = pty_mode.clone();
        let zmodem_rx_arc = handle.zmodem_input_rx.clone();

        tokio::spawn(async move {
            let mut zmodem_tx: Option<tokio::sync::mpsc::UnboundedSender<Vec<u8>>> = None;

            loop {
                let mut buf: Vec<u8> = Vec::with_capacity(8192);
                let deadline = tokio::time::Instant::now()
                    + tokio::time::Duration::from_millis(PTY_BATCH_MS);

                loop {
                    match tokio::time::timeout_at(deadline, raw_rx.recv()).await {
                        Ok(Some(chunk)) => {
                            let in_zmodem =
                                *pty_mode_batcher.read().await == PtyMode::Zmodem;

                            if in_zmodem {
                                if let Some(ref tx) = zmodem_tx {
                                    if tx.send(chunk).is_err() {
                                        zmodem_tx = None;
                                        *pty_mode_batcher.write().await = PtyMode::Normal;
                                    }
                                }
                            } else if let Some(pos) = find_zrinit(&chunk) {
                                let pre = chunk[..pos].to_vec();
                                if !pre.is_empty() {
                                    {
                                        let mut sb = scrollback.lock().await;
                                        sb.extend(pre.iter().copied());
                                        while sb.len() > SCROLLBACK_MAX_BYTES {
                                            let n = 4096.min(sb.len() - SCROLLBACK_MAX_BYTES);
                                            sb.drain(..n);
                                        }
                                    }
                                    buf.extend_from_slice(&pre);
                                }
                                if !buf.is_empty() {
                                    let _ = app_batch.emit(
                                        &format!("pty-output-{}", sid_str),
                                        std::mem::take(&mut buf),
                                    );
                                }
                                let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
                                *zmodem_rx_arc.lock().await = Some(rx);
                                let _ = tx.send(chunk[pos..].to_vec());
                                zmodem_tx = Some(tx);
                                *pty_mode_batcher.write().await = PtyMode::Zmodem;
                                let _ = app_batch
                                    .emit(&format!("zmodem-start-{}", sid_str), ());
                            } else {
                                {
                                    let mut sb = scrollback.lock().await;
                                    sb.extend(chunk.iter().copied());
                                    while sb.len() > SCROLLBACK_MAX_BYTES {
                                        let n = 4096.min(sb.len() - SCROLLBACK_MAX_BYTES);
                                        sb.drain(..n);
                                    }
                                }
                                buf.extend_from_slice(&chunk);
                            }
                        }
                        Ok(None) => {
                            if !buf.is_empty() {
                                let _ = app_batch
                                    .emit(&format!("pty-output-{}", sid_str), buf);
                            }
                            return;
                        }
                        Err(_) => break,
                    }
                }
                if !buf.is_empty() {
                    let _ = app_batch.emit(
                        &format!("pty-output-{}", sid_str),
                        std::mem::take(&mut buf),
                    );
                }
            }
        });

        Ok(id)
    }

    /// Send raw bytes (keyboard input) to a session's PTY.
    pub async fn send_input(&self, id: Uuid, data: Vec<u8>) -> anyhow::Result<()> {
        let session = self
            .get(id)
            .await
            .ok_or_else(|| anyhow::anyhow!("session not found: {}", id))?;
        // Lock 1: ssh_channel
        let mut guard = session.ssh_channel.lock().await;
        let writer = guard
            .as_mut()
            .ok_or_else(|| anyhow::anyhow!("session channel closed"))?;
        writer.write_all(&data).await?;
        Ok(())
    }

    /// Resize the PTY.
    /// Note: russh Channel.window_change requires a separate Channel reference.
    /// The Channel was consumed by make_writer(); resize is a stub until we
    /// store a separate Arc<Mutex<Channel>> alongside the writer.
    pub async fn resize(&self, id: Uuid, _cols: u32, _rows: u32) -> anyhow::Result<()> {
        let _ = self
            .get(id)
            .await
            .ok_or_else(|| anyhow::anyhow!("session not found: {}", id))?;
        // TODO(v1): implement via separate channel handle (make_writer consumes Channel)
        Ok(())
    }

    /// Disconnect a session gracefully.
    ///
    /// Lock ordering: acquires ssh_channel (lock 1), drops it, then acquires
    /// ssh_transport (independent), drops it, then acquires sessions (lock 0).
    /// sessions is never held while holding per-session locks.
    pub async fn disconnect(&self, id: Uuid) -> anyhow::Result<()> {
        if let Some(session) = self.get(id).await {
            // Lock 1: shut down the PTY writer.
            {
                let mut guard = session.ssh_channel.lock().await;
                if let Some(writer) = guard.as_mut() {
                    let _ = writer.shutdown().await;
                }
                *guard = None;
            }

            // For local sessions: kill the child process.
            // This closes the slave PTY, causing reader.read() to return EOF,
            // which exits the spawn_blocking task, drops raw_tx_clone, and
            // stops the batcher task (fixes task-leak issue #2 from codex review).
            if let Some(mut killer) = session.local_killer.lock().await.take() {
                let _ = killer.kill();
            }

            // ssh_transport lock (independent of 1-3): send SSH disconnect.
            if let Some(handle) = session.ssh_transport.lock().await.take() {
                let _ = handle
                    .disconnect(russh::Disconnect::ByApplication, "", "English")
                    .await;
            }
        }

        // Lock 0: remove from registry (held briefly, after per-session locks released).
        self.sessions.lock().await.remove(&id);
        Ok(())
    }

    /// Return raw scrollback bytes (ANSI codes intact) for terminal replay on attach.
    pub async fn get_scrollback_raw(&self, id: Uuid) -> anyhow::Result<Vec<u8>> {
        let session = self
            .get(id)
            .await
            .ok_or_else(|| anyhow::anyhow!("session not found: {}", id))?;
        let sb = session.scrollback.lock().await;
        Ok(sb.iter().copied().collect())
    }

    /// Extract the last `line_count` lines from scrollback for AI context.
    /// ANSI escape codes are stripped before returning.
    pub async fn extract_scrollback_text(
        &self,
        id: Uuid,
        line_count: usize,
    ) -> anyhow::Result<String> {
        let session = self
            .get(id)
            .await
            .ok_or_else(|| anyhow::anyhow!("session not found: {}", id))?;
        // Lock 2: scrollback
        let sb = session.scrollback.lock().await;
        let bytes: Vec<u8> = sb.iter().copied().collect();
        drop(sb);

        let stripped = strip_ansi_escapes::strip(&bytes);
        let text = String::from_utf8_lossy(&stripped);

        let lines: Vec<&str> = text.lines().collect();
        let start = lines.len().saturating_sub(line_count);
        Ok(lines[start..].join("\n"))
    }
}
