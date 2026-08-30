import { isLoopbackUrl } from "@oligopoly/shared";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173"];

type CorsBindings = {
  ALLOWED_ORIGINS?: string;
};

/** Parse `ALLOWED_ORIGINS` (comma-separated) with a local-dev default. */
export function parseAllowedOrigins(env?: string): string[] {
  if (!env) {
    return [...DEFAULT_ALLOWED_ORIGINS];
  }
  return env
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** True when an `Origin` header may be reflected in CORS responses. */
export function isCorsOriginAllowed(
  origin: string,
  allowed: string[],
): boolean {
  return allowed.includes(origin) || isLoopbackUrl(origin);
}

export const corsMiddleware: MiddlewareHandler<{ Bindings: CorsBindings }> =
  cors({
    origin: (origin, c) => {
      if (!origin) {
        return "";
      }
      return isCorsOriginAllowed(
        origin,
        parseAllowedOrigins(c.env?.ALLOWED_ORIGINS),
      )
        ? origin
        : "";
    },
  });
