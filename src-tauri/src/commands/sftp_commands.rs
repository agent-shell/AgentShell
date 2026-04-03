use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::commands::error::AgentShellError;
use crate::session::SessionManager;
use crate::sftp::{self, SftpEntry};

#[tauri::command]
pub async fn list_sftp_dir(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
) -> Result<Vec<SftpEntry>, AgentShellError> {
    let id = parse_id(&session_id)?;
    let sftp = sftp::open_sftp(&session_manager, id).await?;
    sftp::list_dir(&sftp, &path).await
}

#[tauri::command]
pub async fn download_sftp_file(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
) -> Result<Vec<u8>, AgentShellError> {
    let id = parse_id(&session_id)?;
    let sftp = sftp::open_sftp(&session_manager, id).await?;
    sftp::download_file(&sftp, &path).await
}

#[tauri::command]
pub async fn upload_sftp_file(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
    data: Vec<u8>,
) -> Result<(), AgentShellError> {
    let id = parse_id(&session_id)?;
    let sftp = sftp::open_sftp(&session_manager, id).await?;
    sftp::upload_file(&sftp, &path, data).await
}

#[tauri::command]
pub async fn mkdir_sftp(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
) -> Result<(), AgentShellError> {
    let id = parse_id(&session_id)?;
    let sftp = sftp::open_sftp(&session_manager, id).await?;
    sftp::mkdir(&sftp, &path).await
}

#[tauri::command]
pub async fn delete_sftp(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
    is_dir: bool,
) -> Result<(), AgentShellError> {
    let id = parse_id(&session_id)?;
    let sftp = sftp::open_sftp(&session_manager, id).await?;
    if is_dir {
        sftp::remove_dir(&sftp, &path).await
    } else {
        sftp::remove_file(&sftp, &path).await
    }
}

#[tauri::command]
pub async fn rename_sftp(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    from: String,
    to: String,
) -> Result<(), AgentShellError> {
    let id = parse_id(&session_id)?;
    let sftp = sftp::open_sftp(&session_manager, id).await?;
    sftp::rename(&sftp, &from, &to).await
}

fn parse_id(s: &str) -> Result<Uuid, AgentShellError> {
    Uuid::parse_str(s).map_err(|_| AgentShellError::Internal(format!("invalid session_id: {s}")))
}
