/// Typed IPC error enum. All Tauri commands return `Result<T, AgentShellError>`.
/// serde::Serialize is required for Tauri to forward errors to the frontend.
#[derive(Debug, thiserror::Error, serde::Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AgentShellError {
    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("Authentication failed: {0}")]
    AuthFailed(String),

    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<anyhow::Error> for AgentShellError {
    fn from(e: anyhow::Error) -> Self {
        AgentShellError::Internal(e.to_string())
    }
}

impl From<std::io::Error> for AgentShellError {
    fn from(e: std::io::Error) -> Self {
        AgentShellError::Io(e.to_string())
    }
}
