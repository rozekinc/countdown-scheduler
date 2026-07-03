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

export type DisplayLanguage = "ja" | "en";

/** An editable UI label, authored in both languages. The display renders the
 * one matching AppsData.displayLanguage; the admin editor edits both. */
export interface Label {
  ja: string;
  en: string;
}

/** Every editable text location (chrome) across the two screens. Event
 * content (titles, schedule items, announcements) is NOT here -- that lives
 * in the event data. These are the fixed labels around it. */
export type LabelKey =
  | "currentTime" // 現在時刻 / Current Time
  | "nextSchedule" // 次のスケジュール / Next Schedule
  | "noticePrefix" // お知らせ： / Notice:  (prefix before announcement text)
  | "until" // まで / until  (suffix after a countdown target's time)
  | "finished" // 終了しました / Finished  (after the last countdown)
  | "toggle" // 切替 / Switch  (screen toggle button)
  | "today" // 今日 / Today
  | "tomorrow" // 明日 / Tomorrow
  | "dayAfter"; // 明後日 / Day After

export interface AppsData {
  apps: App[];
  /** Which app the primary display (no ?app= override) should show. */
  selectedAppId?: string | null;
  /** Active display-mode preset (see displayModes.ts). */
  displayModeId?: string | null;
  /** Active aspect-ratio preset (see aspectRatios.ts). */
  aspectRatioId?: string | null;
  /** Monotonic content version + ISO date, bumped on every publish so the
   * screens can show which data they are displaying. */
  contentVersion?: number | null;
  contentUpdatedAt?: string | null;
  /** Which language the display renders its labels in. Default "ja". Applies
   * to every screen. */
  displayLanguage?: DisplayLanguage | null;
  /** Global font-size multiplier for the display (1 = default). Applies to
   * every screen. */
  textScale?: number | null;
  /** Editable UI labels in both languages. Missing keys fall back to the
   * built-in defaults (see labels.ts). */
  labels?: Partial<Record<LabelKey, Label>> | null;
}

export interface CountdownRow {
  title: string;
  time: string;
}

/** One entry in a day's schedule column. */
export interface ScheduleItem {
  title: string;
  /** Free-text detail line, e.g. a time range like "10:30~" or a location. */
  detail: string;
}

export interface ScheduleDay {
  /** ISO date (YYYY-MM-DD). The display shows this date plus an automatic
   * today / tomorrow / day-after label computed from the current date. */
  date: string;
  /** Optional per-day announcement shown under that day's column. */
  announcement?: string;
  items: ScheduleItem[];
}

export type EventStatus = "draft" | "active" | "ended";

export interface EventData {
  id: string;
  appId: string;
  /** Editorial/admin-only bookkeeping label; never enforced on the display. */
  status: EventStatus;
  announcement: string;
  countdownRows: CountdownRow[];
  scheduleDays: ScheduleDay[];
  /** Terms highlighted (keyword-a / keyword-b color slots) wherever they
   * appear in countdown/schedule text. Omitted/empty = built-in defaults. */
  highlightKeywords?: string[];
}
