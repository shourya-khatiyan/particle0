/**
 * StatusBar — connection status dot, model indicator, and timing info.
 */
import { Component, Show } from "solid-js";
import { backendStatus } from "../signals/settings";
import { requestMeta, sessionState } from "../signals/session";
import { formatElapsed, formatTokenCount } from "../lib/format";

const DOT_CLASS: Record<string, string> = {
  ready: "bg-[--color-success]",
  checking: "bg-[--color-warning] status-dot-connecting",
  unreachable: "bg-[--color-error]",
  model_missing: "bg-[--color-error]",
  not_configured: "bg-[--color-text-muted]",
};

const STATUS_LABEL: Record<string, string> = {
  ready: "Connected",
  checking: "Checking…",
  unreachable: "Unreachable",
  model_missing: "Model missing",
  not_configured: "Not configured",
};

const StatusBar: Component = () => {
  const status = () => backendStatus();
  const meta = () => requestMeta();
  const state = () => sessionState();

  return (
    <div class="flex items-center gap-2 px-4 py-1.5 border-t border-[--color-border-subtle] flex-shrink-0">
      {/* Status dot with optional pulse for "checking" */}
      <span class="relative flex h-1.5 w-1.5 flex-shrink-0">
        <span
          class={`rounded-full h-1.5 w-1.5 block ${DOT_CLASS[status()] ?? "bg-[--color-text-muted]"}`}
        />
      </span>

      <span class="text-[10px] text-[--color-text-muted] font-medium leading-none">
        {STATUS_LABEL[status()] ?? "Unknown"}
      </span>

      {/* Streaming indicator */}
      <Show when={state() === "streaming" || state() === "connecting"}>
        <span class="text-[10px] text-[--color-accent] font-medium animate-pulse">
          {state() === "connecting" ? "connecting…" : "streaming"}
        </span>
      </Show>

      <div class="flex-1" />

      {/* Token count + timing after completion */}
      <Show when={state() === "completed" && meta()}>
        <span class="text-[10px] text-[--color-text-muted] tabular-nums">
          {formatTokenCount(meta()!.token_count)} · {formatElapsed(meta()!.elapsed_ms)}
        </span>
      </Show>
    </div>
  );
};

export default StatusBar;
