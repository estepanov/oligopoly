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
- Build `validation` and `shared` packages before running integration tests that import from them: `pnpm run ci:build`.
- The worker exports a Hono `app` object as default; integration tests can call `app.request()` directly without running the server.
- Cloudflare API credentials (account ID, API token) are **not required** for local development — Wrangler's local mode emulates all bindings.
- You must create `.env` from `.env.example` (`cp .env.example .env`) before running dev servers. The defaults are sufficient for local dev.
- D1 migrations (`pnpm run db:migrate:dev`) must be applied before the worker can serve lobby/game/auth requests. If you get `duplicate column name` errors, reset with `pnpm run db:reset:dev`.
- Auth uses WebAuthn passkeys — there is no guest login. To test authenticated API endpoints, insert test users and sessions directly into D1 via `wrangler d1 execute`.
- `pnpm run test:e2e` currently has no test files and exits with code 1 — this is expected and not a failure.

### Agent push guardrail (Cursor / Claude / Codex)

- You must run `pnpm run ci:local` and get a clean pass before every `git push`.
- When `core.hooksPath` is `.githooks`, the repository `pre-push` hook runs `pnpm run ci:local` (canonical check order is defined in `package.json` scripts).
- Never bypass the guardrail in normal workflow. `SKIP_LOCAL_CI_GUARDRAIL=1` is emergency-only and requires explicit human instruction in the task prompt.

### Lint / Format / Typecheck / Test

```
pnpm run lint        # Biome check (lint + format + imports)
pnpm run lint:fix    # Biome check with auto-fix
pnpm run format      # Biome format (write)
pnpm run typecheck   # TypeScript project references build
pnpm run test:unit   # Vitest — unit tests
pnpm run test:integration  # Vitest — integration tests
pnpm run test:e2e    # Vitest — e2e tests
```

## Planning docs as required implementation context

The root planning/rules markdown files are **authoritative context** for feature work and must be actively used:

- `oligopoly_technical_plan.md` — canonical technical architecture, contracts, and phased implementation plan.
- `oligopoly_game_rules.md` — canonical gameplay behavior, lobby/game rules, and product semantics.
- `oligopoly_dev_guide.md` — local development workflow and command-level execution guidance.

### Required workflow for implementation tasks

When implementing, reviewing, or refactoring gameplay/runtime behavior:

1. Read relevant sections of `oligopoly_technical_plan.md` and `oligopoly_game_rules.md` before coding.
2. Treat these docs as default source-of-truth unless a higher-priority instruction in the prompt explicitly overrides them.
3. If code changes alter behavior/contracts described in those docs, update the impacted sections in the same change set (or explicitly document why no doc update is needed).
4. Keep naming and terminology aligned with these docs (for example: lobby/admin/co-admin/syndicate/trustworthiness wording).
5. For ambiguous requirements, prefer the stricter interpretation that preserves determinism, server authority, and schema-backed contracts.

### PR/documentation quality gate

Before finalizing a task, verify and note:

- Which sections of `oligopoly_technical_plan.md` informed the implementation.
- Which sections of `oligopoly_game_rules.md` were validated against behavior.
- Whether either file required updates, and exactly what changed.

If no updates were needed, state that explicitly in the final summary.
