/**
 * StatusBar — small status dot + model/connection indicator in the footer.
 */
import { Component, Show } from "solid-js";
import { backendStatus } from "../signals/settings";
import { requestMeta, sessionState } from "../signals/session";
import { formatElapsed, formatTokenCount } from "../lib/format";

const STATUS_COLORS: Record<string, string> = {
  ready: "bg-[--color-success]",
  checking: "bg-[--color-warning]",
  unreachable: "bg-[--color-error]",
  model_missing: "bg-[--color-error]",
  not_configured: "bg-[--color-text-muted]",
};

const STATUS_LABELS: Record<string, string> = {
  ready: "Connected",
  checking: "Checking…",
  unreachable: "Unreachable",
  model_missing: "Model missing",
  not_configured: "Not configured",
};

const StatusBar: Component = () => {
  const meta = requestMeta();
  const state = sessionState();

  return (
    <div class="flex items-center gap-2 px-4 py-2 border-t border-[--color-border-subtle]">
      {/* Status dot */}
      <span class="relative flex h-2 w-2">
        <span
          class={`rounded-full h-2 w-2 flex-shrink-0 ${STATUS_COLORS[backendStatus()] ?? "bg-[--color-text-muted]"}`}
        />
      </span>

      <span class="text-[11px] text-[--color-text-muted] font-medium">
        {STATUS_LABELS[backendStatus()] ?? "Unknown"}
      </span>

      {/* Token/timing info after completion */}
      <Show when={state === "completed" && meta}>
        <span class="ml-auto text-[10px] text-[--color-text-muted]">
          {formatElapsed(meta!.elapsed_ms)} · {formatTokenCount(meta!.token_count)}
        </span>
      </Show>
    </div>
  );
};

export default StatusBar;
