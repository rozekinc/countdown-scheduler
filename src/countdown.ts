import type { DisplayConfig, EventData, RedFlagState } from "./types";
import { setAnnouncementText } from "./marquee";
import { setScrollingList } from "./verticalScroll";
import { colorizeKeywords } from "./keywords";
import { resolveLabel, relativeDayLabel, displayLanguage } from "./labels";
import { fitToHeight } from "./fitText";

export interface CountdownController {
  setEventData(data: EventData): void;
  /** Re-apply chrome text (title suffix, finished label, list day headers,
   * announcement prefix) without disturbing the running timer -- called when
   * the display language / labels change live. */
  refresh(): void;
  /** Apply red-flag state: freeze the main countdown + show the count-up
   * stoppage timer + red-flag indicator when active; resume when cleared. */
  setRedFlag(state: RedFlagState | null | undefined): void;
}

interface ParsedRow {
  title: string;
  time: Date;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function hhmmss(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function playSequentialSounds(sounds: HTMLAudioElement[]): void {
  if (sounds.length === 0) return;
  const [first, ...rest] = sounds;
  first.currentTime = 0;
  first
    .play()
    .then(() => {
      first.onended = () => playSequentialSounds(rest);
    })
    .catch(() => {
      /* autoplay may be blocked until the user interacts with the page */
    });
}

export function initCountdown(getNow: () => Date, getApps: () => DisplayConfig): CountdownController {
  const mainElem = document.getElementById("main") as HTMLElement;
  const titleElem = document.getElementById("title") as HTMLElement;
  const countdownElem = document.getElementById("countdown") as HTMLElement;
  const announcementElem = document.getElementById("announcement") as HTMLElement;
  const listElem = document.getElementById("list-viewport") as HTMLElement;
  const redFlagElem = document.getElementById("red-flag") as HTMLElement;
  const redFlagTextElem = document.getElementById("red-flag-text") as HTMLElement;
  const stoppageElem = document.getElementById("stoppage") as HTMLElement;
  const stoppageLabelElem = document.getElementById("stoppage-label") as HTMLElement;
  const stoppageTimerElem = document.getElementById("stoppage-timer") as HTMLElement;

  const soundAto = document.getElementById("sound-ato") as HTMLAudioElement;
  const sound20 = document.getElementById("sound-20") as HTMLAudioElement;
  const sound10 = document.getElementById("sound-10") as HTMLAudioElement;
  const sound5 = document.getElementById("sound-5") as HTMLAudioElement;
  const soundFun = document.getElementById("sound-fun") as HTMLAudioElement;

  // The countdown display is built ONCE as fixed child spans; each 50ms tick
  // only writes their textContent (never innerHTML), so the browser never
  // re-parses HTML 20x/sec -- that re-parse was the source of the flicker.
  const hEl = document.createElement("span");
  const mEl = document.createElement("span");
  const sEl = document.createElement("span");
  const msEl = document.createElement("span");
  msEl.className = "ms";
  countdownElem.textContent = "";
  countdownElem.append(
    hEl,
    document.createTextNode(":"),
    mEl,
    document.createTextNode(":"),
    sEl,
    msEl,
  );

  function setCountdownText(h: string, m: string, s: string, ms: string): void {
    hEl.textContent = h;
    mEl.textContent = m;
    sEl.textContent = s;
    msEl.textContent = `.${ms}`;
  }

  let currentData: EventData | null = null;
  let parsedSchedule: ParsedRow[] = [];
  let keywords: string[] | undefined;
  let currentIndex = 0;
  let countdownInterval: number | undefined;
  // These flags intentionally never reset once tripped, matching the
  // original single-page-session behaviour of playing each cue at most
  // once per page load.
  let played5 = false;
  let played10 = false;
  let played20 = false;

  let redFlagActive = false;
  let redFlagSinceMs = 0;
  let stoppageInterval: number | undefined;

  // Re-fit the title/countdown block to its bounded height after the browser
  // has laid out new content, so a long title shrinks instead of overflowing.
  function fitMain(): void {
    window.requestAnimationFrame(() => fitToHeight(mainElem));
  }

  // Freeze the main countdown at the time remaining when the flag was raised
  // (target - since). Used both when the flag is applied and when schedule
  // data arrives after the flag was already up (async load), so the frozen
  // value is always shown -- never a blank "::".
  function freezeCountdown(): void {
    if (currentIndex >= parsedSchedule.length) {
      setCountdownText("--", "--", "--", "---");
      return;
    }
    const frozen = Math.max(0, parsedSchedule[currentIndex].time.getTime() - redFlagSinceMs);
    setCountdownText(
      pad2(Math.floor(frozen / 3600000)),
      pad2(Math.floor((frozen % 3600000) / 60000)),
      pad2(Math.floor((frozen % 60000) / 1000)),
      String(frozen % 1000).padStart(3, "0"),
    );
  }

  function updateStoppage(): void {
    const elapsed = Math.max(0, getNow().getTime() - redFlagSinceMs);
    stoppageTimerElem.textContent =
      `${pad2(Math.floor(elapsed / 3600000))}:` +
      `${pad2(Math.floor((elapsed % 3600000) / 60000))}:` +
      `${pad2(Math.floor((elapsed % 60000) / 1000))}`;
  }

  function applyRedFlag(state: RedFlagState | null | undefined): void {
    const active = !!state?.active;
    const sinceMs = state?.since ? new Date(state.since).getTime() : NaN;
    redFlagActive = active;
    redFlagSinceMs = Number.isNaN(sinceMs) ? getNow().getTime() : sinceMs;

    const en = displayLanguage(getApps()) === "en";
    redFlagTextElem.textContent = en ? "RED FLAG" : "赤旗";
    stoppageLabelElem.textContent = en ? "STOPPAGE" : "中断時間";

    document.body.classList.toggle("red-flag-on", active);
    redFlagElem.classList.toggle("rf-hidden", !active);
    stoppageElem.classList.toggle("rf-hidden", !active);

    if (active) {
      freezeCountdown();
      updateStoppage();
      if (stoppageInterval === undefined) {
        stoppageInterval = window.setInterval(updateStoppage, 200);
      }
    } else if (stoppageInterval !== undefined) {
      window.clearInterval(stoppageInterval);
      stoppageInterval = undefined;
    }
    fitMain();
  }

  function renderAnnouncement(): void {
    const apps = getApps();
    setAnnouncementText(
      announcementElem,
      `<span class="announcement-label">${resolveLabel(apps, "noticePrefix")}</span>`,
      currentData?.announcement ?? "",
    );
  }

  // The title is rewritten ONLY when the target item changes (or on a live
  // label change) -- never inside the 50ms tick.
  function renderTitle(): void {
    const apps = getApps();
    if (currentIndex >= parsedSchedule.length) {
      titleElem.textContent = resolveLabel(apps, "finished");
      return;
    }
    const { title, time } = parsedSchedule[currentIndex];
    const until = resolveLabel(apps, "until");
    titleElem.innerHTML =
      `${colorizeKeywords(title, keywords).replace(/\n/g, "<br>")}<br>` +
      `<span class="countdown-time">${hhmmss(time)}${until}</span>`;
    fitMain();
  }

  function dayKeyOf(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function isoOf(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function shortDateLabel(d: Date): string {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function updateScheduleList(): void {
    const now = getNow();
    const apps = getApps();
    const upcoming = parsedSchedule.slice(currentIndex + 1);
    // Seed with the day of the item currently counting down (shown in #main),
    // so a header is inserted only when the list crosses into a NEW day.
    let lastDayKey: string | null =
      currentIndex < parsedSchedule.length ? dayKeyOf(parsedSchedule[currentIndex].time) : null;

    let html = "";
    upcoming.forEach((item, position) => {
      const dk = dayKeyOf(item.time);
      if (dk !== lastDayKey) {
        lastDayKey = dk;
        // Relative-day header (today/tomorrow/day-after); beyond that fall
        // back to the date itself.
        const label = relativeDayLabel(apps, isoOf(item.time), now) ?? shortDateLabel(item.time);
        html +=
          `<li><div class="list-day-header">---------------------<br>${label}</div></li>`;
      }
      // The item currently counting down is shown separately in #main;
      // the first entry here is the one coming up right after it.
      const cls = position === 0 ? ' class="row-next"' : "";
      html +=
        `<li${cls}>` +
        `<div class="title"><span class="bullet">▶</span>${colorizeKeywords(item.title, keywords).replace(/\n/g, "<br>")}</div>` +
        `<div class="time">${hhmmss(item.time)}</div>` +
        `</li>`;
    });

    setScrollingList(listElem, html);
  }

  function startNextCountdown(): void {
    const now = getNow();
    while (currentIndex < parsedSchedule.length && parsedSchedule[currentIndex].time <= now) {
      currentIndex++;
    }

    if (countdownInterval !== undefined) {
      window.clearInterval(countdownInterval);
    }

    updateScheduleList();
    renderTitle();

    if (currentIndex >= parsedSchedule.length) {
      setCountdownText("--", "--", "--", "---");
      return;
    }

    // If a red flag is up when fresh schedule data arrives, show the frozen
    // remaining time (the tick below will no-op while the flag is up).
    if (redFlagActive) freezeCountdown();

    const { time } = parsedSchedule[currentIndex];

    countdownInterval = window.setInterval(() => {
      // While a red flag is up, the main countdown FREEZES: no display update,
      // no cue sounds, and no advancing to the next target. The stoppage timer
      // (updated on its own interval) counts up instead.
      if (redFlagActive) return;

      const diff = time.getTime() - getNow().getTime();

      if (!played20 && diff <= 1200000 && diff > 1140000) {
        playSequentialSounds([soundAto, sound20, soundFun]);
        played20 = true;
      }
      if (!played10 && diff <= 600000 && diff > 540000) {
        playSequentialSounds([soundAto, sound10, soundFun]);
        played10 = true;
      }
      if (!played5 && diff <= 300000 && diff > 240000) {
        playSequentialSounds([soundAto, sound5, soundFun]);
        played5 = true;
      }

      if (diff <= 0) {
        window.clearInterval(countdownInterval);
        currentIndex++;
        window.setTimeout(startNextCountdown, 2000);
      } else {
        // textContent-only update -- no HTML re-parse, no flicker.
        setCountdownText(
          pad2(Math.floor(diff / 3600000)),
          pad2(Math.floor((diff % 3600000) / 60000)),
          pad2(Math.floor((diff % 60000) / 1000)),
          String(diff % 1000).padStart(3, "0"),
        );
      }
    }, 50);
  }

  return {
    setEventData(data: EventData): void {
      currentData = data;
      keywords = data.highlightKeywords;

      renderAnnouncement();

      const newSchedule = data.countdownRows
        .map((row) => ({ title: row.title, time: new Date(row.time) }))
        .filter((item) => !Number.isNaN(item.time.getTime()))
        .sort((a, b) => a.time.getTime() - b.time.getTime());

      // Always re-apply and RESCAN from the start. currentIndex persists across
      // calls, so after an edit / reorder / add / remove of countdown rows it
      // would otherwise keep pointing at the old position -- now a different (or
      // nonexistent) target -- making the countdown show the wrong thing.
      // Resetting to 0 lets startNextCountdown re-scan and land on the correct
      // current target every time (and an emptied list correctly shows finished).
      parsedSchedule = newSchedule;
      currentIndex = 0;
      startNextCountdown();
    },
    refresh(): void {
      renderAnnouncement();
      renderTitle();
      updateScheduleList();
      // Re-apply red-flag labels in the (possibly changed) language.
      if (redFlagActive) {
        const en = displayLanguage(getApps()) === "en";
        redFlagTextElem.textContent = en ? "RED FLAG" : "赤旗";
        stoppageLabelElem.textContent = en ? "STOPPAGE" : "中断時間";
      }
    },
    setRedFlag(state: RedFlagState | null | undefined): void {
      applyRedFlag(state);
    },
  };
}
