# Switch the display's readability mode

This is different from [show-app-on-display.md](show-app-on-display.md): that
one picks which *app* is on screen; this one picks a color preset that makes
the *same* app easier to read under the room's current lighting. It has
nothing to do with app branding -- it exists because a screen glanced at from
across a bright room, or one fighting glare from overhead lights, needs
higher contrast than the app's own everyday colors, not because a different
app or event should be shown.

**Ask Codex for:** "Switch the display to `<standard/daylight-contrast/dark-glare>` mode."

**Tool(s) it should call:** `set_selected_display_mode`, followed by the
publish tool.

**What success looks like:** `data/apps.json`'s `displayModeId` matches the
mode you named (or is cleared/null for `standard`), and Codex confirms the
change. Every display screen picks this up automatically, usually within
about 15 seconds, with no reload needed -- including a screen that was opened
with an `?app=` link and is pinned to one specific app. That's the key
difference from `show-app-on-display.md`: display mode is not something a
pinned screen can opt out of, since it's a property of the physical monitor's
lighting conditions, not of which app is showing.
