//! All Tauri command handlers — Frontend → Rust bridge.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::nim_client::NimClient;
use crate::settings::AppSettings;
use crate::state::{AppState, BackendStatus, ChatMessage};
use crate::window_manager;
use crate::shortcut;
use futures::StreamExt;
use serde::Serialize;

/// Maximum number of messages kept in conversation history (user+assistant pairs = MAX/2 turns).
const MAX_HISTORY_MESSAGES: usize = 40;

/// Submit a prompt for inference. Returns the request_id.
#[tauri::command]
pub async fn submit_prompt(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    prompt: String,
    multi_turn: bool,
) -> Result<String, String> {
    // Validate prompt
    let prompt = prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("Prompt cannot be empty".into());
    }

    // Check no active request; also check backend is configured
    {
        let s = state.lock().unwrap();
        if s.active_request_id.is_some() {
            return Err("A request is already in progress".into());
        }
        if !s.settings.is_configured() {
            return Err("NIM is not configured. Open Settings to add your API key and model.".into());
        }
    }

    let request_id = Uuid::new_v4().to_string();

    // Build messages array, respecting history size limit
    let messages: Vec<ChatMessage> = {
        let s = state.lock().unwrap();
        let mut msgs = if multi_turn && s.multi_turn_enabled {
            // Keep only the most recent MAX_HISTORY_MESSAGES-1 messages before appending
            let history = &s.conversation_history;
            let start = history.len().saturating_sub(MAX_HISTORY_MESSAGES - 1);
            history[start..].to_vec()
        } else {
            Vec::new()
        };
        msgs.push(ChatMessage {
            role: "user".into(),
            content: prompt.clone(),
        });
        msgs
    };

    // Get settings and set active request
    let (settings, temperature, max_tokens) = {
        let mut s = state.lock().unwrap();
        s.active_request_id = Some(request_id.clone());
        s.cancel_requested = false;
        (
            s.settings.clone(),
            s.settings.temperature,
            s.settings.max_tokens,
        )
    };

    // Emit stream:start
    let _ = app.emit("stream:start", serde_json::json!({ "request_id": request_id }));

    let client = NimClient::new(&settings);
    let rid = request_id.clone();
    let app_clone = app.clone();

    // Spawn streaming task
    tokio::spawn(async move {
        let stream_result = client
            .chat_completion_stream(messages.clone(), temperature, max_tokens)
            .await;

        let mut stream = match stream_result {
            Ok(s) => s,
            Err(e) => {
                let uf = crate::errors::UserFacingError::from(&e);
                let _ = app_clone.emit(
                    "stream:error",
                    serde_json::json!({
                        "request_id": rid,
                        "error": uf.message,
                        "error_type": uf.error_type,
                    }),
                );
                let state = app_clone.state::<Mutex<AppState>>();
                let mut s = state.lock().unwrap();
                s.active_request_id = None;
                return;
            }
        };

        let mut accumulated = String::new();
        let start = std::time::Instant::now();
        let mut token_count: u32 = 0;

        // Token batch buffer — flush every ~16ms
        let mut batch_buf = String::new();
        let mut last_flush = std::time::Instant::now();

        while let Some(chunk_result) = stream.next().await {
            // Check cancellation flag
            {
                let state = app_clone.state::<Mutex<AppState>>();
                let s = state.lock().unwrap();
                if s.cancel_requested {
                    break;
                }
            }

            match chunk_result {
                Ok(chunk) => {
                    if !chunk.token.is_empty() {
                        accumulated.push_str(&chunk.token);
                        batch_buf.push_str(&chunk.token);
                        token_count += 1;
                    }

                    // Flush batch if 16ms elapsed or buffer is big enough
                    if last_flush.elapsed().as_millis() >= 16 || batch_buf.len() >= 64 {
                        if !batch_buf.is_empty() {
                            let _ = app_clone.emit(
                                "stream:chunk",
                                serde_json::json!({
                                    "request_id": rid,
                                    "token": batch_buf,
                                    "accumulated": accumulated,
                                }),
                            );
                            batch_buf.clear();
                            last_flush = std::time::Instant::now();
                        }
                    }

                    // Stream done
                    if chunk.finish_reason.is_some() {
                        break;
                    }
                }
                Err(e) => {
                    let uf = crate::errors::UserFacingError::from(&e);
                    let _ = app_clone.emit(
                        "stream:error",
                        serde_json::json!({
                            "request_id": rid,
                            "error": uf.message,
                            "error_type": uf.error_type,
                        }),
                    );
                    let state = app_clone.state::<Mutex<AppState>>();
                    let mut s = state.lock().unwrap();
                    s.active_request_id = None;
                    return;
                }
            }
        }

        let elapsed_ms = start.elapsed().as_millis() as u64;

        // Determine if the user cancelled
        let was_cancelled = {
            let state = app_clone.state::<Mutex<AppState>>();
            let s = state.lock().unwrap();
            s.cancel_requested
        };

        if was_cancelled {
            // Flush remaining buffer before signalling cancellation
            if !batch_buf.is_empty() {
                let _ = app_clone.emit(
                    "stream:chunk",
                    serde_json::json!({
                        "request_id": rid,
                        "token": batch_buf,
                        "accumulated": accumulated,
                    }),
                );
            }
            let _ = app_clone.emit(
                "stream:cancelled",
                serde_json::json!({
                    "request_id": rid,
                    "partial_text": accumulated,
                }),
            );
        } else {
            // Final flush of remaining buffer
            if !batch_buf.is_empty() {
                let _ = app_clone.emit(
                    "stream:chunk",
                    serde_json::json!({
                        "request_id": rid,
                        "token": batch_buf,
                        "accumulated": accumulated,
                    }),
                );
            }
            let _ = app_clone.emit(
                "stream:end",
                serde_json::json!({
                    "request_id": rid,
                    "full_text": accumulated,
                    "elapsed_ms": elapsed_ms,
                    "token_count": token_count,
                }),
            );
        }

        // Update conversation history for multi-turn (only on clean completion)
        {
            let state = app_clone.state::<Mutex<AppState>>();
            let mut s = state.lock().unwrap();
            s.active_request_id = None;
            s.cancel_requested = false;
            if !was_cancelled && s.multi_turn_enabled {
                s.conversation_history.push(ChatMessage {
                    role: "user".into(),
                    content: prompt.clone(),
                });
                s.conversation_history.push(ChatMessage {
                    role: "assistant".into(),
                    content: accumulated.clone(),
                });
                // Prune history to stay within the limit
                if s.conversation_history.len() > MAX_HISTORY_MESSAGES {
                    let drain_count = s.conversation_history.len() - MAX_HISTORY_MESSAGES;
                    s.conversation_history.drain(..drain_count);
                }
            }
        }
    });

    Ok(request_id)
}

