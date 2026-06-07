/**
 * Settings signals — app configuration state.
 */
import { createSignal } from "solid-js";
import type { AppSettings, BackendStatus, ThemePreference } from "../lib/api-types";
import { DEFAULT_SETTINGS } from "../lib/api-types";

/** Current app settings loaded from Rust. */
export const [appSettings, setAppSettings] = createSignal<AppSettings>(DEFAULT_SETTINGS);

/** Backend connection status. */
export const [backendStatus, setBackendStatus] = createSignal<BackendStatus>("checking");

/** Whether the hotkey registered successfully. */
export const [hotkeyRegistered, setHotkeyRegistered] = createSignal<boolean>(true);

/**
 * Applies the theme preference to the document root.
 * Handles "system" by reading prefers-color-scheme media query.
 */
export function applyThemeFromSettings(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", prefersDark ? "dark" : "light");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

/** Sets up a listener for system theme changes when mode is "system". */
export function setupSystemThemeListener(getTheme: () => ThemePreference): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    if (getTheme() === "system") applyThemeFromSettings("system");
  };
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
