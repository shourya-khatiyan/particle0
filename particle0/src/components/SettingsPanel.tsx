/**
 * SettingsPanel — full settings UI with proper header, styled fields,
 * amber primary actions, and sticky footer.
 */
import { Component, Show, createSignal, onCleanup } from "solid-js";
import { appSettings, setAppSettings, applyThemeFromSettings } from "../signals/settings";
import { multiTurnEnabled, setMultiTurnEnabled } from "../signals/session";
import {
  testConnection,
  saveSettings,
  updateHotkey,
  toggleAutostart,
  setMultiTurn,
} from "../lib/tauri-commands";
import { DEFAULT_SETTINGS, DEFAULT_KEYBINDINGS, type AppSettings, type ThemePreference, type KeyBindings } from "../lib/api-types";

function buildShortcut(e: KeyboardEvent): string | null {
  const modifiers: string[] = [];
  if (e.ctrlKey) modifiers.push("Ctrl");
  if (e.altKey) modifiers.push("Alt");
  if (e.shiftKey) modifiers.push("Shift");
  if (e.metaKey) modifiers.push("Super");

  const skip = new Set(["Control", "Alt", "Shift", "Meta", "Super", "Unidentified"]);
  if (skip.has(e.key)) return null;
  if (modifiers.length === 0) return null;

  const keyMap: Record<string, string> = {
    " ": "Space", Escape: "Escape", Enter: "Enter", Backspace: "Backspace",
    Delete: "Delete", Tab: "Tab", ArrowUp: "Up", ArrowDown: "Down",
    ArrowLeft: "Left", ArrowRight: "Right", Home: "Home", End: "End",
    PageUp: "PageUp", PageDown: "PageDown",
  };
  const mapped = keyMap[e.key] ?? e.key.toUpperCase();
  return [...modifiers, mapped].join("+");
}

interface SettingsPanelProps {
  onClose: () => void;
}

