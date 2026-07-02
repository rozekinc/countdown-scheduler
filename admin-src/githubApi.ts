// Thin wrapper around the GitHub REST Contents API, scoped to the data/
// directory only. Every read/write/delete helper in this file must call
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

/** Throws if `path` does not live under data/. No bypass, ever. */
export function assertDataPath(path: string): void {
  if (!path.startsWith("data/")) {
    throw new Error(`Refusing to touch path outside data/: "${path}"`);
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

function contentsUrl(path: string): string {
  const identity = getRepoIdentity();
  if (!identity) {
    throw new GithubApiError(
      "Repo owner/name could not be determined. If you're testing locally " +
        "(not on a github.io URL), set them once in Settings.",
    );
  }
  return `${API_ROOT}/repos/${identity.owner}/${identity.repo}/contents/${path}`;
}

// UTF-8 safe base64 encode/decode, since GitHub's Contents API transports
// file bodies as base64.
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
    { headers: authHeaders() },
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
    { headers: authHeaders() },
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

/**
 * PUT (create or update) a JSON file. Pass the current `sha` when updating
 * an existing file (fetch it via getFile() first); omit it when creating.
 */
export async function putFile(
  path: string,
  content: string,
  message: string,
  sha?: string,
): Promise<string> {
  assertDataPath(path);
  const res = await fetch(contentsUrl(path), {
    method: "PUT",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      content: utf8ToBase64(content),
      branch: TARGET_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    throw new GithubApiError(`PUT ${path} failed (HTTP ${res.status}).`, res.status);
  }
  const body = await res.json();
  return body.content.sha as string;
}

/** DELETE a file. Requires its current sha (fetch via getFile() first). */
export async function deleteFile(
  path: string,
  message: string,
  sha: string,
): Promise<void> {
  assertDataPath(path);
  const res = await fetch(contentsUrl(path), {
    method: "DELETE",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      sha,
      branch: TARGET_BRANCH,
    }),
  });
  if (!res.ok) {
    throw new GithubApiError(`DELETE ${path} failed (HTTP ${res.status}).`, res.status);
  }
}

/** Convenience: GET + JSON.parse. Returns null if the file does not exist. */
export async function getJsonFile<T>(path: string): Promise<{ data: T; sha: string } | null> {
  const file = await getFile(path);
  if (!file) return null;
  return { data: JSON.parse(file.content) as T, sha: file.sha };
}

/** Convenience: JSON.stringify + putFile with a short, descriptive message. */
export async function putJsonFile(
  path: string,
  data: unknown,
  message: string,
  sha?: string,
): Promise<string> {
  return putFile(path, JSON.stringify(data, null, 2) + "\n", message, sha);
}
