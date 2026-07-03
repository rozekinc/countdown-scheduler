import type { AppsData, EventData, ScheduleDay } from "./types";
import { setAnnouncementText } from "./marquee";
import { colorizeKeywords } from "./keywords";
import { resolveLabel, relativeDayLabel } from "./labels";

export interface ScheduleController {
  setEventData(data: EventData): void;
  /** Re-render using the current data with fresh labels/language -- called
   * when the display settings change live. */
  refresh(): void;
}

// The schedule screen renders up to three days side by side as columns,
// built from scheduleDays[].items. Preference is upcoming days (date >=
// today, soonest first); when none are upcoming it falls back to the most
// recent day(s) so the screen is never blank.

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(dateStr: string): string {
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][parsed.getDay()];
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日（${weekday}）`;
}

const MAX_COLUMNS = 3;

function pickDays(days: ScheduleDay[], now: Date): ScheduleDay[] {
  if (days.length === 0) return [];
  const todayKey = dateKey(now);

  const upcoming = days
    .filter((day) => day.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length > 0) return upcoming.slice(0, MAX_COLUMNS);

  // Nothing upcoming -- show the most recent day(s) instead of a blank screen.
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.slice(-MAX_COLUMNS);
}

function renderColumn(
  day: ScheduleDay,
  now: Date,
  apps: AppsData,
  keywords: string[] | undefined,
): string {
  const rel = relativeDayLabel(apps, day.date, now);
  const relHtml = rel ? `<div class="schedule-col-rel">${rel}</div>` : "";

  const itemsHtml = day.items
    .map(
      (item) =>
        `<div class="schedule-col-item">` +
        `<div class="schedule-item-title">${colorizeKeywords(item.title, keywords).replace(/\n/g, "<br>")}</div>` +
        `<div class="schedule-item-detail">${item.detail ?? ""}</div>` +
        `</div>`,
    )
    .join("");

  const annHtml = day.announcement
    ? `<div class="schedule-col-announcement">${day.announcement}</div>`
    : "";

  return (
    `<div class="schedule-column">` +
    `<div class="schedule-col-header">` +
    `<div class="schedule-col-date">${formatDateLabel(day.date)}</div>` +
    relHtml +
    `</div>` +
    `<div class="schedule-col-items">${itemsHtml}</div>` +
    annHtml +
    `</div>`
  );
}

export function initSchedule(getNow: () => Date, getApps: () => AppsData): ScheduleController {
  const columnsElem = document.getElementById("schedule-columns") as HTMLElement;
  const announcementElem = document.getElementById("schedule-announcement") as HTMLElement;

  let currentData: EventData | null = null;

  function render(): void {
    const apps = getApps();
    const now = getNow();
    const data = currentData;

    setAnnouncementText(
      announcementElem,
      `<span class="announcement-label">${resolveLabel(apps, "noticePrefix")}</span>`,
      data?.announcement ?? "",
    );

    if (!data) {
      columnsElem.innerHTML = "";
      return;
    }

    const days = pickDays(data.scheduleDays, now);
    columnsElem.innerHTML = days
      .map((day) => renderColumn(day, now, apps, data.highlightKeywords))
      .join("");
  }

  return {
    setEventData(data: EventData): void {
      currentData = data;
      render();
    },
    refresh(): void {
      render();
    },
  };
}
