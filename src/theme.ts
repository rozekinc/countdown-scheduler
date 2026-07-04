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

/** Applies the active display-mode preset's colors. The preset is the only
 * source of colors now (there are no per-app themes). */
export function applyTheme(displayModeId?: string | null): void {
  const root = document.documentElement;
  const mode = getDisplayMode(displayModeId);
  root.style.setProperty("--theme-primary", mode.colors.primary);
  root.style.setProperty("--theme-accent", mode.colors.accent);
  root.style.setProperty("--theme-background", mode.colors.background);
  root.style.setProperty("--theme-surface", mode.colors.surface);
  root.style.setProperty("--theme-surface-text", mode.colors.surfaceText);
  root.style.setProperty("--keyword-a", mode.colors.keywordA);
  root.style.setProperty("--keyword-b", mode.colors.keywordB);
}