/// Abort the currently active stream.
#[tauri::command]
pub fn cancel_prompt(state: State<'_, Mutex<AppState>>) {
    let mut s = state.lock().unwrap();
    s.cancel_requested = true;
}

/// Typed response for test_connection.
#[derive(Serialize)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub models: Vec<String>,
    pub error: Option<String>,
}

/// Tests NIM connection with the provided credentials.
/// Returns available model IDs on success.
#[tauri::command]
pub async fn test_connection(
    base_url: String,
    api_key: String,
) -> Result<ConnectionTestResult, String> {
    let client = NimClient::for_test(&base_url, &api_key);

    match client.list_models().await {
        Ok(models) => Ok(ConnectionTestResult {
            success: true,
            models: models.into_iter().map(|m| m.id).collect(),
            error: None,
        }),
        Err(e) => Ok(ConnectionTestResult {
            success: false,
            models: vec![],
            error: Some(e.to_string()),
        }),
    }
}

/// Returns the current backend status string for the frontend status bar.
#[tauri::command]
pub fn get_backend_status(state: State<'_, Mutex<AppState>>) -> String {
    let s = state.lock().unwrap();
    match s.backend_status {
        BackendStatus::Ready => "ready".into(),
        BackendStatus::Unreachable => "unreachable".into(),
        BackendStatus::ModelMissing => "model_missing".into(),
        BackendStatus::NotConfigured => "not_configured".into(),
        BackendStatus::Checking => "checking".into(),
    }
}

