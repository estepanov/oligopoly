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
 * Reads the interim `x-subject` header, looks up the user in D1, and
 * populates `userId` and `userRole` on the Hono context.
 *
 * If the header is absent or the user is not found the middleware does
 * nothing — downstream handlers decide how to react (401, 501, etc.).
 */
export const authSubjectMiddleware: MiddlewareHandler<{
  Bindings: AuthSubjectBindings;
  Variables: AuthSubjectVariables;
}> = async (c, next) => {
  const subject = toValue(c.req.header("x-subject"));

  if (!subject || !c.env?.DB) {
    await next();
    return;
  }

  const row = await c.env.DB.prepare("SELECT id, role FROM users WHERE id = ?")
    .bind(subject)
    .first<{ id: string; role: string }>();

  if (row) {
    c.set("userId", row.id);
    c.set("userRole", row.role);
  }

  await next();
};
