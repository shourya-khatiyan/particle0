/** Text formatting utilities for particle0. */

/**
 * Formats elapsed milliseconds into a human-readable string.
 * e.g. 1200 → "1.2s", 800 → "800ms"
 */
export function formatElapsed(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

/**
 * Formats a token count for display.
 * e.g. 1500 → "1.5k tokens", 800 → "800 tokens"
 */
export function formatTokenCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k tokens`;
  return `${count} tokens`;
}

/**
 * Truncates a string to a max length with an ellipsis.
 */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

/**
 * Copies text to the clipboard using Tauri's clipboard plugin.
 * Falls back to the browser Clipboard API if the plugin call fails.
 * Returns true on success.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
    return true;
  } catch {
    // Fallback for dev/browser context
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}
