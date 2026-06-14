mod commands;
mod errors;
mod nim_client;
mod settings;
mod shortcut;
mod state;
mod stream_parser;
mod window_manager;

use std::sync::Mutex;
use tauri::{Emitter, Manager};

use nim_client::NimClient;
use settings::AppSettings;
use state::{AppState, BackendStatus};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(Mutex::new(AppState::default()))
        .setup(|app| {
            // Load settings from disk (or use defaults on first run)
            let settings = AppSettings::load_or_default(app.handle());

            // Store settings in app state
            {
                let state = app.state::<Mutex<AppState>>();
                let mut s = state.lock().unwrap();
                s.settings = settings.clone();
                // Mark as checking if configured, otherwise not_configured
                s.backend_status = if settings.is_configured() {
                    BackendStatus::Checking
                } else {
                    BackendStatus::NotConfigured
                };
            }

            // Register global hotkey
            shortcut::register_hotkey(app.handle(), &settings.hotkey);

            // Spawn background NIM validation if settings are present
            if settings.is_configured() {
                let app_handle = app.handle().clone();
                let settings_clone = settings.clone();
                tauri::async_runtime::spawn(async move {
                    validate_nim_backend(&app_handle, &settings_clone).await;
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::submit_prompt,
            commands::cancel_prompt,
            commands::test_connection,
            commands::save_settings,
            commands::load_settings,
            commands::get_backend_status,
            commands::show_overlay,
            commands::hide_overlay,
            commands::toggle_overlay,
            commands::resize_overlay,
            commands::update_hotkey,
            commands::set_multi_turn,
            commands::clear_history,
            commands::get_turn_count,
            commands::toggle_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Validates the NIM backend on startup:
/// 1. Try GET /v1/health/ready (optional — some endpoints don't expose it)
/// 2. GET /v1/models to list available models
/// 3. Check the configured model exists in the list
/// Emits backend:ready or backend:unavailable with a reason.
async fn validate_nim_backend(app: &tauri::AppHandle, settings: &AppSettings) {
    let client = NimClient::new(settings);

    // Step 1: health check (best-effort — 404 is acceptable for hosted NIM)
    let health_ok = match client.check_health().await {
        Ok(ok) => ok,
        Err(nim_client::HealthCheckError::NotFound) => true, // endpoint absent — continue
        Err(_) => {
            update_backend_status(app, BackendStatus::Unreachable);
            emit_unavailable(app, "unreachable", "Cannot reach the NIM server.");
            return;
        }
    };

    if !health_ok {
        update_backend_status(app, BackendStatus::Unreachable);
        emit_unavailable(app, "unreachable", "NIM health check failed.");
        return;
    }

    // Step 2: list models
    let models = match client.list_models().await {
        Ok(m) => m,
        Err(e) => {
            use crate::errors::NimError;
            let reason = match &e {
                NimError::AuthError => "Authentication failed — check your API key.",
                NimError::NetworkError(_) => "Cannot reach the NIM server.",
                _ => "Failed to list models.",
            };
            emit_unavailable(app, "error", reason);
            update_backend_status(app, BackendStatus::Unreachable);
            return;
        }
    };

    // Step 3: check configured model exists
    let model_ids: Vec<String> = models.iter().map(|m| m.id.clone()).collect();
    if !settings.nim_model.is_empty() && !model_ids.contains(&settings.nim_model) {
        update_backend_status(app, BackendStatus::ModelMissing);
        emit_unavailable(
            app,
            "model_missing",
            &format!("Model '{}' not found. Open Settings to pick a valid model.", settings.nim_model),
        );
        return;
    }

    // All checks passed
    update_backend_status(app, BackendStatus::Ready);
    let _ = app.emit("backend:ready", serde_json::json!({ "models": model_ids }));
}

fn update_backend_status(app: &tauri::AppHandle, status: BackendStatus) {
    if let Some(state) = app.try_state::<Mutex<AppState>>() {
        if let Ok(mut s) = state.lock() {
            s.backend_status = status;
        }
    }
}

fn emit_unavailable(app: &tauri::AppHandle, reason_type: &str, reason: &str) {
    let _ = app.emit(
        "backend:unavailable",
        serde_json::json!({ "reason": reason, "reason_type": reason_type }),
    );
}
