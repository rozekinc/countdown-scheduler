---
name: edit-a-day
description: Use when the user asks to change, update, add, or fix the schedule rows or announcement for a specific day of an existing event.
---

# Edit a day's schedule

Update one `scheduleDays` entry (matched by its `date`) inside an existing event
file, keeping the title/content row pairing intact.

## Preconditions

- Get from the user: which event, which date, and the new rows and/or
  announcement text (in the order they should appear).

## Read first to resolve ids

- `data/events/` — list the directory to find the event file if the user gave a
  name rather than an exact id.
- `data/events/<event-id>.json` — read it to locate the `scheduleDays` entry
  whose `date` matches. If no entry for that date exists yet, you will add one.
- `src/types.ts` — the `ScheduleDay` / `ScheduleRow` schema. Read only; do not
  edit.

## Edit

In `data/events/<event-id>.json`, edit the `scheduleDays` array:

- Find the entry with the matching `date` and update its `rows` and/or
  `announcement` in place, OR add a new `{ "date", "announcement", "rows": [...] }`
  entry if that date did not exist.
- Change nothing else in the file.

### Row pairing (keep it)

Rows are consecutive even/odd title/content pairs:

- Even index = title row: `A` = item title, `B` = short description, `time` =
  the pair's full ISO-8601 time with `+09:00`.
- Odd index = content row: `A` = human time range (e.g. `"13:00 - 13:30"`),
  `B` = location/detail, no `time`.

Preserve this ordering when adding or reordering rows. See
`data/events/sample-event.json` for the shape.

## Verify

- Confirm the file still parses as valid JSON.
- Confirm only the intended `scheduleDays` entry changed.
- Confirm every even-index row that carries a `time` uses full ISO-8601 with
  `+09:00`.
- Tell the user which date you edited.

## Publish

Follow the `publish-changes` skill to commit and push. Stage ONLY `data/`.

## Boundaries

- Edit files only under `data/`. Never touch `src/`, `admin-src/`, `.github/`,
  or built assets.
- No MCP tools — edit the file directly.
