// Scopes the active display-mode preset's colors to a single container element
// (the layout editor's preview stage) instead of :root, so the preview renders
// the real display colors without leaking --theme-* into the rest of the admin
// chrome. Presets are the only source of colors now (no per-app themes).
import { getDisplayMode } from "./displayModes";

export function applyPreviewTheme(container: HTMLElement, displayModeId?: string | null): void {
  const mode = getDisplayMode(displayModeId);
  container.style.setProperty("--theme-primary", mode.colors.primary);
  container.style.setProperty("--theme-accent", mode.colors.accent);
  container.style.setProperty("--theme-background", mode.colors.background);
  container.style.setProperty("--theme-surface", mode.colors.surface);
  container.style.setProperty("--theme-surface-text", mode.colors.surfaceText);
  container.style.setProperty("--keyword-a", mode.colors.keywordA);
  container.style.setProperty("--keyword-b", mode.colors.keywordB);
}
