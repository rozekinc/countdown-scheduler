# Countdown Scheduler

A full-screen countdown and schedule display for an event venue's monitor — a
big timer counting down to the next thing happening, a schedule page you can
flip to (切替), sound cues as the countdown gets close (20, 10, and 5 minutes
before), and its own background music. It's a single display with two pages
(countdown and schedule) and one active event at a time.

## Where the data lives

All content lives as plain JSON files under `data/` — there is no server and no
database:

- `data/display.json` — the single display config: which event is active, the
  color preset, aspect ratio, language, text size, and editable labels.
- `data/events/` — one file per event, each with an `id`, a human `name`, the
  countdown items, the announcement text, and the day-by-day schedule.
- `data/layout.json` — the free-canvas layout: which items (countdown, clock,
  text, images, schedule, announcement) are placed where, per page. An item can
  sit at a different spot on the countdown vs schedule page and animates between
  them on 切替. Edited visually in the admin's **Layout** view; absent, the
  display falls back to a built-in default that reproduces the original look.
- `data/archive/` — finished events, moved here (sorted by year) so
  `data/events/` only ever holds things that are still current.

Because the data is just files in the repository, changing what's on screen is
the same thing as making a commit. The display site is served from the repo
root; the admin editor is served from `/admin/`. Nothing here needs a local
build step — the committed bundles (`assets/main.js`, `admin/assets/main.js`)
are what run.

## The two ways to edit data

**1. The browser admin editor.** A web page with forms instead of raw JSON. It
saves changes back to `data/` by committing directly to the repo through the
GitHub API, using a fine-grained Personal Access Token you paste in and that
stays in your browser. Open it at `/admin/` on your GitHub Pages URL, or locally
(see below).

**2. Ask Claude / Codex.** A non-coder can ask an AI coding assistant to make a
data change — add an event, edit a day's schedule, switch which event is live,
close out a finished event. The assistant follows the recipes in
[.claude/skills/](.claude/skills/) to edit `data/*.json` in the exact shape the
display and the admin editor expect, then commits to `data/`. See
[AGENTS.md](AGENTS.md).

### Running the admin editor locally

From the repository root:

```
npx serve .
```

or, without installing anything:

```
python3 -m http.server 8080
```

Then open the printed URL and add `/admin/` to the end. This only serves files
on your own machine — nobody else can see it. (On Windows in VS Code, the "Live
Server" extension's "Go Live" on `admin/index.html` does the same thing.)

## One-time GitHub setup

### Turn on GitHub Pages (once per repo)

1. In this repository's **Settings → Pages**.
2. Set **Source** to **"GitHub Actions"**.

Once set, the included workflow (`.github/workflows/deploy.yml`) builds and
publishes both the display site and the admin app on every push to `main` — full
build logs are under the repo's **Actions** tab. GitHub Pages serves a project
site at `https://<owner>.github.io/<repo>/...`, so the owner/repo are figured out
automatically from the page's own URL — nothing here ever stores them, and an
upstream copy just repeats this one toggle.

### Generate an editing token (per person, per browser)

The admin editor needs a credential to commit from a browser with no server
behind it. Each editor generates their own fine-grained token:

1. On GitHub: **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. **Repository access**: **"Only select repositories"** → pick just this one.
3. **Permissions → Repository permissions → Contents**: **"Read and write"**.
   Leave everything else at its default ("No access").
4. **Expiration**: something reasonable (90 days is fine) — generate a new one
   when it lapses.
5. **Generate token** and copy it immediately — GitHub only shows it once.
6. Open the admin app, click **Sign in with token**, and paste it in.

The token is checked against this exact repository the moment you sign in, so a
wrong or mis-scoped token fails immediately with a clear error.

## Version shown on screen

Both the display and the admin editor show a small version badge in a corner so
you always know what you're looking at:

- **Content version** (`v4 · 2026-07-04`) — bumped every time data is published
  (by the admin editor or an AI assistant). It lives in `data/display.json`
  (`contentVersion` / `contentUpdatedAt`) and updates live on the display within
  seconds of a publish. If the number went up, the screen is showing your latest
  edit.
- **Build version** (`1.0.0+abc1234`) — which code build is deployed. It comes
  from `package.json` `version` plus the commit SHA, stamped in at build time.
  Bump `package.json` `version` when you open/update a code PR so a new build is
  easy to identify.

## Security note

- The GitHub token is the only real credential. It lives only in the browser
  tab's `sessionStorage` — cleared when the tab closes or on sign-out, never
  written to disk, never committed, never sent anywhere except directly to
  GitHub's API from your own browser.
- It is scoped by its owner to exactly this repository with `Contents:
  read/write` and nothing else, with an expiration. If it leaks, the blast
  radius is "write access to this repo's files, for a bounded time."
- The admin editor can only write under `data/` and `media/images/` (the latter
  so the Layout view can upload display images): `assertDataPath` in
  `admin-src/githubApi.ts` checks every path before any write and refuses
  anything outside those two prefixes. It cannot modify the site's code or
  anything else.
- Publishing needs no secrets: `.github/workflows/deploy.yml` deploys to Pages
  using GitHub's built-in `GITHUB_TOKEN` and OIDC — issued automatically per run,
  scoped to this repo, nothing anyone types in or can leak.
