import { TRUSTWORTHINESS_DEFAULT } from "@oligopoly/shared";
import type { AuthSessionResponse } from "@oligopoly/validation";

/** Bearer-token sessions live 30 days. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Random 16-byte hex id (users, credentials, session rows). */
export function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Random 32-byte hex session token. */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Prepared statements that bootstrap a new user plus its companion rows
 * (visibility / rank / trustworthiness). Returned (not executed) so callers can
 * include them in their own atomic `db.batch(...)` alongside path-specific rows
 * (e.g. a passkey credential for registration, or just a session for
 * dev-login). Single source of truth for the "new user" shape so register and
 * dev-login stay consistent when the schema changes.
 */
export function provisionNewUserStatements(
  db: D1Database,
  userId: string,
  username: string,
  now: number,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        "INSERT INTO users (id, username, locale, theme_preference, created_at, updated_at, role) VALUES (?, ?, 'en', 'system', ?, ?, 'user')",
      )
      .bind(userId, username, now, now),
    db.prepare("INSERT INTO user_visibility (user_id) VALUES (?)").bind(userId),
    db
      .prepare(
        "INSERT INTO user_ranks (user_id, tier, rank_points) VALUES (?, 0, 0)",
      )
      .bind(userId),
    db
      .prepare(
        "INSERT INTO trustworthiness (user_id, score, last_updated_at) VALUES (?, ?, ?)",
      )
      .bind(userId, TRUSTWORTHINESS_DEFAULT, now),
  ];
}

/**
 * Mint a session for a user: the `auth_sessions` INSERT plus expired-session
 * cleanup, returned as prepared statements so callers batch them atomically
 * alongside any path-specific rows, together with the standard session response
 * payload. Single source of truth so register / login / dev-login can't drift.
 */
export function issueAuthSession(
  db: D1Database,
  userId: string,
  username: string,
  now: number,
): { statements: D1PreparedStatement[]; response: AuthSessionResponse } {
  const token = generateToken();
  const expiresAt = now + SESSION_TTL_MS;
  return {
    statements: [
      db
        .prepare(
          "INSERT INTO auth_sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(generateId(), userId, token, expiresAt, now),
      db
        .prepare(
          "DELETE FROM auth_sessions WHERE user_id = ? AND expires_at < ?",
        )
        .bind(userId, now),
    ],
    response: { token, userId, username, expiresAt },
  };
}
