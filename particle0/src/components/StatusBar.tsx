/**
 * StatusBar — inline token count and timing metrics.
 * Displays as a compact text span within the footer row.
 */
import { Component, Show } from "solid-js";
import { requestMeta, sessionState } from "../signals/session";
import { formatElapsed, formatTokenCount } from "../lib/format";

const StatusBar: Component = () => {
  const meta = () => requestMeta();
  const state = () => sessionState();

  const tokensPerSec = () => {
    const m = meta();
    if (!m || m.elapsed_ms === 0) return null;
    return (m.token_count / (m.elapsed_ms / 1000)).toFixed(1);
  };

  const shouldShow = () => state() === "completed" && meta();

  return (
    <Show when={shouldShow()}>
      <span class="text-[11px] text-[var(--text-muted)] tabular-nums flex items-center gap-1">
        <span>{formatTokenCount(meta()!.token_count)}</span>
        <span class="opacity-50">&middot;</span>
        <span>{formatElapsed(meta()!.elapsed_ms)}</span>
        <Show when={tokensPerSec()}>
          <span class="opacity-50">&middot;</span>
          <span>{tokensPerSec()} t/s</span>
        </Show>
      </span>
    </Show>
  );
};

export default StatusBar;
