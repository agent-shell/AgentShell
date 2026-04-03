/// SFTP file manager — uses russh-sftp over an existing SSH session's transport.
///
/// A new SSH channel is opened on the existing transport (no new TCP connection),
/// SFTP subsystem is requested, and operations are performed.
///
/// The channel is opened while holding `ssh_transport` lock, then the lock is
/// released before any data transfer (lock-free I/O path).
use std::sync::Arc;

use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use uuid::Uuid;

use crate::commands::error::AgentShellError;
use crate::session::SessionManager;

/// Metadata for one SFTP directory entry.
#[derive(Debug, Serialize, Deserialize)]
pub struct SftpEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<u64>, // unix timestamp
}

/// Open an SFTP session on the given SSH session transport.
pub async fn open_sftp(
    session_manager: &Arc<SessionManager>,
    session_id: Uuid,
) -> Result<SftpSession, AgentShellError> {
    let session = session_manager
        .get(session_id)
        .await
        .ok_or_else(|| AgentShellError::SessionNotFound(session_id.to_string()))?;

    // Briefly hold the transport lock to open a new session channel.
    let channel = {
        let mut transport = session.ssh_transport.lock().await;
        let handle = transport
            .as_mut()
            .ok_or_else(|| AgentShellError::Internal("not an SSH session".into()))?;
        handle
            .channel_open_session()
            .await
            .map_err(|e| AgentShellError::Internal(e.to_string()))?
    };
    // Transport lock released here — channel is independent.

    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| AgentShellError::Internal(format!("subsystem request: {e}")))?;

    SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| AgentShellError::Internal(format!("sftp init: {e}")))
}

/// List directory contents.
pub async fn list_dir(sftp: &SftpSession, path: &str) -> Result<Vec<SftpEntry>, AgentShellError> {
    let entries = sftp
        .read_dir(path)
        .await
        .map_err(|e| AgentShellError::Internal(e.to_string()))?;

    let mut out = Vec::new();
    for entry in entries {
        let meta = entry.metadata();
        let is_dir = meta.is_dir();
        let size = meta.size.unwrap_or(0);
        let modified = meta.mtime.map(|t| t as u64);
        let name = entry.file_name();
        let entry_path = if path.ends_with('/') {
            format!("{}{}", path, name)
        } else {
            format!("{}/{}", path, name)
        };
        out.push(SftpEntry {
            name,
            path: entry_path,
            is_dir,
            size,
            modified,
        });
    }
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

/// Download a file; returns raw bytes.
pub async fn download_file(sftp: &SftpSession, path: &str) -> Result<Vec<u8>, AgentShellError> {
    let mut file = sftp
        .open(path)
        .await
        .map_err(|e| AgentShellError::Internal(e.to_string()))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .await
        .map_err(|e| AgentShellError::Io(e.to_string()))?;
    Ok(buf)
}

/// Upload bytes to a remote path.
pub async fn upload_file(
    sftp: &SftpSession,
    path: &str,
    data: Vec<u8>,
) -> Result<(), AgentShellError> {
    let mut file = sftp
        .create(path)
        .await
        .map_err(|e| AgentShellError::Internal(e.to_string()))?;
    file.write_all(&data)
        .await
        .map_err(|e| AgentShellError::Io(e.to_string()))?;
    file.flush()
        .await
        .map_err(|e| AgentShellError::Io(e.to_string()))?;
    Ok(())
}

/// Create a remote directory (non-recursive).
pub async fn mkdir(sftp: &SftpSession, path: &str) -> Result<(), AgentShellError> {
    sftp.create_dir(path)
        .await
        .map_err(|e| AgentShellError::Internal(e.to_string()))
}

/// Delete a remote file.
pub async fn remove_file(sftp: &SftpSession, path: &str) -> Result<(), AgentShellError> {
    sftp.remove_file(path)
        .await
        .map_err(|e| AgentShellError::Internal(e.to_string()))
}

/// Delete a remote directory (must be empty).
pub async fn remove_dir(sftp: &SftpSession, path: &str) -> Result<(), AgentShellError> {
    sftp.remove_dir(path)
        .await
        .map_err(|e| AgentShellError::Internal(e.to_string()))
}

/// Rename / move a remote path.
pub async fn rename(
    sftp: &SftpSession,
    from: &str,
    to: &str,
) -> Result<(), AgentShellError> {
    sftp.rename(from, to)
        .await
        .map_err(|e| AgentShellError::Internal(e.to_string()))
}
