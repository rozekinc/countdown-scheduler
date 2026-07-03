import type { App, AppsData, EventData } from "./types";
import { defaultLayoutForApp, type LayoutDoc } from "./layout";
import { dataBaseUrl } from "./config";

// Prefix for every data fetch. On a github.io deployment this points at
// raw.githubusercontent.com for the live repo, so admin/assistant data edits
// show up here WITHOUT a Pages rebuild (data is decoupled from CI). Off
// github.io it's "" and the relative data/ paths are used (see config.ts).
// Computed once at load -- the deployment target doesn't change mid-session.
const BASE = dataBaseUrl();
const APPS_URL = `${BASE}data/apps.json`;
const EVENTS_DIR = `${BASE}data/events`;
const ARCHIVE_DIR = `${BASE}data/archive`;
const REFRESH_INTERVAL_MS = 30000;
// "admin picks, the TV updates" latency for a single physical display --
// there's no server/websocket to push a change, so polling is the only
// mechanism. Data is read from raw.githubusercontent.com (the live repo), so
// this is kept modest rather than at a couple seconds, to stay well clear of
// any anonymous-fetch abuse throttling while still feeling near-immediate.
const APPS_POLL_INTERVAL_MS = 10000;
const ARCHIVE_YEAR_LOOKBACK = 6;

function cacheKey(appId: string): string {
  return `countdown-scheduler:event:${appId}`;
}

function readCache(appId: string): EventData | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(appId));
    if (!raw) return null;
    return JSON.parse(raw) as EventData;
  } catch (err) {
    console.warn("キャッシュの読み込みに失敗しました:", err);
    return null;
  }
}

function writeCache(appId: string, data: EventData): void {
  try {
    window.localStorage.setItem(cacheKey(appId), JSON.stringify(data));
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

export async function loadApps(): Promise<AppsData> {
  const data = await fetchJson<AppsData>(APPS_URL);
  if (!data || !Array.isArray(data.apps) || data.apps.length === 0) {
    throw new Error("apps.json の読み込みに失敗しました");
  }
  return data;
}

/** Loads the per-app layout (data/layouts/<appId>.json). Falls back to the
 * built-in base layout when the file is absent (or malformed), so a display
 * with no authored layout looks exactly like the pre-editor default. */
export async function loadLayout(appId: string): Promise<LayoutDoc> {
  const data = await fetchJson<LayoutDoc>(`${BASE}data/layouts/${appId}.json`);
  if (!data || !Array.isArray(data.items)) return defaultLayoutForApp(appId);
  return data;
}

/** True when this page was loaded with an explicit ?app= that matched a
 * real app -- such a screen is pinned to that app and never follows the
 * admin's "what's live on the display" selection. */
export function isPinnedByUrl(apps: App[]): boolean {
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get("app");
  return requestedId ? apps.some((app) => app.id === requestedId) : false;
}

export function resolveActiveApp(data: AppsData): App {
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get("app");
  const pinned = requestedId ? data.apps.find((app) => app.id === requestedId) : undefined;
  if (pinned) return pinned;

  const selected = data.selectedAppId
    ? data.apps.find((app) => app.id === data.selectedAppId)
    : undefined;
  return selected ?? data.apps[0];
}

/**
 * Polls data/apps.json and reports three things the admin can change live,
 * with no reload needed on the display end:
 *  - onAppSwitch: which app is showing (selectedAppId) -- no-op on a
 *    screen pinned via ?app=, which is meant to stay put regardless.
 *  - onModeChange: which display-mode preset is active (displayModeId) --
 *    applies on every screen, pinned or not, since it's a readability
 *    setting for the physical TV, not an app-identity choice.
 *  - onAspectRatioChange: which aspect-ratio preset the stage is
 *    letterboxed to (aspectRatioId) -- same reasoning as onModeChange,
 *    applies everywhere regardless of pinning.
 *  - onContentVersionChange: the content version/date the published data
 *    carries (contentVersion/contentUpdatedAt) -- applies on every screen,
 *    pinned or not, since it just reflects "which data am I looking at".
 *  - onDisplaySettingsChange: the chrome-level presentation settings
 *    (displayLanguage / textScale / labels) -- applies on every screen,
 *    pinned or not, so the display re-applies its labels, language and text
 *    scale live without a reload.
 * Countdown vs. schedule is NOT here -- it's a local, client-side-only
 * toggle button on the display itself (see main.ts's setupScreenToggle),
 * never written to data/apps.json.
 */
export function watchDisplaySettings(
  initialApps: AppsData,
  onAppSwitch: (app: App) => void,
  onModeChange: (displayModeId: string | null) => void,
  onAspectRatioChange: (aspectRatioId: string | null) => void,
  onContentVersionChange: (data: AppsData) => void,
  onDisplaySettingsChange: (data: AppsData) => void,
): void {
  const pinned = isPinnedByUrl(initialApps.apps);
  let currentAppId = resolveActiveApp(initialApps).id;
  let currentModeId = initialApps.displayModeId ?? null;
  let currentAspectRatioId = initialApps.aspectRatioId ?? null;
  let currentContentVersion = initialApps.contentVersion ?? null;
  let currentContentUpdatedAt = initialApps.contentUpdatedAt ?? null;
  let currentDisplayLanguage = initialApps.displayLanguage ?? null;
  let currentTextScale = initialApps.textScale ?? null;
  let currentLabelsJson = JSON.stringify(initialApps.labels ?? null);
  let currentRedFlagJson = JSON.stringify(initialApps.redFlag ?? null);

  window.setInterval(() => {
    void (async () => {
      const fresh = await fetchJson<AppsData>(APPS_URL);
      if (!fresh || !Array.isArray(fresh.apps) || fresh.apps.length === 0) return;

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

      if (pinned) return;
      const resolved = resolveActiveApp(fresh);
      if (resolved.id !== currentAppId) {
        currentAppId = resolved.id;
        onAppSwitch(resolved);
      }
    })();
  }, APPS_POLL_INTERVAL_MS);
}

async function fetchEventFromEvents(eventId: string): Promise<EventData | null> {
  return fetchJson<EventData>(`${EVENTS_DIR}/${eventId}.json`);
}

async function fetchEventFromArchive(eventId: string): Promise<EventData | null> {
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
  /** Stops polling. Call this before switching to a different app's data
   * source so two sources never update the screen at once. */
  stop(): void;
}

export function createEventDataSource(app: App): EventDataSource {
  let current: EventData | null = readCache(app.id);
  let intervalId: number | undefined;
  const listeners: Array<(data: EventData) => void> = [];

  async function refresh(): Promise<void> {
    const fresh = await fetchEvent(app.activeEventId);
    if (fresh) {
      current = fresh;
      writeCache(app.id, fresh);
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
