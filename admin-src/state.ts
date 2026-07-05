import { DEFAULT_LABELS } from "./labels";
import type { LayoutDoc } from "./layout";
import type { EventSummary } from "./events";
import type {
  DisplayLanguage,
  EventData,
  Label,
  LabelKey,
  RedFlagState,
} from "./types";

/** Staged data/display.json edits, applied on top of a fresh read at Save
 * time (see saveAll() in ui.ts) so an in-memory copy of the whole file never
 * clobbers a concurrent change to some other field. */
export interface ConfigPatch {
  displayModeId?: string | null;
  aspectRatioId?: string | null;
  displayLanguage?: DisplayLanguage;
  textScale?: number;
  labels?: Partial<Record<LabelKey, Label>>;
  /** Which event the display counts down to. */
  activeEventId?: string | null;
  /** Red-flag / stoppage state, committed immediately from the header. */
  redFlag?: RedFlagState;
}

export interface AppState {
  /** "editor" is the event→day tree + day editor; "layout" is the free-canvas
   * layout editor. (The old per-app "overview" page is gone.) */
  viewMode: "editor" | "layout";

  /** Which display-mode preset (display.json's displayModeId) is active.
   * Null = "standard". Presets are the only source of colors now. */
  displayModeId: string | null;
  /** Which aspect-ratio preset the stage is letterboxed to. Null = 16:9. */
  aspectRatioId: string | null;
  /** Which event the display is currently counting down to (activeEventId). */
  activeEventId: string | null;

  /** Working copy of display.json's label settings (see settings panel). */
  displayLanguage: DisplayLanguage;
  textScale: number;
  labels: Record<LabelKey, Label>;

  /** Current red-flag / stoppage state from display.json. */
  redFlag: RedFlagState;
  /** Current safety-car state from display.json (same shape as redFlag). */
  safetyCar: RedFlagState;

  /** Display controls, driven from the admin header and mirrored to the
   * display live (they ride Sync into display.json too). A page id -- base
   * pages "countdown"/"schedule", plus any operator-added pages. */
  currentPage: string;
  scrollPaused: boolean;
  showOutline: boolean;

  /** Read-only content revision + date from display.json (version indicator). */
  contentVersion: number | null;
  contentUpdatedAt: string | null;

  /** Every event (active + archived), the source for the left-panel tree. */
  allEvents: EventSummary[];
  /** Which event groups are expanded in the tree. */
  expandedEventIds: Set<string>;

  currentEventId: string | null;
  currentEvent: EventData | null;
  selectedDayIndex: number;

  /** True once currentEvent has any unsaved local edit. Drives the Save button. */
  eventDirty: boolean;
  /** True when Archive event was clicked but not yet saved (moves the event to
   * the archive folder on Sync). */
  pendingClose: boolean;
  /** True when Delete event was clicked but not yet saved (permanently removes
   * the event file on Sync, WITHOUT archiving). */
  pendingDelete: boolean;
  /** Unsaved display.json edits, reconciled against a fresh read on Save. */
  configPatch: ConfigPatch;

  /** Working copy of the single layout (data/layout.json). Null until loaded. */
  layout: LayoutDoc | null;
  /** True once the layout has an unsaved edit; committed on the next Save. */
  layoutDirty: boolean;

  /** True when the local working state (resumed from the snapshot on refresh)
   * has changes not yet synced to GitHub -- keeps the Sync button live even
   * when the per-field dirty flags were reset by a page refresh. */
  hasLocalChanges: boolean;

  statusMessage: string;
}

/** A fresh, full copy of the built-in default labels. */
function defaultLabels(): Record<LabelKey, Label> {
  const out = {} as Record<LabelKey, Label>;
  for (const key of Object.keys(DEFAULT_LABELS) as LabelKey[]) {
    out[key] = { ...DEFAULT_LABELS[key] };
  }
  return out;
}

/** Builds a complete labels record from display.json's (partial) overrides,
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
  displayModeId: null,
  aspectRatioId: null,
  activeEventId: null,
  displayLanguage: "ja",
  textScale: 1,
  labels: defaultLabels(),
  redFlag: { active: false, since: null },
  safetyCar: { active: false, since: null },
  currentPage: "countdown",
  scrollPaused: false,
  showOutline: false,
  contentVersion: null,
  contentUpdatedAt: null,
  allEvents: [],
  expandedEventIds: new Set<string>(),
  currentEventId: null,
  currentEvent: null,
  selectedDayIndex: 0,
  eventDirty: false,
  pendingClose: false,
  pendingDelete: false,
  configPatch: {},
  layout: null,
  layoutDirty: false,
  hasLocalChanges: false,
  statusMessage: "",
};

export function currentDay() {
  if (!state.currentEvent) return null;
  return state.currentEvent.days[state.selectedDayIndex] ?? null;
}

/** Whether saveAll() has anything to commit. */
export function hasPendingChanges(): boolean {
  const patch = state.configPatch;
  return (
    state.eventDirty ||
    state.layoutDirty ||
    state.hasLocalChanges ||
    patch.displayModeId !== undefined ||
    patch.aspectRatioId !== undefined ||
    patch.displayLanguage !== undefined ||
    patch.textScale !== undefined ||
    patch.labels !== undefined ||
    patch.activeEventId !== undefined
  );
}

/** Clears all staged-change tracking after a successful sync. */
export function clearPendingChanges(): void {
  state.eventDirty = false;
  state.pendingClose = false;
  state.pendingDelete = false;
  state.configPatch = {};
  state.layoutDirty = false;
  state.hasLocalChanges = false;
}
