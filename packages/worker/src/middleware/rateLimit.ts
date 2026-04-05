import type { MiddlewareHandler } from "hono";

type RateLimitTarget = "auth" | "read" | "write";

type RateLimitBindings = {
  KV?: Pick<KVNamespace, "get">;
};

type RateLimitVariables = {
  userId?: string;
};

const AUTH_PATH_PREFIX = "/api/auth/";

const toValue = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const isAuthPath = (path: string) => path.startsWith(AUTH_PATH_PREFIX);

const isReadMethod = (method: string) => method === "GET";

const getRateLimitInfo = (
  c: Parameters<
    MiddlewareHandler<{
      Bindings: RateLimitBindings;
      Variables: RateLimitVariables;
    }>
  >[0],
  path: string,
  method: string,
): { target: RateLimitTarget; identifier: string | null } => {
  const subject = c.get("userId") ?? null;
  const ip = toValue(c.req.header("cf-connecting-ip"));

  if (isAuthPath(path) && !subject) {
    return { target: "auth", identifier: ip };
  }

  if (isReadMethod(method)) {
    return { target: "read", identifier: subject };
  }

  return { target: "write", identifier: subject };
};

export const rateLimitMiddleware: MiddlewareHandler<{
  Bindings: RateLimitBindings;
  Variables: RateLimitVariables;
}> = async (c, next) => {
  if (!c.env?.KV) {
    await next();
    return;
  }

  const { target, identifier } = getRateLimitInfo(c, c.req.path, c.req.method);

  if (!identifier) {
    await next();
    return;
  }

  const key = `ratelimit:${target}:${identifier}`;
  const isLimited = await c.env.KV.get(key);
  if (isLimited !== null) {
    return c.json({ error: "rate_limit_exceeded" }, 429);
  }

  await next();
};
