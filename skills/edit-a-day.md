# Edit a day's schedule

**Ask Codex for:** "For event `<event-id>`, update the schedule for
`<date>` — here are the new rows / announcement text." Give the rows in the
order you want them shown.

**Tool(s) it should call:** the mcp-server event tool that updates a
`scheduleDays` entry (by date) inside `data/events/<event-id>.json`,
followed by the publish tool.

**What success looks like:** the matching `scheduleDays` entry for that
date is updated in place (or added, if that date didn't exist yet), nothing
else in the file changes, and Codex confirms which date it edited.
