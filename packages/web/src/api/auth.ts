import {
  type AuthSessionInfo,
  AuthSessionInfoSchema,
  type AuthSessionResponse,
  AuthSessionResponseSchema,
} from "@oligopoly/validation";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { env } from "../env";
import { requestJson } from "./http";

const AUTH_TOKEN_KEY = "oligopoly_auth_token";

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // storage unavailable
  }
}

export function clearStoredToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // storage unavailable
  }
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** POST /api/auth/register/options */
export async function fetchRegisterOptions(
  username: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const res = await fetch(`${env.apiUrl}/api/auth/register/options`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ??
        `Registration options failed (${res.status})`,
    );
  }
  return res.json() as Promise<PublicKeyCredentialCreationOptionsJSON>;
}

/** POST /api/auth/register/verify */
export async function fetchRegisterVerify(
  username: string,
  credential: unknown,
): Promise<AuthSessionResponse> {
  return requestJson(
    `${env.apiUrl}/api/auth/register/verify`,
    AuthSessionResponseSchema,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, credential }),
    },
  );
}

/** POST /api/auth/login/options */
export async function fetchLoginOptions(
  username?: string,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const res = await fetch(`${env.apiUrl}/api/auth/login/options`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ??
        `Login options failed (${res.status})`,
    );
  }
  return res.json() as Promise<PublicKeyCredentialRequestOptionsJSON>;
}

/**
 * POST /api/auth/dev-login — local-development-only passwordless sign-in.
 * The worker gates this to localhost; it is never available in deployment.
 */
export async function fetchDevLogin(
  username: string,
): Promise<AuthSessionResponse> {
  return requestJson(
    `${env.apiUrl}/api/auth/dev-login`,
    AuthSessionResponseSchema,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    },
  );
}

/** POST /api/auth/login/verify */
export async function fetchLoginVerify(
  credential: unknown,
): Promise<AuthSessionResponse> {
  return requestJson(
    `${env.apiUrl}/api/auth/login/verify`,
    AuthSessionResponseSchema,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    },
  );
}

/** GET /api/auth/session */
export async function fetchSession(): Promise<AuthSessionInfo> {
  return requestJson(`${env.apiUrl}/api/auth/session`, AuthSessionInfoSchema, {
    headers: authHeaders(),
  });
}

/** POST /api/auth/logout */
export async function fetchLogout(): Promise<void> {
  await fetch(`${env.apiUrl}/api/auth/logout`, {
    method: "POST",
    headers: authHeaders(),
  });
  clearStoredToken();
}
