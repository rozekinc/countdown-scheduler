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
//  - SINGLETON items (clock, countdown, countdownTitle, scheduleList,
//    announcement, scheduleColumns) are bound to live event data / chrome and
//    rendered by the existing controllers. Their canonical DOM lives once in
//    index.html, wrapped in a positioned host (id `li-<type>`); the layout only
//    moves/sizes/shows them.
//  - DYNAMIC items (text, image, schedule) are pure content; the layout manager
//    creates/destroys their hosts. Any number may exist.
//
// Keep this file identical to admin-src/layout.ts.

export type ItemPage = "countdown" | "schedule";

export type ItemType =
  | "clock"
  | "countdown"
  | "countdownTitle"
  | "scheduleList"
  | "announcement"
  | "scheduleColumns"
  | "text"
  | "schedule"
  | "image";

/** Stage-percent geometry (0-100), top-left origin. */
export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A bilingual string, authored in both languages; the display renders the one
 * matching the active DisplayConfig.displayLanguage. */
export interface I18nText {
  ja: string;
  en: string;
}

/** One row of a multi-instance schedule item's own content. */
export interface ScheduleEntry {
  title: string;
  detail: string;
}

/** Per-type property bags. All optional; renderers fall back to defaults. */
export interface ItemProps {
  fontScale?: number;
  source?: "label" | "literal";
  labelKey?: string;
  text?: string;
  /** Bilingual literal text for a `text` item (preferred over `text` when set).
   * Lets a single item carry both languages and switch with the display. */
  textI18n?: I18nText;
  align?: "left" | "center" | "right";
  /** Custom text color (any CSS color, e.g. "#ff0000"). Overrides the theme
   * default for this item's text. Omitted = use the display-mode color. */
  color?: string;
  /** Custom background color for the item (any CSS color). Omitted = the item's
   * default background (transparent for most, the themed panel for schedules). */
  bgColor?: string;
  assetPath?: string;
  fit?: "contain" | "cover";
  opacity?: number;
  /** Show the clock's built-in "現在時刻" label (default true). */
  showLabel?: boolean;
  /** Show the schedule list's built-in heading (default true). */
  showHeading?: boolean;
  /** Show the announcement bar's built-in "お知らせ：" prefix (default true). */
  showPrefix?: boolean;
  /** A `schedule` item's own heading, in both languages. */
  heading?: I18nText;
  /** A `schedule` item's own content rows (decoupled from event data). */
  entries?: ScheduleEntry[];
  /** Auto-scroll the item's text horizontally (marquee) when it overflows.
   * Applies to announcement + text items. Undefined = per-type default. */
  scrollH?: boolean;
  /** Auto-scroll the item's text vertically when it overflows. Applies to the
   * schedule list, schedule columns, schedule items, and text items.
   * Undefined = default. */
  scrollV?: boolean;
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
  /** Schema version, bumped by migrateLayout(). Absent/old = needs migration. */
  version?: number;
}

/** Current layout schema version (see migrateLayout). */
export const LAYOUT_VERSION = 2;

export const SINGLETON_TYPES: ItemType[] = [
  "clock",
  "countdown",
  "countdownTitle",
  "scheduleList",
  "announcement",
  "scheduleColumns",
];

export function isSingleton(type: ItemType): boolean {
  return SINGLETON_TYPES.includes(type);
}

