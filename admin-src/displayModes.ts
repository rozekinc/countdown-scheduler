export interface DisplayModeColors {
  background: string;
  primary: string;
  accent: string;
  /** Background for panels: the sidebar list, the schedule screen's rows. */
  surface: string;
  /** Text color for content sitting on `surface`. */
  surfaceText: string;
  /** Colors for the two highlighted-keyword slots (keyword-a / keyword-b).
   * The keyword terms themselves are per-event data (EventData.highlightKeywords,
   * defaulting to JSB1000 / ST1000); these are just the two color slots. */
  keywordA: string;
  keywordB: string;
}

export interface DisplayModePreset {
  id: string;
  label: string;
  /** The preset's colors. Since the app concept was removed, a preset is the
   * ONLY source of colors -- there is no per-app theme to fall back to, so this
   * is always concrete. */
  colors: DisplayModeColors;
}

// Keep this list, and every value in it, identical to src/displayModes.ts.
export const DISPLAY_MODES: DisplayModePreset[] = [
  {
    id: "standard",
    // The original default look, now a concrete preset (was "pass through the
    // app's theme"; there are no apps anymore).
    label: "Standard",
    colors: {
      background: "#ffffff",
      primary: "#e60000",
      accent: "#484848",
      surface: "#ffe4c4",
      surfaceText: "#333333",
      keywordA: "#CD5C5C",
      keywordB: "#4682B4",
    },
  },
  {
    id: "daylight-contrast",
    label: "Daylight High-Contrast",
    colors: {
      background: "#ffffff",
      primary: "#c00000",
      accent: "#000000",
      surface: "#eeeeee",
      surfaceText: "#000000",
      keywordA: "#a30000",
      keywordB: "#00458f",
    },
  },
  {
    id: "dark-glare",
    label: "Dark / Glare Reduction",
    colors: {
      background: "#0a0a0a",
      primary: "#ff4d4d",
      accent: "#f2f2f2",
      surface: "#1c1c1c",
      surfaceText: "#f2f2f2",
      keywordA: "#ff8a8a",
      keywordB: "#7ec8ff",
    },
  },
];

export const DEFAULT_DISPLAY_MODE_ID = "standard";

export function getDisplayMode(id: string | null | undefined): DisplayModePreset {
  return DISPLAY_MODES.find((m) => m.id === id) ?? DISPLAY_MODES[0];
}
