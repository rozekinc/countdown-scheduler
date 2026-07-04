---
name: edit-the-layout
description: Use when the user asks to move, resize, add, remove, or reposition items on the display (the countdown, clock, logos/images, text, schedule, announcement) — the free-canvas layout, including making an item animate between the two pages. For wording/language/size use set-display-text instead.
---

# Edit the display layout

The display has one free-canvas **layout** at `data/layout.json`: a list of
positioned items. There are two pages — the **countdown** page and the
**schedule** page (toggled by 切替). Each item can be placed on either or both
pages, and each page has its own position; when an item is on both pages with
different positions, it **animates** between them on toggle. Geometry is in
**stage-percent** (0–100 of the stage's width/height), so items scale on any
screen or aspect ratio. The easiest way to edit is the admin's **Layout** view
(drag/resize per page with a live preview); this skill covers the JSON directly.

## Read first

- `src/layout.ts` — the `LayoutDoc` / `LayoutItem` shapes and `defaultLayout`
  (the base layout that reproduces the original look). Read only; do not edit.
- `data/layout.json` — the layout to edit. **If it does not exist**, the display
  is using the built-in base layout; create the file from `defaultLayout` in
  `src/layout.ts` as the starting point, then edit.

## The item shape

```json
{
  "id": "countdown",
  "type": "countdown",
  "z": 10,
  "countdown": { "x": 2, "y": 30, "w": 72, "h": 56 },
  "schedule":  { "x": 20, "y": 5, "w": 40, "h": 15 },
  "props": { "fontScale": 1 }
}
```

- `countdown` / `schedule` are the item's **placements** on each page, each a
  `{ x, y, w, h }` box in **stage-percent (0–100)** (top-left origin).
  - Include **both** to show the item on both pages. If the two boxes differ,
    the item animates between them on 切替.
  - Include **one** to show the item on only that page.
- `z` = stacking order (higher on top; use it for overlaps).
- `hidden: true` hides an item on both pages without deleting it.
- `type` is one of:
  - **Singletons** (one each, bound to live event data): `clock`, `countdown`,
    `scheduleList`, `announcement`, `scheduleColumns`. Keep their `id` equal to
    the type. Props: `fontScale`; clock also has `showLabel`, `align`.
  - **Dynamic** (any number): `text`, `image`. Give each a unique `id`.
    - `text` props: `source` (`"literal"` → `text`, or `"label"` → `labelKey`),
      `align`, `fontScale`.
    - `image` props: `assetPath` (under `media/images/`), `fit`, `opacity`.

## Common edits

- **Move / resize on a page**: change that page's `x`,`y`,`w`,`h`.
- **Make an item animate on 切替**: give it both `countdown` and `schedule`
  placements with different positions.
- **Show on both pages, same spot**: set both placements to identical boxes.
- **Show on one page only**: include just that page's placement; delete the
  other.
- **Add text / image**: append a `text` or `image` item with a unique `id` and
  at least one placement. Image `assetPath` must reference a file already in
  `media/images/` (uploading a new image is an admin-editor action).
- **Remove**: delete the item (or set `hidden: true`).

## Verify

- Confirm `data/layout.json` parses as valid JSON and every item has `id`,
  `type`, numeric `z`, at least one of `countdown`/`schedule` (each with numeric
  `x`/`y`/`w`/`h`), and a `props` object.
- Keep every `x`,`y`,`w`,`h` within 0–100, and `x + w` / `y + h` ≤ 100.
- For `image` items, confirm `assetPath` names a file in `media/images/`.

## Publish

Follow the `publish-changes` skill to commit and push. Stage ONLY `data/`.
Publishing bumps the content version, which also tells a running display to
re-pull the layout — so a change shows within about 15 seconds.

## Boundaries

- Edit files only under `data/`. Never touch `src/`, `admin-src/`, `.github/`,
  or built assets. Adding a brand-new image binary is done through the admin
  editor, not here.
- No MCP tools — edit the file directly.
