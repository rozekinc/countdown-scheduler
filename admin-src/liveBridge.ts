// Admin side of the real-time local bridge (mirror of src/liveBridge.ts).
// The admin WRITES a snapshot of its working state on every edit; a display
// on the same browser in "Local" mode reads it instantly. See src/liveBridge.ts.

import type { AppsFile, EventData } from "./types";

const SNAPSHOT_KEY = "countdown-scheduler:live-snapshot";
const CHANNEL = "countdown-scheduler-live";

export interface LiveSnapshot {
  apps: AppsFile;
  events: Record<string, EventData>;
  ts: number;
}

function channel(): BroadcastChannel | null {
  try {
    return new BroadcastChannel(CHANNEL);
  } catch {
    return null;
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
    /* storage unavailable -- the display just won't get this local update. */
  }
}
