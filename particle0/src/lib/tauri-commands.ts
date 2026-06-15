/**
 * Typed wrappers for all Frontend → Rust Tauri commands.
 * Import these instead of calling invoke() directly.
 */
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, ConnectionTestResult } from "./api-types";

/** Submit a prompt for inference. Returns the request_id. */
export function submitPrompt(prompt: string, multiTurn: boolean): Promise<string> {
  return invoke("submit_prompt", { prompt, multiTurn });
}

/** Abort the currently active stream. */
export function cancelPrompt(): Promise<void> {
  return invoke("cancel_prompt");
}

/** Test NIM connection with provided credentials. */
export function testConnection(
  baseUrl: string,
  apiKey: string
): Promise<ConnectionTestResult> {
  return invoke("test_connection", { baseUrl, apiKey });
}

/** Save settings to disk. */
export function saveSettings(settings: AppSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

/** Load settings from disk. */
export function loadSettings(): Promise<AppSettings> {
  return invoke("load_settings");
}

/** Show the overlay window. */
export function showOverlay(): Promise<void> {
  return invoke("show_overlay");
}

/** Hide the overlay window. */
export function hideOverlay(): Promise<void> {
  return invoke("hide_overlay");
}

/** Toggle overlay visibility. */
export function toggleOverlay(): Promise<void> {
  return invoke("toggle_overlay");
}

/** Resize overlay window to a new CSS-pixel height.
 *  Passes devicePixelRatio so Rust uses the webview's actual DPI
 *  (can differ from the OS-reported window scale on Windows). */
export function resizeOverlay(height: number): Promise<void> {
  return invoke("resize_overlay", { height, dpr: window.devicePixelRatio });
}

/** Change the global hotkey at runtime. */
export function updateHotkey(shortcut: string): Promise<void> {
  return invoke("update_hotkey", { shortcut });
}

/** Enable or disable multi-turn conversation memory. */
export function setMultiTurn(enabled: boolean): Promise<void> {
  return invoke("set_multi_turn", { enabled });
}

/** Seed conversation history with an existing prompt+response pair. */
export function seedHistory(prompt: string, response: string): Promise<void> {
  return invoke("seed_history", { prompt, response });
}

/** Clear conversation history without disabling multi-turn mode. */
export function clearHistory(): Promise<void> {
  return invoke("clear_history");
}

/** Returns the number of completed turns in the current conversation. */
export function getTurnCount(): Promise<number> {
  return invoke("get_turn_count");
}

/** Enables or disables Windows autostart via registry. */
export function toggleAutostart(enabled: boolean): Promise<void> {
  return invoke("toggle_autostart", { enabled });
}
