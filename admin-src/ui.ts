import { el, clear, isPast } from "./dom";
import { renderAuthControls } from "./authPanel";
import { renderSettingsControls } from "./settingsPanel";
import { renderOverview } from "./overview";
import {
  getJsonFile,
  putJsonFile,
  getFile,
  deleteFile,
  listDir,
} from "./githubApi";
import { isSignedIn } from "./auth";
import { parseXlsxToRows } from "./excelImport";
import { state, currentApp, currentDay, type EventListEntry } from "./state";
import type { AppsFile, EventData, ScheduleRow } from "./types";
import { DISPLAY_MODES, DEFAULT_DISPLAY_MODE_ID, getDisplayMode } from "./displayModes";
import { applyPreviewTheme } from "./previewTheme";

// Public data/apps.json is fetched with a plain (unauthenticated) fetch,
// relative to admin/index.html.
const PUBLIC_APPS_URL = "../data/apps.json";
const APPS_JSON_PATH = "data/apps.json";

let rootEl: HTMLElement;
let appSwitcherEl: HTMLElement;
let displayModeSwitcherEl: HTMLElement;
let authControlsEl: HTMLElement;
let settingsControlsEl: HTMLElement;
let viewToggleEl: HTMLElement;
let leftPanelEl: HTMLElement;
let mainPanelEl: HTMLElement;
let overviewPanelEl: HTMLElement;
let previewPanelEl: HTMLElement;
let statusBarEl: HTMLElement;

export function init(root: HTMLElement): void {
  rootEl = root;
  rootEl.innerHTML = "";

  const header = el("header", { class: "app-header" });
  viewToggleEl = el("div", { class: "view-toggle" });
  appSwitcherEl = el("div", { class: "app-switcher" });
  displayModeSwitcherEl = el("div", { class: "display-mode-switcher" });
  settingsControlsEl = el("div", { class: "settings-controls" });
  authControlsEl = el("div", { class: "auth-controls" });
  header.append(viewToggleEl, appSwitcherEl, displayModeSwitcherEl, settingsControlsEl, authControlsEl);

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

  renderAuthControls(authControlsEl, onSignedIn);
  renderSettingsControls(settingsControlsEl, onSettingsSaved);
  renderViewToggle();
  applyViewMode();
  loadApps();
}

function renderViewToggle(): void {
  clear(viewToggleEl);
  const editorBtn = el(
    "button",
    { class: `btn ${state.viewMode === "editor" ? "btn-primary" : "btn-secondary"}` },
    ["Editor"],
  );
  const overviewBtn = el(
    "button",
    { class: `btn ${state.viewMode === "overview" ? "btn-primary" : "btn-secondary"}` },
    ["All events"],
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
      overviewPanelEl.append(el("p", { class: "muted" }, ["Sign in to see all events."]));
      return;
    }
    void renderOverview(overviewPanelEl, jumpToEvent);
  }
}

/** Overview row clicked -> switch to that app's editor with that event
 * loaded, so "seeing all events" and "editing one" are one click apart. */
function jumpToEvent(appId: string, eventId: string): void {
  state.currentAppId = appId;
  state.currentEventId = null;
  state.currentEvent = null;
  state.currentEventSha = null;
  applyTheme();
  renderAppSwitcher();
  renderPreviewPanel();
  switchViewMode("editor");
  void loadEventsForCurrentApp().then(() => selectEvent(eventId));
}

