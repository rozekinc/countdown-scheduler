// Mirrors the "which colors win" logic in src/theme.ts's applyTheme(), but
// scopes the CSS custom properties to a single container element instead of
// :root, so the admin's live-preview panel can render a miniature mockup of
// the real display site without leaking --theme-* values into the rest of
// the admin chrome.
import type { AppConfig } from "./types";
import { getDisplayMode } from "./displayModes";

export function applyPreviewTheme(
  container: HTMLElement,
  app: AppConfig | null,
  displayModeId?: string | null,
): void {
  const mode = getDisplayMode(displayModeId);

  if (mode.colors) {
    container.style.setProperty("--theme-primary", mode.colors.primary);
    container.style.setProperty("--theme-accent", mode.colors.accent);
    container.style.setProperty("--theme-background", mode.colors.background);
    container.style.setProperty("--theme-surface", mode.colors.surface);
    container.style.setProperty("--theme-surface-text", mode.colors.surfaceText);
    container.style.setProperty("--keyword-a", mode.colors.keywordA);
    container.style.setProperty("--keyword-b", mode.colors.keywordB);
  } else if (app) {
    // "standard" -- pass the app's own theme straight through, same as the
    // real display site does.
    container.style.setProperty("--theme-primary", app.theme.primary);
    container.style.setProperty("--theme-accent", app.theme.accent);
    container.style.setProperty("--theme-background", app.theme.background);
    container.style.setProperty("--theme-surface", "#ffe4c4");
    container.style.setProperty("--theme-surface-text", "#333333");
    container.style.setProperty("--keyword-a", "#CD5C5C");
    container.style.setProperty("--keyword-b", "#4682B4");
  }
}
