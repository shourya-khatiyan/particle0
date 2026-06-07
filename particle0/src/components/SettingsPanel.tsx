/**
 * SettingsPanel — placeholder for Phase 6.
 * Rendered when settingsOpen signal is true.
 */
import { Component } from "solid-js";
import { setSettingsOpen } from "../signals/overlay";

const SettingsPanel: Component = () => {
  return (
    <div class="flex flex-col p-4 gap-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-[--color-text-primary]">Settings</h2>
        <button
          onClick={() => setSettingsOpen(false)}
          class="text-[--color-text-muted] hover:text-[--color-text-primary] transition-colors"
          aria-label="Close settings"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p class="text-xs text-[--color-text-muted]">
        Settings panel — implemented in Phase 6.
      </p>
    </div>
  );
};

export default SettingsPanel;
