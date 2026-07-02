import type { App, AppsData, EventData } from "./types";

const APPS_URL = "data/apps.json";
const EVENTS_DIR = "data/events";
const ARCHIVE_DIR = "data/archive";
const REFRESH_INTERVAL_MS = 30000;
const APPS_POLL_INTERVAL_MS = 15000;
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
 * On an unpinned screen, polls data/apps.json and calls `onSwitch` whenever
 * the admin changes which app is live (selectedAppId). No-op on a screen
 * pinned via ?app= -- that one is meant to stay put regardless.
 */
export function watchSelectedApp(initialApps: AppsData, onSwitch: (app: App) => void): void {
  if (isPinnedByUrl(initialApps.apps)) return;

  let currentAppId = resolveActiveApp(initialApps).id;
  window.setInterval(() => {
    void (async () => {
      const fresh = await fetchJson<AppsData>(APPS_URL);
      if (!fresh || !Array.isArray(fresh.apps) || fresh.apps.length === 0) return;
      const resolved = resolveActiveApp(fresh);
      if (resolved.id !== currentAppId) {
        currentAppId = resolved.id;
        onSwitch(resolved);
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
