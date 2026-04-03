#[allow(dead_code)]
#[path = "../ssh/mod.rs"]
mod ssh;

use anyhow::{Context, Result};
use russh::ChannelMsg;
use russh_sftp::client::SftpSession;
use tokio::io::AsyncWriteExt;

use ssh::client::{SshAuth, SshConnectParams, SshSession};

fn usage() -> &'static str {
    "usage: cargo run --manifest-path src-tauri/Cargo.toml --bin read_only_ssh_smoke -- <host> <port> <username> <password> [repo_path]"
}

async fn list_repo_dir(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
    repo_path: &str,
) -> Result<Vec<String>> {
    let ssh = SshSession::connect(SshConnectParams {
        host: host.to_string(),
        port,
        username: username.to_string(),
        auth: SshAuth::Password(password.to_string()),
    })
    .await
    .context("sftp smoke connect failed")?;

    let channel = ssh
        .handle
        .channel_open_session()
        .await
        .context("failed to open ssh session channel for sftp")?;

    channel
        .request_subsystem(true, "sftp")
        .await
        .context("failed to request sftp subsystem")?;

    let sftp = SftpSession::new(channel.into_stream())
        .await
        .context("failed to initialize sftp session")?;

    let entries = sftp
        .read_dir(repo_path)
        .await
        .with_context(|| format!("failed to list sftp directory: {repo_path}"))?;

    let mut out = entries
        .into_iter()
        .take(12)
        .map(|entry| {
            let meta = entry.metadata();
            let kind = if meta.is_dir() { "dir " } else { "file" };
            format!("{kind} {}", entry.file_name())
        })
        .collect::<Vec<_>>();

    out.sort();
    Ok(out)
}

async fn run_exec_readonly(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
    repo_path: &str,
) -> Result<String> {
    let ssh = SshSession::connect(SshConnectParams {
        host: host.to_string(),
        port,
        username: username.to_string(),
        auth: SshAuth::Password(password.to_string()),
    })
    .await
    .context("pty smoke connect failed")?;

    let mut channel = ssh
        .handle
        .channel_open_session()
        .await
        .context("failed to open exec channel")?;

    let command = format!(
        "printf '=== SESSION ===\\n'; hostname; whoami; pwd; \
         printf '\\n=== REPO ===\\n'; cd {repo_path} && pwd && git status --short -b | sed -n '1,20p'; \
         printf '\\n=== WEB ===\\n'; ls -la web | sed -n '1,20p'; \
         printf '\\n=== DONE ===\\n'"
    );

    channel
        .exec(true, command)
        .await
        .context("failed to execute readonly smoke command")?;

    let mut output = Vec::new();
    let mut exit_status = None;

    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::Data { ref data } | ChannelMsg::ExtendedData { ref data, .. } => {
                output.write_all(data).await?;
            }
            ChannelMsg::ExitStatus { exit_status: code } => {
                exit_status = Some(code);
            }
            ChannelMsg::Eof => break,
            _ => {}
        }
    }

    let clean = strip_ansi_escapes::strip(&output);
    let text = String::from_utf8_lossy(&clean).into_owned();

    match exit_status {
        Some(0) | None => Ok(text),
        Some(code) => anyhow::bail!("readonly exec exited with status {code}\n{text}"),
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = std::env::args().collect::<Vec<_>>();
    if args.len() < 5 {
        anyhow::bail!(usage());
    }

    let host = &args[1];
    let port = args[2].parse::<u16>().context("invalid port")?;
    let username = &args[3];
    let password = &args[4];
    let repo_path = args
        .get(5)
        .map(String::as_str)
        .unwrap_or("/home/ubuntu/liangli/skillhub");

    let output = run_exec_readonly(host, port, username, password, repo_path).await?;
    println!("=== PTY OUTPUT BEGIN ===");
    println!("{output}");
    println!("=== PTY OUTPUT END ===");

    let sftp_listing = list_repo_dir(host, port, username, password, repo_path).await?;
    println!("=== SFTP LIST BEGIN ===");
    for line in sftp_listing {
        println!("{line}");
    }
    println!("=== SFTP LIST END ===");

    Ok(())
}
