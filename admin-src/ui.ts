import { el, clear, isPast, isoToDatePart, isoToTimePart, datePartsToIso } from "./dom";
import { renderAuthControls } from "./authPanel";
import { renderSettingsControls } from "./settingsPanel";
import { getJsonFile, commitFiles, type FileChange } from "./githubApi";
import { isSignedIn } from "./auth";
import { parseXlsxToItems } from "./excelImport";
import { loadAllEvents, type EventSummary } from "./events";
import {
  state,
  currentDay,
  hasPendingChanges,
  clearPendingChanges,
  seedLabels,
} from "./state";
import type { DisplayConfig, EventData, EditorState, ScheduleItem } from "./types";
import { DISPLAY_MODES, DEFAULT_DISPLAY_MODE_ID, getDisplayMode } from "./displayModes";
import { ASPECT_RATIOS, DEFAULT_ASPECT_RATIO_ID, getAspectRatio } from "./aspectRatios";
import { readLiveSnapshot, writeLiveSnapshot } from "./liveBridge";
import { renderLayoutEditor, primeAssets, type LayoutEditorCtx } from "./layoutEditor";
import { defaultLayout, type LayoutDoc } from "./layout";
import { icon, iconButton } from "./icons";
import { t, getLang, setLang, onLangChange, type Lang } from "./i18n";

// Public data/display.json is fetched with a plain (unauthenticated) fetch,
// relative to admin/index.html.
const PUBLIC_CONFIG_URL = "../data/display.json";
const CONFIG_JSON_PATH = "data/display.json";
const LAYOUT_JSON_PATH = "data/layout.json";

let rootEl: HTMLElement;
let displayModeSwitcherEl: HTMLElement;
let aspectRatioSwitcherEl: HTMLElement;
let langSwitcherEl: HTMLElement;
let authControlsEl: HTMLElement;
let settingsControlsEl: HTMLElement;
let versionIndicatorEl: HTMLElement;
let viewToggleEl: HTMLElement;
let leftPanelEl: HTMLElement;
let mainPanelEl: HTMLElement;
let layoutPanelEl: HTMLElement;
let statusBarEl: HTMLElement;
let saveBarEl: HTMLElement;
let saveBtnEl: HTMLButtonElement;

// True while the initial config + event tree are loading, so the panels show
// skeletons instead of looking blank/broken.
let treeLoading = true;

export function init(root: HTMLElement): void {
  rootEl = root;
  rootEl.innerHTML = "";

  const header = el("header", { class: "app-header" });
  viewToggleEl = el("div", { class: "view-toggle" });
  displayModeSwitcherEl = el("div", { class: "display-mode-switcher" });
  aspectRatioSwitcherEl = el("div", { class: "aspect-ratio-switcher" });
  langSwitcherEl = el("div", { class: "lang-switcher" });
  settingsControlsEl = el("div", { class: "settings-controls" });
  authControlsEl = el("div", { class: "auth-controls" });
  versionIndicatorEl = el("div", { class: "version-indicator" });
  saveBarEl = el("div", { class: "save-bar" });
  header.append(
    viewToggleEl,
    displayModeSwitcherEl,
    aspectRatioSwitcherEl,
    saveBarEl,
    langSwitcherEl,
    settingsControlsEl,
    authControlsEl,
    versionIndicatorEl,
  );

  const body = el("div", { class: "app-body" });
  leftPanelEl = el("aside", { class: "left-panel" });
  mainPanelEl = el("main", { class: "main-panel" });
  layoutPanelEl = el("div", { class: "layout-panel" });
  body.append(leftPanelEl, mainPanelEl, layoutPanelEl);

  statusBarEl = el("div", { class: "status-bar" });

  rootEl.append(header, body, statusBarEl);

  renderSaveBar();
  renderLangSwitcher();
  renderVersionIndicator();
  renderAuthControls(authControlsEl, onSignedIn);
  renderSettingsControls(settingsControlsEl, onSettingsSaved, onDisplaySettingsChanged);
  renderViewToggle();
  applyViewMode();
  // Paint skeletons immediately so the first (network-bound) load reads as
  // "loading", not "blank/broken".
  treeLoading = true;
  renderLeftPanel();
  renderMainPanel();
  loadConfig();

  // No beforeunload guard: edits persist in localStorage (local-first), so
  // closing the tab loses nothing -- "Sync to GitHub" is the explicit push.

  // Re-render every visible piece of chrome on a language switch, so it
  // takes effect immediately without a page reload.
  onLangChange(() => {
    renderViewToggle();
    renderSaveBar();
    renderLangSwitcher();
    renderVersionIndicator();
    renderAuthControls(authControlsEl, onSignedIn);
    renderSettingsControls(settingsControlsEl, onSettingsSaved, onDisplaySettingsChanged);
    renderDisplayModeSwitcher();
    renderAspectRatioSwitcher();
    mirrorToLive();
    renderLeftPanel();
    renderMainPanel();
    if (state.viewMode === "layout") renderLayoutView();
  });
}

function renderLangSwitcher(): void {
  clear(langSwitcherEl);
  const select = el("select", { class: "lang-select" });
  const langs: Lang[] = ["en", "ja"];
  for (const lang of langs) {
    const option = el("option", { value: lang }, [lang === "en" ? "English" : "日本語"]);
    if (lang === getLang()) option.setAttribute("selected", "selected");
    select.append(option);
  }
  select.addEventListener("change", () => {
    setLang((select as HTMLSelectElement).value as Lang);
  });
  langSwitcherEl.append(el("label", {}, [t("lang.label")]), select);
}

/**
 * Small read-only chrome showing which content revision the admin is
 * looking at (contentVersion/contentUpdatedAt from data/apps.json) plus the
 * build stamp baked into admin/index.html at build time. Any part that's
 * absent (or the placeholder "dev" build) is simply omitted; if nothing is
 * available the whole indicator stays empty. The content parts refresh
 * whenever apps.json is (re)loaded via loadApps().
 */
