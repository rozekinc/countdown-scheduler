import type { App } from "./types";
import { getDisplayMode } from "./displayModes";
import { getAspectRatio } from "./aspectRatios";

/** Sets --stage-w/--stage-h (see styles.css's .aspect-inner), which
 * letterboxes/pillarboxes the stage to this ratio regardless of the
 * physical screen's own. */
export function applyAspectRatio(aspectRatioId?: string | null): void {
  const preset = getAspectRatio(aspectRatioId);
  const root = document.documentElement;
  root.style.setProperty("--stage-w", String(preset.w));
  root.style.setProperty("--stage-h", String(preset.h));
}

export function applyTheme(app: App, displayModeId?: string | null): void {
  const root = document.documentElement;
  const mode = getDisplayMode(displayModeId);

  if (mode.colors) {
    // A display mode overrides the app's own branding -- these presets are
    // tuned for readability (glare/distance), not for matching a brand.
    root.style.setProperty("--theme-primary", mode.colors.primary);
    root.style.setProperty("--theme-accent", mode.colors.accent);
    root.style.setProperty("--theme-background", mode.colors.background);
    root.style.setProperty("--theme-surface", mode.colors.surface);
    root.style.setProperty("--theme-surface-text", mode.colors.surfaceText);
    root.style.setProperty("--keyword-a", mode.colors.keywordA);
    root.style.setProperty("--keyword-b", mode.colors.keywordB);
  } else {
    // "standard" -- pass the app's own theme straight through, same as
    // before display modes existed.
    root.style.setProperty("--theme-primary", app.theme.primary);
    root.style.setProperty("--theme-accent", app.theme.accent);
    root.style.setProperty("--theme-background", app.theme.background);
    root.style.setProperty("--theme-surface", "#ffe4c4");
    root.style.setProperty("--theme-surface-text", "#333333");
    root.style.setProperty("--keyword-a", "#CD5C5C");
    root.style.setProperty("--keyword-b", "#4682B4");
  }
}
