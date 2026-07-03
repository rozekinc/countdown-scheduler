// Real-time, same-browser data channel between the admin editor and the
// display. Both are served from the same origin (…github.io/<repo>/ and
// /admin/), so they share localStorage and can talk over a BroadcastChannel.
// This lets the admin drive the display INSTANTLY on one machine, with no
// GitHub round-trip and none of raw.githubusercontent.com's ~5-min cache.
// (Different machines don't share this -- they use the published GitHub data.)

import type { AppsData, EventData } from "./types";
import type { LayoutDoc } from "./layout";

const SNAPSHOT_KEY = "countdown-scheduler:live-snapshot";
const SOURCE_KEY = "countdown-scheduler:display-source";
const CHANNEL = "countdown-scheduler-live";

export type DisplaySource = "local" | "github";

/** Everything the display needs, written by the admin on every edit. */
export interface LiveSnapshot {
  apps: AppsData;
  /** eventId -> event, for the events the admin has touched this session. */
  events: Record<string, EventData>;
  /** The layout of the app currently being edited, so a drag/resize in the
   * editor moves the item on a same-browser display instantly. */
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
  if (bc) bc.onmessage = () => cb();
  window.addEventListener("storage", (e) => {
    if (e.key === SNAPSHOT_KEY) cb();
  });
}

export function getDisplaySource(): DisplaySource {
  return window.localStorage.getItem(SOURCE_KEY) === "local" ? "local" : "github";
}

export function setDisplaySource(source: DisplaySource): void {
  window.localStorage.setItem(SOURCE_KEY, source);
}
