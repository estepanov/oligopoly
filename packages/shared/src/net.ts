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

/**
 * True when a URL string points at a loopback origin. The single contract used
 * by the worker's local-only request gate and the web's dev-login affordance,
 * so UI visibility and the worker's 403 can't drift. Returns false for malformed
 * URLs.
 */
export function isLoopbackUrl(url: string): boolean {
  try {
    return isLoopbackHostname(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * True when a browser `Origin` header value points at a loopback dev server
 * (`http(s)://localhost|127.0.0.1|::1` with any port). Used by the worker CORS
 * middleware so local Vite ports and `127.0.0.1` hosts work without listing
 * every combination in `ALLOWED_ORIGINS`.
 */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}
