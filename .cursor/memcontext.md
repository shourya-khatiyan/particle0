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
| Phase 1 | 🔄 Next | Desktop shell & window management |
| Phase 2 | ⬜ Pending | UI shell & theming |
| Phase 3 | ⬜ Pending | NIM integration & settings persistence |
| Phase 4 | ⬜ Pending | Streaming pipeline |
| Phase 5 | ⬜ Pending | Session orchestration & conversation memory |
| Phase 6 | ⬜ Pending | Settings panel & first-run experience |
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
