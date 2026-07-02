# countdown-scheduler-mcp

A local, stdio-only [MCP](https://modelcontextprotocol.io) server that exposes
data-only tools over this repo's `data/` directory (see the repo root for the
data shape: `data/apps.json`, `data/events/*.json`, `data/archive/<year>/*.json`).

It is meant to be launched as a local child process by an AI coding CLI
running on your own machine. It is **never** network-exposed and is **never**
given any secret -- the only thing it needs is the path to your local clone of
this repo.

Every tool is hard-constrained to read and write only inside
`REPO_ROOT/data/`. Ids and paths coming in from tool arguments are validated
and the final resolved path is re-checked to make sure it never escapes
`data/`, so the server cannot be tricked into touching anything else in the
repo (or outside it) via `..` or similar tricks.

`publish` is the only tool that ever invokes `git`. Before it stages or
commits anything it re-derives the list of changed paths from
`git status --porcelain` and aborts, unchanged, if any of them fall outside
`data/` -- so the "this server only ever touches data/" guarantee holds even
if a bug elsewhere in the process put an unrelated file into a dirty state.

## Install

```bash
cd mcp-server
npm install
npm run build
```

`npm run build` compiles `src/` to `dist/` with `tsc`. `npm run typecheck`
type-checks without emitting.

## Run

The server communicates over stdio and requires one environment variable,
`REPO_ROOT`: the absolute path to your local clone of this repo.

```bash
REPO_ROOT=/path/to/your/countdown-scheduler node dist/index.js
```

It won't do anything useful run directly like this from a terminal -- it's
meant to be spawned by an MCP-aware client, which talks to it over stdin/stdout
using the MCP JSON-RPC protocol.

## Tools

- `list_apps` -- read `data/apps.json`, return each app plus the status of its active event, and the current `displayModeId`.
- `list_events(status?)` -- enumerate events under `data/events` and `data/archive`, optionally filtered by status.
- `get_event(eventId)` -- return one event's full JSON.
- `create_draft_event(appId, id, seed?)` -- create `data/events/<id>.json` with status `draft`.
- `add_schedule_row(eventId, date, row)` -- append a `{ A, B, time? }` row under the matching `scheduleDays` entry (creating it if needed); keeps `scheduleDays` sorted by date. `time` is optional -- set it so the display can gray the row out once it's passed and highlight it while it's next up.
- `edit_schedule_row(eventId, date, rowIndex, row)` -- replace one schedule row in place.
- `add_countdown_row(eventId, title, time)` -- append a `{ title, time }` row to `countdownRows`.
- `edit_countdown_row(eventId, index, patch)` -- patch `title` and/or `time` on one `countdownRows` entry.
- `set_active_event(appId, eventId)` -- point an app at an event and flip that event's status to `active`. This picks which event an app shows; it does not change what's on screen.
- `set_selected_app(appId)` -- set which app is currently live on the primary display (`data/apps.json`'s `selectedAppId`). This is the remote control for what's actually showing on the TV; a screen loaded with an explicit `?app=` URL stays pinned and ignores it.
- `set_selected_display_mode(displayModeId)` -- set the readability preset (`data/apps.json`'s `displayModeId`, one of `standard` / `daylight-contrast` / `dark-glare`) applied to every display screen. Unlike `set_selected_app`, this applies even to a screen pinned via `?app=` -- it's a lighting/contrast setting for the physical TV, not an app-identity choice.
- `close_event(eventId)` -- set status to `ended` and move the file from `data/events/` to `data/archive/<year>/`.
- `publish(message)` -- stage only `data/`, commit, and push. Aborts with no changes made if anything outside `data/` is dirty.

## Using this with Claude Code

A repo-root [`.mcp.json`](../.mcp.json) already registers this server with a
relative path (`mcp-server/dist/index.js`), so opening this repo in Claude
Code picks it up automatically -- no absolute paths, no per-machine editing.
The one manual step: build it once first (`npm install && npm run build`,
above). If `REPO_ROOT` isn't set, the server defaults to two directories up
from its own built file, i.e. this repo -- that only holds as long as
`mcp-server/` stays where it is.

## Using this with Codex

Codex (and most other MCP-aware CLIs) are configured to launch local MCP
servers by declaring a command, its arguments, and an environment for the
child process -- similar to the `.mcp.json` above, but in whatever format
that specific CLI expects. A generic version of the same config:

```json
{
  "command": "node",
  "args": ["mcp-server/dist/index.js"],
  "env": {
    "REPO_ROOT": "/absolute/path/to/your/countdown-scheduler"
  }
}
```

`REPO_ROOT` is optional (see the default above); set it explicitly if the
CLI launches this server from a different working directory than the repo
root. Exactly where this snippet goes (a config file location, a CLI flag, a
settings UI, etc.) depends on the specific version of the Codex CLI you're
using, and that detail can drift over time -- check Codex's own current
documentation for how it wants local/stdio MCP servers registered rather than
assuming a fixed path here.

## Development / tests

`test/scratch-test.mjs` is a set of ad-hoc checks (not wired into `build`)
that exercise the tool logic against a throwaway temp directory it creates
itself -- it never touches this repo's real `data/`. Run it after building:

```bash
npm run build
node test/scratch-test.mjs
```

It covers `add_schedule_row` (day-entry creation, appending, sort order,
input validation, path-traversal rejection), `close_event` (archive move,
status flip, double-close rejection), and the `publish` path-guard logic
(`git status --porcelain` parsing and the data-only assertion), using sample
porcelain strings instead of a real git repo.
