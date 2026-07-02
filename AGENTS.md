# For Codex / AI coding assistants

This repository runs a countdown-and-schedule display for an event venue's
monitor, plus a small "apps" system so it can show several branded displays
(each with its own colors) that each point at one active event. All of the
event data — apps, events, and archived events — lives as plain JSON files
under `data/`, and publishing a data change is just a git commit to that
folder.

## What you should do here

If a non-coder asks you to change what's showing on a display — add an
event, edit a day's schedule, switch which event is live, archive a
finished event, or publish a pending change — do it by calling the tools
provided by `mcp-server/`, not by hand-editing files.

See [skills/](skills/) for the specific recipe to follow for each of these
requests:

- [skills/add-an-event.md](skills/add-an-event.md)
- [skills/edit-a-day.md](skills/edit-a-day.md)
- [skills/switch-active-app.md](skills/switch-active-app.md)
- [skills/show-app-on-display.md](skills/show-app-on-display.md)
- [skills/switch-display-mode.md](skills/switch-display-mode.md)
- [skills/close-out-an-event.md](skills/close-out-an-event.md)
- [skills/publish-changes.md](skills/publish-changes.md)

## What you should not do here

- Never hand-edit files under `data/` directly, even though they're "just
  JSON." Go through the `mcp-server/` tools instead, so the data stays in
  the exact shape the display and the admin editor both expect.
- Never touch `src/`, `admin-src/`, or `.github/workflows/`. Those are the
  display site's code, the admin editor's code, and the publish workflow —
  they're maintained by this project's developer, not by a Codex session
  acting on a non-coder's data request. If a request seems to require a
  code change rather than a data change, say so and stop, rather than
  making the change yourself.

See also [SECURITY.md](SECURITY.md) for why this boundary exists and how
it's enforced.
