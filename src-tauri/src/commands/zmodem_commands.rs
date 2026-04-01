/// Zmodem file transfer commands.
///
/// When the remote server runs `rz`, it emits a ZRINIT frame (`**\x18B…`).
/// The session batcher detects this magic, switches to Zmodem mode, and emits
/// `zmodem-start-{session_id}` to the frontend.  The frontend picks a file and
/// calls `start_zmodem_send`.  We run the `zmodem2::send` state machine in a
/// blocking thread, piping output to the SSH channel via a tokio channel bridge.
use std::collections::VecDeque;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::commands::error::AgentShellError;
use crate::session::manager::PtyMode;
use crate::session::SessionManager;

/// Synchronous I/O bridge that connects the blocking `zmodem2::send` state
/// machine to the async SSH channel.
///
/// - Reads come from the tokio mpsc channel fed by the PTY batcher task.
/// - Writes go to another tokio mpsc channel drained by an async writer task.
struct ZmodemPort {
    rx: tokio::sync::mpsc::UnboundedReceiver<Vec<u8>>,
    rx_buf: VecDeque<u8>,
    tx: tokio::sync::mpsc::UnboundedSender<Vec<u8>>,
}

impl std::io::Read for ZmodemPort {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        // Drain any previously buffered bytes first.
        if !self.rx_buf.is_empty() {
            let n = buf.len().min(self.rx_buf.len());
            for (dst, src) in buf.iter_mut().take(n).zip(self.rx_buf.drain(..n)) {
                *dst = src;
            }
            return Ok(n);
        }
        // Block until the next chunk arrives from the batcher task.
        match self.rx.blocking_recv() {
            Some(data) if !data.is_empty() => {
                let n = buf.len().min(data.len());
                buf[..n].copy_from_slice(&data[..n]);
                if data.len() > n {
                    self.rx_buf.extend(&data[n..]);
                }
                Ok(n)
            }
            _ => Ok(0), // channel closed → EOF
        }
    }
}

impl std::io::Write for ZmodemPort {
    fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
        self.tx.send(data.to_vec()).map_err(|_| {
            std::io::Error::new(std::io::ErrorKind::BrokenPipe, "SSH writer task gone")
        })?;
        Ok(data.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

/// Drive zmodem send until the protocol reaches SessionEnd.
///
/// `zmodem2::send` moves the transfer to `FileEnd`, but session teardown
/// requires `zmodem2::finish` to exchange ZFIN/OO with the receiver.
fn run_zmodem_send_session<P, F>(
    port: &mut P,
    file: &mut F,
    state: &mut zmodem2::State,
) -> Result<(), zmodem2::Error>
where
    P: zmodem2::Read + zmodem2::Write + ?Sized,
    F: zmodem2::Read + zmodem2::Seek + ?Sized,
{
    use std::thread;
    use std::time::Duration;

    // Defensive bound so malformed streams don't spin forever.
    const MAX_STEPS: usize = 4096;
    // Small backoff when protocol state makes no progress.
    const STALL_BACKOFF_MS: u64 = 8;

    fn stall_limit(stage: zmodem2::Stage) -> usize {
        match stage {
            // Handshake should complete quickly, otherwise abort to avoid
            // blasting ZMODEM control frames into a normal shell.
            zmodem2::Stage::SessionBegin => 24,
            zmodem2::Stage::FileBegin => 48,
            // File transfer may remain in this stage for many chunks.
            zmodem2::Stage::FileInProgress => 512,
            // Finish phase should be short; repeated ZFIN on a normal shell is noisy.
            zmodem2::Stage::FileEnd => 8,
            zmodem2::Stage::SessionEnd => 0,
        }
    }

    let mut last_stage = state.stage();
    let mut last_count = state.count();
    let mut stalled_steps: usize = 0;

    for _ in 0..MAX_STEPS {
        match state.stage() {
            zmodem2::Stage::SessionEnd => return Ok(()),
            zmodem2::Stage::FileEnd => zmodem2::finish(port, state)?,
            _ => zmodem2::send(port, file, state)?,
        }

        if state.stage() == zmodem2::Stage::SessionEnd {
            return Ok(());
        }

        if state.stage() == last_stage && state.count() == last_count {
            stalled_steps += 1;
            if stalled_steps >= stall_limit(state.stage()) {
                return Err(zmodem2::Error::Data);
            }
            thread::sleep(Duration::from_millis(STALL_BACKOFF_MS));
        } else {
            last_stage = state.stage();
            last_count = state.count();
            stalled_steps = 0;
        }
    }

    Err(zmodem2::Error::Data)
}

/// Send a file to the remote host using ZMODEM.
///
/// The caller must ensure a ZRINIT has been received (i.e. `rz` is running on
/// the remote) before calling this.  File data is passed as raw bytes so the
/// frontend avoids writing a temp file.
#[tauri::command]
pub async fn start_zmodem_send(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    file_name: String,
    file_data: Vec<u8>,
) -> Result<(), AgentShellError> {
    use tokio::io::AsyncWriteExt;

    let id = Uuid::parse_str(&session_id)
        .map_err(|_| AgentShellError::Internal(format!("invalid UUID: {}", session_id)))?;

    let session = session_manager
        .get(id)
        .await
        .ok_or_else(|| AgentShellError::SessionNotFound(session_id.clone()))?;

    // Take the Zmodem input receiver (created by the batcher when ZRINIT arrived).
    let zmodem_rx = session
        .zmodem_input_rx
        .lock()
        .await
        .take()
        .ok_or_else(|| AgentShellError::Internal("no pending zmodem transfer".into()))?;

    let file_size = u32::try_from(file_data.len()).unwrap_or(u32::MAX);

    // Bridge: blocking writer → async SSH channel write task.
    let (out_tx, mut out_rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();

    let ssh_channel = session.ssh_channel.clone();
    let pty_mode = session.pty_mode.clone();

    // Async task: drain out_rx and write each chunk to the SSH channel.
    // When out_rx closes (port dropped), reset pty_mode to Normal.
    tokio::spawn(async move {
        while let Some(data) = out_rx.recv().await {
            let mut guard = ssh_channel.lock().await;
            if let Some(writer) = guard.as_mut() {
                let _ = writer.write_all(&data).await;
            }
        }
        *pty_mode.write().await = PtyMode::Normal;
    });

    // Blocking task: run the zmodem2::send state machine.
    let worker = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut port = ZmodemPort {
            rx: zmodem_rx,
            rx_buf: VecDeque::new(),
            tx: out_tx,
        };

        let state_res = zmodem2::State::new_file(&file_name, file_size);
        let mut state = match state_res {
            Ok(s) => s,
            Err(e) => {
                return Err(format!("State::new_file failed: {:?}", e));
            }
        };

        let mut file = std::io::Cursor::new(file_data);

        if let Err(e) = run_zmodem_send_session(&mut port, &mut file, &mut state) {
            return Err(format!(
                "send session error at stage {:?}, count {}: {:?}",
                state.stage(),
                state.count(),
                e
            ));
        }

        Ok(())
    });

    worker
        .await
        .map_err(|e| AgentShellError::Internal(format!("zmodem worker join error: {}", e)))?
        .map_err(AgentShellError::Internal)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::run_zmodem_send_session;
    use std::io::{Cursor, Read, Write};

    struct MockPort {
        input: Cursor<Vec<u8>>,
        output: Vec<u8>,
    }

    impl MockPort {
        fn new(input: Vec<u8>) -> Self {
            Self {
                input: Cursor::new(input),
                output: Vec::new(),
            }
        }
    }

    impl Read for MockPort {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            self.input.read(buf)
        }
    }

