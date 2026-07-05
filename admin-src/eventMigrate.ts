// Normalizes any EventData (legacy or current) into the DAY-SET shape:
// EventData.days: DaySet[], where each DaySet holds that day's own countdown
// targets AND its overview schedule. Legacy events (top-level countdownRows +
// scheduleDays) are converted: schedule days seed each DaySet's schedule, and
// each countdown row is bucketed into the day-set matching the ISO-date prefix
// of its time. Idempotent -- a doc already in day-set shape passes straight
// through (just re-normalized + re-sorted).
//
// Keep this file identical to admin-src/eventMigrate.ts.

import type { CountdownRow, DaySet, EventData, EventStatus, ScheduleItem } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Only carry `hidden` when true, so unset/false items stay clean in the JSON.
function asHidden(v: unknown): true | undefined {
  return v === true ? true : undefined;
}

function normSchedule(items: unknown): ScheduleItem[] {
  return Array.isArray(items)
    ? items.map((i): ScheduleItem => ({ title: asStr((i as ScheduleItem)?.title), detail: asStr((i as ScheduleItem)?.detail), hidden: asHidden((i as ScheduleItem)?.hidden) }))
    : [];
}

function normRows(rows: unknown): CountdownRow[] {
  return Array.isArray(rows)
    ? rows.map((r): CountdownRow => ({ title: asStr((r as CountdownRow)?.title), time: asStr((r as CountdownRow)?.time), hidden: asHidden((r as CountdownRow)?.hidden) }))
    : [];
}

function normDaySet(d: unknown): DaySet {
  const src = (d ?? {}) as Record<string, unknown>;
  return {
    date: asStr(src.date),
    announcement: src.announcement ? String(src.announcement) : undefined,
    countdownRows: normRows(src.countdownRows),
    schedule: normSchedule(src.schedule),
  };
}

// Empty times sort last; otherwise ISO strings compare lexically.
function rowTimeCmp(a: CountdownRow, b: CountdownRow): number {
  if (!a.time) return 1;
  if (!b.time) return -1;
  return a.time.localeCompare(b.time);
}

export function migrateEvent(raw: unknown): EventData {
  const r = (raw ?? {}) as Record<string, unknown>;
  const base = {
    id: asStr(r.id),
    name: r.name != null ? String(r.name) : undefined,
    appId: r.appId != null ? String(r.appId) : undefined,
    status: (r.status as EventStatus) ?? "draft",
    announcement: asStr(r.announcement),
    highlightKeywords: Array.isArray(r.highlightKeywords) ? r.highlightKeywords.map(String) : undefined,
  };

  // Already day-set shaped: normalize the shape only. Do NOT re-sort the days
  // or their rows -- the admin edits days/rows in place and persists a
  // positional selectedDayIndex, so re-ordering on every load would desync it.
  if (Array.isArray(r.days)) {
    return { ...base, days: r.days.map(normDaySet) };
  }

  // Legacy: build days[] from scheduleDays + top-level countdownRows.
  const map = new Map<string, DaySet>();
  const getOrCreate = (date: string): DaySet => {
    let d = map.get(date);
    if (!d) {
      d = { date, announcement: undefined, countdownRows: [], schedule: [] };
      map.set(date, d);
    }
    return d;
  };

  // 1) Seed schedule + per-day announcement from scheduleDays.
  const scheduleDays = Array.isArray(r.scheduleDays) ? r.scheduleDays : [];
  for (const sd of scheduleDays) {
    const src = (sd ?? {}) as Record<string, unknown>;
    const d = getOrCreate(asStr(src.date));
    // Merge (don't overwrite) so two scheduleDays sharing a date -- e.g. two
    // blank-date days -- keep all their items rather than losing the first.
    d.schedule = d.schedule.concat(normSchedule(src.items));
    if (src.announcement && !d.announcement) d.announcement = String(src.announcement);
  }

  // 2) Distribute countdown rows by the ISO-date prefix of their time.
  const undated: CountdownRow[] = [];
  for (const cr of normRows(r.countdownRows)) {
    if (ISO_DATE.test(cr.time) && !Number.isNaN(Date.parse(cr.time))) {
      getOrCreate(cr.time.slice(0, 10)).countdownRows.push(cr);
    } else {
      undated.push(cr);
    }
  }

  // 3) Undated rows -> the earliest dated day-set, else a single "" bucket.
  if (undated.length) {
    const datedKeys = [...map.keys()].filter((k) => k !== "").sort();
    getOrCreate(datedKeys.length ? datedKeys[0] : "").countdownRows.push(...undated);
  }

  // 4) Sort each day's rows, then sort days by date ("" first).
  const days = [...map.values()];
  for (const d of days) d.countdownRows.sort(rowTimeCmp);
  days.sort((a, b) => a.date.localeCompare(b.date));

  return { ...base, days };
}
