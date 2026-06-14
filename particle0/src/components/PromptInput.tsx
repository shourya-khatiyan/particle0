/**
 * PromptInput — auto-resize textarea for prompt entry.
 * Enter=submit, Shift+Enter=newline, Escape=cancel or dismiss.
 * Tab is trapped so focus stays within the overlay.
 */
import { Component, onMount, createEffect } from "solid-js";
import { sessionState, promptText, setPromptText } from "../signals/session";

interface PromptInputProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  onDismiss: () => void;
}

const PromptInput: Component<PromptInputProps> = (props) => {
  let textareaRef: HTMLTextAreaElement | undefined;

  // Auto-focus on mount
  onMount(() => {
    textareaRef?.focus();
  });

  // Auto-resize: match content height, clamp to 3 lines max
  const resize = () => {
    const el = textareaRef;
    if (!el) return;
    el.style.height = "auto";
    const clamped = Math.min(el.scrollHeight, 72);
    el.style.height = `${Math.max(clamped, 24)}px`;
  };

  createEffect(() => {
    promptText(); // track
    resize();
  });

  const isActive = () => {
    const s = sessionState();
    return s === "queued" || s === "connecting" || s === "streaming";
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Tab — keep focus within overlay (no default browser tab-away)
    if (e.key === "Tab") {
      e.preventDefault();
      return;
    }

    // Escape — cancel stream if active, otherwise dismiss overlay
    if (e.key === "Escape") {
      if (isActive()) {
        props.onCancel();
      } else {
        props.onDismiss();
      }
      return;
    }

    // Enter (without Shift) — submit
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = promptText().trim();
      if (text && !isActive()) {
        props.onSubmit(text);
      }
    }
  };

  const handleSubmitClick = () => {
    const text = promptText().trim();
    if (text && !isActive()) {
      props.onSubmit(text);
    }
  };

  return (
    <div class="flex items-end gap-2 px-3 py-2.5 flex-shrink-0">
      <div class="flex-1 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)] px-3 py-2">
        <textarea
          ref={textareaRef}
          value={promptText()}
          onInput={(e) => setPromptText(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything…"
          rows={1}
          disabled={isActive()}
          class="
            w-full resize-none bg-transparent outline-none border-none
            text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]/60
            leading-6 font-normal
            disabled:opacity-50
            selectable
          "
          style={{ height: "24px", "max-height": "72px", overflow: "hidden auto" }}
        />
      </div>

      {/* Submit / stop button */}
      <button
        onClick={isActive() ? props.onCancel : handleSubmitClick}
        disabled={!isActive() && !promptText().trim()}
        aria-label={isActive() ? "Stop" : "Submit prompt"}
        class={`
          flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md
          transition-all duration-[var(--duration-fast)]
          disabled:opacity-25 disabled:cursor-not-allowed
          ${isActive()
            ? "bg-[var(--color-error)]/80 hover:bg-[var(--color-error)] text-white"
            : "bg-[var(--color-text-primary)] hover:bg-[var(--color-accent-hover)] text-[var(--color-surface)]"
          }
        `}
      >
        {isActive()
          ? /* Stop square */
            <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          : /* Arrow right */
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
        }
      </button>
    </div>
  );
};

export default PromptInput;