    impl Write for MockPort {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.output.extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    fn push_hex_header(buf: &mut Vec<u8>, frame: zmodem2::Frame, count: u32) {
        zmodem2::Header::new(zmodem2::Encoding::ZHEX, frame, &[0; 4])
            .with_count(count)
            .write(buf)
            .expect("write test header");
    }

    #[test]
    fn send_session_reaches_session_end_after_finish() {
        let mut scripted = Vec::new();
        push_hex_header(&mut scripted, zmodem2::Frame::ZRINIT, 0);
        push_hex_header(&mut scripted, zmodem2::Frame::ZRPOS, 0);
        push_hex_header(&mut scripted, zmodem2::Frame::ZRINIT, 0);
        push_hex_header(&mut scripted, zmodem2::Frame::ZFIN, 0);

        let mut port = MockPort::new(scripted);
        let mut file = Cursor::new(b"abc".to_vec());
        let mut state = zmodem2::State::new_file("tiny.txt", 3).expect("state");

        run_zmodem_send_session(&mut port, &mut file, &mut state).expect("session send");

        assert_eq!(state.stage(), zmodem2::Stage::SessionEnd);

        let mut zfin_header = Vec::new();
        push_hex_header(&mut zfin_header, zmodem2::Frame::ZFIN, 0);
        assert!(
            port.output
                .windows(zfin_header.len())
                .any(|w| w == zfin_header.as_slice()),
            "sender must emit ZFIN during finish phase"
        );
    }

    #[test]
    fn send_session_fails_fast_on_non_zmodem_stream() {
        let scripted = vec![b'x'; 256];
        let mut port = MockPort::new(scripted);
        let mut file = Cursor::new(b"abc".to_vec());
        let mut state = zmodem2::State::new_file("tiny.txt", 3).expect("state");

        let err = run_zmodem_send_session(&mut port, &mut file, &mut state)
            .expect_err("must fail on non-zmodem stream");

        assert_eq!(err, zmodem2::Error::Data);
        assert_ne!(state.stage(), zmodem2::Stage::SessionEnd);
        assert!(
            port.output.len() < 4096,
            "should stop quickly instead of flooding protocol frames"
        );
    }
}
