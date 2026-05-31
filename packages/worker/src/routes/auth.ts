import { zValidator } from "@hono/zod-validator";
import {
  AuthErrorKeys,
  type AuthSessionResponse,
  DevLoginInputSchema,
  LoginOptionsInputSchema,
  LoginVerifyInputSchema,
  RegisterOptionsInputSchema,
  RegisterVerifyInputSchema,
} from "@oligopoly/validation";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  VerifiedAuthenticationResponse,
  VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { Hono } from "hono";
import { isLocalDevRequest } from "../lib/localDev.js";

type Bindings = {
  DB?: D1Database;
  KV?: KVNamespace;
  WEBAUTHN_RP_ID?: string;
  WEBAUTHN_RP_NAME?: string;
  WEBAUTHN_ORIGIN?: string;
};

type Variables = {
  userId?: string;
};

export const authRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRpId(c: { env?: Bindings }): string {
  return c.env?.WEBAUTHN_RP_ID ?? "localhost";
}

function getRpName(c: { env?: Bindings }): string {
  return c.env?.WEBAUTHN_RP_NAME ?? "Oligopoly Online";
}

function getExpectedOrigin(c: { env?: Bindings }): string {
  return c.env?.WEBAUTHN_ORIGIN ?? "http://localhost:5173";
}

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CHALLENGE_TTL_SECONDS = 300; // 5 minutes

/**
 * Prepared statements that bootstrap a new user plus its companion rows
 * (visibility / rank / trustworthiness). Returned (not executed) so callers can
 * include them in their own atomic `db.batch(...)` alongside path-specific rows
 * (e.g. a passkey credential for registration, or just a session for
 * dev-login). Single source of truth for the "new user" shape so register and
 * dev-login stay consistent when the schema changes.
 */
function provisionNewUserStatements(
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
        "INSERT INTO trustworthiness (user_id, score, last_updated_at) VALUES (?, 7, ?)",
      )
      .bind(userId, now),
  ];
}

/**
 * Mint a session for a user: the `auth_sessions` INSERT plus expired-session
 * cleanup, returned as prepared statements so callers batch them atomically
 * alongside any path-specific rows, together with the standard session response
 * payload. Single source of truth so register / login / dev-login can't drift.
 */
function issueAuthSession(
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

interface CredentialRow {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  device_type: string;
  backed_up: number;
  transports: string | null;
  created_at: number;
}

// ---------------------------------------------------------------------------
// POST /register/options — generate registration challenge
// ---------------------------------------------------------------------------
authRoutes.post(
  "/register/options",
  zValidator("json", RegisterOptionsInputSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid request body", details: result.error.flatten() },
        400,
      );
    }
  }),
  async (c) => {
    const db = c.env?.DB;
    const kv = c.env?.KV;
    if (!db || !kv) {
      return c.json({ error: AuthErrorKeys.DB_NOT_CONFIGURED }, 500);
    }

    const { username } = c.req.valid("json");

    // Check if username is already taken
    const existing = await db
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(username)
      .first<{ id: string }>();
    if (existing) {
      return c.json({ error: AuthErrorKeys.USERNAME_TAKEN }, 409);
    }

    const options = await generateRegistrationOptions({
      rpName: getRpName(c),
      rpID: getRpId(c),
      userName: username,
      userDisplayName: username,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    // Store challenge in KV with TTL
    await kv.put(
      `webauthn:challenge:register:${options.challenge}`,
      JSON.stringify({ username }),
      { expirationTtl: CHALLENGE_TTL_SECONDS },
    );

    return c.json(options);
  },
);

// ---------------------------------------------------------------------------
// POST /register/verify — verify registration and create user + session
// ---------------------------------------------------------------------------
authRoutes.post(
  "/register/verify",
  zValidator("json", RegisterVerifyInputSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid request body", details: result.error.flatten() },
        400,
      );
    }
  }),
  async (c) => {
    const db = c.env?.DB;
    const kv = c.env?.KV;
    if (!db || !kv) {
      return c.json({ error: AuthErrorKeys.DB_NOT_CONFIGURED }, 500);
    }

    const { username, credential } = c.req.valid("json");
    const rpId = getRpId(c);
    const expectedOrigin = getExpectedOrigin(c);

    // Verify the registration response
    let verification: VerifiedRegistrationResponse;
    let matchedChallenge: string | undefined;
    try {
      verification = await verifyRegistrationResponse({
        response: credential as unknown as RegistrationResponseJSON,
        expectedOrigin,
        expectedRPID: rpId,
        expectedChallenge: async (challenge: string) => {
          const stored = await kv.get(
            `webauthn:challenge:register:${challenge}`,
          );
          if (!stored) return false;
          const data = JSON.parse(stored) as { username: string };
          if (data.username === username) {
            matchedChallenge = challenge;
            return true;
          }
          return false;
        },
        requireUserVerification: false,
      });
    } catch {
      return c.json({ error: AuthErrorKeys.VERIFICATION_FAILED }, 400);
    }

    if (!verification.verified || !verification.registrationInfo) {
      return c.json({ error: AuthErrorKeys.REGISTRATION_FAILED }, 400);
    }

    const {
      credential: regCredential,
      credentialDeviceType,
      credentialBackedUp,
    } = verification.registrationInfo;

    // Check username not taken (race condition guard)
    const existing = await db
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(username)
      .first<{ id: string }>();
    if (existing) {
      return c.json({ error: AuthErrorKeys.USERNAME_TAKEN }, 409);
    }

    const userId = generateId();
    const now = Date.now();

    const credId = generateId();
    const publicKeyHex = Array.from(regCredential.publicKey)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const transportsJson = regCredential.transports
      ? JSON.stringify(regCredential.transports)
      : null;

    const session = issueAuthSession(db, userId, username, now);

    // Batch all inserts so they succeed or fail atomically
    await db.batch([
      ...provisionNewUserStatements(db, userId, username, now),
      db
        .prepare(
          "INSERT INTO passkey_credentials (id, user_id, credential_id, public_key, counter, device_type, backed_up, transports, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          credId,
          userId,
          regCredential.id,
          publicKeyHex,
          regCredential.counter,
          credentialDeviceType,
          credentialBackedUp ? 1 : 0,
          transportsJson,
          now,
        ),
      ...session.statements,
    ]);

    // Clean up used challenge (single-use per WebAuthn protocol)
    if (matchedChallenge) {
      await kv
        .delete(`webauthn:challenge:register:${matchedChallenge}`)
        .catch(() => {});
    }

    return c.json(session.response);
  },
);

