use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::agent::{context, executor};
use crate::commands::error::AgentShellError;
use crate::session::SessionManager;

/// Returns the last `line_count` lines of sanitized PTY scrollback for the
/// given session, suitable for injection into an AI prompt as context.
#[tauri::command]
pub async fn get_context(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    line_count: Option<usize>,
) -> Result<String, AgentShellError> {
    let id = Uuid::parse_str(&session_id)
        .map_err(|_| AgentShellError::Internal(format!("invalid session_id: {session_id}")))?;

    context::extract_context(&session_manager, id, line_count.unwrap_or(100))
        .await
        .map_err(|e| AgentShellError::Internal(e.to_string()))
}

/// Execute a command that was proposed by the AI and approved by the user.
/// Sends the command to the PTY and records it in the audit log.
#[tauri::command]
pub async fn execute_approved_command(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    command: String,
) -> Result<(), AgentShellError> {
    let id = Uuid::parse_str(&session_id)
        .map_err(|_| AgentShellError::Internal(format!("invalid session_id: {session_id}")))?;

    executor::execute_approved(&session_manager, id, command).await
}
