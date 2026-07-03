---
name: publish-changes
description: Use when the user asks to publish, commit, push, or make live the pending data changes — and as the closing step of every skill that edits data/.
---

# Publish changes

Commit and push data changes to `main`. This is the shared publish routine that
every mutating skill ends with. Only files under `data/` may be published; refuse
if anything outside `data/` is staged.

## When to run

- As the final step of any skill that edited files under `data/`.
- When the user explicitly asks to publish pending changes.
- Read-only skills do not run this.

## Bump the content version (do this first, every publish)

Before staging, bump the version stamp in `data/apps.json` so both the display
and the admin screen show that the data changed:

- Increment the top-level `contentVersion` number by 1 (start at `1` if the
  field is missing).
- Set `contentUpdatedAt` to today's date as an ISO string (e.g. `"2026-07-03"`,
  or a full ISO datetime if you know the time).

This edit is under `data/`, so it publishes with everything else. Do it on
EVERY publish — including event-only edits — so the on-screen version always
reflects the last published change.

## Steps

1. Run `git status --porcelain` to see what changed. Confirm every change is
   under `data/` (including the `data/apps.json` version bump). If any change is
   outside `data/`, STOP and tell the user — do not stage or commit it.
2. Stage ONLY the data directory: `git add data/`.
3. Verify the staged set is data-only:
   ```
   git diff --cached --name-only
   ```
   If any staged path does not start with `data/`, unstage and refuse to
   commit. Report the offending path to the user.
4. Commit with a short message describing the data change, e.g.
   `git commit -m "data: <what changed>"`.
5. Push to main: `git push origin main`.

## Verify

- Confirm the commit succeeded and contains only `data/` paths.
- Confirm the push to `origin main` succeeded.
- Tell the user the change is live and typically visible on the display within
  a minute or two once the site redeploys.

## Boundaries

- Publish ONLY files under `data/`. Never stage, commit, or push changes in
  `src/`, `admin-src/`, `.github/`, or built assets — refuse if any are staged.
- No MCP tools — use plain `git`.
