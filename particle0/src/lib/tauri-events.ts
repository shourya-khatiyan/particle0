/**
 * All Rust → Frontend event listeners.
 * Call setupEventListeners() once in App.tsx onMount.
 */
import { listen } from "@tauri-apps/api/event";
import type {
  StreamChunkPayload,
  StreamEndPayload,
  StreamErrorPayload,
  AppSettings,
} from "./api-types";
import {
  setSessionState,
  setStreamedText,
  setRequestMeta,
  setErrorInfo,
  setTurnCount,
  turnCount,
  sessionState,
  multiTurnEnabled,
} from "../signals/session";
import { setOverlayVisible } from "../signals/overlay";
import { setBackendStatus, setAppSettings, applyThemeFromSettings } from "../signals/settings";

/** Register all Rust-emitted event listeners. Returns cleanup function. */
export async function setupEventListeners(): Promise<() => void> {
  const unlisteners = await Promise.all([
    listen("overlay:show", () => {
      setOverlayVisible(true);
    }),

    listen("overlay:hide", () => {
      setOverlayVisible(false);
    }),

    // stream:start — fired when Rust spawns the task; go to "connecting" while HTTP call is in flight
    listen<{ request_id: string }>("stream:start", () => {
      setSessionState("connecting");
      setStreamedText("");
      setErrorInfo(null);
    }),

    // stream:chunk — first chunk upgrades "connecting" → "streaming"; subsequent ones just update text
    listen<StreamChunkPayload>("stream:chunk", (event) => {
      if (sessionState() !== "streaming") setSessionState("streaming");
      setStreamedText(event.payload.accumulated);
    }),

    listen<StreamEndPayload>("stream:end", (event) => {
      setSessionState("completed");
      setStreamedText(event.payload.full_text);
      setRequestMeta({
        request_id: event.payload.request_id,
        elapsed_ms: event.payload.elapsed_ms,
        token_count: event.payload.token_count,
        model: "",
      });
      // Increment turn counter if multi-turn is active
      if (multiTurnEnabled()) {
        setTurnCount(turnCount() + 1);
      }
    }),

    // stream:cancelled — user pressed Stop; keep partial text visible
    listen<{ request_id: string; partial_text: string }>("stream:cancelled", (event) => {
      setSessionState("cancelled");
      setStreamedText(event.payload.partial_text);
    }),

    listen<StreamErrorPayload>("stream:error", (event) => {
      setSessionState("failed");
      setErrorInfo({
        message: event.payload.error,
        error_type: event.payload.error_type,
        retryable: !["auth", "config", "model"].includes(event.payload.error_type),
      });
    }),

    listen<{ settings: AppSettings }>("settings:updated", (event) => {
      setAppSettings(event.payload.settings);
      applyThemeFromSettings(event.payload.settings.theme);
    }),

    listen<{ models: string[] }>("backend:ready", () => {
      setBackendStatus("ready");
    }),

    listen<{ reason: string; reason_type: string }>("backend:unavailable", (event) => {
      const t = event.payload.reason_type;
      if (t === "model_missing") setBackendStatus("model_missing");
      else setBackendStatus("unreachable");
    }),

    listen("session:history_cleared", () => {
      setTurnCount(0);
    }),
  ]);

  // Returns a cleanup function to unlisten all
  return () => unlisteners.forEach((fn) => fn());
}
