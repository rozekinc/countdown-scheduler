import type { DisplayConfig, DisplayLanguage, Label, LabelKey } from "./types";

/** Built-in defaults for every editable label, in both languages. Used when
 * apps.json has no override for a key. Keep this the single source of truth
 * for the label set (the admin editor mirrors it in admin-src/labels.ts). */
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
  safetyCar: { ja: "セーフティカー", en: "SAFETY CAR" },
};

export function displayLanguage(apps: DisplayConfig): DisplayLanguage {
  return apps.displayLanguage === "en" ? "en" : "ja";
}

/** The YYYY-MM-DD key for `now` shifted by `offset` days (local time). Used to
 * resolve a date-bound schedule item's day-set; shares the same local-date
 * arithmetic as relativeDayLabel so they never disagree at midnight. */
export function dateKeyPlus(now: Date, offset: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The text for a label in the active display language, preferring the
 * apps.json override and falling back to the built-in default. */
export function resolveLabel(apps: DisplayConfig, key: LabelKey): string {
  const lang = displayLanguage(apps);
  const chosen = apps.labels?.[key] ?? DEFAULT_LABELS[key];
  return chosen[lang] || DEFAULT_LABELS[key][lang] || DEFAULT_LABELS[key].ja;
}

/** Relative-day label (today / tomorrow / day-after) for a YYYY-MM-DD date
 * versus `now`, or null when the date is none of those. Uses local-date
 * arithmetic so it flips at local midnight. */
export function relativeDayLabel(
  apps: DisplayConfig,
  isoDate: string,
  now: Date,
): string | null {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const delta = Math.round((startOf(parsed) - startOf(now)) / dayMs);
  if (delta === 0) return resolveLabel(apps, "today");
  if (delta === 1) return resolveLabel(apps, "tomorrow");
  if (delta === 2) return resolveLabel(apps, "dayAfter");
  return null;
}
