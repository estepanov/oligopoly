import { describe, expect, it } from "vitest";
import {
  createD1Stub,
  requestWithEnv,
} from "../helpers/workerGameplayHarness.js";

/**
 * The dev-login endpoint is a local-development-only convenience. It must be
 * strictly gated to localhost/127.0.0.1 so it can never issue sessions from a
 * deployed origin.
 */
describe("POST /api/auth/dev-login — localhost gating", () => {
  it("rejects requests from non-local hosts with 403 (auth.forbidden)", async () => {
    const db = createD1Stub();
    const res = await requestWithEnv(
      "https://oligopoly.online/api/auth/dev-login",
      {
        method: "POST",
        body: { username: "attacker" },
        db,
      },
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("auth.forbidden");
  });

  it("rejects an invalid body with 400", async () => {
    const db = createD1Stub();
    const res = await requestWithEnv("http://localhost/api/auth/dev-login", {
      method: "POST",
      body: { notUsername: true },
      db,
    });
    expect(res.status).toBe(400);
  });
});
