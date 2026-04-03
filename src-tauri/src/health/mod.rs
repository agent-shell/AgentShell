/// Server health monitor.
///
/// Polls `uptime` via an independent SSH exec channel every N seconds.
/// Stores the result in `SessionHandle.server_health` and emits a
/// `health-update-{session_id}` Tauri event so the frontend can update dots.
///
/// Load classification (matches CEO plan L2):
///   green  = load_1m < cpu_count
///   yellow = cpu_count ≤ load_1m < 2 × cpu_count
///   red    = load_1m ≥ 2 × cpu_count
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::session::manager::PtyMode;
use crate::session::SessionManager;

/// Health reading for one SSH session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthData {
    pub load_1m: f32,
    pub cpu_count: u32,
    /// "green" | "yellow" | "red"
    pub status: String,
}

impl HealthData {
    fn classify(load_1m: f32, cpu_count: u32) -> &'static str {
        if load_1m < cpu_count as f32 {
            "green"
        } else if load_1m < (cpu_count * 2) as f32 {
            "yellow"
        } else {
            "red"
        }
    }
}

/// Spawn a health-monitoring background task for `session_id`.
/// The task exits when the session is removed from the registry or on error.
pub fn spawn_health_monitor(
    app: tauri::AppHandle,
    session_manager: Arc<SessionManager>,
    session_id: Uuid,
    interval_secs: u64,
) {
    tokio::spawn(async move {
        let mut interval =
            tokio::time::interval(tokio::time::Duration::from_secs(interval_secs));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            interval.tick().await;

            let session = match session_manager.get(session_id).await {
                Some(s) => s,
                None => break, // session removed
            };

            // Skip during Zmodem transfers (CEO plan L4).
            if *session.pty_mode.read().await == PtyMode::Zmodem {
                continue;
            }

            // Acquire ssh_transport lock to open an exec channel.
            let result: anyhow::Result<HealthData> = async {
                let mut transport = session.ssh_transport.lock().await;
                let handle = transport
                    .as_mut()
                    .ok_or_else(|| anyhow::anyhow!("not an SSH session"))?;

                let channel = handle
                    .channel_open_session()
                    .await
                    .map_err(|e| anyhow::anyhow!("{e}"))?;

                // Run `uptime` + `nproc` in one command for efficiency.
                channel
                    .exec(
                        true,
                        "uptime | awk '{print $(NF-2)}' | tr -d ','; echo; nproc",
                    )
                    .await
                    .map_err(|e| anyhow::anyhow!("{e}"))?;

                // Collect output (drop the lock once channel is opened).
                drop(transport);

                let mut output = Vec::<u8>::new();
                let mut ch = channel;
                loop {
                    match ch.wait().await {
                        Some(russh::ChannelMsg::Data { ref data }) => {
                            output.extend_from_slice(data);
                        }
                        Some(russh::ChannelMsg::Eof) | None => break,
                        _ => {}
                    }
                }

                let text = String::from_utf8_lossy(&output);
                let mut lines = text.lines();
                let load_1m: f32 = lines
                    .next()
                    .and_then(|l| l.trim().parse().ok())
                    .unwrap_or(0.0);
                let cpu_count: u32 = lines
                    .next()
                    .and_then(|l| l.trim().parse().ok())
                    .unwrap_or(1);

                let status = HealthData::classify(load_1m, cpu_count).to_string();
                Ok(HealthData { load_1m, cpu_count, status })
            }
            .await;

            match result {
                Ok(data) => {
                    use tauri::Emitter;
                    let _ = app.emit(&format!("health-update-{session_id}"), &data);
                    *session.server_health.lock().await = Some(data);
                }
                Err(_) => {
                    // Transient error — keep retrying at next interval.
                }
            }
        }
    });
}
