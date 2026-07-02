// GitHub Device Flow (OAuth Device Authorization Grant), implemented
// per GitHub's documented protocol:
//   1. POST /login/device/code with client_id + scope -> device_code,
//      user_code, verification_uri, expires_in, interval.
//   2. Show user_code + verification_uri to the user.
//   3. Poll POST /login/oauth/access_token with the device_code every
//      `interval` seconds until it resolves, is denied, or expires.
//
// TODO: GitHub's device-flow token endpoint has historically required a
// server-side relay for some client types because of CORS. Before relying
// on this in production, re-verify current CORS behavior for public
// OAuth App / GitHub App clients against GitHub's live docs once a real
// Client ID is registered (SETUP.md also flags this as an open check).
// Do not assume it works from a pure static page without testing.

import { getClientId } from "./config";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const SCOPE = "repo";

const SESSION_TOKEN_KEY = "countdown-scheduler-admin:github-token";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface AccessTokenSuccess {
  access_token: string;
  token_type: string;
  scope: string;
}

interface AccessTokenError {
  error: string;
  error_description?: string;
}

export class DeviceFlowError extends Error {}

async function requestDeviceCode(clientId: string): Promise<DeviceCodeResponse> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ client_id: clientId, scope: SCOPE }),
  });
  if (!res.ok) {
    throw new DeviceFlowError(
      `Failed to request device code (HTTP ${res.status}).`,
    );
  }
  return (await res.json()) as DeviceCodeResponse;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollForToken(
  clientId: string,
  deviceCode: string,
  intervalSeconds: number,
  expiresInSeconds: number,
): Promise<string> {
  let interval = intervalSeconds;
  const deadline = Date.now() + expiresInSeconds * 1000;

  while (Date.now() < deadline) {
    await sleep(interval * 1000);

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const body = (await res.json()) as AccessTokenSuccess | AccessTokenError;

    if ("access_token" in body && body.access_token) {
      return body.access_token;
    }

    const errorBody = body as AccessTokenError;
    switch (errorBody.error) {
      case "authorization_pending":
        continue;
      case "slow_down":
        interval += 5;
        continue;
      case "expired_token":
        throw new DeviceFlowError(
          "The device code expired before authorization completed. Please try again.",
        );
      case "access_denied":
        throw new DeviceFlowError("Authorization was denied.");
      default:
        throw new DeviceFlowError(
          errorBody.error_description || errorBody.error || "Unknown device flow error.",
        );
    }
  }

  throw new DeviceFlowError("The device code expired. Please try again.");
}

/**
 * Runs the full Device Flow. `onCodeReady` is called as soon as the
 * user_code / verification_uri are known so the caller can render them
 * (e.g. with a "copy code" button) before polling begins.
 */
export async function startDeviceFlow(
  onCodeReady: (info: DeviceCodeResponse) => void,
): Promise<string> {
  const clientId = getClientId();
  if (!clientId) {
    throw new DeviceFlowError(
      "No GitHub Client ID is set yet. Enter it once under Settings (see SETUP.md).",
    );
  }
  const codeInfo = await requestDeviceCode(clientId);
  onCodeReady(codeInfo);
  const token = await pollForToken(
    clientId,
    codeInfo.device_code,
    codeInfo.interval,
    codeInfo.expires_in,
  );
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  return token;
}

/** Returns the stored token, if any. Token lives only in sessionStorage. */
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
