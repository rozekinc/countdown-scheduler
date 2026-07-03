# For Codex / AI coding assistants

This repository runs a countdown-and-schedule display for an event venue's
monitor, plus a small "apps" system for several branded displays (each with its
own colors) that each point at one active event.

**All event data — apps, events, and archived events — lives as plain JSON
files under `data/` only.** This includes each app's on-screen **layout** (which
items are placed where), at `data/layouts/<appId>.json`. Publishing a data
change is just a git commit to `data/`, then push.

## What to do

If a non-coder asks you to change what's showing — add an event, edit a day's
schedule, switch which event is live, close out a finished event, or move/resize
items on the screen — edit the JSON under `data/` by following the matching
recipe in [.claude/skills/](.claude/skills/) so the data stays in the exact
shape the display and the admin editor both expect. Then commit to `data/` and
push. (The one exception to "data only": the browser admin editor may also
upload display images into `media/images/` — assistants edit only `data/`.)

Every publish bumps a content version so the screens can show what's live: the
`publish-changes` recipe increments `contentVersion` and sets `contentUpdatedAt`
in `data/apps.json` as part of the same data commit. Do this on every data
publish, including event-only edits.

## What not to do

- Never touch `src/`, `admin-src/`, `.github/`, or the built bundles
  (`assets/main.js`, `admin/assets/main.js`). Those are maintained by this
  project's developer, not by a data-request session. If a request needs a code
  change rather than a data change, say so and stop.
- Write nowhere outside `data/`.
