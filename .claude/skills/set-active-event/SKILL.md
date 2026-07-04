---
name: set-active-event
description: Use when the user asks to switch, set, or change which event the display is currently showing / counting down to.
---

# Set the active event

The display shows one event at a time. Which one is chosen by the top-level
`activeEventId` in `data/display.json`.

## Preconditions

- Get from the user: which event should be live.

## Read first to resolve ids

- `data/events/` — list the directory to confirm the target event id exists
  (the filename stem, minus `.json`).
- `data/events/<event-id>.json` — optionally confirm the event's `status` is not
  `ended`; warn the user if they are pointing the display at an ended event.

## Edit

In `data/display.json`, set `activeEventId` to the target event id. Optionally
set that event file's `status` to `"active"`. Change nothing else.

## Verify

- Confirm `data/display.json` still parses as valid JSON.
- Confirm `activeEventId` now equals the event id.
- Tell the user the display will pick up the new event on its next refresh after
  publish.

## Publish

Follow the `publish-changes` skill to commit and push. Stage ONLY `data/`.

## Boundaries

- Edit files only under `data/`. Never touch `src/`, `admin-src/`, `.github/`,
  or built assets.
- No MCP tools — edit the file directly.
