use anyhow::{anyhow, Result};
use russh::client::{self, Handler};
use russh::keys::key::PublicKey;
use russh::{Channel, ChannelMsg};
use std::sync::Arc;

use crate::ssh::auth::{self, KnownHostsResult};

/// Russh Handler that performs TOFU known-hosts verification in check_server_key.
///
/// On first connection to a host: fingerprint is saved and connection proceeds.
/// On subsequent connections: fingerprint must match or connection is aborted.
/// On mismatch: returns Err (possible MITM) — connection is aborted.
pub struct AgentShellHandler {
    pub host: String,
    pub port: u16,
}

/// Convenience alias: the russh client handle with our handler type.
pub type SshHandle = client::Handle<AgentShellHandler>;

#[async_trait::async_trait]
impl Handler for AgentShellHandler {
    type Error = anyhow::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        match auth::verify(&self.host, self.port, server_public_key) {
            KnownHostsResult::Known => Ok(true),
            KnownHostsResult::Unknown => {
                // TOFU: auto-save on first connection and proceed.
                // TODO(v1.1): surface fingerprint to user via IPC before saving.
                auth::save(&self.host, self.port, server_public_key)?;
                Ok(true)
            }
            KnownHostsResult::Mismatch { expected, got } => Err(anyhow!(
                "Host key mismatch for {}:{} (expected {}, got {}). \
                 Possible MITM attack. Connection refused.",
                self.host,
                self.port,
                expected,
                got
            )),
        }
    }
}

/// SSH authentication method.
#[derive(Debug, Clone)]
pub enum SshAuth {
    Password(String),
    PublicKey { key_path: String, passphrase: Option<String> },
    // Agent auth: sign with SSH agent. Uses SSH_AUTH_SOCK.
    Agent,
}

/// Connection parameters for a new SSH session.
#[derive(Debug, Clone)]
pub struct SshConnectParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuth,
}

/// A connected SSH session, authenticated and ready to open channels.
pub struct SshSession {
    pub handle: SshHandle,
}

impl SshSession {
    /// Connect and authenticate. Returns an authenticated session handle.
    pub async fn connect(params: SshConnectParams) -> Result<Self> {
        let config = Arc::new(client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(3600)),
            keepalive_interval: Some(std::time::Duration::from_secs(60)),
            keepalive_max: 3,
            ..<_>::default()
        });

        let addr = format!("{}:{}", params.host, params.port);
        let handler = AgentShellHandler {
            host: params.host.clone(),
            port: params.port,
        };
        let mut handle = client::connect(config, addr, handler).await?;

        let authenticated = match &params.auth {
            SshAuth::Password(pw) => handle
                .authenticate_password(params.username.clone(), pw.clone())
                .await
                .map_err(|e| anyhow!(e))?,
            SshAuth::PublicKey { key_path, passphrase } => {
                // Expand leading `~/` to the home directory.
                let expanded = if key_path.starts_with("~/") {
                    dirs::home_dir()
                        .map(|h| h.join(&key_path[2..]))
                        .unwrap_or_else(|| std::path::PathBuf::from(key_path))
                } else {
                    std::path::PathBuf::from(key_path)
                };
                let key = russh_keys::load_secret_key(&expanded, passphrase.as_deref())?;
                handle
                    .authenticate_publickey(params.username.clone(), Arc::new(key))
                    .await
                    .map_err(|e| anyhow!(e))?
            }
            SshAuth::Agent => {
                // Request identities from agent, try each in turn.
                // russh 0.44 has no direct authenticate_with_agent shim.
                // TODO(v1.1): upgrade to russh ≥0.45 or implement signing shim.
                let mut agent =
                    russh_keys::agent::client::AgentClient::connect_env().await?;
                let identities = agent.request_identities().await?;
                let ok = false;
                for _pubkey in identities {
                    break;
                }
                if !ok {
                    return Err(anyhow!(
                        "SSH Agent auth is not yet available in this build. \
                         Please use key_path auth and specify your private key file."
                    ));
                }
                ok
            }
        };

        if !authenticated {
            return Err(anyhow!("SSH authentication rejected by server"));
        }

        Ok(SshSession { handle })
    }

    /// Open a PTY + shell channel. Returns the Channel ready to use.
    pub async fn open_pty_shell(&mut self, cols: u32, rows: u32) -> Result<Channel<client::Msg>> {
        let channel = self.handle.channel_open_session().await.map_err(|e| anyhow!(e))?;
        channel
            .request_pty(true, "xterm-256color", cols, rows, 0, 0, &[])
            .await
            .map_err(|e| anyhow!(e))?;
        channel.request_shell(true).await.map_err(|e| anyhow!(e))?;
        Ok(channel)
    }

}

/// Drive a channel's output into a callback until EOF.
///
/// `on_data` is called synchronously with each chunk of stdout/stderr data.
/// Returns when the channel signals EOF or the channel is closed.
pub async fn drive_channel_output<F>(mut channel: Channel<client::Msg>, mut on_data: F)
where
    F: FnMut(Vec<u8>) + Send,
{
    loop {
        match channel.wait().await {
            Some(ChannelMsg::Data { ref data }) => {
                on_data(data.to_vec());
            }
            Some(ChannelMsg::ExtendedData { ref data, ext: _ }) => {
                on_data(data.to_vec());
            }
            Some(ChannelMsg::ExitStatus { .. }) => {
                // Shell exited; keep draining until EOF.
            }
            Some(ChannelMsg::Eof) | None => break,
            _ => {}
        }
    }
}
