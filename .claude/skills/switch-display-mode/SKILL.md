---
name: switch-display-mode
description: Use when the user asks to change the display's readability or color mode for room lighting (e.g. high-contrast for daylight, dark for glare) — not which app or event is shown.
---

# Switch the display's readability mode

Set the color/readability preset for every screen by setting `displayModeId` in
`data/apps.json`. This is a property of the room's lighting, not of app branding
or of which event is shown. It applies to every screen — including screens
pinned with an `?app=` link.

## Preconditions

- Get from the user: which readability mode they want.

## Read first to resolve ids

- `src/displayModes.ts` — the valid mode ids. Currently:
  - `standard` — each app's own theme colors, unmodified (the default).
  - `daylight-contrast` — daylight high-contrast.
  - `dark-glare` — dark / glare reduction.
  Read only; do not edit. If this file's list has changed, use the ids it lists.
- `data/apps.json` — the current `displayModeId`.

## Edit

In `data/apps.json`, set `displayModeId` to the chosen mode id. For `standard`
you may set it to `"standard"` or clear it to `null` — both mean the default,
unmodified per-app colors. Change nothing else.

## Verify

- Confirm `data/apps.json` still parses as valid JSON.
- Confirm `displayModeId` matches a valid id from `src/displayModes.ts` (or is
  `null`/`"standard"` for standard).
- Tell the user every screen picks this up automatically within about 15
  seconds, no reload needed, including `?app=`-pinned screens.

## Publish

Follow the `publish-changes` skill to commit and push. Stage ONLY `data/`.

## Boundaries

- Edit files only under `data/`. Never touch `src/`, `admin-src/`, `.github/`,
  or built assets.
- No MCP tools — edit the file directly.