function onSettingsSaved(): void {
  setStatus("Settings saved.");
  if (isSignedIn()) {
    void loadEventsForCurrentApp();
  }
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
    if (state.apps.length > 0) {
      state.currentAppId = state.apps[0].id;
    }
    renderAppSwitcher();
    renderDisplayModeSwitcher();
    applyTheme();
    renderPreviewPanel();
    if (isSignedIn()) {
      await loadEventsForCurrentApp();
    } else {
      renderLeftPanel();
      renderMainPanel();
    }
  } catch (err) {
    setStatus(`Failed to load data/apps.json: ${(err as Error).message}`, true);
  }
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
    const label = app.id === state.selectedAppId ? `${app.name} (live on display)` : app.name;
    const option = el("option", { value: app.id }, [label]);
    if (app.id === state.currentAppId) option.setAttribute("selected", "selected");
    select.append(option);
  }
  select.addEventListener("change", () => {
    state.currentAppId = (select as HTMLSelectElement).value;
    state.currentEventId = null;
    state.currentEvent = null;
    state.currentEventSha = null;
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
  const showBtn = el(
    "button",
    { class: `btn ${isLive ? "btn-secondary" : "btn-primary"}`, ...(isLive ? { disabled: "true" } : {}) },
    [isLive ? "Live on display ✓" : "Show this app on display"],
  );
  if (!isLive) {
    showBtn.addEventListener("click", () => void setSelectedAppOnDisplay());
  }

  appSwitcherEl.append(el("label", {}, ["App: "]), select, showBtn);
}

/**
 * Sets which app the primary display (any screen with no ?app= override)
 * currently shows. This is independent of "Set as active" -- that picks
 * which event an app shows; this picks which app is even on screen. A
 * screen pinned via ?app= on its own URL ignores this.
 */
async function setSelectedAppOnDisplay(): Promise<void> {
  const appId = state.currentAppId;
  if (!appId) return;
  try {
    const fresh = await getJsonFile<AppsFile>(APPS_JSON_PATH);
    if (!fresh) {
      setStatus("Failed to load data/apps.json.", true);
      return;
    }
    fresh.data.selectedAppId = appId;
    await putJsonFile(APPS_JSON_PATH, fresh.data, `Show ${appId} on display`, fresh.sha);
    state.selectedAppId = appId;
    setStatus(`${appId} is now showing on the display.`);
    renderAppSwitcher();
  } catch (err) {
    setStatus(`Failed to switch the display: ${(err as Error).message}`, true);
  }
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
    void setDisplayMode((select as HTMLSelectElement).value);
  });
  displayModeSwitcherEl.append(el("label", {}, ["Display mode: "]), select);
}

/**
 * Sets the display-mode preset (see displayModes.ts) applied on every
 * screen, pinned or not. Same shape as setSelectedAppOnDisplay: re-fetch
 * for a current sha, write, then update local state and feedback.
 */
async function setDisplayMode(modeId: string): Promise<void> {
  try {
    const fresh = await getJsonFile<AppsFile>(APPS_JSON_PATH);
    if (!fresh) {
      setStatus("Failed to load data/apps.json.", true);
      return;
    }
    fresh.data.displayModeId = modeId;
    await putJsonFile(APPS_JSON_PATH, fresh.data, `Set display mode: ${modeId}`, fresh.sha);
    state.displayModeId = modeId;
    setStatus(`Display mode set to "${getDisplayMode(modeId).label}".`);
    renderDisplayModeSwitcher();
    renderPreviewPanel();
  } catch (err) {
    setStatus(`Failed to switch display mode: ${(err as Error).message}`, true);
  }
}

/**
 * A miniature, representative mockup of the real display site (title, a
 * countdown-style number, an announcement bar, a couple of schedule rows),
 * styled with the same --theme-* CSS custom properties the real site uses,
 * so switching the app or the display-mode dropdown updates it instantly.
 * This is not a live embed of the site -- just enough to compare presets
 * without walking over to the actual TV.
 */
