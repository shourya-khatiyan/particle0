# particle0 — Project Walkthrough

A beginner-friendly guide to understanding, running, and modifying this project.

---

## What is particle0?

particle0 is a **Windows desktop AI overlay** — think of it like macOS Spotlight, but for AI. You press a global hotkey (Alt+Space by default), a small floating window appears on screen, you type a question, and it streams an answer from NVIDIA's NIM API in real time.

Key features:
- Global hotkey to summon/dismiss (works from any app)
- Streaming responses (tokens appear as they arrive)
- Multi-turn conversation memory (optional)
- Dark/light/system theme
- Windows autostart via registry
- NSIS installer for distribution

---

## Architecture Overview

particle0 is built with **Tauri 2**, which combines a Rust backend with a web frontend in a single desktop app.

```
+---------------------------------------------------+
|                   Windows OS                       |
+---------------------------------------------------+
        |                           |
+----------------+         +------------------+
|  Rust Backend  |         |  SolidJS Frontend|
|  (src-tauri/)  |  <--->  |  (src/)          |
|                |  IPC    |                  |
|  - NIM client  | Commands|  - Overlay UI    |
|  - Settings    | & Events|  - Prompt input  |
|  - Hotkey      |         |  - Streamed text |
|  - Window mgmt |         |  - Settings panel|
+----------------+         +------------------+
        |
        v
+-------------------+
|  NVIDIA NIM API   |
|  (cloud/self-host)|
+-------------------+
```

### How Rust and Frontend Talk

There are two communication channels:

1. **Commands** (Frontend calls Rust): The frontend uses `invoke("command_name", { args })` to call Rust functions. These are defined in `commands.rs` and registered in `lib.rs`.

2. **Events** (Rust notifies Frontend): Rust uses `app.emit("event:name", payload)` to push data to the frontend. The frontend listens with `listen("event:name", callback)`.

---

## Prerequisites

Before you can run this project, you need:

1. **Rust** (latest stable) — https://rustup.rs
2. **Node.js** (v18+) — https://nodejs.org
3. **Visual Studio Build Tools** (Windows) — Rust needs the MSVC toolchain
4. **An NVIDIA NIM API key** — https://build.nvidia.com (free tier available)

Verify your setup:
```bash
rustc --version    # Should show 1.7x+
node --version     # Should show v18+
npm --version      # Should show 9+
```

---

## How to Run in Development

```bash
# From the project root
cd particle0

# Install frontend dependencies
npm install

# Run the full app (Rust backend + frontend dev server)
npm run tauri dev
```

This does three things automatically:
1. Starts Vite dev server on port 1420 (hot-reload for frontend changes)
2. Compiles the Rust backend (first build takes 2-5 minutes)
3. Opens the app window

After the first build, subsequent `tauri dev` starts are fast (incremental compilation).

### Development Tips

- **Frontend changes** (`.tsx`, `.css`): Hot-reloads instantly, no restart needed
- **Rust changes** (`.rs`): The app auto-restarts when you save a Rust file
- **Console output**: Rust `println!` and `log::` output appears in the terminal where you ran `tauri dev`
- **DevTools**: Right-click the overlay window and select "Inspect Element" (only in debug builds)

---

## How to Build for Production

```bash
cd particle0
npm run tauri build
```

This produces:
- `src-tauri/target/release/particle0.exe` — the standalone binary
- `src-tauri/target/release/bundle/nsis/particle0_0.1.0_x64-setup.exe` — the installer

The release build is optimized for size (LTO, stripped symbols, abort on panic).

---

## Project Structure Explained

