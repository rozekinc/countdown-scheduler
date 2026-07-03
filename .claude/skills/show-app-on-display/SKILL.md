---
name: show-app-on-display
description: Use when the user asks to show a specific app (web1/web2/web3) on the display/TV right now, or to change which app is currently live on screen.
---

# Show an app on the display

Choose which *app* is live on the primary display by setting `selectedAppId` in
`data/apps.json`. This is different from `set-app-event` (which event an app
shows) — this picks which app is even on screen.

## Preconditions

- Get from the user: which app to show now.

## Read first to resolve ids

- `data/apps.json` — the `apps[].id` values to confirm the app the user named
  exists, and the current `selectedAppId`.

## Edit

In `data/apps.json`, set `selectedAppId` to the chosen app's `id`. Change
nothing else.

## Verify

- Confirm `data/apps.json` still parses as valid JSON.
- Confirm `selectedAppId` equals the named app's id.
- Tell the user: any screen opened WITHOUT an `?app=` link follows automatically
  within about 15 seconds, no reload needed. A screen opened WITH an `?app=`
  link stays pinned to its own app by design.

## Publish

Follow the `publish-changes` skill to commit and push. Stage ONLY `data/`.

## Boundaries

- Edit files only under `data/`. Never touch `src/`, `admin-src/`, `.github/`,
  or built assets.
- No MCP tools — edit the file directly.
