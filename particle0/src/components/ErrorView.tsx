/**
 * ErrorView — error message with retry and optional "Open Settings" link.
 * Shown inside the answer region when session state is "failed".
 */
import { Component, Show } from "solid-js";
import type { ErrorInfo } from "../lib/api-types";
import { setSettingsOpen } from "../signals/overlay";

interface ErrorViewProps {
  error: ErrorInfo;
  onRetry: () => void;
}

/** Error types that suggest opening Settings to fix. */
const CONFIG_ERRORS = new Set(["auth", "config", "model", "model_missing"]);

const ErrorView: Component<ErrorViewProps> = (props) => {
  const isConfigError = () => CONFIG_ERRORS.has(props.error.error_type);

  return (
    <div class="flex items-start gap-3 px-4 py-3 mx-4 my-2 rounded-[var(--radius-inner)] bg-[var(--color-error-bg)] border-l-2 border-[var(--color-error)]">
      {/* Error icon */}
      <svg
        class="w-4 h-4 text-[var(--color-error)] flex-shrink-0 mt-0.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>

      <div class="flex-1 min-w-0">
        <p class="text-sm text-[var(--color-text-primary)] leading-snug">
          {props.error.message}
        </p>

        <div class="flex items-center gap-3 mt-2">
          {/* Retry — only for retryable errors */}
          <Show when={props.error.retryable}>
            <button
              class="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] font-medium transition-colors"
              onClick={props.onRetry}
            >
              Try again →
            </button>
          </Show>

          {/* Open Settings — for auth/config/model errors */}
          <Show when={isConfigError()}>
            <button
              class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] font-medium transition-colors"
              onClick={() => setSettingsOpen(true)}
            >
              Open Settings
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default ErrorView;