```
particle0/
├── particle0-plan.md          # Original product spec
├── WALKTHROUGH.md             # This file
└── particle0/                 # The actual Tauri app
    ├── package.json           # Frontend deps & scripts
    ├── index.html             # HTML shell (mount point)
    ├── vite.config.ts         # Bundler config
    ├── tsconfig.json          # TypeScript config
    ├── src/                   # Frontend (SolidJS + TypeScript)
    │   ├── index.tsx          # App bootstrap (renders <App/>)
    │   ├── App.tsx            # Root: sets up events, theme, ResizeObserver
    │   ├── components/        # UI components
    │   │   ├── Overlay.tsx    # Main card (header, input, answer, footer)
    │   │   ├── PromptInput.tsx# Textarea with submit/cancel/escape
    │   │   ├── StreamedAnswer.tsx # Markdown-rendered streaming answer
    │   │   ├── SettingsPanel.tsx  # Full settings form
    │   │   ├── ErrorView.tsx     # Error display with retry
    │   │   └── StatusBar.tsx     # Connection status footer
    │   ├── signals/           # Reactive state (SolidJS signals)
    │   │   ├── session.ts     # Prompt lifecycle state machine
    │   │   ├── settings.ts    # App config & theme
    │   │   └── overlay.ts     # Window visibility & height
    │   ├── lib/               # Utilities & Rust bridge
    │   │   ├── tauri-commands.ts  # Typed invoke() wrappers
    │   │   ├── tauri-events.ts    # Event listener setup
    │   │   ├── api-types.ts       # Shared TypeScript types
    │   │   └── format.ts          # Formatting & clipboard
    │   └── styles/            # CSS
    │       ├── globals.css    # Tailwind + design tokens + themes
    │       └── overlay.css    # Overlay-specific animations
    └── src-tauri/             # Rust backend
        ├── Cargo.toml         # Rust dependencies
        ├── build.rs           # Tauri build script
        ├── tauri.conf.json    # Window config, bundle config, CSP
        ├── capabilities/      # Permission declarations
        │   └── default.json   # What the frontend is allowed to do
        └── src/               # Rust source
            ├── main.rs        # Binary entry point (6 lines)
            ├── lib.rs         # App setup, plugin init, NIM validation
            ├── commands.rs    # All 15 Tauri command handlers
            ├── nim_client.rs  # NVIDIA NIM HTTP client
            ├── stream_parser.rs # SSE byte-stream parser
            ├── settings.rs    # Settings load/save/validate
            ├── state.rs       # Central AppState struct
            ├── errors.rs      # Error types + user-facing messages
            ├── shortcut.rs    # Global hotkey management
            └── window_manager.rs # Show/hide/resize/position
```

---

## How the Rust Backend Works

### Module-by-Module

#### `main.rs` — Entry Point
Just calls `particle0_lib::run()`. The `windows_subsystem = "windows"` attribute hides the console window in release builds.

#### `lib.rs` — App Bootstrap
Sets up the Tauri app:
1. Registers plugins (clipboard, opener, global shortcut)
2. Creates the shared `AppState` wrapped in a `Mutex`
3. Loads settings from disk
4. Registers the global hotkey
5. Spawns background NIM validation
6. Registers all command handlers

#### `commands.rs` — Frontend Bridge
Every function the frontend can call. The big one is `submit_prompt`:
1. Validates the prompt isn't empty
2. Checks no other request is active
3. Builds the message array (with history if multi-turn)
4. Emits `stream:start`
5. Spawns a tokio task that streams tokens and emits `stream:chunk` events
6. On completion, emits `stream:end` and updates history

#### `nim_client.rs` — HTTP Client
Talks to NVIDIA NIM (OpenAI-compatible API):
- `check_health()` — pings the health endpoint
- `list_models()` — GET /models to see available models
- `chat_completion_stream()` — POST /chat/completions with `stream: true`

#### `stream_parser.rs` — SSE Parser
Converts raw HTTP byte chunks into structured `StreamChunk`s:
- Buffers partial lines across chunk boundaries
- Parses `data: {...}` lines as JSON
- Extracts `choices[0].delta.content` tokens
- Handles `data: [DONE]` as stream termination

#### `settings.rs` — Configuration
- Loads/saves JSON to `%APPDATA%/com.particle0.app/settings.json`
- Validates URLs, temperature range, timeout bounds
- Defines all configurable fields with sensible defaults

#### `state.rs` — Shared State
A single `AppState` struct holding:
- Current settings
- Backend connection status
- Active request tracking
- Conversation history
- Cancellation flag

#### `errors.rs` — Error Handling
- `NimError` enum for all possible failures
- `UserFacingError` maps technical errors to human-readable messages
- Each error has a type string and retryable flag

#### `shortcut.rs` — Hotkey
Registers/unregisters global keyboard shortcuts using the Tauri global-shortcut plugin.

#### `window_manager.rs` — Window Control
- Positions the overlay on the monitor where the cursor is
- Centers horizontally, places at 18% from top
- Handles show/hide/toggle/resize with proper focus management

---

## Key Rust Concepts Used

