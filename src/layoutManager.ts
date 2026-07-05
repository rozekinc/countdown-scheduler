// Applies the layout to the live stage DOM and animates items between their
// countdown-page and schedule-page placements on 切替.
//
// Singleton items (clock, countdown, scheduleList, announcement,
// scheduleColumns) have their canonical markup already in index.html wrapped
// in a positioned host (`li-<type>`); this only moves/sizes/shows them. Dynamic
// items (text, image) are created and destroyed here from the layout data.
//
// Geometry is stage-percent -> cqw/cqh, so items track the stage on any screen.
// Each host has a CSS transition on left/top/width/height/opacity; switching
// the page re-targets those and the browser animates the move. A .no-anim class
// on #stage suppresses the transition for the very first placement and for
// resizes, so items don't fly in from nothing.

import {
  isSingleton,
  onAnyPage,
  placementFor,
  SINGLETON_TYPES,
  type ItemPage,
  type LayoutItem,
  type Placement,
} from "./layout";
import { resolveLabel, displayLanguage, relativeDayLabel, dateKeyPlus } from "./labels";
import { setScrollingContent } from "./verticalScroll";
import { setAnnouncementText } from "./marquee";
import { colorizeKeywords } from "./keywords";
import type { DaySet, DisplayConfig, EventData, LabelKey } from "./types";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

/** Reflect the item's scroll toggles onto the host as data-scroll-* attributes.
 * The CSS disables the relevant animation when set to "off"; singletons that
 * scroll by default (announcement=horizontal, schedule list/columns=vertical)
 * just omit the attribute (= on). Text items handle scroll in renderTextItem. */
function applyScrollPrefs(host: HTMLElement, item: LayoutItem): void {
  if (item.props.scrollH === false) host.dataset.scrollH = "off";
  else delete host.dataset.scrollH;
  if (item.props.scrollV === false) host.dataset.scrollV = "off";
  else delete host.dataset.scrollV;
}

/** Reflect the singleton "show built-in label" toggles onto the host as
 * data-show-* attributes. The CSS hides the built-in label/heading/prefix when
 * set to "off" (the operator has split them into standalone text items). */
function applyLabelPrefs(host: HTMLElement, item: LayoutItem): void {
  if (item.props.showLabel === false) host.dataset.showLabel = "off";
  else delete host.dataset.showLabel;
  if (item.props.showHeading === false) host.dataset.showHeading = "off";
  else delete host.dataset.showHeading;
  if (item.props.showPrefix === false) host.dataset.showPrefix = "off";
  else delete host.dataset.showPrefix;
}

function stageEl(): HTMLElement {
  return document.getElementById("stage") as HTMLElement;
}

function hostId(item: LayoutItem): string {
  return isSingleton(item.type) ? `li-${item.type}` : `li-${item.id}`;
}

function ensureDynamicHost(item: LayoutItem): HTMLElement {
  const id = hostId(item);
  let host = document.getElementById(id);
  if (!host) {
    host = document.createElement("div");
    host.id = id;
    host.className = "layout-item item-dynamic";
    stageEl().append(host);
  }
  return host;
}

/** Apply a page's geometry (or fade the item out when it's not on that page).
 * Leaves the last geometry in place when fading so the item animates out from
 * where it was, rather than collapsing to a corner. */
function applyPlacement(host: HTMLElement, geom: Placement | undefined): void {
  if (geom) {
    host.style.left = `${geom.x}cqw`;
    host.style.top = `${geom.y}cqh`;
    host.style.width = `${geom.w}cqw`;
    host.style.height = `${geom.h}cqh`;
    host.style.opacity = host.dataset.baseOpacity ?? "1";
    host.style.pointerEvents = "";
  } else {
    host.style.opacity = "0";
    host.style.pointerEvents = "none";
  }
}

