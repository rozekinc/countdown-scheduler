import "./styles.css";
import { loadApps, resolveActiveApp, createEventDataSource, watchDisplaySettings } from "./dataClient";
import { applyTheme, applyAspectRatio } from "./theme";
import { initCountdown } from "./countdown";
import { initSchedule } from "./schedule";
import { initVersionBadge } from "./versionBadge";
import { resolveLabel, displayLanguage } from "./labels";
import type { App, AppsData, EventData } from "./types";

interface FullscreenDocumentElement extends HTMLElement {
  webkitRequestFullscreen?: () => void;
  msRequestFullscreen?: () => void;
}

let serverTimeOffset = 0;

const TIME_RESYNC_INTERVAL_MS = 30 * 60 * 1000;
const TIME_FETCH_ATTEMPTS = 3;
const TIME_FETCH_BACKOFF_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// One shot: fetch the server time and update serverTimeOffset. Throws on
// failure so callers can decide whether to retry or keep the last-known-good
// offset; it never mutates the offset unless it succeeds.
async function fetchServerOffsetOnce(): Promise<void> {
  const localBefore = Date.now();
  const res = await fetch("https://worldtimeapi.org/api/timezone/Asia/Tokyo");
  const localAfter = Date.now();
  const data = (await res.json()) as { datetime: string };
  const serverTime = new Date(data.datetime).getTime();
  if (Number.isNaN(serverTime)) throw new Error("invalid datetime");
  const localMidpoint = (localBefore + localAfter) / 2;
  serverTimeOffset = serverTime - localMidpoint;
}

// Initial sync: retry a few times with a small backoff. If every attempt
// fails we leave serverTimeOffset at 0 (local clock) -- non-fatal, startup
// continues -- and rely on the periodic resync to recover later.
async function fetchAccurateTime(): Promise<void> {
  for (let attempt = 1; attempt <= TIME_FETCH_ATTEMPTS; attempt++) {
    try {
      await fetchServerOffsetOnce();
      return;
    } catch (err) {
      console.error(`時刻取得失敗 (${attempt}/${TIME_FETCH_ATTEMPTS}):`, err);
      if (attempt < TIME_FETCH_ATTEMPTS) await delay(TIME_FETCH_BACKOFF_MS * attempt);
    }
  }
}

// Periodic resync so long-running screens don't drift. On success the offset
// updates; on failure we keep the last-known-good value rather than resetting.
function startTimeResync(): void {
  window.setInterval(() => {
    void fetchServerOffsetOnce().catch((err) => {
      console.error("時刻再同期失敗:", err);
    });
  }, TIME_RESYNC_INTERVAL_MS);
}

function getNow(): Date {
  return new Date(Date.now() + serverTimeOffset);
}

function enterFullscreen(): void {
  const elem = document.documentElement as FullscreenDocumentElement;
  if (elem.requestFullscreen) {
    void elem.requestFullscreen();
  } else if (elem.webkitRequestFullscreen) {
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) {
    elem.msRequestFullscreen();
  }
}

/**
 * Countdown vs. schedule is a local, on-screen toggle -- not data written
 * anywhere. One event, one page; the button just shows/hides which half
 * of the already-loaded DOM is visible right now. No admin round-trip,
 * no commit, no sync across screens (there's one screen, one HDMI cable).
 */
function setupScreenToggle(): void {
  const toggleBtn = document.getElementById("toggle-btn");
  const cdMain = document.getElementById("main") as HTMLElement;
  const cdAnnouncement = document.getElementById("announcement") as HTMLElement;
  const cdList = document.getElementById("schedule-list") as HTMLElement;
  const scheduleScreen = document.getElementById("schedule-screen") as HTMLElement;
  const timeContainer = document.getElementById("time-container") as HTMLElement;

  let isScheduleMode = false;

  toggleBtn?.addEventListener("click", () => {
    isScheduleMode = !isScheduleMode;

    if (isScheduleMode) {
      cdMain.style.display = "none";
      cdAnnouncement.style.display = "none";
      cdList.style.display = "none";
      scheduleScreen.style.display = "block";
      timeContainer.style.left = "82%";
    } else {
      cdMain.style.display = "block";
      cdAnnouncement.style.display = "flex";
      cdList.style.display = "flex";
      scheduleScreen.style.display = "none";
      timeContainer.style.left = "58%";
    }
  });
}

// Populates the static chrome text (current-time label, next-schedule
// heading, toggle button) from the editable labels, and sets the document
// language. Re-run live when apps.json's labels/language change.
function applyChromeLabels(apps: AppsData): void {
  document.documentElement.lang = displayLanguage(apps);
  const timeLabel = document.getElementById("time-label");
  if (timeLabel) timeLabel.textContent = resolveLabel(apps, "currentTime");
  const nextScheduleLabel = document.getElementById("next-schedule-label");
  if (nextScheduleLabel) nextScheduleLabel.textContent = resolveLabel(apps, "nextSchedule");
  const toggleBtn = document.getElementById("toggle-btn");
  if (toggleBtn) toggleBtn.textContent = resolveLabel(apps, "toggle");
}

