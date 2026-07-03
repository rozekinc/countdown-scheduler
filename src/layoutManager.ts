// Applies a LayoutDoc to the live stage DOM. Singleton items (clock,
// countdown, scheduleList, announcement, scheduleColumns) have their canonical
// markup already in index.html wrapped in a positioned host (`li-<type>`);
// this only moves/sizes/shows them. Dynamic items (text, image) are created
// and destroyed here from the layout data.
//
// Geometry is stage-percent -> cqw/cqh, so items track the stage on any
// screen. The stage element (.aspect-inner, id="stage") is the size container.

import { isSingleton, SINGLETON_TYPES, type LayoutItem } from "./layout";
import { resolveLabel } from "./labels";
import type { AppsData, LabelKey } from "./types";

function stageEl(): HTMLElement {
  return document.getElementById("stage") as HTMLElement;
}

function hostId(item: LayoutItem): string {
  return isSingleton(item.type) ? `li-${item.type}` : `li-${item.id}`;
}

/** Create (or fetch) the host for a dynamic item. Singleton hosts always
 * pre-exist in index.html and are never created here. */
function ensureDynamicHost(item: LayoutItem): HTMLElement {
  const id = hostId(item);
  let host = document.getElementById(id);
  if (!host) {
    host = document.createElement("div");
    host.id = id;
    host.className = "layout-item";
    stageEl().append(host);
  }
  return host;
}

function applyGeometry(host: HTMLElement, item: LayoutItem): void {
  host.style.left = `${item.x}cqw`;
  host.style.top = `${item.y}cqh`;
  host.style.width = `${item.w}cqw`;
  host.style.height = `${item.h}cqh`;
  host.style.zIndex = String(item.z ?? 0);
  host.style.setProperty("--item-scale", String(item.props.fontScale ?? 1));
  host.dataset.screen = item.screen;
}

function renderTextItem(host: HTMLElement, item: LayoutItem, apps: AppsData): void {
  host.classList.add("item-text");
  const p = item.props;
  const value =
    p.source === "literal"
      ? p.text ?? ""
      : resolveLabel(apps, (p.labelKey ?? "currentTime") as LabelKey);
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
  host.style.opacity = String(p.opacity ?? 1);
}

let lastItems: LayoutItem[] = [];
let currentScreen: "countdown" | "schedule" = "countdown";

function visible(item: LayoutItem): boolean {
  if (item.hidden) return false;
  return item.screen === "shared" || item.screen === currentScreen;
}

/** Full apply: reconcile hosts, geometry, content, and visibility against
 * `items`. Cheap enough to call on every live edit (no controller re-init --
 * singleton controllers bind once at startup to the stable canonical DOM). */
export function applyLayout(items: LayoutItem[], apps: AppsData): void {
  lastItems = items;

  // Hide every singleton host first; the loop re-shows the ones present.
  for (const type of SINGLETON_TYPES) {
    const host = document.getElementById(`li-${type}`);
    if (host) host.style.display = "none";
  }

  // Remove dynamic hosts that are no longer in the layout.
  const wantIds = new Set(items.filter((i) => !isSingleton(i.type)).map((i) => hostId(i)));
  stageEl()
    .querySelectorAll<HTMLElement>(".layout-item.item-dynamic")
    .forEach((host) => {
      if (!wantIds.has(host.id)) host.remove();
    });

  for (const item of items) {
    const host = isSingleton(item.type) ? document.getElementById(hostId(item)) : ensureDynamicHost(item);
    if (!host) continue;
    if (!isSingleton(item.type)) host.classList.add("item-dynamic");
    applyGeometry(host, item);
    if (item.type === "text") renderTextItem(host, item, apps);
    else if (item.type === "image") renderImageItem(host, item);
    host.style.display = visible(item) ? "" : "none";
  }
}

/** Flip which screen (countdown vs schedule) is showing; re-applies only
 * visibility, using the last-applied item set. */
export function setScreen(screen: "countdown" | "schedule"): void {
  currentScreen = screen;
  for (const item of lastItems) {
    const host = document.getElementById(hostId(item));
    if (host) host.style.display = visible(item) ? "" : "none";
  }
}

export function getScreen(): "countdown" | "schedule" {
  return currentScreen;
}
