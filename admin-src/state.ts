import { DEFAULT_LABELS } from "./labels";
import type {
  AppConfig,
  DisplayLanguage,
  EventData,
  Label,
  LabelKey,
  ScheduleItem,
} from "./types";

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
  aspectRatioId?: string | null;
  /** Which language the display renders its labels in (Display settings). */
  displayLanguage?: DisplayLanguage;
  /** Global display font-size multiplier (Display settings). */
  textScale?: number;
  /** Full editable-labels object to write back (Display settings). Always a
   * complete record so unedited keys stay equal to their defaults. */
  labels?: Partial<Record<LabelKey, Label>>;
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
  /** Which aspect-ratio preset (data/apps.json's aspectRatioId) the stage
   * is letterboxed to on every screen. Null means 16:9. */
  aspectRatioId: string | null;

  /** Working copy of data/apps.json's display-label settings, seeded on
   * load and edited via the settings panel's "Display settings" section.
   * The display renders labels in `displayLanguage`, scaled by `textScale`;
   * `labels` is a complete record (defaults overlaid with any overrides) so
   * saving keeps every key present. */
  displayLanguage: DisplayLanguage;
  textScale: number;
  labels: Record<LabelKey, Label>;

  /** Read-only content revision + date from data/apps.json, shown in the
   * header's version indicator. Null when the file omits them. */
  contentVersion: number | null;
  contentUpdatedAt: string | null;

  eventsForApp: EventListEntry[];
  currentEventId: string | null;
  currentEvent: EventData | null;

  selectedDayIndex: number;

  /** Items staged from an .xlsx import, awaiting user confirmation. */
  pendingImportItems: ScheduleItem[] | null;

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

/** A fresh, full copy of the built-in default labels -- the working
 * `state.labels` starts here and each apps.json override is overlaid on top
 * (see seedLabels), so every key is always present. */
function defaultLabels(): Record<LabelKey, Label> {
  const out = {} as Record<LabelKey, Label>;
  for (const key of Object.keys(DEFAULT_LABELS) as LabelKey[]) {
    out[key] = { ...DEFAULT_LABELS[key] };
  }
  return out;
}

/** Builds a complete labels record from apps.json's (partial) overrides,
 * falling back to the built-in default for any missing key or side. */
export function seedLabels(overrides?: Partial<Record<LabelKey, Label>> | null): Record<LabelKey, Label> {
  const out = defaultLabels();
  if (overrides) {
    for (const key of Object.keys(DEFAULT_LABELS) as LabelKey[]) {
      const o = overrides[key];
      if (o) {
        out[key] = {
          ja: o.ja || DEFAULT_LABELS[key].ja,
          en: o.en || DEFAULT_LABELS[key].en,
        };
      }
    }
  }
  return out;
}

export const state: AppState = {
  viewMode: "editor",
  apps: [],
  currentAppId: null,
  selectedAppId: null,
  displayModeId: null,
  aspectRatioId: null,
  displayLanguage: "ja",
  textScale: 1,
  labels: defaultLabels(),
  contentVersion: null,
  contentUpdatedAt: null,
  eventsForApp: [],
  currentEventId: null,
  currentEvent: null,
  selectedDayIndex: 0,
  pendingImportItems: null,
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
    patch.aspectRatioId !== undefined ||
    patch.displayLanguage !== undefined ||
    patch.textScale !== undefined ||
    patch.labels !== undefined ||
    Object.keys(patch.activeEventIdByApp ?? {}).length > 0
  );
}

/** Clears all staged-change tracking after a successful save. */
export function clearPendingChanges(): void {
  state.eventDirty = false;
  state.pendingClose = false;
  state.appsPatch = {};
}
