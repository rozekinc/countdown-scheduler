// Loads every event (active + archived) so the left-panel tree can show each
// event as a collapsible group with its days beneath. Replaces the old
// "All events" overview page.

import { listDir, getJsonFile } from "./githubApi";
import type { EventData, EventStatus, ScheduleDay } from "./types";

export interface EventSummary {
  id: string;
  name: string;
  status: EventStatus;
  archived: boolean;
  path: string;
  /** The event's day dates, in file order, for the tree's day sub-items. */
  days: Array<{ date: string; itemCount: number }>;
  earliestDate: string | null;
}

function daySummaries(days: ScheduleDay[]): Array<{ date: string; itemCount: number }> {
  return days.map((d) => ({ date: d.date, itemCount: d.items.length }));
}

function earliestOf(data: EventData): string | null {
  const dates: string[] = [];
  for (const row of data.countdownRows) if (row.time) dates.push(row.time.slice(0, 10));
  for (const day of data.scheduleDays) if (day.date) dates.push(day.date);
  if (dates.length === 0) return null;
  dates.sort();
  return dates[0];
}

async function loadFromDir(dirPath: string, archived: boolean): Promise<EventSummary[]> {
  const entries = await listDir(dirPath);
  const out: EventSummary[] = [];
  for (const entry of entries) {
    if (entry.type === "dir") {
      // data/archive/<year>/ -- one level deeper.
      out.push(...(await loadFromDir(entry.path, archived)));
      continue;
    }
    if (!entry.name.endsWith(".json")) continue;
    const file = await getJsonFile<EventData>(entry.path);
    if (!file) continue;
    out.push({
      id: file.data.id,
      name: file.data.name || file.data.id,
      status: file.data.status,
      archived,
      path: entry.path,
      days: daySummaries(file.data.scheduleDays),
      earliestDate: earliestOf(file.data),
    });
  }
  return out;
}

/** Every event, active first then archived, each sorted by earliest date
 * descending (soonest/newest at the top). */
export async function loadAllEvents(): Promise<EventSummary[]> {
  const [active, archived] = await Promise.all([
    loadFromDir("data/events", false),
    loadFromDir("data/archive", true),
  ]);
  const byDateDesc = (a: EventSummary, b: EventSummary): number =>
    (b.earliestDate ?? "").localeCompare(a.earliestDate ?? "");
  active.sort(byDateDesc);
  archived.sort(byDateDesc);
  return [...active, ...archived];
}
