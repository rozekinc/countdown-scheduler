# Security

This project has no server and no database, and it stores no secrets. Here
is exactly why that's true, and how it stays true.

## There is nothing sensitive to leak

- The only credential-shaped thing in this whole project is the GitHub
  Device Flow **Client ID** used by the admin editor (see
  [SETUP.md](SETUP.md)). That ID is public by design — it identifies which
  app is asking to sign in, the same way a website's domain name is public.
  It is not a password and not a `client_secret`. It would be safe to commit
  it, but this project doesn't even do that: it's entered once through the
  admin app's **Settings** panel and kept in the browser's `localStorage`
  (see `admin-src/config.ts`), never in a file. That also means this exact
  code works unmodified on any fork or on the eventual upstream repo after a
  PR merges — the repo owner/name are read from the page's own
  `*.github.io` URL at runtime, and each deployment's operator enters their
  own Client ID once, in their own browser.
- There is no `client_secret` anywhere in this project. Classic OAuth token
  exchange needs one; GitHub App Device Flow does not, which is exactly why
  Device Flow was chosen (see [SETUP.md](SETUP.md), step a).
- There is no database and no server to break into. All event data lives as
  plain JSON files under `data/` in this repository, and publishing a
  change is just a normal git commit.

## The admin editor can only write to `data/`

The admin editor authenticates a real person with their own GitHub login
(via Device Flow) and then commits on their behalf — it never acts as some
shared, privileged identity. On top of that, its write path is
hard-restricted in code: `assertDataPath` in `admin-src/githubApi.ts` checks
every file path before any write, and refuses to write anywhere outside
`data/`. The admin editor cannot modify the display site's code, the
workflow files, or anything else in the repository, even if asked to.

## The MCP server never leaves your machine

The `mcp-server/` tools are meant to be run locally by an AI coding
assistant on your own computer. They never call out to any hosted service of
ours — there isn't one. The one tool that touches git (`publish`) checks
every changed path before it will run, and refuses if any of them fall
outside `data/`. It cannot be used to modify the site's source code, the
admin app, or the deploy workflow.

## The deploy workflow uses no secrets

`.github/workflows/deploy.yml` publishes the site to GitHub Pages using
GitHub's own built-in `GITHUB_TOKEN` and OpenID Connect (OIDC) for the Pages
deployment step. This token is issued automatically by GitHub Actions for
the duration of the workflow run and scoped to this repository — it is not
something anyone types in, stores, or can leak, and no user-provided secret
is configured or required anywhere in the workflow.
