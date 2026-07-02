import { el, clear } from "./dom";
import { listDir, getJsonFile } from "./githubApi";
import { state } from "./state";
import type { EventData } from "./types";
import { t } from "./i18n";

export interface OverviewRow {
  id: string;
  appId: string;
  status: EventData["status"];
  archived: boolean;
  path: string;
  dayCount: number;
  countdownCount: number;
  earliestDate: string | null;
  latestDate: string | null;
}

function eventDateRange(data: EventData): { earliest: string | null; latest: string | null } {
  const dates: string[] = [];
  for (const row of data.countdownRows) {
    if (row.time) dates.push(row.time.slice(0, 10));
  }
  for (const day of data.scheduleDays) {
    if (day.date) dates.push(day.date);
  }
  if (dates.length === 0) return { earliest: null, latest: null };
  dates.sort();
  return { earliest: dates[0], latest: dates[dates.length - 1] };
}

async function loadEventsFromDir(dirPath: string, archived: boolean): Promise<OverviewRow[]> {
  const entries = await listDir(dirPath);
  const rows: OverviewRow[] = [];
  for (const entry of entries) {
    if (entry.type === "dir") {
      // data/archive/<year>/ -- one level deeper.
      rows.push(...(await loadEventsFromDir(entry.path, archived)));
      continue;
    }
    if (!entry.name.endsWith(".json")) continue;
    const file = await getJsonFile<EventData>(entry.path);
    if (!file) continue;
    const { earliest, latest } = eventDateRange(file.data);
    rows.push({
      id: file.data.id,
      appId: file.data.appId,
      status: file.data.status,
      archived,
      path: entry.path,
      dayCount: file.data.scheduleDays.length,
      countdownCount: file.data.countdownRows.length,
      earliestDate: earliest,
      latestDate: latest,
    });
  }
  return rows;
}

export async function loadAllEvents(): Promise<OverviewRow[]> {
  const [active, archived] = await Promise.all([
    loadEventsFromDir("data/events", false),
    loadEventsFromDir("data/archive", true),
  ]);
  const all = [...active, ...archived];
  all.sort((a, b) => (b.earliestDate ?? "").localeCompare(a.earliestDate ?? ""));
  return all;
}

function appName(appId: string): string {
  return state.apps.find((a) => a.id === appId)?.name ?? appId;
}

/**
 * A single table showing every event across every app -- draft, active,
 * and archived -- so the operator can see the whole picture (which app,
 * what dates, what status) and click straight into editing any of them,
 * instead of having to switch apps one at a time to find something.
 */
export async function renderOverview(
  container: HTMLElement,
  onSelectEvent: (appId: string, eventId: string) => void,
): Promise<void> {
  clear(container);
  container.append(el("p", { class: "muted" }, [t("overview.loading")]));

  let rows: OverviewRow[];
  try {
    rows = await loadAllEvents();
  } catch (err) {
    clear(container);
    container.append(
      el("p", { class: "muted status-error" }, [t("overview.loadFailed", { message: (err as Error).message })]),
    );
    return;
  }

  clear(container);

  if (rows.length === 0) {
    container.append(el("p", { class: "muted" }, [t("overview.empty")]));
    return;
  }

  const table = el("div", { class: "overview-table" });

  const header = el("div", { class: "overview-row overview-header" }, [
    el("span", {}, [t("overview.app")]),
    el("span", {}, [t("overview.event")]),
    el("span", {}, [t("overview.status")]),
    el("span", {}, [t("overview.dates")]),
    el("span", {}, [t("overview.daysRows")]),
  ]);
  table.append(header);

  for (const row of rows) {
    const dateLabel =
      row.earliestDate && row.latestDate
        ? row.earliestDate === row.latestDate
          ? row.earliestDate
          : `${row.earliestDate} – ${row.latestDate}`
        : t("overview.noDates");

    const rowEl = el(
      "button",
      { class: `overview-row overview-item status-${row.status}${row.archived ? " archived" : ""}` },
      [
        el("span", {}, [appName(row.appId)]),
        el("span", {}, [row.id]),
        el("span", { class: `event-status-badge status-${row.status}` }, [
          row.archived ? `${row.status} (archived)` : row.status,
        ]),
        el("span", {}, [dateLabel]),
        el("span", {}, [`${row.dayCount} / ${row.countdownCount}`]),
      ],
    );
    rowEl.addEventListener("click", () => onSelectEvent(row.appId, row.id));
    table.append(rowEl);
  }

  container.append(table);
}
