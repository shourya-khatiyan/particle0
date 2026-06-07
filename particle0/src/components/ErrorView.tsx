/**
 * ErrorView — displays an error message with retry action.
 * Shown inside the answer region when session state is "failed".
 */
import { Component } from "solid-js";
import type { ErrorInfo } from "../lib/api-types";

interface ErrorViewProps {
  error: ErrorInfo;
  onRetry: () => void;
}

const ErrorView: Component<ErrorViewProps> = (props) => {
  return (
    <div class="flex items-start gap-3 px-4 py-3 mx-4 my-2 rounded-[--radius-inner] bg-[--color-error-bg] border-l-2 border-[--color-error]">
      {/* Error icon */}
      <svg
        class="w-4 h-4 text-[--color-error] flex-shrink-0 mt-0.5"
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
        <p class="text-sm text-[--color-text-primary] leading-snug">
          {props.error.message}
        </p>

        {props.error.retryable && (
          <button
            class="mt-2 text-xs text-[--color-accent] hover:text-[--color-accent-hover] font-medium transition-colors"
            onClick={props.onRetry}
          >
            Try again →
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorView;
