// Deployment-specific values are resolved at RUNTIME here, never hardcoded
// in source. That means this file is identical whether it's running on a
// fork's Pages deployment during testing or on the eventual upstream repo's
// Pages deployment after a PR merges -- nobody has to edit and rebuild this
// file per deployment, and no repo owner's name ever needs to appear in a
// commit.

// Branch the admin app reads from and commits to.
export const TARGET_BRANCH = "main";

export interface RepoIdentity {
  owner: string;
  repo: string;
}

const OWNER_REPO_OVERRIDE_KEY = "countdown-scheduler-admin:owner-repo-override";
const CLIENT_ID_KEY = "countdown-scheduler-admin:client-id";

/**
 * GitHub Pages project sites are always served at
 * https://<owner>.github.io/<repo>/... -- so on a real deployment the repo
 * identity can be read straight off the URL, with zero configuration.
 * Returns null when not running on a *.github.io URL (e.g. localhost via
 * VS Code Live Server or `npx serve`, or a custom Pages domain).
 */
function detectFromGitHubPagesUrl(): RepoIdentity | null {
  const host = window.location.hostname;
  const match = host.match(/^([^.]+)\.github\.io$/i);
  if (!match) return null;
  const owner = match[1];
  const repo = window.location.pathname.split("/").filter(Boolean)[0];
  if (!repo) return null;
  return { owner, repo };
}

function readOverride(): RepoIdentity | null {
  const raw = window.localStorage.getItem(OWNER_REPO_OVERRIDE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RepoIdentity>;
    if (parsed.owner && parsed.repo) return { owner: parsed.owner, repo: parsed.repo };
  } catch {
    /* ignore malformed override */
  }
  return null;
}

/**
 * The repo this admin instance talks to. Auto-detected from the URL on a
 * real github.io deployment; otherwise falls back to a local-only override
 * (see setRepoIdentityOverride) for testing on localhost. Returns null if
 * neither is available -- callers must handle that by prompting the user.
 */
export function getRepoIdentity(): RepoIdentity | null {
  return detectFromGitHubPagesUrl() ?? readOverride();
}

/**
 * Sets a LOCAL, per-browser override for the repo identity. Only meant for
 * testing when the page isn't served from a *.github.io URL (Live Server,
 * `npx serve`, a custom Pages domain, etc). Never used, and never needed,
 * on a real github.io deployment -- there the URL is authoritative and this
 * is ignored. Stored in localStorage only; never written to any file.
 */
export function setRepoIdentityOverride(identity: RepoIdentity): void {
  window.localStorage.setItem(OWNER_REPO_OVERRIDE_KEY, JSON.stringify(identity));
}

export function clearRepoIdentityOverride(): void {
  window.localStorage.removeItem(OWNER_REPO_OVERRIDE_KEY);
}

/**
 * The GitHub OAuth/App "Client ID" used for the Device Flow. This is
 * PUBLIC by design (Device Flow has no client_secret) but is still kept
 * out of source: each deployment's operator registers their own GitHub
 * App (see SETUP.md) and enters its Client ID once, here, via the admin
 * UI's Settings panel. Stored in localStorage only.
 */
export function getClientId(): string | null {
  return window.localStorage.getItem(CLIENT_ID_KEY);
}

export function setClientId(id: string): void {
  window.localStorage.setItem(CLIENT_ID_KEY, id.trim());
}
