---
name: close-out-an-event
description: Use when the user asks to close out, end, finish, or retire an event that is over.
---

# Close out a finished event

Mark an event as `ended`. Before doing so, make sure the display is not still
pointed at it, so it isn't left showing a closed event.

## Preconditions

- Get from the user: which event to close out.

## Read first to resolve ids

- `data/events/` — list the directory to find the event file if the user gave a
  name rather than an exact id.
- `data/display.json` — read the top-level `activeEventId` to see whether the
  display currently points at this event.
- `src/types.ts` — the `EventStatus` type (`draft` | `active` | `ended`). Read
  only; do not edit.

## Edit (order matters)

1. FIRST, in `data/display.json`, if `activeEventId` equals the event id, clear
   it (set `activeEventId` to `null`). Do this before changing the event status
   so the display is not left aimed at a closed event.
2. THEN, in `data/events/<event-id>.json`, set `status` to `"ended"`. Leave the
   file in place under `data/events/` and change nothing else.

## Verify

- Confirm both files still parse as valid JSON.
- Confirm `data/display.json`'s `activeEventId` no longer points at the closed
  event.
- Confirm the event's `status` is now `"ended"`.
- Tell the user whether you cleared the active event and that the event is ended.

## Publish

Follow the `publish-changes` skill to commit and push. Stage ONLY `data/`.

## Boundaries

- Edit files only under `data/`. Never touch `src/`, `admin-src/`, `.github/`,
  or built assets.
- No MCP tools — edit the files directly.
