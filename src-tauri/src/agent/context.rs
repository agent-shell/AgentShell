/// Context extractor for the AI agent panel.
///
/// Pulls scrollback text from the session manager and sanitizes it for
/// transmission to the AI backend (strips residual ANSI/control chars).
use std::sync::Arc;

use once_cell::sync::Lazy;
use regex::Regex;
use uuid::Uuid;

use crate::session::SessionManager;

/// Strip any remaining C0/C1 control characters that slip through ANSI stripping.
/// Keeps printable ASCII + common whitespace (space, tab, newline, CR).
static CTRL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]").expect("invalid control-char regex")
});

/// Extract and sanitize the last `line_count` lines of PTY scrollback.
pub async fn extract_context(
    session_manager: &Arc<SessionManager>,
    session_id: Uuid,
    line_count: usize,
) -> anyhow::Result<String> {
    let raw = session_manager
        .extract_scrollback_text(session_id, line_count)
        .await?;

    let sanitized = CTRL_RE.replace_all(&raw, "").to_string();
    Ok(sanitized)
}
