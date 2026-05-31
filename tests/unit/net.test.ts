import { isLoopbackHostname, isLoopbackUrl } from "@oligopoly/shared";
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

describe("isLoopbackUrl", () => {
  it("accepts loopback URLs (incl. ports and IPv6)", () => {
    expect(isLoopbackUrl("http://localhost:8787/api/x")).toBe(true);
    expect(isLoopbackUrl("http://127.0.0.1/api/x")).toBe(true);
    expect(isLoopbackUrl("http://[::1]:8787/api/x")).toBe(true);
  });

  it("rejects deployed and malformed URLs", () => {
    expect(isLoopbackUrl("https://oligopoly.online/api/x")).toBe(false);
    expect(isLoopbackUrl("not a url")).toBe(false);
  });
});
