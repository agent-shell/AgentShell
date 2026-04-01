use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A saved SSH connection profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionProfile {
    pub id: Uuid,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_kind: String, // "password" | "publickey" | "agent"
    pub key_path: Option<String>,
    pub tags: Vec<String>,
}