function renderTextItem(host: HTMLElement, item: LayoutItem, config: DisplayConfig): void {
  host.classList.add("item-text");
  const p = item.props;
  const value =
    p.source === "literal"
      ? p.textI18n
        ? p.textI18n[displayLanguage(config)]
        : p.text ?? ""
      : resolveLabel(config, (p.labelKey ?? "currentTime") as LabelKey);
  host.style.textAlign = p.align ?? "center";
  host.style.justifyContent =
    p.align === "left" ? "flex-start" : p.align === "right" ? "flex-end" : "center";

  // Optional auto-scroll: vertical (multi-line overflow) or horizontal
  // (single-line marquee). Otherwise plain static text.
  if (p.scrollV) {
    host.classList.add("item-text-scrolls");
    setScrollingContent(host, `<div class="item-text-body">${escapeHtml(value).replace(/\n/g, "<br>")}</div>`);
  } else if (p.scrollH) {
    host.classList.add("item-text-scrolls");
    setAnnouncementText(host, "", escapeHtml(value));
  } else {
    host.classList.remove("item-text-scrolls");
    host.textContent = value;
  }
}

/** A multi-instance schedule item: its own heading + rows (p.entries),
 * decoupled from the event's scheduleDays. The rows vertically auto-scroll when
 * they overflow (unless scrollV === false), reusing the schedule-column look. */
/** Resolve the day-set a date-bound schedule item points at (fixed dayDate, or
 * dayOffset relative to today's real local date), or undefined. */
function resolveBoundDaySet(event: EventData | null, item: LayoutItem, now: Date): DaySet | undefined {
  if (!event || item.props.scheduleSource !== "day") return undefined;
  const key = item.props.dayDate || dateKeyPlus(now, item.props.dayOffset ?? 0);
  return event.days.find((d) => d.date === key);
}

function renderScheduleItem(
  host: HTMLElement,
  item: LayoutItem,
  config: DisplayConfig,
  event: EventData | null,
  now: Date,
): void {
  host.classList.add("item-schedule");
  const p = item.props;
  const bound = resolveBoundDaySet(event, item, now);

  // Rows come from the bound day-set's schedule ("day" mode) or the item's own
  // entries (custom mode). A "day"-mode item with no matching day-set renders
  // empty (the binding is explicit -- don't fall back to entries).
  const rows =
    p.scheduleSource === "day"
      ? bound?.schedule ?? []
      : (p.entries ?? []).map((e) => ({ title: e.title, detail: e.detail }));
  const keywords = event?.highlightKeywords;
  const itemsHtml = rows
    .map(
      (e) =>
        `<div class="schedule-col-item">` +
        `<div class="schedule-item-title">${colorizeKeywords(e.title ?? "", keywords).replace(/\n/g, "<br>")}</div>` +
        `<div class="schedule-item-detail">${e.detail ?? ""}</div>` +
        `</div>`,
    )
    .join("");

  // Heading: the operator's explicit heading, else (in day mode) auto-derive
  // from the bound day's relative-day label / date so "which day" is clear.
  let heading = p.heading ? p.heading[displayLanguage(config)] : "";
  if (!heading && bound) heading = relativeDayLabel(config, bound.date, now) ?? bound.date;

  // Rebuild the fixed shell once, then (re)fill the scrolling items area, so a
  // re-render doesn't tear down the scroller when nothing structural changed.
  let inner = host.querySelector<HTMLElement>(".item-schedule-inner");
  if (!inner) {
    host.innerHTML =
      `<div class="item-schedule-inner">` +
      `<div class="schedule-item-heading"></div>` +
      `<div class="schedule-col-items"></div>` +
      `</div>`;
    inner = host.querySelector<HTMLElement>(".item-schedule-inner");
  }
  const headingEl = host.querySelector<HTMLElement>(".schedule-item-heading");
  const itemsEl = host.querySelector<HTMLElement>(".schedule-col-items");
  if (headingEl) {
    headingEl.textContent = heading;
    headingEl.style.display = heading ? "" : "none";
  }
  if (!itemsEl) return;
  if (p.scrollV !== false) setScrollingContent(itemsEl, itemsHtml);
  else itemsEl.innerHTML = itemsHtml;
}

