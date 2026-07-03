// Where the display reads its data from AT RUNTIME. Resolved here, never
// hardcoded, so this file is identical on any fork or upstream deployment.
//
// The key decision: on a real github.io deployment the display reads data
// straight from the LIVE repo via raw.githubusercontent.com, NOT from the
// deployed Pages copy of data/. That decouples data updates from CI -- a data
// commit (from the admin editor or an assistant) is visible on screen within
// the poll interval, with no rebuild/redeploy. Only code and media changes
// still go through the Pages build.
//
// Off github.io (localhost via Live Server / `npx serve`, or a custom domain)
// there is no repo to derive, so it falls back to the relative data/ paths --
// which serve whatever data files are sitting next to the page (the local
// checkout during testing).

const BRANCH = "main";
const OWNER_REPO_OVERRIDE_KEY = "countdown-scheduler:owner-repo-override";

interface RepoIdentity {
  owner: string;
  repo: string;
}

/** GitHub Pages project sites are served at https://<owner>.github.io/<repo>/…
 * so the repo identity is readable straight off the URL. Returns null when
 * not on such a URL. */
function detectFromGitHubPagesUrl(): RepoIdentity | null {
  const match = window.location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!match) return null;
  const owner = match[1];
  const repo = window.location.pathname.split("/").filter(Boolean)[0];
  if (!repo) return null; // user/org root page, not a project site
  return { owner, repo };
}

/** A LOCAL, per-browser override for testing the display against a live repo
 * when the page isn't served from github.io. Never needed on a real
 * deployment. */
function readOverride(): RepoIdentity | null {
  try {
    const raw = window.localStorage.getItem(OWNER_REPO_OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RepoIdentity>;
    if (parsed.owner && parsed.repo) return { owner: parsed.owner, repo: parsed.repo };
  } catch {
    /* ignore malformed override */
  }
  return null;
}

/**
 * URL prefix for data fetches. On a github.io deployment this is the
 * raw.githubusercontent.com base for this repo's `main` branch, so data is
 * read live from the repo without waiting on a Pages redeploy. Otherwise ""
 * (relative paths → the data files served alongside the page).
 */
export function dataBaseUrl(): string {
  const identity = detectFromGitHubPagesUrl() ?? readOverride();
  if (!identity) return "";
  return `https://raw.githubusercontent.com/${identity.owner}/${identity.repo}/${BRANCH}/`;
}
