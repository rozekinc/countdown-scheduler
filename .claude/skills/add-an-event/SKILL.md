---
name: add-an-event
description: Use when the user asks to add, create, or set up a new event (with countdown items, an announcement, and a day schedule) — including from a source document like a PDF, image, or spreadsheet of a schedule.
---

# Add an event

Create a new event JSON file under `data/events/`. A new event should start as a
`draft`; it will not appear on the display until it is made the active event
(see the `set-active-event` skill).

## Preconditions

- Get from the user: a desired event `id` (a short slug) and human `name`, the
  announcement text, the countdown items (each a title + the ISO target time),
  and the per-day schedule. If you were handed a document, see "From a source
  document" below — you only need to ask about what the document doesn't state.

## Read first to resolve ids

- `data/events/` — list the directory so you pick an event id (filename stem)
  that is not already taken.
- `src/types.ts` — the `EventData` schema. Read it and match it exactly. Do not
  edit that file; read it only to confirm field names and shapes.

## Edit

Create `data/events/<id>.json` where `<id>` is the filename stem and MUST equal
the `id` field inside the file. Populate every `EventData` field:

- `id`: the filename stem (lowercase letters, digits, dashes).
- `name`: the human-readable event name (e.g. `"Spring Race Weekend"`).
- `status`: `"draft"`.
- `announcement`: the announcement string.
- `countdownRows`: array of `{ "title", "time" }`. `time` is a full ISO-8601
  timestamp with the `+09:00` offset (e.g. `"2026-09-05T13:00:00+09:00"`).
- `scheduleDays`: array of `{ "date", "announcement"?, "items": [...] }`.
- `highlightKeywords` (optional): a `string[]` of terms the display should color.
  Include it only if the user names keywords; omit otherwise.

There is no `appId` — one display, one event at a time.

### Schedule days and items

Each `scheduleDays` entry is one day, keyed by its `date`:

- `date`: the ISO date (`YYYY-MM-DD`).
- `announcement` (optional): a per-day note; omit if none.
- `items`: an ordered array of `{ "title", "detail" }`. `title` is the item name
  (e.g. `"選手受付"`); `detail` is one free-text line such as a time range
  (`"10:30~"`) or a location. Items render top-to-bottom in array order.

See `data/events/race-weekend.json` for a full worked example.

## From a source document (PDF, image, or spreadsheet)

If the user hands you a schedule as a PDF, photo/screenshot, or spreadsheet,
read it and fill the event data directly — do not ask the user to re-type it.

- **Read the document** (Read tool for a PDF/image; for `.xlsx` the browser
  admin's importer already produces the right shape — see
  `admin-src/excelImport.ts` for the exact mapping if you need it).
- **Map each date → one `scheduleDays` entry.** Each schedule line under that
  date becomes one `items` entry: the activity name → `title`, and its time
  range / location text → `detail` (keep it as one short line).
- **Map timed milestones → `countdownRows`.** The moments the display should
  count down to (session starts, race start, gates open) become
  `{ title, time }` with a full `+09:00` ISO timestamp built from the
  document's date + time.
- **Only ask the operator for what the document doesn't state**: the year or
  timezone if absent (assume `+09:00` unless told otherwise), and which lines
  are countdown targets versus schedule-only rows.
- Preserve the document's ordering; don't invent items or times.

## Verify

- Confirm `data/events/<id>.json` parses as valid JSON and its `id` matches the
  filename stem, and it has a `name`.
- Confirm every `countdownRows[].time` is full ISO-8601 with `+09:00`, and every
  `scheduleDays[].date` is `YYYY-MM-DD`.
- Tell the user the event id/name you created and that it is a `draft`, not yet
  live. To put it on screen, follow `set-active-event`.

## Publish

Follow the `publish-changes` skill to commit and push. Stage ONLY `data/`.

## Boundaries

- Edit files only under `data/`. Never touch `src/`, `admin-src/`, `.github/`,
  or built assets.
- No MCP tools — write the file directly.
