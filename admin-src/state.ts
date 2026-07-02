import type { AppConfig, EventData, ScheduleRow } from "./types";

export interface EventListEntry {
  id: string;
  status: EventData["status"];
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
  currentEventSha: string | null;

  selectedDayIndex: number;

  /** Rows staged from an .xlsx import, awaiting user confirmation. */
  pendingImportRows: ScheduleRow[] | null;

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
  currentEventSha: null,
  selectedDayIndex: 0,
  pendingImportRows: null,
  statusMessage: "",
};

export function currentApp(): AppConfig | null {
  return state.apps.find((a) => a.id === state.currentAppId) ?? null;
}

export function currentDay() {
  if (!state.currentEvent) return null;
  return state.currentEvent.scheduleDays[state.selectedDayIndex] ?? null;
}
