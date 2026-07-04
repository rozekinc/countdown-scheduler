# For Codex / AI coding assistants

This repository runs a single countdown-and-schedule display for an event
venue's monitor. It has two pages — a **countdown** page and a **schedule** page
(toggled by 切替) — and one active event at a time.

**All content lives as plain JSON files under `data/` only:**
- `data/display.json` — the single display config (which event is active, colors
  preset, aspect ratio, language, text size, labels).
- `data/events/*.json` and `data/archive/` — the events (each has an `id`, a
  human `name`, countdown items, and a day-by-day schedule).
- `data/layout.json` — the on-screen layout: which items (countdown, clock,
  text, images, schedule, announcement) are placed where, per page.

Publishing a data change is just a git commit to `data/`, then push.

## What to do

If a non-coder asks you to change what's showing — add an event (including from
a PDF/spreadsheet), rename an event, edit a day's schedule, switch which event is
live, close a finished event, or move/resize items on the screen — edit the JSON
under `data/` by following the matching recipe in
[.claude/skills/](.claude/skills/) so the data stays in the exact shape the
display and the admin editor both expect. Then commit to `data/` and push. (The
one exception to "data only": the browser admin editor may also upload display
images into `media/images/` — assistants edit only `data/`.)

Every publish bumps a content version so the screen can show what's live: the
`publish-changes` recipe increments `contentVersion` and sets `contentUpdatedAt`
in `data/display.json` as part of the same data commit. Do this on every data
publish, including event-only edits.

## What not to do

- Never touch `src/`, `admin-src/`, `.github/`, or the built bundles
  (`assets/main.js`, `admin/assets/main.js`). Those are maintained by this
  project's developer, not by a data-request session. If a request needs a code
  change rather than a data change, say so and stop.
- Write nowhere outside `data/`.
