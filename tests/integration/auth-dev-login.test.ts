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

  it("mints a session on localhost and reuses the user on repeat login", async () => {
    const db = createD1Stub();
    const username = "devplayer";

    const first = await requestWithEnv("http://localhost/api/auth/dev-login", {
      method: "POST",
      body: { username },
      db,
    });
    expect(first.status).toBe(200);
    const b1 = (await first.json()) as {
      token: string;
      userId: string;
      username: string;
      expiresAt: number;
    };
    expect(typeof b1.token).toBe("string");
    expect(b1.token.length).toBeGreaterThan(0);
    expect(b1.username).toBe(username);
    expect(typeof b1.userId).toBe("string");
    expect(b1.expiresAt).toBeGreaterThan(Date.now());

    // Repeat login with the same username must reuse the existing user (no
    // duplicate provisioning) while still issuing a session.
    const second = await requestWithEnv("http://localhost/api/auth/dev-login", {
      method: "POST",
      body: { username },
      db,
    });
    expect(second.status).toBe(200);
    const b2 = (await second.json()) as { userId: string; token: string };
    expect(b2.userId).toBe(b1.userId);
    expect(b2.token.length).toBeGreaterThan(0);
  });
});
