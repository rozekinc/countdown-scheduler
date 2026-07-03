// Canonical data shapes shared with the display site and the MCP server.
// Keep this file in sync with the data/ JSON documents; do not invent
// alternate field names.

import type { DisplayLanguage, Label, LabelKey } from "./labels";

export type { DisplayLanguage, Label, LabelKey } from "./labels";

export interface AppTheme {
  primary: string;
  accent: string;
  background: string;
}

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
  /** Which language the display renders its labels in. Default "ja". */
  displayLanguage?: DisplayLanguage | null;
  /** Global font-size multiplier for the display (1 = default). */
  textScale?: number | null;
  /** Editable UI labels in both languages. Missing keys fall back to the
   * built-in defaults (see labels.ts). */
  labels?: Partial<Record<LabelKey, Label>> | null;
  /** Monotonic content revision, bumped when the published data set
   * changes. Surfaced read-only in the admin's version indicator. */
  contentVersion?: number;
  /** Date (YYYY-MM-DD) the content was last updated, shown alongside
   * contentVersion in the admin's version indicator. */
  contentUpdatedAt?: string;
}

export type EventStatus = "draft" | "active" | "ended";

export interface CountdownRow {
  title: string;
  time: string; // ISO 8601, e.g. 2026-07-10T13:00:00+09:00
}

/** One entry in a day's schedule column. */
export interface ScheduleItem {
  title: string;
  /** Free-text detail line, e.g. a time range like "10:30~" or a location. */
  detail: string;
}

export interface ScheduleDay {
  date: string; // YYYY-MM-DD
  /** Optional per-day announcement shown under that day's column. */
  announcement?: string;
  items: ScheduleItem[];
}

export interface EventData {
  id: string;
  appId: string;
  status: EventStatus;
  announcement: string;
  countdownRows: CountdownRow[];
  scheduleDays: ScheduleDay[];
  /** Terms highlighted (keyword-a / keyword-b color slots) wherever they
   * appear in countdown/schedule text. Omitted/empty = built-in defaults. */
  highlightKeywords?: string[];
}
