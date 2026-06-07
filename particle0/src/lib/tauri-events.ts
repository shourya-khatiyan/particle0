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
} from "../signals/session";
import { setOverlayVisible } from "../signals/overlay";
import { setBackendStatus, applyThemeFromSettings } from "../signals/settings";

/** Register all Rust-emitted event listeners. Returns cleanup function. */
export async function setupEventListeners(): Promise<() => void> {
  const unlisteners = await Promise.all([
    listen("overlay:show", () => {
      setOverlayVisible(true);
    }),

    listen("overlay:hide", () => {
      setOverlayVisible(false);
    }),

    listen<{ request_id: string }>("stream:start", () => {
      setSessionState("streaming");
      setStreamedText("");
    }),

    listen<StreamChunkPayload>("stream:chunk", (event) => {
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
    }),

    listen<StreamErrorPayload>("stream:error", (_event) => {
      setSessionState("failed");
    }),

    listen<{ settings: AppSettings }>("settings:updated", (event) => {
      applyThemeFromSettings(event.payload.settings.theme);
    }),

    listen("backend:ready", () => {
      setBackendStatus("ready");
    }),

    listen<{ reason: string }>("backend:unavailable", () => {
      setBackendStatus("unreachable");
    }),
  ]);

  // Returns a cleanup function to unlisten all
  return () => unlisteners.forEach((fn) => fn());
}
