/**
 * ToolbarRow — integrated header inside the glass card.
 * Left: particle0 wordmark.
 * Right: settings gear.
 */
import { Component } from "solid-js";
import { setSettingsOpen } from "../signals/overlay";

const ToolbarRow: Component = () => {
  return (
    <div class="toolbar-row">
      {/* Left: wordmark */}
      <div class="flex items-center gap-2.5 min-w-0">
        <span class="text-[11px] font-semibold tracking-tight text-[var(--text-secondary)]">
          particle<span class="text-[var(--accent)]">0</span>
        </span>
      </div>

      <div class="flex-1" />

      {/* Right: settings */}
      <div class="flex items-center gap-1">
        <button
          onClick={() => setSettingsOpen(true)}
          class="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors duration-[var(--duration-fast)]"
          aria-label="Open settings"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ToolbarRow;
