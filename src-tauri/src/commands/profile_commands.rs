/// IPC commands for connection profile CRUD (backed by tauri-plugin-store).
use tauri::State;
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

use crate::commands::error::AgentShellError;
use crate::profile::store::ConnectionProfile;
use crate::session::SessionManager;
use crate::ssh::client::{SshAuth, SshConnectParams};

const STORE_FILE: &str = "profiles.json";
const STORE_KEY: &str = "items";

fn load_profiles(app: &tauri::AppHandle) -> Result<Vec<ConnectionProfile>, AgentShellError> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AgentShellError::Internal(e.to_string()))?;
    let profiles = store
        .get(STORE_KEY)
        .and_then(|v| serde_json::from_value::<Vec<ConnectionProfile>>(v).ok())
        .unwrap_or_default();
    Ok(profiles)
}

fn save_profiles(
    app: &tauri::AppHandle,
    profiles: &Vec<ConnectionProfile>,
) -> Result<(), AgentShellError> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AgentShellError::Internal(e.to_string()))?;
    store.set(
        STORE_KEY,
        serde_json::to_value(profiles)
            .map_err(|e| AgentShellError::Internal(e.to_string()))?,
    );
    store
        .save()
        .map_err(|e| AgentShellError::Internal(e.to_string()))?;
    Ok(())
}

/// List all saved connection profiles.
#[tauri::command]
pub async fn list_profiles(app: tauri::AppHandle) -> Result<Vec<ConnectionProfile>, AgentShellError> {
    load_profiles(&app)
}

/// Save (create or update) a connection profile.
#[tauri::command]
pub async fn save_profile(
    app: tauri::AppHandle,
    profile: ConnectionProfile,
) -> Result<ConnectionProfile, AgentShellError> {
    let mut profiles = load_profiles(&app)?;
    if let Some(pos) = profiles.iter().position(|p| p.id == profile.id) {
        profiles[pos] = profile.clone();
    } else {
        profiles.push(profile.clone());
    }
    save_profiles(&app, &profiles)?;
    Ok(profile)
}

/// Delete a connection profile by ID.
#[tauri::command]
pub async fn delete_profile(
    app: tauri::AppHandle,
    id: String,
) -> Result<(), AgentShellError> {
    let profile_id = Uuid::parse_str(&id)
        .map_err(|_| AgentShellError::Internal(format!("invalid UUID: {}", id)))?;
    let mut profiles = load_profiles(&app)?;
    let before = profiles.len();
    profiles.retain(|p| p.id != profile_id);
    if profiles.len() == before {
        return Err(AgentShellError::SessionNotFound(id));
    }
    save_profiles(&app, &profiles)
}

/// Connect to SSH using a saved profile (password/key_path must be supplied separately for security).
#[tauri::command]
pub async fn connect_profile(
    app: tauri::AppHandle,
    session_manager: State<'_, std::sync::Arc<SessionManager>>,
    profile_id: String,
    password: Option<String>,
    key_passphrase: Option<String>,
) -> Result<crate::commands::ssh_commands::ConnectSshResult, AgentShellError> {
    use crate::commands::ssh_commands::ConnectSshResult;

    let profiles = load_profiles(&app)?;
    let profile = profiles
        .iter()
        .find(|p| p.id.to_string() == profile_id)
        .ok_or_else(|| AgentShellError::SessionNotFound(profile_id.clone()))?;

    let auth = match profile.auth_kind.as_str() {
        "password" => SshAuth::Password(
            password.or(profile.password.clone())
                .ok_or_else(|| AgentShellError::AuthFailed("password required".into()))?,
        ),
        "publickey" => SshAuth::PublicKey {
            key_path: profile
                .key_path
                .clone()
                .ok_or_else(|| AgentShellError::AuthFailed("key_path required".into()))?,
            passphrase: key_passphrase,
        },
        "agent" => SshAuth::Agent,
        other => {
            return Err(AgentShellError::AuthFailed(format!(
                "unknown auth_kind: {}",
                other
            )))
        }
    };

    let params = SshConnectParams {
        host: profile.host.clone(),
        port: profile.port,
        username: profile.username.clone(),
        auth,
    };

    let session_id = std::sync::Arc::clone(&session_manager)
        .connect_ssh(app, params, profile.name.clone())
        .await
        .map_err(|e| AgentShellError::ConnectionFailed(e.to_string()))?;

    Ok(ConnectSshResult {
        session_id: session_id.to_string(),
    })
}
