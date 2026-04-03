/// FTS5 command history search (CEO plan: Ctrl+R semantic search v1).
///
/// Schema:
///   command_history(id, ts, session_id, hostname, command)
///   command_history_fts — FTS5 virtual table over (hostname, command)
///
/// The `command_audit` table (written by executor.rs) is the source of truth.
/// This module provides `search_history` and `record_history_entry`.
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: i64,
    pub ts: String,
    pub session_id: String,
    pub hostname: String,
    pub command: String,
}

fn db_path() -> std::path::PathBuf {
    let mut p = dirs::data_local_dir().unwrap_or_else(std::env::temp_dir);
    p.push("agentshell");
    std::fs::create_dir_all(&p).ok();
    p.push("command_history.db");
    p
}

fn ensure_schema(conn: &Connection) -> anyhow::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS command_history (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            ts        TEXT    NOT NULL DEFAULT (datetime('now')),
            session_id TEXT   NOT NULL,
            hostname  TEXT    NOT NULL DEFAULT '',
            command   TEXT    NOT NULL
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS command_history_fts
            USING fts5(hostname, command, content=command_history, content_rowid=id);
        CREATE TRIGGER IF NOT EXISTS command_history_ai
            AFTER INSERT ON command_history BEGIN
                INSERT INTO command_history_fts(rowid, hostname, command)
                VALUES (new.id, new.hostname, new.command);
            END;",
    )?;
    Ok(())
}

/// Record a command to the history DB.
/// Called from executor.rs after a command is approved and sent to PTY.
#[allow(dead_code)]
pub fn record_history_entry(session_id: &str, hostname: &str, command: &str) -> anyhow::Result<()> {
    let conn = Connection::open(db_path())?;
    ensure_schema(&conn)?;
    conn.execute(
        "INSERT INTO command_history (session_id, hostname, command) VALUES (?1, ?2, ?3)",
        params![session_id, hostname, command],
    )?;
    Ok(())
}

/// FTS5 search. Returns up to `limit` matches ordered by recency.
pub fn search_history_sync(query: &str, limit: usize) -> anyhow::Result<Vec<HistoryEntry>> {
    let conn = Connection::open(db_path())?;
    ensure_schema(&conn)?;

    // Wrap query for FTS5: escape special chars and append wildcard.
    let fts_query = format!("\"{}\"*", query.replace('"', "\"\""));

    let mut stmt = conn.prepare(
        "SELECT h.id, h.ts, h.session_id, h.hostname, h.command
         FROM command_history h
         JOIN command_history_fts fts ON fts.rowid = h.id
         WHERE command_history_fts MATCH ?1
         ORDER BY h.id DESC
         LIMIT ?2",
    )?;

    let rows = stmt.query_map(params![fts_query, limit as i64], |row| {
        Ok(HistoryEntry {
            id: row.get(0)?,
            ts: row.get(1)?,
            session_id: row.get(2)?,
            hostname: row.get(3)?,
            command: row.get(4)?,
        })
    })?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Search command history via FTS5. Returns up to `limit` recent matches.
#[tauri::command]
pub async fn search_command_history(
    query: String,
    limit: Option<usize>,
) -> Vec<HistoryEntry> {
    if query.trim().is_empty() {
        return Vec::new();
    }
    let lim = limit.unwrap_or(20).min(100);
    tokio::task::spawn_blocking(move || {
        search_history_sync(&query, lim).unwrap_or_default()
    })
    .await
    .unwrap_or_default()
}

/// List recent history entries without a search filter.
#[tauri::command]
pub async fn recent_command_history(limit: Option<usize>) -> Vec<HistoryEntry> {
    let lim = limit.unwrap_or(50).min(200);
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<HistoryEntry>> {
        let conn = Connection::open(db_path())?;
        ensure_schema(&conn)?;
        let mut stmt = conn.prepare(
            "SELECT id, ts, session_id, hostname, command
             FROM command_history ORDER BY id DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![lim as i64], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                ts: row.get(1)?,
                session_id: row.get(2)?,
                hostname: row.get(3)?,
                command: row.get(4)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    })
    .await
    .ok()
    .and_then(|r| r.ok())
    .unwrap_or_default()
}
