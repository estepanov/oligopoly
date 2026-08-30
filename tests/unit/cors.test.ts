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
  const allowed = ["http://localhost:5173"];

  it("allows configured origins", () => {
    expect(isCorsOriginAllowed("http://localhost:5173", allowed)).toBe(true);
  });

  it("allows loopback origins not listed in ALLOWED_ORIGINS", () => {
    expect(isCorsOriginAllowed("http://127.0.0.1:5191", allowed)).toBe(true);
  });

  it("rejects deployed origins", () => {
    expect(isCorsOriginAllowed("https://oligopoly.online", allowed)).toBe(
      false,
    );
  });
});
