import type { MiddlewareHandler } from "hono";

type BanCacheBindings = {
  KV?: Pick<KVNamespace, "get">;
};

type BanCacheVariables = {
  userId?: string;
};

export const banCacheMiddleware: MiddlewareHandler<{
  Bindings: BanCacheBindings;
  Variables: BanCacheVariables;
}> = async (c, next) => {
  if (!c.env?.KV) {
    await next();
    return;
  }

  const subject = c.get("userId");
  if (!subject) {
    await next();
    return;
  }

  const banFlag = await c.env.KV.get(`ban:${subject}`);
  if (banFlag !== null) {
    return c.json({ error: "account_banned" }, 403);
  }

  await next();
};
