import type { EventData, ScheduleDay, ScheduleRow } from "./types";
import { setAnnouncementText } from "./marquee";
import { setScrollingContent } from "./verticalScroll";

export interface ScheduleController {
  setEventData(data: EventData): void;
}

// The original sheet only ever carried one day's worth of rows, so its
// index-parity rule (row 0 = date, odd = title, even = content) folded the
// date into the same row list. Here the date lives on the ScheduleDay
// itself, so the same alternation is applied to `rows` starting at index 0:
// even index = title row, odd index = content row. There is no row cap --
// a long day just auto-scrolls (see verticalScroll.ts) instead of being
// truncated.

function colorizeKeywords(text: string): string {
  return text
    .replace(/JSB1000/g, '<span style="color:#CD5C5C;">JSB1000</span>')
    .replace(/ST1000/g, '<span style="color:#4682B4;">ST1000</span>');
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pickDay(days: ScheduleDay[], now: Date): ScheduleDay | null {
  if (days.length === 0) return null;
  const todayKey = dateKey(now);

  const exact = days.find((day) => day.date === todayKey);
  if (exact) return exact;

  const upcoming = days
    .filter((day) => day.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length > 0) return upcoming[0];

  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  return sorted[sorted.length - 1];
}

function formatDateLabel(dateStr: string): string {
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][parsed.getDay()];
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日（${weekday}）`;
}

function renderDateRow(dateStr: string): string {
  return (
    `<div class="schedule-row-date">` +
    `<div class="cell no-bullet-cell"><div class="text-wrapper">${formatDateLabel(dateStr)}</div></div>` +
    `<div class="cell no-bullet-cell"><div class="text-wrapper"></div></div>` +
    `</div>`
  );
}

// Rows come in title/content pairs (one logical schedule item spans two
// rows). A pair's time -- if either row in it carries one -- decides
// whether the whole pair renders as past (grayed) or next-up (highlighted).
interface PairTiming {
  isPast: boolean;
  isNext: boolean;
}

function pairTime(rows: ScheduleRow[], pairStart: number): Date | null {
  const raw = rows[pairStart]?.time ?? rows[pairStart + 1]?.time;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function computePairTimings(rows: ScheduleRow[], now: Date): PairTiming[] {
  const pairCount = Math.ceil(rows.length / 2);
  const times: Array<Date | null> = [];
  for (let pair = 0; pair < pairCount; pair++) {
    times.push(pairTime(rows, pair * 2));
  }

  let nextPair = -1;
  let nextTime: number | null = null;
  times.forEach((t, pair) => {
    if (!t || t.getTime() < now.getTime()) return;
    if (nextTime === null || t.getTime() < nextTime) {
      nextTime = t.getTime();
      nextPair = pair;
    }
  });

  return times.map((t, pair) => ({
    isPast: t !== null && t.getTime() < now.getTime(),
    isNext: pair === nextPair,
  }));
}

function renderDataRow(row: ScheduleRow, index: number, timing: PairTiming | undefined): string {
  const valA = row.A ?? "";
  const valB = row.B ?? "";
  if (!valA && !valB) return "";

  const contentA = colorizeKeywords(String(valA));
  const contentB = colorizeKeywords(String(valB));

  const isTitleRow = index % 2 === 0;
  const stateClass = timing?.isNext ? " row-next" : timing?.isPast ? " row-past" : "";
  const rowClass = (isTitleRow ? "schedule-row-title" : "schedule-row-content") + stateClass;

  const classA = isTitleRow && valA ? "has-bullet" : "no-bullet-cell";
  const partA = `<div class="cell-a ${classA}"><div class="text-wrapper">${contentA}</div></div>`;

  const classB = isTitleRow && valB ? "has-bullet" : "no-bullet-cell";
  const partB = `<div class="cell-b ${classB}"><div class="text-wrapper">${contentB}</div></div>`;

  return `<div class="${rowClass}">${partA}${partB}</div>`;
}

export function initSchedule(getNow: () => Date): ScheduleController {
  const dateRowElem = document.getElementById("schedule-date-row") as HTMLElement;
  const rowsViewportElem = document.getElementById("schedule-rows-viewport") as HTMLElement;
  const announcementElem = document.getElementById("schedule-announcement") as HTMLElement;

  return {
    setEventData(data: EventData): void {
      const day = pickDay(data.scheduleDays, getNow());

      setAnnouncementText(
        announcementElem,
        `<span style="color: blue;">お知らせ：</span>`,
        day?.announcement ?? "",
      );

      if (!day) {
        dateRowElem.innerHTML = "";
        rowsViewportElem.innerHTML = "";
        return;
      }

      dateRowElem.innerHTML = renderDateRow(day.date);

      const timings = computePairTimings(day.rows, getNow());
      let rowsHtml = "";
      day.rows.forEach((row, index) => {
        rowsHtml += renderDataRow(row, index, timings[Math.floor(index / 2)]);
      });
      setScrollingContent(rowsViewportElem, rowsHtml);
    },
  };
}