function renderVersionIndicator(): void {
  clear(versionIndicatorEl);
  const parts: string[] = [];
  if (state.contentVersion !== null) parts.push(`v${state.contentVersion}`);
  if (state.contentUpdatedAt) parts.push(state.contentUpdatedAt);
  const build = document
    .querySelector('meta[name="app-build"]')
    ?.getAttribute("content");
  if (build && build !== "dev") parts.push(`build ${build}`);
  if (parts.length === 0) return;
  versionIndicatorEl.append(
    el("span", { class: "version-label" }, [t("version.label")]),
    el("span", { class: "version-value" }, [parts.join(" · ")]),
  );
}

/**
 * One Save button for the entire app: whatever got staged this session --
 * event field edits, row add/remove, Set active, Close event, Show on
 * display, display mode -- goes out as a SINGLE commit (see saveAll() /
 * commitFiles()) instead of a commit per action.
 */
function renderSaveBar(): void {
  clear(saveBarEl);
  // Local-first: edits are already live and persist in localStorage across
  // refreshes. "Sync to GitHub" pushes local state up; "Pull from GitHub"
  // replaces local state with what's published (remote wins).
  saveBtnEl = iconButton("publish", "Sync to GitHub", "btn btn-primary");
  saveBtnEl.addEventListener("click", () => void saveAll());
  const pullBtn = iconButton("pull", "Pull from GitHub (overwrites local)", "btn btn-secondary");
  pullBtn.addEventListener("click", () => void pullFromGitHub());
  saveBarEl.append(saveBtnEl, pullBtn);
  updateSaveButtonState();
}

function updateSaveButtonState(): void {
  if (!saveBtnEl) return;
  const dirty = hasPendingChanges();
  saveBtnEl.title = dirty ? "Sync local changes to GitHub" : "Synced — nothing new to push";
  saveBtnEl.className = `btn icon-btn ${dirty ? "btn-primary" : "btn-secondary"}`;
  if (dirty) {
    saveBtnEl.removeAttribute("disabled");
  } else {
    saveBtnEl.setAttribute("disabled", "true");
  }
}

/** Marks the current event dirty and refreshes just the Save button --
 * called on every field keystroke, so typing doesn't re-render (and steal
 * focus from) the whole main panel. */
function markEventDirty(): void {
  state.eventDirty = true;
  updateSaveButtonState();
  // Push the edit to a same-browser display in Local mode so schedule /
  // countdown changes show live, exactly like layout edits do. This only
  // writes localStorage + posts a message (no admin re-render), so it never
  // steals focus from the field being typed in.
  mirrorToLive();
}

// --- drag-and-drop row reordering ----------------------------------------
// The item currently being dragged: its backing array + index. Kept module-
// level so dragover/drop on sibling rows can see it. The array identity is
// checked so a row can only be dropped within its own list.
let dragArr: unknown[] | null = null;
let dragIndex = -1;

/** Make a row reorderable by dragging `handle`. Reorders `arr` in place and
 * calls `after` (typically markEventDirty + renderMainPanel). */
function makeReorderable<T>(
  rowEl: HTMLElement,
  handle: HTMLElement,
  index: number,
  arr: T[],
  after: () => void,
): void {
  handle.setAttribute("draggable", "true");
  handle.classList.add("drag-handle");
  handle.title = "Drag to reorder";

  handle.addEventListener("dragstart", (e) => {
    dragArr = arr as unknown[];
    dragIndex = index;
    rowEl.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
      e.dataTransfer.setDragImage(rowEl, 12, 12);
    }
  });
  handle.addEventListener("dragend", () => {
    rowEl.classList.remove("dragging");
    dragArr = null;
    dragIndex = -1;
  });

  const sameList = (): boolean => dragArr === (arr as unknown[]);
  rowEl.addEventListener("dragover", (e) => {
    if (!sameList()) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    rowEl.classList.add("drag-over");
  });
  rowEl.addEventListener("dragleave", () => rowEl.classList.remove("drag-over"));
  rowEl.addEventListener("drop", (e) => {
    rowEl.classList.remove("drag-over");
    if (!sameList() || dragIndex === index || dragIndex < 0) return;
    e.preventDefault();
    const [moved] = arr.splice(dragIndex, 1);
    arr.splice(index, 0, moved);
    dragArr = null;
    dragIndex = -1;
    after();
  });
}

function confirmDiscardEventIfDirty(action: string): boolean {
  if (!state.eventDirty) return true;
  const ok = window.confirm(
    t("events.switchConfirm", { id: state.currentEvent?.id ?? "", action }),
  );
  if (ok) {
    state.eventDirty = false;
    state.pendingClose = false;
  }
  return ok;
}

function renderViewToggle(): void {
  clear(viewToggleEl);
  const editorBtn = iconButton("editor", t("nav.editor"), `btn ${state.viewMode === "editor" ? "btn-primary" : "btn-secondary"}`);
  const layoutBtn = iconButton("layout", t("nav.layout"), `btn ${state.viewMode === "layout" ? "btn-primary" : "btn-secondary"}`);
  editorBtn.addEventListener("click", () => switchViewMode("editor"));
  layoutBtn.addEventListener("click", () => switchViewMode("layout"));
  viewToggleEl.append(editorBtn, layoutBtn);
}

function applyViewMode(): void {
  const mode = state.viewMode;
  leftPanelEl.style.display = mode === "editor" ? "" : "none";
  mainPanelEl.style.display = mode === "editor" ? "" : "none";
  layoutPanelEl.style.display = mode === "layout" ? "" : "none";
}

function switchViewMode(mode: "editor" | "layout"): void {
  state.viewMode = mode;
  renderViewToggle();
  applyViewMode();
  if (mode === "layout") {
    primeAssets();
    void ensureLayoutLoaded().then(() => renderLayoutView());
  }
}

/** Callback the layout editor fires after any edit: stage the change as
 * dirty, mirror to a same-browser display, and refresh the Save button. */
const layoutEditorCtx: LayoutEditorCtx = {
  onChange(): void {
    state.layoutDirty = true;
    mirrorToLive();
    updateSaveButtonState();
  },
};

