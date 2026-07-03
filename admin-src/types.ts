// Canonical data shapes shared with the display site and the MCP server.
// Keep this file in sync with the data/ JSON documents; do not invent
// alternate field names.

export interface AppTheme {
  primary: string;
  accent: string;
  background: string;
}

export type ScreenMode = "countdown" | "schedule";

export interface AppConfig {
  id: string;
  name: string;
  theme: AppTheme;
  activeEventId: string | null;
}

export interface AppsFile {
  apps: AppConfig[];
  /** Which app the primary display (no ?app= override) should currently
   * show. Set by "Show on display" in the admin app. */
  selectedAppId?: string | null;
  /** Which display-mode preset (see displayModes.ts) is active on every
   * screen. Null/absent = "standard" (each app's own theme). */
  displayModeId?: string | null;
  /** Which aspect-ratio preset (see aspectRatios.ts) the stage is
   * letterboxed/pillarboxed to on every screen. Null/absent = 16:9. */
  aspectRatioId?: string | null;
  /** Which screen every display shows -- "countdown" or "schedule". A
   * single global on/off switch for the one physical TV, independent of
   * which app's branding is live (selectedAppId). Null/absent =
   * "countdown". */
  screenMode?: ScreenMode | null;
}

export type EventStatus = "draft" | "active" | "ended";

export interface CountdownRow {
  title: string;
  time: string; // ISO 8601, e.g. 2026-07-10T13:00:00+09:00
}

export interface ScheduleRow {
  A: string;
  B: string;
  /** Optional ISO datetime. When set, the display grays this row out once
   * it's passed and highlights it while it's next up. Leave blank for
   * free-form rows with no reliable time. */
  time?: string;
}

export interface ScheduleDay {
  date: string; // YYYY-MM-DD
  announcement: string;
  rows: ScheduleRow[];
}

export interface EventData {
  id: string;
  appId: string;
  status: EventStatus;
  announcement: string;
  countdownRows: CountdownRow[];
  scheduleDays: ScheduleDay[];
}
