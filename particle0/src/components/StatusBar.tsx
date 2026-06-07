/**
 * StatusBar — connection status, model indicator, timing, and hotkey warning.
 */
import { Component, Show } from "solid-js";
import { backendStatus, hotkeyRegistered } from "../signals/settings";
import { requestMeta, sessionState } from "../signals/session";
import { formatElapsed, formatTokenCount } from "../lib/format";

const DOT_CLASS: Record<string, string> = {
  ready: "bg-[--color-success]",
  checking: "bg-[--color-warning] animate-pulse",
  unreachable: "bg-[--color-error]",
  model_missing: "bg-[--color-warning]",
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

  /** Tokens per second — only valid when we have both token count and elapsed time. */
  const tokensPerSec = () => {
    const m = meta();
    if (!m || m.elapsed_ms === 0) return null;
    return (m.token_count / (m.elapsed_ms / 1000)).toFixed(1);
  };

  return (
    <div class="flex items-center gap-2 px-4 py-1.5 border-t border-[--color-border-subtle] flex-shrink-0">
      {/* Status dot */}
      <span
        class={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${DOT_CLASS[status()] ?? "bg-[--color-text-muted]"}`}
      />

      <span class="text-[10px] text-[--color-text-muted] font-medium leading-none">
        {STATUS_LABEL[status()] ?? "Unknown"}
      </span>

      {/* Active request indicator */}
      <Show when={state() === "streaming" || state() === "connecting"}>
        <span class="text-[10px] text-[--color-accent] font-medium animate-pulse">
          {state() === "connecting" ? "connecting…" : "streaming"}
        </span>
      </Show>

      {/* Hotkey not registered warning */}
      <Show when={!hotkeyRegistered()}>
        <span
          class="text-[10px] text-[--color-warning] font-medium"
          title="Global hotkey could not be registered. Change it in Settings."
        >
          ⚠ hotkey conflict
        </span>
      </Show>

      <div class="flex-1" />

      {/* Token count · elapsed · tokens/s after completion */}
      <Show when={state() === "completed" && meta()}>
        <span class="text-[10px] text-[--color-text-muted] tabular-nums">
          {formatTokenCount(meta()!.token_count)}
          {" · "}
          {formatElapsed(meta()!.elapsed_ms)}
          <Show when={tokensPerSec()}>
            {" · "}{tokensPerSec()} t/s
          </Show>
        </span>
      </Show>
    </div>
  );
};

export default StatusBar;
