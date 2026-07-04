import type { DisplayConfig, EventData } from "./types";
import { defaultLayout, migrateLayout, LAYOUT_VERSION, type LayoutDoc, type ScheduleEntry } from "./layout";
import { dataBaseUrl } from "./config";

// Prefix for every data fetch. On a github.io deployment this points at
// raw.githubusercontent.com for the live repo, so admin/assistant data edits
// show up here WITHOUT a Pages rebuild (data is decoupled from CI). Off
// github.io it's "" and the relative data/ paths are used (see config.ts).
const BASE = dataBaseUrl();
const CONFIG_URL = `${BASE}data/display.json`;
const LAYOUT_URL = `${BASE}data/layout.json`;
const EVENTS_DIR = `${BASE}data/events`;
const ARCHIVE_DIR = `${BASE}data/archive`;
const REFRESH_INTERVAL_MS = 30000;
// "admin picks, the TV updates" latency for a single display -- there's no
// server/websocket to push, so polling is the only mechanism.
const CONFIG_POLL_INTERVAL_MS = 10000;
const ARCHIVE_YEAR_LOOKBACK = 6;

function cacheKey(eventId: string): string {
  return `countdown-scheduler:event:${eventId}`;
}

function readCache(eventId: string): EventData | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(eventId));
    if (!raw) return null;
    return JSON.parse(raw) as EventData;
  } catch (err) {
    console.warn("キャッシュの読み込みに失敗しました:", err);
    return null;
  }
}

