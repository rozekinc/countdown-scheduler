import "./styles.css";
import { loadConfig, createEventDataSource, watchDisplaySettings, loadLayout } from "./dataClient";
import { applyTheme, applyAspectRatio } from "./theme";
import { initCountdown, type CountdownController } from "./countdown";
import { initSchedule } from "./schedule";
import { initVersionBadge } from "./versionBadge";
import { resolveLabel, displayLanguage } from "./labels";
import { defaultLayout, type LayoutItem } from "./layout";
import { applyLayout, setPage } from "./layoutManager";
import {
  getDisplaySource,
  setDisplaySource,
  readLiveSnapshot,
  writeLiveSnapshot,
  onLiveChange,
  type DisplaySource,
  type LiveSnapshot,
} from "./liveBridge";
import type { DisplayConfig, EventData, RedFlagState } from "./types";

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
 * anywhere. The button re-targets each item to its per-page placement; items
 * placed differently on the two pages animate between them (see
 * layoutManager.setPage).
 */
function setupScreenToggle(): void {
  const toggleBtn = document.getElementById("toggle-btn");
  let isScheduleMode = false;
  toggleBtn?.addEventListener("click", () => {
    isScheduleMode = !isScheduleMode;
    setPage(isScheduleMode ? "schedule" : "countdown");
  });
}

// Populates the static chrome text (current-time label, next-schedule
// heading, toggle button) from the editable labels, and sets the document
// language. Re-run live when display.json's labels/language change.
function applyChromeLabels(config: DisplayConfig): void {
  document.documentElement.lang = displayLanguage(config);
  const timeLabel = document.getElementById("time-label");
  if (timeLabel) timeLabel.textContent = resolveLabel(config, "currentTime");
  const nextScheduleLabel = document.getElementById("next-schedule-label");
  if (nextScheduleLabel) nextScheduleLabel.textContent = resolveLabel(config, "nextSchedule");
  const toggleBtn = document.getElementById("toggle-btn");
  if (toggleBtn) toggleBtn.textContent = resolveLabel(config, "toggle");
}

// Global font-size multiplier exposed as a CSS var the display's font-size
// declarations multiply by (see --text-scale in styles.css). Default 1.
function applyTextScale(config: DisplayConfig): void {
  const scale = typeof config.textScale === "number" && config.textScale > 0 ? config.textScale : 1;
  document.documentElement.style.setProperty("--text-scale", String(scale));
}

