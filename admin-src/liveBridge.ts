// Admin side of the real-time local bridge (mirror of src/liveBridge.ts).
// The admin WRITES a snapshot of its working state on every edit; a display
// on the same browser in "Local" mode reads it instantly. See src/liveBridge.ts.

import type { AppsFile, EventData } from "./types";

const SNAPSHOT_KEY = "countdown-scheduler:live-snapshot";
const SOURCE_KEY = "countdown-scheduler:display-source";
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

/** Whether a same-browser display is currently reading from the local bridge
 * ("local") rather than published GitHub data ("github"). In local mode the
 * admin's edits are already live, so a Save-to-GitHub is optional. */
export function isLiveMode(): boolean {
  return window.localStorage.getItem(SOURCE_KEY) === "local";
}

/** Fire `cb` when the display source changes in another same-origin tab
 * (the toggle lives on the display page). */
export function onSourceChange(cb: () => void): void {
  window.addEventListener("storage", (e) => {
    if (e.key === SOURCE_KEY) cb();
  });
}
