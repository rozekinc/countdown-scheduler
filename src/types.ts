export interface Theme {
  primary: string;
  accent: string;
  background: string;
}

export type ScreenMode = "countdown" | "schedule";

export interface App {
  id: string;
  name: string;
  theme: Theme;
  activeEventId: string;
  /** Which screen this app always shows -- "countdown" (title + countdown
   * + upcoming-schedule sidebar) or "schedule" (the full day-by-day
   * schedule). Set per app in the admin; no more runtime toggle button on
   * the display itself. Omitted = "countdown". */
  screenMode?: ScreenMode;
}

export interface AppsData {
  apps: App[];
  /** Which app the primary display (no ?app= override) should currently
   * show, set remotely from the admin app. Null/omitted falls back to
   * apps[0]. Screens loaded with an explicit ?app= param ignore this --
   * they're pinned to that one app regardless. */
  selectedAppId?: string | null;
  /** Which display-mode preset (see displayModes.ts) is active, e.g. for
   * readability under bright ambient light. Null/omitted = "standard"
   * (each app's own theme colors, unmodified). Applies to every screen. */
  displayModeId?: string | null;
  /** Which aspect-ratio preset (see aspectRatios.ts) the stage is
   * letterboxed/pillarboxed to, independent of the physical screen's own
   * ratio. Null/omitted = 16:9. Applies to every screen. */
  aspectRatioId?: string | null;
}

export interface CountdownRow {
  title: string;
  time: string;
}

export interface ScheduleRow {
  A: string;
  B: string;
  /** Optional ISO datetime for this row. When present, the display can
   * gray it out once it's passed and highlight it while it's next up.
   * Omitted rows (no reliable time, e.g. free-form notes) render plain. */
  time?: string;
}

export interface ScheduleDay {
  date: string;
  announcement: string;
  rows: ScheduleRow[];
}

export type EventStatus = "draft" | "active" | "ended";

export interface EventData {
  id: string;
  appId: string;
  status: EventStatus;
  announcement: string;
  countdownRows: CountdownRow[];
  scheduleDays: ScheduleDay[];
}
