# particle0 — Project Memory Context

> This file is the persistent context for the particle0 project. Read this at the start of every new chat session to restore full project context. Update it after each phase completes.

---

## What is particle0?

A Windows desktop AI overlay assistant with a Spotlight-like interaction model. A global hotkey summons a compact floating frameless window. The user types a prompt, the app streams the answer from NVIDIA NIM, and the overlay dismisses instantly. Think "Alt+Space → ask AI → back to work."

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Framework | Tauri 2.0 |
| Backend Language | Rust |
| Frontend | SolidJS + TypeScript + Vite |
| CSS | Tailwind CSS v4 (CSS-first config via `@theme` in globals.css) |
| AI Backend | NVIDIA NIM (OpenAI-compatible API) |
| HTTP Client | `reqwest` with streaming + rustls-tls |
| Async Runtime | `tokio` |
| Error Handling | `thiserror` |
| Settings Storage | Rust-managed JSON file at `app_data_dir()/particle0/settings.json` |

---

## Key Architecture Decisions (Confirmed by User)

| Decision | Choice | Reason |
|---|---|---|
| CSS Framework | Tailwind CSS v4 with custom design tokens | Utility-first, CSS-first config, fast iteration |
| Conversation Mode | Default single-turn, toggle for multi-turn | User control, defaults to stateless for speed |
| System Tray | Deferred — NOT in V1 | Keep V1 scope focused |
| Multi-Monitor | Overlay on monitor where mouse cursor currently is | Best UX for multi-monitor setups |
| Testing | Rust-side unit tests for critical paths only | NIM client, stream parser, settings |
| Packaging | Windows NSIS installer, no auto-updater in V1 | Installer only for V1 |
| Settings persistence | Raw JSON file managed by Rust | Better validation/migration than Tauri Store |

---

## Project Location

```
f:\Projects\particle0\
```

App source code lives inside:
```
f:\Projects\particle0\particle0\   ← Tauri project root (created in Phase 0)
```

---

## NVIDIA NIM Details

- API Key: stored in `f:\Projects\particle0\nvidia-api-key.txt` (starts with `nvapi-`)
- Default base URL: `https://integrate.api.nvidia.com/v1` (NVIDIA hosted NIM)
- Endpoints used:
  - `GET /v1/models` — list available models, used for validation + settings dropdown
  - `GET /v1/health/ready` — readiness check on startup
  - `POST /v1/chat/completions` — streaming inference with `stream: true`
- Auth: `Authorization: Bearer {api_key}` header

---

## Repository Structure (Full)

```
particle0/                        ← workspace root
├── .cursor/
│   └── memcontext.md             ← THIS FILE
├── nvidia-api-key.txt            ← API key (never commit this)
├── particle0-plan.md             ← Original product plan
└── particle0/                    ← Tauri app root
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── .env.example
    ├── README.md
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── components/
    │   │   ├── Overlay.tsx         ← Root overlay card container
    │   │   ├── PromptInput.tsx     ← Auto-resize textarea
    │   │   ├── StreamedAnswer.tsx  ← Markdown-lite renderer, streaming cursor
    │   │   ├── StatusBar.tsx       ← Status dot + model indicator
    │   │   ├── ErrorView.tsx       ← Error display with retry
    │   │   └── SettingsPanel.tsx   ← Settings UI + test connection
    │   ├── signals/
    │   │   ├── overlay.ts          ← Overlay visibility state
    │   │   ├── session.ts          ← Prompt lifecycle state machine signals
    │   │   └── settings.ts         ← Settings signals + multi-turn toggle
    │   ├── lib/
    │   │   ├── tauri-events.ts     ← All Rust→Frontend event listeners
    │   │   ├── tauri-commands.ts   ← All Frontend→Rust command wrappers
    │   │   ├── api-types.ts        ← Shared TS types
    │   │   └── format.ts           ← Text formatting utilities
    │   ├── styles/
    │   │   ├── globals.css         ← Tailwind v4 @theme tokens + base styles
    │   │   └── overlay.css         ← Overlay-specific styles
    │   └── vite-env.d.ts
    └── src-tauri/
        ├── tauri.conf.json
        ├── Cargo.toml
        ├── build.rs
        ├── capabilities/
        │   ├── default.json
        │   └── overlay.json
        └── src/
            ├── main.rs             ← App entry, plugin registration, setup
            ├── lib.rs              ← Tauri builder config
            ├── window_manager.rs   ← show/hide/focus/resize/multi-monitor logic
            ├── shortcut.rs         ← Global hotkey registration + toggle
            ├── nim_client.rs       ← NVIDIA NIM HTTP client
            ├── stream_parser.rs    ← SSE streaming parser
            ├── commands.rs         ← All Tauri command handlers
            ├── settings.rs         ← AppSettings struct + load/save/validate
            ├── state.rs            ← AppState (Mutex-wrapped, managed by Tauri)
            └── errors.rs           ← NimError enum with thiserror
```

