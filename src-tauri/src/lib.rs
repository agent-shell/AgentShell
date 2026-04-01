mod commands;
mod profile;
mod pty;
mod session;
mod ssh;

use std::sync::Arc;

use commands::profile_commands::{
    connect_profile, delete_profile, list_profiles, save_profile,
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
            connect_ssh,
            connect_local_shell,
            disconnect_session,
            send_input,
            resize_pty,
            get_scrollback,
            get_scrollback_raw,
            list_profiles,
            save_profile,
            delete_profile,
            connect_profile,
            start_zmodem_send,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
