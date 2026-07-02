# Switch which event an app is showing

**Ask Codex for:** "Set `<web1/web2/web3>`'s active event to `<event-id>`."

**Tool(s) it should call:** the mcp-server app tool that updates the
matching app entry's `activeEventId` in `data/apps.json`, followed by the
publish tool.

**What success looks like:** `data/apps.json` shows the chosen app's
`activeEventId` pointing at the event you named, and Codex confirms the
change. The display for that app will pick up the new event on its next
refresh after the change is published.
