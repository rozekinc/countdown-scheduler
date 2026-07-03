// The layout model: a per-app list of positioned "items" placed freely on the
// stage. Geometry is in STAGE PERCENT (0-100 of the letterboxed stage's width
// / height), mapped to cqw/cqh so every item stretches with the stage on any
// screen or aspect ratio. Replaces the old fixed header/body/footer grid.
//
// Two kinds of item exist:
//  - SINGLETON items (clock, countdown, scheduleList, announcement,
//    scheduleColumns) are bound to live event data and rendered by the
//    existing controllers. Their canonical DOM lives once in index.html,
//    wrapped in a positioned host (id `li-<type>`); the layout only moves,
//    sizes, shows/hides them. There is at most one of each.
//  - DYNAMIC items (text, image) are pure content with no controller; the
//    layout manager creates/destroys their hosts from this data. Any number
//    of them may exist.
//
// Keep this file identical to admin-src/layout.ts.

export type ItemScreen = "shared" | "countdown" | "schedule";

export type ItemType =
  | "clock"
  | "countdown"
  | "scheduleList"
  | "announcement"
  | "scheduleColumns"
  | "text"
  | "image";

/** Per-type property bags. All optional; renderers fall back to defaults. */
export interface ItemProps {
  /** clock/text/countdown/announcement: multiplies the item's base font size. */
  fontScale?: number;
  /** text: "label" pulls from the editable labels; "literal" uses `text`. */
  source?: "label" | "literal";
  /** text: which label key when source==="label". */
  labelKey?: string;
  /** text: the literal string when source==="literal". */
  text?: string;
  /** text/clock: horizontal alignment inside the box. */
  align?: "left" | "center" | "right";
  /** image: path under media/images/ (e.g. "media/images/ロゴ.png"). */
  assetPath?: string;
  /** image: object-fit. */
  fit?: "contain" | "cover";
  /** image: 0-1 opacity. */
  opacity?: number;
  /** clock: show the "現在時刻" label above the time. */
  showLabel?: boolean;
}

export interface LayoutItem {
  id: string;
  type: ItemType;
  screen: ItemScreen;
  /** Stage-percent geometry (0-100). Top-left origin. */
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  hidden?: boolean;
  props: ItemProps;
}

export interface LayoutDoc {
  appId: string;
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

/** Types the palette can add freely (dynamic, unlimited). Singletons are
 * added/removed by toggling their `hidden` flag, not created ad hoc. */
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

/**
 * The base layout that reproduces today's fixed look, so an app with no saved
 * layout (or a "Reset to base" click) renders exactly as before. Geometry is
 * hand-tuned stage-% approximating the old grid; the operator drags from here.
 */
export function defaultLayoutForApp(appId: string): LayoutDoc {
  return {
    appId,
    items: [
      {
        id: "img-banner",
        type: "image",
        screen: "shared",
        x: 2,
        y: 3,
        w: 24,
        h: 14,
        z: 5,
        props: { assetPath: "media/images/4413.png", fit: "contain", opacity: 1 },
      },
      {
        id: "img-logo",
        type: "image",
        screen: "shared",
        x: 2,
        y: 18,
        w: 14,
        h: 12,
        z: 5,
        props: { assetPath: "media/images/ロゴ.png", fit: "contain", opacity: 1 },
      },
      {
        id: "clock",
        type: "clock",
        screen: "shared",
        x: 62,
        y: 3,
        w: 36,
        h: 18,
        z: 10,
        props: { showLabel: true, align: "right", fontScale: 1 },
      },
      {
        id: "countdown",
        type: "countdown",
        screen: "countdown",
        x: 2,
        y: 30,
        w: 72,
        h: 56,
        z: 10,
        props: { fontScale: 1 },
      },
      {
        id: "scheduleList",
        type: "scheduleList",
        screen: "countdown",
        x: 75,
        y: 30,
        w: 23,
        h: 56,
        z: 10,
        props: { fontScale: 1 },
      },
      {
        id: "scheduleColumns",
        type: "scheduleColumns",
        screen: "schedule",
        x: 2,
        y: 28,
        w: 96,
        h: 58,
        z: 10,
        props: { fontScale: 1 },
      },
      {
        id: "announcement",
        type: "announcement",
        screen: "shared",
        x: 2,
        y: 88,
        w: 96,
        h: 10,
        z: 10,
        props: { fontScale: 1 },
      },
    ],
  };
}
