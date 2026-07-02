import "./styles.css";
import { loadApps, resolveActiveApp, createEventDataSource, watchDisplaySettings } from "./dataClient";
import { applyTheme, applyAspectRatio } from "./theme";
import { initCountdown } from "./countdown";
import { initSchedule } from "./schedule";
import type { App, EventData, ScreenMode } from "./types";

interface FullscreenDocumentElement extends HTMLElement {
  webkitRequestFullscreen?: () => void;
  msRequestFullscreen?: () => void;
}

let serverTimeOffset = 0;

async function fetchAccurateTime(): Promise<void> {
  try {
    const localBefore = Date.now();
    const res = await fetch("https://worldtimeapi.org/api/timezone/Asia/Tokyo");
    const localAfter = Date.now();
    const data = (await res.json()) as { datetime: string };
    const serverTime = new Date(data.datetime).getTime();
    const localMidpoint = (localBefore + localAfter) / 2;
    serverTimeOffset = serverTime - localMidpoint;
  } catch (err) {
    console.error("時刻取得失敗:", err);
  }
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
 * Which screen this app shows -- set once per app.screenMode, not toggled
 * at runtime. Each app is dedicated to one screen (e.g. one app for the
 * countdown, another for the full schedule); switching which app shows on
 * a given display is done from the admin, not a button on the TV itself.
 */
function applyScreenMode(mode: ScreenMode): void {
  const cdMain = document.getElementById("main") as HTMLElement;
  const cdAnnouncement = document.getElementById("announcement") as HTMLElement;
  const cdList = document.getElementById("schedule-list") as HTMLElement;
  const scheduleScreen = document.getElementById("schedule-screen") as HTMLElement;
  const timeContainer = document.getElementById("time-container") as HTMLElement;

  if (mode === "schedule") {
    cdMain.style.display = "none";
    cdAnnouncement.style.display = "none";
    cdList.style.display = "none";
    scheduleScreen.style.display = "block";
    timeContainer.style.left = "82%";
  } else {
    cdMain.style.display = "block";
    cdAnnouncement.style.display = "flex";
    cdList.style.display = "block";
    scheduleScreen.style.display = "none";
    timeContainer.style.left = "58%";
  }
}

async function main(): Promise<void> {
  const currentTimeElem = document.getElementById("current-time") as HTMLElement;

  const appsData = await loadApps();
  const countdownController = initCountdown(getNow);
  const scheduleController = initSchedule(getNow);

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
    applyScreenMode(app.screenMode ?? "countdown");

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
  );

  await fetchAccurateTime();

  const fullscreenBtn = document.getElementById("fullscreen-btn");
  fullscreenBtn?.addEventListener("click", enterFullscreen);

  function tick(): void {
    currentTimeElem.textContent = getNow().toTimeString().slice(0, 8);
    window.setTimeout(tick, 1000 - (Date.now() % 1000));
  }
  tick();
}

void main();
