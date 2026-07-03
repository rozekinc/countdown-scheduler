---
name: edit-a-day
description: Use when the user asks to change, update, add, or fix the schedule items or announcement for a specific day of an existing event.
---

# Edit a day's schedule

Update one `scheduleDays` entry (matched by its `date`) inside an existing event
file — its `items` list and/or its per-day `announcement`.

## Preconditions

- Get from the user: which event, which date, and the new items and/or
  announcement text (in the order they should appear).

## Read first to resolve ids

- `data/events/` — list the directory to find the event file if the user gave a
  name rather than an exact id.
- `data/events/<event-id>.json` — read it to locate the `scheduleDays` entry
  whose `date` matches. If no entry for that date exists yet, you will add one.
- `src/types.ts` — the `ScheduleDay` / `ScheduleItem` schema. Read only; do not
  edit.

## Edit

In `data/events/<event-id>.json`, edit the `scheduleDays` array:

- Find the entry with the matching `date` and update its `items` and/or
  `announcement` in place, OR add a new
  `{ "date", "announcement"?, "items": [...] }` entry if that date did not
  exist.
- Change nothing else in the file.

### Day and item shape

- `date`: the ISO date (`YYYY-MM-DD`). The display derives the today / tomorrow
  / day-after label from it automatically.
- `announcement` (optional): a per-day note under that day's column. Omit the
  field if there is none.
- `items`: an ordered array of `{ "title", "detail" }`. `title` is the item
  name; `detail` is one free-text line such as a time range (`"10:30~"`,
  `"10:00~18:00"`) or a location. Items render top-to-bottom in array order, so
  order them the way they should appear.

Example day:

```json
{
  "date": "2026-06-30",
  "items": [
    { "title": "選手受付", "detail": "7:30~" },
    { "title": "アームバンド受取", "detail": "10:00~18:00" }
  ]
}
```

See `data/events/race-weekend.json` for the shape.

## Verify

- Confirm the file still parses as valid JSON.
- Confirm only the intended `scheduleDays` entry changed.
- Confirm the entry's `date` is `YYYY-MM-DD` and each item has a `title` and a
  `detail`.
- Tell the user which date you edited.

## Publish

Follow the `publish-changes` skill to commit and push. Stage ONLY `data/`.

## Boundaries

- Edit files only under `data/`. Never touch `src/`, `admin-src/`, `.github/`,
  or built assets.
- No MCP tools — edit the file directly.
