//! Window manager — show, hide, focus, and resize the overlay window.

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

const OVERLAY_LABEL: &str = "main";

/// Returns the overlay window handle.
fn get_overlay(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(OVERLAY_LABEL)
}

/// Shows the overlay on the monitor where the mouse cursor currently is.
pub fn show_overlay(app: &AppHandle) {
    let Some(window) = get_overlay(app) else { return };

    // Try to position on the active monitor
    if let Ok(Some(monitor)) = get_cursor_monitor(app) {
        let pos = monitor.position();
        let size = monitor.size();
        let win_size = window.outer_size().unwrap_or(PhysicalSize::new(780, 120));

        // Center horizontally, place at ~18% from top of that monitor
        let x = pos.x + ((size.width as i32 - win_size.width as i32) / 2);
        let y = pos.y + (size.height as f64 * 0.18) as i32;

        let _ = window.set_position(PhysicalPosition::new(x, y));
    } else {
        // Fallback: center on primary monitor
        let _ = window.center();
    }

    let _ = window.show();
    let _ = window.set_focus();
    let _ = app.emit("overlay:show", serde_json::json!({}));
}

/// Hides the overlay window.
pub fn hide_overlay(app: &AppHandle) {
    let Some(window) = get_overlay(app) else { return };
    let _ = window.hide();
    let _ = app.emit("overlay:hide", serde_json::json!({}));
}

/// Toggles overlay: show if hidden, focus if unfocused, hide if focused.
pub fn toggle_overlay(app: &AppHandle) {
    let Some(window) = get_overlay(app) else { return };
    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);

    if !visible {
        show_overlay(app);
    } else if focused {
        hide_overlay(app);
    } else {
        let _ = window.set_focus();
    }
}

/// Resizes the overlay window height to `height` CSS pixels.
/// `dpr` is the webview's actual devicePixelRatio — used instead of
/// `window.scale_factor()` because WebView2 on Windows can report a
/// different DPI than the OS window scale.
pub fn resize_overlay(app: &AppHandle, height: f64, dpr: f64) {
    let Some(window) = get_overlay(app) else { return };
    let clamped = height.clamp(60.0, 900.0);
    let safe_dpr = if dpr > 0.0 { dpr } else { 1.0 };
    let physical_height = (clamped * safe_dpr).ceil() as u32;
    let current_size = window.inner_size().unwrap_or(PhysicalSize::new(780, 120));
    let _ = window.set_size(PhysicalSize::new(current_size.width, physical_height));
}

/// Finds the monitor that currently contains the mouse cursor.
fn get_cursor_monitor(app: &AppHandle) -> tauri::Result<Option<tauri::Monitor>> {
    let cursor_pos = app.cursor_position()?;
    let monitors = app.available_monitors()?;

    let found = monitors.into_iter().find(|m| {
        let pos = m.position();
        let size = m.size();
        let x = cursor_pos.x as i32;
        let y = cursor_pos.y as i32;
        x >= pos.x
            && x < pos.x + size.width as i32
            && y >= pos.y
            && y < pos.y + size.height as i32
    });

    Ok(found)
}
