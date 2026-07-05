export type DisplayLanguage = "ja" | "en";

/** An editable UI label, authored in both languages. The display renders the
 * one matching DisplayConfig.displayLanguage; the admin editor edits both. */
export interface Label {
  ja: string;
  en: string;
}

/** Every editable text location (chrome) across the two pages. Event content
 * (titles, schedule items, announcements) is NOT here -- that lives in the
 * event data. These are the fixed labels around it. */
export type LabelKey =
  | "currentTime" // 現在時刻 / Current Time
  | "nextSchedule" // 次のスケジュール / Next Schedule
  | "noticePrefix" // お知らせ： / Notice:  (prefix before announcement text)
  | "until" // まで / until  (suffix after a countdown target's time)
  | "finished" // 終了しました / Finished  (after the last countdown)
  | "toggle" // 切替 / Switch  (screen toggle button)
  | "today" // 今日 / Today
  | "tomorrow" // 明日 / Tomorrow
  | "dayAfter" // 明後日 / Day After
  | "redFlag" // 赤旗 / RED FLAG  (red-flag banner)
  | "stoppage" // 中断時間 / STOPPAGE  (stoppage timer label)
  | "safetyCar"; // セーフティカー / SAFETY CAR  (safety-car banner)

/** Persisted admin-editor UI state (which events are expanded, what was last
 * open), so reopening the editor lands in the same place. Lives in the config
 * like every other setting: mirrored to the local snapshot instantly, and
 * pushed to GitHub on Save. The display ignores it. */
export interface EditorState {
  expandedEventIds?: string[];
  selectedEventId?: string | null;
  selectedDayIndex?: number;
}

/** The whole display's configuration. One display, one config -- there is no
 * longer a per-"app" concept. */
export interface DisplayConfig {
  /** Which event the display is currently counting down to / showing. */
  activeEventId?: string | null;
  /** Active display-mode preset (see displayModes.ts). The preset is the ONLY
   * source of colors now (there are no per-app themes). */
  displayModeId?: string | null;
  /** Active aspect-ratio preset (see aspectRatios.ts). */
  aspectRatioId?: string | null;
  /** Monotonic content version + ISO date, bumped on every publish so the
   * screen can show which data it is displaying. */
  contentVersion?: number | null;
  contentUpdatedAt?: string | null;
  /** Which language the display renders its labels in. Default "ja". */
  displayLanguage?: DisplayLanguage | null;
  /** Global font-size multiplier for the display (1 = default). */
  textScale?: number | null;
  /** Editable UI labels in both languages. Missing keys fall back to the
   * built-in defaults (see labels.ts). */
  labels?: Partial<Record<LabelKey, Label>> | null;
  /** Red-flag / session-stoppage state, toggled from the admin. */
  redFlag?: RedFlagState | null;
  /** Safety-car state -- same shape + mechanic as redFlag, but shown in
   * yellow/orange. Red flag takes precedence when both are active. */
  safetyCar?: RedFlagState | null;
  /** Which page the display shows (切替) -- a page id. The base pages are
   * "countdown" and "schedule"; operator-added pages have their own ids (see
   * the layout). Driven from the admin. Default "countdown". */
  currentPage?: string | null;
  /** Whether all auto-scrollers are paused (snapped to top). Driven from the
   * admin. Default false. */
  scrollPaused?: boolean | null;
  /** Placement-confirmation aid: draw a dashed outline around every layout item
   * on the display so the operator can verify positions. Default false. */
  showOutline?: boolean | null;
  /** Persisted admin-editor UI state (admin only; ignored by the display). */
  editorState?: EditorState | null;
}

export interface RedFlagState {
  active: boolean;
  /** ISO timestamp of when the red flag was raised; the stoppage timer counts
   * up from here. Null/absent when not active. */
  since?: string | null;
  /** ISO timestamp of the red-flag FINISH time (when the stoppage ends). When
   * set, the stoppage counts DOWN to it (red); when null/absent it counts UP
   * (blue, open-ended). Once this time passes, the display resumes normally. */
  finishTime?: string | null;
}

export interface CountdownRow {
  title: string;
  time: string;
  /** "Provisioned" row: kept in the data + admin, but hidden from the display
   * (skipped by the countdown). Absent/false = shown like any other row. */
  hidden?: boolean;
}

/** One entry in a day's schedule column. */
export interface ScheduleItem {
  title: string;
  /** Free-text detail line, e.g. a time range like "10:30~" or a location. */
  detail: string;
  /** "Provisioned" item: kept in the data + admin, but hidden from the schedule
   * screen. Absent/false = shown like any other item. */
  hidden?: boolean;
}

/** One day of a multi-day event: its own timed countdown targets AND its
 * overview schedule entries, plus an optional per-day announcement. The `date`
 * ties the whole set together (countdown + schedule for that day). */
export interface DaySet {
  /** ISO date (YYYY-MM-DD). The display shows this plus an automatic today /
   * tomorrow / day-after label computed from the current local date. May be ""
   * only for a synthetic bucket holding countdown rows with no valid date. */
  date: string;
  /** Optional per-day announcement shown under that day's schedule column. */
  announcement?: string;
  /** This day's countdown targets (time-sorted). */
  countdownRows: CountdownRow[];
  /** This day's schedule entries (the overview). */
  schedule: ScheduleItem[];
}

export type EventStatus = "draft" | "active" | "ended";

export interface EventData {
  id: string;
  /** Human-readable event name, editable in the admin. Falls back to `id`
   * wherever a name is shown but not set. */
  name?: string;
  /** Vestigial: kept so old event files still parse. No longer used by the
   * display (there are no apps). New events omit it. */
  appId?: string;
  /** Editorial/admin-only bookkeeping label; never enforced on the display. */
  status: EventStatus;
  /** Event-level announcement (the running marquee). Per-day announcements
   * live on DaySet.announcement. */
  announcement: string;
  /** All day-sets, sorted ascending by date. Each is a countdown + schedule
   * for that date. Replaces the old top-level countdownRows + scheduleDays. */
  days: DaySet[];
  /** Terms highlighted (keyword-a / keyword-b color slots) wherever they
   * appear in countdown/schedule text. Omitted/empty = built-in defaults. */
  highlightKeywords?: string[];
}
