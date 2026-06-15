/**
 * WelcomeView — branded first-run state shown when backend is not configured.
 * Displays the wordmark, a value prop, and a CTA to open settings.
 */
import { Component } from "solid-js";
import { backendStatus } from "../signals/settings";
import { setSettingsOpen } from "../signals/overlay";

const WelcomeView: Component = () => {
  const status = backendStatus();

  if (status === "ready" || status === "checking") return null;

  const statusMessages: Record<string, { title: string; description: string; cta: string }> = {
    not_configured: {
      title: "Welcome to particle0",
      description: "Connect your NVIDIA NIM API key to start asking questions from anywhere on your desktop.",
      cta: "Set up connection",
    },
    unreachable: {
      title: "Cannot reach NIM server",
      description: "The configured NIM endpoint is not responding. Check your connection or update the URL in settings.",
      cta: "Open Settings",
    },
    model_missing: {
      title: "Model not available",
      description: "The configured model was not found. Open settings to pick a different model.",
      cta: "Open Settings",
    },
  };

  const msg = () => statusMessages[backendStatus()] ?? statusMessages.not_configured;

  return (
    <div class="flex flex-col items-center text-center px-6 py-6 gap-4">
      {/* Wordmark */}
      <div class="flex items-center gap-1">
        <div class="w-2 h-2 bg-[var(--accent)]" />
        <span class="text-base font-semibold tracking-tight text-[var(--text-primary)]">
          particle<span class="text-[var(--accent)]">0</span>
        </span>
      </div>

      {/* Message */}
      <div class="flex flex-col gap-1.5">
        <p class="text-sm font-medium text-[var(--text-primary)]">{msg().title}</p>
        <p class="text-xs text-[var(--text-secondary)] leading-relaxed max-w-[320px]">
          {msg().description}
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={() => setSettingsOpen(true)}
        class="btn-primary px-5 py-2 text-xs font-medium"
      >
        {msg().cta}
      </button>
    </div>
  );
};

export default WelcomeView;
