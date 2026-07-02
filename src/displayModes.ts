export interface DisplayModeColors {
  background: string;
  primary: string;
  accent: string;
  /** Background for panels: the sidebar list, the schedule screen's rows. */
  surface: string;
  /** Text color for content sitting on `surface`. */
  surfaceText: string;
  /** Colors for the two hardcoded highlighted keywords (JSB1000 / ST1000). */
  keywordA: string;
  keywordB: string;
}

export interface DisplayModePreset {
  id: string;
  label: string;
  /** null = pass through the active app's own theme unmodified -- today's
   * default look, per-app branding intact. */
  colors: DisplayModeColors | null;
}

// Keep this list, and every value in it, identical to admin-src/displayModes.ts.
export const DISPLAY_MODES: DisplayModePreset[] = [
  {
    id: "standard",
    label: "Standard (per-app colors)",
    colors: null,
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