function renderPreviewPanel(): void {
  clear(previewPanelEl);
  const app = currentApp();
  applyPreviewTheme(previewPanelEl, app, state.displayModeId);

  const modeLabel = getDisplayMode(state.displayModeId).label;
  previewPanelEl.append(el("h3", { class: "preview-panel-title" }, ["Display preview"]));
  previewPanelEl.append(el("p", { class: "preview-mode-label" }, [modeLabel]));

  const mock = el("div", { class: "preview-mock" }, [
    el("div", { class: "preview-mock-title" }, [app ? app.name : "No app selected"]),
    el("div", { class: "preview-mock-countdown" }, ["12:34:56"]),
    el("div", { class: "preview-mock-announcement" }, [
      "Next up: ",
      el("span", { class: "keyword keyword-a" }, ["JSB1000"]),
      " then ",
      el("span", { class: "keyword keyword-b" }, ["ST1000"]),
    ]),
    el("div", { class: "preview-mock-rows" }, [
      el("div", { class: "preview-mock-row" }, [
        el("span", {}, ["Practice"]),
        el("span", {}, ["09:00"]),
      ]),
      el("div", { class: "preview-mock-row" }, [
        el("span", {}, ["Qualifying"]),
        el("span", {}, ["13:30"]),
      ]),
    ]),
  ]);
  previewPanelEl.append(mock);
}

async function loadEventsForCurrentApp(): Promise<void> {
  const appId = state.currentAppId;
  if (!appId) return;
  setStatus("Loading events…");
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
    setStatus(`Failed to list data/events: ${(err as Error).message}`, true);
    state.eventsForApp = [];
  }
  renderLeftPanel();
  renderMainPanel();
}

function renderLeftPanel(): void {
  clear(leftPanelEl);

  const pickerSection = el("div", { class: "event-picker" });
  pickerSection.append(el("h3", {}, ["Events"]));

  if (!isSignedIn()) {
    pickerSection.append(el("p", { class: "muted" }, ["Sign in to load events."]));
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
    item.addEventListener("click", () => selectEvent(entry.id));
    list.append(item);
  }
  pickerSection.append(list);

  const newDraftBtn = el("button", { class: "btn btn-secondary" }, ["New draft event"]);
  newDraftBtn.addEventListener("click", () => void newDraftEvent());
  pickerSection.append(newDraftBtn);

  leftPanelEl.append(pickerSection);

  const dayNavSection = el("div", { class: "day-nav" });
  dayNavSection.append(el("h3", {}, ["Days"]));

  if (!state.currentEvent) {
    dayNavSection.append(el("p", { class: "muted" }, ["Select an event."]));
  } else {
    const dayList = el("ul", { class: "day-list" });
    state.currentEvent.scheduleDays.forEach((day, index) => {
      const past = isPast(`${day.date}T23:59:59`);
      const item = el("li", {
        class: `day-list-item${index === state.selectedDayIndex ? " selected" : ""}${past ? " past" : ""}`,
      }, [day.date || "(no date)"]);
      item.addEventListener("click", () => {
        state.selectedDayIndex = index;
        renderLeftPanel();
        renderMainPanel();
      });
      dayList.append(item);
    });
    dayNavSection.append(dayList);

    const addDayBtn = el("button", { class: "btn btn-secondary" }, ["+ Add day"]);
    addDayBtn.addEventListener("click", () => {
      if (!state.currentEvent) return;
      const date = window.prompt("Date for the new day (YYYY-MM-DD):", "");
      if (!date) return;
      state.currentEvent.scheduleDays.push({ date, announcement: "", rows: [] });
      state.selectedDayIndex = state.currentEvent.scheduleDays.length - 1;
      renderLeftPanel();
      renderMainPanel();
    });
    dayNavSection.append(addDayBtn);
  }

  leftPanelEl.append(dayNavSection);
}

async function selectEvent(id: string): Promise<void> {
  setStatus(`Loading ${id}…`);
  try {
    const file = await getJsonFile<EventData>(`data/events/${id}.json`);
    if (!file) {
      setStatus(`Event ${id} not found.`, true);
      return;
    }
    state.currentEventId = id;
    state.currentEvent = file.data;
    state.currentEventSha = file.sha;
    state.selectedDayIndex = 0;
    state.pendingImportRows = null;
    setStatus("");
  } catch (err) {
    setStatus(`Failed to load ${id}: ${(err as Error).message}`, true);
  }
  renderLeftPanel();
  renderMainPanel();
}