function writeCache(eventId: string, data: EventData): void {
  try {
    window.localStorage.setItem(cacheKey(eventId), JSON.stringify(data));
  } catch (err) {
    console.warn("キャッシュの保存に失敗しました:", err);
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(`${url}?nocache=${Date.now()}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`取得に失敗しました (${url}):`, err);
    return null;
  }
}

export async function loadConfig(): Promise<DisplayConfig> {
  const data = await fetchJson<DisplayConfig>(CONFIG_URL);
  if (!data) throw new Error("display.json の読み込みに失敗しました");
  return data;
}

/** Loads the single layout (data/layout.json). Falls back to the built-in base
 * layout when the file is absent (or malformed), so the display looks like the
 * original fixed layout even before a layout is authored. A pre-v2 layout is
 * migrated in place (split titles + schedule item); the converted schedule
 * item is seeded from the active event's schedule so no content is lost. */
export async function loadLayout(): Promise<LayoutDoc> {
  const data = await fetchJson<LayoutDoc>(LAYOUT_URL);
  if (!data || !Array.isArray(data.items)) return defaultLayout();
  if ((data.version ?? 0) >= LAYOUT_VERSION) return data;
  return migrateLayout(data, await loadActiveScheduleEntries());
}

/** Flatten the active event's schedule days into title/detail rows, to seed a
 * migrated `schedule` item. Best-effort: returns undefined if nothing loads. */
async function loadActiveScheduleEntries(): Promise<ScheduleEntry[] | undefined> {
  const config = await fetchJson<DisplayConfig>(CONFIG_URL);
  const eventId = config?.activeEventId ?? null;
  if (!eventId) return undefined;
  const event = await fetchEvent(eventId);
  if (!event) return undefined;
  return event.scheduleDays.flatMap((day) =>
    day.items.map((i) => ({ title: i.title, detail: i.detail })),
  );
}

/**
 * Polls data/display.json and reports what the admin can change live, with no
 * reload needed on the display end:
 *  - onActiveEventChange: which event is being counted down (activeEventId).
 *  - onModeChange: which display-mode preset is active (colors).
 *  - onAspectRatioChange: which aspect-ratio preset the stage uses.
 *  - onContentVersionChange: the content version/date (also re-pulls layout).
 *  - onDisplaySettingsChange: language / textScale / labels / redFlag.
 * Countdown vs. schedule is NOT here -- it's a local, client-side-only toggle
 * on the display itself (see main.ts's setupScreenToggle).
 */
export function watchDisplaySettings(
  initial: DisplayConfig,
  onActiveEventChange: (eventId: string | null) => void,
  onModeChange: (displayModeId: string | null) => void,
  onAspectRatioChange: (aspectRatioId: string | null) => void,
  onContentVersionChange: (data: DisplayConfig) => void,
  onDisplaySettingsChange: (data: DisplayConfig) => void,
): void {
  let currentEventId = initial.activeEventId ?? null;
  let currentModeId = initial.displayModeId ?? null;
  let currentAspectRatioId = initial.aspectRatioId ?? null;
  let currentContentVersion = initial.contentVersion ?? null;
  let currentContentUpdatedAt = initial.contentUpdatedAt ?? null;
  let currentDisplayLanguage = initial.displayLanguage ?? null;
  let currentTextScale = initial.textScale ?? null;
  let currentLabelsJson = JSON.stringify(initial.labels ?? null);
  let currentRedFlagJson = JSON.stringify(initial.redFlag ?? null);

  window.setInterval(() => {
    void (async () => {
      const fresh = await fetchJson<DisplayConfig>(CONFIG_URL);
      if (!fresh) return;

      const freshModeId = fresh.displayModeId ?? null;
      if (freshModeId !== currentModeId) {
        currentModeId = freshModeId;
        onModeChange(currentModeId);
      }

      const freshAspectRatioId = fresh.aspectRatioId ?? null;
      if (freshAspectRatioId !== currentAspectRatioId) {
        currentAspectRatioId = freshAspectRatioId;
        onAspectRatioChange(currentAspectRatioId);
      }

      const freshContentVersion = fresh.contentVersion ?? null;
      const freshContentUpdatedAt = fresh.contentUpdatedAt ?? null;
      if (
        freshContentVersion !== currentContentVersion ||
        freshContentUpdatedAt !== currentContentUpdatedAt
      ) {
        currentContentVersion = freshContentVersion;
        currentContentUpdatedAt = freshContentUpdatedAt;
        onContentVersionChange(fresh);
      }

      const freshDisplayLanguage = fresh.displayLanguage ?? null;
      const freshTextScale = fresh.textScale ?? null;
      const freshLabelsJson = JSON.stringify(fresh.labels ?? null);
      const freshRedFlagJson = JSON.stringify(fresh.redFlag ?? null);
      if (
        freshDisplayLanguage !== currentDisplayLanguage ||
        freshTextScale !== currentTextScale ||
        freshLabelsJson !== currentLabelsJson ||
        freshRedFlagJson !== currentRedFlagJson
      ) {
        currentDisplayLanguage = freshDisplayLanguage;
        currentTextScale = freshTextScale;
        currentLabelsJson = freshLabelsJson;
        currentRedFlagJson = freshRedFlagJson;
        onDisplaySettingsChange(fresh);
      }

      const freshEventId = fresh.activeEventId ?? null;
      if (freshEventId !== currentEventId) {
        currentEventId = freshEventId;
        onActiveEventChange(currentEventId);
      }
    })();
  }, CONFIG_POLL_INTERVAL_MS);
}

async function fetchEventFromEvents(eventId: string): Promise<EventData | null> {
  return fetchJson<EventData>(`${EVENTS_DIR}/${eventId}.json`);
}

async function fetchEventFromArchive(eventId: string): Promise<EventData | null> {
  // Archived events now live in a single archive folder (data/archive/<id>.json).
  const flat = await fetchJson<EventData>(`${ARCHIVE_DIR}/${eventId}.json`);
  if (flat) return flat;
  // Fallback: older per-year archive layout (data/archive/<year>/<id>.json).
  const currentYear = new Date().getFullYear();
  for (let offset = 0; offset < ARCHIVE_YEAR_LOOKBACK; offset++) {
    const year = currentYear - offset;
    const data = await fetchJson<EventData>(`${ARCHIVE_DIR}/${year}/${eventId}.json`);
    if (data) return data;
  }
  return null;
}

async function fetchEvent(eventId: string): Promise<EventData | null> {
  const active = await fetchEventFromEvents(eventId);
  if (active) return active;
  return fetchEventFromArchive(eventId);
}

export interface EventDataSource {
  getCurrent(): EventData | null;
  onUpdate(listener: (data: EventData) => void): void;
  start(): void;
  /** Stops polling. Call before switching to a different event's source so two
   * sources never update the screen at once. */
  stop(): void;
}

/** Polls one event's JSON (by id) and feeds updates to listeners. */
export function createEventDataSource(eventId: string): EventDataSource {
  let current: EventData | null = readCache(eventId);
  let intervalId: number | undefined;
  const listeners: Array<(data: EventData) => void> = [];

  async function refresh(): Promise<void> {
    const fresh = await fetchEvent(eventId);
    if (fresh) {
      current = fresh;
      writeCache(eventId, fresh);
      listeners.forEach((listener) => listener(fresh));
    } else {
      console.warn("イベントデータの取得に失敗しました。以前のデータで継続します。");
    }
  }

  return {
    getCurrent(): EventData | null {
      return current;
    },
    onUpdate(listener: (data: EventData) => void): void {
      listeners.push(listener);
    },
    start(): void {
      void refresh();
      intervalId = window.setInterval(() => {
        void refresh();
      }, REFRESH_INTERVAL_MS);
    },
    stop(): void {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    },
  };
}
