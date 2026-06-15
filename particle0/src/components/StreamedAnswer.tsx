/**
 * StreamedAnswer — renders AI response with proper markdown on frosted glass.
 * Uses markdown-it for full rendering with DOMPurify for safety.
 * Includes code block headers with per-block copy buttons.
 */
import { Component, Show, createMemo, onMount, onCleanup } from "solid-js";
import { sessionState, streamedText } from "../signals/session";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { copyToClipboard } from "../lib/format";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
});

md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const lang = token.info.trim() || "text";
  const code = token.content;
  const escapedCode = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<div class="code-block-wrapper">
    <div class="code-block-header">
      <span>${lang}</span>
      <button data-copy-code="${encodeURIComponent(code)}">Copy</button>
    </div>
    <pre><code class="language-${lang}">${escapedCode}</code></pre>
  </div>`;
};

/**
 * Renders markdown string to sanitized HTML.
 */
function renderMarkdown(raw: string): string {
  const rendered = md.render(raw);
  return DOMPurify.sanitize(rendered, {
    ADD_ATTR: ["data-copy-code"],
  });
}

const StreamedAnswer: Component = () => {
  let containerRef: HTMLDivElement | undefined;

  const handleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON" && target.dataset.copyCode) {
      const code = decodeURIComponent(target.dataset.copyCode);
      copyToClipboard(code);
      target.textContent = "Copied!";
      setTimeout(() => { target.textContent = "Copy"; }, 1500);
    }
  };

  onMount(() => {
    containerRef?.addEventListener("click", handleClick);
  });

  onCleanup(() => {
    containerRef?.removeEventListener("click", handleClick);
  });

  const isStreaming = () => sessionState() === "streaming";
  const hasContent = () => streamedText().length > 0;

  const renderedHtml = createMemo(() => {
    const text = streamedText();
    if (!text) return "";
    return renderMarkdown(text);
  });

  return (
    <Show when={hasContent() || isStreaming()}>
      <div
        ref={containerRef}
        class="answer-region answer-content selectable px-5 pt-1 pb-3 overflow-y-auto text-sm text-[var(--text-primary)] leading-relaxed"
        style={{ "max-height": "420px" }}
      >
        <span
          class={isStreaming() ? "streaming-cursor" : ""}
          innerHTML={renderedHtml()}
        />
      </div>
    </Show>
  );
};

export default StreamedAnswer;
