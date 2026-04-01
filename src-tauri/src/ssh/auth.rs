/// known_hosts verification for SSH connections.
///
/// russh does not implement known_hosts natively. This module handles:
/// - First connection: caller receives `KnownHostsResult::Unknown`
/// - Subsequent connections: verify fingerprint matches
/// - Mismatch: return `KnownHostsResult::Mismatch` with clear error details
use anyhow::Result;
use base64::engine::general_purpose::STANDARD_NO_PAD;
use base64::Engine;
use russh_keys::key::PublicKey;
use russh_keys::PublicKeyBase64;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::PathBuf;

fn known_hosts_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".agentshell")
        .join("known_hosts")
}

/// Load the known_hosts file into a map of `host:port` → `SHA256:base64fingerprint`.
fn load_known_hosts() -> HashMap<String, String> {
    let path = known_hosts_path();
    let Ok(content) = std::fs::read_to_string(&path) else {
        return HashMap::new();
    };
    let mut map = HashMap::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        // Format: "host:port SHA256:<fingerprint>"
        let mut parts = line.splitn(2, ' ');
        if let (Some(host_port), Some(fp)) = (parts.next(), parts.next()) {
            map.insert(host_port.to_string(), fp.to_string());
        }
    }
    map
}

/// Compute SHA-256 fingerprint of a public key in `SHA256:<base64>` format.
pub fn fingerprint(public_key: &PublicKey) -> String {
    let raw = public_key.public_key_bytes();
    let digest = Sha256::digest(&raw);
    format!("SHA256:{}", STANDARD_NO_PAD.encode(digest))
}

/// Result of a known-hosts check.
#[derive(Debug)]
pub enum KnownHostsResult {
    /// Key matches stored fingerprint.
    Known,
    /// Host not in known_hosts.
    Unknown,
    /// Fingerprint mismatch — possible MITM.
    Mismatch { expected: String, got: String },
}

/// Check if a host key is known and matches.
pub fn verify(host: &str, port: u16, public_key: &PublicKey) -> KnownHostsResult {
    let hosts = load_known_hosts();
    let key = format!("{}:{}", host, port);
    let fp = fingerprint(public_key);
    match hosts.get(&key) {
        Some(known_fp) if *known_fp == fp => KnownHostsResult::Known,
        Some(known_fp) => KnownHostsResult::Mismatch {
            expected: known_fp.clone(),
            got: fp,
        },
        None => KnownHostsResult::Unknown,
    }
}

/// Save a new host key to known_hosts (user accepted TOFU prompt).
pub fn save(host: &str, port: u16, public_key: &PublicKey) -> Result<()> {
    let path = known_hosts_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let fp = fingerprint(public_key);
    let entry = format!("{}:{} {}\n", host, port, fp);
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)?;
    file.write_all(entry.as_bytes())?;
    Ok(())
}
