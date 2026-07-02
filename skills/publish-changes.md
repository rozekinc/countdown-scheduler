# Publish changes

**Ask Codex for:** "Publish the pending data changes." You usually don't
need to ask for this separately — the other recipes already end by
publishing — but ask explicitly if you made several changes in a row and
want to be sure they're all live.

**Tool(s) it should call:** the mcp-server `publish` tool, which commits
the changes under `data/` to the repository. It refuses to run if any
changed file falls outside `data/`.

**What success looks like:** Codex reports a successful commit, and the
change is visible on the live display within a minute or two (once GitHub
Pages has redeployed).
