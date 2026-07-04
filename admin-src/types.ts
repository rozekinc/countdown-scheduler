// Canonical data shapes shared with the display site. Keep this file in sync
// with the data/ JSON documents and with src/types.ts; do not invent alternate
// field names.

import type { DisplayLanguage, Label, LabelKey } from "./labels";

export type { DisplayLanguage, Label, LabelKey } from "./labels";

export interface RedFlagState {
  active: boolean;
  since?: string | null;
  /** ISO finish time; when set the stoppage counts DOWN (red), else UP (blue). */
  finishTime?: string | null;
}

/** Persisted admin-editor UI state (which events are expanded, what was last
 * open), so reopening the editor lands in the same place. Lives in the config
 * like every other setting. The display ignores it. */
export interface EditorState {
  expandedEventIds?: string[];
  selectedEventId?: string | null;
  selectedDayIndex?: number;
}

/** The whole display's configuration (data/display.json). One display, one
 * config -- there is no longer a per-"app" concept. */
export interface DisplayConfig {
  /** Which event the display is currently counting down to / showing. */
  activeEventId?: string | null;
  /** Active display-mode preset (see displayModes.ts) -- the only source of
   * colors now (no per-app themes). Null/absent = "standard". */
  displayModeId?: string | null;
  /** Active aspect-ratio preset (see aspectRatios.ts). Null/absent = 16:9. */
  aspectRatioId?: string | null;
  /** Which language the display renders its labels in. Default "ja". */
  displayLanguage?: DisplayLanguage | null;
  /** Global font-size multiplier for the display (1 = default). */
  textScale?: number | null;
  /** Editable UI labels in both languages. */
  labels?: Partial<Record<LabelKey, Label>> | null;
  /** Red-flag / stoppage state, toggled from the admin. */
  redFlag?: RedFlagState | null;
  /** Which page the display shows (切替), driven from the admin. A page id;
   * base pages are "countdown"/"schedule", plus any operator-added pages. */
  currentPage?: string | null;
  /** Whether all auto-scrollers are paused (snapped to top), from the admin. */
  scrollPaused?: boolean | null;
  /** Draw a dashed outline around every layout item on the display, so the
   * operator can confirm placements. From the admin. */
  showOutline?: boolean | null;
  /** Persisted admin-editor UI state (admin only; ignored by the display). */
  editorState?: EditorState | null;
  /** Monotonic content revision, bumped when the published data set changes. */
  contentVersion?: number;
  /** Date (YYYY-MM-DD) the content was last updated. */
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
  /** Human-readable event name, editable in the admin. Falls back to `id`. */
  name?: string;
  /** Vestigial: kept so old event files still parse. New events omit it. */
  appId?: string;
  status: EventStatus;
  announcement: string;
  countdownRows: CountdownRow[];
  scheduleDays: ScheduleDay[];
  /** Terms highlighted (keyword-a / keyword-b color slots) wherever they
   * appear in countdown/schedule text. Omitted/empty = built-in defaults. */
  highlightKeywords?: string[];
}