const SettingsPanel: Component<SettingsPanelProps> = (props) => {
  const [draft, setDraft] = createSignal<AppSettings>({ ...appSettings() });
  const [testStatus, setTestStatus] = createSignal<"idle" | "testing" | "ok" | "error">("idle");
  const [testModels, setTestModels] = createSignal<string[]>([]);
  const [testError, setTestError] = createSignal<string>("");
  const [saveStatus, setSaveStatus] = createSignal<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = createSignal<string>("");
  const [showKey, setShowKey] = createSignal(false);
  const [advancedOpen, setAdvancedOpen] = createSignal(false);
  const [hotkeysOpen, setHotkeysOpen] = createSignal(false);
  const [capturingBinding, setCapturingBinding] = createSignal<keyof KeyBindings | "hotkey" | null>(null);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleTest = async () => {
    setTestStatus("testing");
    setTestError("");
    try {
      const result = await testConnection(draft().nim_base_url, draft().nim_api_key);
      if (result.success) {
        setTestStatus("ok");
        setTestModels(result.models);
        const cur = draft().nim_model;
        if (!cur || !result.models.includes(cur)) {
          set("nim_model", result.models[0] ?? "");
        }
      } else {
        setTestStatus("error");
        setTestError(result.error ?? "Connection failed");
      }
    } catch (e) {
      setTestStatus("error");
      setTestError(String(e));
    }
  };

  const handleSave = async () => {
    setSaveStatus("saving");
    setSaveError("");
    const d = draft();
    try {
      await saveSettings(d);
      setAppSettings(d);
      applyThemeFromSettings(d.theme);
      try { await toggleAutostart(d.launch_on_startup); } catch {}
      setSaveStatus("saved");
      setTimeout(() => {
        setSaveStatus("idle");
        props.onClose();
      }, 600);
    } catch (e) {
      setSaveStatus("error");
      setSaveError(String(e));
    }
  };

  const handleReset = () => {
    setDraft({ ...DEFAULT_SETTINGS });
    setTestStatus("idle");
    setTestModels([]);
  };

  let stopHotkeyCapture: (() => void) | undefined;

  const startCapture = (target: keyof KeyBindings | "hotkey") => {
    setCapturingBinding(target);
    const handler = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const shortcut = buildShortcut(e);
      if (!shortcut && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        stopHotkeyCapture?.();
        if (target === "hotkey") {
          set("hotkey", e.key);
          try { await updateHotkey(e.key); } catch {}
        } else {
          const kb = { ...(draft().keybindings ?? DEFAULT_KEYBINDINGS) };
          kb[target] = e.key;
          setDraft((prev) => ({ ...prev, keybindings: kb }));
        }
        return;
      }
      if (!shortcut) return;
      stopHotkeyCapture?.();
      if (target === "hotkey") {
        set("hotkey", shortcut);
        try { await updateHotkey(shortcut); } catch {}
      } else {
        const kb = { ...(draft().keybindings ?? DEFAULT_KEYBINDINGS) };
        kb[target] = shortcut;
        setDraft((prev) => ({ ...prev, keybindings: kb }));
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    stopHotkeyCapture = () => {
      window.removeEventListener("keydown", handler, { capture: true });
      setCapturingBinding(null);
      stopHotkeyCapture = undefined;
    };
  };

  onCleanup(() => stopHotkeyCapture?.());

  const inputCls = "w-full px-3 py-2 text-sm bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--glass-border-strong)] focus:ring-1 focus:ring-[var(--accent-soft)] transition-all duration-[var(--duration-fast)]";

  return (
    <div class="flex flex-col max-h-[480px]">
      {/* ── Header ── */}
      <div class="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border-subtle)]">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-[var(--text-primary)]">Settings</span>
        </div>
        <button
          onClick={props.onClose}
          class="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors duration-[var(--duration-fast)]"
          aria-label="Close settings"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="flex flex-col gap-6 px-5 py-4 selectable">

          {/* Connection section */}
          <Section title="Connection">
            <Field label="NIM Base URL">
              <input
                type="url"
                class={inputCls}
                value={draft().nim_base_url}
                onInput={(e) => set("nim_base_url", e.currentTarget.value)}
                placeholder="https://integrate.api.nvidia.com/v1"
                spellcheck={false}
              />
            </Field>

            <Field label="API Key">
              <div class="flex gap-2">
                <input
                  type={showKey() ? "text" : "password"}
                  class={`${inputCls} flex-1 font-mono text-xs`}
                  value={draft().nim_api_key}
                  onInput={(e) => set("nim_api_key", e.currentTarget.value)}
                  placeholder="nvapi-..."
                  spellcheck={false}
                  autocomplete="off"
                />
                <button
                  onClick={() => setShowKey(!showKey())}
                  class="px-3 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors duration-[var(--duration-fast)]"
                  aria-label={showKey() ? "Hide API key" : "Show API key"}
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                    <Show
                      when={showKey()}
                      fallback={
                        <path stroke-linecap="round" stroke-linejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      }
                    >
                      <path stroke-linecap="round" stroke-linejoin="round"
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </Show>
                  </svg>
                </button>
              </div>
            </Field>

            {/* Test connection */}
            <div class="flex items-center gap-3">
              <button
                onClick={handleTest}
                disabled={testStatus() === "testing" || !draft().nim_base_url || !draft().nim_api_key}
                class="btn-primary px-4 py-2 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {testStatus() === "testing" ? "Testing..." : "Test Connection"}
              </button>
              <Show when={testStatus() === "ok"}>
                <span class="text-xs text-[var(--color-success)] font-medium flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Connected ({testModels().length} models)
                </span>
              </Show>
              <Show when={testStatus() === "error"}>
                <span class="text-xs text-[var(--color-error)]" title={testError()}>Failed to connect</span>
              </Show>
            </div>

            <Field label="Model">
              <Show
                when={testModels().length > 0}
                fallback={
                  <input
                    type="text"
                    class={inputCls}
                    value={draft().nim_model}
                    onInput={(e) => set("nim_model", e.currentTarget.value)}
                    placeholder="e.g. meta/llama-3.1-8b-instruct"
                  />
                }
              >
                <select
                  class={inputCls}
                  value={draft().nim_model}
                  onChange={(e) => set("nim_model", e.currentTarget.value)}
                >
                  {testModels().map((m) => (
                    <option value={m} selected={m === draft().nim_model}>{m}</option>
                  ))}
                </select>
              </Show>
            </Field>
          </Section>

          {/* Behavior section */}
          <Section title="Behavior">
            <Field label="Theme">
              <div class="flex gap-1 p-1 bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
                {(["dark", "light", "system"] as ThemePreference[]).map((t) => (
                  <button
                    onClick={() => set("theme", t)}
                    class={`flex-1 py-1.5 text-xs font-medium capitalize transition-all duration-[var(--duration-fast)]
                      ${draft().theme === t
                        ? "bg-[var(--accent)] text-[var(--accent-text)] shadow-sm"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                      }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Launch on startup">
              <Toggle
                checked={draft().launch_on_startup}
                onChange={(v) => set("launch_on_startup", v)}
                label={draft().launch_on_startup ? "Enabled" : "Disabled"}
              />
            </Field>

            <Field label="Multi-turn conversation">
              <Toggle
                checked={multiTurnEnabled()}
                onChange={async (v) => {
                  setMultiTurnEnabled(v);
                  try { await setMultiTurn(v); } catch {}
                }}
                label={multiTurnEnabled() ? "Memory ON — context carries across prompts" : "Single-turn — each prompt is independent"}
              />
            </Field>
          </Section>

          {/* Global Hotkeys (collapsible) */}
          <div class="flex flex-col gap-3">
            <button
              onClick={() => setHotkeysOpen(!hotkeysOpen())}
              class="flex items-center gap-2 w-full group"
            >
              <span class="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">
                Global Hotkeys
              </span>
              <div class="flex-1 h-px bg-[var(--border-subtle)]" />
              <svg
                class={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-[var(--duration-fast)] ${hotkeysOpen() ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <Show when={hotkeysOpen()}>
              <div class="flex flex-col gap-3">
                <Field label="Overlay Toggle Hotkey">
                  <div class="flex gap-2 items-center">
                    <div class={`flex-1 px-3 py-2 text-sm border transition-all duration-[var(--duration-fast)] ${capturingBinding() === "hotkey"
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)]"}`}
                    >
                      {capturingBinding() === "hotkey" ? "Press shortcut..." : draft().hotkey}
                    </div>
                    <button
                      onClick={capturingBinding() === "hotkey" ? stopHotkeyCapture : () => startCapture("hotkey")}
                      class="btn-ghost px-3 py-2 text-xs font-medium"
                    >
                      {capturingBinding() === "hotkey" ? "Cancel" : "Change"}
                    </button>
                  </div>
                </Field>

                <BindingField
                  label="Focus Input"
                  bindingKey="focus_input"
                  value={(draft().keybindings ?? DEFAULT_KEYBINDINGS).focus_input}
                  capturing={capturingBinding()}
                  onStartCapture={startCapture}
                  onStopCapture={() => stopHotkeyCapture?.()}
                />
                <BindingField
                  label="Clear"
                  bindingKey="clear"
                  value={(draft().keybindings ?? DEFAULT_KEYBINDINGS).clear}
                  capturing={capturingBinding()}
                  onStartCapture={startCapture}
                  onStopCapture={() => stopHotkeyCapture?.()}
                />
                <BindingField
                  label="Toggle Memory/Single"
                  bindingKey="toggle_mode"
                  value={(draft().keybindings ?? DEFAULT_KEYBINDINGS).toggle_mode}
                  capturing={capturingBinding()}
                  onStartCapture={startCapture}
                  onStopCapture={() => stopHotkeyCapture?.()}
                />
                <BindingField
                  label="Copy Answer"
                  bindingKey="copy_answer"
                  value={(draft().keybindings ?? DEFAULT_KEYBINDINGS).copy_answer}
                  capturing={capturingBinding()}
                  onStartCapture={startCapture}
                  onStopCapture={() => stopHotkeyCapture?.()}
                />
                <BindingField
                  label="Toggle Settings"
                  bindingKey="toggle_settings"
                  value={(draft().keybindings ?? DEFAULT_KEYBINDINGS).toggle_settings}
                  capturing={capturingBinding()}
                  onStartCapture={startCapture}
                  onStopCapture={() => stopHotkeyCapture?.()}
                />
              </div>
            </Show>
          </div>

          {/* Advanced (collapsible) */}
          <div class="flex flex-col gap-3">
            <button
              onClick={() => setAdvancedOpen(!advancedOpen())}
              class="flex items-center gap-2 w-full group"
            >
              <span class="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">
                Advanced
              </span>
              <div class="flex-1 h-px bg-[var(--border-subtle)]" />
              <svg
                class={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-[var(--duration-fast)] ${advancedOpen() ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <Show when={advancedOpen()}>
              <div class="flex flex-col gap-3">
                <Field label={`Temperature — ${draft().temperature.toFixed(1)}`}>
                  <input
                    type="range"
                    min="0" max="2" step="0.1"
                    value={draft().temperature}
                    onInput={(e) => set("temperature", parseFloat(e.currentTarget.value))}
                    class="w-full accent-[var(--accent)]"
                  />
                  <div class="flex justify-between text-[10px] text-[var(--text-muted)]">
                    <span>Precise</span>
                    <span>Creative</span>
                  </div>
                </Field>

                <Field label="Max tokens (leave blank for default)">
                  <input
                    type="number"
                    class={inputCls}
                    value={draft().max_tokens ?? ""}
                    onInput={(e) => {
                      const v = e.currentTarget.value;
                      set("max_tokens", v ? parseInt(v) : null);
                    }}
                    placeholder="e.g. 2048"
                    min="1"
                    max="131072"
                  />
                </Field>

                <Field label="Request timeout (seconds)">
                  <input
                    type="number"
                    class={inputCls}
                    value={draft().request_timeout_secs}
                    onInput={(e) => set("request_timeout_secs", parseInt(e.currentTarget.value) || 30)}
                    min="5"
                    max="300"
                  />
                </Field>
              </div>
            </Show>
          </div>

        </div>
      </div>

      {/* ── Sticky footer ── */}
      <div class="flex items-center gap-2 px-5 py-3 border-t border-[var(--border-subtle)] flex-shrink-0">
        <button
          onClick={handleReset}
          class="btn-ghost px-3 py-2 text-xs font-medium"
        >
          Reset
        </button>
        <div class="flex-1" />
        <Show when={saveStatus() === "error"}>
          <span class="text-xs text-[var(--color-error)]" title={saveError()}>Save failed</span>
        </Show>
        <button
          onClick={handleSave}
          disabled={saveStatus() === "saving"}
          class="btn-primary px-5 py-2 text-xs font-semibold"
        >
          {saveStatus() === "saving" ? "Saving..." : saveStatus() === "saved" ? "Saved!" : "Save"}
        </button>
      </div>
    </div>
  );
};

const Section: Component<{ title: string; children: any }> = (props) => (
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{props.title}</span>
      <div class="flex-1 h-px bg-[var(--border-subtle)]" />
    </div>
    {props.children}
  </div>
);

const Field: Component<{ label: string; children: any }> = (props) => (
  <div class="flex flex-col gap-1.5">
    <label class="text-xs font-medium text-[var(--text-secondary)]">
      {props.label}
    </label>
    {props.children}
  </div>
);

const Toggle: Component<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = (props) => (
  <button
    onClick={() => props.onChange(!props.checked)}
    class="flex items-center gap-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
    role="switch"
    aria-checked={props.checked}
  >
    <div
      class={`relative w-8 h-[18px] transition-colors duration-[var(--duration-fast)] ${
        props.checked ? "bg-[var(--accent)]" : "bg-[var(--surface-elevated)] border border-[var(--border-subtle)]"
      }`}
    >
      <div
        class={`absolute top-[3px] w-3 h-3 shadow-sm transition-transform duration-[var(--duration-fast)] ${
          props.checked ? "translate-x-[14px] bg-[var(--accent-text)]" : "translate-x-[3px] bg-[var(--text-muted)]"
        }`}
      />
    </div>
    <span class="leading-tight">{props.label}</span>
  </button>
);

const BindingField: Component<{
  label: string;
  bindingKey: keyof KeyBindings;
  value: string;
  capturing: keyof KeyBindings | "hotkey" | null;
  onStartCapture: (key: keyof KeyBindings) => void;
  onStopCapture: () => void;
}> = (props) => {
  const isCapturing = () => props.capturing === props.bindingKey;
  return (
    <div class="flex flex-col gap-1.5">
      <label class="text-xs font-medium text-[var(--text-secondary)]">{props.label}</label>
      <div class="flex gap-2 items-center">
        <div class={`flex-1 px-3 py-1.5 text-sm border transition-all duration-[var(--duration-fast)] ${isCapturing()
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
          : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)]"}`}
        >
          {isCapturing() ? "Press key..." : props.value}
        </div>
        <button
          onClick={isCapturing() ? props.onStopCapture : () => props.onStartCapture(props.bindingKey)}
          class="btn-ghost px-2.5 py-1.5 text-[10px] font-medium"
        >
          {isCapturing() ? "Cancel" : "Change"}
        </button>
      </div>
    </div>
  );
};

export default SettingsPanel;
