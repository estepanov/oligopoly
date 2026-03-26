# Agents

## Cursor Cloud specific instructions

### Overview

Oligopoly Online is a multiplayer board game built as a pnpm monorepo with four packages:
- `@oligopoly/validation` — Zod schemas for HTTP/WS payloads and error keys
- `@oligopoly/shared` — Game engine, config registries, trustworthiness math
- `@oligopoly/worker` — Hono API on Cloudflare Workers (local dev via Wrangler/Miniflare)
- `@oligopoly/web` — Vite frontend client

### Running services

All dev commands are documented in `package.json` scripts and `oligopoly_dev_guide.md`.

| Service | Command | Port |
|---|---|---|
| Worker (backend API) | `pnpm run dev:worker` | 8787 |
| Web (frontend) | `pnpm run dev:web` | 5173 |
| Both together | `pnpm run dev` | 8787 + 5173 |

Wrangler emulates D1, KV, and R2 locally via Miniflare — no Cloudflare account needed for local dev.

### Key caveats

- After `pnpm install`, you must approve build scripts. The root `package.json` includes `pnpm.onlyBuiltDependencies` for `esbuild`, `sharp`, and `workerd` to handle this non-interactively.
- Build `validation` and `shared` packages before running integration tests that import from them: `pnpm run --filter @oligopoly/validation build && pnpm run --filter @oligopoly/shared build`.
- The worker exports a Hono `app` object as default; integration tests can call `app.request()` directly without running the server.
- Cloudflare API credentials (account ID, API token) are **not required** for local development — Wrangler's local mode emulates all bindings.

### Lint / Typecheck / Test

```
pnpm run lint        # ESLint (flat config)
pnpm run typecheck   # TypeScript project references build
pnpm run test:unit   # Vitest — unit tests
pnpm run test:integration  # Vitest — integration tests
pnpm run test:e2e    # Vitest — e2e tests
```