// On-display operator controls: red flag, marquee start/stop, and the
// data-source toggle. These live on the display itself so an operator at the
// screen can drive it without opening the admin.
function setupOperatorControls(
  source: DisplaySource,
  countdownController: CountdownController,
  getConfig: () => DisplayConfig,
): void {
  const rfBtn = document.getElementById("redflag-btn");
  let redFlagOn = !!getConfig().redFlag?.active;
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
      snap.config = { ...snap.config, redFlag: state };
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

  const config: DisplayConfig = localSnap?.config ?? (await loadConfig());
  let currentConfig: DisplayConfig = config;
  const getConfig = (): DisplayConfig => currentConfig;

  applyChromeLabels(currentConfig);
  applyTextScale(currentConfig);

  const countdownController = initCountdown(getNow, getConfig);
  const scheduleController = initSchedule(getNow, getConfig);
  const updateVersionBadge = initVersionBadge(config);

  let activeDataSource: ReturnType<typeof createEventDataSource> | null = null;
  let currentLayout: LayoutItem[] = [];

  // Re-place every item from the current layout. Cheap enough to call on any
  // live change (no controller re-init -- singleton controllers stay bound to
  // the stable canonical DOM in index.html). Re-run when labels/language
  // change too, since text items may render an editable label.
  function renderCurrentLayout(): void {
    applyLayout(currentLayout, getConfig());
  }

  function applyEvent(data: EventData): void {
    countdownController.setEventData(data);
    scheduleController.setEventData(data);
  }

  // GitHub mode: poll raw for the active event and feed the controllers.
  function runEvent(eventId: string | null): void {
    activeDataSource?.stop();
    activeDataSource = null;
    if (!eventId) return;
    const dataSource = createEventDataSource(eventId);
    activeDataSource = dataSource;
    const cached = dataSource.getCurrent();
    if (cached) applyEvent(cached);
    dataSource.onUpdate((data: EventData) => applyEvent(data));
    dataSource.start();
  }

  // Load the single layout, positioning from the base layout synchronously
  // first (no flash of unplaced items), then refining once the file arrives.
  function loadAndRenderLayout(): void {
    currentLayout = defaultLayout().items;
    renderCurrentLayout();
    void loadLayout().then((doc) => {
      currentLayout = doc.items;
      renderCurrentLayout();
      countdownController.refresh();
      scheduleController.refresh();
    });
  }

  // Local mode: apply a whole snapshot (config + events + layout) from the
  // admin. No polling -- the admin pushes changes over the live bridge
  // instantly, so a drag/resize in the editor moves the item here at once.
  function applyLocalSnapshot(snap: LiveSnapshot): void {
    const cfg = snap.config;
    activeDataSource?.stop();
    activeDataSource = null;
    currentConfig = cfg;
    applyChromeLabels(cfg);
    applyTextScale(cfg);
    applyAspectRatio(cfg.aspectRatioId ?? null);
    applyTheme(cfg.displayModeId ?? null);
    currentLayout = snap.layout?.items ?? defaultLayout().items;
    renderCurrentLayout();
    // Prefer the event being edited (previewEventId) so schedule/countdown
    // edits show live; fall back to the active event.
    const eventId = snap.previewEventId ?? cfg.activeEventId ?? null;
    const event = eventId ? snap.events[eventId] : undefined;
    if (event) applyEvent(event);
    countdownController.refresh();
    scheduleController.refresh();
    countdownController.setRedFlag(cfg.redFlag);
    updateVersionBadge(cfg);
  }

  if (source === "local") {
    if (localSnap) {
      applyLocalSnapshot(localSnap);
    } else {
      // No snapshot yet (admin not open / hasn't edited) -- show the last
      // published data statically until the admin pushes over the bridge.
      applyAspectRatio(config.aspectRatioId ?? null);
      applyTheme(config.displayModeId ?? null);
      loadAndRenderLayout();
      runEvent(config.activeEventId ?? null);
      countdownController.setRedFlag(config.redFlag);
    }
    onLiveChange(() => {
      const snap = readLiveSnapshot();
      if (snap) applyLocalSnapshot(snap);
    });
  } else {
    applyAspectRatio(config.aspectRatioId ?? null);
    applyTheme(config.displayModeId ?? null);
    loadAndRenderLayout();
    runEvent(config.activeEventId ?? null);
    countdownController.setRedFlag(config.redFlag);

    watchDisplaySettings(
      config,
      (eventId) => runEvent(eventId),
      (displayModeId) => applyTheme(displayModeId),
      (aspectRatioId) => applyAspectRatio(aspectRatioId),
      (data) => {
        updateVersionBadge(data);
        // A publish bumps contentVersion; re-pull the layout so a committed
        // layout change appears without a display reload.
        void loadLayout().then((doc) => {
          currentLayout = doc.items;
          renderCurrentLayout();
        });
      },
      (data) => {
        currentConfig = data;
        applyChromeLabels(currentConfig);
        applyTextScale(currentConfig);
        renderCurrentLayout();
        countdownController.refresh();
        scheduleController.refresh();
        countdownController.setRedFlag(data.redFlag);
      },
    );
  }

  setupOperatorControls(source, countdownController, () => currentConfig);

  // Re-fit the countdown block when the window/stage size changes (the fit is
  // height-bounded, so a resize can change how much the title needs to shrink).
  let resizeTimer: number | undefined;
  window.addEventListener("resize", () => {
    if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      renderCurrentLayout();
      countdownController.refresh();
    }, 150);
  });

  // Wire up interaction and start the clock IMMEDIATELY -- do NOT block the
  // whole UI on the time sync. worldtimeapi can be slow or unreachable (it
  // retries with backoff), and awaiting it here froze the toggle and clock
  // for several seconds on load.
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
