// Common date-title formats for a date-bound schedule item's heading, chosen
// separately per display language. Pure (no DOM / no config). "rel" (relative
// today/tomorrow) and "none" are handled by the caller; the absolute formats
// are rendered here.
//
// Keep this file identical to admin-src/scheduleDate.ts.

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];
const WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Format keys offered per language, in dropdown order. */
export const JA_DATE_FORMATS = ["md", "mdw", "ymd", "slash", "rel", "none"] as const;
export const EN_DATE_FORMATS = ["md", "wmd", "mdy", "iso", "rel", "none"] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Format an ISO date (YYYY-MM-DD) with an ABSOLUTE format key + language.
 * Returns "" for "none"/blank/invalid. "rel" is NOT handled here (the caller
 * resolves the relative label, which depends on the current date + config).
 */
export function formatScheduleDate(iso: string, format: string, lang: "ja" | "en"): string {
  if (!iso || format === "none") return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const wd = d.getDay();
  if (lang === "ja") {
    switch (format) {
      case "mdw":
        return `${m}月${day}日（${WEEKDAY_JA[wd]}）`;
      case "ymd":
        return `${y}年${m}月${day}日`;
      case "slash":
        return `${y}/${pad2(m)}/${pad2(day)}`;
      case "md":
      default:
        return `${m}月${day}日`;
    }
  }
  switch (format) {
    case "wmd":
      return `${WEEKDAY_EN[wd]}, ${MONTH_EN[m - 1].slice(0, 3)} ${day}`;
    case "mdy":
      return `${MONTH_EN[m - 1]} ${day}, ${y}`;
    case "iso":
      return `${y}-${pad2(m)}-${pad2(day)}`;
    case "md":
    default:
      return `${MONTH_EN[m - 1]} ${day}`;
  }
}
