import { el, clear, isPast, isoToDatePart, isoToTimePart, datePartsToIso } from "./dom";
import { renderAuthControls } from "./authPanel";
import { renderSettingsControls } from "./settingsPanel";
import { renderOverview } from "./overview";
import { getJsonFile, listDir, commitFiles, type FileChange } from "./githubApi";
import { isSignedIn } from "./auth";
import { parseXlsxToItems } from "./excelImport";
import {
  state,
  currentApp,
  currentDay,
  hasPendingChanges,
  clearPendingChanges,
  seedLabels,
  type EventListEntry,
} from "./state";
import type { AppsFile, EventData, ScheduleItem, DisplayLanguage, LabelKey } from "./types";
import { DEFAULT_LABELS } from "./labels";
import { DISPLAY_MODES, DEFAULT_DISPLAY_MODE_ID, getDisplayMode } from "./displayModes";
import { ASPECT_RATIOS, DEFAULT_ASPECT_RATIO_ID, getAspectRatio } from "./aspectRatios";
import { applyPreviewTheme } from "./previewTheme";
import { t, getLang, setLang, onLangChange, type Lang } from "./i18n";

// Public data/apps.json is fetched with a plain (unauthenticated) fetch,
// relative to admin/index.html.
const PUBLIC_APPS_URL = "../data/apps.json";
const APPS_JSON_PATH = "data/apps.json";

let rootEl: HTMLElement;
let appSwitcherEl: HTMLElement;
let displayModeSwitcherEl: HTMLElement;
let aspectRatioSwitcherEl: HTMLElement;
let langSwitcherEl: HTMLElement;
let authControlsEl: HTMLElement;
let settingsControlsEl: HTMLElement;
let versionIndicatorEl: HTMLElement;
let viewToggleEl: HTMLElement;
let leftPanelEl: HTMLElement;
let mainPanelEl: HTMLElement;
let overviewPanelEl: HTMLElement;
let previewPanelEl: HTMLElement;
let statusBarEl: HTMLElement;
let saveBarEl: HTMLElement;
let saveBtnEl: HTMLButtonElement;

