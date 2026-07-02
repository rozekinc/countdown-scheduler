# One-time setup

These steps involve clicking through GitHub's own web interface with a real
account, so an AI assistant cannot do them for you — they're account-specific
and need a human in the loop. Do them once, in order, and the admin editor
and the published site will keep working after that without repeating them.

## a. Register a GitHub App and turn on Device Flow

The admin editor needs a way to save changes back to this repository from a
browser, without a server anywhere to hold a secret. GitHub's **Device Flow**
lets it do that safely.

Prefer a **GitHub App** over a classic **OAuth App** for this: GitHub Apps
support Device Flow as a secretless "public client," while classic OAuth
Apps have historically required a `client_secret` at the token-exchange
step, which we have nowhere safe to store in a static site. Double-check
this against GitHub's current documentation at setup time — GitHub does
update its auth offerings — rather than assuming the above stays true
forever.

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App**.
2. Give it any name you like and fill in the required fields.
3. Enable **"Device Flow"**.
4. Under permissions, grant **Repository permissions → Contents: Read and
   write**. Don't grant anything beyond that.
5. Save it, and note down the **Client ID** shown on the app's page. This ID
   is public by design — it identifies the app, it is not a password. See
   [SECURITY.md](SECURITY.md) for why that's fine to have in the codebase.

## b. Point the admin app at your GitHub App

No file to edit, no rebuild — this is entered once directly in the running
admin app and stays in your browser (`localStorage`), never in the repo:

1. Open the admin app (`/admin/` on your GitHub Pages URL, or locally — see
   [ReadMe.md](ReadMe.md)).
2. Click **Settings**.
3. Paste the **Client ID** from step (a) and click **Save**.

The repository owner/name are figured out automatically from the page's own
URL (GitHub Pages always serves a project site at
`https://<owner>.github.io/<repo>/...`), so this step never needs to know or
store that either. The **Settings** panel only asks for owner/repo directly
when you're testing somewhere that isn't a `github.io` URL (VS Code Live
Server, `npx serve`, etc.) — see the note in ReadMe.md.

This is also why, once this PR is merged upstream, the exact same code
starts working there unmodified: whoever owns that repo just repeats steps
(a)–(c) for their own copy — nothing in this file ever needs editing.

## c. Turn on GitHub Pages

1. In this repository's own **Settings → Pages**.
2. Set **Source** to **"GitHub Actions"**.

This is a one-time toggle. Once it's set, the included workflow
(`.github/workflows/deploy.yml`) publishes both the display site and the
admin app automatically on every push to `main`.

## d. Install the GitHub App

1. Go to your GitHub App's page and choose **"Install App"**.
2. Install it on the account that should own the event data.
3. When asked which repositories it can access, choose **only this
   repository** — don't grant it access to anything else.

## Done

After all four steps, the display site is published from the repository
root, and the admin editor is published at `/admin/`. From here on, editing
data is either: use the admin editor (see [ReadMe.md](ReadMe.md)), or ask an
AI coding assistant to make the change via the recipes in
[skills/](skills/) (see [AGENTS.md](AGENTS.md)).
