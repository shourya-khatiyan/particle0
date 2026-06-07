/**
 * Session signals — prompt lifecycle state machine.
 * These are the single source of truth for current inference state.
 */
import { createSignal } from "solid-js";
import type { SessionState, ErrorInfo, RequestMeta } from "../lib/api-types";

/** Current state of the prompt lifecycle. */
export const [sessionState, setSessionState] = createSignal<SessionState>("idle");

/** Full accumulated text from the current/last stream. */
export const [streamedText, setStreamedText] = createSignal<string>("");

/** The prompt currently in the input field. */
export const [promptText, setPromptText] = createSignal<string>("");

/** Error info if the session is in failed state. */
export const [errorInfo, setErrorInfo] = createSignal<ErrorInfo | null>(null);

/** Metadata from the last completed request. */
export const [requestMeta, setRequestMeta] = createSignal<RequestMeta | null>(null);

/** Whether multi-turn conversation memory is enabled. */
export const [multiTurnEnabled, setMultiTurnEnabled] = createSignal<boolean>(false);

/** Derived: whether a request is currently in flight. */
export function isRequestActive(): boolean {
  const s = sessionState();
  return s === "queued" || s === "connecting" || s === "streaming";
}

/** Resets session to idle, clearing output and error state. */
export function resetSession(): void {
  setSessionState("idle");
  setStreamedText("");
  setErrorInfo(null);
  setRequestMeta(null);
}
