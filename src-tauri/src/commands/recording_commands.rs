use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::commands::error::AgentShellError;
use crate::recording::{list_recordings, start_recording_task, RecordingInfo, recordings_dir};
use crate::session::SessionManager;

/// Start recording the session's PTY output (asciinema v2 format).
#[tauri::command]
pub async fn start_recording(
    app: tauri::AppHandle,
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
) -> Result<String, AgentShellError> {
    let id = parse_id(&session_id)?;
    let session = session_manager
        .get(id)
        .await
        .ok_or_else(|| AgentShellError::SessionNotFound(session_id.clone()))?;

    let mut rec_guard = session.recording_tx.lock().await;
    if rec_guard.is_some() {
        return Err(AgentShellError::Internal("already recording".into()));
    }

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let dir = recordings_dir();
    let path = dir.join(format!("{session_id}-{ts}.cast"));

    let tx = start_recording_task(path.clone(), 220, 50, app, session_id);
    *rec_guard = Some(tx);

    Ok(path.to_string_lossy().into_owned())
}

/// Stop recording the session.
#[tauri::command]
pub async fn stop_recording(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
) -> Result<(), AgentShellError> {
    let id = parse_id(&session_id)?;
    let session = session_manager
        .get(id)
        .await
        .ok_or_else(|| AgentShellError::SessionNotFound(session_id.clone()))?;

    // Dropping the sender causes the recording task to exit.
    *session.recording_tx.lock().await = None;
    Ok(())
}

/// List all existing recording files.
#[tauri::command]
pub async fn list_session_recordings() -> Vec<RecordingInfo> {
    tokio::task::spawn_blocking(list_recordings)
        .await
        .unwrap_or_default()
}

fn parse_id(s: &str) -> Result<Uuid, AgentShellError> {
    Uuid::parse_str(s).map_err(|_| AgentShellError::Internal(format!("invalid session_id: {s}")))
}