// ---------------------------------------------------------------------------
// POST /login/options — generate authentication challenge
// ---------------------------------------------------------------------------
authRoutes.post(
  "/login/options",
  zValidator("json", LoginOptionsInputSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid request body", details: result.error.flatten() },
        400,
      );
    }
  }),
  async (c) => {
    const db = c.env?.DB;
    const kv = c.env?.KV;
    if (!db || !kv) {
      return c.json({ error: AuthErrorKeys.DB_NOT_CONFIGURED }, 500);
    }

    const { username } = c.req.valid("json");
    const rpId = getRpId(c);

    let allowCredentials:
      | { id: string; transports?: AuthenticatorTransportFuture[] }[]
      | undefined;

    if (username) {
      // Find user and their credentials
      const user = await db
        .prepare("SELECT id FROM users WHERE username = ?")
        .bind(username)
        .first<{ id: string }>();

      if (user) {
        const creds = await db
          .prepare(
            "SELECT credential_id, transports FROM passkey_credentials WHERE user_id = ?",
          )
          .bind(user.id)
          .all<{ credential_id: string; transports: string | null }>();

        allowCredentials = creds.results.map((cred) => ({
          id: cred.credential_id,
          transports: cred.transports
            ? (JSON.parse(cred.transports) as AuthenticatorTransportFuture[])
            : undefined,
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: rpId,
      allowCredentials,
      userVerification: "preferred",
    });

    // Store challenge in KV
    await kv.put(
      `webauthn:challenge:login:${options.challenge}`,
      JSON.stringify({ username: username ?? null }),
      { expirationTtl: CHALLENGE_TTL_SECONDS },
    );

    return c.json(options);
  },
);

// ---------------------------------------------------------------------------
// POST /login/verify — verify authentication and create session
// ---------------------------------------------------------------------------
authRoutes.post(
  "/login/verify",
  zValidator("json", LoginVerifyInputSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid request body", details: result.error.flatten() },
        400,
      );
    }
  }),
  async (c) => {
    const db = c.env?.DB;
    const kv = c.env?.KV;
    if (!db || !kv) {
      return c.json({ error: AuthErrorKeys.DB_NOT_CONFIGURED }, 500);
    }

    const { credential } = c.req.valid("json");
    const rpId = getRpId(c);
    const expectedOrigin = getExpectedOrigin(c);

    // Find the credential in our database
    const credRow = await db
      .prepare("SELECT * FROM passkey_credentials WHERE credential_id = ?")
      .bind(credential.id)
      .first<CredentialRow>();

    if (!credRow) {
      return c.json({ error: AuthErrorKeys.CREDENTIAL_NOT_FOUND }, 404);
    }

    // Reconstruct the WebAuthn credential for verification
    const publicKeyBytes = new Uint8Array(
      (credRow.public_key.match(/.{1,2}/g) ?? []).map((byte) =>
        Number.parseInt(byte, 16),
      ),
    );

    const storedTransports = credRow.transports
      ? (JSON.parse(credRow.transports) as AuthenticatorTransportFuture[])
      : undefined;

    let verification: VerifiedAuthenticationResponse;
    let matchedLoginChallenge: string | undefined;
    try {
      verification = await verifyAuthenticationResponse({
        response: credential as unknown as AuthenticationResponseJSON,
        expectedChallenge: async (challenge: string) => {
          const stored = await kv.get(`webauthn:challenge:login:${challenge}`);
          if (stored !== null) {
            matchedLoginChallenge = challenge;
            return true;
          }
          return false;
        },
        expectedOrigin,
        expectedRPID: [rpId],
        credential: {
          id: credRow.credential_id,
          publicKey: publicKeyBytes,
          counter: credRow.counter,
          transports: storedTransports,
        },
        requireUserVerification: false,
      });
    } catch {
      return c.json({ error: AuthErrorKeys.VERIFICATION_FAILED }, 400);
    }

    if (!verification.verified) {
      return c.json({ error: AuthErrorKeys.INVALID_CREDENTIAL }, 401);
    }

    // Update counter
    await db
      .prepare(
        "UPDATE passkey_credentials SET counter = ? WHERE credential_id = ?",
      )
      .bind(verification.authenticationInfo.newCounter, credRow.credential_id)
      .run();

    // Find the user
    const user = await db
      .prepare("SELECT id, username FROM users WHERE id = ?")
      .bind(credRow.user_id)
      .first<{ id: string; username: string }>();

    if (!user) {
      return c.json({ error: AuthErrorKeys.CREDENTIAL_NOT_FOUND }, 404);
    }

    // Create session
    const now = Date.now();
    const session = issueAuthSession(db, user.id, user.username, now);
    await db.batch(session.statements);

    // Clean up used challenge (single-use per WebAuthn protocol)
    if (matchedLoginChallenge) {
      await kv
        .delete(`webauthn:challenge:login:${matchedLoginChallenge}`)
        .catch(() => {});
    }

    return c.json(session.response);
  },
);

