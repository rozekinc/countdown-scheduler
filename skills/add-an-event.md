# Add an event

**Ask Codex for:** "Add a new event called `<name>` for app `<web1/web2/web3>`,
with these countdown items and this announcement text." Give the exact
titles and target date/times you want counted down to.

**Tool(s) it should call:** the mcp-server event tool that creates a new
event file under `data/events/` (status `draft` until you're ready to show
it), followed by the publish tool.

**What success looks like:** a new file appears under `data/events/`
matching the shared event shape (id, appId, status, announcement,
countdownRows, scheduleDays), and Codex tells you the event id it created.
The event won't appear on screen until you also switch the app to it — see
[switch-active-app.md](switch-active-app.md).