---

## Event System Contract

### Rust → Frontend Events
| Event | Payload | When |
|---|---|---|
| `overlay:show` | none | Hotkey opens overlay |
| `overlay:hide` | none | Overlay hidden |
| `stream:start` | `{ request_id }` | HTTP connection opens, first byte |
| `stream:chunk` | `{ request_id, token, accumulated }` | Every ~16ms batch |
| `stream:end` | `{ request_id, full_text, elapsed_ms, token_count }` | Stream complete |
| `stream:error` | `{ request_id, error, error_type }` | Any failure |
| `settings:updated` | `{ settings }` | Settings saved |
| `backend:ready` | none | Startup validation passed |
| `backend:unavailable` | `{ reason }` | Startup validation failed |

### Frontend → Rust Commands
| Command | Args | Purpose |
|---|---|---|
| `submit_prompt` | `{ prompt, multi_turn }` | Submit prompt for inference |
| `cancel_prompt` | none | Abort active stream |
| `test_connection` | `{ base_url, api_key }` | Validate NIM connection |
| `save_settings` | `{ settings }` | Persist settings to disk |
| `load_settings` | none | Load settings from disk |
| `toggle_overlay` | none | Show/hide overlay |
| `show_overlay` | none | Show overlay |
| `hide_overlay` | none | Hide overlay |
| `resize_overlay` | `{ height }` | Resize window height |
| `update_hotkey` | `{ shortcut }` | Change global hotkey |
| `set_multi_turn` | `{ enabled }` | Toggle conversation memory |

---

## Prompt Lifecycle States

`idle → queued → connecting → streaming → completed | failed | cancelled`

---

## UI Height States

| State | Height | Content |
|---|---|---|
| `collapsed` | ~80px | Input only |
| `streaming` | ~280-480px | Input + growing answer |
| `completed` | ~280-480px | Input + full answer + footer |

---

## Error Mapping (NimError → User Message)

| Error | User Message |
|---|---|
| NetworkError | "Cannot reach the model server." |
| AuthError | "Authentication failed. Check your API key in Settings." |
| ModelNotFound | "Selected model is not available." |
| Timeout | "Request timed out. Try again or increase timeout in Settings." |
| StreamParseError | "Response was corrupted. Try again." |
| ServerError | "The model server returned an error." |
| ConfigError | "Configuration issue. Open Settings to fix." |

---

## Phase Progress

| Phase | Status | Summary |
|---|---|---|
| Phase 0 | ✅ Complete | Project bootstrap: Tauri 2 + SolidJS + Tailwind v4 |
| Phase 1 | ✅ Complete | Desktop shell & window management |
| Phase 2 | ✅ Complete | UI shell & theming |
| Phase 3 | 🔄 Next | NIM integration & settings persistence |
| Phase 4 | ⬜ Pending | Streaming pipeline |
| Phase 5 | ⬜ Pending | Session orchestration & conversation memory |
| Phase 3 | ✅ Done | NIM integration & settings persistence |
| Phase 4 | ✅ Done | Streaming pipeline — SSE, events, cancel |
| Phase 5 | ✅ Done | Session orchestration & conversation memory |
| Phase 6 | ✅ Done | Settings panel & first-run experience |
| Phase 7 | ✅ Done | Edge cases, error handling & polish |
| Phase 7 | ⬜ Pending | Edge cases, error handling & polish |
| Phase 8 | ⬜ Pending | Testing, building & packaging |

---

## Environment

- OS: Windows 10/11
- Shell: bash (Git Bash / Cursor terminal)
- Rust PATH (bash): `/c/Users/Sheshank Gahlawat/.cargo/bin`
- Node: v22.22.0
- npm: 11.6.2
- Rust: 1.96.0
- Cargo: 1.96.0
- Tauri CLI: installed via `cargo install tauri-cli` or `npm`

---

## Phase 7 Notes (Edge Cases, Error Handling & Polish)

