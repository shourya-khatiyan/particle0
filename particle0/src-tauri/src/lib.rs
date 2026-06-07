// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod errors;
mod settings;
mod state;
mod window_manager;
mod shortcut;
mod nim_client;
mod stream_parser;

use tauri::Manager;
use state::AppState;
use settings::AppSettings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(std::sync::Mutex::new(AppState::default()))
        .setup(|app| {
            // Load settings from disk (or use defaults on first run)
            let settings = AppSettings::load_or_default(app.handle()).unwrap_or_default();

            // Store settings in app state
            {
                let state = app.state::<std::sync::Mutex<AppState>>();
                let mut s = state.lock().unwrap();
                s.settings = settings.clone();
            }

            // Apply initial theme
            shortcut::register_hotkey(app.handle(), &settings.hotkey);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::submit_prompt,
            commands::cancel_prompt,
            commands::test_connection,
            commands::save_settings,
            commands::load_settings,
            commands::show_overlay,
            commands::hide_overlay,
            commands::toggle_overlay,
            commands::resize_overlay,
            commands::update_hotkey,
            commands::set_multi_turn,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