/** Types the palette can add freely (dynamic, unlimited). */
export const ADDABLE_TYPES: ItemType[] = ["text", "schedule", "image"];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  clock: "Clock",
  countdown: "Countdown",
  countdownTitle: "Countdown title",
  scheduleList: "Next-schedule list",
  announcement: "Announcement",
  scheduleColumns: "Schedule columns",
  text: "Text",
  schedule: "Schedule",
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
 * countdown page only; a schedule item on the schedule page only. The operator
 * drags from here, and can give an item different per-page positions to make it
 * animate on 切替.
 *
 * The four "titles" -- the countdown title, the clock label, the next-schedule
 * heading, and the announcement prefix -- are separate, independently placeable
 * items now: the countdown title is a `countdownTitle` singleton host, and the
 * other three are bilingual `text` items (the built-in labels on the clock /
 * list / announcement are switched off so they don't double up).
 */
export function defaultLayout(): LayoutDoc {
  const both = (p: Placement): { countdown: Placement; schedule: Placement } => ({
    countdown: { ...p },
    schedule: { ...p },
  });
  return {
    version: LAYOUT_VERSION,
    items: [
      { id: "img-banner", type: "image", z: 5, props: { assetPath: "media/images/4413.png", fit: "contain", opacity: 1 }, ...both(P(2, 3, 24, 14)) },
      { id: "img-logo", type: "image", z: 5, props: { assetPath: "media/images/ロゴ.png", fit: "contain", opacity: 1 }, ...both(P(2, 18, 14, 12)) },
      { id: "clock", type: "clock", z: 10, props: { showLabel: false, align: "right", fontScale: 1 }, ...both(P(62, 8, 36, 13)) },
      { id: "clock-label", type: "text", z: 11, props: { source: "literal", textI18n: { ja: "現在時刻", en: "Current Time" }, align: "right", fontScale: 1 }, ...both(P(62, 3, 36, 5)) },
      { id: "announcement", type: "announcement", z: 10, props: { fontScale: 1, showPrefix: false }, ...both(P(16, 88, 82, 10)) },
      { id: "announcement-prefix", type: "text", z: 11, props: { source: "literal", textI18n: { ja: "お知らせ：", en: "Notice: " }, align: "left", fontScale: 1 }, ...both(P(2, 88, 14, 10)) },
      { id: "countdownTitle", type: "countdownTitle", z: 10, props: { fontScale: 1 }, countdown: P(2, 30, 72, 16) },
      { id: "countdown", type: "countdown", z: 10, props: { fontScale: 1 }, countdown: P(2, 46, 72, 40) },
      { id: "scheduleList", type: "scheduleList", z: 10, props: { fontScale: 1, showHeading: false }, countdown: P(75, 37, 23, 49) },
      { id: "next-schedule-heading", type: "text", z: 11, props: { source: "literal", textI18n: { ja: "次のスケジュール", en: "Next Schedule" }, align: "center", fontScale: 1 }, countdown: P(75, 30, 23, 6) },
      { id: "schedule-1", type: "schedule", z: 10, props: { fontScale: 1, heading: { ja: "スケジュール", en: "Schedule" }, entries: [] }, schedule: P(2, 28, 96, 58) },
    ],
  };
}

// --- migration ------------------------------------------------------------

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Split a placement into a leading label strip + the remaining box. */
function splitPlacement(
  base: Placement,
  side: "top" | "left",
  frac: number,
): { label: Placement; rest: Placement } {
  if (side === "top") {
    const lh = r1(base.h * frac);
    return {
      label: { x: base.x, y: base.y, w: base.w, h: lh },
      rest: { x: base.x, y: r1(base.y + lh), w: base.w, h: r1(base.h - lh) },
    };
  }
  const lw = r1(base.w * frac);
  return {
    label: { x: base.x, y: base.y, w: lw, h: base.h },
    rest: { x: r1(base.x + lw), y: base.y, w: r1(base.w - lw), h: base.h },
  };
}

/** Build a bilingual text item that sits in the label strip of `singleton` on
 * every page the singleton appears, and shrink the singleton to the remainder.
 * Returns the new text item (or null if the singleton is on no page). */
function extractLabel(
  singleton: LayoutItem,
  id: string,
  textI18n: I18nText,
  side: "top" | "left",
  frac: number,
  align: "left" | "center" | "right",
): LayoutItem | null {
  const text: LayoutItem = {
    id,
    type: "text",
    z: (singleton.z ?? 10) + 1,
    props: { source: "literal", textI18n, align, fontScale: 1 },
  };
  let any = false;
  for (const page of ["countdown", "schedule"] as const) {
    const base = singleton[page];
    if (!base) continue;
    const { label, rest } = splitPlacement(base, side, frac);
    text[page] = label;
    singleton[page] = rest;
    any = true;
  }
  return any ? text : null;
}

/**
 * Bring an older layout (version < 2, or unversioned) up to the current model:
 *  - split the countdown title into its own `countdownTitle` host (above the
 *    timer), and the clock label / next-schedule heading / announcement prefix
 *    into bilingual `text` items, switching off the singletons' built-in labels;
 *  - convert the legacy `scheduleColumns` singleton into a multi-instance
 *    `schedule` item, seeding its rows from the published event's schedule
 *    (passed in as `scheduleEntries`) so no content is lost.
 * Idempotent: a layout already at the current version is returned unchanged.
 */
export function migrateLayout(doc: LayoutDoc, scheduleEntries?: ScheduleEntry[]): LayoutDoc {
  if ((doc.version ?? 0) >= LAYOUT_VERSION) return doc;

  // Deep-clone the items so the migration never mutates the caller's document.
  const items: LayoutItem[] = doc.items.map((it) => ({
    ...it,
    props: { ...it.props },
    countdown: it.countdown ? { ...it.countdown } : undefined,
    schedule: it.schedule ? { ...it.schedule } : undefined,
  }));
  const byType = (t: ItemType): LayoutItem | undefined => items.find((i) => i.type === t);
  const hasId = (id: string): boolean => items.some((i) => i.id === id);
  const added: LayoutItem[] = [];

  // Countdown title -> its own host above the timer.
  const countdown = byType("countdown");
  if (countdown && !byType("countdownTitle")) {
    const title: LayoutItem = { id: "countdownTitle", type: "countdownTitle", z: countdown.z ?? 10, props: { fontScale: 1 } };
    let any = false;
    for (const page of ["countdown", "schedule"] as const) {
      const base = countdown[page];
      if (!base) continue;
      const { label, rest } = splitPlacement(base, "top", 0.28);
      title[page] = label;
      countdown[page] = rest;
      any = true;
    }
    if (any) added.push(title);
  }

  // Clock label.
  const clock = byType("clock");
  if (clock && clock.props.showLabel !== false && !hasId("clock-label")) {
    const t = extractLabel(clock, "clock-label", { ja: "現在時刻", en: "Current Time" }, "top", 0.3, clock.props.align ?? "right");
    clock.props.showLabel = false;
    if (t) added.push(t);
  }

  // Next-schedule heading.
  const list = byType("scheduleList");
  if (list && list.props.showHeading !== false && !hasId("next-schedule-heading")) {
    const t = extractLabel(list, "next-schedule-heading", { ja: "次のスケジュール", en: "Next Schedule" }, "top", 0.12, "center");
    list.props.showHeading = false;
    if (t) added.push(t);
  }

  // Announcement prefix.
  const ann = byType("announcement");
  if (ann && ann.props.showPrefix !== false && !hasId("announcement-prefix")) {
    const t = extractLabel(ann, "announcement-prefix", { ja: "お知らせ：", en: "Notice: " }, "left", 0.18, "left");
    ann.props.showPrefix = false;
    if (t) added.push(t);
  }

  // Legacy schedule columns -> a multi-instance schedule item with its own rows.
  const out: LayoutItem[] = [];
  for (const it of items) {
    if (it.type === "scheduleColumns") {
      out.push({
        id: hasId("schedule-1") ? `schedule-${it.id}` : "schedule-1",
        type: "schedule",
        z: it.z ?? 10,
        hidden: it.hidden,
        countdown: it.countdown,
        schedule: it.schedule,
        props: {
          ...it.props,
          heading: it.props.heading ?? { ja: "スケジュール", en: "Schedule" },
          entries: it.props.entries ?? scheduleEntries ?? [],
        },
      });
    } else {
      out.push(it);
    }
  }

  return { items: [...out, ...added], version: LAYOUT_VERSION };
}
