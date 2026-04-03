/// Approved-command executor.
///
/// Sends the approved shell command (with a trailing newline) to the active PTY
/// via Lock 1 (ssh_channel), then logs the execution to SQLite audit history.
///
/// # Lock ordering
/// Only Lock 1 (ssh_channel) is acquired here. SQLite write is in spawn_blocking
/// and must not be called while holding any per-session lock.
use std::sync::Arc;

use rusqlite::{params, Connection};
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::commands::error::AgentShellError;
use crate::session::SessionManager;

/// Send `command` to the PTY of `session_id`, then record it in the audit log.
pub async fn execute_approved(
    session_manager: &Arc<SessionManager>,
    session_id: Uuid,
    command: String,
) -> Result<(), AgentShellError> {
    // --- Lock 1: write to PTY channel ---
    let session = session_manager
        .get(session_id)
        .await
        .ok_or_else(|| AgentShellError::SessionNotFound(session_id.to_string()))?;

    {
        let mut guard = session.ssh_channel.lock().await;
        let writer = guard
            .as_mut()
            .ok_or_else(|| AgentShellError::Internal("channel writer is None".into()))?;

        let mut line = command.clone();
        if !line.ends_with('\n') {
            line.push('\n');
        }
        writer
            .write_all(line.as_bytes())
            .await
            .map_err(|e| AgentShellError::Io(e.to_string()))?;
    }
    // Lock 1 released here — now safe to do SQLite work.

    // --- Audit log (spawned blocking to avoid async context in rusqlite) ---
    let db_path = audit_db_path();
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let conn = Connection::open(&db_path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS command_audit (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                ts        TEXT    NOT NULL DEFAULT (datetime('now')),
                session   TEXT    NOT NULL,
                command   TEXT    NOT NULL
            );",
        )?;
        conn.execute(
            "INSERT INTO command_audit (session, command) VALUES (?1, ?2)",
            params![session_id.to_string(), command],
        )?;
        Ok(())
    })
    .await
    .map_err(|e| AgentShellError::Internal(e.to_string()))?
    .map_err(|e| AgentShellError::Internal(e.to_string()))?;

    Ok(())
}

fn audit_db_path() -> std::path::PathBuf {
    let mut p = dirs::data_local_dir().unwrap_or_else(std::env::temp_dir);
    p.push("agentshell");
    std::fs::create_dir_all(&p).ok();
    p.push("command_audit.db");
    p
}
