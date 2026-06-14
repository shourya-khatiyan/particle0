/** All shared TypeScript types for particle0. */

/** Prompt lifecycle states matching Rust-side session state machine. */
export type SessionState =
  | "idle"
  | "queued"
  | "connecting"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled";

/** Backend readiness status from Rust. */
export type BackendStatus =
  | "ready"
  | "unreachable"
  | "model_missing"
  | "not_configured"
  | "checking";

/** Theme preference stored in settings. */
export type ThemePreference = "dark" | "light" | "system";

/** App settings matching the Rust AppSettings struct. */
export interface AppSettings {
  nim_base_url: string;
  nim_api_key: string;
  nim_model: string;
  hotkey: string;
  theme: ThemePreference;
  launch_on_startup: boolean;
  max_tokens: number | null;
  temperature: number;
  request_timeout_secs: number;
  overlay_width: number;
}

/** Default settings for first-run. */
export const DEFAULT_SETTINGS: AppSettings = {
  nim_base_url: "https://integrate.api.nvidia.com/v1",
  nim_api_key: "",
  nim_model: "",
  hotkey: "Ctrl+Space",
  theme: "dark",
  launch_on_startup: false,
  max_tokens: null,
  temperature: 0.7,
  request_timeout_secs: 30,
  overlay_width: 780,
};

/** A single chat message for the NIM API. */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Error info displayed in the UI. */
export interface ErrorInfo {
  message: string;
  error_type: string;
  retryable: boolean;
}

/** Metadata stored after a completed session. */
export interface RequestMeta {
  request_id: string;
  elapsed_ms: number;
  token_count: number;
  model: string;
}

/** Payload for stream:chunk event. */
export interface StreamChunkPayload {
  request_id: string;
  token: string;
  accumulated: string;
}

/** Payload for stream:end event. */
export interface StreamEndPayload {
  request_id: string;
  full_text: string;
  elapsed_ms: number;
  token_count: number;
}

/** Payload for stream:error event. */
export interface StreamErrorPayload {
  request_id: string;
  error: string;
  error_type: string;
}

/** Result from test_connection command. */
export interface ConnectionTestResult {
  success: boolean;
  models: string[];
  error: string | null;
}
