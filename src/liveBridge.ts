// Real-time, same-browser data channel between the admin editor and the
// display. Both are served from the same origin (…github.io/<repo>/ and
// /admin/), so they share localStorage and can talk over a BroadcastChannel.
// This lets the admin drive the display INSTANTLY on one machine, with no
// GitHub round-trip and none of raw.githubusercontent.com's ~5-min cache.
// (Different machines don't share this -- they use the published GitHub data.)

import type { DisplayConfig, EventData } from "./types";
import type { LayoutDoc } from "./layout";

const SNAPSHOT_KEY = "countdown-scheduler:live-snapshot";
const SOURCE_KEY = "countdown-scheduler:display-source";
// Bumped by the admin's "Refresh display" button so a same-browser display
// tab reloads on demand (storage-event fallback when BroadcastChannel is absent).
const RELOAD_KEY = "countdown-scheduler:reload";
const CHANNEL = "countdown-scheduler-live";

export type DisplaySource = "local" | "github";

/** Everything the display needs, written by the admin on every edit. */
export interface LiveSnapshot {
  config: DisplayConfig;
  /** eventId -> event, for the events the admin has touched this session. */
  events: Record<string, EventData>;
  /** Which event the display should preview in Local mode (the one being
   * edited), falling back to config.activeEventId. */
  previewEventId?: string | null;
  /** The single layout, so a drag/resize in the editor moves the item on a
   * same-browser display instantly. */
  layout?: LayoutDoc;
  ts: number;
}

function channel(): BroadcastChannel | null {
  try {
    return new BroadcastChannel(CHANNEL);
  } catch {
    return null; // very old browser -- falls back to the storage event
  }
}
const bc = channel();

export function readLiveSnapshot(): LiveSnapshot | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as LiveSnapshot) : null;
  } catch {
    return null;
  }
}

export function writeLiveSnapshot(snapshot: LiveSnapshot): void {
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    bc?.postMessage("changed");
  } catch {
    /* storage full / disabled -- nothing we can do, the display just won't
       get this update over the local channel. */
  }
}

/** Fire `cb` whenever the snapshot changes -- instantly in the same browser
 * via BroadcastChannel, and across tabs via the storage event. */
export function onLiveChange(cb: () => void): void {
  bc?.addEventListener("message", (e) => {
    if (e.data === "changed") cb();
  });
  window.addEventListener("storage", (e) => {
    if (e.key === SNAPSHOT_KEY) cb();
  });
}

/** Fire `cb` when the admin asks a same-browser display to reload (the
 * "Refresh display" button). Used to force a fresh page load. */
export function onReloadRequest(cb: () => void): void {
  bc?.addEventListener("message", (e) => {
    if (e.data === "reload") cb();
  });
  window.addEventListener("storage", (e) => {
    if (e.key === RELOAD_KEY && e.newValue) cb();
  });
}

export function getDisplaySource(): DisplaySource {
  return window.localStorage.getItem(SOURCE_KEY) === "local" ? "local" : "github";
}

export function setDisplaySource(source: DisplaySource): void {
  window.localStorage.setItem(SOURCE_KEY, source);
}
