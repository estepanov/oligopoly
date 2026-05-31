import { isLoopbackHostname } from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

describe("isLoopbackHostname", () => {
  it("accepts loopback hosts (incl. bracketed IPv6)", () => {
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("[::1]")).toBe(true);
  });

  it("rejects non-loopback hosts", () => {
    expect(isLoopbackHostname("oligopoly.online")).toBe(false);
    expect(isLoopbackHostname("127.0.0.2")).toBe(false);
    expect(isLoopbackHostname("")).toBe(false);
  });
});
