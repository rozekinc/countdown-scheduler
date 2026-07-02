import { promises as fs } from "node:fs";
import path from "node:path";
import { assertSafeDate, assertSafeId, resolveInData } from "./fs-guard.js";
import {
  type AppEntry,
  type CountdownRow,
  DataNotFoundError,
  type EventData,
  type EventStatus,
  type ScheduleRow,
  eventDraftExists,
  findEvent,
  listAllEventFiles,
  loadEventOrThrow,
  readAppsFile,
  readEventAt,
  saveEvent,
  writeAppsFile,
} from "./data-store.js";

/** Business logic for every non-publish MCP tool. index.ts only wires these up to schemas. */

function validateRow(row: unknown): ScheduleRow {
  if (typeof row !== "object" || row === null) {
    throw new Error('row must be an object with string "A" and "B" fields');
  }
  const r = row as Record<string, unknown>;
  if (typeof r.A !== "string" || typeof r.B !== "string") {
    throw new Error('row must have string "A" and "B" fields');
  }
  if (r.time === undefined || r.time === null || r.time === "") {
    return { A: r.A, B: r.B };
  }
  return { A: r.A, B: r.B, time: validateTime("row.time", r.time) };
}

function validateTime(label: string, value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a parseable ISO datetime string`);
  }
  return value;
}

function validateTitle(label: string, value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function sortScheduleDays(data: EventData): void {
  data.scheduleDays.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface AppSummary {
  id: string;
  name: string;
  theme: AppEntry["theme"];
  activeEventId: string;
  activeEventStatus: EventStatus | null;
  /** True if this is the app currently shown on the primary display (the
   * one with no ?app= override). */
  isSelected: boolean;
}

export interface ListAppsResult {
  apps: AppSummary[];
  selectedAppId: string | null;
  /** The display-mode preset id (see src/displayModes.ts) currently applied
   * on every display screen. Null means "standard". */
  displayModeId: string | null;
}

/** The exact set of display-mode ids defined in src/displayModes.ts. Keep in sync. */
export const DISPLAY_MODE_IDS = ["standard", "daylight-contrast", "dark-glare"] as const;
export type DisplayModeId = (typeof DISPLAY_MODE_IDS)[number];

export async function listApps(repoRoot: string): Promise<ListAppsResult> {
  const appsFile = await readAppsFile(repoRoot);
  const selectedAppId = appsFile.selectedAppId ?? appsFile.apps[0]?.id ?? null;
  const displayModeId = appsFile.displayModeId ?? null;
  const apps: AppSummary[] = [];
  for (const app of appsFile.apps) {
    let activeEventStatus: EventStatus | null = null;
    if (app.activeEventId) {
      const found = await findEvent(repoRoot, app.activeEventId).catch(() => null);
      if (found) activeEventStatus = found.data.status;
    }
    apps.push({
      id: app.id,
      name: app.name,
      theme: app.theme,
      activeEventId: app.activeEventId,
      activeEventStatus,
      isSelected: app.id === selectedAppId,
    });
  }
  return { apps, selectedAppId, displayModeId };
}

/**
 * Sets which app the primary display (no ?app= override) currently shows.
 * Screens loaded with an explicit ?app= query param ignore this entirely --
 * they stay pinned to that one app. This is the "swap what's live on the
 * TV" control; it does not touch which event is active within an app --
 * see setActiveEvent for that.
 */
export async function setSelectedApp(repoRoot: string, appId: string): Promise<ListAppsResult> {
  assertSafeId("appId", appId);
  const appsFile = await readAppsFile(repoRoot);
  if (!appsFile.apps.some((a) => a.id === appId)) {
    throw new DataNotFoundError(`no app with id ${JSON.stringify(appId)}`);
  }
  appsFile.selectedAppId = appId;
  await writeAppsFile(repoRoot, appsFile);
  return listApps(repoRoot);
}

/**
 * Sets data/apps.json's displayModeId, a readability preset (see
 * src/displayModes.ts) applied on EVERY display screen -- unlike
 * setSelectedApp, this is not ignored by a screen pinned via ?app=, since
 * it's a physical-TV lighting/contrast setting, not an app-identity choice.
 * Rejects anything outside the exact three known preset ids rather than
 * writing an arbitrary string into apps.json, since this value drives real
 * CSS on the display.
 */
export async function setSelectedDisplayMode(
  repoRoot: string,
  displayModeId: string,
): Promise<{ displayModeId: DisplayModeId }> {
  if (!(DISPLAY_MODE_IDS as readonly string[]).includes(displayModeId)) {
    throw new Error(
      `displayModeId must be one of ${DISPLAY_MODE_IDS.map((id) => JSON.stringify(id)).join(", ")} ` +
        `(got ${JSON.stringify(displayModeId)})`,
    );
  }
  const appsFile = await readAppsFile(repoRoot);
  appsFile.displayModeId = displayModeId;
  await writeAppsFile(repoRoot, appsFile);
  return { displayModeId: displayModeId as DisplayModeId };
}

export interface EventSummary {
  id: string;
  appId: string;
  status: EventStatus;
  path: string;
  archived: boolean;
}

export async function listEvents(
  repoRoot: string,
  filter?: { status?: EventStatus },
): Promise<{ events: EventSummary[] }> {
  const refs = await listAllEventFiles(repoRoot);
  const events: EventSummary[] = [];
  for (const ref of refs) {
    const data = await readEventAt(ref.filePath);
    if (filter?.status && data.status !== filter.status) continue;
    events.push({
      id: data.id,
      appId: data.appId,
      status: data.status,
      path: ref.relPath,
      archived: ref.archived,
    });
  }
  return { events };
}

export async function getEvent(repoRoot: string, eventId: string): Promise<EventData> {
  const found = await loadEventOrThrow(repoRoot, eventId);
  return found.data;
}

export interface CreateDraftEventSeed {
  announcement?: string;
  countdownRows?: CountdownRow[];
  scheduleDays?: EventData["scheduleDays"];
}

export async function createDraftEvent(
  repoRoot: string,
  appId: string,
  id: string,
  seed?: CreateDraftEventSeed,
): Promise<EventData> {
  assertSafeId("appId", appId);
  assertSafeId("id", id);
  if (await eventDraftExists(repoRoot, id)) {
    throw new Error(`an event with id ${JSON.stringify(id)} already exists`);
  }
  const data: EventData = {
    id,
    appId,
    status: "draft",
    announcement: seed?.announcement ?? "",
    countdownRows: seed?.countdownRows ?? [],
    scheduleDays: seed?.scheduleDays ?? [],
  };
  const filePath = resolveInData(repoRoot, "events", `${id}.json`);
  await saveEvent(filePath, data);
  return data;
}

export async function addScheduleRow(
  repoRoot: string,
  eventId: string,
  date: string,
  row: unknown,
): Promise<EventData> {
  assertSafeDate("date", date);
  const safeRow = validateRow(row);
  const loaded = await loadEventOrThrow(repoRoot, eventId);
  const { data } = loaded;
  let day = data.scheduleDays.find((d) => d.date === date);
  if (!day) {
    day = { date, announcement: "", rows: [] };
    data.scheduleDays.push(day);
  }
  day.rows.push(safeRow);
  sortScheduleDays(data);
  await saveEvent(loaded.filePath, data);
  return data;
}

export async function editScheduleRow(
  repoRoot: string,
  eventId: string,
  date: string,
  rowIndex: number,
  row: unknown,
): Promise<EventData> {
  assertSafeDate("date", date);
  const safeRow = validateRow(row);
  const loaded = await loadEventOrThrow(repoRoot, eventId);
  const { data } = loaded;
  const day = data.scheduleDays.find((d) => d.date === date);
  if (!day) {
    throw new DataNotFoundError(`no scheduleDays entry for date ${JSON.stringify(date)}`);
  }
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= day.rows.length) {
    throw new Error(`rowIndex ${rowIndex} out of range (0..${day.rows.length - 1})`);
  }
  day.rows[rowIndex] = safeRow;
  await saveEvent(loaded.filePath, data);
  return data;
}

export async function addCountdownRow(
  repoRoot: string,
  eventId: string,
  title: string,
  time: string,
): Promise<EventData> {
  const safeTitle = validateTitle("title", title);
  const safeTime = validateTime("time", time);
  const loaded = await loadEventOrThrow(repoRoot, eventId);
  loaded.data.countdownRows.push({ title: safeTitle, time: safeTime });
  await saveEvent(loaded.filePath, loaded.data);
  return loaded.data;
}

export interface CountdownRowPatch {
  title?: string;
  time?: string;
}

export async function editCountdownRow(
  repoRoot: string,
  eventId: string,
  index: number,
  patch: CountdownRowPatch,
): Promise<EventData> {
  const loaded = await loadEventOrThrow(repoRoot, eventId);
  const rows = loaded.data.countdownRows;
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
    throw new Error(`index ${index} out of range (0..${rows.length - 1})`);
  }
  if (patch.title !== undefined) {
    rows[index]!.title = validateTitle("patch.title", patch.title);
  }
  if (patch.time !== undefined) {
    rows[index]!.time = validateTime("patch.time", patch.time);
  }
  await saveEvent(loaded.filePath, loaded.data);
  return loaded.data;
}

export async function setActiveEvent(
  repoRoot: string,
  appId: string,
  eventId: string,
): Promise<{ app: AppEntry; event: EventData }> {
  assertSafeId("appId", appId);
  const appsFile = await readAppsFile(repoRoot);
  const app = appsFile.apps.find((a) => a.id === appId);
  if (!app) {
    throw new DataNotFoundError(`no app with id ${JSON.stringify(appId)}`);
  }
  const loaded = await loadEventOrThrow(repoRoot, eventId);
  app.activeEventId = eventId;
  loaded.data.status = "active";
  await writeAppsFile(repoRoot, appsFile);
  await saveEvent(loaded.filePath, loaded.data);
  return { app, event: loaded.data };
}

function earliestYear(data: EventData): number {
  const timestamps: number[] = [];
  for (const row of data.countdownRows) {
    const t = Date.parse(row.time);
    if (!Number.isNaN(t)) timestamps.push(t);
  }
  for (const day of data.scheduleDays) {
    const t = Date.parse(day.date);
    if (!Number.isNaN(t)) timestamps.push(t);
  }
  if (timestamps.length === 0) return new Date().getUTCFullYear();
  return new Date(Math.min(...timestamps)).getUTCFullYear();
}

export async function closeEvent(
  repoRoot: string,
  eventId: string,
): Promise<EventData & { archivedPath: string }> {
  const loaded = await loadEventOrThrow(repoRoot, eventId);
  if (loaded.archived) {
    throw new Error(`event ${JSON.stringify(eventId)} is already archived at ${loaded.relPath}`);
  }
  loaded.data.status = "ended";
  const year = String(earliestYear(loaded.data));
  const archivePath = resolveInData(repoRoot, "archive", year, `${eventId}.json`);
  await saveEvent(archivePath, loaded.data);
  await fs.unlink(loaded.filePath);
  return {
    ...loaded.data,
    archivedPath: path.relative(repoRoot, archivePath).split(path.sep).join("/"),
  };
}
