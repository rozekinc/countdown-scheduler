---
name: set-app-event
description: Use when the user asks to switch, set, or change which event a particular app (web1/web2/web3) is showing.
---

# Switch which event an app shows

Point an app at a different event by setting its `activeEventId` in
`data/apps.json`. This chooses which *event* an app shows — not which *app* is
live on the display (that is the `show-app-on-display` skill).

## Preconditions

- Get from the user: which app, and which event it should show.

## Read first to resolve ids

- `data/apps.json` — the `apps[].id` values to find the target app entry.
- `data/events/` — list the directory to confirm the target event id exists.
- `data/events/<event-id>.json` — optionally confirm the event's `status` is not
  `ended`; warn the user if they are pointing an app at an ended event.

## Edit

In `data/apps.json`, find the app whose `id` matches and set its `activeEventId`
to the target event id. Change nothing else.

## Verify

- Confirm `data/apps.json` still parses as valid JSON.
- Confirm the chosen app's `activeEventId` now equals the event id.
- Tell the user the change; the app's display will pick up the new event on its
  next refresh after publish.

## Publish

Follow the `publish-changes` skill to commit and push. Stage ONLY `data/`.

## Boundaries

- Edit files only under `data/`. Never touch `src/`, `admin-src/`, `.github/`,
  or built assets.
- No MCP tools — edit the file directly.
