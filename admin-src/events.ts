// Loads every event (active + archived) so the left-panel tree can show each
// event as a collapsible group with its days beneath. Replaces the old
// "All events" overview page.

import { listDir, getJsonFile } from "./githubApi";
import { migrateEvent } from "./eventMigrate";
import type { DaySet, EventData, EventStatus } from "./types";

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

function daySummaries(days: DaySet[]): Array<{ date: string; itemCount: number }> {
  return days.map((d) => ({ date: d.date, itemCount: d.schedule.length }));
}

function earliestOf(data: EventData): string | null {
  const dates: string[] = [];
  for (const day of data.days) {
    if (day.date) dates.push(day.date);
    for (const row of day.countdownRows) if (row.time) dates.push(row.time.slice(0, 10));
  }
  if (dates.length === 0) return null;
  dates.sort();
  return dates[0];
}

async function loadFromDir(dirPath: string, archived: boolean): Promise<EventSummary[]> {
  const entries = await listDir(dirPath);
  // Fetch every event file (and recurse into archive/<year>/) CONCURRENTLY.
  // The old sequential await-in-a-loop meant N round-trips back to back, which
  // is what made the first load crawl once there were several events.
  const nested = await Promise.all(
    entries.map(async (entry): Promise<EventSummary[]> => {
      if (entry.type === "dir") {
        return loadFromDir(entry.path, archived); // data/archive/<year>/
      }
      if (!entry.name.endsWith(".json")) return [];
      const file = await getJsonFile<EventData>(entry.path);
      if (!file) return [];
      // Normalize legacy events to the day-set shape before summarizing.
      const data = migrateEvent(file.data);
      return [
        {
          id: data.id,
          name: data.name || data.id,
          status: data.status,
          archived,
          path: entry.path,
          days: daySummaries(data.days),
          earliestDate: earliestOf(data),
        },
      ];
    }),
  );
  return nested.flat();
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
