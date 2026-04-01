/// Local shell PTY support using portable-pty.
///
/// Spawns a local shell (bash / cmd.exe / powershell) and returns a writer
/// compatible with the session manager's BoxWriter type alias.
use anyhow::Result;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::Write;
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::io::AsyncWrite;

/// An AsyncWrite adapter that routes writes through a sync writer on a blocking
/// thread pool via a tokio channel. This avoids blocking the async runtime.
pub struct LocalPtyWriter {
    tx: tokio::sync::mpsc::UnboundedSender<Vec<u8>>,
}

impl AsyncWrite for LocalPtyWriter {
    fn poll_write(
        self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        let n = buf.len();
        match self.tx.send(buf.to_vec()) {
            Ok(()) => Poll::Ready(Ok(n)),
            Err(_) => Poll::Ready(Err(std::io::Error::new(
                std::io::ErrorKind::BrokenPipe,
                "PTY writer channel closed",
            ))),
        }
    }

    fn poll_flush(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Poll::Ready(Ok(()))
    }

    fn poll_shutdown(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Poll::Ready(Ok(()))
    }
}

/// Spawn a local shell PTY.
///
/// Returns:
/// - `writer`: async writer for keyboard input
/// - `reader`: blocking reader that yields raw PTY output bytes
/// - `killer`: `Send + Sync` handle to kill the child process on disconnect
pub fn spawn_local_shell() -> Result<(
    LocalPtyWriter,
    Box<dyn std::io::Read + Send>,
    Box<dyn portable_pty::ChildKiller + Send + Sync>,
)> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: 50,
        cols: 220,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(target_os = "windows") {
            "cmd.exe".to_string()
        } else {
            "/bin/bash".to_string()
        }
    });

    let mut cmd = CommandBuilder::new(&shell);
    cmd.env("TERM", "xterm-256color");

    let mut child = pair.slave.spawn_command(cmd)?;
    // clone_killer() gives a Send+Sync handle we can store and call kill() on later.
    let killer = child.clone_killer();
    // Child must stay alive (don't drop it) or the process may be cleaned up.
    // Spawn a detached waiter thread so the process table entry is reaped naturally.
    std::thread::spawn(move || { let _ = child.wait(); });

    let mut sync_writer = pair.master.take_writer()?;
    let reader = pair.master.try_clone_reader()?;

    // Channel-based bridge: async writes → sync writes on a dedicated thread
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();
    std::thread::spawn(move || {
        while let Some(data) = rx.blocking_recv() {
            if sync_writer.write_all(&data).is_err() {
                break;
            }
        }
    });

    Ok((LocalPtyWriter { tx }, reader, killer))
}
