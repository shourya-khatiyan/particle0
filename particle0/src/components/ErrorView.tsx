/**
 * ErrorView — friendly error display with warm-tinted surface.
 * Shows a descriptive message with retry and settings actions.
 */
import { Component, Show } from "solid-js";
import type { ErrorInfo } from "../lib/api-types";
import { setSettingsOpen } from "../signals/overlay";

interface ErrorViewProps {
  error: ErrorInfo;
  onRetry: () => void;
}

const CONFIG_ERRORS = new Set(["auth", "config", "model", "model_missing"]);

const ErrorView: Component<ErrorViewProps> = (props) => {
  const isConfigError = () => CONFIG_ERRORS.has(props.error.error_type);

  return (
    <div class="mx-5 my-2 px-4 py-3 bg-[var(--color-error-bg)] border border-[rgba(251,113,133,0.15)]">
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0 w-5 h-5 bg-[var(--color-error)] flex items-center justify-center mt-0.5">
          <svg class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-sm text-[var(--text-primary)] leading-snug font-medium">
            Something went wrong
          </p>
          <p class="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
            {props.error.message}
          </p>

          <div class="flex items-center gap-3 mt-3">
            <Show when={props.error.retryable}>
              <button
                class="btn-ghost text-xs font-medium px-3 py-1.5 text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                onClick={props.onRetry}
              >
                Try again
              </button>
            </Show>
            <Show when={isConfigError()}>
              <button
                class="btn-ghost text-xs font-medium px-3 py-1.5"
                onClick={() => setSettingsOpen(true)}
              >
                Open Settings
              </button>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorView;
