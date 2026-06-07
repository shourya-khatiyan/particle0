/**
 * Overlay — the root floating card component.
 * Renders the full overlay UI: header, input, answer region, footer.
 */
import { Component, Show } from "solid-js";
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
} from "../signals/session";
import { settingsOpen, setSettingsOpen } from "../signals/overlay";
import { submitPrompt, cancelPrompt, hideOverlay } from "../lib/tauri-commands";
import { copyToClipboard } from "../lib/format";

const Overlay: Component = () => {
  const handleSubmit = async (text: string) => {
    try {
      await submitPrompt(text, false);
    } catch (e) {
      console.error("submit_prompt failed:", e);
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

  const handleClear = () => {
    resetSession();
  };

  const showAnswer = () =>
    sessionState() === "streaming" ||
    sessionState() === "completed" ||
    sessionState() === "failed" ||
    sessionState() === "cancelled";

  const showFooter = () =>
    sessionState() === "completed" ||
    sessionState() === "streaming" ||
    sessionState() === "cancelled";

  return (
    <div
      class="
        flex flex-col w-full
        bg-[--color-surface]
        rounded-[--radius-overlay]
        shadow-[--shadow-overlay]
        border border-[--color-border-subtle]
        overflow-hidden
        select-none
      "
      style={{ "min-height": "60px" }}
    >
      {/* Header strip */}
      <div class="flex items-center gap-2 px-4 pt-3 pb-2 flex-shrink-0">
        {/* App icon / name */}
        <div class="flex items-center gap-1.5">
          <div class="w-4 h-4 rounded-sm bg-[--color-accent] flex items-center justify-center">
            <svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 19h20L12 2z" />
            </svg>
          </div>
          <span class="text-xs font-semibold text-[--color-text-secondary] tracking-wide">
            particle0
          </span>
        </div>

        <div class="flex-1" />

        {/* Settings button */}
        <button
          onClick={() => setSettingsOpen(!settingsOpen())}
          class="text-[--color-text-muted] hover:text-[--color-text-primary] transition-colors p-1 rounded"
          aria-label="Open settings"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Settings panel (replaces normal content when open) */}
      <Show when={settingsOpen()}>
        <SettingsPanel />
      </Show>

      {/* Main content (hidden when settings open) */}
      <Show when={!settingsOpen()}>
        {/* Divider below header */}
        <div class="h-px bg-[--color-border-subtle] mx-4" />

        {/* Prompt input */}
        <PromptInput
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onDismiss={handleDismiss}
        />

        {/* Answer / error region */}
        <Show when={showAnswer()}>
          <div class="h-px bg-[--color-border-subtle] mx-4" />

          <Show
            when={sessionState() !== "failed"}
            fallback={
              <ErrorView
                error={errorInfo() ?? { message: "An unknown error occurred.", error_type: "unknown", retryable: true }}
                onRetry={() => {
                  const text = promptText();
                  if (text) handleSubmit(text);
                }}
              />
            }
          >
            <StreamedAnswer />
          </Show>
        </Show>

        {/* Footer action row */}
        <Show when={showFooter()}>
          <div class="h-px bg-[--color-border-subtle] mx-4" />
          <div class="flex items-center gap-1 px-4 py-2">
            {/* Copy button */}
            <button
              onClick={handleCopy}
              class="text-[10px] text-[--color-text-muted] hover:text-[--color-text-primary] px-2 py-1 rounded hover:bg-[--color-surface-elevated] transition-colors font-medium"
            >
              Copy
            </button>

            {/* Clear button */}
            <button
              onClick={handleClear}
              class="text-[10px] text-[--color-text-muted] hover:text-[--color-text-primary] px-2 py-1 rounded hover:bg-[--color-surface-elevated] transition-colors font-medium"
            >
              Clear
            </button>

            {/* Stop button during streaming */}
            <Show when={sessionState() === "streaming"}>
              <button
                onClick={handleCancel}
                class="text-[10px] text-[--color-error] hover:opacity-80 px-2 py-1 rounded hover:bg-[--color-error-bg] transition-colors font-medium"
              >
                Stop
              </button>
            </Show>

            <div class="flex-1" />

            {/* Close button */}
            <button
              onClick={handleDismiss}
              class="text-[10px] text-[--color-text-muted] hover:text-[--color-text-primary] px-2 py-1 rounded hover:bg-[--color-surface-elevated] transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </Show>

        {/* Status bar */}
        <StatusBar />
      </Show>
    </div>
  );
};

export default Overlay;