async function newDraftEvent(): Promise<void> {
  const appId = state.currentAppId;
  if (!appId) return;
  const id = window.prompt("New event id (lowercase letters, digits, dashes):", "");
  if (!id) return;
  if (!/^[a-z0-9-]+$/.test(id)) {
    setStatus("Invalid event id: use only lowercase letters, digits, and dashes.", true);
    return;
  }
  const path = `data/events/${id}.json`;
  try {
    const existing = await getFile(path);
    if (existing) {
      setStatus(`Event ${id} already exists.`, true);
      return;
    }
    const newEvent: EventData = {
      id,
      appId,
      status: "draft",
      announcement: "",
      countdownRows: [],
      scheduleDays: [],
    };
    await putJsonFile(path, newEvent, `Create draft event: ${id}`);
    setStatus(`Created draft event ${id}.`);
    await loadEventsForCurrentApp();
    await selectEvent(id);
  } catch (err) {
    setStatus(`Failed to create ${id}: ${(err as Error).message}`, true);
  }
}

async function setActive(): Promise<void> {
  const event = state.currentEvent;
  const appId = state.currentAppId;
  if (!event || !appId) return;
  try {
    event.status = "active";
    const fresh = await getFile(`data/events/${event.id}.json`);
    const newSha = await putJsonFile(
      `data/events/${event.id}.json`,
      event,
      `Set active: ${event.id}`,
      fresh?.sha,
    );
    state.currentEventSha = newSha;

    const appsFile = await getJsonFile<AppsFile>(APPS_JSON_PATH);
    if (appsFile) {
      const app = appsFile.data.apps.find((a) => a.id === appId);
      if (app) {
        app.activeEventId = event.id;
        await putJsonFile(APPS_JSON_PATH, appsFile.data, `Set active: ${event.id}`, appsFile.sha);
      }
    }
    setStatus(`${event.id} is now active.`);
    await loadEventsForCurrentApp();
  } catch (err) {
    setStatus(`Failed to set active: ${(err as Error).message}`, true);
  }
  renderLeftPanel();
  renderMainPanel();
}

function earliestYear(event: EventData): number {
  const times: number[] = [];
  for (const row of event.countdownRows) {
    const t = new Date(row.time).getTime();
    if (!Number.isNaN(t)) times.push(t);
  }
  for (const day of event.scheduleDays) {
    const t = new Date(day.date).getTime();
    if (!Number.isNaN(t)) times.push(t);
  }
  if (times.length === 0) return new Date().getFullYear();
  return new Date(Math.min(...times)).getFullYear();
}

async function closeEvent(): Promise<void> {
  const event = state.currentEvent;
  const appId = state.currentAppId;
  if (!event || !appId) return;
  if (!window.confirm(`Close event ${event.id}? This moves it to the archive.`)) return;

  try {
    event.status = "ended";
    const year = earliestYear(event);
    const archivePath = `data/archive/${year}/${event.id}.json`;
    await putJsonFile(archivePath, event, `Close event: ${event.id}`);

    const currentFile = await getFile(`data/events/${event.id}.json`);
    if (currentFile) {
      await deleteFile(`data/events/${event.id}.json`, `Close event: ${event.id}`, currentFile.sha);
    }

    const appsFile = await getJsonFile<AppsFile>(APPS_JSON_PATH);
    if (appsFile) {
      const app = appsFile.data.apps.find((a) => a.id === appId);
      if (app && app.activeEventId === event.id) {
        app.activeEventId = null;
        await putJsonFile(APPS_JSON_PATH, appsFile.data, `Close event: ${event.id}`, appsFile.sha);
      }
    }

    setStatus(`Closed event ${event.id} (archived under ${year}).`);
    state.currentEventId = null;
    state.currentEvent = null;
    state.currentEventSha = null;
    await loadEventsForCurrentApp();
  } catch (err) {
    setStatus(`Failed to close event: ${(err as Error).message}`, true);
  }
  renderLeftPanel();
  renderMainPanel();
}

