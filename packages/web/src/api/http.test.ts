import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { type ApiError, getJson } from "./http";

describe("getJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses successful JSON with schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ hello: "world" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );

    const schema = z.object({ hello: z.string() });
    const data = await getJson("http://example.com/x", schema);
    expect(data).toEqual({ hello: "world" });
  });

  it("throws ApiError on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
          }),
        ),
      ),
    );

    const schema = z.object({ error: z.string() });
    await expect(
      getJson("http://example.com/missing", schema),
    ).rejects.toMatchObject({
      name: "ApiError",
      message: "Not found",
      status: 404,
    } satisfies Partial<ApiError>);
  });
});
