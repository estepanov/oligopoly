import { Hono } from "hono";

type Bindings = {
  CF_CALLS_APP_ID?: string;
  CF_CALLS_APP_SECRET?: string;
};

export const callsRoutes = new Hono<{ Bindings: Bindings }>();

const getSubject = (c: {
  req: { header: (name: string) => string | undefined };
}): string | null => {
  const subject = c.req.header("x-subject")?.trim();
  return subject || null;
};

// POST /token — Exchange credentials with Cloudflare Calls API and return session token
callsRoutes.post("/token", async (c) => {
  const subject = getSubject(c);
  if (!subject) {
    return c.json({ error: "calls.auth_required" }, 401);
  }

  const appId = c.env?.CF_CALLS_APP_ID;
  const appSecret = c.env?.CF_CALLS_APP_SECRET;

  if (!appId || !appSecret) {
    return c.json({ error: "calls_not_configured" }, 501);
  }

  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/apps/${appId}/sessions/new`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    },
  );

  if (!response.ok) {
    return c.json({ error: "calls_token_failed" }, 502);
  }

  const data = await response.json<{
    sessionId: string;
    sessionToken: string;
  }>();
  return c.json({ sessionId: data.sessionId, sessionToken: data.sessionToken });
});