async function saveEvent(): Promise<void> {
  const event = state.currentEvent;
  if (!event) return;
  try {
    const fresh = await getFile(`data/events/${event.id}.json`);
    const day = currentDay();
    const message = `Update ${event.id}: ${day?.date ?? new Date().toISOString().slice(0, 10)}`;
    const newSha = await putJsonFile(
      `data/events/${event.id}.json`,
      event,
      message,
      fresh?.sha,
    );
    state.currentEventSha = newSha;
    setStatus(`Saved ${event.id}.`);
  } catch (err) {
    setStatus(`Failed to save: ${(err as Error).message}`, true);
  }
}

function renderMainPanel(): void {
  clear(mainPanelEl);

  if (!isSignedIn()) {
    mainPanelEl.append(el("p", { class: "muted" }, ["Sign in with GitHub to edit event data."]));
    return;
  }

  const event = state.currentEvent;
  if (!event) {
    mainPanelEl.append(el("p", { class: "muted" }, ["Select or create an event to begin editing."]));
    return;
  }

  const actions = el("div", { class: "actions-row" });
  const setActiveBtn = el("button", { class: "btn btn-primary" }, ["Set as active"]);
  setActiveBtn.addEventListener("click", () => void setActive());
  const closeBtn = el("button", { class: "btn btn-danger" }, ["Close event"]);
  closeBtn.addEventListener("click", () => void closeEvent());
  const saveBtn = el("button", { class: "btn btn-primary" }, ["Save"]);
  saveBtn.addEventListener("click", () => void saveEvent());
  actions.append(setActiveBtn, closeBtn, saveBtn);

  const eventHeader = el("div", { class: "event-header" }, [
    el("h2", {}, [`${event.id} `, el("span", { class: `event-status-badge status-${event.status}` }, [event.status])]),
  ]);

  const announcementField = el("label", { class: "field" }, [
    "Countdown-screen announcement:",
    (() => {
      const input = el("textarea", { class: "announcement-input", rows: "2" }, [event.announcement]);
      input.addEventListener("input", () => {
        event.announcement = (input as HTMLTextAreaElement).value;
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
  section.append(el("h3", {}, ["Countdown rows"]));

  const table = el("div", { class: "rows-table" });
  event.countdownRows.forEach((row, index) => {
    const past = isPast(row.time);
    const rowEl = el("div", { class: `row-editor${past ? " past" : ""}` });

    const titleInput = el("textarea", { class: "row-input", rows: "2" }, [row.title]);
    titleInput.addEventListener("input", () => {
      row.title = (titleInput as HTMLTextAreaElement).value;
    });

    const timeInput = el("input", { class: "row-input", type: "text", value: row.time, placeholder: "2026-07-10T13:00:00+09:00" });
    timeInput.addEventListener("input", () => {
      row.time = (timeInput as HTMLInputElement).value;
    });

    const removeBtn = el("button", { class: "btn btn-secondary btn-small" }, ["Remove"]);
    removeBtn.addEventListener("click", () => {
      event.countdownRows.splice(index, 1);
      renderMainPanel();
    });

    rowEl.append(titleInput, timeInput, removeBtn);
    table.append(rowEl);
  });
  section.append(table);

  const addBtn = el("button", { class: "btn btn-secondary" }, ["+ Add countdown row"]);
  addBtn.addEventListener("click", () => {
    event.countdownRows.push({ title: "", time: "" });
    renderMainPanel();
  });
  section.append(addBtn);

  return section;
}

function renderDayEditor(): HTMLElement {
  const section = el("div", { class: "day-editor-section" });
  const day = currentDay();

  if (!day) {
    section.append(el("p", { class: "muted" }, ["No day selected. Use \"+ Add day\" on the left."]));
    return section;
  }

  section.append(el("h3", {}, [`Schedule for ${day.date}`]));

  const dateInput = el("input", { class: "row-input", type: "text", value: day.date });
  dateInput.addEventListener("input", () => {
    day.date = (dateInput as HTMLInputElement).value;
  });
  section.append(el("label", { class: "field" }, ["Date: ", dateInput]));

  const dayAnnouncementInput = el("textarea", { class: "announcement-input", rows: "2" }, [day.announcement]);
  dayAnnouncementInput.addEventListener("input", () => {
    day.announcement = (dayAnnouncementInput as HTMLTextAreaElement).value;
  });
  section.append(el("label", { class: "field" }, ["Day announcement: ", dayAnnouncementInput]));

  const table = el("div", { class: "rows-table scrollable" });
  day.rows.forEach((row, index) => {
    const rowEl = el("div", { class: "row-editor" });

    const aInput = el("textarea", { class: "row-input", rows: "1" }, [row.A]);
    aInput.addEventListener("input", () => {
      row.A = (aInput as HTMLTextAreaElement).value;
    });

    const bInput = el("textarea", { class: "row-input", rows: "1" }, [row.B]);
    bInput.addEventListener("input", () => {
      row.B = (bInput as HTMLTextAreaElement).value;
    });

    const timeInput = el("input", {
      class: "row-input row-input-time",
      type: "text",
      value: row.time ?? "",
      placeholder: "time (optional, e.g. 2026-07-10T13:00:00+09:00)",
      title: "Optional: set this so the display can gray this row out once it's passed and highlight it while it's next up.",
    });
    timeInput.addEventListener("input", () => {
      const value = (timeInput as HTMLInputElement).value.trim();
      if (value) {
        row.time = value;
      } else {
        delete row.time;
      }
    });

    const removeBtn = el("button", { class: "btn btn-secondary btn-small" }, ["Remove"]);
    removeBtn.addEventListener("click", () => {
      day.rows.splice(index, 1);
      renderMainPanel();
    });

    rowEl.append(aInput, bInput, timeInput, removeBtn);
    table.append(rowEl);
  });
  section.append(table);

  const addRowBtn = el("button", { class: "btn btn-secondary" }, ["+ Add row"]);
  addRowBtn.addEventListener("click", () => {
    day.rows.push({ A: "", B: "" });
    renderMainPanel();
  });
  section.append(addRowBtn);

  return section;
}

function renderImportSection(): HTMLElement {
  const section = el("div", { class: "import-section" });
  section.append(el("h3", {}, ["Import from Excel (.xlsx)"]));

  const fileInput = el("input", { type: "file", accept: ".xlsx" });
  fileInput.addEventListener("change", async () => {
    const input = fileInput as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      state.pendingImportRows = await parseXlsxToRows(file);
      renderMainPanel();
    } catch (err) {
      setStatus(`Failed to parse ${file.name}: ${(err as Error).message}`, true);
    }
  });
  section.append(fileInput);

  if (state.pendingImportRows) {
    section.append(el("p", {}, [`Parsed ${state.pendingImportRows.length} row(s). Review before applying:`]));
    const preview = el("div", { class: "rows-table scrollable" });
    for (const row of state.pendingImportRows) {
      preview.append(
        el("div", { class: "row-editor readonly" }, [
          el("span", { class: "row-input" }, [row.A]),
          el("span", { class: "row-input" }, [row.B]),
        ]),
      );
    }
    section.append(preview);

    const applyBtn = el("button", { class: "btn btn-primary" }, ["Apply to current day"]);
    applyBtn.addEventListener("click", () => {
      const day = currentDay();
      const rows: ScheduleRow[] = state.pendingImportRows ?? [];
      if (!day) {
        setStatus("Select or add a day before applying the import.", true);
        return;
      }
      day.rows = rows;
      state.pendingImportRows = null;
      setStatus("Import applied. Review the table, then click Save to publish.");
      renderMainPanel();
    });

    const cancelBtn = el("button", { class: "btn btn-secondary" }, ["Cancel import"]);
    cancelBtn.addEventListener("click", () => {
      state.pendingImportRows = null;
      renderMainPanel();
    });

    section.append(applyBtn, cancelBtn);
  }

  return section;
}
