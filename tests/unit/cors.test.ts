import { describe, expect, it } from "vitest";
import {
  isCorsOriginAllowed,
  parseAllowedOrigins,
} from "../../packages/worker/src/middleware/cors";

describe("parseAllowedOrigins", () => {
  it("defaults to localhost:5173 when env is unset", () => {
    expect(parseAllowedOrigins()).toEqual(["http://localhost:5173"]);
    expect(parseAllowedOrigins(undefined)).toEqual(["http://localhost:5173"]);
  });

  it("trims and splits comma-separated origins", () => {
    expect(
      parseAllowedOrigins("http://localhost:5173, https://staging.example"),
    ).toEqual(["http://localhost:5173", "https://staging.example"]);
  });

  it("drops empty entries", () => {
    expect(parseAllowedOrigins("http://localhost:5173,,")).toEqual([
      "http://localhost:5173",
    ]);
  });
});

describe("isCorsOriginAllowed", () => {
  const localAllowed = ["http://localhost:5173"];
  const productionAllowed = ["https://oligopoly.online"];
  const localRequest = "http://localhost:8787/api/health";
  const deployedRequest = "https://api.oligopoly.online/api/health";

  it("allows configured origins on any worker host", () => {
    expect(
      isCorsOriginAllowed("http://localhost:5173", localAllowed, localRequest),
    ).toBe(true);
    expect(
      isCorsOriginAllowed(
        "https://oligopoly.online",
        productionAllowed,
        deployedRequest,
      ),
    ).toBe(true);
  });

  it("allows unlisted loopback origins only on a loopback worker", () => {
    expect(
      isCorsOriginAllowed("http://127.0.0.1:5191", localAllowed, localRequest),
    ).toBe(true);
    expect(
      isCorsOriginAllowed(
        "http://127.0.0.1:5191",
        productionAllowed,
        deployedRequest,
      ),
    ).toBe(false);
  });

  it("rejects deployed origins that are not on the allowlist", () => {
    expect(
      isCorsOriginAllowed(
        "https://oligopoly.online",
        localAllowed,
        localRequest,
      ),
    ).toBe(false);
  });
});
