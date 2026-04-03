/// Session recording in asciinema v2 format.
///
/// Each recording is a file at `~/.agentshell/recordings/{session_id}-{ts}.cast`.
/// Format (asciinema v2):
///   Line 1: JSON header: {"version":2,"width":220,"height":50,"timestamp":1234567890}
///   Lines 2+: JSON events: [elapsed_secs, "o", "data..."]
///
/// CEO plan (L3): warn at 100MB, auto-stop at 500MB.
use std::io::Write;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

const WARN_BYTES: u64 = 100 * 1024 * 1024;  // 100 MB
const STOP_BYTES: u64 = 500 * 1024 * 1024;  // 500 MB

/// Events sent from the PTY batcher task to the recording task.
pub enum RecordingEvent {
    Data(Vec<u8>),
}

/// Info about an existing recording file.
#[derive(Debug, Serialize, Deserialize)]
pub struct RecordingInfo {
    pub path: String,
    pub size_bytes: u64,
    pub filename: String,
}

pub fn recordings_dir() -> PathBuf {
    let mut p = dirs::home_dir().unwrap_or_else(std::env::temp_dir);
    p.push(".agentshell");
    p.push("recordings");
    p
}

/// Spawn a recording task that writes asciinema v2 format to `path`.
/// `rx` receives data events from the PTY batcher.
/// Returns a sender to push events (stored in `SessionHandle.recording_tx`).
pub fn start_recording_task(
    path: PathBuf,
    cols: u32,
    rows: u32,
    app: tauri::AppHandle,
    session_id: String,
) -> tokio::sync::mpsc::UnboundedSender<RecordingEvent> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<RecordingEvent>();

    tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(path.parent().unwrap_or(&path)).ok();

        let mut file = match std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&path)
        {
            Ok(f) => f,
            Err(e) => {
                eprintln!("recording open failed: {e}");
                return;
            }
        };

        // Header
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or(Duration::ZERO)
            .as_secs();
        let header = format!(
            r#"{{"version":2,"width":{cols},"height":{rows},"timestamp":{ts}}}"#
        );
        let _ = writeln!(file, "{header}");

        let start = Instant::now();
        let mut written: u64 = header.len() as u64 + 1;
        loop {
            // Drain synchronously (spawn_blocking context, can't await)
            // Use a channel try_recv loop instead
            match rx.try_recv() {
                Ok(RecordingEvent::Data(data)) => {
                    let elapsed = start.elapsed().as_secs_f64();
                    let escaped = serde_json::to_string(
                        &String::from_utf8_lossy(&data).to_string(),
                    )
                    .unwrap_or_default();
                    let line = format!("[{elapsed:.6},\"o\",{escaped}]\n");
                    let n = line.len() as u64;
                    let _ = write!(file, "{line}");
                    written += n;

                    if written >= STOP_BYTES {
                        use tauri::Emitter;
                        let _ = app.emit(
                            &format!("recording-stopped-{session_id}"),
                            "size_limit",
                        );
                        break;
                    }
                    if written >= WARN_BYTES {
                        use tauri::Emitter;
                        let _ = app.emit(
                            &format!("recording-warn-{session_id}"),
                            written,
                        );
                    }
                }
                Err(tokio::sync::mpsc::error::TryRecvError::Empty) => {
                    std::thread::sleep(Duration::from_millis(5));
                }
                Err(tokio::sync::mpsc::error::TryRecvError::Disconnected) => {
                    break; // sender dropped (stop_recording cleared recording_tx)
                }
            }
        }
        let _ = file.flush();
    });

    tx
}

/// List all recording files in the recordings directory.
pub fn list_recordings() -> Vec<RecordingInfo> {
    let dir = recordings_dir();
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("cast") {
                let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
                let filename = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                out.push(RecordingInfo {
                    path: path.to_string_lossy().into_owned(),
                    size_bytes,
                    filename,
                });
            }
        }
    }
    out.sort_by(|a, b| b.filename.cmp(&a.filename));
    out
}
