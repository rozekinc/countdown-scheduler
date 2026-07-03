---
name: edit-the-layout
description: Use when the user asks to move, resize, add, remove, or reposition items on the display (the countdown, clock, logos/images, text, schedule, announcement) — the free-canvas layout. For wording/language/size use set-display-text instead.
---

# Edit the display layout

Each app has a free-canvas **layout**: a list of positioned items placed on the
stage. It lives at `data/layouts/<appId>.json`. Geometry is in **stage-percent**
(0–100 of the stage's width/height), so items scale on any screen or aspect
ratio. The easiest way to edit a layout is the admin editor's **Layout** view
(drag/resize with a live preview); this skill covers editing the JSON directly.

## Read first

- `src/layout.ts` — the `LayoutDoc` / `LayoutItem` shapes and
  `defaultLayoutForApp` (the base layout that reproduces the original look).
  Read only; do not edit.
- `data/apps.json` — to confirm the `appId` you're editing.
- `data/layouts/<appId>.json` — the layout to edit. **If it does not exist**, the
  display is using the built-in base layout; create the file from
  `defaultLayoutForApp` in `src/layout.ts` as the starting point, then edit.

## The item shape

```json
{
  "id": "countdown",
  "type": "countdown",
  "screen": "countdown",
  "x": 2, "y": 30, "w": 72, "h": 56,
  "z": 10,
  "props": { "fontScale": 1 }
}
```

- `x`,`y` = top-left corner, `w`,`h` = size — all in **stage-percent (0–100)**.
- `z` = stacking order (higher is on top; use it for overlaps).
- `screen` = `"shared"` (both screens), `"countdown"`, or `"schedule"`.
- `hidden: true` hides an item without deleting it.
- `type` is one of:
  - **Singletons** (one each, bound to live event data): `clock`, `countdown`,
    `scheduleList`, `announcement`, `scheduleColumns`. Keep their `id` equal to
    the type. Props: `fontScale`; clock also has `showLabel`, `align`.
  - **Dynamic** (any number): `text`, `image`. Give each a unique `id`.
    - `text` props: `source` (`"literal"` → `text`, or `"label"` → `labelKey`),
      `align`, `fontScale`.
    - `image` props: `assetPath` (a path under `media/images/`), `fit`
      (`"contain"`/`"cover"`), `opacity`.

## Common edits

- **Move / resize**: change `x`,`y`,`w`,`h`.
- **Add text**: append a `text` item with a unique `id` and
  `"props": { "source": "literal", "text": "…", "align": "center" }`.
- **Add an image**: append an `image` item pointing `assetPath` at a file that
  already exists in `media/images/`. (Uploading a NEW image is an admin-editor
  action; you can only reference images already committed.)
- **Remove**: delete the item from `items` (or set `hidden: true`).
- **Overlap fix**: give the item that should sit on top a higher `z`.

## Verify

- Confirm `data/layouts/<appId>.json` parses as valid JSON and every item has
  `id`, `type`, `screen`, numeric `x`/`y`/`w`/`h`/`z`, and a `props` object.
- Keep every `x`,`y`,`w`,`h` within 0–100, and `x + w` / `y + h` ≤ 100 so items
  stay on stage.
- For `image` items, confirm `assetPath` names a file that exists in
  `media/images/`.

## Publish

Follow the `publish-changes` skill to commit and push. Stage ONLY `data/`.
Publishing bumps the content version, which is also what tells a running display
to re-pull the layout — so a layout change shows within about 15 seconds.

## Boundaries

- Edit files only under `data/`. Never touch `src/`, `admin-src/`, `.github/`,
  or built assets. Adding a brand-new image binary is done through the admin
  editor, not here.
- No MCP tools — edit the file directly.