- `tauri-plugin-clipboard-manager v2.3.2` added to Cargo.toml + capabilities (`clipboard-manager:allow-write-text/read-text`) + plugin registered in `lib.rs`; `copyToClipboard` in `format.ts` uses Tauri plugin with `navigator.clipboard` fallback for dev context
- Hotkey failure: `shortcut.rs` now emits `hotkey:error` event when registration fails; `tauri-events.ts` listens and sets `setHotkeyRegistered(false)`; `StatusBar.tsx` shows `⚠ hotkey conflict` with yellow text when `hotkeyRegistered()` is false
- Auto-focus: `overlay:show` listener in `tauri-events.ts` uses `requestAnimationFrame` to focus the textarea immediately when the overlay becomes visible
- `window_manager.rs` now emits `overlay:show` and `overlay:hide` events from Rust when the window is shown/hidden via `show_overlay`/`hide_overlay` (including hotkey toggle) — keeps frontend `overlayVisible` signal in sync
- `ErrorView.tsx` now shows "Open Settings" button for `auth`, `config`, `model`, `model_missing` error types — clicking opens the settings panel without clearing the error
- `StatusBar.tsx` upgraded: tokens/s metric (token_count / elapsed_ms * 1000) shown after completion; hotkey warning dot; `animate-pulse` on checking dot
- `@tauri-apps/plugin-clipboard-manager` npm package installed

## Phase 6 Notes (Settings Panel & First-Run)

- `SettingsPanel.tsx` fully implemented: Connection (URL, API key, Test, Model), Appearance (theme), Behavior (hotkey, autostart toggle), Advanced (temperature, max tokens, timeout), Save/Reset
- Local `draft` signal in `SettingsPanel` — only flushed to Rust on Save; never mutates global `appSettings` directly except after successful save
- Test connection: calls `testConnection(url, key)`, populates model dropdown; auto-selects first model if current draft model is empty or not in list
- Hotkey editor: "listening" mode captures `keydown`, `buildShortcut()` converts browser KeyboardEvent → Tauri shortcut string (e.g. "Alt+Space"); requires at least one modifier; `updateHotkey` called immediately for live validation
- Theme toggle: 3-button row (dark/light/system); calls `applyThemeFromSettings` on Save
- Autostart: `winreg = "0.52"` added to Cargo.toml under `[target.'cfg(windows)'.dependencies]`; `toggle_autostart` command writes/deletes `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\particle0`
- First-run detection in `App.tsx` onMount: if `settings.nim_api_key || nim_model` is empty → `setSettingsOpen(true)` (opens settings panel automatically)
- `setAppSettings` signal now updated in `App.tsx` after `load_settings` and in `tauri-events.ts` after `settings:updated` event
- `settings:updated` event now also calls `setAppSettings` (was previously only applying theme)

## Phase 5 Notes (Session Orchestration & Conversation Memory)

- `submit_prompt` now checks `is_configured()` before accepting a request — returns a friendly error if NIM is not set up
- History size guard: `MAX_HISTORY_MESSAGES = 40` (20 turns); history is sliced to the most recent 39 messages before appending the new user turn — prevents context window overflow
- `clear_history` command: clears `AppState.conversation_history` without touching `multi_turn_enabled`; emits `session:history_cleared` to the frontend
- `get_turn_count` command: returns `history.len() / 2` (completed user+assistant pairs)
- `turnCount` signal in `session.ts` tracks turns on the frontend; incremented on `stream:end` when multi-turn is active; reset on `session:history_cleared` or multi-turn toggle-off
- Footer indicator: shows `turn N` (e.g. "turn 3") when in a multi-turn session with history, or "multi-turn" when no history yet
- `handleClear` in `Overlay.tsx` calls `clearHistory()` if multi-turn is active, resetting Rust-side history as well as frontend state
- Toggling multi-turn OFF: Rust side calls `conversation_history.clear()` inside `set_multi_turn`; frontend syncs `turnCount` to 0
- Multi-turn toggle button label changed: "memory on" vs "memory" for clarity

## Phase 4 Notes (Streaming Pipeline)

- State machine: `idle` → `connecting` (submit pressed) → `streaming` (first chunk) → `completed` / `cancelled` / `failed`
- `stream:start` event sets `connecting`; first `stream:chunk` upgrades to `streaming`
- `stream:cancelled` is a new Rust-emitted event (distinct from `stream:end`); fired when `cancel_requested` is true after the loop breaks; keeps partial text
- `cancel_requested` is reset to `false` in `AppState` after stream cleanup (Rust side)
- Multi-turn history is only appended on clean completion (not on cancel/error)
- `handleSubmit` in `Overlay.tsx` immediately sets `connecting` state + clears streamed text and error before awaiting the Tauri command — no waiting for `stream:start` event
- Connecting-state UI: three pulsing dots + "Connecting…" label shown while `sessionState === "connecting"` and before first token
- Token batching: emit every ≥16ms or ≥64 chars to balance responsiveness vs. IPC overhead
- `showAnswer` now includes `"connecting"` state so the placeholder dots appear immediately

## Phase 3 Notes (NIM Integration & Settings Persistence)

