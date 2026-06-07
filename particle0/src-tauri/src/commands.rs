//! All Tauri command handlers — Frontend → Rust bridge.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::nim_client::NimClient;
use crate::settings::AppSettings;
use crate::state::{AppState, ChatMessage};
use crate::window_manager;
use crate::shortcut;
use futures::StreamExt;

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

    // Check no active request
    {
        let s = state.lock().unwrap();
        if s.active_request_id.is_some() {
            return Err("A request is already in progress".into());
        }
    }

    let request_id = Uuid::new_v4().to_string();

    // Build messages array
    let messages: Vec<ChatMessage> = {
        let s = state.lock().unwrap();
        let mut msgs = if multi_turn && s.multi_turn_enabled {
            s.conversation_history.clone()
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

        let elapsed_ms = start.elapsed().as_millis() as u64;

        // Emit stream:end
        let _ = app_clone.emit(
            "stream:end",
            serde_json::json!({
                "request_id": rid,
                "full_text": accumulated,
                "elapsed_ms": elapsed_ms,
                "token_count": token_count,
            }),
        );

        // Update conversation history for multi-turn
        {
            let state = app_clone.state::<Mutex<AppState>>();
            let mut s = state.lock().unwrap();
            s.active_request_id = None;
            if s.multi_turn_enabled {
                s.conversation_history.push(ChatMessage {
                    role: "user".into(),
                    content: prompt.clone(),
                });
                s.conversation_history.push(ChatMessage {
                    role: "assistant".into(),
                    content: accumulated.clone(),
                });
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

/// Test NIM connection with provided credentials.
#[tauri::command]
pub async fn test_connection(
    base_url: String,
    api_key: String,
) -> Result<serde_json::Value, String> {
    let client = NimClient::for_test(&base_url, &api_key);

    let models = client.list_models().await.map_err(|e| e.to_string())?;
    let model_ids: Vec<String> = models.into_iter().map(|m| m.id).collect();

    Ok(serde_json::json!({
        "success": true,
        "models": model_ids,
        "error": null,
    }))
}

/// Save settings to disk.
#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    settings: AppSettings,
) -> Result<(), String> {
    settings.save(&app)?;

    let mut s = state.lock().unwrap();
    s.settings = settings.clone();

    let _ = app.emit("settings:updated", serde_json::json!({ "settings": settings }));
    Ok(())
}

/// Load settings from disk.
#[tauri::command]
pub fn load_settings(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<AppSettings, String> {
    let settings = AppSettings::load_or_default(&app)?;
    let mut s = state.lock().unwrap();
    s.settings = settings.clone();
    Ok(settings)
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
#[tauri::command]
pub fn set_multi_turn(state: State<'_, Mutex<AppState>>, enabled: bool) {
    let mut s = state.lock().unwrap();
    s.multi_turn_enabled = enabled;
    if !enabled {
        s.conversation_history.clear();
    }
}
