/**
 * Overlay — root floating card component.
 * All UI regions: header, input, answer, footer, status bar.
 * Keyboard: Enter=submit, Escape=cancel/dismiss, Ctrl+L=clear.
 */
import { Component, Show, createEffect, onMount, onCleanup } from "solid-js";
import PromptInput from "./PromptInput";
import StreamedAnswer from "./StreamedAnswer";
import ErrorView from "./ErrorView";
import StatusBar from "./StatusBar";
import SettingsPanel from "./SettingsPanel";
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
  turnCount,
  setTurnCount,
} from "../signals/session";
import { settingsOpen, setSettingsOpen, setHeightState } from "../signals/overlay";
import { submitPrompt, cancelPrompt, hideOverlay, setMultiTurn, clearHistory } from "../lib/tauri-commands";
import { copyToClipboard } from "../lib/format";

const Overlay: Component = () => {
  // Sync overlay height state signal with session state
  createEffect(() => {
    const s = sessionState();
    if (s === "idle") setHeightState("collapsed");
    else if (s === "streaming" || s === "connecting" || s === "queued") setHeightState("streaming");
    else setHeightState("completed");
  });

  // Global keyboard shortcuts
  const handleGlobalKey = (e: KeyboardEvent) => {
    // Ctrl+L — clear session
    if ((e.ctrlKey || e.metaKey) && e.key === "l") {
      e.preventDefault();
      handleClear();
    }
    // Ctrl+C when no text selected and answer visible — copy answer
    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      const selection = window.getSelection()?.toString();
      if (!selection && streamedText()) {
        e.preventDefault();
        copyToClipboard(streamedText());
      }
    }
  };

  onMount(() => window.addEventListener("keydown", handleGlobalKey));
  onCleanup(() => window.removeEventListener("keydown", handleGlobalKey));

  const handleSubmit = async (text: string) => {
    // Immediately transition to connecting so the UI responds before Rust replies
    setSessionState("connecting");
    setStreamedText("");
    setErrorInfo(null);
    try {
      await submitPrompt(text, multiTurnEnabled());
    } catch (e) {
      // Tauri invoke itself failed (not a NIM error) — show as failed
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
    resetSession();
    setPromptText("");
    // Also clear Rust-side history when multi-turn is active
    if (multiTurnEnabled()) {
      try { await clearHistory(); } catch {}
    }
  };

  const toggleMultiTurn = async () => {
    const next = !multiTurnEnabled();
    setMultiTurnEnabled(next);
    try {
      await setMultiTurn(next);
      // Turning off clears Rust-side history; sync the turn counter
      if (!next) setTurnCount(0);
    } catch {}
  };

  const showAnswer = () => {
    const s = sessionState();
    return s === "connecting" || s === "streaming" || s === "completed" || s === "failed" || s === "cancelled";
  };

  const showFooter = () => {
    const s = sessionState();
    return s === "completed" || s === "streaming" || s === "cancelled" || s === "failed";
  };

  return (
    <div
      class="flex flex-col w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-overlay)] overflow-hidden select-none"
      style={{ "box-shadow": "0 8px 32px rgba(0,0,0,0.7)" }}
    >
      {/* ── Header strip ─────────────────────────────────────── */}
      <div class="flex items-center gap-2 px-4 pt-3 pb-2 flex-shrink-0">
        <div class="flex items-center gap-1.5">
          {/* Particle triangle icon */}
          <div class="w-4 h-4 rounded-[3px] bg-[var(--color-text-muted)] flex items-center justify-center flex-shrink-0">
            <svg class="w-2.5 h-2.5 text-[var(--color-surface)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3L3 20h18L12 3z" />
            </svg>
          </div>
          <span class="text-[10px] font-bold text-[var(--color-text-muted)] tracking-[0.15em] uppercase" style={{ "font-family": "var(--font-mono)" }}>
            particle0
          </span>
        </div>

        <div class="flex-1" />

        {/* Multi-turn toggle */}
        <button
          onClick={toggleMultiTurn}
          title={multiTurnEnabled() ? "Multi-turn ON — click to disable" : "Single-turn — click to enable multi-turn"}
          class={`
            flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider
            transition-all duration-[var(--duration-fast)]
            ${multiTurnEnabled()
              ? "text-[var(--color-text-primary)] bg-[var(--color-surface-hover)] border border-[var(--color-border)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }
          `}
          aria-label="Toggle multi-turn conversation"
        >
          <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {multiTurnEnabled() ? "memory on" : "memory"}
        </button>

        {/* Settings button */}
        <button
          onClick={() => setSettingsOpen(!settingsOpen())}
          class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors p-1 rounded-md hover:bg-[var(--color-surface-elevated)]"
          aria-label="Open settings"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* ── Settings panel ────────────────────────────────────── */}
      <Show when={settingsOpen()}>
        <div class="h-px bg-[var(--color-border-subtle)] mx-4" />
        <SettingsPanel />
      </Show>

      {/* ── Main overlay content ──────────────────────────────── */}
      <Show when={!settingsOpen()}>
        <div class="h-px bg-[var(--color-border-subtle)] mx-4 flex-shrink-0" />

        {/* Prompt input */}
        <PromptInput
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onDismiss={handleDismiss}
        />

        {/* Answer / error region */}
        <Show when={showAnswer()}>
          <div class="h-px bg-[var(--color-border-subtle)] mx-4 flex-shrink-0" />

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
            {/* Connecting placeholder — shown while HTTP call is in flight before first token */}
            <Show when={sessionState() === "connecting"}>
              <div class="px-4 py-3 flex items-center gap-2">
                <span class="flex gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" style={{ "animation-delay": "0ms" }} />
                  <span class="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" style={{ "animation-delay": "150ms" }} />
                  <span class="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" style={{ "animation-delay": "300ms" }} />
                </span>
                <span class="text-xs text-[var(--color-text-muted)]">Connecting…</span>
              </div>
            </Show>
            <Show when={sessionState() !== "connecting"}>
              <StreamedAnswer />
            </Show>
          </Show>
        </Show>

        {/* ── Footer action row ─────────────────────────────── */}
        <Show when={showFooter()}>
          <div class="h-px bg-[var(--color-border-subtle)] mx-4 flex-shrink-0" />
          <div class="flex items-center gap-0.5 px-3 py-1.5 flex-shrink-0">

            {/* Copy */}
            <FooterBtn onClick={handleCopy} label="Copy" />

            {/* Clear */}
            <FooterBtn onClick={handleClear} label="Clear" />

            {/* Stop — only while streaming */}
            <Show when={sessionState() === "streaming"}>
              <FooterBtn
                onClick={handleCancel}
                label="Stop"
                danger
              />
            </Show>

            <div class="flex-1" />

            {/* Multi-turn status indicator: shows turn count when history exists */}
            <Show when={multiTurnEnabled()}>
              <span class="text-[9px] text-[var(--color-accent)] font-medium mr-2 opacity-70">
                {turnCount() > 0 ? `turn ${turnCount()}` : "multi-turn"}
              </span>
            </Show>

            {/* Dismiss */}
            <FooterBtn onClick={handleDismiss} label="Close" />
          </div>
        </Show>

        {/* ── Status bar ───────────────────────────────────────── */}
        <StatusBar />
      </Show>
    </div>
  );
};

/** Reusable small footer button. */
const FooterBtn: Component<{
  onClick: () => void;
  label: string;
  danger?: boolean;
}> = (props) => (
  <button
    onClick={props.onClick}
    class={`
      text-[10px] font-medium px-2 py-1 rounded transition-colors duration-[var(--duration-fast)]
      ${props.danger
        ? "text-[var(--color-error)] hover:bg-[var(--color-error-bg)]"
        : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
      }
    `}
  >
    {props.label}
  </button>
);

export default Overlay;
