// Personal Access Token (PAT) auth. GitHub's OAuth/Device Flow endpoints
// (github.com/login/device/code, github.com/login/oauth/access_token) do
// NOT support CORS for any origin -- a hard, years-old limitation on
// GitHub's side (confirmed by testing against a real deployment, not just
// theory). The only ways around it are a server-side relay (this project
// deliberately has no server) or a third-party CORS proxy that would see
// the resulting token pass through (a credential-leak risk we won't take).
//
// A pasted-in fine-grained PAT sidesteps the problem entirely: there is no
// token-exchange step at all, and every call goes straight to
// api.github.com, which DOES support CORS for authenticated requests. See
// SETUP.md for exactly how to generate one (single repo, Contents: read
// and write only, nothing else).

import { getRepoIdentity } from "./config";

const SESSION_TOKEN_KEY = "countdown-scheduler-admin:github-token";

export class AuthError extends Error {}

/** Returns the stored token, if any. Token lives only in sessionStorage --
 * never localStorage, never written to any file, cleared on sign out or
 * when the browser tab closes. */
export function getStoredToken(): string | null {
  return sessionStorage.getItem(SESSION_TOKEN_KEY);
}

export function isSignedIn(): boolean {
  return getStoredToken() !== null;
}

/** Clears the token from sessionStorage. */
export function signOut(): void {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

/**
 * Stores the token, but only after one lightweight authenticated call
 * confirms it's actually valid AND can see this repo -- catches a
 * pasted-wrong/expired/mis-scoped token immediately with a precise error,
 * instead of failing confusingly on the first real save later.
 */
export async function signInWithToken(token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new AuthError("Paste a token first.");
  }

  const identity = getRepoIdentity();
  const checkUrl = identity
    ? `https://api.github.com/repos/${identity.owner}/${identity.repo}`
    : "https://api.github.com/user";

  const res = await fetch(checkUrl, {
    headers: {
      Authorization: `Bearer ${trimmed}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (res.status === 401) {
    throw new AuthError("GitHub rejected that token -- check you copied it correctly.");
  }
  if (res.status === 404 && identity) {
    throw new AuthError(
      `That token can't see ${identity.owner}/${identity.repo} -- check it's scoped to this repo.`,
    );
  }
  if (!res.ok) {
    throw new AuthError(`Couldn't verify the token (HTTP ${res.status}).`);
  }

  sessionStorage.setItem(SESSION_TOKEN_KEY, trimmed);
}
