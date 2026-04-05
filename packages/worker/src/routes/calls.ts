import {
  CallsErrorKeys,
  CallsSessionTokenResponseSchema,
} from "@oligopoly/validation";
import { Hono } from "hono";

type Bindings = {
  CF_CALLS_APP_ID?: string;
  CF_CALLS_APP_SECRET?: string;
};

type Variables = {
  userId?: string;
};

export const callsRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

const getSubject = (c: {
  get: (key: string) => string | undefined;
}): string | null => {
  return c.get("userId") ?? null;
};

// POST /token — Exchange credentials with Cloudflare Calls API and return session token
callsRoutes.post("/token", async (c) => {
  const subject = getSubject(c);
  if (!subject) {
    return c.json({ error: CallsErrorKeys.AUTH_REQUIRED }, 401);
  }

  const appId = c.env?.CF_CALLS_APP_ID;
  const appSecret = c.env?.CF_CALLS_APP_SECRET;

  if (!appId || !appSecret) {
    return c.json({ error: CallsErrorKeys.NOT_CONFIGURED }, 501);
  }

  let response: Response;
  try {
    response = await fetch(
      `https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(appId)}/sessions/new`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${appSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
  } catch {
    return c.json({ error: CallsErrorKeys.TOKEN_FAILED }, 502);
  }

  if (!response.ok) {
    return c.json({ error: CallsErrorKeys.TOKEN_FAILED }, 502);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return c.json({ error: CallsErrorKeys.UPSTREAM_INVALID }, 502);
  }

  const parsed = CallsSessionTokenResponseSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: CallsErrorKeys.UPSTREAM_INVALID }, 502);
  }

  return c.json(parsed.data);
});
