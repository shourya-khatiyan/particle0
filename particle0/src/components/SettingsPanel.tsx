/**
 * SettingsPanel — full settings UI.
 * Handles NIM credentials, model picker, hotkey, theme, advanced options, and autostart.
 */
import { Component, Show, createSignal, onCleanup } from "solid-js";
import { appSettings, setAppSettings, applyThemeFromSettings } from "../signals/settings";
import { setSettingsOpen } from "../signals/overlay";
import {
  testConnection,
  saveSettings,
  updateHotkey,
  toggleAutostart,
} from "../lib/tauri-commands";
import { DEFAULT_SETTINGS, type AppSettings, type ThemePreference } from "../lib/api-types";

// ── helpers ────────────────────────────────────────────────────────────────

/** Converts a keydown event to a Tauri-compatible shortcut string.
 *  Returns null if no main key or only modifier keys were pressed. */
function buildShortcut(e: KeyboardEvent): string | null {
  const modifiers: string[] = [];
  if (e.ctrlKey) modifiers.push("Ctrl");
  if (e.altKey) modifiers.push("Alt");
  if (e.shiftKey) modifiers.push("Shift");
  if (e.metaKey) modifiers.push("Super");

  const skip = new Set(["Control", "Alt", "Shift", "Meta", "Super", "Unidentified"]);
  if (skip.has(e.key)) return null;
  if (modifiers.length === 0) return null; // global shortcuts need at least one modifier

  const keyMap: Record<string, string> = {
    " ": "Space",
    Escape: "Escape",
    Enter: "Enter",
    Backspace: "Backspace",
    Delete: "Delete",
    Tab: "Tab",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
  };
  const mapped = keyMap[e.key] ?? e.key.toUpperCase();
  return [...modifiers, mapped].join("+");
}

// ── sub-components ─────────────────────────────────────────────────────────

/** A labelled form row. */
const Field: Component<{ label: string; children: any }> = (props) => (
  <div class="flex flex-col gap-1">
    <label class="text-[10px] font-semibold uppercase tracking-wider text-[--color-text-muted]">
      {props.label}
    </label>
    {props.children}
  </div>
);

/** Shared text input styling. */
const inputCls =
  "w-full px-2.5 py-1.5 rounded-md text-xs bg-[--color-surface-elevated] border border-[--color-border-subtle] text-[--color-text-primary] placeholder:text-[--color-text-muted] outline-none focus:border-[--color-accent] transition-colors";

// ── main component ─────────────────────────────────────────────────────────