function renderLayoutView(): void {
  renderLayoutEditor(layoutPanelEl, layoutEditorCtx);
}

/** Loads the single layout into state.layout if not already loaded. Fetched
 * from the published data (unauthenticated), falling back to the built-in base
 * layout so the editor always has something to show. */
async function ensureLayoutLoaded(): Promise<void> {
  if (state.layout) return;
  // Resume an unsaved local layout from the live snapshot (same-domain
  // localStorage), so refreshing the admin doesn't discard in-progress layout
  // edits or reset a Local-mode display back to the published/default layout.
  const snap = readLiveSnapshot();
  if (snap?.layout && Array.isArray(snap.layout.items)) {
    state.layout = snap.layout;
    return;
  }
  state.layout = await fetchPublishedLayout();
  state.layoutDirty = false;
}

/** Fetch the published layout.json (ignoring any local snapshot), or the
 * built-in base layout if it's absent/unreadable. */
async function fetchPublishedLayout(): Promise<LayoutDoc> {
  try {
    const res = await fetch(`../${LAYOUT_JSON_PATH}`, { cache: "no-store" });
    if (res.ok) {
      const parsed = (await res.json()) as LayoutDoc;
      if (Array.isArray(parsed.items)) return parsed;
    }
  } catch {
    /* fall back to the base layout */
  }
  return defaultLayout();
}

/**
 * Pull the published data from GitHub and REPLACE the local working state with
 * it -- config, layout, events, and the selected event. Overwrites anything
 * not yet synced (that's the point: it lets one person publish and another pull
 * their changes in). There's no data-merge / conflict resolution -- remote
 * wins -- so it's gated behind a clear warning.
 */
