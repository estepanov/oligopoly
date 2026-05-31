/**
 * True for loopback hostnames (`localhost` / `127.0.0.1` / IPv6 `::1`).
 *
 * `URL.hostname` returns IPv6 literals wrapped in brackets (e.g. `"[::1]"`), so
 * those are stripped before comparison. This is the single source of truth for
 * "is this a local origin", shared by the worker's request gate and the web's
 * dev-login affordance so the two never drift.
 */
export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
