import type { DisplayConfig, EventData, RedFlagState } from "./types";
import { setAnnouncementText } from "./marquee";
import { setScrollingList } from "./verticalScroll";
import { colorizeKeywords } from "./keywords";
import { resolveLabel, relativeDayLabel } from "./labels";
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
  // The title now lives in its own singleton host (#li-countdownTitle), split
  // out of #main so it fits its own bounded height independently of the timer.
  const titleHostElem = document.getElementById("li-countdownTitle") as HTMLElement | null;
  const countdownElem = document.getElementById("countdown") as HTMLElement;
  const announcementElem = document.getElementById("announcement") as HTMLElement;
  const listElem = document.getElementById("list-viewport") as HTMLElement;
  const pinnedElem = document.getElementById("list-next-pinned") as HTMLElement | null;

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

  // Red-flag stoppage state. When active, the main countdown shows the stoppage
  // instead of the normal timer: it counts UP (blue) with no finish time, or
  // DOWN (red) to redFlagFinishMs when one is set; once the finish time passes
  // the display resumes normal operation.
  let redFlagActive = false;
  let redFlagSinceMs = 0;
  let redFlagFinishMs: number | null = null;
  let stoppageInterval: number | undefined;

  // Re-fit the title and the countdown/timer block, each to its OWN bounded
  // host, after the browser has laid out new content -- so a long title shrinks
  // within its box without dragging the timer's size down with it (and vice
  // versa). The two hosts are sized independently by the layout.
  function fitMain(): void {
    window.requestAnimationFrame(() => {
      if (titleHostElem) fitToHeight(titleHostElem);
      fitToHeight(mainElem);
    });
  }

  // --- red-flag stoppage --------------------------------------------------

  function redFlagName(): string {
    return resolveLabel(getApps(), "redFlag");
  }

  // Drive the MAIN countdown as the stoppage timer: DOWN (red) to the finish
  // time, or UP (blue) when none is set. When a set finish time passes, the red
  // flag ends and normal operation resumes ("moves to the next thing").
  function updateRedFlag(): void {
    const now = getNow().getTime();
    if (redFlagFinishMs !== null && now >= redFlagFinishMs) {
      teardownRedFlag(true);
      return;
    }
    const countingDown = redFlagFinishMs !== null;
    const ms = countingDown
      ? Math.max(0, (redFlagFinishMs as number) - now)
      : Math.max(0, now - redFlagSinceMs);
    countdownElem.classList.add("rf-stoppage");
    countdownElem.classList.toggle("rf-countdown", countingDown);
    countdownElem.classList.toggle("rf-countup", !countingDown);
    setCountdownText(
      pad2(Math.floor(ms / 3600000)),
      pad2(Math.floor((ms % 3600000) / 60000)),
      pad2(Math.floor((ms % 60000) / 1000)),
      String(ms % 1000).padStart(3, "0"),
    );
  }

  // The title becomes the RED FLAG banner while a flag is up (editable labels;
  // the up/down colour lives on the countdown timer itself, not on arrows).
  function renderRedFlagTitle(): void {
    const apps = getApps();
    titleElem.innerHTML =
      `<span class="rf-flag-badge">🚩 ${resolveLabel(apps, "redFlag")}</span><br>` +
      `<span class="countdown-time">${resolveLabel(apps, "stoppage")}</span>`;
    fitMain();
  }

  function teardownRedFlag(resume: boolean): void {
    redFlagActive = false;
    redFlagFinishMs = null;
    document.body.classList.remove("red-flag-on");
    countdownElem.classList.remove("rf-stoppage", "rf-countup", "rf-countdown");
    if (stoppageInterval !== undefined) {
      window.clearInterval(stoppageInterval);
      stoppageInterval = undefined;
    }
    // Re-scan to the correct current target for now (an interrupted item whose
    // time has since passed is skipped), then re-render title + list.
    if (resume) startNextCountdown();
    else {
      renderTitle();
      updateScheduleList();
    }
  }

  function applyRedFlag(state: RedFlagState | null | undefined): void {
    const nowMs = getNow().getTime();
    const finishMs = state?.finishTime ? new Date(state.finishTime).getTime() : NaN;
    const hasFinish = !Number.isNaN(finishMs);
    // Auto-resume: a set finish time that has already passed reads as inactive,
    // so a stale still-active config doesn't re-trigger the stoppage.
    const active = !!state?.active && !(hasFinish && finishMs <= nowMs);

    if (!active) {
      if (redFlagActive) teardownRedFlag(true);
      return;
    }

    const sinceMs = state?.since ? new Date(state.since).getTime() : NaN;
    redFlagActive = true;
    redFlagSinceMs = Number.isNaN(sinceMs) ? nowMs : sinceMs;
    redFlagFinishMs = hasFinish ? finishMs : null;

    document.body.classList.add("red-flag-on");
    renderRedFlagTitle();
    updateRedFlag();
    if (stoppageInterval === undefined) {
      stoppageInterval = window.setInterval(updateRedFlag, 100);
    }
    updateScheduleList();
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
    // While a red flag is up the title is the RED FLAG banner, not the item.
    if (redFlagActive) {
      renderRedFlagTitle();
      return;
    }
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

  function rowHtml(item: ParsedRow, extraCls: string): string {
    return (
      `<li${extraCls}>` +
      `<div class="title"><span class="bullet">▶</span>${colorizeKeywords(item.title, keywords).replace(/\n/g, "<br>")}</div>` +
      `<div class="time">${hhmmss(item.time)}</div>` +
      `</li>`
    );
  }

  function dayHeaderLi(label: string): string {
    return `<li><div class="list-day-header">---------------------<br>${label}</div></li>`;
  }

  function updateScheduleList(): void {
    const now = getNow();
    const apps = getApps();
    const upcoming = parsedSchedule.slice(currentIndex + 1);

    // The immediately-next item stays PINNED static at the top of the side
    // list; only the items after it scroll. (The item currently counting down
    // is shown separately in #main.) While a red flag is up, a special
    // red-flag line sits at the very top -- the stoppage, standing in line.
    const pinned = upcoming[0];
    if (pinnedElem) {
      let rfLine = "";
      if (redFlagActive) {
        const suffix =
          redFlagFinishMs !== null
            ? `<div class="time">${hhmmss(new Date(redFlagFinishMs))}</div>`
            : "";
        rfLine =
          `<li class="row-redflag">` +
          `<div class="title"><span class="bullet">🚩</span>${redFlagName()}</div>` +
          suffix +
          `</li>`;
      }
      const pinnedRow = pinned ? rowHtml(pinned, ' class="row-next"') : "";
      pinnedElem.innerHTML =
        rfLine || pinnedRow ? `<ul class="list-pinned-ul">${rfLine}${pinnedRow}</ul>` : "";
    }

    // Seed the day key from the pinned item (else the item in #main), so a day
    // header is inserted in the scrolling remainder only when it crosses into a
    // NEW day relative to what's already shown pinned above it.
    let lastDayKey: string | null = pinned
      ? dayKeyOf(pinned.time)
      : currentIndex < parsedSchedule.length
        ? dayKeyOf(parsedSchedule[currentIndex].time)
        : null;

    const first = upcoming[1]; // first scrolling item (upcoming[0] is pinned)
    let html = "";
    let insertedHeader = false;
    upcoming.slice(1).forEach((item) => {
      const dk = dayKeyOf(item.time);
      if (dk !== lastDayKey) {
        lastDayKey = dk;
        insertedHeader = true;
        // Relative-day header (today/tomorrow/day-after); beyond that fall
        // back to the date itself.
        const label = relativeDayLabel(apps, isoOf(item.time), now) ?? shortDateLabel(item.time);
        html += dayHeaderLi(label);
      }
      html += rowHtml(item, "");
    });

    // Loop-seam divider: the scrolling list is two stacked copies looping
    // seamlessly, so the wrap point (last item -> first item) crosses back into
    // the first item's day with no divider. When the list spans >1 day, lead
    // with the first day's header so the copy-2 leading header shows that
    // crossing like every other one. Single-day lists get no header at all.
    if (insertedHeader && first) {
      const label = relativeDayLabel(apps, isoOf(first.time), now) ?? shortDateLabel(first.time);
      html = dayHeaderLi(label) + html;
    }

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
      // The stoppage owns #countdown while a red flag is up -- don't clobber it.
      if (!redFlagActive) setCountdownText("--", "--", "--", "---");
      return;
    }

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

      // The big countdown + side list flatten every day-set's countdown rows
      // into one time-sorted list, so the countdown rolls continuously across
      // days (today's next target, then tomorrow's, …).
      const newSchedule = data.days
        .flatMap((d) => d.countdownRows)
        // "Provisioned" rows (hidden) stay in the data + admin but never drive
        // the countdown -- skip them so they're not a target or a list entry.
        .filter((row) => !row.hidden)
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
      // renderTitle already re-renders the RED FLAG banner in the current
      // language when a flag is up (see its redFlagActive guard).
    },
    setRedFlag(state: RedFlagState | null | undefined): void {
      applyRedFlag(state);
    },
  };
}
