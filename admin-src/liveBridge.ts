// Admin side of the real-time local bridge (mirror of src/liveBridge.ts).
// The admin WRITES a snapshot of its working state on every edit; a display
// on the same browser in "Local" mode reads it instantly. See src/liveBridge.ts.

import type { DisplayConfig, EventData } from "./types";
import type { LayoutDoc } from "./layout";

const SNAPSHOT_KEY = "countdown-scheduler:live-snapshot";
const SOURCE_KEY = "countdown-scheduler:display-source";
const RELOAD_KEY = "countdown-scheduler:reload";
const CHANNEL = "countdown-scheduler-live";

export interface LiveSnapshot {
  config: DisplayConfig;
  events: Record<string, EventData>;
  /** Which event the display should preview in Local mode (the one being
   * edited), falling back to config.activeEventId. */
  previewEventId?: string | null;
  /** The single layout, so a drag/resize moves the item on a same-browser
   * display instantly (mirror of src/liveBridge). */
  layout?: LayoutDoc;
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

/** Ask any same-browser display tab to reload the page (the "Refresh display"
 * button). Posts over the channel and bumps a storage key as a fallback. */
export function requestDisplayReload(): void {
  bc?.postMessage("reload");
  try {
    window.localStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* storage unavailable -- BroadcastChannel is the primary path anyway. */
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
