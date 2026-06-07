# Desktop Agent V1 Plan

## Product definition
The product is a Windows desktop AI overlay assistant with a Spotlight-like interaction model: a global hotkey opens a compact floating window, the user types a prompt, the app streams the answer inline, and the overlay dismisses instantly when the interaction ends.

Tauri 2 is suitable for this because window customization and runtime control are first-class features, and plugin capabilities allow privileged behaviors such as global shortcut registration to be exposed only to the windows that need them.[web:10][web:13][web:56][web:60]

## User promise
The user experience should feel like:

- Instant summon
- Immediate input focus
- Live streamed answer
- Minimal visual overhead
- Instant exit back to work

The NIM backend should act as a single inference endpoint for V1 through chat completions, with model availability discovered from the `/v1/models` endpoint so the app can validate configuration at startup or settings time.[web:9][web:55][web:57]

## System architecture
The V1 architecture should be divided into six clear layers so the codebase stays extensible and each responsibility is isolated.

### 1. Desktop shell layer
This layer owns Tauri application setup, window creation, app lifecycle, global shortcut registration, capabilities, and desktop event dispatch. Tauri 2 capabilities are the enforcement boundary here, and permissions should be assigned per window through files in `src-tauri/capabilities/`.[web:56][web:58][web:60]

### 2. Window controller layer
This layer controls the overlay window: create, show, hide, focus, center on screen, restore if hidden, and resize when content grows. Tauri supports configuration through `tauri.conf.json`, JavaScript APIs, and Rust window control, which gives enough flexibility to start with config defaults and move dynamic behavior into Rust as needed.[web:13]

### 3. Inference client layer
This layer wraps NVIDIA NIM HTTP communication. It should manage base URL, API key, selected model, request building, model list fetch, health check, error mapping, and streamed token parsing from `/v1/chat/completions`.[web:9][web:49][web:57]

### 4. Session orchestration layer
This layer manages a single prompt lifecycle:

- User submits prompt
- Request object is built
- Stream starts
- Chunks are appended
- Final answer is committed
- UI status is updated

It should be independent of the frontend framework so that later UI surfaces can reuse the same logic.

### 5. UI rendering layer
This layer displays:

- Input field
- Submit state
- Streaming answer
- Loading and error states
- Small action row such as copy and close
- Optional expand button

### 6. Configuration layer
This layer manages local app settings:

- NIM base URL
- API key
- Selected model
- Hotkey string
- Theme preference
- Startup behavior
- Overlay width/position preset

Because Tauri capabilities and plugin permissions are explicit, configuration touching privileged actions should be validated before being applied.[web:56][web:60]

## Technical stack plan

### Desktop framework
Use Tauri 2.0 as the application shell. It provides plugin-based desktop capabilities, configurable windows, and cross-platform architecture for future macOS support.[web:10][web:13][web:56]

### Backend language
Use Rust for:

- Global shortcut registration
- Window lifecycle management
- HTTP calls to NIM
- SSE or stream chunk handling
- App configuration
- Event emission to frontend

### Frontend
Use **SolidJS + TypeScript + Vite** for the frontend. Tauri is frontend-agnostic and supports Vite-based SPA frontends such as Solid, React, Vue, and Svelte, which makes this stack a clean fit for a desktop overlay app.[web:62][web:65][web:77]

SolidJS is especially suitable here because its signal-based fine-grained reactivity updates only the parts of the UI that change, which matches streaming answers, compact overlay state, and low-overhead rendering in an always-ready desktop assistant.[web:71][web:74][web:76]

The frontend should therefore be built as a small Solid app responsible only for rendering, transient UI state, and subscribing to Rust-emitted events, while Rust continues to own window control, inference calls, streaming orchestration, settings validation, and desktop integrations.[web:62][web:65]

### AI backend
Use NVIDIA NIM through the OpenAI-compatible `POST /v1/chat/completions` endpoint, with `GET /v1/models` used for startup validation and settings UI population. Optionally use `/v1/health/ready` as a lightweight backend readiness check during startup or settings validation.[web:9][web:49][web:57][web:92]

## Repository structure
A clean project structure should look like this:

```text
desktop-agent/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .env.example
├── README.md
├── docs/
│   ├── architecture.md
│   ├── flows.md
│   └── setup.md
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Overlay.tsx
│   │   ├── PromptInput.tsx
│   │   ├── StreamedAnswer.tsx
│   │   ├── StatusBar.tsx
│   │   ├── ErrorView.tsx
│   │   └── SettingsPanel.tsx
│   ├── signals/
│   │   ├── overlay.ts
│   │   ├── session.ts
│   │   └── settings.ts
│   ├── lib/
│   │   ├── tauri-events.ts
│   │   ├── tauri-commands.ts
│   │   ├── api-types.ts
│   │   └── format.ts
│   ├── styles/
│   │   ├── globals.css
│   │   └── overlay.css
│   └── vite-env.d.ts
└── src-tauri/
    ├── tauri.conf.json
    ├── capabilities/
    │   ├── default.json
    │   └── overlay.json
    └── src/
        ├── main.rs
        ├── window_manager.rs
        ├── shortcut.rs
        ├── nim_client.rs
        ├── stream_parser.rs
        ├── commands.rs
        ├── settings.rs
        ├── state.rs
        └── errors.rs
```

