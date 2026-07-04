import "./styles.css";
import { loadConfig, createEventDataSource, watchDisplaySettings, loadLayout } from "./dataClient";
import { applyTheme, applyAspectRatio } from "./theme";
import { initCountdown } from "./countdown";
import { initSchedule } from "./schedule";
import { initVersionBadge } from "./versionBadge";
import { resolveLabel, displayLanguage } from "./labels";
import { defaultLayout, migrateLayout, LAYOUT_VERSION, type LayoutItem, type LayoutDoc } from "./layout";
import { applyLayout, setPage } from "./layoutManager";
import {
  readLiveSnapshot,
  onLiveChange,
  type LiveSnapshot,
} from "./liveBridge";
import type { DisplayConfig, EventData } from "./types";

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

// Populates the static chrome text (current-time label, next-schedule
// heading) from the editable labels, and sets the document language. Re-run
// live when display.json's labels/language change. NOTE: the clock label and
// next-schedule heading can also be split into standalone bilingual text items
// (see the layout); when they are, the built-in labels here are hidden by CSS,
// so writing them is harmless.
function applyChromeLabels(config: DisplayConfig): void {
  document.documentElement.lang = displayLanguage(config);
  const timeLabel = document.getElementById("time-label");
  if (timeLabel) timeLabel.textContent = resolveLabel(config, "currentTime");
  const nextScheduleLabel = document.getElementById("next-schedule-label");
  if (nextScheduleLabel) nextScheduleLabel.textContent = resolveLabel(config, "nextSchedule");
}

// Global font-size multiplier exposed as a CSS var the display's font-size
// declarations multiply by (see --text-scale in styles.css). Default 1.
function applyTextScale(config: DisplayConfig): void {
  const scale = typeof config.textScale === "number" && config.textScale > 0 ? config.textScale : 1;
  document.documentElement.style.setProperty("--text-scale", String(scale));
}

async function main(): Promise<void> {
  const currentTimeElem = document.getElementById("current-time") as HTMLElement;

  // Local-first: the same-domain localStorage snapshot (written by the admin)
  // IS the source of truth. If one exists, the display follows it and it
  // persists across refreshes. A fresh/remote display with no snapshot yet
  // bootstraps from the published GitHub data and polls for updates until an
  // admin on this browser writes a snapshot. See src/liveBridge.ts.
  const localSnap = readLiveSnapshot();

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

  // Which page the display currently shows. The 切替 toggle, red flag, and
  // scroll pause are driven from the ADMIN now (they ride the display config /
  // live snapshot), not from on-display buttons.
  let lastAppliedPage: "countdown" | "schedule" | null = null;
  function applyControls(cfg: DisplayConfig): void {
    document.body.classList.toggle("marquee-paused", !!cfg.scrollPaused);
    document.body.classList.toggle("show-outline", !!cfg.showOutline);
    countdownController.setRedFlag(cfg.redFlag);

    const page = cfg.currentPage === "schedule" ? "schedule" : "countdown";
    const pageChanged = page !== lastAppliedPage;
    lastAppliedPage = page;
    setPage(page);
    if (pageChanged) {
      // After the page-swap transition settles, re-measure so scrollers set up
      // against the now-visible (full-height) hosts. Re-running the layout
      // rebuilds the dynamic `schedule` items' scrollers too (they're placed by
      // the layout manager, not a controller). (This used to hang off the
      // toggle click, before 切替 moved to the admin.)
      window.setTimeout(() => {
        renderCurrentLayout();
        countdownController.refresh();
        scheduleController.refresh();
      }, 560);
    }
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
    // Defensive: a stale/old-format snapshot (e.g. left over from before the
    // single-display redesign) can lack `config`. Ignore it rather than crash;
    // the caller falls back to the GitHub bootstrap.
    if (!cfg) return;
    activeDataSource?.stop();
    activeDataSource = null;
    currentConfig = cfg;
    applyChromeLabels(cfg);
    applyTextScale(cfg);
    applyAspectRatio(cfg.aspectRatioId ?? null);
    applyTheme(cfg.displayModeId ?? null);
    // Prefer the event being edited (previewEventId) so schedule/countdown
    // edits show live; fall back to the active event.
    const eventId = snap.previewEventId ?? cfg.activeEventId ?? null;
    const event = eventId ? snap.events[eventId] : undefined;
    // Migrate a pre-v2 snapshot layout defensively (e.g. one written by an
    // older admin before this browser refreshed it), seeding the converted
    // schedule item from the snapshot's own event so no content is lost.
    let layoutDoc: LayoutDoc =
      snap.layout && Array.isArray(snap.layout.items) ? snap.layout : defaultLayout();
    if ((layoutDoc.version ?? 0) < LAYOUT_VERSION) {
      const entries = event?.scheduleDays.flatMap((d) =>
        d.items.map((i) => ({ title: i.title, detail: i.detail })),
      );
      layoutDoc = migrateLayout(layoutDoc, entries);
    }
    currentLayout = layoutDoc.items;
    renderCurrentLayout();
    if (event) applyEvent(event);
    countdownController.refresh();
    scheduleController.refresh();
    applyControls(cfg);
    updateVersionBadge(cfg);
  }

  // A snapshot only counts as "local" if it actually carries a config; a
  // stale/old-format snapshot is ignored so the display bootstraps from GitHub.
  const hasLocalSnap = !!localSnap?.config;

  // Once a local snapshot is in play, it wins: any same-browser admin edit
  // drives the display, and the GitHub poll below must NOT override it.
  let localActive = hasLocalSnap;

  // Always listen for the snapshot so a GitHub-bootstrapped display switches to
  // local the instant an admin on this browser writes one.
  onLiveChange(() => {
    const snap = readLiveSnapshot();
    if (snap?.config) {
      localActive = true;
      applyLocalSnapshot(snap);
    }
  });

  if (hasLocalSnap && localSnap) {
    applyLocalSnapshot(localSnap);
  } else {
    // No snapshot yet (fresh / remote display) -- bootstrap from published
    // GitHub data and poll for updates until a local snapshot appears.
    applyAspectRatio(config.aspectRatioId ?? null);
    applyTheme(config.displayModeId ?? null);
    loadAndRenderLayout();
    runEvent(config.activeEventId ?? null);
    applyControls(config);

    watchDisplaySettings(
      config,
      (eventId) => {
        if (!localActive) runEvent(eventId);
      },
      (displayModeId) => {
        if (!localActive) applyTheme(displayModeId);
      },
      (aspectRatioId) => {
        if (!localActive) applyAspectRatio(aspectRatioId);
      },
      (data) => {
        if (localActive) return;
        updateVersionBadge(data);
        // A publish bumps contentVersion; re-pull the layout so a committed
        // layout change appears without a display reload.
        void loadLayout().then((doc) => {
          currentLayout = doc.items;
          renderCurrentLayout();
        });
      },
      (data) => {
        if (localActive) return;
        currentConfig = data;
        applyChromeLabels(currentConfig);
        applyTextScale(currentConfig);
        renderCurrentLayout();
        countdownController.refresh();
        scheduleController.refresh();
        applyControls(data);
      },
    );
  }

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

  // Start the clock IMMEDIATELY -- do NOT block the whole UI on the time sync.
  // worldtimeapi can be slow or unreachable (it retries with backoff), and
  // awaiting it here froze the clock for several seconds on load.
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
