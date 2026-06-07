/**
 * PromptInput — auto-resize textarea for prompt entry.
 * Handles submit on Enter, newline on Shift+Enter, and Escape for cancel/dismiss.
 */
import { Component, onMount, createEffect } from "solid-js";
import { isRequestActive, promptText, setPromptText } from "../signals/session";

interface PromptInputProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  onDismiss: () => void;
}

const PromptInput: Component<PromptInputProps> = (props) => {
  let textareaRef: HTMLTextAreaElement | undefined;

  // Auto-focus on mount
  onMount(() => textareaRef?.focus());

  // Auto-resize textarea based on content
  const resize = () => {
    const el = textareaRef;
    if (!el) return;
    el.style.height = "auto";
    // Clamp between 1 line (~24px) and 3 lines (~72px)
    const clamped = Math.min(el.scrollHeight, 72);
    el.style.height = `${clamped}px`;
  };

  createEffect(() => {
    promptText(); // track signal
    resize();
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = promptText().trim();
      if (text && !isRequestActive()) {
        props.onSubmit(text);
      }
    }

    if (e.key === "Escape") {
      if (isRequestActive()) {
        props.onCancel();
      } else {
        props.onDismiss();
      }
    }
  };

  const handleSubmitClick = () => {
    const text = promptText().trim();
    if (text && !isRequestActive()) {
      props.onSubmit(text);
    }
  };

  return (
    <div class="flex items-end gap-2 px-4 py-3">
      <textarea
        ref={textareaRef}
        value={promptText()}
        onInput={(e) => setPromptText(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything…"
        rows={1}
        disabled={isRequestActive()}
        class="
          flex-1 resize-none bg-transparent outline-none
          text-[--color-text-primary] placeholder:text-[--color-text-muted]
          text-sm leading-6 font-normal
          disabled:opacity-60
          selectable
        "
        style={{ height: "24px", "max-height": "72px", overflow: "auto" }}
      />

      {/* Submit button */}
      <button
        onClick={handleSubmitClick}
        disabled={isRequestActive() || !promptText().trim()}
        aria-label="Submit prompt"
        class="
          flex-shrink-0 w-7 h-7 flex items-center justify-center
          rounded-md bg-[--color-accent] hover:bg-[--color-accent-hover]
          disabled:opacity-30 disabled:cursor-not-allowed
          transition-colors duration-[--duration-fast]
          text-white
        "
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
};

export default PromptInput;
