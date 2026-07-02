# Close out a finished event

**Ask Codex for:** "Close out event `<event-id>`, it's finished."

**Tool(s) it should call:** the mcp-server event tool that sets the event's
`status` to `ended` and moves its file from `data/events/` to
`data/archive/<year>/`, followed by the publish tool.

**What success looks like:** the event's file is gone from `data/events/`
and now exists under `data/archive/<year>/<event-id>.json` with
`status: "ended"`. Make sure no app still has this event set as its
`activeEventId` first — if one does, switch it away (see
[switch-active-app.md](switch-active-app.md)) before closing out.