function renderImageItem(host: HTMLElement, item: LayoutItem): void {
  host.classList.add("item-image");
  const p = item.props;
  let img = host.querySelector("img");
  if (!img) {
    img = document.createElement("img");
    host.append(img);
  }
  if (p.assetPath && img.getAttribute("src") !== p.assetPath) {
    img.setAttribute("src", p.assetPath);
  }
  img.style.objectFit = p.fit ?? "contain";
  host.dataset.baseOpacity = String(p.opacity ?? 1);
}

let lastItems: LayoutItem[] = [];
let currentPage: ItemPage = "countdown";

/** Momentarily disable the CSS transition (e.g. first apply, resize) so a
 * geometry write snaps instead of animating. */
function snap(run: () => void): void {
  const stage = stageEl();
  stage.classList.add("no-anim");
  run();
  // Force layout, then re-enable transitions for subsequent page toggles.
  void stage.offsetWidth;
  stage.classList.remove("no-anim");
}

/** Full apply: reconcile hosts, content, per-item static styling, then place
 * everything for the current page WITHOUT animating (snap). `event` + `now`
 * let date-bound `schedule` items resolve the right day-set. */
export function applyLayout(
  items: LayoutItem[],
  config: DisplayConfig,
  event: EventData | null = null,
  now: Date = new Date(),
): void {
  lastItems = items;

  for (const type of SINGLETON_TYPES) {
    const host = document.getElementById(`li-${type}`);
    if (host) host.style.display = "none";
  }

  const wantIds = new Set(items.filter((i) => !isSingleton(i.type)).map((i) => hostId(i)));
  stageEl()
    .querySelectorAll<HTMLElement>(".layout-item.item-dynamic")
    .forEach((host) => {
      if (!wantIds.has(host.id)) host.remove();
    });

  snap(() => {
    for (const item of items) {
      const host = isSingleton(item.type)
        ? document.getElementById(hostId(item))
        : ensureDynamicHost(item);
      if (!host) continue;

      host.style.zIndex = String(item.z ?? 0);
      host.style.setProperty("--item-scale", String(item.props.fontScale ?? 1));
      // Custom text color (any CSS color) -- the text CSS reads --item-color
      // with the theme color as the fallback, so clearing it restores the theme.
      if (item.props.color) host.style.setProperty("--item-color", item.props.color);
      else host.style.removeProperty("--item-color");
      // Custom background color -- the host paints var(--item-bg); items with
      // their own panel background (schedule) thread it too (see styles.css).
      if (item.props.bgColor) host.style.setProperty("--item-bg", item.props.bgColor);
      else host.style.removeProperty("--item-bg");
      host.dataset.baseOpacity = host.dataset.baseOpacity ?? "1";
      applyScrollPrefs(host, item);
      applyLabelPrefs(host, item);

      if (item.type === "text") renderTextItem(host, item, config);
      else if (item.type === "image") renderImageItem(host, item);
      else if (item.type === "schedule") renderScheduleItem(host, item, config, event, now);

      // An item is in the DOM (display:"") if it appears on ANY page (base or
      // added); its per-page visibility is handled by opacity so it can animate.
      host.style.display = item.hidden || !onAnyPage(item) ? "none" : "";
      applyPlacement(host, item.hidden ? undefined : placementFor(item, currentPage));
    }
  });
}

/** Toggle which page is showing; re-targets each item's geometry so the
 * browser animates the move (unless snapped). */
export function setPage(page: ItemPage): void {
  currentPage = page;
  for (const item of lastItems) {
    const host = document.getElementById(hostId(item));
    if (!host || host.style.display === "none") continue;
    applyPlacement(host, placementFor(item, page));
  }
}

export function getPage(): ItemPage {
  return currentPage;
}
