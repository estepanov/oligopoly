import { describe, expect, it } from "vitest";
import app from "../../packages/worker/src/index.js";

describe("e2e smoke", () => {
  it("GET /api/health returns ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json<{ status: string; service: string }>();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("oligopoly-worker");
  });
});
