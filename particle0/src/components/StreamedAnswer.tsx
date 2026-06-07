/**
 * StreamedAnswer — renders the streamed AI response with markdown-lite formatting.
 * Auto-scrolls to bottom during streaming. Pauses auto-scroll on manual scroll-up.
 * Shows a blinking cursor while streaming.
 */
import { Component, Show, createEffect, onMount, onCleanup } from "solid-js";
import { sessionState, streamedText } from "../signals/session";

/**
 * Converts a small subset of markdown to safe HTML.
 * Only processes: fenced code blocks, inline code, bold, italic, lists, paragraphs.
 */
function renderMarkdown(raw: string): string {
  // Escape HTML entities first to prevent XSS
  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // Split into blocks on double newlines (preserving code blocks)
  const blocks = escaped.split(/\n\n+/);

  const rendered = blocks.map((block) => {
    // Fenced code block (``` lang \n code ```)
    if (block.startsWith("```")) {
      const inner = block.replace(/^```[\w]*\n?/, "").replace(/```$/, "");
      return `<pre><code>${inner}</code></pre>`;
    }

    // Apply inline transforms
    let line = block
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/^#{1,3} (.+)$/gm, (_, t) => `<strong>${t}</strong>`);

    // Unordered list
    if (/^[-*] /m.test(line)) {
      const items = line
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => l.replace(/^[-*] /, ""))
        .map((l) => `<li>${l}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    }

    // Ordered list
    if (/^\d+\. /m.test(line)) {
      const items = line
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => l.replace(/^\d+\. /, ""))
        .map((l) => `<li>${l}</li>`)
        .join("");
      return `<ol>${items}</ol>`;
    }

    // Regular paragraph — convert single newlines to <br>
    return `<p>${line.replace(/\n/g, "<br>")}</p>`;
  });

  return rendered.join("\n");
}

const StreamedAnswer: Component = () => {
  let containerRef: HTMLDivElement | undefined;
  let userScrolledUp = false;

  const handleScroll = () => {
    if (!containerRef) return;
    const distFromBottom =
      containerRef.scrollHeight - containerRef.scrollTop - containerRef.clientHeight;
    userScrolledUp = distFromBottom > 40;
  };

  onMount(() => containerRef?.addEventListener("scroll", handleScroll, { passive: true }));
  onCleanup(() => containerRef?.removeEventListener("scroll", handleScroll));

  // Auto-scroll during streaming unless user scrolled up
  createEffect(() => {
    const text = streamedText();
    const state = sessionState();

    if (state === "streaming" && !userScrolledUp && containerRef) {
      // Use requestAnimationFrame so DOM updates settle first
      requestAnimationFrame(() => {
        if (containerRef) containerRef.scrollTop = containerRef.scrollHeight;
      });
    }

    // Reset scroll position when a brand-new stream starts
    if (state === "streaming" && text === "") {
      userScrolledUp = false;
      if (containerRef) containerRef.scrollTop = 0;
    }
  });

  const isStreaming = () => sessionState() === "streaming";
  const hasContent = () => streamedText().length > 0;

  return (
    <Show when={hasContent() || isStreaming()}>
      <div
        ref={containerRef}
        class="answer-region answer-content selectable px-4 py-2 overflow-y-auto text-sm text-[--color-text-primary] leading-relaxed"
        style={{ "max-height": "400px" }}
      >
        {/* Render markdown-converted HTML, with streaming cursor when active */}
        <span
          class={isStreaming() ? "streaming-cursor" : ""}
          innerHTML={renderMarkdown(streamedText())}
        />
      </div>
    </Show>
  );
};

export default StreamedAnswer;
