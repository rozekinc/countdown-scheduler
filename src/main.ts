import "./styles.css";
import { loadApps, resolveActiveApp, createEventDataSource, watchSelectedApp } from "./dataClient";
import { applyTheme } from "./theme";
import { initCountdown } from "./countdown";
import { initSchedule } from "./schedule";
import type { App, EventData } from "./types";

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

function setupToggle(): void {
  const toggleBtn = document.getElementById("toggle-btn");
  const cdMain = document.getElementById("main") as HTMLElement;
  const cdList = document.getElementById("schedule-list") as HTMLElement;
  const scheduleScreen = document.getElementById("schedule-screen") as HTMLElement;
  const timeContainer = document.getElementById("time-container") as HTMLElement;

  let isScheduleMode = false;

  toggleBtn?.addEventListener("click", () => {
    isScheduleMode = !isScheduleMode;

    if (isScheduleMode) {
      cdMain.style.display = "none";
      cdList.style.display = "none";
      scheduleScreen.style.display = "block";
      timeContainer.style.left = "82%";
    } else {
      cdMain.style.display = "block";
      cdList.style.display = "block";
      scheduleScreen.style.display = "none";
      timeContainer.style.left = "58%";
    }
    // Background tint is driven by CSS (body.schedule-mode), derived from
    // the active app's theme -- not a hardcoded color -- so switching
    // screens never clobbers the current app's theming.
    document.body.classList.toggle("schedule-mode", isScheduleMode);
  });
}

async function main(): Promise<void> {
  const currentTimeElem = document.getElementById("current-time") as HTMLElement;

  const appsData = await loadApps();
  const countdownController = initCountdown(getNow);
  const scheduleController = initSchedule(getNow);

  // Holds whichever app's data source is currently feeding the two
  // controllers above. Swapped out (never run concurrently) whenever the
  // admin changes which app is live -- see watchSelectedApp below.
  let activeDataSource: ReturnType<typeof createEventDataSource> | null = null;

  function runApp(app: App): void {
    activeDataSource?.stop();
    applyTheme(app);

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
  runApp(initialApp);

  // On a screen pinned via ?app=, this is a no-op -- see isPinnedByUrl.
  // Otherwise, whenever the admin swaps which app is live, this screen
  // follows without needing a reload.
  watchSelectedApp(appsData, runApp);

  await fetchAccurateTime();

  setupToggle();

  const fullscreenBtn = document.getElementById("fullscreen-btn");
  fullscreenBtn?.addEventListener("click", enterFullscreen);

  function tick(): void {
    currentTimeElem.textContent = getNow().toTimeString().slice(0, 8);
    window.setTimeout(tick, 1000 - (Date.now() % 1000));
  }
  tick();
}

void main();
