/**
 * Overlay — main layout.
 * Single glass card containing: toolbar row, input, answer, footer.
 */
import { Component, Show, createEffect, createSignal, onMount, onCleanup } from "solid-js";
import ToolbarRow from "./ToolbarPill";
import PromptInput from "./PromptInput";
import StreamedAnswer from "./StreamedAnswer";
import ErrorView from "./ErrorView";
import StatusBar from "./StatusBar";
import SettingsPanel from "./SettingsPanel";
import WelcomeView from "./WelcomeView";
import {
  sessionState,
  streamedText,
  errorInfo,
  resetSession,
  promptText,
  setPromptText,
  setSessionState,
  setStreamedText,
  setErrorInfo,
  multiTurnEnabled,
  setMultiTurnEnabled,
} from "../signals/session";
import { settingsOpen, setSettingsOpen, setHeightState } from "../signals/overlay";
import { backendStatus, appSettings } from "../signals/settings";
import { submitPrompt, cancelPrompt, hideOverlay, clearHistory, resizeOverlay, setMultiTurn, seedHistory } from "../lib/tauri-commands";
import { copyToClipboard } from "../lib/format";
import { DEFAULT_KEYBINDINGS } from "../lib/api-types";

const STATUS_CONFIG: Record<string, { color: string; label: string; pulse?: boolean }> = {
  ready: { color: "bg-[var(--color-success)]", label: "Ready" },
  checking: { color: "bg-[var(--color-warning)]", label: "Checking", pulse: true },
  unreachable: { color: "bg-[var(--color-error)]", label: "Offline" },
  model_missing: { color: "bg-[var(--color-warning)]", label: "No model" },
  not_configured: { color: "bg-[var(--text-muted)]", label: "Setup needed" },
};

/**
 * Checks if a KeyboardEvent matches a binding string like "Ctrl+X" or "/".
 */
function matchesBinding(e: KeyboardEvent, binding: string): boolean {
  const parts = binding.split("+");
  const key = parts[parts.length - 1].toLowerCase();
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase());

  const needCtrl = mods.includes("ctrl");
  const needAlt = mods.includes("alt");
  const needShift = mods.includes("shift");
  const needMeta = mods.includes("super");

  if (needCtrl !== (e.ctrlKey || e.metaKey)) return false;
  if (needAlt !== e.altKey) return false;
  if (needShift !== e.shiftKey) return false;
  if (needMeta !== e.metaKey) return false;

  const eventKey = e.key === " " ? "space" : e.key.toLowerCase();
  return eventKey === key || e.code.toLowerCase() === `key${key}`;
}

