/**
 * StreamedAnswer — renders the streamed AI response with markdown-lite formatting.
 * Auto-scrolls to bottom during streaming. Pauses auto-scroll on manual scroll-up.
 * Shows a blinking cursor while streaming.
 */
import { Component, Show, createEffect, onMount, onCleanup } from "solid-js";
import { sessionState, streamedText } from "../signals/session";

/**
 * Converts a small subset of markdown to safe HTML.
 * Handles: fenced code blocks (with blank lines inside), inline code, bold, italic, lists, paragraphs.
 */
function renderMarkdown(raw: string): string {
  // Escape HTML entities first to prevent XSS
  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // Extract fenced code blocks first (they can contain blank lines)
  const segments: string[] = [];
  let remaining = escaped;
  const codeBlockRegex = /^```([\w]*)\n([\s\S]*?)^```$/gm;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(escaped)) !== null) {
    // Push text before this code block
    if (match.index > lastIndex) {
      segments.push(remaining.substring(lastIndex, match.index));
    }
    // Push the code block as rendered HTML (sentinel-wrapped so we don't re-process)
    segments.push(`\x00PRE\x00<pre><code>${match[2]}</code></pre>\x00/PRE\x00`);
    lastIndex = match.index + match[0].length;
  }
  // Push remaining text after last code block
  if (lastIndex < escaped.length) {
    segments.push(escaped.substring(lastIndex));
  }

  // Process non-code segments into blocks
  const rendered = segments.map((segment) => {
    // Already-rendered code blocks pass through
    if (segment.startsWith("\x00PRE\x00")) {
      return segment.replace(/\x00PRE\x00/g, "").replace(/\x00\/PRE\x00/g, "");
    }

    // Split on double newlines for paragraph detection
    const blocks = segment.split(/\n\n+/);
    return blocks
      .map((block) => {
        if (!block.trim()) return "";

        // Inline fenced code block (single-line ```)
        if (block.trimStart().startsWith("```")) {
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
      })
      .filter(Boolean)
      .join("\n");
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
        class="answer-region answer-content selectable px-4 py-2 overflow-y-auto text-sm text-[var(--color-text-primary)] leading-relaxed"
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
