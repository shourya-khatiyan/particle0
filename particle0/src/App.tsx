/**
 * App — root component.
 * Sets up event listeners, theme, and ResizeObserver for dynamic window resizing.
 */
import { Component, onMount, onCleanup } from "solid-js";
import Overlay from "./components/Overlay";
import { setupEventListeners } from "./lib/tauri-events";
import { resizeOverlay } from "./lib/tauri-commands";
import { invoke } from "@tauri-apps/api/core";
import { applyThemeFromSettings, setupSystemThemeListener, appSettings, setBackendStatus, setAppSettings } from "./signals/settings";
import type { AppSettings, BackendStatus } from "./lib/api-types";
import "./styles/globals.css";
import "./styles/overlay.css";

const App: Component = () => {
  let overlayRef: HTMLDivElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let cleanupEvents: (() => void) | undefined;
  let cleanupTheme: (() => void) | undefined;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;

  /** Debounced resize: measures overlay height and tells Rust to match it. */
  const syncWindowHeight = (height: number) => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // Add 2px safety margin to avoid content clipping
      resizeOverlay(Math.ceil(height) + 2).catch(() => {});
    }, 40);
  };

  onMount(async () => {
    // Apply initial theme
    applyThemeFromSettings(appSettings().theme);

    // Watch system theme changes when set to "system"
    cleanupTheme = setupSystemThemeListener(() => appSettings().theme);

    // Register all Rust → Frontend event listeners
    cleanupEvents = await setupEventListeners();

    // Sync initial backend status from Rust (covers the window-open race before events fire)
    try {
      const status = await invoke<BackendStatus>("get_backend_status");
      setBackendStatus(status);
    } catch {}

    // Load settings from Rust, hydrate the signal, and apply theme
    try {
      const settings = await invoke<AppSettings>("load_settings");
      setAppSettings(settings);
      applyThemeFromSettings(settings.theme);
    } catch {}

    // ResizeObserver: watch overlay card height and resize Tauri window to match
    if (overlayRef) {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          syncWindowHeight(entry.contentRect.height);
        }
      });
      resizeObserver.observe(overlayRef);
    }
  });

  onCleanup(() => {
    cleanupEvents?.();
    cleanupTheme?.();
    resizeObserver?.disconnect();
    clearTimeout(resizeTimer);
  });

  return (
    <div class="w-full h-full flex items-start justify-center p-0">
      {/* ref captures the overlay card for ResizeObserver */}
      <div ref={overlayRef} class="w-full">
        <Overlay />
      </div>
    </div>
  );
};

export default App;
