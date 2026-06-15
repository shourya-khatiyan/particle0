//! Global hotkey registration and management.

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use crate::state::AppState;
use crate::window_manager;

/// Registers the global hotkey that toggles the overlay.
/// Updates hotkey_registered in app state on success/failure.
pub fn register_hotkey(app: &AppHandle, shortcut: &str) {
    let app_clone = app.clone();
    let shortcut_str = shortcut.to_string();

    let result = app.global_shortcut().on_shortcut(
        shortcut,
        move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                window_manager::toggle_overlay(&app_clone);
            }
        },
    );

    // Record registration success in app state and notify the frontend
    let registered = result.is_ok();
    {
        let state = app.state::<std::sync::Mutex<AppState>>();
        let mut s = state.lock().unwrap();
        s.hotkey_registered = registered;
    }
    if !registered {
        log::warn!("Failed to register hotkey '{}'", shortcut_str);
        let _ = app.emit(
            "hotkey:error",
            serde_json::json!({
                "shortcut": shortcut_str,
                "reason": "Shortcut is already in use by another application. Choose a different hotkey in Settings.",
            }),
        );
    }
}

/// Unregisters the current hotkey and registers a new one.
pub fn update_hotkey(app: &AppHandle, old_shortcut: &str, new_shortcut: &str) -> Result<(), String> {
    // Unregister old
    let _ = app.global_shortcut().unregister(old_shortcut);

    // Register new
    let app_clone = app.clone();
    app.global_shortcut()
        .on_shortcut(new_shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                window_manager::toggle_overlay(&app_clone);
            }
        })
        .map_err(|e| format!("Failed to register shortcut '{}': {e}", new_shortcut))?;

    Ok(())
}
