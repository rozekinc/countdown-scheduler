---
name: add-an-event
description: Use when the user asks to add, create, or set up a new event (with countdown items, an announcement, and a day schedule) for one of the apps.
---

# Add an event

Create a new event JSON file under `data/events/`. The event will not appear on
any display until an app is pointed at it (see the `set-app-event` skill); a new
event should start as a `draft`.

## Preconditions

- Get from the user: a desired event name/id, which app owns it, the
  announcement text, the countdown items (each a title + the ISO target time),
  and the per-day schedule.
- If the user did not say which app owns the event, ask before proceeding.

## Read first to resolve ids

- `data/apps.json` — the `apps[].id` values (e.g. `web1`, `web2`, `web3`). The
  owning app id you pick becomes the event's `appId`.
- `data/events/` — list the directory so you pick an event id (filename stem)
  that is not already taken.
- `src/types.ts` — the `EventData` schema. Read it and match it exactly. Do not
  edit that file; read it only to confirm field names and shapes.

## Edit

Create `data/events/<id>.json` where `<id>` is the filename stem and MUST equal
the `id` field inside the file. Populate every `EventData` field:

- `id`: the filename stem.
- `appId`: the owning app's `id` from `data/apps.json`.
- `status`: `"draft"`.
- `announcement`: the announcement string.
- `countdownRows`: array of `{ "title", "time" }`. `time` is a full ISO-8601
  timestamp with the `+09:00` offset (e.g. `"2026-09-05T13:00:00+09:00"`).
- `scheduleDays`: array of `{ "date", "announcement", "rows": [...] }`.
- `highlightKeywords` (optional): a `string[]` of terms the display should color
  wherever they appear. Include it only if the user names keywords to highlight;
  omit the field otherwise.

### Schedule `rows` pairing (important)

Each schedule entry displays as title/content pairs, laid out as consecutive
even/odd row indices:

- Even index (0, 2, 4, …) = the title row. It carries `A` = the item title,
  `B` = a short description, and `time` = the pair's full ISO-8601 time
  (`+09:00`).
- Odd index (1, 3, 5, …) = the content row for the pair above it. It carries
  `A` = the human time range (e.g. `"13:00 - 13:30"`), `B` = the location/detail
  (e.g. `"Main Stage"`), and no `time`.

Keep rows in this even-title / odd-content order. See
`data/events/sample-event.json` for a worked example.

## Verify

- Confirm `data/events/<id>.json` parses as valid JSON and its `id` matches the
  filename stem.
- Confirm `appId` matches an existing app id in `data/apps.json`.
- Confirm every `countdownRows[].time` and every even-index `scheduleDays[].rows[].time`
  is full ISO-8601 with `+09:00`.
- Tell the user the event id you created and that it is a `draft`, not yet on
  any display.

## Publish

Follow the `publish-changes` skill to commit and push. Stage ONLY `data/`.

## Boundaries

- Edit files only under `data/`. Never touch `src/`, `admin-src/`, `.github/`,
  or built assets.
- No MCP tools — write the file directly.