// ---------------------------------------------------------------------------
// POST /dev-login — local-development-only passwordless sign-in.
//
// Auth in this product is WebAuthn passkeys with no guest login. Passkeys are
// impractical to register for every local seat when testing multiplayer, so
// this endpoint issues a session for a username WITHOUT a credential. It is
// strictly gated to localhost (mirroring the local-only AI step endpoint via
// the shared `isLocalDevRequest` helper) and is never reachable from deployed
// origins.
// ---------------------------------------------------------------------------
authRoutes.post(
  "/dev-login",
  zValidator("json", DevLoginInputSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid request body", details: result.error.flatten() },
        400,
      );
    }
  }),
  async (c) => {
    if (!isLocalDevRequest(c.req.url)) {
      return c.json({ error: AuthErrorKeys.FORBIDDEN }, 403);
    }

    const db = c.env?.DB;
    if (!db) {
      return c.json({ error: AuthErrorKeys.DB_NOT_CONFIGURED }, 500);
    }

    const { username } = c.req.valid("json");
    const now = Date.now();

    const existing = await db
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(username)
      .first<{ id: string }>();

    const userId = existing?.id ?? generateId();
    const session = issueAuthSession(db, userId, username, now);

    // Provision the user (companion rows match the WebAuthn registration flow)
    // only when new, and issue the session — in a single atomic batch.
    await db.batch([
      ...(existing
        ? []
        : provisionNewUserStatements(db, userId, username, now)),
      ...session.statements,
    ]);

    return c.json(session.response);
  },
);

// ---------------------------------------------------------------------------
// GET /session — get current session info
// ---------------------------------------------------------------------------
authRoutes.get("/session", async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: AuthErrorKeys.DB_NOT_CONFIGURED }, 500);
  }

  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: AuthErrorKeys.SESSION_NOT_FOUND }, 401);
  }

  const token = authHeader.slice(7);
  const now = Date.now();
  const session = await db
    .prepare(
      "SELECT s.user_id, s.expires_at, u.username FROM auth_sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ?",
    )
    .bind(token, now)
    .first<{ user_id: string; expires_at: number; username: string }>();

  if (!session) {
    return c.json({ error: AuthErrorKeys.SESSION_NOT_FOUND }, 401);
  }

  return c.json({
    userId: session.user_id,
    username: session.username,
    expiresAt: session.expires_at,
  });
});

// ---------------------------------------------------------------------------
// POST /logout — destroy current session
// ---------------------------------------------------------------------------
authRoutes.post("/logout", async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: AuthErrorKeys.DB_NOT_CONFIGURED }, 500);
  }

  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ ok: true });
  }

  const token = authHeader.slice(7);
  await db
    .prepare("DELETE FROM auth_sessions WHERE token = ?")
    .bind(token)
    .run();

  return c.json({ ok: true });
});
