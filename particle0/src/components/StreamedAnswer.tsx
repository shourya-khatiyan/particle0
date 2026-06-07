/**
 * StreamedAnswer — renders the streamed response with markdown-lite formatting.
 * Shows a blinking cursor while streaming. Auto-scrolls to bottom during streaming.
 */
import { Component, Show, createEffect, onMount, onCleanup } from "solid-js";
import { sessionState, streamedText } from "../signals/session";
import "../styles/overlay.css";

/** Minimal markdown → HTML conversion. Safe subset only. */
function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Fenced code blocks (``` or ```)
    .replace(/```[\w]*\n?([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    // Bullet list items
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    // Line breaks → paragraphs (double newline)
    .split(/\n\n+/)
    .map((block) => {
      if (block.startsWith("<pre>") || block.startsWith("<ul>")) return block;
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");

  return html;
}

const StreamedAnswer: Component = () => {
  let containerRef: HTMLDivElement | undefined;
  let userScrolled = false;

  // Track if user has manually scrolled up
  const handleScroll = () => {
    if (!containerRef) return;
    const atBottom =
      containerRef.scrollHeight - containerRef.scrollTop - containerRef.clientHeight < 40;
    userScrolled = !atBottom;
  };

  onMount(() => containerRef?.addEventListener("scroll", handleScroll));
  onCleanup(() => containerRef?.removeEventListener("scroll", handleScroll));

  // Auto-scroll to bottom during streaming
  createEffect(() => {
    streamedText(); // track
    if (sessionState() === "streaming" && !userScrolled && containerRef) {
      containerRef.scrollTop = containerRef.scrollHeight;
    }
    // Reset userScrolled when a new session starts
    if (sessionState() === "streaming" && streamedText() === "") {
      userScrolled = false;
    }
  });

  const isStreaming = () => sessionState() === "streaming";
  const hasContent = () => streamedText().length > 0;

  return (
    <Show when={hasContent() || isStreaming()}>
      <div
        ref={containerRef}
        class="
          answer-region answer-content selectable
          px-4 py-2 overflow-y-auto
          text-sm text-[--color-text-primary] leading-relaxed
        "
        style={{ "max-height": "400px" }}
      >
        <span
          class={isStreaming() ? "streaming-cursor" : ""}
          innerHTML={renderMarkdown(streamedText())}
        />
      </div>
    </Show>
  );
};

export default StreamedAnswer;
