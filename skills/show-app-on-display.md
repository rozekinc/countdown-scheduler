# Swap which app is live on the display (TV)

This is different from [switch-active-app.md](switch-active-app.md): that one
picks which *event* an app shows; this one picks which *app* is even on
screen right now.

**Ask Codex for:** "Show `<web1/web2/web3>` on the display now."

**Tool(s) it should call:** `set_selected_app`, followed by the publish
tool.

**What success looks like:** `data/apps.json`'s `selectedAppId` matches the
app you named, and Codex confirms the change. Any screen that was opened
without an `?app=` link in its URL follows automatically, usually within
about 15 seconds, with no reload needed. A screen that *was* opened with an
`?app=` link stays exactly where it is -- that's by design, for a screen
that's meant to always show one specific app.