// Global font-size multiplier exposed as a CSS var the display's font-size
// declarations multiply by (see --text-scale in styles.css). Default 1.
function applyTextScale(apps: AppsData): void {
  const scale = typeof apps.textScale === "number" && apps.textScale > 0 ? apps.textScale : 1;
  document.documentElement.style.setProperty("--text-scale", String(scale));
}

async function main(): Promise<void> {
  const currentTimeElem = document.getElementById("current-time") as HTMLElement;

  const appsData = await loadApps();
  // The latest apps-level presentation settings (labels/language/textScale).
  // Swapped in when apps.json changes so the controllers resolve labels
  // against current values (see onDisplaySettingsChange below).
  let currentAppsData: AppsData = appsData;
  const getApps = (): AppsData => currentAppsData;

  applyChromeLabels(currentAppsData);
  applyTextScale(currentAppsData);

  const countdownController = initCountdown(getNow, getApps);
  const scheduleController = initSchedule(getNow, getApps);

  // Holds whichever app's data source is currently feeding the two
  // controllers above. Swapped out (never run concurrently) whenever the
  // admin changes which app is live -- see watchDisplaySettings below.
  let activeDataSource: ReturnType<typeof createEventDataSource> | null = null;
  let currentApp: App | null = null;
  let currentModeId: string | null = appsData.displayModeId ?? null;

  function runApp(app: App, displayModeId: string | null): void {
    activeDataSource?.stop();
    currentApp = app;
    currentModeId = displayModeId;
    applyTheme(app, displayModeId);

    const dataSource = createEventDataSource(app);
    activeDataSource = dataSource;

    // Hydrate synchronously from the cache so the screen is never blank,
    // then let dataSource.start() replace it with fresh data.
    const cached = dataSource.getCurrent();
    if (cached) {
      countdownController.setEventData(cached);
      scheduleController.setEventData(cached);
    }
    dataSource.onUpdate((data: EventData) => {
      countdownController.setEventData(data);
      scheduleController.setEventData(data);
    });
    dataSource.start();
  }

  const initialApp = resolveActiveApp(appsData);
  applyAspectRatio(appsData.aspectRatioId ?? null);
  runApp(initialApp, appsData.displayModeId ?? null);
  countdownController.setRedFlag(appsData.redFlag);

  // Subtle corner badge showing which content version + code build this
  // screen is running; updateVersionBadge is called from the apps.json
  // poll below so a publish is reflected live without a reload.
  const updateVersionBadge = initVersionBadge(appsData);

  watchDisplaySettings(
    appsData,
    // On a screen pinned via ?app=, this is never called -- see isPinnedByUrl.
    // Otherwise, whenever the admin swaps which app is live, this screen
    // follows without needing a reload. Keeps whatever display mode is
    // currently applied rather than reverting to the page's initial one.
    (app) => runApp(app, currentModeId),
    // Display-mode changes apply on every screen (pinned or not) without
    // touching which app/event is showing -- just re-theme in place.
    (displayModeId) => {
      currentModeId = displayModeId;
      if (currentApp) applyTheme(currentApp, displayModeId);
    },
    // Aspect-ratio changes apply on every screen (pinned or not), same
    // reasoning as display mode -- it's a physical-TV setting, not an
    // app-identity choice.
    (aspectRatioId) => applyAspectRatio(aspectRatioId),
    // Content-version changes (a publish) refresh the corner badge in
    // place, so the screen shows which data it's currently looking at.
    (data) => updateVersionBadge(data),
    // Chrome-level presentation changes (displayLanguage / textScale /
    // labels) re-apply the static chrome, the text scale, and re-render the
    // controllers' label-bearing text in place -- no reload.
    (data) => {
      currentAppsData = data;
      applyChromeLabels(currentAppsData);
      applyTextScale(currentAppsData);
      countdownController.refresh();
      scheduleController.refresh();
      countdownController.setRedFlag(data.redFlag);
    },
  );

  // Re-fit the countdown block when the window/stage size changes (the fit is
  // height-bounded, so a resize can change how much the title needs to shrink).
  let resizeTimer: number | undefined;
  window.addEventListener("resize", () => {
    if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => countdownController.refresh(), 150);
  });

  // Wire up interaction and start the clock IMMEDIATELY -- do NOT block the
  // whole UI on the time sync. worldtimeapi can be slow or unreachable (it
  // retries with backoff), and awaiting it here froze the toggle and clock
  // for several seconds on load. The countdown/clock run on the local clock
  // (offset 0) until the sync lands and the periodic resync corrects drift.
  setupScreenToggle();

  const fullscreenBtn = document.getElementById("fullscreen-btn");
  fullscreenBtn?.addEventListener("click", enterFullscreen);

  function tick(): void {
    currentTimeElem.textContent = getNow().toTimeString().slice(0, 8);
    window.setTimeout(tick, 1000 - (Date.now() % 1000));
  }
  tick();

  void fetchAccurateTime();
  startTimeResync();
}

void main();
