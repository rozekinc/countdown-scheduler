import type { AppConfig, EventData, ScheduleRow } from "./types";

export interface EventListEntry {
  id: string;
  status: EventData["status"];
}

/** Staged data/apps.json edits, applied on top of a fresh read at Save
 * time (see saveAll() in ui.ts) so an in-memory copy of the whole file
 * never risks clobbering a concurrent change to some other app's fields. */
export interface AppsPatch {
  selectedAppId?: string;
  displayModeId?: string | null;
  /** appId -> new activeEventId (null clears it), staged by "Set active" /
   * "Close event" for whichever app(s) were touched this session. */
  activeEventIdByApp?: Record<string, string | null>;
}

export interface AppState {
  /** "editor" edits one app's events; "overview" lists every event across
   * every app, click-to-jump-into-editor. */
  viewMode: "editor" | "overview";

  apps: AppConfig[];
  currentAppId: string | null;
  /** Which app is currently live on the primary display (data/apps.json's
   * selectedAppId). Null means "whatever apps[0] is" (no override set). */
  selectedAppId: string | null;
  /** Which display-mode preset (data/apps.json's displayModeId) is active
   * on every screen. Null means "standard" (per-app colors). */
  displayModeId: string | null;

  eventsForApp: EventListEntry[];
  currentEventId: string | null;
  currentEvent: EventData | null;

  selectedDayIndex: number;

  /** Rows staged from an .xlsx import, awaiting user confirmation. */
  pendingImportRows: ScheduleRow[] | null;

  /** True once currentEvent has any unsaved local edit (field edit, row
   * add/remove, Set active, Close event, ...). Drives the Save button. */
  eventDirty: boolean;
  /** True when Close event was clicked but not yet saved: currentEvent
   * should be committed to the archive (and removed from data/events/) on
   * the next Save, instead of overwritten in place. */
  pendingClose: boolean;
  /** Unsaved data/apps.json edits (Show on display / display mode / Set
   * active), reconciled against a fresh read and committed on Save. */
  appsPatch: AppsPatch;

  statusMessage: string;
}

export const state: AppState = {
  viewMode: "editor",
  apps: [],
  currentAppId: null,
  selectedAppId: null,
  displayModeId: null,
  eventsForApp: [],
  currentEventId: null,
  currentEvent: null,
  selectedDayIndex: 0,
  pendingImportRows: null,
  eventDirty: false,
  pendingClose: false,
  appsPatch: {},
  statusMessage: "",
};

export function currentApp(): AppConfig | null {
  return state.apps.find((a) => a.id === state.currentAppId) ?? null;
}

export function currentDay() {
  if (!state.currentEvent) return null;
  return state.currentEvent.scheduleDays[state.selectedDayIndex] ?? null;
}

/** Whether saveAll() has anything to commit. */
export function hasPendingChanges(): boolean {
  const patch = state.appsPatch;
  return (
    state.eventDirty ||
    patch.selectedAppId !== undefined ||
    patch.displayModeId !== undefined ||
    Object.keys(patch.activeEventIdByApp ?? {}).length > 0
  );
}

/** Clears all staged-change tracking after a successful save. */
export function clearPendingChanges(): void {
  state.eventDirty = false;
  state.pendingClose = false;
  state.appsPatch = {};
}