const Overlay: Component = () => {
  let rootRef: HTMLDivElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let inputTextareaRef: HTMLTextAreaElement | undefined;

  const [showContextPrompt, setShowContextPrompt] = createSignal(false);

  /** Checks if there's a completed response that can be carried over. */
  const hasCarryoverContext = () =>
    sessionState() === "completed" && streamedText().length > 0 && promptText().length > 0;

  /** Handles mode toggle with optional context carry-over confirmation. */
  const handleModeToggle = () => {
    const next = !multiTurnEnabled();
    if (next && hasCarryoverContext()) {
      setShowContextPrompt(true);
      return;
    }
    setMultiTurnEnabled(next);
    setMultiTurn(next).catch(() => {});
  };

  /** User confirmed: seed history then enable memory. */
  const confirmCarryover = async () => {
    setShowContextPrompt(false);
    await seedHistory(promptText(), streamedText()).catch(() => {});
    setMultiTurnEnabled(true);
    await setMultiTurn(true).catch(() => {});
  };

  /** User declined: enable memory without seeding. */
  const declineCarryover = async () => {
    setShowContextPrompt(false);
    setMultiTurnEnabled(true);
    await setMultiTurn(true).catch(() => {});
  };

  createEffect(() => {
    const s = sessionState();
    if (s === "idle") setHeightState("collapsed");
    else if (s === "streaming" || s === "connecting" || s === "queued") setHeightState("streaming");
    else setHeightState("completed");
  });

  const handleGlobalKey = (e: KeyboardEvent) => {
    const kb = appSettings().keybindings ?? DEFAULT_KEYBINDINGS;

    if (matchesBinding(e, kb.clear)) {
      e.preventDefault();
      handleClear();
      return;
    }
    if (matchesBinding(e, kb.copy_answer)) {
      const selection = window.getSelection()?.toString();
      if (!selection && streamedText()) {
        e.preventDefault();
        copyToClipboard(streamedText());
      }
      return;
    }
    if (matchesBinding(e, kb.toggle_mode)) {
      e.preventDefault();
      handleModeToggle();
      return;
    }
    if (matchesBinding(e, kb.toggle_settings)) {
      e.preventDefault();
      setSettingsOpen(!settingsOpen());
      return;
    }
    if (matchesBinding(e, kb.focus_input)) {
      if (document.activeElement !== inputTextareaRef) {
        e.preventDefault();
        if (settingsOpen()) setSettingsOpen(false);
        setTimeout(() => inputTextareaRef?.focus(), 0);
      }
      return;
    }
  };

  onMount(() => {
    window.addEventListener("keydown", handleGlobalKey);

    if (rootRef) {
      resizeObserver = new ResizeObserver(() => {
        if (rootRef) {
          const h = Math.ceil(rootRef.getBoundingClientRect().height);
          resizeOverlay(h).catch(() => {});
        }
      });
      resizeObserver.observe(rootRef);
      const h = Math.ceil(rootRef.getBoundingClientRect().height);
      resizeOverlay(h).catch(() => {});
    }
  });

  onCleanup(() => {
    window.removeEventListener("keydown", handleGlobalKey);
    resizeObserver?.disconnect();
  });

  const handleSubmit = async (text: string) => {
    setSessionState("connecting");
    setStreamedText("");
    setErrorInfo(null);
    try {
      await submitPrompt(text, multiTurnEnabled());
    } catch (e) {
      setSessionState("failed");
      setErrorInfo({
        message: String(e),
        error_type: "unknown",
        retryable: true,
      });
    }
  };

  const handleCancel = async () => {
    try {
      await cancelPrompt();
    } catch (e) {
      console.error("cancel_prompt failed:", e);
    }
  };

  const handleDismiss = async () => {
    try {
      await hideOverlay();
    } catch (e) {
      console.error("hide_overlay failed:", e);
    }
  };

  const handleCopy = () => {
    const text = streamedText();
    if (text) copyToClipboard(text);
  };

  const handleClear = async () => {
    const wasActive = sessionState() === "connecting" || sessionState() === "streaming";
    if (wasActive) {
      try { await cancelPrompt(); } catch {}
    }
    resetSession();
    setPromptText("");
    if (multiTurnEnabled()) {
      try { await clearHistory(); } catch {}
    }
  };

  const showAnswer = () => {
    const s = sessionState();
    return s === "connecting" || s === "streaming" || s === "completed" || s === "failed" || s === "cancelled";
  };

  const showFooter = () => {
    const s = sessionState();
    return s === "connecting" || s === "completed" || s === "streaming" || s === "cancelled" || s === "failed";
  };

  const isIdle = () => sessionState() === "idle";
  const needsSetup = () => {
    const s = backendStatus();
    return s === "not_configured" || s === "unreachable" || s === "model_missing";
  };

  return (
    <div
      ref={rootRef}
      class="flex flex-col items-center w-full select-none p-2"
    >
      {/* Main glass card */}
      <div class="glass-card flex flex-col w-full relative">

        {/* ── Settings panel (replaces all content) ── */}
        <Show when={settingsOpen()}>
          <SettingsPanel onClose={() => setSettingsOpen(false)} />
        </Show>

        {/* ── Main overlay content ── */}
        <Show when={!settingsOpen()}>
          {/* Toolbar row — inside the card */}
          <ToolbarRow />

          {/* Welcome/status view for unconfigured states */}
          <Show when={needsSetup() && isIdle()}>
            <WelcomeView />
          </Show>

          {/* Prompt input + answer + footer (only when backend is usable or not idle) */}
          <Show when={!needsSetup() || !isIdle()}>
            <PromptInput
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              onDismiss={handleDismiss}
              textareaRef={(el) => { inputTextareaRef = el; }}
            />

            {/* Separator between input and answer */}
            <Show when={showAnswer()}>
              <div class="input-separator" />
              <Show
                when={sessionState() !== "failed"}
                fallback={
                  <ErrorView
                    error={
                      errorInfo() ?? {
                        message: "An unknown error occurred.",
                        error_type: "unknown",
                        retryable: true,
                      }
                    }
                    onRetry={() => {
                      const text = promptText();
                      if (text) handleSubmit(text);
                    }}
                  />
                }
              >
                <Show when={sessionState() === "connecting"}>
                  <div class="px-5 py-4 flex items-center gap-2.5">
                    <span class="flex gap-1">
                      <span class="w-1.5 h-1.5 bg-[var(--accent)] connecting-dot-1" />
                      <span class="w-1.5 h-1.5 bg-[var(--accent)] connecting-dot-2" />
                      <span class="w-1.5 h-1.5 bg-[var(--accent)] connecting-dot-3" />
                    </span>
                    <span class="text-xs text-[var(--text-muted)]">Connecting...</span>
                  </div>
                </Show>
                <Show when={sessionState() !== "connecting"}>
                  <StreamedAnswer />
                </Show>
              </Show>
            </Show>

            {/* Footer action row */}
            <Show when={showFooter()}>
              <div class="footer-row flex items-center gap-1.5 px-5 py-2.5 flex-shrink-0">
                <Show when={streamedText()}>
                  <button onClick={handleCopy} class="btn-ghost text-[11px] font-medium px-2.5 py-1.5">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    Copy
                  </button>
                </Show>

                <button onClick={handleClear} class="btn-ghost text-[11px] font-medium px-2.5 py-1.5">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear
                </button>

                <Show when={sessionState() === "streaming" || sessionState() === "connecting"}>
                  <button
                    onClick={handleCancel}
                    class="btn-ghost text-[11px] font-medium px-2.5 py-1.5 text-[var(--color-error)] hover:bg-[var(--color-error-bg)]"
                  >
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />
                    </svg>
                    Stop
                  </button>
                </Show>

                <div class="flex-1" />

                <StatusBar />
              </div>
            </Show>
          </Show>

          {/* Context carry-over confirmation */}
          <Show when={showContextPrompt()}>
            <div class="flex items-center justify-between gap-2 px-5 py-2 border-t border-[var(--border-subtle)] bg-[var(--accent-soft)] flex-shrink-0">
              <span class="text-[11px] text-[var(--text-secondary)]">
                Keep current response as context?
              </span>
              <div class="flex items-center gap-1.5">
                <button
                  onClick={confirmCarryover}
                  class="text-[10px] font-medium px-2 py-1 text-[var(--accent)] hover:bg-[var(--surface-hover)] transition-colors duration-[var(--duration-fast)]"
                >
                  Yes
                </button>
                <button
                  onClick={declineCarryover}
                  class="text-[10px] font-medium px-2 py-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors duration-[var(--duration-fast)]"
                >
                  No
                </button>
              </div>
            </div>
          </Show>

          {/* Always-visible bottom bar: status left, mode toggle right */}
          <div class="flex items-center justify-between px-5 py-2 border-t border-[var(--border-subtle)] flex-shrink-0">
            <div class="flex items-center gap-1.5">
              <span
                class={`relative w-[6px] h-[6px] flex-shrink-0 ${(STATUS_CONFIG[backendStatus()] ?? STATUS_CONFIG.not_configured).color} ${(STATUS_CONFIG[backendStatus()] ?? STATUS_CONFIG.not_configured).pulse ? "status-dot-checking" : ""}`}
              />
              <span class="text-[10px] text-[var(--text-muted)] tabular-nums">
                {(STATUS_CONFIG[backendStatus()] ?? STATUS_CONFIG.not_configured).label}
              </span>
            </div>
            <button
              onClick={handleModeToggle}
              class={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-all duration-[var(--duration-fast)] ${
                multiTurnEnabled()
                  ? "text-[var(--accent)] bg-[var(--accent-soft)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              }`}
              aria-label={multiTurnEnabled() ? "Multi-turn memory ON" : "Single-turn mode"}
              title={multiTurnEnabled() ? "Memory ON — click to disable" : "Single-turn — click for memory"}
            >
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <Show when={multiTurnEnabled()} fallback={
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                }>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </Show>
              </svg>
              {multiTurnEnabled() ? "Memory" : "Single"}
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default Overlay;
