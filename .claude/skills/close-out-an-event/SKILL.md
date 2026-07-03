---
name: close-out-an-event
description: Use when the user asks to close out, end, finish, or retire an event that is over.
---

# Close out a finished event

Mark an event as `ended`. Before doing so, make sure no app still points at it,
so no display is left showing a closed event.

## Preconditions

- Get from the user: which event to close out.

## Read first to resolve ids

- `data/events/` — list the directory to find the event file if the user gave a
  name rather than an exact id.
- `data/apps.json` — read the `apps[]` array to find any app whose
  `activeEventId` equals this event's id.
- `src/types.ts` — the `EventStatus` type (`draft` | `active` | `ended`). Read
  only; do not edit.

## Edit (order matters)

1. FIRST, in `data/apps.json`, for every app whose `activeEventId` equals the
   event id, clear that pointer (set `activeEventId` to `""`). Do this before
   changing the event status so no live app is left aimed at a closed event.
2. THEN, in `data/events/<event-id>.json`, set `status` to `"ended"`. Leave the
   file in place under `data/events/` and change nothing else.

## Verify

- Confirm both files still parse as valid JSON.
- Confirm no app in `data/apps.json` still has `activeEventId` pointing at the
  closed event.
- Confirm the event's `status` is now `"ended"`.
- Tell the user which apps you cleared (if any) and that the event is ended.

## Publish

Follow the `publish-changes` skill to commit and push. Stage ONLY `data/`.

## Boundaries

- Edit files only under `data/`. Never touch `src/`, `admin-src/`, `.github/`,
  or built assets.
- No MCP tools — edit the files directly.