This structure keeps platform control and inference logic on the Rust side and UI concerns on the frontend side.

## Window design plan

### Overlay window
The overlay is the main product surface. It should be:

- Frameless
- Always-on-top
- Compact width
- Rounded and shadowed
- Centered on screen
- Hidden by default
- Focused immediately when shown

Window behavior should use Tauri customization features and runtime control to maintain a polished desktop feel.[web:13]

### Overlay size states
Use three UI height states:

- `collapsed`: input only
- `streaming`: input + active answer region
- `completed`: input + answer + mini action row

The width can be fixed for V1, for example 720–820 px, while the height grows until a max threshold and then makes the answer region scroll.

### Focus rules
On overlay open:

- Window becomes visible
- Window gets focus
- Text input is focused
- Previous answer can remain visible or be reset according to chosen UX rule

On overlay dismiss:

- Pending stream remains tied to session state
- Overlay hides
- No abrupt app exit
- Reopening restores the app fast

## Global hotkey plan

### Hotkey registration
Use Tauri’s global shortcut plugin for system-wide activation. Tauri 2 requires plugin permissions to be declared in capabilities, so the app should include explicit registration and unregistration permission entries for the window that owns this behavior.[web:10][web:56][web:60]

### Initial default
Use a default Windows-friendly shortcut such as `Alt+Space` or `Ctrl+Shift+Space`, with runtime validation in case the shortcut is already reserved or unavailable.

### Hotkey actions
When hotkey is pressed:

- If overlay is hidden, show and focus it
- If overlay is visible and focused, dismiss it
- If overlay is visible but unfocused, focus it
- If overlay is minimized or obscured, restore and focus it

The hotkey handler belongs in Rust or in the Tauri plugin JS bridge, but the actual show/hide/focus policy should be centralized in one window manager module.

## NVIDIA NIM integration plan

### Configuration model
The app should support these settings:

- `NIM_BASE_URL`
- `NIM_API_KEY`
- `NIM_MODEL`
- Optional timeout
- Optional max token cap
- Temperature preset

### Startup validation
On startup or first-run setup:

1. Load configuration
2. Attempt `GET /v1/models`
3. Optionally check `/v1/health/ready`
4. Verify the configured model exists
5. Store a backend-ready state

NIM exposes `GET /v1/models` for available models, `/v1/health/ready` for readiness, and `POST /v1/chat/completions` for inference, so validation should be based on the actual endpoint rather than hardcoded assumptions.[web:9][web:49][web:57][web:92]

### Request format
Each prompt request should be sent as a chat completion request with:

- `model`
- `messages` array
- `stream: true`
- Optional temperature
- Optional max tokens

NIM documents the OpenAI-compatible chat completion flow and supports streaming on the same endpoint.[web:55][web:57]

### Streaming parser
The stream layer should:

- Read incremental response chunks
- Parse event/data boundaries
- Extract delta content
- Append tokens to an in-memory answer buffer
- Emit updates to the frontend in small, smooth batches

This parser should be isolated in its own Rust module so it can later be reused by other views.

## Prompt lifecycle plan
Each prompt should move through a formal lifecycle.

### States
- `idle`
- `queued`
- `connecting`
- `streaming`
- `completed`
- `failed`
- `cancelled`

### Flow
1. User types prompt.
2. User submits.
3. UI locks submit and marks session `queued`.
4. Rust backend builds request.
5. Session becomes `connecting`.
6. HTTP connection opens.
7. First token arrives, session becomes `streaming`.
8. Tokens are appended progressively.
9. Stream completes, session becomes `completed`.
10. Metadata such as elapsed time and token count may be stored.

### Cancellation
The lifecycle should support manual cancel:

- User presses Escape while streaming, or clicks stop
- Backend aborts HTTP stream
- Session transitions to `cancelled`
- Partial answer remains visible

This is important because long responses should not trap the user.

## UI plan

### Main regions
The overlay UI should have these regions:

1. **Header strip**
   - App icon
   - Subtle status dot
   - Optional settings button
   - Optional expand button

2. **Prompt input**
   - Single-line input that can grow to 2–3 lines
   - Enter submits
   - Shift+Enter inserts newline if multiline is enabled
   - Placeholder explaining the main use

3. **Answer region**
   - Rendered plain text or markdown-lite
   - Streaming cursor effect optional
   - Smooth height expansion

