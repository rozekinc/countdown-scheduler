import { promises as fs } from "node:fs";
import path from "node:path";
import { assertSafeId, dataDir, resolveInData } from "./fs-guard.js";

export interface Theme {
  primary: string;
  accent: string;
  background: string;
}

export interface AppEntry {
  id: string;
  name: string;
  theme: Theme;
  activeEventId: string;
}

export interface AppsFile {
  apps: AppEntry[];
  /** Which app the primary display (no ?app= override) should currently
   * show. Set via the set_selected_app tool or the admin app. */
  selectedAppId?: string | null;
}

export type EventStatus = "draft" | "active" | "ended";

export interface CountdownRow {
  title: string;
  time: string;
}

export interface ScheduleRow {
  A: string;
  B: string;
  /** Optional ISO datetime. When set, the display grays this row out once
   * it's passed and highlights it while it's next up. */
  time?: string;
}

export interface ScheduleDay {
  date: string;
  announcement: string;
  rows: ScheduleRow[];
}

export interface EventData {
  id: string;
  appId: string;
  status: EventStatus;
  announcement: string;
  countdownRows: CountdownRow[];
  scheduleDays: ScheduleDay[];
}

export class DataNotFoundError extends Error {}

async function readJsonFile<T>(filePath: string): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new DataNotFoundError(`file not found: ${filePath}`);
    }
    throw err;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`invalid JSON in ${filePath}: ${(err as Error).message}`);
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const text = JSON.stringify(data, null, 2) + "\n";
  await fs.writeFile(filePath, text, "utf8");
}

export function appsFilePath(repoRoot: string): string {
  return resolveInData(repoRoot, "apps.json");
}

export function eventsDir(repoRoot: string): string {
  return resolveInData(repoRoot, "events");
}

export function archiveDir(repoRoot: string): string {
  return resolveInData(repoRoot, "archive");
}

export async function readAppsFile(repoRoot: string): Promise<AppsFile> {
  return readJsonFile<AppsFile>(appsFilePath(repoRoot));
}

export async function writeAppsFile(repoRoot: string, data: AppsFile): Promise<void> {
  await writeJsonFile(appsFilePath(repoRoot), data);
}

async function listJsonFilesIn(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => path.join(dir, e.name));
}

export interface EventFileRef {
  filePath: string;
  /** Path relative to REPO_ROOT, e.g. "data/events/sample-event.json". */
  relPath: string;
  archived: boolean;
}

/** Every event JSON file currently under data/events and data/archive. */
export async function listAllEventFiles(repoRoot: string): Promise<EventFileRef[]> {
  const refs: EventFileRef[] = [];

  const evDir = eventsDir(repoRoot);
  for (const filePath of await listJsonFilesIn(evDir)) {
    refs.push({
      filePath,
      relPath: path.relative(repoRoot, filePath).split(path.sep).join("/"),
      archived: false,
    });
  }

  const arDir = archiveDir(repoRoot);
  let yearEntries: import("node:fs").Dirent[] = [];
  try {
    yearEntries = await fs.readdir(arDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  for (const yearEntry of yearEntries) {
    if (!yearEntry.isDirectory()) continue;
    const yearDir = path.join(arDir, yearEntry.name);
    for (const filePath of await listJsonFilesIn(yearDir)) {
      refs.push({
        filePath,
        relPath: path.relative(repoRoot, filePath).split(path.sep).join("/"),
        archived: true,
      });
    }
  }

  return refs;
}

export interface LoadedEvent {
  filePath: string;
  relPath: string;
  archived: boolean;
  data: EventData;
}

/** Finds an event by id, checking data/events first, then data/archive/<year>/. */
export async function findEvent(repoRoot: string, eventId: string): Promise<LoadedEvent | null> {
  assertSafeId("eventId", eventId);

  const directPath = resolveInData(repoRoot, "events", `${eventId}.json`);
  try {
    const data = await readJsonFile<EventData>(directPath);
    return {
      filePath: directPath,
      relPath: path.relative(repoRoot, directPath).split(path.sep).join("/"),
      archived: false,
      data,
    };
  } catch (err) {
    if (!(err instanceof DataNotFoundError)) throw err;
  }

  for (const ref of await listAllEventFiles(repoRoot)) {
    if (!ref.archived) continue;
    if (path.basename(ref.filePath) === `${eventId}.json`) {
      const data = await readJsonFile<EventData>(ref.filePath);
      return { ...ref, data };
    }
  }

  return null;
}

/** Same as findEvent but throws DataNotFoundError instead of returning null. */
export async function loadEventOrThrow(repoRoot: string, eventId: string): Promise<LoadedEvent> {
  const found = await findEvent(repoRoot, eventId);
  if (!found) {
    throw new DataNotFoundError(`no event found with id ${JSON.stringify(eventId)}`);
  }
  return found;
}

export async function saveEvent(filePath: string, data: EventData): Promise<void> {
  await writeJsonFile(filePath, data);
}

/** Reads a single event JSON file whose path was already resolved (e.g. via listAllEventFiles). */
export async function readEventAt(filePath: string): Promise<EventData> {
  return readJsonFile<EventData>(filePath);
}

export async function eventDraftExists(repoRoot: string, eventId: string): Promise<boolean> {
  const found = await findEvent(repoRoot, eventId);
  return found !== null;
}

export { writeJsonFile, dataDir };