async function pullFromGitHub(): Promise<void> {
  if (
    !window.confirm(
      "Pull from GitHub?\n\nThis replaces everything here with the published data — " +
        "any local changes you haven't synced will be overwritten.",
    )
  ) {
    return;
  }
  setStatus("Pulling from GitHub…");
  try {
    const res = await fetch(PUBLIC_CONFIG_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    seedConfigState((await res.json()) as DisplayConfig);
    // Force layout + current event to re-load from GitHub (not the snapshot).
    state.layout = await fetchPublishedLayout();
    state.currentEvent = null;
    clearPendingChanges();

    renderVersionIndicator();
    renderDisplayModeSwitcher();
    renderAspectRatioSwitcher();
    applyAdminChrome();
    mirrorToLive(); // push the pulled state into the local snapshot + display
    if (isSignedIn()) {
      await loadEventsTree(); // reloads the tree + re-opens the selected event fresh
    } else {
      renderLeftPanel();
      renderMainPanel();
    }
    if (state.viewMode === "layout") renderLayoutView();
    setStatus("Pulled the latest from GitHub.");
  } catch (err) {
    setStatus(`Pull failed: ${(err as Error).message}`, true);
  }
}

function onSettingsSaved(): void {
  setStatus(t("settings.saved"));
  if (isSignedIn()) {
    void loadEventsTree();
  }
}

/** Called by the settings panel after any Display-settings edit (language /
 * text size / labels). Those edits mutate state + state.configPatch directly
 * (see settingsPanel.ts); this refreshes the live preview and the Save
 * button so the effect is visible immediately and Save picks it up. */
function onDisplaySettingsChanged(): void {
  setStatus(t("settings.displaySettingsStaged"));
  mirrorToLive();
  updateSaveButtonState();
}

function setStatus(message: string, isError = false): void {
  statusBarEl.textContent = message;
  statusBarEl.className = isError ? "status-bar status-error" : "status-bar";
}

/** Seed the working state from a DisplayConfig (from the local snapshot or a
 * fresh GitHub read). */
function seedConfigState(data: DisplayConfig): void {
  state.displayModeId = data.displayModeId ?? null;
  state.aspectRatioId = data.aspectRatioId ?? null;
  state.activeEventId = data.activeEventId ?? null;
  state.displayLanguage = data.displayLanguage === "en" ? "en" : "ja";
  state.textScale = typeof data.textScale === "number" ? data.textScale : 1;
  state.labels = seedLabels(data.labels);
  state.redFlag = data.redFlag?.active
    ? { active: true, since: data.redFlag.since ?? null }
    : { active: false, since: null };
  state.contentVersion = data.contentVersion ?? null;
  state.contentUpdatedAt = data.contentUpdatedAt ?? null;
  const es = data.editorState ?? {};
  state.expandedEventIds = new Set(es.expandedEventIds ?? []);
  state.currentEventId = es.selectedEventId ?? null;
  state.selectedDayIndex = typeof es.selectedDayIndex === "number" ? es.selectedDayIndex : 0;
}

async function loadConfig(): Promise<void> {
  try {
    // LOCAL-FIRST: resume the working session from the same-domain snapshot if
    // present, so a refresh keeps in-progress edits (config, layout, and the
    // event being edited). Only a fresh browser with no snapshot bootstraps
    // from the published GitHub data. "Sync to GitHub" is how local state is
    // pushed upstream.
    const snap = readLiveSnapshot();
    if (snap?.config) {
      seedConfigState(snap.config);
      if (snap.layout && Array.isArray(snap.layout.items)) state.layout = snap.layout;
      // Resume the event being edited (with its unsaved changes).
      const pid = snap.previewEventId ?? state.currentEventId;
      if (pid && snap.events[pid]) {
        state.currentEvent = snap.events[pid];
        state.currentEventId = pid;
      }
      // A snapshot may hold changes not yet on GitHub -> keep Sync available.
      state.hasLocalChanges = true;
    } else {
      const res = await fetch(PUBLIC_CONFIG_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      seedConfigState((await res.json()) as DisplayConfig);
    }

    renderVersionIndicator();
    renderDisplayModeSwitcher();
    renderAspectRatioSwitcher();
    applyAdminChrome();
    // Ensure a layout is in state before the first mirror (see ensureLayoutLoaded).
    await ensureLayoutLoaded();
    mirrorToLive();
    if (isSignedIn()) {
      await loadEventsTree();
    } else {
      treeLoading = false;
      renderLeftPanel();
      renderMainPanel();
    }
  } catch (err) {
    const message = (err as Error).message;
    setStatus(t("load.failed", { message }), true);
    // A failed initial load otherwise leaves every panel silently empty --
    // easy to mistake for "the whole page is blank." Make it loud.
    renderLoadFailure(message);
  }
}

function renderLoadFailure(message: string): void {
  clear(leftPanelEl);
  clear(mainPanelEl);
  mainPanelEl.append(
    el("div", { class: "load-failure" }, [
      el("h2", {}, [t("load.failedTitle")]),
      el("p", {}, [message]),
      el("p", { class: "muted" }, [t("load.failedHint")]),
    ]),
  );
}

function onSignedIn(): void {
  void loadEventsTree();
}

/** Admin chrome accent colors, sourced from the active display-mode preset
 * (there are no per-app themes anymore). */
function applyAdminChrome(): void {
  const colors = getDisplayMode(state.displayModeId).colors;
  const root = document.documentElement;
  root.style.setProperty("--accent", colors.accent);
  root.style.setProperty("--primary", colors.primary);
  root.style.setProperty("--background", colors.background);
}

function renderDisplayModeSwitcher(): void {
  clear(displayModeSwitcherEl);
  const select = el("select", { class: "display-mode-select", title: t("displayMode.label") });
  const activeId = state.displayModeId ?? DEFAULT_DISPLAY_MODE_ID;
  for (const mode of DISPLAY_MODES) {
    const option = el("option", { value: mode.id }, [mode.label]);
    if (mode.id === activeId) option.setAttribute("selected", "selected");
    select.append(option);
  }
  select.addEventListener("change", () => {
    stageDisplayMode((select as HTMLSelectElement).value);
  });
  displayModeSwitcherEl.append(icon("mode"), select);
}

/** Stages the display-mode preset. Not written until Save. */
function stageDisplayMode(modeId: string): void {
  state.displayModeId = modeId;
  state.configPatch.displayModeId = modeId;
  setStatus(t("displayMode.staged", { label: getDisplayMode(modeId).label }));
  applyAdminChrome();
  renderDisplayModeSwitcher();
  mirrorToLive();
  updateSaveButtonState();
}

function renderAspectRatioSwitcher(): void {
  clear(aspectRatioSwitcherEl);
  const select = el("select", { class: "aspect-ratio-select", title: t("aspectRatio.label") });
  const activeId = state.aspectRatioId ?? DEFAULT_ASPECT_RATIO_ID;
  for (const ratio of ASPECT_RATIOS) {
    const option = el("option", { value: ratio.id }, [ratio.label]);
    if (ratio.id === activeId) option.setAttribute("selected", "selected");
    select.append(option);
  }
  select.addEventListener("change", () => {
    stageAspectRatio((select as HTMLSelectElement).value);
  });
  aspectRatioSwitcherEl.append(icon("aspect"), select);
}

/** Stages the aspect ratio the stage is letterboxed to. Not written until Save. */
function stageAspectRatio(aspectRatioId: string): void {
  state.aspectRatioId = aspectRatioId;
  state.configPatch.aspectRatioId = aspectRatioId;
  setStatus(t("aspectRatio.staged", { label: getAspectRatio(aspectRatioId).label }));
  renderAspectRatioSwitcher();
  mirrorToLive();
  updateSaveButtonState();
}

/** The current editor UI state, folded into the config so it persists like
 * every other setting (local snapshot instantly; GitHub on Save). */
function currentEditorState(): EditorState {
  return {
    expandedEventIds: [...state.expandedEventIds],
    selectedEventId: state.currentEventId,
    selectedDayIndex: state.selectedDayIndex,
  };
}

/** The display config to publish / mirror, built from the working state. */
function buildConfig(): DisplayConfig {
  return {
    activeEventId: state.activeEventId,
    displayModeId: state.displayModeId,
    aspectRatioId: state.aspectRatioId,
    displayLanguage: state.displayLanguage,
    textScale: state.textScale,
    labels: state.labels,
    editorState: currentEditorState(),
    contentVersion: state.contentVersion ?? undefined,
    contentUpdatedAt: state.contentUpdatedAt ?? undefined,
  };
}

// Real-time mirror: on every working-state change, push a snapshot of the
// display-relevant state to localStorage so a same-browser display in "Local"
// mode updates INSTANTLY. The red flag is controlled from the display now, so
// an existing snapshot's redFlag is preserved rather than overwritten.
function mirrorToLive(): void {
  const config = buildConfig();
  const prev = readLiveSnapshot();
  if (prev?.config?.redFlag) config.redFlag = prev.config.redFlag;
  const events: Record<string, EventData> = {};
  if (state.currentEvent) events[state.currentEvent.id] = state.currentEvent;
  writeLiveSnapshot({
    config,
    events,
    // In Local mode the display previews the event being edited, not only the
    // active one, so schedule/countdown edits are visible before Set active.
    previewEventId: state.currentEventId,
    layout: state.layout ?? undefined,
    ts: Date.now(),
  });
}

/** Loads every event into the tree (state.allEvents), then restores the last
 * selected event if one was persisted. */
async function loadEventsTree(): Promise<void> {
  treeLoading = true;
  setStatus(t("events.loading"));
  renderLeftPanel(); // show the skeleton while the tree loads
  renderMainPanel();
  try {
    state.allEvents = await loadAllEvents();
    setStatus("");
    // Re-open the last-selected event if it's still around and not yet loaded.
    // NOTE: selectEvent(..., false) intentionally does NOT render, so we must
    // fall through to the render at the end -- an early return here was the bug
    // that left the tree blank until Settings was opened/closed.
    if (state.currentEventId && !state.currentEvent) {
      const summary = state.allEvents.find((e) => e.id === state.currentEventId);
      if (summary) {
        await selectEvent(state.currentEventId, false);
      } else {
        state.currentEventId = null;
      }
    }
  } catch (err) {
    setStatus(t("events.listFailed", { message: (err as Error).message }), true);
    state.allEvents = [];
  }
  treeLoading = false;
  renderLeftPanel();
  renderMainPanel();
}

/** A few shimmer rows for the event tree while it loads. */
function renderTreeSkeleton(): HTMLElement {
  const wrap = el("div", { class: "skeleton-wrap" });
  wrap.append(el("div", { class: "skeleton-note" }, [t("events.loading")]));
  for (let i = 0; i < 5; i++) {
    wrap.append(el("div", { class: "skeleton skeleton-row" }));
  }
  return wrap;
}

/** A shimmer stand-in for the event editor while it loads. */
function renderMainSkeleton(): HTMLElement {
  const wrap = el("div", { class: "skeleton-wrap" });
  wrap.append(el("div", { class: "skeleton skeleton-title" }));
  wrap.append(el("div", { class: "skeleton skeleton-line" }));
  for (let i = 0; i < 4; i++) {
    wrap.append(el("div", { class: "skeleton skeleton-block" }));
  }
  return wrap;
}

// The left panel is one collapsible tree: each event is a group; expanding it
// reveals its days as sub-items. Selecting a day loads that event and shows it
// in the main editor. There is no separate "all events" page anymore.
function renderLeftPanel(): void {
  clear(leftPanelEl);

  const header = el("div", { class: "tree-header" }, [el("h3", {}, [t("events.title")])]);
  const newBtn = iconButton("plus", t("events.newDraft"), "btn btn-secondary btn-small");
  newBtn.addEventListener("click", () => {
    if (!confirmDiscardEventIfDirty(t("events.newDraftAction"))) return;
    openNewEventModal();
  });
  header.append(newBtn);
  leftPanelEl.append(header);

  if (!isSignedIn()) {
    leftPanelEl.append(el("p", { class: "muted" }, [t("events.signInToLoad")]));
    return;
  }

  if (treeLoading) {
    leftPanelEl.append(renderTreeSkeleton());
    return;
  }

  const tree = el("div", { class: "event-tree" });
  for (const ev of state.allEvents) {
    tree.append(renderEventGroup(ev));
  }
  leftPanelEl.append(tree);
}

function renderEventGroup(ev: EventSummary): HTMLElement {
  const expanded = state.expandedEventIds.has(ev.id);
  const isCurrent = ev.id === state.currentEventId;
  const isActive = ev.id === state.activeEventId;
  const group = el("div", { class: `event-group${isCurrent ? " current" : ""}` });

  // Group header: chevron + name + status/active markers. Uses the live
  // in-memory name when this event is the one being edited (so a rename shows
  // immediately), else the loaded summary name.
  const name = isCurrent && state.currentEvent ? state.currentEvent.name || state.currentEvent.id : ev.name;
  const chevron = icon("chevron");
  chevron.classList.toggle("open", expanded);
  const head = el("div", { class: `event-group-head status-${ev.status}${ev.archived ? " archived" : ""}` }, [
    chevron,
    el("span", { class: "event-group-name" }, [name]),
  ]);
  if (isActive) head.append(icon("active"));
  head.addEventListener("click", () => {
    if (expanded) state.expandedEventIds.delete(ev.id);
    else state.expandedEventIds.add(ev.id);
    mirrorToLive(); // persist expand state locally (rides GitHub on next Save)
    renderLeftPanel();
  });
  group.append(head);

  if (!expanded) return group;

  // Sub-items: the event's days, plus an "add day" affordance. Selecting a day
  // loads the event (if not already loaded) and opens that day.
  const days = isCurrent && state.currentEvent
    ? state.currentEvent.scheduleDays.map((d) => ({ date: d.date, itemCount: d.items.length }))
    : ev.days;
  const dayList = el("ul", { class: "day-list" });
  days.forEach((day, index) => {
    const selected = isCurrent && index === state.selectedDayIndex;
    const li = el("li", { class: `day-list-item${selected ? " selected" : ""}` }, [
      icon("day"),
      el("span", {}, [day.date || t("days.noDate")]),
      el("span", { class: "day-count" }, [String(day.itemCount)]),
    ]);
    li.addEventListener("click", () => void openDay(ev, index));
    dayList.append(li);
  });
  group.append(dayList);

  const addDayBtn = iconButton("plus", t("days.addDay"), "btn btn-secondary btn-small");
  addDayBtn.addEventListener("click", () => void addDayToEvent(ev));
  group.append(addDayBtn);

  return group;
}

/** Opens a day: loads its event into the editor (if needed) and selects it. */
async function openDay(ev: EventSummary, dayIndex: number): Promise<void> {
  if (ev.id !== state.currentEventId) {
    if (!confirmDiscardEventIfDirty(t("events.switchAction"))) return;
    const ok = await selectEvent(ev.id, false);
    if (!ok) return;
  }
  state.selectedDayIndex = dayIndex;
  mirrorToLive();
  renderLeftPanel();
  renderMainPanel();
}

async function addDayToEvent(ev: EventSummary): Promise<void> {
  if (ev.id !== state.currentEventId) {
    if (!confirmDiscardEventIfDirty(t("events.switchAction"))) return;
    const ok = await selectEvent(ev.id, false);
    if (!ok) return;
  }
  if (!state.currentEvent) return;
  state.currentEvent.scheduleDays.push({ date: "", announcement: "", items: [] });
  state.selectedDayIndex = state.currentEvent.scheduleDays.length - 1;
  markEventDirty();
  renderLeftPanel();
  renderMainPanel();
}

/** Loads an event fresh from GitHub (events/ then archive). Returns whether it
 * loaded. Callers confirm discarding unsaved edits first. */
async function selectEvent(id: string, rerender = true): Promise<boolean> {
  setStatus(t("events.loadingOne", { id }));
  const summary = state.allEvents.find((e) => e.id === id);
  try {
    const file = await getJsonFile<EventData>(summary?.path ?? `data/events/${id}.json`);
    if (!file) {
      setStatus(t("events.notFound", { id }), true);
      return false;
    }
    state.currentEventId = id;
    state.currentEvent = file.data;
    state.selectedDayIndex = 0;
    state.pendingImportItems = null;
    state.eventDirty = false;
    state.pendingClose = false;
    state.expandedEventIds.add(id);
    setStatus("");
  } catch (err) {
    setStatus(t("events.loadFailed", { id, message: (err as Error).message }), true);
    return false;
  }
  updateSaveButtonState();
  if (rerender) {
    renderLeftPanel();
    renderMainPanel();
  }
  return true;
}

/** In-page modal for a new event's id + name. Validation runs inline. */
function openNewEventModal(): void {
  const backdrop = el("div", { class: "modal-backdrop" });

  const idInput = el("input", {
    type: "text",
    class: "row-input",
    placeholder: "event-id",
    autocomplete: "off",
    spellcheck: "false",
  }) as HTMLInputElement;
  const nameInput = el("input", {
    type: "text",
    class: "row-input",
    placeholder: t("events.namePlaceholder"),
    autocomplete: "off",
  }) as HTMLInputElement;

  const errorEl = el("p", { class: "error" }, []);
  errorEl.style.display = "none";

  const submitBtn = el("button", { class: "btn btn-primary" }, [t("events.newIdCreate")]);
  const cancelBtn = el("button", { class: "btn btn-secondary" }, [t("auth.cancel")]);

  function showError(message: string): void {
    errorEl.textContent = message;
    errorEl.style.display = "";
  }

  function submit(): void {
    const id = idInput.value.trim();
    if (!id) return;
    if (!/^[a-z0-9-]+$/.test(id)) {
      showError(t("events.invalidId"));
      return;
    }
    if (state.allEvents.some((e) => e.id === id)) {
      showError(t("events.alreadyExists", { id }));
      return;
    }
    backdrop.remove();
    stageNewEvent(id, nameInput.value.trim() || id);
  }

  submitBtn.addEventListener("click", submit);
  for (const input of [idInput, nameInput]) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    input.addEventListener("input", () => {
      errorEl.style.display = "none";
    });
  }
  cancelBtn.addEventListener("click", () => backdrop.remove());

  const body = el("div", { class: "modal-body" }, [
    el("h3", {}, [t("events.newIdTitle")]),
    el("label", { class: "field" }, [t("events.newIdPrompt"), idInput]),
    el("label", { class: "field" }, [t("events.nameLabel"), nameInput]),
    errorEl,
    el("div", { class: "actions-row" }, [submitBtn, cancelBtn]),
  ]);
  const modal = el("div", { class: "modal" }, [body]);
  backdrop.append(modal);
  document.body.append(backdrop);
  idInput.focus();
}

/** Stages a validated new draft event locally; written on the next Save. */
function stageNewEvent(id: string, name: string): void {
  const newEvent: EventData = {
    id,
    name,
    status: "draft",
    announcement: "",
    countdownRows: [],
    scheduleDays: [],
  };
  state.currentEventId = id;
  state.currentEvent = newEvent;
  state.selectedDayIndex = 0;
  state.pendingImportItems = null;
  state.pendingClose = false;
  state.expandedEventIds.add(id);
  state.allEvents = [
    { id, name, status: "draft", archived: false, path: `data/events/${id}.json`, days: [], earliestDate: null },
    ...state.allEvents,
  ];
  markEventDirty();
  setStatus(t("events.newDraftStaged", { id }));
  renderLeftPanel();
  renderMainPanel();
}

/** Stages event.status = "active" + the display's activeEventId. Not written
 * until Save. */
function stageSetActive(): void {
  const event = state.currentEvent;
  if (!event) return;
  event.status = "active";
  state.activeEventId = event.id;
  state.configPatch.activeEventId = event.id;
  markEventDirty();
  setStatus(t("editor.activeStaged", { id: event.id }));
  renderLeftPanel();
  renderMainPanel();
}

function earliestYear(event: EventData): number {
  const times: number[] = [];
  for (const row of event.countdownRows) {
    const time = new Date(row.time).getTime();
    if (!Number.isNaN(time)) times.push(time);
  }
  for (const day of event.scheduleDays) {
    const time = new Date(day.date).getTime();
    if (!Number.isNaN(time)) times.push(time);
  }
  if (times.length === 0) return new Date().getFullYear();
  return new Date(Math.min(...times)).getFullYear();
}

/** Stages closing the event (moves it to the archive, clears activeEventId if
 * it pointed here). Not written until Save. */
function stageCloseEvent(): void {
  const event = state.currentEvent;
  if (!event) return;
  if (!window.confirm(t("editor.closeConfirm", { id: event.id }))) return;
  event.status = "ended";
  state.pendingClose = true;
  if (state.activeEventId === event.id) {
    state.activeEventId = null;
    state.configPatch.activeEventId = null;
  }
  markEventDirty();
  setStatus(t("editor.closeStaged", { id: event.id }));
  renderLeftPanel();
  renderMainPanel();
}

/**
 * The one place any of this session's staged edits actually reach GitHub:
 * the current event (or its close-to-archive move) and any data/apps.json
 * field changes all go out together as a single commit (see
 * commitFiles()), rather than one commit per action.
 */
async function saveAll(): Promise<void> {
  if (!hasPendingChanges()) return;
  setStatus(t("save.saving"));
  try {
    const changes: FileChange[] = [];
    const messageParts: string[] = [];
    const localish = state.eventDirty || state.hasLocalChanges;

    // Sync the current event (local state is authoritative in local-first mode).
    if (state.currentEvent && localish) {
      if (state.pendingClose) {
        const year = earliestYear(state.currentEvent);
        changes.push({
          path: `data/archive/${year}/${state.currentEvent.id}.json`,
          content: JSON.stringify(state.currentEvent, null, 2) + "\n",
        });
        changes.push({ path: `data/events/${state.currentEvent.id}.json`, content: null });
        messageParts.push(`Close ${state.currentEvent.id}`);
      } else {
        changes.push({
          path: `data/events/${state.currentEvent.id}.json`,
          content: JSON.stringify(state.currentEvent, null, 2) + "\n",
        });
        messageParts.push(`Update ${state.currentEvent.id}`);
      }
    }

    // Write display.json from the CURRENT local config (local-first: local
    // state wins over whatever is on GitHub). Bump the content version so a
    // remote/GitHub-bootstrapped display re-pulls.
    state.contentVersion = (state.contentVersion ?? 0) + 1;
    state.contentUpdatedAt = new Date().toISOString().slice(0, 10);
    changes.push({ path: CONFIG_JSON_PATH, content: JSON.stringify(buildConfig(), null, 2) + "\n" });
    messageParts.push("sync display config");

    if (state.layout && (state.layoutDirty || state.hasLocalChanges)) {
      changes.push({
        path: LAYOUT_JSON_PATH,
        content: JSON.stringify(state.layout, null, 2) + "\n",
      });
      messageParts.push("sync layout");
    }

    await commitFiles(changes, messageParts.join(" + "));

    const wasClose = state.pendingClose;
    const savedEventId = state.currentEvent?.id ?? null;
    clearPendingChanges();

    if (wasClose) {
      state.currentEventId = null;
      state.currentEvent = null;
    }
    setStatus(wasClose ? t("save.closed", { id: savedEventId ?? "" }) : t("save.saved"));
    mirrorToLive(); // reflect the bumped content version in the local snapshot
    await loadEventsTree();
    renderDisplayModeSwitcher();
    renderAspectRatioSwitcher();
  } catch (err) {
    setStatus(t("save.failed", { message: (err as Error).message }), true);
  }
  updateSaveButtonState();
  renderLeftPanel();
  renderMainPanel();
}

function renderMainPanel(): void {
  clear(mainPanelEl);

  if (treeLoading && !state.currentEvent) {
    mainPanelEl.append(renderMainSkeleton());
    return;
  }

  if (!isSignedIn()) {
    mainPanelEl.append(el("p", { class: "muted" }, [t("signIn.toEdit")]));
    return;
  }

  const event = state.currentEvent;
  if (!event) {
    mainPanelEl.append(el("p", { class: "muted" }, [t("editor.selectOrCreate")]));
    return;
  }

  const actions = el("div", { class: "actions-row" });
  const setActiveBtn = el("button", { class: "btn btn-primary" }, [t("editor.setActive")]);
  setActiveBtn.addEventListener("click", () => stageSetActive());
  const closeBtn = el("button", { class: "btn btn-danger" }, [t("editor.closeEvent")]);
  closeBtn.addEventListener("click", () => stageCloseEvent());
  actions.append(setActiveBtn, closeBtn);

  const nameInput = el("input", {
    class: "event-name-input",
    type: "text",
    value: event.name ?? "",
    placeholder: event.id,
  }) as HTMLInputElement;
  nameInput.addEventListener("input", () => {
    event.name = nameInput.value;
    markEventDirty();
  });
  // Re-render the tree on blur so the group label reflects the new name.
  nameInput.addEventListener("change", () => renderLeftPanel());
  const eventHeader = el("div", { class: "event-header" }, [
    nameInput,
    el("span", { class: "event-id-tag" }, [event.id]),
    el("span", { class: `event-status-badge status-${event.status}` }, [event.status]),
  ]);

  const announcementField = el("label", { class: "field" }, [
    t("editor.announcement"),
    (() => {
      const input = el("textarea", { class: "announcement-input", rows: "2" }, [event.announcement]);
      input.addEventListener("input", () => {
        event.announcement = (input as HTMLTextAreaElement).value;
        markEventDirty();
      });
      return input;
    })(),
  ]);

  const countdownSection = renderCountdownRows(event);
  const daySection = renderDayEditor();
  const importSection = renderImportSection();

  mainPanelEl.append(eventHeader, actions, announcementField, countdownSection, daySection, importSection);
}

function renderCountdownRows(event: EventData): HTMLElement {
  const section = el("div", { class: "countdown-rows-section" });
  section.append(el("h3", {}, [t("countdown.title")]));

  const table = el("div", { class: "rows-table" });
  event.countdownRows.forEach((row, index) => {
    const past = isPast(row.time);
    const rowEl = el("div", { class: `row-editor${past ? " past" : ""}` });

    const titleInput = el("textarea", { class: "row-input", rows: "2" }, [row.title]);
    titleInput.addEventListener("input", () => {
      row.title = (titleInput as HTMLTextAreaElement).value;
      markEventDirty();
    });

    const dateTimeInputs = createDateTimeInputs(row.time, (iso) => {
      row.time = iso;
      markEventDirty();
    });

    const removeBtn = el("button", { class: "btn btn-secondary btn-small" }, [t("countdown.remove")]);
    removeBtn.addEventListener("click", () => {
      event.countdownRows.splice(index, 1);
      markEventDirty();
      renderMainPanel();
    });

    const handle = icon("grip");
    rowEl.append(handle, titleInput, dateTimeInputs, removeBtn);
    makeReorderable(rowEl, handle, index, event.countdownRows, () => {
      markEventDirty();
      renderMainPanel();
    });
    table.append(rowEl);
  });
  section.append(table);

  const addBtn = el("button", { class: "btn btn-secondary" }, [t("countdown.addRow")]);
  addBtn.addEventListener("click", () => {
    event.countdownRows.push({ title: "", time: "" });
    markEventDirty();
    renderMainPanel();
  });
  section.append(addBtn);

  return section;
}

/**
 * A date input + a time input side by side in one wrapper (counts as a
 * single grid cell in .row-editor's layout), recombined into one ISO
 * datetime string on every change. See datePartsToIso in dom.ts for why
 * this is two plain inputs instead of one <input type="datetime-local">.
 */
function createDateTimeInputs(
  initialIso: string,
  onChange: (iso: string) => void,
  timeAttrs: Record<string, string> = {},
): HTMLElement {
  const dateInput = el("input", {
    class: "row-input datetime-pair-date",
    type: "date",
    value: isoToDatePart(initialIso),
  }) as HTMLInputElement;
  const timeInput = el("input", {
    class: "row-input datetime-pair-time",
    type: "time",
    value: isoToTimePart(initialIso),
    ...timeAttrs,
  }) as HTMLInputElement;
  const update = () => onChange(datePartsToIso(dateInput.value, timeInput.value, initialIso));
  dateInput.addEventListener("input", update);
  timeInput.addEventListener("input", update);
  return el("div", { class: "datetime-pair" }, [dateInput, timeInput]);
}

function dateOffsetFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function renderDayEditor(): HTMLElement {
  const section = el("div", { class: "day-editor-section" });
  const day = currentDay();

  if (!day) {
    section.append(el("p", { class: "muted" }, [t("day.noDaySelected")]));
    return section;
  }

  section.append(el("h3", {}, [t("day.scheduleFor", { date: day.date || t("days.noDate") })]));

  const dateInput = el("input", { class: "row-input", type: "date", value: day.date }) as HTMLInputElement;
  dateInput.addEventListener("input", () => {
    day.date = dateInput.value;
    markEventDirty();
    renderLeftPanel();
  });

  const shortcuts = el("div", { class: "date-shortcuts" }, [
    (() => {
      const btn = el("button", { class: "btn btn-secondary btn-small" }, [t("days.today")]);
      btn.addEventListener("click", () => {
        day.date = dateOffsetFromToday(0);
        dateInput.value = day.date;
        markEventDirty();
        renderLeftPanel();
        renderMainPanel();
      });
      return btn;
    })(),
    (() => {
      const btn = el("button", { class: "btn btn-secondary btn-small" }, [t("days.tomorrow")]);
      btn.addEventListener("click", () => {
        day.date = dateOffsetFromToday(1);
        dateInput.value = day.date;
        markEventDirty();
        renderLeftPanel();
        renderMainPanel();
      });
      return btn;
    })(),
    (() => {
      const btn = el("button", { class: "btn btn-secondary btn-small" }, [t("days.dayAfter")]);
      btn.addEventListener("click", () => {
        day.date = dateOffsetFromToday(2);
        dateInput.value = day.date;
        markEventDirty();
        renderLeftPanel();
        renderMainPanel();
      });
      return btn;
    })(),
  ]);

  section.append(el("label", { class: "field" }, [t("day.date"), dateInput]), shortcuts);

  const dayAnnouncementInput = el("textarea", { class: "announcement-input", rows: "2" }, [day.announcement ?? ""]);
  dayAnnouncementInput.addEventListener("input", () => {
    day.announcement = (dayAnnouncementInput as HTMLTextAreaElement).value;
    markEventDirty();
  });
  section.append(el("label", { class: "field" }, [t("day.announcement"), dayAnnouncementInput]));

  const table = el("div", { class: "rows-table scrollable" });
  day.items.forEach((item, index) => {
    const rowEl = el("div", { class: "row-editor schedule-item-editor" });

    const titleInput = el("textarea", {
      class: "row-input",
      rows: "1",
      placeholder: t("day.itemTitle"),
    }, [item.title]);
    titleInput.addEventListener("input", () => {
      item.title = (titleInput as HTMLTextAreaElement).value;
      markEventDirty();
    });

    const detailInput = el("textarea", {
      class: "row-input",
      rows: "1",
      placeholder: t("day.itemDetail"),
    }, [item.detail]);
    detailInput.addEventListener("input", () => {
      item.detail = (detailInput as HTMLTextAreaElement).value;
      markEventDirty();
    });

    const removeBtn = el("button", { class: "btn btn-secondary btn-small" }, [t("day.remove")]);
    removeBtn.addEventListener("click", () => {
      day.items.splice(index, 1);
      markEventDirty();
      renderMainPanel();
    });

    const handle = icon("grip");
    rowEl.append(handle, titleInput, detailInput, removeBtn);
    makeReorderable(rowEl, handle, index, day.items, () => {
      markEventDirty();
      renderMainPanel();
    });
    table.append(rowEl);
  });
  section.append(table);

  const addRowBtn = el("button", { class: "btn btn-secondary" }, [t("day.addRow")]);
  addRowBtn.addEventListener("click", () => {
    day.items.push({ title: "", detail: "" });
    markEventDirty();
    renderMainPanel();
  });
  section.append(addRowBtn);

  return section;
}

function renderImportSection(): HTMLElement {
  const section = el("div", { class: "import-section" });
  section.append(el("h3", {}, [t("import.title")]));

  const fileInput = el("input", { type: "file", accept: ".xlsx" });
  fileInput.addEventListener("change", async () => {
    const input = fileInput as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      state.pendingImportItems = await parseXlsxToItems(file);
      renderMainPanel();
    } catch (err) {
      setStatus(t("import.parseFailed", { name: file.name, message: (err as Error).message }), true);
    }
  });
  section.append(fileInput);

  if (state.pendingImportItems) {
    section.append(el("p", {}, [t("import.parsed", { count: state.pendingImportItems.length })]));
    const preview = el("div", { class: "rows-table scrollable" });
    for (const item of state.pendingImportItems) {
      preview.append(
        el("div", { class: "row-editor readonly" }, [
          el("span", { class: "row-input" }, [item.title]),
          el("span", { class: "row-input" }, [item.detail]),
        ]),
      );
    }
    section.append(preview);

    const applyBtn = el("button", { class: "btn btn-primary" }, [t("import.apply")]);
    applyBtn.addEventListener("click", () => {
      const day = currentDay();
      const items: ScheduleItem[] = state.pendingImportItems ?? [];
      if (!day) {
        setStatus(t("import.noDay"), true);
        return;
      }
      day.items = items;
      state.pendingImportItems = null;
      markEventDirty();
      setStatus(t("import.applied"));
      renderMainPanel();
    });

    const cancelBtn = el("button", { class: "btn btn-secondary" }, [t("import.cancel")]);
    cancelBtn.addEventListener("click", () => {
      state.pendingImportItems = null;
      renderMainPanel();
    });

    section.append(applyBtn, cancelBtn);
  }

  return section;
}
