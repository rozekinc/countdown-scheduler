---
name: set-display-text
description: Use when the user asks to change the on-screen wording, switch the display between Japanese and English, or change the text size.
---

# Set the display's text, language, and size

Edit the three global text settings in `data/apps.json`: `displayLanguage`
(which language the screens render), `textScale` (the font-size multiplier), and
`labels` (the editable wording for the fixed UI labels). These are global — they
apply to every screen, including screens pinned with an `?app=` link. Event
content (countdown titles, schedule items, announcements) is NOT here; that lives
in the event files. To place, move, or resize a piece of text (or any item) on
the screen — rather than change its wording — use `edit-the-layout` instead.

## Preconditions

- Get from the user which of the three they want to change:
  - the display language (Japanese vs English),
  - the text size,
  - and/or specific label wording (and, for wording, whether they mean the
    Japanese text, the English text, or both).

## Read first

- `data/apps.json` — the current `displayLanguage`, `textScale`, and `labels`.
- `src/types.ts` — the `AppsData`, `DisplayLanguage`, and `Label` shapes. Read
  only; do not edit.

## Edit

In `data/apps.json`, change only the relevant field(s):

### `displayLanguage`

`"ja"` (Japanese) or `"en"` (English). This picks which side of each label pair
the display renders. Both sides always stay stored — switching the language does
not delete the other translation.

### `textScale`

A number multiplier for the display font size, `1` = default. Useful range is
about `0.6`–`1.6` (smaller fits more on screen; larger is more readable from a
distance). Keep it within that range unless the user insists.

### `labels`

An object keyed by label key; each value is `{ "ja": ..., "en": ... }`. Edit the
side(s) the user asked for and leave the other side untouched. A missing key
falls back to the built-in default, so you only need to include keys you are
setting. The label keys and where each one shows on screen:

- `currentTime` — heading over the live clock ("現在時刻" / "Current Time").
- `nextSchedule` — heading over the upcoming-schedule area ("次のスケジュール" /
  "Next Schedule").
- `noticePrefix` — prefix printed before the announcement text ("お知らせ：" /
  "Notice: ").
- `until` — suffix after a countdown target's time ("まで" / "until").
- `finished` — shown after the last countdown has passed ("終了しました" /
  "Finished").
- `toggle` — the screen-toggle button label ("切替" / "Switch").
- `today` — auto day label for the current date ("今日" / "Today").
- `tomorrow` — auto day label for the next date ("明日" / "Tomorrow").
- `dayAfter` — auto day label for the day after that ("明後日" / "Day After").

Change nothing else in the file.

## Verify

- Confirm `data/apps.json` still parses as valid JSON.
- Confirm `displayLanguage` is exactly `"ja"` or `"en"`, `textScale` is a
  number, and every edited label entry still has both a `ja` and an `en` string.
- Tell the user every screen picks this up automatically within about 15
  seconds, no reload needed, including `?app=`-pinned screens.

## Publish

Follow the `publish-changes` skill to commit and push. Stage ONLY `data/`.

## Boundaries

- Edit files only under `data/`. Never touch `src/`, `admin-src/`, `.github/`,
  or built assets.
- No MCP tools — edit the file directly.
