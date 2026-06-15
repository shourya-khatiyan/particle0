/**
 * PromptInput — text area with amber send button.
 * Larger calmer input, focus glow, send demotes after answer exists.
 */
import { Component, onMount, createEffect, Show } from "solid-js";
import { sessionState, promptText, setPromptText, streamedText } from "../signals/session";

interface PromptInputProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  onDismiss: () => void;
  textareaRef?: (el: HTMLTextAreaElement) => void;
}

const PromptInput: Component<PromptInputProps> = (props) => {
  let textareaRef: HTMLTextAreaElement | undefined;

  onMount(() => {
    textareaRef?.focus();
    if (textareaRef && props.textareaRef) {
      props.textareaRef(textareaRef);
    }
  });

  const resize = () => {
    const el = textareaRef;
    if (!el) return;
    el.style.height = "auto";
    const clamped = Math.min(el.scrollHeight, 96);
    el.style.height = `${Math.max(clamped, 32)}px`;
  };

  createEffect(() => {
    promptText();
    resize();
  });

  const isActive = () => {
    const s = sessionState();
    return s === "queued" || s === "connecting" || s === "streaming";
  };

  const hasAnswer = () => {
    const s = sessionState();
    return s === "completed" || s === "cancelled" || s === "failed" || (s === "streaming" && streamedText().length > 0);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      return;
    }

    if (e.key === "Escape") {
      if (isActive()) {
        props.onCancel();
      } else {
        props.onDismiss();
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = promptText().trim();
      if (text && !isActive()) {
        props.onSubmit(text);
      }
    }
  };

  const handleSubmitClick = () => {
    if (isActive()) {
      props.onCancel();
      return;
    }
    const text = promptText().trim();
    if (text) {
      props.onSubmit(text);
    }
  };

  return (
    <div class="flex items-end gap-3 px-5 py-3 flex-shrink-0">
      <textarea
        ref={textareaRef}
        value={promptText()}
        onInput={(e) => setPromptText(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything..."
        rows={1}
        disabled={isActive()}
        class="
          prompt-textarea
          flex-1 resize-none bg-transparent border-none
          text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
          leading-8 font-normal
          disabled:opacity-40
          selectable
          outline-none focus:outline-none focus-visible:outline-none
        "
        style={{ height: "32px", "max-height": "96px", overflow: "hidden auto" }}
      />

      {/* Send / Stop — hidden when answer already showing (demoted) */}
      <Show when={!hasAnswer() || isActive()}>
        <button
          onClick={handleSubmitClick}
          disabled={!isActive() && !promptText().trim()}
          aria-label={isActive() ? "Stop generation" : "Submit prompt"}
          class={`
            flex-shrink-0 w-8 h-8 flex items-center justify-center
            transition-all duration-[var(--duration-fast)]
            ${isActive() ? "btn-stop" : "btn-send"}
          `}
        >
          {isActive()
            ? <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            : <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
          }
        </button>
      </Show>
    </div>
  );
};

export default PromptInput;