### Mutex (Mutual Exclusion)
```rust
.manage(Mutex::new(AppState::default()))
```
All Tauri commands run on different threads. `Mutex` ensures only one thread can read/write the state at a time. You lock it with `.lock().unwrap()` and it auto-unlocks when the variable goes out of scope.

### async/await + tokio
```rust
tokio::spawn(async move { ... });
```
HTTP calls are asynchronous (they don't block the thread while waiting). `tokio` is the async runtime that manages these tasks. `spawn` launches a background task.

### Tauri Commands
```rust
#[tauri::command]
pub fn my_command(state: State<'_, Mutex<AppState>>) -> Result<String, String> { ... }
```
Functions decorated with `#[tauri::command]` can be called from the frontend via `invoke("my_command")`. Tauri automatically serializes/deserializes arguments and return values as JSON.

### Tauri Events
```rust
app.emit("stream:chunk", serde_json::json!({ "token": "Hello" }));
```
Events push data from Rust to the frontend. The frontend listens with `listen("stream:chunk", callback)`.

### serde (Serialization)
```rust
#[derive(Serialize, Deserialize)]
pub struct AppSettings { ... }
```
`serde` automatically converts Rust structs to/from JSON. This is how settings are saved to disk and how data crosses the Rust/frontend boundary.

### thiserror
```rust
#[derive(thiserror::Error)]
pub enum NimError {
    #[error("NIM server unreachable: {0}")]
    NetworkError(String),
}
```
Generates the `Display` trait implementation from the `#[error("...")]` attribute, so errors can be printed as human-readable strings.

---

## Common Tasks

### Adding a New Tauri Command

1. **Define the function** in `commands.rs`:
```rust
#[tauri::command]
pub fn my_new_command(state: State<'_, Mutex<AppState>>, arg: String) -> Result<String, String> {
    let s = state.lock().unwrap();
    Ok(format!("Got: {}", arg))
}
```

2. **Register it** in `lib.rs`:
```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    commands::my_new_command,
])
```

3. **Add a frontend wrapper** in `src/lib/tauri-commands.ts`:
```typescript
export function myNewCommand(arg: string): Promise<string> {
  return invoke("my_new_command", { arg });
}
```

4. **Call it** from a component:
```typescript
const result = await myNewCommand("hello");
```

### Adding a New Event (Rust to Frontend)

1. **Emit from Rust**:
```rust
let _ = app.emit("my:event", serde_json::json!({ "data": "value" }));
```

2. **Listen in frontend** (`src/lib/tauri-events.ts`):
```typescript
listen<{ data: string }>("my:event", (event) => {
  console.log(event.payload.data);
}),
```

### Changing the UI

All UI lives in `src/components/`. The app uses:
- **SolidJS** for reactivity (signals, createEffect, Show)
- **Tailwind CSS v4** for styling (utility classes)
- **CSS custom properties** for theming (defined in `globals.css`)

To change the overlay appearance, edit `Overlay.tsx`. To change how streaming text is rendered, edit `StreamedAnswer.tsx`.

### Adding a New Setting

1. Add the field to `AppSettings` in `src-tauri/src/settings.rs`
2. Add the same field to `AppSettings` interface in `src/lib/api-types.ts`
3. Add a default value in both `impl Default for AppSettings` and `DEFAULT_SETTINGS`
4. Add validation if needed in `settings.rs validate()`
5. Add a UI control in `src/components/SettingsPanel.tsx`

---

## Running Tests

```bash
cd particle0/src-tauri
cargo test
```

Tests cover: error types, stream parsing, settings validation, NIM client URL construction.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `cargo build` fails | Ensure Visual Studio Build Tools are installed with "C++ build tools" workload |
| App opens but NIM calls fail | Check your API key in Settings, verify the model name matches what's available |
| Hotkey doesn't work | Another app may have claimed Alt+Space; change it in Settings |
| Window doesn't appear | Check if it's on another monitor; try toggling with the hotkey |
| Frontend changes don't show | Hard refresh with Ctrl+Shift+R in the dev tools |

---

## Useful Commands

```bash
# Check Rust code compiles without full build
cargo check

# Run tests
cargo test

# Build release binary only (no installer)
cargo build --release

# Full production build with installer
npm run tauri build

# Format Rust code
cargo fmt

# Lint Rust code
cargo clippy
```