- `HealthCheckError` enum added to `nim_client.rs` — `NotFound` variant lets the startup pipeline skip `/v1/health/ready` gracefully (NVIDIA hosted NIM does not always expose this endpoint)
- Startup validation pipeline in `lib.rs` (`validate_nim_backend`): health check (404 = non-fatal) → list models → check configured model exists → emit `backend:ready` or `backend:unavailable`
- `BackendStatus` updated in `AppState` at each step so `get_backend_status` command always reflects current state
- `test_connection` now returns a typed `ConnectionTestResult` struct (`success`, `models`, `error`) instead of raw `serde_json::Value`
- `get_backend_status` command added — called on frontend mount to sync initial status before events arrive (covers window-open race)
- `save_settings` re-triggers `validate_nim_backend` in a background task after storing new settings
- `tauri-events.ts` updated: `backend:unavailable` maps `reason_type == "model_missing"` → `"model_missing"` status, otherwise `"unreachable"`
- `App.tsx` calls `get_backend_status` + `load_settings` on mount to hydrate frontend state immediately
- `cargo check`: 0 errors, 4 expected warnings (unused future-phase fields); `tsc --noEmit`: 0 errors

## Phase 2 Notes (UI Shell & Theming)

- `ResizeObserver` on the overlay card div → debounced `resize_overlay(height + 2)` call every 40ms keeps the Tauri window tight to the content
- Height state machine: `idle→collapsed`, `queued/connecting/streaming→streaming`, anything else→`completed`; driven by `createEffect` in `Overlay.tsx`
- Multi-turn toggle: button in header, also echoes small badge in footer when enabled; syncs to Rust via `set_multi_turn` command
- Submit button doubles as a Stop button (shows square icon) when a request is active
- Global keyboard handler in `Overlay.tsx`: `Ctrl+L`=clear, `Ctrl+C`(no selection)=copy answer
- `Tab` key is trapped in the textarea — does not focus-leave the overlay
- `stream:error` event now correctly populates `errorInfo` signal with user-facing message + retryable flag
- `StatusBar` shows a pulsing "streaming" label during active requests; completion shows token count + elapsed time
- Dark theme active by default; light/system switchable via `[data-theme]` attribute on `<html>`
- Vite HMR confirmed working — component edits reflect in the running app without restart
- `animate-pulse` defined manually in `globals.css` (Tailwind v4 does not auto-generate it)

## Phase 1 Notes (Desktop Shell & Window Management)

- Window label is `"main"` — used in `window_manager.rs` via `app.get_webview_window("main")`
- First-time `cargo build` takes ~3-4 minutes (415 crates). Subsequent builds are incremental (seconds)
- Dev binary lives at `src-tauri/target/debug/particle0.exe`
- App launches with `npm run tauri dev` from `f:/Projects/particle0/particle0/`
- Window is `visible: true` in dev — in production it should be `false` (toggle via hotkey)
- `Alt+Space` global hotkey registered on startup — toggles overlay show/hide/focus
- `window_manager::show_overlay` positions on the monitor containing the mouse cursor
- `tauri::Emitter` and `tauri::Manager` traits must be explicitly imported wherever `.emit()` or `.state()` is called
- 6 compile warnings are all intentional (unused fields/methods to be wired in later phases)

## Phase 0 Notes (Bootstrap)

- Scaffolded with `create-tauri-app` using `solid-ts` template
- Tailwind v4 added via `@tailwindcss/vite` plugin (configured in `vite.config.ts`)
- Tailwind v4 uses `@theme {}` CSS-first config in `src/styles/globals.css` — NO `tailwind.config.js`
- `ChatMessage` struct is defined only in `state.rs` — `nim_client.rs` imports it from there
- Tauri `Emitter` trait must be explicitly imported: `use tauri::Emitter;` in any file calling `.emit()`
- Tauri `Manager` trait must be explicitly imported: `use tauri::Manager;` for `.state()`, `.get_webview_window()`, etc.
- `From<NimError> for tauri::ipc::InvokeError` cannot be implemented because Tauri has a blanket `From<T: Serialize>` — commands return `Result<T, String>` instead
- App entry point is `src/index.tsx` (not `main.tsx` — Tauri scaffold uses `index.tsx`)
- Window label is `"main"` (Tauri scaffold default, used in `window_manager.rs`)
- Rust warnings about unused fields/methods are expected — they will be used in later phases

## Important Notes

- The bash shell in Cursor does NOT have Rust in PATH by default. Always prepend: `export PATH="/c/Users/Sheshank Gahlawat/.cargo/bin:$PATH"` or source `~/.bashrc` first.
- The NVIDIA API key file is at `f:\Projects\particle0\nvidia-api-key.txt` — never commit this file.
- Default hotkey: `Alt+Space`
- Default overlay width: 780px (fixed in V1)
- Window is pre-created and toggled visible/hidden — never destroyed/recreated — for <150ms open time.
- Tailwind v4 uses CSS-first config: `@theme {}` block in `globals.css`, no `tailwind.config.js`.
