mod agent;
mod commands;
mod health;
mod profile;
mod pty;
mod recording;
mod session;
mod sftp;
mod ssh;

use std::sync::Arc;

use commands::agent_commands::{execute_approved_command, get_context};
use commands::health_commands::{get_server_health, start_health_monitor};
use commands::history_commands::{recent_command_history, search_command_history};
use commands::profile_commands::{connect_profile, delete_profile, list_profiles, save_profile};
use commands::recording_commands::{
    list_session_recordings, start_recording, stop_recording,
};
use commands::sftp_commands::{
    delete_sftp, download_sftp_file, list_sftp_dir, mkdir_sftp, rename_sftp, upload_sftp_file,
};
use commands::ssh_commands::{
    connect_local_shell, connect_ssh, disconnect_session, get_scrollback, get_scrollback_raw,
    resize_pty, send_input,
};
use commands::zmodem_commands::start_zmodem_send;
use session::SessionManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let session_manager = Arc::new(SessionManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .manage(session_manager)
        .invoke_handler(tauri::generate_handler![
            // SSH / PTY
            connect_ssh,
            connect_local_shell,
            disconnect_session,
            send_input,
            resize_pty,
            get_scrollback,
            get_scrollback_raw,
            // Profiles
            list_profiles,
            save_profile,
            delete_profile,
            connect_profile,
            // Zmodem
            start_zmodem_send,
            // AI Agent
            get_context,
            execute_approved_command,
            // SFTP
            list_sftp_dir,
            download_sftp_file,
            upload_sftp_file,
            mkdir_sftp,
            delete_sftp,
            rename_sftp,
            // Health monitor
            start_health_monitor,
            get_server_health,
            // Recording
            start_recording,
            stop_recording,
            list_session_recordings,
            // Command history
            search_command_history,
            recent_command_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
