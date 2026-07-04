// The layout model: one list of positioned "items" placed freely on the stage.
// There are two pages -- the countdown page and the schedule page -- and each
// item can be placed on either or both. Geometry is in STAGE PERCENT (0-100 of
// the letterboxed stage's width/height), mapped to cqw/cqh so every item
// stretches with the stage on any screen or aspect ratio.
//
// An item is shown on a page iff it has a placement for that page. If it has
// BOTH placements and they differ, the item ANIMATES from one to the other when
// the operator toggles (切替) between pages -- that's the whole point of
// per-page placement. Equal placements = it just stays put.
//
// Two kinds of item exist:
//  - SINGLETON items (clock, countdown, scheduleList, announcement,
//    scheduleColumns) are bound to live event data and rendered by the existing
//    controllers. Their canonical DOM lives once in index.html, wrapped in a
//    positioned host (id `li-<type>`); the layout only moves/sizes/shows them.
//  - DYNAMIC items (text, image) are pure content; the layout manager
//    creates/destroys their hosts. Any number may exist.
//
// Keep this file identical to admin-src/layout.ts.

export type ItemPage = "countdown" | "schedule";

export type ItemType =
  | "clock"
  | "countdown"
  | "scheduleList"
  | "announcement"
  | "scheduleColumns"
  | "text"
  | "image";

/** Stage-percent geometry (0-100), top-left origin. */
export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Per-type property bags. All optional; renderers fall back to defaults. */
export interface ItemProps {
  fontScale?: number;
  source?: "label" | "literal";
  labelKey?: string;
  text?: string;
  align?: "left" | "center" | "right";
  assetPath?: string;
  fit?: "contain" | "cover";
  opacity?: number;
  showLabel?: boolean;
}

export interface LayoutItem {
  id: string;
  type: ItemType;
  /** Placement on the countdown page (omit = not shown there). */
  countdown?: Placement;
  /** Placement on the schedule page (omit = not shown there). */
  schedule?: Placement;
  z: number;
  hidden?: boolean;
  props: ItemProps;
}

export interface LayoutDoc {
  items: LayoutItem[];
}

export const SINGLETON_TYPES: ItemType[] = [
  "clock",
  "countdown",
  "scheduleList",
  "announcement",
  "scheduleColumns",
];

export function isSingleton(type: ItemType): boolean {
  return SINGLETON_TYPES.includes(type);
}

/** Types the palette can add freely (dynamic, unlimited). */
export const ADDABLE_TYPES: ItemType[] = ["text", "image"];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  clock: "Clock",
  countdown: "Countdown",
  scheduleList: "Next-schedule list",
  announcement: "Announcement",
  scheduleColumns: "Schedule columns",
  text: "Text",
  image: "Image",
};

/** The placement for a page, or undefined when the item isn't on that page. */
export function placementFor(item: LayoutItem, page: ItemPage): Placement | undefined {
  return page === "countdown" ? item.countdown : item.schedule;
}

/** Whether the item appears on the given page. */
export function onPage(item: LayoutItem, page: ItemPage): boolean {
  return !!placementFor(item, page);
}

const P = (x: number, y: number, w: number, h: number): Placement => ({ x, y, w, h });

/**
 * The base layout that reproduces the original fixed look. Items that used to
 * be "shared" (logos, clock, announcement) are placed identically on BOTH
 * pages (so they stay put, no animation); the countdown block/list are on the
 * countdown page only; the schedule columns on the schedule page only. The
 * operator drags from here, and can give an item different per-page positions
 * to make it animate on 切替.
 */
export function defaultLayout(): LayoutDoc {
  const both = (p: Placement): { countdown: Placement; schedule: Placement } => ({
    countdown: { ...p },
    schedule: { ...p },
  });
  return {
    items: [
      { id: "img-banner", type: "image", z: 5, props: { assetPath: "media/images/4413.png", fit: "contain", opacity: 1 }, ...both(P(2, 3, 24, 14)) },
      { id: "img-logo", type: "image", z: 5, props: { assetPath: "media/images/ロゴ.png", fit: "contain", opacity: 1 }, ...both(P(2, 18, 14, 12)) },
      { id: "clock", type: "clock", z: 10, props: { showLabel: true, align: "right", fontScale: 1 }, ...both(P(62, 3, 36, 18)) },
      { id: "announcement", type: "announcement", z: 10, props: { fontScale: 1 }, ...both(P(2, 88, 96, 10)) },
      { id: "countdown", type: "countdown", z: 10, props: { fontScale: 1 }, countdown: P(2, 30, 72, 56) },
      { id: "scheduleList", type: "scheduleList", z: 10, props: { fontScale: 1 }, countdown: P(75, 30, 23, 56) },
      { id: "scheduleColumns", type: "scheduleColumns", z: 10, props: { fontScale: 1 }, schedule: P(2, 28, 96, 58) },
    ],
  };
}
