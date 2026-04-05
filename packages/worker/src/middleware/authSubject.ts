import type { MiddlewareHandler } from "hono";

type AuthSubjectBindings = {
  DB?: D1Database;
};

type AuthSubjectVariables = {
  userId?: string;
  userRole?: string;
};

const toValue = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

/**
 * Resolves the authenticated user from one of two sources (in priority order):
 *
 * 1. `Authorization: Bearer <token>` — looks up a valid, non-expired session
 *    in the `auth_sessions` table and resolves the associated user.
 * 2. `x-subject` header (legacy) — directly looks up the user by ID. Kept for
 *    backwards compatibility with integration tests and tooling.
 *
 * If neither header is present or the lookup fails, the middleware does
 * nothing — downstream handlers decide how to react (401, 501, etc.).
 */
export const authSubjectMiddleware: MiddlewareHandler<{
  Bindings: AuthSubjectBindings;
  Variables: AuthSubjectVariables;
}> = async (c, next) => {
  if (!c.env?.DB) {
    // No DB available — trust x-subject header directly (dev/test only).
    // In production, DB is always present and the header is validated below.
    const subject = toValue(c.req.header("x-subject"));
    if (subject) {
      c.set("userId", subject);
    }
    await next();
    return;
  }

  const db = c.env.DB;

  // 1. Try Bearer token from Authorization header
  const authHeader = toValue(c.req.header("authorization"));
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const session = await db
      .prepare(
        "SELECT s.user_id, u.role FROM auth_sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ?",
      )
      .bind(token, Date.now())
      .first<{ user_id: string; role: string }>();

    if (session) {
      c.set("userId", session.user_id);
      c.set("userRole", session.role);
      await next();
      return;
    }
  }

  // 2. Fall back to legacy x-subject header
  const subject = toValue(c.req.header("x-subject"));
  if (subject) {
    const row = await db
      .prepare("SELECT id, role FROM users WHERE id = ?")
      .bind(subject)
      .first<{ id: string; role: string }>();
    if (row) {
      c.set("userId", row.id);
      c.set("userRole", row.role);
    }
  }

  await next();
};
