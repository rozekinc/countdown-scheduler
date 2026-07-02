# Security

This project has no server and no database, and the repo itself stores no
secrets. The one real credential in the picture — a GitHub token — is never
committed, never leaves the person who generated it, and lives only in
their own browser tab while they're actively signed in. Here's exactly why
that's true, and how it stays true.

## Why there's a token at all, and why it's not in the codebase

The admin editor needs *some* way to save changes back to this repository
from a browser, with no server anywhere to broker that. GitHub's OAuth and
Device Flow endpoints don't support this from a pure static page (they
don't support CORS from a browser at all — a confirmed, longstanding
limitation on GitHub's side, not something this project could configure
around). The alternative that actually works without a server: each person
who wants to edit generates their own **fine-grained Personal Access
Token**, scoped to just this repository with `Contents: read/write` and
nothing else (see [SETUP.md](SETUP.md)), and pastes it into the admin app.

That token:
- Is checked against this exact repository the moment it's entered
  (`admin-src/auth.ts`), so a wrong or mis-scoped paste fails immediately
  with a clear error rather than silently.
- Lives only in `sessionStorage` — cleared when the tab closes or on
  explicit sign-out, never written to `localStorage`, never written to any
  file, never included in anything this codebase commits.
- Is scoped by its owner (via GitHub's own token settings, not by
  anything in this repo) to exactly this repository and exactly
  `Contents: read/write` — it cannot read other repos, change settings,
  add collaborators, or do anything beyond editing files here.
- Has an expiration its owner chose. If it leaks, the blast radius is
  "write access to this repo's files, for a bounded time" — never more.

There is no database and no server to break into either way. All event
data lives as plain JSON files under `data/` in this repository, and
publishing a change is just a normal git commit under the token owner's
own GitHub identity.

## The admin editor can only write to `data/`

The admin editor commits as whoever is signed in — it never acts as some
shared, privileged identity. On top of that, its write path is
hard-restricted in code: `assertDataPath` in `admin-src/githubApi.ts` checks
every file path before any write, and refuses to write anywhere outside
`data/`. The admin editor cannot modify the display site's code or anything
else in the repository, even if asked to.

## The MCP server never leaves your machine

The `mcp-server/` tools are meant to be run locally by an AI coding
assistant on your own computer. They never call out to any hosted service of
ours — there isn't one. The one tool that touches git (`publish`) checks
every changed path before it will run, and refuses if any of them fall
outside `data/`. It cannot be used to modify the site's source code, the
admin app, or anything else in the repository.

## Publishing needs no secrets either

GitHub Pages is configured to deploy straight from the `main` branch (no
GitHub Actions workflow, no build step on GitHub's side) — whatever is
committed is what's published, using GitHub's own built-in Pages hosting.
There is no token, credential, or secret involved in publishing at all.