4. **Footer row**
   - Copy answer
   - Clear
   - Close
   - Connection/model indicator

### Visual design
The V1 overlay should look like a polished desktop utility:

- Glass or matte card aesthetic
- Subtle drop shadow
- Strong typography
- High contrast
- Low clutter
- No sidebar, no chat bubbles

### Themes
Support:

- Dark theme
- Light theme
- Follow-system option

## Input behavior plan

### Basic input rules
- Text input focused on open
- Enter submits when not streaming
- Ctrl/Cmd+A selects all
- Escape dismisses when idle or completed
- Escape cancels stream first if currently streaming

### Prompt reuse
After completion, the prompt should remain editable so the user can:

- Tweak and resubmit
- Copy the original text
- Ask a follow-up manually

### Empty prompt handling
If user submits an empty or whitespace-only prompt:

- Do not send request
- Show subtle inline validation
- Keep focus in input

## Output rendering plan

### Rendering format
For V1, render:

- Paragraphs
- Code blocks
- Inline code
- Bullet points

Use a lightweight markdown renderer or a custom safe formatter.

### Code handling
If the response contains code:

- Render in monospaced block
- Allow copy button
- Preserve indentation
- Support horizontal scroll if needed

### Long output handling
When the answer exceeds overlay height:

- Answer panel becomes scrollable
- Input stays pinned at top
- Footer actions remain visible

## Settings plan

### Settings fields
Create a settings panel with:

- NIM base URL
- API key
- Model selector
- Hotkey editor
- Theme selector
- Launch on startup toggle
- Reset to defaults action
- Test connection action

### Test connection flow
When user clicks test connection:

1. Send `GET /v1/models`
2. Optionally check `/v1/health/ready`
3. Show success/failure status
4. Populate model dropdown on success

This should be the canonical backend health check and validation path because NIM documents model listing and readiness as standard endpoints.[web:9][web:49][web:57][web:92]

### Settings persistence
Persist settings locally using either a validated Rust-managed config file or Tauri Store, depending on implementation preference. The Tauri Store plugin is a valid option for persistent key-value settings and requires explicit plugin permissions in capabilities.[web:89][web:91][web:94]

## Error handling plan

### Error classes
Represent errors in user-friendly buckets:

- Configuration error
- Network error
- Authentication error
- Invalid model error
- Streaming parse error
- Request timeout
- Unknown server error

### UI error behavior
When an error happens:

- Keep overlay visible
- Show concise human-readable message
- Preserve the prompt
- Allow retry immediately

### Example error states
- Missing API key → “Add your NIM API key in Settings.”
- Base URL unreachable → “Cannot reach the model server.”
- Model missing → “Selected model is not available on this endpoint.”
- Stream interrupted → “Response stopped before completion.”

## State management plan

### Rust-side app state
Rust should maintain:

- Backend readiness
- Current settings
- Current active request ID
- Current stream status
- Overlay visibility state

### Frontend state
Frontend should maintain:

- Input value
- Rendered output text
- Local UI animation flags
- Scroll position
- Current visual status

This split prevents frontend state loss during window show/hide and makes later multi-view expansion easier.

## Event system plan
Use a structured event contract between Rust and frontend.

### Rust to frontend events
- `overlay:show`
- `overlay:hide`
- `stream:start`
- `stream:chunk`
- `stream:end`
- `stream:error`
- `settings:updated`
- `backend:ready`
- `backend:unavailable`

### Frontend to Rust commands
- `submit_prompt`
- `cancel_prompt`
- `test_connection`
- `save_settings`
- `load_settings`
- `toggle_overlay`
- `show_overlay`
- `hide_overlay`

Tauri’s permission/capability model should scope access to these commands explicitly where relevant.[web:56][web:58][web:60]

## First-run experience plan

### First launch flow
If settings are incomplete:

1. Open onboarding/settings view
2. Request NIM base URL, API key, model
3. Test connection
4. Enable hotkey
5. Finish setup
6. App minimizes to background-ready state

### Ready state
Once setup is complete:

- App launches silently
- Overlay stays hidden until hotkey
- Optional tray integration can be used for background presence and quick actions if you choose to implement it later using Tauri’s system tray support.[web:90][web:93][web:95]

## Core user flows

### Flow 1: first-time setup
- Install app
- Launch app
- Onboarding/settings opens
- User enters NIM details
- App validates model endpoint
- Setup completes
- Overlay becomes available

### Flow 2: normal quick ask
- User presses hotkey
- Overlay opens
- User types prompt
- App streams answer
- User reads/copies
- User dismisses overlay

### Flow 3: follow-up ask
- User keeps overlay open
- Edits prompt or writes another one
- App submits again
- Answer area updates

