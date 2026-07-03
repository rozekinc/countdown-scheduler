import "./styles.css";
import { loadApps, resolveActiveApp, createEventDataSource, watchDisplaySettings, loadLayout } from "./dataClient";
import { applyTheme, applyAspectRatio } from "./theme";
import { initCountdown, type CountdownController } from "./countdown";
import { initSchedule } from "./schedule";
import { initVersionBadge } from "./versionBadge";
import { resolveLabel, displayLanguage } from "./labels";
import { defaultLayoutForApp, type LayoutItem } from "./layout";
import { applyLayout, setScreen } from "./layoutManager";
import {
  getDisplaySource,
  setDisplaySource,
  readLiveSnapshot,
  writeLiveSnapshot,
  onLiveChange,
  type DisplaySource,
  type LiveSnapshot,
} from "./liveBridge";
import type { App, AppsData, EventData, RedFlagState } from "./types";

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

  let isScheduleMode = false;

  // Items tagged screen="shared" stay put; the toggle swaps which of the
  // countdown-only / schedule-only items are shown (see layoutManager.setScreen).
  toggleBtn?.addEventListener("click", () => {
    isScheduleMode = !isScheduleMode;
    setScreen(isScheduleMode ? "schedule" : "countdown");
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

// On-display operator controls: red flag, marquee start/stop, and the
// data-source toggle. These live on the display itself so an operator at the
// screen can drive it without opening the admin.
function setupOperatorControls(
  source: DisplaySource,
  countdownController: CountdownController,
  getApps: () => AppsData,
): void {
  const rfBtn = document.getElementById("redflag-btn");
  let redFlagOn = !!getApps().redFlag?.active;
  const renderRf = (): void => {
    if (!rfBtn) return;
    rfBtn.textContent = redFlagOn ? "🚩 Red flag ON" : "🚩 Red flag";
    rfBtn.classList.toggle("on", redFlagOn);
  };
  renderRf();
  rfBtn?.addEventListener("click", () => {
    redFlagOn = !redFlagOn;
    const state: RedFlagState = redFlagOn
      ? { active: true, since: new Date().toISOString() }
      : { active: false, since: null };
    countdownController.setRedFlag(state);
    renderRf();
    // Propagate into the live snapshot so a same-browser admin reflects it.
    const snap = readLiveSnapshot();
    if (snap) {
      snap.apps = { ...snap.apps, redFlag: state };
      snap.ts = Date.now();
      writeLiveSnapshot(snap);
    }
  });

  const mqBtn = document.getElementById("marquee-btn");
  let marqueePaused = false;
  const renderMq = (): void => {
    if (mqBtn) mqBtn.textContent = marqueePaused ? "▶ Scroll" : "⏸ Scroll";
  };
  renderMq();
  mqBtn?.addEventListener("click", () => {
    marqueePaused = !marqueePaused;
    document.body.classList.toggle("marquee-paused", marqueePaused);
    renderMq();
  });

  const srcBtn = document.getElementById("source-btn");
  if (srcBtn) {
    srcBtn.textContent = `Source: ${source === "local" ? "Local" : "GitHub"}`;
    srcBtn.addEventListener("click", () => {
      setDisplaySource(source === "local" ? "github" : "local");
      window.location.reload();
    });
  }
}

async function main(): Promise<void> {
  const currentTimeElem = document.getElementById("current-time") as HTMLElement;

  // Data source: "local" reads the admin's real-time localStorage snapshot
  // (same browser, instant); "github" reads the published data from raw
  // (works across machines, ~5-min cache). See src/liveBridge.ts.
  const source = getDisplaySource();
  const localSnap = source === "local" ? readLiveSnapshot() : null;

  const appsData: AppsData = localSnap?.apps ?? (await loadApps());
  let currentAppsData: AppsData = appsData;
  const getApps = (): AppsData => currentAppsData;

  applyChromeLabels(currentAppsData);
  applyTextScale(currentAppsData);

  const countdownController = initCountdown(getNow, getApps);
  const scheduleController = initSchedule(getNow, getApps);
  const updateVersionBadge = initVersionBadge(appsData);

  let activeDataSource: ReturnType<typeof createEventDataSource> | null = null;
  let currentApp: App | null = null;
  let currentModeId: string | null = appsData.displayModeId ?? null;
  let currentLayout: LayoutItem[] = [];

  // Re-place every item from the current layout. Cheap enough to call on any
  // live change (no controller re-init -- singleton controllers stay bound to
  // the stable canonical DOM in index.html). Re-run when labels/language
  // change too, since text items may render an editable label.
  function renderCurrentLayout(): void {
    applyLayout(currentLayout, getApps());
  }

  function applyEvent(data: EventData): void {
    countdownController.setEventData(data);
    scheduleController.setEventData(data);
  }

  // GitHub mode: poll raw for this app's event and feed the controllers.
  function runApp(app: App, displayModeId: string | null): void {
    activeDataSource?.stop();
    currentApp = app;
    currentModeId = displayModeId;
    applyTheme(app, displayModeId);

    // Position everything from the base layout synchronously first (no flash of
    // unplaced items), then refine once the app's saved layout has loaded.
    currentLayout = defaultLayoutForApp(app.id).items;
    renderCurrentLayout();
    void loadLayout(app.id).then((doc) => {
      currentLayout = doc.items;
      renderCurrentLayout();
      countdownController.refresh();
      scheduleController.refresh();
    });

    const dataSource = createEventDataSource(app);
    activeDataSource = dataSource;
    const cached = dataSource.getCurrent();
    if (cached) applyEvent(cached);
    dataSource.onUpdate((data: EventData) => applyEvent(data));
    dataSource.start();
  }

  // Local mode: apply a whole snapshot (apps + events + layout) from the
  // admin. No polling -- the admin pushes changes over the live bridge
  // instantly, so a drag/resize in the editor moves the item here at once.
  function applyLocalSnapshot(snap: LiveSnapshot): void {
    const apps = snap.apps;
    const events = snap.events;
    activeDataSource?.stop();
    activeDataSource = null;
    currentAppsData = apps;
    applyChromeLabels(apps);
    applyTextScale(apps);
    applyAspectRatio(apps.aspectRatioId ?? null);
    const app = resolveActiveApp(apps);
    currentApp = app;
    currentModeId = apps.displayModeId ?? null;
    applyTheme(app, apps.displayModeId ?? null);
    currentLayout =
      snap.layout && snap.layout.appId === app.id
        ? snap.layout.items
        : defaultLayoutForApp(app.id).items;
    renderCurrentLayout();
    const event = events[app.activeEventId];
    if (event) applyEvent(event);
    countdownController.refresh();
    scheduleController.refresh();
    countdownController.setRedFlag(apps.redFlag);
    updateVersionBadge(apps);
  }

  if (source === "local") {
    if (localSnap) {
      applyLocalSnapshot(localSnap);
    } else {
      // No snapshot yet (admin not open / hasn't edited) -- show the last
      // published data statically until the admin pushes over the bridge.
      applyAspectRatio(appsData.aspectRatioId ?? null);
      runApp(resolveActiveApp(appsData), appsData.displayModeId ?? null);
      countdownController.setRedFlag(appsData.redFlag);
    }
    onLiveChange(() => {
      const snap = readLiveSnapshot();
      if (snap) applyLocalSnapshot(snap);
    });
  } else {
    applyAspectRatio(appsData.aspectRatioId ?? null);
    runApp(resolveActiveApp(appsData), appsData.displayModeId ?? null);
    countdownController.setRedFlag(appsData.redFlag);

    watchDisplaySettings(
      appsData,
      (app) => runApp(app, currentModeId),
      (displayModeId) => {
        currentModeId = displayModeId;
        if (currentApp) applyTheme(currentApp, displayModeId);
      },
      (aspectRatioId) => applyAspectRatio(aspectRatioId),
      (data) => {
        updateVersionBadge(data);
        // A publish bumps contentVersion; re-pull this app's layout so a
        // committed layout change appears without a display reload.
        if (currentApp) {
          const appId = currentApp.id;
          void loadLayout(appId).then((doc) => {
            currentLayout = doc.items;
            renderCurrentLayout();
          });
        }
      },
      (data) => {
        currentAppsData = data;
        applyChromeLabels(currentAppsData);
        applyTextScale(currentAppsData);
        renderCurrentLayout();
        countdownController.refresh();
        scheduleController.refresh();
        countdownController.setRedFlag(data.redFlag);
      },
    );
  }

  setupOperatorControls(source, countdownController, () => currentAppsData);

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
