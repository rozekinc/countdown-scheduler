export interface Theme {
  primary: string;
  accent: string;
  background: string;
}

export interface App {
  id: string;
  name: string;
  theme: Theme;
  activeEventId: string;
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
  /** Monotonic content version, bumped by the publish routine on every data
   * change so screens can show "which data am I looking at". Paired with
   * contentUpdatedAt (an ISO date/datetime string). Omitted = unversioned. */
  contentVersion?: number | null;
  contentUpdatedAt?: string | null;
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
  /** Editorial/admin-only: used by the admin editor to organize events;
   * it is never enforced on the public display (no display-side gating on
   * status). Purely a bookkeeping label. */
  status: EventStatus;
  announcement: string;
  countdownRows: CountdownRow[];
  scheduleDays: ScheduleDay[];
  /** Terms highlighted (via keyword-a / keyword-b color slots) wherever
   * they appear in countdown/schedule text. Per-event content. Omitted or
   * empty falls back to the built-in defaults (see keywords.ts). */
  highlightKeywords?: string[];
}