const SettingsPanel: Component = () => {
  // Local draft — only written to Rust on Save
  const [draft, setDraft] = createSignal<AppSettings>({ ...appSettings() });

  // Test connection state
  const [testStatus, setTestStatus] = createSignal<"idle" | "testing" | "ok" | "error">("idle");
  const [testModels, setTestModels] = createSignal<string[]>([]);
  const [testError, setTestError] = createSignal<string>("");

  // Save state
  const [saveStatus, setSaveStatus] = createSignal<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = createSignal<string>("");

  // Hotkey capture
  const [hotkeyListening, setHotkeyListening] = createSignal(false);

  // API key visibility toggle
  const [showKey, setShowKey] = createSignal(false);

  /** Updates a single field on the draft. */
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  // ── test connection ──────────────────────────────────────────────────────

  const handleTest = async () => {
    setTestStatus("testing");
    setTestError("");
    try {
      const result = await testConnection(draft().nim_base_url, draft().nim_api_key);
      if (result.success) {
        setTestStatus("ok");
        setTestModels(result.models);
        // Auto-select first model if current is empty or not in list
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

  // ── save ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaveStatus("saving");
    setSaveError("");
    const d = draft();
    try {
      await saveSettings(d);
      setAppSettings(d);
      applyThemeFromSettings(d.theme);
      // Sync autostart registry
      try { await toggleAutostart(d.launch_on_startup); } catch {}
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
      setSettingsOpen(false);
    } catch (e) {
      setSaveStatus("error");
      setSaveError(String(e));
    }
  };

  // ── reset ───────────────────────────────────────────────────────────────

  const handleReset = () => {
    setDraft({ ...DEFAULT_SETTINGS });
    setTestStatus("idle");
    setTestModels([]);
  };

  // ── hotkey capture ───────────────────────────────────────────────────────

  let stopHotkeyCapture: (() => void) | undefined;

  const startHotkeyCapture = () => {
    setHotkeyListening(true);
    const handler = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const shortcut = buildShortcut(e);
      if (!shortcut) return;

      stopHotkeyCapture?.();
      set("hotkey", shortcut);

      // Attempt to register immediately so we know if it's valid
      try {
        await updateHotkey(shortcut);
      } catch {
        // Registration may fail if hotkey is taken; we still store it in draft
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    stopHotkeyCapture = () => {
      window.removeEventListener("keydown", handler, { capture: true });
      setHotkeyListening(false);
      stopHotkeyCapture = undefined;
    };
  };

  onCleanup(() => stopHotkeyCapture?.());

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div class="flex flex-col max-h-[520px]">
      {/* Header */}
      <div class="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
        <h2 class="text-sm font-semibold text-[--color-text-primary]">Settings</h2>
        <button
          onClick={() => setSettingsOpen(false)}
          class="text-[--color-text-muted] hover:text-[--color-text-primary] transition-colors p-1 rounded-md hover:bg-[--color-surface-elevated]"
          aria-label="Close settings"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div class="flex flex-col gap-4 px-4 pb-4 overflow-y-auto selectable">

        {/* ── Connection section ─────────────────────────────────── */}
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
            <div class="flex gap-1.5">
              <input
                type={showKey() ? "text" : "password"}
                class={`${inputCls} flex-1 font-mono`}
                value={draft().nim_api_key}
                onInput={(e) => set("nim_api_key", e.currentTarget.value)}
                placeholder="nvapi-…"
                spellcheck={false}
                autocomplete="off"
              />
              <button
                onClick={() => setShowKey(!showKey())}
                class="px-2 rounded-md bg-[--color-surface-elevated] border border-[--color-border-subtle] text-[--color-text-muted] hover:text-[--color-text-primary] transition-colors"
                aria-label={showKey() ? "Hide API key" : "Show API key"}
              >
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
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

          {/* Test connection button + status */}
          <div class="flex items-center gap-2">
            <button
              onClick={handleTest}
              disabled={testStatus() === "testing" || !draft().nim_base_url || !draft().nim_api_key}
              class="px-3 py-1.5 rounded-md text-xs font-medium bg-[--color-accent] hover:bg-[--color-accent-hover] text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {testStatus() === "testing" ? "Testing…" : "Test Connection"}
            </button>
            <Show when={testStatus() === "ok"}>
              <span class="text-xs text-[--color-success] font-medium">✓ Connected — {testModels().length} models</span>
            </Show>
            <Show when={testStatus() === "error"}>
              <span class="text-xs text-[--color-error]" title={testError()}>✗ Failed</span>
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

        {/* ── Appearance section ────────────────────────────────── */}
        <Section title="Appearance">
          <Field label="Theme">
            <div class="flex gap-1.5">
              {(["dark", "light", "system"] as ThemePreference[]).map((t) => (
                <button
                  onClick={() => set("theme", t)}
                  class={`flex-1 py-1 rounded-md text-xs font-medium capitalize transition-colors
                    ${draft().theme === t
                      ? "bg-[--color-accent] text-white"
                      : "bg-[--color-surface-elevated] border border-[--color-border-subtle] text-[--color-text-secondary] hover:text-[--color-text-primary]"
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        {/* ── Behavior section ──────────────────────────────────── */}
        <Section title="Behavior">
          <Field label="Global Hotkey">
            <div class="flex gap-1.5 items-center">
              <div class={`flex-1 px-2.5 py-1.5 rounded-md text-xs border ${hotkeyListening()
                ? "border-[--color-accent] bg-[--color-accent]/10 text-[--color-accent] animate-pulse"
                : "border-[--color-border-subtle] bg-[--color-surface-elevated] text-[--color-text-primary]"}`}
              >
                {hotkeyListening() ? "Press shortcut…" : draft().hotkey}
              </div>
              <button
                onClick={hotkeyListening() ? stopHotkeyCapture : startHotkeyCapture}
                class="px-2.5 py-1.5 rounded-md text-xs bg-[--color-surface-elevated] border border-[--color-border-subtle] text-[--color-text-secondary] hover:text-[--color-text-primary] transition-colors"
              >
                {hotkeyListening() ? "Cancel" : "Change"}
              </button>
            </div>
          </Field>

          <Field label="Launch on Startup">
            <Toggle
              checked={draft().launch_on_startup}
              onChange={(v) => set("launch_on_startup", v)}
              label={draft().launch_on_startup ? "Enabled" : "Disabled"}
            />
          </Field>
        </Section>

        {/* ── Advanced section ──────────────────────────────────── */}
        <Section title="Advanced">
          <Field label={`Temperature — ${draft().temperature.toFixed(1)}`}>
            <input
              type="range"
              min="0" max="2" step="0.1"
              value={draft().temperature}
              onInput={(e) => set("temperature", parseFloat(e.currentTarget.value))}
              class="w-full accent-[--color-accent]"
            />
            <div class="flex justify-between text-[9px] text-[--color-text-muted]">
              <span>0 — precise</span>
              <span>2 — creative</span>
            </div>
          </Field>

          <Field label="Max Tokens (leave blank for default)">
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

          <Field label="Request Timeout (seconds)">
            <input
              type="number"
              class={inputCls}
              value={draft().request_timeout_secs}
              onInput={(e) => set("request_timeout_secs", parseInt(e.currentTarget.value) || 30)}
              min="5"
              max="300"
            />
          </Field>
        </Section>

        {/* ── Actions ───────────────────────────────────────────── */}
        <div class="flex gap-2 pt-1">
          <button
            onClick={handleReset}
            class="px-3 py-1.5 rounded-md text-xs text-[--color-text-muted] hover:text-[--color-text-primary] hover:bg-[--color-surface-elevated] transition-colors"
          >
            Reset to Defaults
          </button>
          <div class="flex-1" />
          <Show when={saveStatus() === "error"}>
            <span class="text-xs text-[--color-error] self-center" title={saveError()}>Save failed</span>
          </Show>
          <button
            onClick={handleSave}
            disabled={saveStatus() === "saving"}
            class="px-4 py-1.5 rounded-md text-xs font-semibold bg-[--color-accent] hover:bg-[--color-accent-hover] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveStatus() === "saving" ? "Saving…" : saveStatus() === "saved" ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── small helpers ──────────────────────────────────────────────────────────

const Section: Component<{ title: string; children: any }> = (props) => (
  <div class="flex flex-col gap-2.5">
    <div class="flex items-center gap-2">
      <span class="text-[9px] font-bold uppercase tracking-widest text-[--color-text-muted]">{props.title}</span>
      <div class="flex-1 h-px bg-[--color-border-subtle]" />
    </div>
    {props.children}
  </div>
);

const Toggle: Component<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = (
  props
) => (
  <button
    onClick={() => props.onChange(!props.checked)}
    class="flex items-center gap-2 text-xs text-[--color-text-secondary] hover:text-[--color-text-primary] transition-colors"
    role="switch"
    aria-checked={props.checked}
  >
    <div
      class={`relative w-7 h-4 rounded-full transition-colors duration-[--duration-fast] ${
        props.checked ? "bg-[--color-accent]" : "bg-[--color-surface-elevated] border border-[--color-border-subtle]"
      }`}
    >
      <div
        class={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-[--duration-fast] ${
          props.checked ? "translate-x-3.5" : "translate-x-0.5"
        }`}
      />
    </div>
    {props.label}
  </button>
);

export default SettingsPanel;
