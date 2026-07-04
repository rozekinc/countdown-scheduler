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
  onPage,
  placementFor,
  SINGLETON_TYPES,
  type ItemPage,
  type LayoutItem,
  type Placement,
} from "./layout";
import { resolveLabel } from "./labels";
import type { DisplayConfig, LabelKey } from "./types";

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
      ? p.text ?? ""
      : resolveLabel(config, (p.labelKey ?? "currentTime") as LabelKey);
  host.textContent = value;
  host.style.textAlign = p.align ?? "center";
  host.style.justifyContent =
    p.align === "left" ? "flex-start" : p.align === "right" ? "flex-end" : "center";
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
 * everything for the current page WITHOUT animating (snap). */
export function applyLayout(items: LayoutItem[], config: DisplayConfig): void {
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
      host.dataset.baseOpacity = host.dataset.baseOpacity ?? "1";

      if (item.type === "text") renderTextItem(host, item, config);
      else if (item.type === "image") renderImageItem(host, item);

      // An item is in the DOM (display:"") if it appears on EITHER page; its
      // per-page visibility is handled by opacity so it can animate.
      const anywhere = onPage(item, "countdown") || onPage(item, "schedule");
      host.style.display = item.hidden || !anywhere ? "none" : "";
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
