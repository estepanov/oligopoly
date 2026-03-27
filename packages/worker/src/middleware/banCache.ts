import type { MiddlewareHandler } from "hono";

type BanCacheBindings = {
  KV?: Pick<KVNamespace, "get">;
};

const toValue = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

export const banCacheMiddleware: MiddlewareHandler<{
  Bindings: BanCacheBindings;
}> = async (c, next) => {
  if (!c.env?.KV) {
    await next();
    return;
  }

  const subject = toValue(c.req.header("x-subject"));
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
