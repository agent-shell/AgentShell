use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::commands::error::AgentShellError;
use crate::session::SessionManager;
use crate::ssh::client::{SshAuth, SshConnectParams};

#[derive(Debug, Deserialize)]
pub struct ConnectSshArgs {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_kind: String, // "password" | "publickey" | "agent"
    pub password: Option<String>,
    pub key_path: Option<String>,
    pub key_passphrase: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ConnectSshResult {
    pub session_id: String,
}

#[tauri::command]
pub async fn connect_ssh(
    app: tauri::AppHandle,
    session_manager: State<'_, std::sync::Arc<SessionManager>>,
    args: ConnectSshArgs,
) -> Result<ConnectSshResult, AgentShellError> {
    let auth = match args.auth_kind.as_str() {
        "password" => SshAuth::Password(
            args.password
                .ok_or_else(|| AgentShellError::AuthFailed("password required".into()))?,
        ),
        "publickey" => SshAuth::PublicKey {
            key_path: args
                .key_path
                .ok_or_else(|| AgentShellError::AuthFailed("key_path required".into()))?,
            passphrase: args.key_passphrase,
        },
        "agent" => SshAuth::Agent,
        other => {
            return Err(AgentShellError::AuthFailed(format!(
                "unknown auth_kind: {other}"
            )))
        }
    };

    let params = SshConnectParams {
        host: args.host,
        port: args.port,
        username: args.username,
        auth,
    };

    let session_id = std::sync::Arc::clone(&session_manager)
        .connect_ssh(app, params)
        .await
        .map_err(|e| AgentShellError::ConnectionFailed(e.to_string()))?;

    Ok(ConnectSshResult {
        session_id: session_id.to_string(),
    })
}

#[tauri::command]
pub async fn disconnect_session(
    session_manager: State<'_, std::sync::Arc<SessionManager>>,
    session_id: String,
) -> Result<(), AgentShellError> {
    let id = Uuid::parse_str(&session_id)
        .map_err(|_| AgentShellError::SessionNotFound(session_id.clone()))?;
    session_manager
        .disconnect(id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn send_input(
    session_manager: State<'_, std::sync::Arc<SessionManager>>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), AgentShellError> {
    let id = Uuid::parse_str(&session_id)
        .map_err(|_| AgentShellError::SessionNotFound(session_id.clone()))?;
    session_manager
        .send_input(id, data)
        .await
        .map_err(Into::into)
}

#[derive(Debug, Deserialize)]
pub struct ResizeArgs {
    pub session_id: String,
    pub cols: u32,
    pub rows: u32,
}

#[tauri::command]
pub async fn resize_pty(
    session_manager: State<'_, std::sync::Arc<SessionManager>>,
    args: ResizeArgs,
) -> Result<(), AgentShellError> {
    let id = Uuid::parse_str(&args.session_id)
        .map_err(|_| AgentShellError::SessionNotFound(args.session_id.clone()))?;
    session_manager
        .resize(id, args.cols, args.rows)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn connect_local_shell(
    app: tauri::AppHandle,
    session_manager: State<'_, std::sync::Arc<SessionManager>>,
) -> Result<ConnectSshResult, AgentShellError> {
    let session_id = std::sync::Arc::clone(&session_manager)
        .connect_local_shell(app)
        .await
        .map_err(|e| AgentShellError::ConnectionFailed(e.to_string()))?;

    Ok(ConnectSshResult {
        session_id: session_id.to_string(),
    })
}

#[tauri::command]
pub async fn get_scrollback_raw(
    session_manager: State<'_, std::sync::Arc<SessionManager>>,
    session_id: String,
) -> Result<Vec<u8>, AgentShellError> {
    let id = Uuid::parse_str(&session_id)
        .map_err(|_| AgentShellError::SessionNotFound(session_id.clone()))?;
    session_manager
        .get_scrollback_raw(id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_scrollback(
    session_manager: State<'_, std::sync::Arc<SessionManager>>,
    session_id: String,
    lines: usize,
) -> Result<String, AgentShellError> {
    let id = Uuid::parse_str(&session_id)
        .map_err(|_| AgentShellError::SessionNotFound(session_id.clone()))?;
    session_manager
        .extract_scrollback_text(id, lines)
        .await
        .map_err(Into::into)
}
