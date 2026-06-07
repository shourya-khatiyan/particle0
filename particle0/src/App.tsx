/**
 * App — root component. Sets up event listeners and renders the overlay.
 */
import { Component, onMount, onCleanup } from "solid-js";
import Overlay from "./components/Overlay";
import { setupEventListeners } from "./lib/tauri-events";
import { applyThemeFromSettings, setupSystemThemeListener, appSettings } from "./signals/settings";
import "./styles/globals.css";
import "./styles/overlay.css";

const App: Component = () => {
  let cleanupEvents: (() => void) | undefined;
  let cleanupTheme: (() => void) | undefined;

  onMount(async () => {
    // Apply initial theme
    applyThemeFromSettings(appSettings().theme);

    // Watch system theme changes
    cleanupTheme = setupSystemThemeListener(() => appSettings().theme);

    // Register all Rust event listeners
    cleanupEvents = await setupEventListeners();
  });

  onCleanup(() => {
    cleanupEvents?.();
    cleanupTheme?.();
  });

  return (
    <div
      class="w-full h-full flex items-start justify-center"
      style={{ padding: "0" }}
    >
      <Overlay />
    </div>
  );
};

export default App;