/// Saves settings to disk and re-triggers NIM backend validation.
#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    settings: AppSettings,
) -> Result<(), String> {
    settings.save(&app)?;

    {
        let mut s = state.lock().unwrap();
        s.settings = settings.clone();
        s.backend_status = if settings.is_configured() {
            BackendStatus::Checking
        } else {
            BackendStatus::NotConfigured
        };
    }

    let _ = app.emit("settings:updated", serde_json::json!({ "settings": settings }));

    // Re-run NIM validation in background if configured
    if settings.is_configured() {
        let app_clone = app.clone();
        let s = settings.clone();
        tauri::async_runtime::spawn(async move {
            crate::validate_nim_backend(&app_clone, &s).await;
        });
    }

    Ok(())
}

/// Loads settings from disk and returns them.
#[tauri::command]
pub fn load_settings(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> AppSettings {
    let settings = AppSettings::load_or_default(&app);
    {
        let mut s = state.lock().unwrap();
        s.settings = settings.clone();
    }
    settings
}

/// Show the overlay window.
#[tauri::command]
pub fn show_overlay(app: AppHandle) {
    window_manager::show_overlay(&app);
}

/// Hide the overlay window.
#[tauri::command]
pub fn hide_overlay(app: AppHandle) {
    window_manager::hide_overlay(&app);
}

/// Toggle overlay visibility.
#[tauri::command]
pub fn toggle_overlay(app: AppHandle) {
    window_manager::toggle_overlay(&app);
}

/// Resize overlay to a new logical pixel height.
#[tauri::command]
pub fn resize_overlay(app: AppHandle, height: f64) {
    window_manager::resize_overlay(&app, height);
}

/// Change the global hotkey at runtime.
#[tauri::command]
pub fn update_hotkey(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    shortcut: String,
) -> Result<(), String> {
    let old_hotkey = {
        let s = state.lock().unwrap();
        s.settings.hotkey.clone()
    };

    shortcut::update_hotkey(&app, &old_hotkey, &shortcut)?;

    let mut s = state.lock().unwrap();
    s.settings.hotkey = shortcut;
    s.hotkey_registered = true;
    Ok(())
}

/// Enable or disable multi-turn conversation memory.
/// Disabling clears history automatically.
#[tauri::command]
pub fn set_multi_turn(state: State<'_, Mutex<AppState>>, enabled: bool) {
    let mut s = state.lock().unwrap();
    s.multi_turn_enabled = enabled;
    if !enabled {
        s.conversation_history.clear();
    }
}

/// Clears the conversation history without disabling multi-turn mode.
/// Called when the user presses Clear while multi-turn is ON.
#[tauri::command]
pub fn clear_history(app: AppHandle, state: State<'_, Mutex<AppState>>) {
    let mut s = state.lock().unwrap();
    s.conversation_history.clear();
    let _ = app.emit("session:history_cleared", serde_json::json!({}));
}

/// Returns the number of completed turns in the current conversation history.
/// A turn = one user + one assistant message pair.
#[tauri::command]
pub fn get_turn_count(state: State<'_, Mutex<AppState>>) -> usize {
    let s = state.lock().unwrap();
    s.conversation_history.len() / 2
}

/// Enables or disables Windows autostart via HKCU Run registry key.
/// No-op on non-Windows platforms.
#[tauri::command]
pub fn toggle_autostart(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let run_key = hkcu
            .open_subkey_with_flags(
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                KEY_WRITE,
            )
            .map_err(|e| format!("Cannot open Run registry key: {e}"))?;

        if enabled {
            let exe = std::env::current_exe()
                .map_err(|e| format!("Cannot find exe path: {e}"))?
                .to_string_lossy()
                .to_string();
            run_key
                .set_value("particle0", &exe)
                .map_err(|e| format!("Cannot write registry value: {e}"))?;
        } else {
            // Ignore errors on delete (key may not exist)
            let _ = run_key.delete_value("particle0");
        }
    }

    #[cfg(not(windows))]
    let _ = enabled;

    Ok(())
}
