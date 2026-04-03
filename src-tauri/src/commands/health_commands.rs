use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::commands::error::AgentShellError;
use crate::health::{spawn_health_monitor, HealthData};
use crate::session::SessionManager;

/// Start the health monitor for an SSH session.
/// interval_secs: polling interval (10-300, default 60).
#[tauri::command]
pub async fn start_health_monitor(
    app: tauri::AppHandle,
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    interval_secs: Option<u64>,
) -> Result<(), AgentShellError> {
    let id = parse_id(&session_id)?;
    let secs = interval_secs.unwrap_or(60).clamp(10, 300);
    spawn_health_monitor(app, Arc::clone(&*session_manager), id, secs);
    Ok(())
}

/// Get the latest health reading for a session (None if not yet available).
#[tauri::command]
pub async fn get_server_health(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
) -> Result<Option<HealthData>, AgentShellError> {
    let id = parse_id(&session_id)?;
    let session = session_manager
        .get(id)
        .await
        .ok_or_else(|| AgentShellError::SessionNotFound(session_id.clone()))?;
    let data = session.server_health.lock().await.clone();
    Ok(data)
}

fn parse_id(s: &str) -> Result<Uuid, AgentShellError> {
    Uuid::parse_str(s).map_err(|_| AgentShellError::Internal(format!("invalid session_id: {s}")))
}
