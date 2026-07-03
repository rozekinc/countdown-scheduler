// Thin wrapper around the GitHub REST Contents + Git Data APIs, scoped to
// the data/ directory only. Every read/write helper in this file must call
// assertDataPath() first, with no bypass, so this app can never touch
// anything outside data/.

import { getRepoIdentity, TARGET_BRANCH } from "./config";
import { getStoredToken } from "./auth";

const API_ROOT = "https://api.github.com";

export class GithubApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

// The admin may only ever touch these prefixes: all editable content lives
// under data/, plus media/images/ so the layout editor can upload display
// image assets (the ONLY binary-writable location). No bypass, ever.
const WRITABLE_PREFIXES = ["data/", "media/images/"];

/** Throws if `path` is not under one of the writable prefixes. */
export function assertDataPath(path: string): void {
  if (!WRITABLE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    throw new Error(`Refusing to touch path outside ${WRITABLE_PREFIXES.join(" / ")}: "${path}"`);
  }
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  if (!token) {
    throw new GithubApiError("Not signed in.");
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function repoUrl(path: string): string {
  const identity = getRepoIdentity();
  if (!identity) {
    throw new GithubApiError(
      "Repo owner/name could not be determined. If you're testing locally " +
        "(not on a github.io URL), set them once in Settings.",
    );
  }
  return `${API_ROOT}/repos/${identity.owner}/${identity.repo}/${path}`;
}

function contentsUrl(path: string): string {
  return repoUrl(`contents/${path}`);
}

// UTF-8 safe base64 encode/decode, since GitHub's APIs transport file
// bodies as base64.
function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64ToUtf8(base64: string): string {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export interface GetFileResult {
  path: string;
  sha: string;
  content: string; // decoded text
}

export interface DirEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  sha: string;
}

/** GET a file's contents + sha. Returns null if it does not exist (404). */
export async function getFile(path: string): Promise<GetFileResult | null> {
  assertDataPath(path);
  const res = await fetch(
    `${contentsUrl(path)}?ref=${encodeURIComponent(TARGET_BRANCH)}`,
    { headers: authHeaders(), cache: "no-store" },
  );
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new GithubApiError(`GET ${path} failed (HTTP ${res.status}).`, res.status);
  }
  const body = await res.json();
  if (Array.isArray(body)) {
    throw new GithubApiError(`${path} is a directory, not a file.`);
  }
  return {
    path,
    sha: body.sha,
    content: base64ToUtf8(body.content),
  };
}

/** GET a directory listing. Returns [] if it does not exist (404). */
export async function listDir(path: string): Promise<DirEntry[]> {
  assertDataPath(path);
  const res = await fetch(
    `${contentsUrl(path)}?ref=${encodeURIComponent(TARGET_BRANCH)}`,
    { headers: authHeaders(), cache: "no-store" },
  );
  if (res.status === 404) {
    return [];
  }
  if (!res.ok) {
    throw new GithubApiError(`GET ${path} failed (HTTP ${res.status}).`, res.status);
  }
  const body = await res.json();
  if (!Array.isArray(body)) {
    throw new GithubApiError(`${path} is a file, not a directory.`);
  }
  return body.map((entry: { name: string; path: string; type: string; sha: string }) => ({
    name: entry.name,
    path: entry.path,
    type: entry.type === "dir" ? "dir" : "file",
    sha: entry.sha,
  }));
}

/** Convenience: GET + JSON.parse. Returns null if the file does not exist. */
export async function getJsonFile<T>(path: string): Promise<{ data: T; sha: string } | null> {
  const file = await getFile(path);
  if (!file) return null;
  return { data: JSON.parse(file.content) as T, sha: file.sha };
}

export interface FileChange {
  path: string;
  /** File body, or null to delete the path. When `encoding` is "base64" this
   * is already-base64-encoded binary (image uploads); otherwise it's UTF-8
   * text that gets base64-encoded here. */
  content: string | null;
  /** How `content` is encoded. Defaults to "utf8" (text). */
  encoding?: "utf8" | "base64";
}

/**
 * Writes any number of file changes as a SINGLE commit on TARGET_BRANCH,
 * via the Git Data API (blob(s) -> tree -> commit -> ref update) rather
 * than one Contents-API PUT per file. This is what lets the admin app do
 * "one Save = one commit" for however many files a session's edits touch
 * (an event file, data/apps.json, an archive move + delete -- all of it),
 * instead of a commit per action.
 *
 * Fast-forward only: if the branch moved since the caller last read it,
 * the ref update is rejected rather than silently overwriting someone
 * else's concurrent change.
 */
export async function commitFiles(changes: FileChange[], message: string): Promise<void> {
  changes.forEach((change) => assertDataPath(change.path));
  if (changes.length === 0) return;

  const headers = { ...authHeaders(), "Content-Type": "application/json" };

  // no-store is essential here, not just hygiene: this ref is a mutable
  // pointer that moves with every save, and a browser-cached GET serving
  // even a few-seconds-stale sha causes the ref update at the end of this
  // function to be rejected as "not a fast-forward" -- surfacing to the
  // user as a false "someone else may have saved" on two saves done in
  // quick succession, when really it was our own prior save.
  const refRes = await fetch(repoUrl(`git/ref/heads/${encodeURIComponent(TARGET_BRANCH)}`), {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!refRes.ok) {
    throw new GithubApiError(`GET branch ref failed (HTTP ${refRes.status}).`, refRes.status);
  }
  const headSha = (await refRes.json()).object.sha as string;

  const commitRes = await fetch(repoUrl(`git/commits/${headSha}`), {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!commitRes.ok) {
    throw new GithubApiError(`GET base commit failed (HTTP ${commitRes.status}).`, commitRes.status);
  }
  const baseTreeSha = (await commitRes.json()).tree.sha as string;

  const treeEntries = [];
  for (const change of changes) {
    if (change.content === null) {
      treeEntries.push({ path: change.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const encoded = change.encoding === "base64" ? change.content : utf8ToBase64(change.content);
    const blobRes = await fetch(repoUrl("git/blobs"), {
      method: "POST",
      headers,
      body: JSON.stringify({ content: encoded, encoding: "base64" }),
    });
    if (!blobRes.ok) {
      throw new GithubApiError(`Create blob for ${change.path} failed (HTTP ${blobRes.status}).`, blobRes.status);
    }
    const blobSha = (await blobRes.json()).sha as string;
    treeEntries.push({ path: change.path, mode: "100644", type: "blob", sha: blobSha });
  }

  const treeRes = await fetch(repoUrl("git/trees"), {
    method: "POST",
    headers,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  });
  if (!treeRes.ok) {
    throw new GithubApiError(`Create tree failed (HTTP ${treeRes.status}).`, treeRes.status);
  }
  const newTreeSha = (await treeRes.json()).sha as string;

  const newCommitRes = await fetch(repoUrl("git/commits"), {
    method: "POST",
    headers,
    body: JSON.stringify({ message, tree: newTreeSha, parents: [headSha] }),
  });
  if (!newCommitRes.ok) {
    throw new GithubApiError(`Create commit failed (HTTP ${newCommitRes.status}).`, newCommitRes.status);
  }
  const newCommitSha = (await newCommitRes.json()).sha as string;

  const updateRefRes = await fetch(repoUrl(`git/refs/heads/${encodeURIComponent(TARGET_BRANCH)}`), {
    method: "PATCH",
    headers,
    body: JSON.stringify({ sha: newCommitSha }),
  });
  if (!updateRefRes.ok) {
    throw new GithubApiError(
      `Publishing the commit failed (HTTP ${updateRefRes.status}) -- someone else may have saved in the ` +
        "meantime. Reload and re-apply your changes.",
      updateRefRes.status,
    );
  }
}