### Flow 4: reopen after hidden
- User presses hotkey again later
- Overlay appears quickly
- Input is focused
- Prior state restored according to chosen session policy

### Flow 5: backend failure during usage
- User submits prompt
- Request fails
- Inline error shown
- User opens settings or retries
- Connection restored

## Edge case plan

### Hotkey collision
If the configured hotkey cannot register:

- App should show a settings warning
- Registration status should be visible
- User should be able to choose another shortcut

Tauri plugin permission and registration handling need to be wired clearly here because global shortcut behavior depends on correct plugin setup and permissions.[web:10][web:56][web:60]

### Hidden window but active stream
If the window is dismissed while streaming:

- Request may continue unless explicitly cancelled
- Reopening shows current stream state
- Partial output remains visible

### App starts without internet
- Backend state marked unavailable
- Overlay still opens
- Submitting shows actionable error
- Settings allow retrying connectivity

### Invalid model configured
At startup validation:

- Configured model absent from `/v1/models`
- Backend marked misconfigured
- Settings prompt user to select a valid model[web:9][web:57]

### Rapid repeated submits
If the user presses Enter repeatedly:

- Only one active request should exist
- Input submit path should debounce or lock until state changes

### Large response burst
If many chunks arrive rapidly:

- Batch UI updates on a short interval
- Avoid re-rendering every token individually

### Long text in prompt
If prompt exceeds visual input size:

- Input grows until max height
- Then internal scrolling begins

### App relaunch during prior incomplete state
- Settings reload
- Stale active request IDs are discarded
- Clean idle state is restored

## Quality plan

### Performance targets
- Overlay visible in under 150 ms after hotkey on a warm app
- Input focused immediately
- First visible token as early as backend/network allows
- Smooth streaming without janky reflow

### Reliability targets
- Hotkey registers on startup reliably
- Overlay state never desynchronizes
- Network failures degrade cleanly
- Settings survive restarts

### UX quality targets
- No modal clutter
- No heavy transitions
- No window flicker
- No confusing chat history model in V1

## Security and permissions plan

### Tauri capabilities
Create capability files in `src-tauri/capabilities/` and explicitly allow only the desktop features required by the overlay window and settings interactions. Tauri capabilities define which windows get which permissions, and plugin permissions must be granted intentionally rather than assumed.[web:56][web:58][web:60]

### Global shortcut permissions
Grant the required global shortcut permissions to the main/overlay capability so the app can register and unregister the chosen shortcut.[web:10][web:56][web:60]

### Secret handling
Store API keys in a local config mechanism appropriate for desktop use, with care around file permissions and exposure in logs. The app should never emit secrets to frontend logs or crash reports.

## Milestone plan

### Milestone 1: shell and window
- Bootstrap Tauri 2 app
- Configure overlay window
- Implement show/hide/focus behavior
- Define capabilities files
- Register default hotkey

### Milestone 2: input and UI shell
- Build overlay UI
- Implement input interactions
- Add theme support
- Add answer container and status row

### Milestone 3: NIM connection
- Build Rust NIM client
- Implement `/v1/models` connectivity check
- Implement `/v1/chat/completions` request
- Add settings persistence

### Milestone 4: streaming
- Add streaming parser
- Emit chunk events to frontend
- Render streamed output progressively
- Support cancellation

### Milestone 5: settings and first-run flow
- Add settings panel
- Add connection test
- Add model selector
- Add onboarding when config is incomplete

### Milestone 6: polish
- Refine keyboard behavior
- Handle edge cases
- Tune performance
- Final UX cleanup

## Build checklist
- Tauri app skeleton created
- Overlay window customized and centered
- Global shortcut plugin installed and permitted
- Capability files configured
- Settings load/save implemented
- NIM model list fetch works
- NIM streaming chat completion works
- Streamed text reaches frontend correctly
- Error states handled
- First-run flow completed
- Hotkey open/close cycle feels instant

## Sources
Use these as the primary references while building:

- Tauri global shortcut plugin: https://v2.tauri.app/plugin/global-shortcut/ [web:10]
- Tauri capabilities: https://v2.tauri.app/security/capabilities/ [web:56]
- Tauri plugin permissions: https://v2.tauri.app/learn/security/using-plugin-permissions/ [web:60]
- Tauri permission reference: https://v2.tauri.app/reference/acl/permission/ [web:58]
- Tauri window customization: https://v2.tauri.app/learn/window-customization/ [web:13]
- Tauri Store plugin: https://v2.tauri.app/plugin/store/ [web:89]
- Tauri system tray: https://v2.tauri.app/learn/system-tray/ [web:95]
- NVIDIA NeMo Microservices chat completions: https://docs.nvidia.com/nemo/microservices/latest/run-inference/nim-proxy/chat-completions.html [web:55]
- NVIDIA NIM LLM API reference: https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html [web:9]
