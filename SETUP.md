# One-time repo setup

This step involves clicking through GitHub's own web interface with a real
account, so an AI assistant cannot do it for you. Do it once and the
published site keeps working after that without repeating it.

## Turn on GitHub Pages

1. In this repository's own **Settings → Pages**.
2. Set **Source** to **"GitHub Actions"**.

This is a one-time toggle. Once it's set, the included workflow
(`.github/workflows/deploy.yml`) builds and publishes both the display site
and the admin app automatically on every push to `main` — full build logs
are visible under the repo's **Actions** tab if a deploy ever needs
debugging (the legacy "deploy from a branch" builder gives no such logs,
which is why this project uses Actions instead). Editing `data/*.json`
directly — which is all the admin app and the MCP server ever do — still
needs no local build step; the workflow just re-copies it as-is on the next
push.

After this, the display site is published from the repository root, and the
admin editor is published at `/admin/`.

The repository owner/name are figured out automatically from the page's own
URL (GitHub Pages always serves a project site at
`https://<owner>.github.io/<repo>/...`), so nothing here ever needs to know
or store that. This is also why, once this PR is merged upstream, the exact
same code starts working there unmodified — whoever owns that repo just
repeats this one step for their own copy; nothing in this file ever needs
editing.

# Signing in to edit (do this whenever you want to make a change)

Unlike the step above, this isn't a one-time repo setup — it's a
short-lived credential each person editing generates for themselves, per
browser, and renews when it expires. Every edit — through the admin app or
through Codex/the MCP server's `publish` tool — is still a normal git
commit under your own GitHub identity; this token is just how the admin
app is allowed to make that commit from a browser with no server behind it.

1. On GitHub, go to **Settings → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token**.
2. **Repository access**: choose **"Only select repositories"** and pick
   just this one.
3. **Permissions → Repository permissions → Contents**: set to
   **"Read and write"**. Leave every other permission at its default
   ("No access") — this token should be able to do exactly one thing.
4. **Expiration**: pick something reasonable (90 days is a fine default) —
   you'll just generate a new one when it lapses.
5. Click **Generate token**, and copy it immediately — GitHub only shows it
   once.
6. Open the admin app (`/admin/` on your GitHub Pages URL, or locally — see
   [ReadMe.md](ReadMe.md)), click **Sign in with token**, and paste it in.

The token is checked against this exact repository the moment you sign in,
so a wrong or mis-scoped token is caught immediately with a clear error
instead of failing confusingly later. It's kept only in this browser tab's
session storage — never written to disk, never sent anywhere except
directly to GitHub's API from your own browser. See
[SECURITY.md](SECURITY.md) for the full picture.

From here on, editing data is either: use the admin editor, or ask an AI
coding assistant to make the change via the recipes in [skills/](skills/)
(see [AGENTS.md](AGENTS.md)).
