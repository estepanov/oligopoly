import type { MiddlewareHandler } from "hono";

type AdminBindings = {
  DB?: D1Database;
  KV?: KVNamespace;
};

type AdminVariables = {
  userId?: string;
  userRole?: string;
};

export const requireAdmin: MiddlewareHandler<{
  Bindings: AdminBindings;
  Variables: AdminVariables;
}> = async (c, next) => {
  const role = c.get("userRole");

  if (role === undefined) {
    return c.json({ error: "Auth adapter not configured" }, 401);
  }

  if (role !== "global_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  await next();
};
