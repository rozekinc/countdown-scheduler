# Countdown Scheduler

This project runs a full-screen countdown and schedule display for an event
venue's monitor — a big timer that counts down to the next thing happening,
plus a schedule screen you can flip to with a button. It plays sound cues as
the countdown gets close (20, 10, and 5 minutes before), and it has its own
background music.

## What changed

The display used to read its data from a Google Sheet. It now reads its data
from files stored inside this repository:

- `data/apps.json` — the list of "apps" (each app is one branded display: its
  own colors and which event it is currently showing).
- `data/events/` — one file per event, holding the countdown items, the
  announcement text, and the day-by-day schedule.
- `data/archive/` — old events get moved here (sorted by year) once they are
  finished, so `data/events/` only ever holds things that are still current.

Because the data is just files in the repository, changing what's on screen
is the same thing as making a commit — there is no separate server or
database to manage.

Editing that data by hand as JSON is not friendly, so this repo also includes
an **admin editor** — a simple web page for filling in forms instead of
editing JSON. See [SETUP.md](SETUP.md) for the one-time setup it needs before
first use.

## Running the admin editor

There are three ways to open the admin editor, depending on what you're
doing:

### 1. On Windows, in VS Code (recommended for day-to-day editing)

1. Open this repository's folder in VS Code.
2. If you don't already have it, install the "Live Server" extension from
   the Extensions panel.
3. Right-click `admin/index.html` in the file list and choose
   **"Open with Live Server"** (or click **"Go Live"** in the blue status
   bar at the bottom of the window).
4. A browser tab opens with the admin editor, already built and ready to
   use — no terminal commands needed.

### 2. Hosted on GitHub Pages (works from any device, no setup)

Once the one-time setup in [SETUP.md](SETUP.md) is done, the admin editor is
also published automatically at:

```
https://<your-github-username-or-org>.github.io/<this-repo-name>/admin/
```

This is the easiest option if you're not at your own computer, since nothing
needs to be installed.

### 3. Local testing only (does not affect the live site or anyone else)

If you want to try something on your own machine without publishing it or
touching the hosted version, run one of these from the repository root:

```
npx serve .
```

or, if you don't want to install anything:

```
python3 -m http.server 8080
```

Then open the URL it prints in your browser, and add `/admin/` to the end of
it. This only serves files on your own machine — nobody else can see it.

## Where to go next

- First time setting this up? Start with [SETUP.md](SETUP.md).
- Wondering what is and isn't kept secret? See [SECURITY.md](SECURITY.md).
- Asking an AI coding assistant to make a data change for you? See
  [AGENTS.md](AGENTS.md) and the [skills/](skills/) folder.
