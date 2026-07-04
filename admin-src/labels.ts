// Mirror of src/labels.ts DEFAULT_LABELS, plus editor metadata (a friendly
// name + where the label appears) so the admin can render a labels editor.
// Keep the key set and defaults in sync with src/labels.ts.

export type DisplayLanguage = "ja" | "en";

export interface Label {
  ja: string;
  en: string;
}

export type LabelKey =
  | "currentTime"
  | "nextSchedule"
  | "noticePrefix"
  | "until"
  | "finished"
  | "toggle"
  | "today"
  | "tomorrow"
  | "dayAfter"
  | "redFlag"
  | "stoppage";

export const DEFAULT_LABELS: Record<LabelKey, Label> = {
  currentTime: { ja: "現在時刻", en: "Current Time" },
  nextSchedule: { ja: "次のスケジュール", en: "Next Schedule" },
  noticePrefix: { ja: "お知らせ：", en: "Notice: " },
  until: { ja: "まで", en: "until" },
  finished: { ja: "終了しました", en: "Finished" },
  toggle: { ja: "切替", en: "Switch" },
  today: { ja: "今日", en: "Today" },
  tomorrow: { ja: "明日", en: "Tomorrow" },
  dayAfter: { ja: "明後日", en: "Day After" },
  redFlag: { ja: "赤旗", en: "RED FLAG" },
  stoppage: { ja: "中断時間", en: "STOPPAGE" },
};

/** Order + a short description of where each label shows, for the editor. */
export const LABEL_EDITOR_FIELDS: Array<{ key: LabelKey; where: string }> = [
  { key: "currentTime", where: "Countdown screen — label above the clock" },
  { key: "nextSchedule", where: "Countdown screen — heading of the side list" },
  { key: "noticePrefix", where: "Both screens — prefix before the announcement" },
  { key: "until", where: "Countdown screen — after the target time" },
  { key: "finished", where: "Countdown screen — when all items are done" },
  { key: "toggle", where: "Screen switch button" },
  { key: "today", where: "Schedule — label under today's date" },
  { key: "tomorrow", where: "Schedule — label under tomorrow's date" },
  { key: "dayAfter", where: "Schedule — label under the day-after's date" },
  { key: "redFlag", where: "Red flag — the RED FLAG banner title" },
  { key: "stoppage", where: "Red flag — the stoppage timer label" },
];
