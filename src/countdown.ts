import type { EventData } from "./types";
import { setAnnouncementText } from "./marquee";

export interface CountdownController {
  setEventData(data: EventData): void;
}

interface ParsedRow {
  title: string;
  time: Date;
}

function colorizeKeywords(text: string): string {
  return text
    .replace(/JSB1000/g, '<span style="color:#CD5C5C;">JSB1000</span>')
    .replace(/ST1000/g, '<span style="color:#4682B4;">ST1000</span>');
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

export function initCountdown(getNow: () => Date): CountdownController {
  const titleElem = document.getElementById("title") as HTMLElement;
  const countdownElem = document.getElementById("countdown") as HTMLElement;
  const announcementElem = document.getElementById("announcement") as HTMLElement;
  const listElem = document.getElementById("list") as HTMLElement;

  const soundAto = document.getElementById("sound-ato") as HTMLAudioElement;
  const sound20 = document.getElementById("sound-20") as HTMLAudioElement;
  const sound10 = document.getElementById("sound-10") as HTMLAudioElement;
  const sound5 = document.getElementById("sound-5") as HTMLAudioElement;
  const soundFun = document.getElementById("sound-fun") as HTMLAudioElement;

  let parsedSchedule: ParsedRow[] = [];
  let currentIndex = 0;
  let countdownInterval: number | undefined;
  // These flags intentionally never reset once tripped, matching the
  // original single-page-session behaviour of playing each cue at most
  // once per page load.
  let played5 = false;
  let played10 = false;
  let played20 = false;

  function updateScheduleList(): void {
    const now = getNow();
    listElem.innerHTML = "";
    const upcoming = parsedSchedule.slice(currentIndex + 1);
    const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    let tomorrowInserted = false;

    upcoming.forEach((item, position) => {
      const itemKey = `${item.time.getFullYear()}-${item.time.getMonth()}-${item.time.getDate()}`;
      if (itemKey !== todayKey && !tomorrowInserted) {
        const sep = document.createElement("li");
        sep.innerHTML =
          '<div style="text-align:center; font-size: clamp(24px, 2.3vw, 36px); font-weight: bold; color: #000;">---------------------<br>明日のスケジュール</div>';
        listElem.appendChild(sep);
        tomorrowInserted = true;
      }
      const li = document.createElement("li");
      // The item currently counting down is shown separately in #main;
      // the first entry here is the one coming up right after it.
      if (position === 0) li.classList.add("row-next");
      li.innerHTML =
        `<div class="title"><span class="bullet">▶</span>${colorizeKeywords(item.title).replace(/\n/g, "<br>")}</div>` +
        `<div class="time">${String(item.time.getHours()).padStart(2, "0")}:${String(item.time.getMinutes()).padStart(2, "0")}:${String(item.time.getSeconds()).padStart(2, "0")}</div>`;
      listElem.appendChild(li);
    });
  }

  function startNextCountdown(): void {
    const now = getNow();
    while (currentIndex < parsedSchedule.length && parsedSchedule[currentIndex].time <= now) {
      currentIndex++;
    }

    if (countdownInterval !== undefined) {
      window.clearInterval(countdownInterval);
    }

    if (currentIndex >= parsedSchedule.length) {
      titleElem.innerHTML = "終了しました";
      countdownElem.textContent = "--:--:--.---";
      return;
    }

    const { title, time } = parsedSchedule[currentIndex];
    titleElem.innerHTML = `${colorizeKeywords(title).replace(/\n/g, "<br>")}<br><span class="countdown-time">${time
      .toTimeString()
      .slice(0, 8)}まで</span>`;

    countdownInterval = window.setInterval(() => {
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
        const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
        const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
        const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
        const ms = String(diff % 1000).padStart(3, "0");
        countdownElem.innerHTML = `${h}:${m}:${s}<span class="ms">.${ms}</span>`;
      }
    }, 50);
  }

  return {
    setEventData(data: EventData): void {
      setAnnouncementText(
        announcementElem,
        `<span style="color: blue;">お知らせ：</span>`,
        data.announcement ?? "",
      );

      const newSchedule = data.countdownRows
        .map((row) => ({ title: row.title, time: new Date(row.time) }))
        .filter((item) => !Number.isNaN(item.time.getTime()))
        .sort((a, b) => a.time.getTime() - b.time.getTime());

      if (newSchedule.length > 0) {
        parsedSchedule = newSchedule;
        updateScheduleList();
        startNextCountdown();
      }
    },
  };
}