export function init(root: HTMLElement): void {
  rootEl = root;
  rootEl.innerHTML = "";

  const header = el("header", { class: "app-header" });
  viewToggleEl = el("div", { class: "view-toggle" });
  appSwitcherEl = el("div", { class: "app-switcher" });
  displayModeSwitcherEl = el("div", { class: "display-mode-switcher" });
  aspectRatioSwitcherEl = el("div", { class: "aspect-ratio-switcher" });
  langSwitcherEl = el("div", { class: "lang-switcher" });
  settingsControlsEl = el("div", { class: "settings-controls" });
  authControlsEl = el("div", { class: "auth-controls" });
  versionIndicatorEl = el("div", { class: "version-indicator" });
  saveBarEl = el("div", { class: "save-bar" });
  header.append(
    viewToggleEl,
    appSwitcherEl,
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
  overviewPanelEl = el("div", { class: "overview-panel" });
  // Always visible regardless of editor/overview view mode -- an operator
  // comparing display-mode presets shouldn't have to leave whatever they're
  // doing to see the effect.
  previewPanelEl = el("aside", { class: "preview-panel" });
  body.append(leftPanelEl, mainPanelEl, overviewPanelEl, previewPanelEl);

  statusBarEl = el("div", { class: "status-bar" });

  rootEl.append(header, body, statusBarEl);

  renderSaveBar();
  renderLangSwitcher();
  renderVersionIndicator();
  renderAuthControls(authControlsEl, onSignedIn);
  renderSettingsControls(settingsControlsEl, onSettingsSaved, onDisplaySettingsChanged);
  renderViewToggle();
  applyViewMode();
  loadApps();

  // Every edit is staged locally and only ever reaches GitHub via Save
  // (see saveAll()) -- so a closed tab before Save is a real, silent loss
  // of whatever was staged. Warn like any other unsaved-changes editor.
  window.addEventListener("beforeunload", (event) => {
    if (hasPendingChanges()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  // Re-render every visible piece of chrome on a language switch, so it
  // takes effect immediately without a page reload.
  onLangChange(() => {
    renderViewToggle();
    renderSaveBar();
    renderLangSwitcher();
    renderVersionIndicator();
    renderAuthControls(authControlsEl, onSignedIn);
    renderSettingsControls(settingsControlsEl, onSettingsSaved, onDisplaySettingsChanged);
    renderAppSwitcher();
    renderDisplayModeSwitcher();
    renderAspectRatioSwitcher();
    renderPreviewPanel();
    renderLeftPanel();
    renderMainPanel();
    if (state.viewMode === "overview" && isSignedIn()) {
      void renderOverview(overviewPanelEl, jumpToEvent);
    }
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
  saveBtnEl = el("button", { class: "btn btn-primary" }, [t("save.button")]) as HTMLButtonElement;
  saveBtnEl.addEventListener("click", () => void saveAll());
  saveBarEl.append(saveBtnEl);
  updateSaveButtonState();
}

function updateSaveButtonState(): void {
  const dirty = hasPendingChanges();
  saveBtnEl.textContent = dirty ? t("save.button") : t("save.none");
  saveBtnEl.className = `btn ${dirty ? "btn-primary" : "btn-secondary"}`;
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
  const editorBtn = el(
    "button",
    { class: `btn ${state.viewMode === "editor" ? "btn-primary" : "btn-secondary"}` },
    [t("nav.editor")],
  );
  const overviewBtn = el(
    "button",
    { class: `btn ${state.viewMode === "overview" ? "btn-primary" : "btn-secondary"}` },
    [t("nav.allEvents")],
  );
  editorBtn.addEventListener("click", () => switchViewMode("editor"));
  overviewBtn.addEventListener("click", () => switchViewMode("overview"));
  viewToggleEl.append(editorBtn, overviewBtn);
}

function applyViewMode(): void {
  const isOverview = state.viewMode === "overview";
  leftPanelEl.style.display = isOverview ? "none" : "";
  mainPanelEl.style.display = isOverview ? "none" : "";
  overviewPanelEl.style.display = isOverview ? "" : "none";
}

function switchViewMode(mode: "editor" | "overview"): void {
  state.viewMode = mode;
  renderViewToggle();
  applyViewMode();
  if (mode === "overview") {
    if (!isSignedIn()) {
      clear(overviewPanelEl);
      overviewPanelEl.append(el("p", { class: "muted" }, [t("overview.signInToSee")]));
      return;
    }
    void renderOverview(overviewPanelEl, jumpToEvent);
  }
}

/** Overview row clicked -> switch to that app's editor with that event
 * loaded, so "seeing all events" and "editing one" are one click apart. */
function jumpToEvent(appId: string, eventId: string): void {
  if (!confirmDiscardEventIfDirty(t("events.switchAction"))) return;
  state.currentAppId = appId;
  state.currentEventId = null;
  state.currentEvent = null;
  applyTheme();
  renderAppSwitcher();
  renderPreviewPanel();
  switchViewMode("editor");
  void loadEventsForCurrentApp().then(() => selectEvent(eventId));
}

function onSettingsSaved(): void {
  setStatus(t("settings.saved"));
  if (isSignedIn()) {
    void loadEventsForCurrentApp();
  }
}

/** Called by the settings panel after any Display-settings edit (language /
 * text size / labels). Those edits mutate state + state.appsPatch directly
 * (see settingsPanel.ts); this refreshes the live preview and the Save
 * button so the effect is visible immediately and Save picks it up. */
function onDisplaySettingsChanged(): void {
  setStatus(t("settings.displaySettingsStaged"));
  renderPreviewPanel();
  updateSaveButtonState();
}

function setStatus(message: string, isError = false): void {
  statusBarEl.textContent = message;
  statusBarEl.className = isError ? "status-bar status-error" : "status-bar";
}

async function loadApps(): Promise<void> {
  try {
    const res = await fetch(PUBLIC_APPS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as AppsFile;
    state.apps = data.apps ?? [];
    state.selectedAppId = data.selectedAppId ?? (state.apps[0]?.id ?? null);
    state.displayModeId = data.displayModeId ?? null;
    state.aspectRatioId = data.aspectRatioId ?? null;
    state.displayLanguage = data.displayLanguage === "en" ? "en" : "ja";
    state.textScale = typeof data.textScale === "number" ? data.textScale : 1;
    state.labels = seedLabels(data.labels);
    state.contentVersion = data.contentVersion ?? null;
    state.contentUpdatedAt = data.contentUpdatedAt ?? null;
    if (state.apps.length > 0) {
      state.currentAppId = state.apps[0].id;
    }
    renderVersionIndicator();
    renderAppSwitcher();
    renderDisplayModeSwitcher();
    renderAspectRatioSwitcher();
    applyTheme();
    renderPreviewPanel();
    if (isSignedIn()) {
      await loadEventsForCurrentApp();
    } else {
      renderLeftPanel();
      renderMainPanel();
    }
  } catch (err) {
    const message = (err as Error).message;
    setStatus(t("load.failed", { message }), true);
    // A failed initial load otherwise leaves every panel silently empty,
    // with only the small status-bar line above as a clue -- easy to miss
    // and easy to mistake for "the whole page is blank." Make it loud.
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
  if (state.viewMode === "overview") {
    void renderOverview(overviewPanelEl, jumpToEvent);
  } else {
    void loadEventsForCurrentApp();
  }
}

function renderAppSwitcher(): void {
  clear(appSwitcherEl);
  const select = el("select", { class: "app-select" });
  for (const app of state.apps) {
    const label = app.id === state.selectedAppId ? t("app.nameLiveSuffix", { name: app.name }) : app.name;
    const option = el("option", { value: app.id }, [label]);
    if (app.id === state.currentAppId) option.setAttribute("selected", "selected");
    select.append(option);
  }
  select.addEventListener("change", () => {
    const newAppId = (select as HTMLSelectElement).value;
    if (newAppId === state.currentAppId) return;
    if (!confirmDiscardEventIfDirty(t("events.switchAppsAction"))) {
      select.value = state.currentAppId ?? "";
      return;
    }
    state.currentAppId = newAppId;
    state.currentEventId = null;
    state.currentEvent = null;
    applyTheme();
    renderAppSwitcher();
    renderPreviewPanel();
    if (isSignedIn()) {
      loadEventsForCurrentApp();
    } else {
      renderLeftPanel();
      renderMainPanel();
    }
  });

  const isLive = state.currentAppId !== null && state.currentAppId === state.selectedAppId;
  const staged = state.appsPatch.selectedAppId === state.currentAppId;
  const showBtn = el(
    "button",
    { class: `btn ${isLive ? "btn-secondary" : "btn-primary"}`, ...(isLive ? { disabled: "true" } : {}) },
    [isLive ? (staged ? t("app.liveOnDisplayUnsaved") : t("app.liveOnDisplay")) : t("app.showOnDisplay")],
  );
  if (!isLive) {
    showBtn.addEventListener("click", () => stageSelectedAppOnDisplay());
  }

  appSwitcherEl.append(el("label", {}, [t("app.label")]), select, showBtn);
}

/**
 * Stages which app the primary display (any screen with no ?app= override)
 * should show -- independent of "Set as active" -- that picks which event
 * an app shows; this picks which app is even on screen. A screen pinned
 * via ?app= on its own URL ignores this. Not written until Save.
 */
function stageSelectedAppOnDisplay(): void {
  const appId = state.currentAppId;
  if (!appId) return;
  state.selectedAppId = appId;
  state.appsPatch.selectedAppId = appId;
  setStatus(t("app.stagedOnDisplay", { appId }));
  renderAppSwitcher();
  updateSaveButtonState();
}

function applyTheme(): void {
  const app = currentApp();
  if (!app) return;
  const root = document.documentElement;
  root.style.setProperty("--accent", app.theme.accent);
  root.style.setProperty("--primary", app.theme.primary);
  root.style.setProperty("--background", app.theme.background);
}

function renderDisplayModeSwitcher(): void {
  clear(displayModeSwitcherEl);
  const select = el("select", { class: "display-mode-select" });
  const activeId = state.displayModeId ?? DEFAULT_DISPLAY_MODE_ID;
  for (const mode of DISPLAY_MODES) {
    const option = el("option", { value: mode.id }, [mode.label]);
    if (mode.id === activeId) option.setAttribute("selected", "selected");
    select.append(option);
  }
  select.addEventListener("change", () => {
    stageDisplayMode((select as HTMLSelectElement).value);
  });
  displayModeSwitcherEl.append(el("label", {}, [t("displayMode.label")]), select);
}

/** Stages the display-mode preset applied on every screen, pinned or not.
 * Not written until Save -- see stageSelectedAppOnDisplay(). */
function stageDisplayMode(modeId: string): void {
  state.displayModeId = modeId;
  state.appsPatch.displayModeId = modeId;
  setStatus(t("displayMode.staged", { label: getDisplayMode(modeId).label }));
  renderDisplayModeSwitcher();
  renderPreviewPanel();
  updateSaveButtonState();
}

function renderAspectRatioSwitcher(): void {
  clear(aspectRatioSwitcherEl);
  const select = el("select", { class: "aspect-ratio-select" });
  const activeId = state.aspectRatioId ?? DEFAULT_ASPECT_RATIO_ID;
  for (const ratio of ASPECT_RATIOS) {
    const option = el("option", { value: ratio.id }, [ratio.label]);
    if (ratio.id === activeId) option.setAttribute("selected", "selected");
    select.append(option);
  }
  select.addEventListener("change", () => {
    stageAspectRatio((select as HTMLSelectElement).value);
  });
  aspectRatioSwitcherEl.append(el("label", {}, [t("aspectRatio.label")]), select);
}

/** Stages the aspect ratio the stage is letterboxed to on every screen,
 * pinned or not -- e.g. for a 4:3 or ultrawide TV instead of the 16:9
 * default. Not written until Save -- see stageSelectedAppOnDisplay(). */
function stageAspectRatio(aspectRatioId: string): void {
  state.aspectRatioId = aspectRatioId;
  state.appsPatch.aspectRatioId = aspectRatioId;
  setStatus(t("aspectRatio.staged", { label: getAspectRatio(aspectRatioId).label }));
  renderAspectRatioSwitcher();
  renderPreviewPanel();
  updateSaveButtonState();
}

/** The active display language for the DISPLAY labels (not the admin UI). */
function displayLang(): DisplayLanguage {
  return state.displayLanguage === "en" ? "en" : "ja";
}

/** A display label resolved from the working labels state (edited live via
 * the settings panel), falling back to the built-in default -- mirrors
 * resolveLabel() in src/labels.ts so the preview matches the real site. */
function resolveDisplayLabel(key: LabelKey): string {
  const lang = displayLang();
  const chosen = state.labels?.[key] ?? DEFAULT_LABELS[key];
  return chosen[lang] || DEFAULT_LABELS[key][lang] || DEFAULT_LABELS[key].ja;
}

/**
 * A miniature, representative mockup of BOTH display screens (the countdown
 * page and the schedule page), styled with the same --theme-* CSS custom
 * properties the real site uses. It renders the editable display labels in
 * the currently-selected display language, scaled by the text-size setting,
 * so switching the app, display mode, language, text size, or editing a
 * label updates it instantly. Not a live embed -- just enough to see where
 * each label lands on each screen without walking over to the actual TV.
 */
function renderPreviewPanel(): void {
  clear(previewPanelEl);
  const app = currentApp();
  applyPreviewTheme(previewPanelEl, app, state.displayModeId);

  const modeLabel = getDisplayMode(state.displayModeId).label;
  const ratio = getAspectRatio(state.aspectRatioId);
  previewPanelEl.append(el("h3", { class: "preview-panel-title" }, [t("preview.title")]));
  previewPanelEl.append(el("p", { class: "preview-mode-label" }, [t("preview.summary", { mode: modeLabel, ratio: ratio.label })]));

  // Text size is a font-size multiplier on the real display; scale the mock
  // root font-size so every em-based label inside scales with it.
  const scale = typeof state.textScale === "number" && state.textScale > 0 ? state.textScale : 1;
  const rootFontStyle = `font-size: ${(12 * scale).toFixed(2)}px;`;

  previewPanelEl.append(
    renderCountdownScreenMock(app, rootFontStyle),
    renderScheduleScreenMock(rootFontStyle),
  );
}

/** Countdown-page mock: current-time label + clock, a countdown target with
 * the "until" suffix, the next-schedule list, an announcement, and the
 * screen-toggle label. */
function renderCountdownScreenMock(app: ReturnType<typeof currentApp>, rootFontStyle: string): HTMLElement {
  const wrap = el("div", { class: "preview-screen-wrap" });
  wrap.append(el("p", { class: "preview-screen-label" }, [t("preview.countdownScreen")]));

  const screen = el("div", { class: "preview-mock preview-screen", style: rootFontStyle }, [
    el("div", { class: "preview-mock-title" }, [app ? app.name : t("preview.noApp")]),
    el("div", { class: "preview-cd-top" }, [
      el("span", { class: "preview-cd-clock-label" }, [resolveDisplayLabel("currentTime")]),
      el("span", { class: "preview-cd-clock" }, ["12:34:56"]),
    ]),
    el("div", { class: "preview-mock-countdown" }, [
      el("span", {}, [t("preview.sampleCountdownTitle")]),
      el("span", { class: "preview-cd-until" }, [` 13:30 ${resolveDisplayLabel("until")}`]),
    ]),
    el("div", { class: "preview-cd-next" }, [
      el("div", { class: "preview-cd-next-head" }, [resolveDisplayLabel("nextSchedule")]),
      el("div", { class: "preview-mock-rows" }, [
        el("div", { class: "preview-mock-row" }, [
          el("span", {}, [t("preview.sampleNext1")]),
          el("span", {}, ["09:00"]),
        ]),
        el("div", { class: "preview-mock-row" }, [
          el("span", {}, [t("preview.sampleNext2")]),
          el("span", {}, ["13:50"]),
        ]),
      ]),
    ]),
    el("div", { class: "preview-mock-announcement" }, [
      el("span", { class: "preview-notice-prefix" }, [resolveDisplayLabel("noticePrefix")]),
      t("preview.sampleAnnouncement"),
    ]),
    el("div", { class: "preview-toggle-chip" }, [resolveDisplayLabel("toggle")]),
  ]);
  wrap.append(screen);
  return wrap;
}

/** Schedule-page mock: two day columns (today / tomorrow) with the relative
 * day labels and a couple of schedule items each, plus the announcement. */
function renderScheduleScreenMock(rootFontStyle: string): HTMLElement {
  const wrap = el("div", { class: "preview-screen-wrap" });
  wrap.append(el("p", { class: "preview-screen-label" }, [t("preview.scheduleScreen")]));

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const fmt = (d: Date) =>
    `${d.getMonth() + 1}/${d.getDate()}`;

  const column = (dateLabel: string, relLabel: string, items: Array<[string, string]>) =>
    el("div", { class: "preview-sched-col" }, [
      el("div", { class: "preview-sched-date" }, [dateLabel]),
      el("div", { class: "preview-sched-rel" }, [relLabel]),
      ...items.map(([title, detail]) =>
        el("div", { class: "preview-mock-row" }, [
          el("span", {}, [title]),
          el("span", {}, [detail]),
        ]),
      ),
    ]);

  const screen = el("div", { class: "preview-mock preview-screen", style: rootFontStyle }, [
    el("div", { class: "preview-mock-announcement" }, [
      el("span", { class: "preview-notice-prefix" }, [resolveDisplayLabel("noticePrefix")]),
      t("preview.sampleAnnouncement"),
    ]),
    el("div", { class: "preview-sched-cols" }, [
      column(fmt(today), resolveDisplayLabel("today"), [
        [t("preview.sampleItem1Title"), t("preview.sampleItem1Detail")],
      ]),
      column(fmt(tomorrow), resolveDisplayLabel("tomorrow"), [
        [t("preview.sampleItem2Title"), t("preview.sampleItem2Detail")],
      ]),
    ]),
  ]);
  wrap.append(screen);
  return wrap;
}

async function loadEventsForCurrentApp(): Promise<void> {
  const appId = state.currentAppId;
  if (!appId) return;
  setStatus(t("events.loading"));
  try {
    const entries = await listDir("data/events");
    const jsonEntries = entries.filter((e) => e.type === "file" && e.name.endsWith(".json"));
    const results: EventListEntry[] = [];
    for (const entry of jsonEntries) {
      const file = await getJsonFile<EventData>(entry.path);
      if (file && file.data.appId === appId) {
        results.push({ id: file.data.id, status: file.data.status });
      }
    }
    state.eventsForApp = results;
    setStatus("");
  } catch (err) {
    setStatus(t("events.listFailed", { message: (err as Error).message }), true);
    state.eventsForApp = [];
  }
  renderLeftPanel();
  renderMainPanel();
}

function renderLeftPanel(): void {
  clear(leftPanelEl);

  const pickerSection = el("div", { class: "event-picker" });
  pickerSection.append(el("h3", {}, [t("events.title")]));

  if (!isSignedIn()) {
    pickerSection.append(el("p", { class: "muted" }, [t("events.signInToLoad")]));
    leftPanelEl.append(pickerSection);
    return;
  }

  const list = el("ul", { class: "event-list" });
  for (const entry of state.eventsForApp) {
    const isSelected = entry.id === state.currentEventId;
    const item = el("li", {
      class: `event-list-item${isSelected ? " selected" : ""} status-${entry.status}`,
    }, [
      el("span", { class: "event-id" }, [entry.id]),
      el("span", { class: "event-status-badge" }, [entry.status]),
    ]);
    item.addEventListener("click", () => {
      if (entry.id === state.currentEventId) return;
      if (!confirmDiscardEventIfDirty(t("events.switchAction"))) return;
      void selectEvent(entry.id);
    });
    list.append(item);
  }
  pickerSection.append(list);

  const newDraftBtn = el("button", { class: "btn btn-secondary" }, [t("events.newDraft")]);
  newDraftBtn.addEventListener("click", () => {
    if (!confirmDiscardEventIfDirty(t("events.newDraftAction"))) return;
    newDraftEvent();
  });
  pickerSection.append(newDraftBtn);

  leftPanelEl.append(pickerSection);

  const dayNavSection = el("div", { class: "day-nav" });
  dayNavSection.append(el("h3", {}, [t("days.title")]));

  if (!state.currentEvent) {
    dayNavSection.append(el("p", { class: "muted" }, [t("days.selectEvent")]));
  } else {
    const dayList = el("ul", { class: "day-list" });
    state.currentEvent.scheduleDays.forEach((day, index) => {
      const past = isPast(`${day.date}T23:59:59`);
      const item = el("li", {
        class: `day-list-item${index === state.selectedDayIndex ? " selected" : ""}${past ? " past" : ""}`,
      }, [day.date || t("days.noDate")]);
      item.addEventListener("click", () => {
        state.selectedDayIndex = index;
        renderLeftPanel();
        renderMainPanel();
      });
      dayList.append(item);
    });
    dayNavSection.append(dayList);

    const addDayBtn = el("button", { class: "btn btn-secondary" }, [t("days.addDay")]);
    addDayBtn.addEventListener("click", () => {
      if (!state.currentEvent) return;
      // No prompt() for the date -- push a blank day and let the date
      // picker (+ today/tomorrow/day-after shortcuts) rendered for it
      // (see renderDayEditor) be how it's set.
      state.currentEvent.scheduleDays.push({ date: "", announcement: "", items: [] });
      state.selectedDayIndex = state.currentEvent.scheduleDays.length - 1;
      markEventDirty();
      renderLeftPanel();
      renderMainPanel();
    });
    dayNavSection.append(addDayBtn);
  }

  leftPanelEl.append(dayNavSection);
}

/** Loads an event fresh from GitHub. Callers must confirm discarding any
 * unsaved edits first (see confirmDiscardEventIfDirty). */
async function selectEvent(id: string): Promise<void> {
  setStatus(t("events.loadingOne", { id }));
  try {
    const file = await getJsonFile<EventData>(`data/events/${id}.json`);
    if (!file) {
      setStatus(t("events.notFound", { id }), true);
      return;
    }
    state.currentEventId = id;
    state.currentEvent = file.data;
    state.selectedDayIndex = 0;
    state.pendingImportItems = null;
    state.eventDirty = false;
    state.pendingClose = false;
    setStatus("");
  } catch (err) {
    setStatus(t("events.loadFailed", { id, message: (err as Error).message }), true);
  }
  updateSaveButtonState();
  renderLeftPanel();
  renderMainPanel();
}

/** Stages a brand-new draft event locally; it's written on the next Save,
 * same as any other edit. Caller must confirm discarding unsaved edits
 * first (see confirmDiscardEventIfDirty). */
function newDraftEvent(): void {
  const appId = state.currentAppId;
  if (!appId) return;
  openNewEventModal(appId);
}

/** In-page modal for the new-event id, mirroring the auth token modal
 * (authPanel.ts). Validation runs inside the modal and errors show inline,
 * so an invalid/duplicate id never gets accepted or leaks to the status
 * bar. */
function openNewEventModal(appId: string): void {
  const backdrop = el("div", { class: "modal-backdrop" });

  const idInput = el("input", {
    type: "text",
    class: "row-input",
    placeholder: "event-id",
    autocomplete: "off",
    spellcheck: "false",
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
    if (state.eventsForApp.some((e) => e.id === id)) {
      showError(t("events.alreadyExists", { id }));
      return;
    }
    backdrop.remove();
    stageNewDraftEvent(appId, id);
  }

  submitBtn.addEventListener("click", submit);
  idInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  idInput.addEventListener("input", () => {
    errorEl.style.display = "none";
  });
  cancelBtn.addEventListener("click", () => backdrop.remove());

  const body = el("div", { class: "modal-body" }, [
    el("h3", {}, [t("events.newIdTitle")]),
    el("label", { class: "field" }, [t("events.newIdPrompt"), idInput]),
    errorEl,
    el("div", { class: "actions-row" }, [submitBtn, cancelBtn]),
  ]);
  const modal = el("div", { class: "modal" }, [body]);
  backdrop.append(modal);
  document.body.append(backdrop);
  idInput.focus();
}

/** Stages a validated new draft event locally; written on the next Save. */
function stageNewDraftEvent(appId: string, id: string): void {
  const newEvent: EventData = {
    id,
    appId,
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
  state.eventsForApp = [...state.eventsForApp, { id, status: "draft" }];
  markEventDirty();
  setStatus(t("events.newDraftStaged", { id }));
  renderLeftPanel();
  renderMainPanel();
}

/** Stages event.status = "active" and this app's activeEventId. Not
 * written until Save. */
function stageSetActive(): void {
  const event = state.currentEvent;
  const appId = state.currentAppId;
  if (!event || !appId) return;
  event.status = "active";
  state.appsPatch.activeEventIdByApp = {
    ...(state.appsPatch.activeEventIdByApp ?? {}),
    [appId]: event.id,
  };
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

/** Stages closing the event (moves it to the archive, clears this app's
 * activeEventId if it pointed here). Not written until Save. */
function stageCloseEvent(): void {
  const event = state.currentEvent;
  const appId = state.currentAppId;
  if (!event || !appId) return;
  if (!window.confirm(t("editor.closeConfirm", { id: event.id }))) return;
  event.status = "ended";
  state.pendingClose = true;
  const app = currentApp();
  if (app?.activeEventId === event.id) {
    state.appsPatch.activeEventIdByApp = {
      ...(state.appsPatch.activeEventIdByApp ?? {}),
      [appId]: null,
    };
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

    if (state.currentEvent && state.eventDirty) {
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

    const patch = state.appsPatch;
    const activeEdits = Object.entries(patch.activeEventIdByApp ?? {});
    const hasAppsPatch =
      patch.selectedAppId !== undefined ||
      patch.displayModeId !== undefined ||
      patch.aspectRatioId !== undefined ||
      patch.displayLanguage !== undefined ||
      patch.textScale !== undefined ||
      patch.labels !== undefined ||
      activeEdits.length > 0;

    if (hasAppsPatch) {
      // Re-read right before committing (this is a read, not a write) so
      // we only ever overlay OUR staged fields onto the current file --
      // never blindly re-serialize a possibly session-stale in-memory
      // copy of every other app's data too.
      const fresh = await getJsonFile<AppsFile>(APPS_JSON_PATH);
      const appsData: AppsFile = fresh ? fresh.data : { apps: state.apps };
      if (patch.selectedAppId !== undefined) appsData.selectedAppId = patch.selectedAppId;
      if (patch.displayModeId !== undefined) appsData.displayModeId = patch.displayModeId;
      if (patch.aspectRatioId !== undefined) appsData.aspectRatioId = patch.aspectRatioId;
      if (patch.displayLanguage !== undefined) appsData.displayLanguage = patch.displayLanguage;
      if (patch.textScale !== undefined) appsData.textScale = patch.textScale;
      if (patch.labels !== undefined) appsData.labels = patch.labels;
      for (const [appId, eventId] of activeEdits) {
        const app = appsData.apps.find((a) => a.id === appId);
        if (app) app.activeEventId = eventId;
      }
      changes.push({ path: APPS_JSON_PATH, content: JSON.stringify(appsData, null, 2) + "\n" });
      messageParts.push("update display settings");
    }

    if (changes.length === 0) {
      clearPendingChanges();
      setStatus("");
      updateSaveButtonState();
      return;
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
    await loadEventsForCurrentApp();
    renderAppSwitcher();
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

  const eventHeader = el("div", { class: "event-header" }, [
    el("h2", {}, [`${event.id} `, el("span", { class: `event-status-badge status-${event.status}` }, [event.status])]),
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

    rowEl.append(titleInput, dateTimeInputs, removeBtn);
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

    rowEl.append(titleInput, detailInput, removeBtn);
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
