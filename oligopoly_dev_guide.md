# Oligopoly - Developer Guide

> Developer workflow for this repository.
> Deployment-specific implementations are intentionally out of scope here.

---

## Table of Contents

1. [What This Guide Covers](#what-this-guide-covers)
2. [Quick Start](#quick-start)
3. [Repository Layout](#repository-layout)
4. [Daily Workflow](#daily-workflow)
5. [Route and Handler Conventions](#route-and-handler-conventions)
6. [Profile Visibility Development Guide](#profile-visibility-development-guide)
7. [Negotiation and Charter Development Guide](#negotiation-and-charter-development-guide)
8. [Gameplay Registry Maintenance](#gameplay-registry-maintenance)
9. [Testing Guide](#testing-guide)
10. [CI and Release Workflow](#ci-and-release-workflow)
11. [Docs Quality Gates](#docs-quality-gates)
12. [Troubleshooting](#troubleshooting)

---

## What This Guide Covers

This guide is scoped to this repository.

In scope:

- Engine and shared types
- Validation contracts
- Worker routes and Durable Objects
- Web client
- CI and package release

---

## Quick Start

### Prerequisites

```bash
# Node.js 20+
node --version

# pnpm 9+
pnpm --version

# Wrangler 3+
wrangler --version
```

### Install

```bash
git clone git@github.com:your-org/oligopoly.git
cd oligopoly
pnpm install
```

### Configure environment

```bash
cp .env.example .env
```

Minimum local values:

```bash
APP_NAME="Oligopoly Online"
APP_DOMAIN=oligopoly.online

CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CF_D1_DATABASE_ID_DEV=
CF_KV_NAMESPACE_ID_DEV=
CF_ANALYTICS_DATASET=oligopoly_events

VITE_API_URL=http://localhost:8787
VITE_WS_URL=ws://localhost:8787
VITE_APP_ENV=development
VITE_APP_NAME="Oligopoly Online"
VITE_APP_DOMAIN=oligopoly.online
```

### Run

```bash
pnpm run db:migrate:dev
pnpm run dev
```

### Local multiplayer workflow

Local multiplayer uses the same Worker, D1/KV, Durable Object, and Vite runtime as online play:

1. Start the stack with `pnpm run dev`.
2. Open separate browser profiles or different browsers for each human player. Do not rely on multiple private/incognito windows from the same browser profile because they may share the same local storage session.
3. Register or seed distinct users, then create a lobby at `http://localhost:5173`.
4. For solo vs AI, create one human lobby and add at least one AI slot before starting.
5. For mixed local play, add other local users and optional AI slots.
6. Mark every human player ready, then start the game and keep each browser connected to the game WebSocket.

### Local two-player testing without passkeys

Registering a WebAuthn passkey for every local seat is impractical, so a
**local-development-only** quick login is available (gated to `localhost`/
`127.0.0.1` on the worker and shown only when `VITE_APP_ENV=development`):

1. Start the stack with `pnpm run dev`.
2. Open `http://localhost:5173/login` and use **"Dev login (no passkey)"** with a
   username (the account is created on demand). Use a **normal window** for one
   player and an **Incognito window** for the other so the two sessions don't
   share local storage.
3. Player 1 creates a lobby; Player 2 joins; both mark ready; Player 1 starts.
   Both windows navigate to the game and receive live updates over WebSocket.

This is purely a local convenience — production auth remains WebAuthn passkeys
with no guest login. For scripted/API testing you can still seed users and use
the legacy `x-subject` header, or insert sessions directly via
`wrangler d1 execute`.

### AI player setup

AI players work locally with the default deterministic rules engine and do not require an external API key. The rules-based AI is the baseline runtime used for lobby AI seats, turn-timeout takeovers, auction participation, and kicked-player replacements.

To test AI seats locally:

1. Start the stack with `pnpm run dev`.
2. Sign in, open `http://localhost:5173/lobbies`, and create a lobby.
3. Set the AI player count in the lobby creation form and choose one personality: `loyalist`, `opportunist`, or `disruptor`.
4. For solo vs AI, keep exactly one human player and at least one AI slot; for mixed games, keep total human plus AI seats between 2 and 6.
5. Mark every human player ready and start the lobby. `GameRoom` runs AI turns automatically after game scheduling and game action updates; no client-side AI stepping is needed.

`.env.example` includes `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, budget limits, app attribution headers, and timeout settings as the reserved contract for optional LLM-assisted AI. Leave `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` empty for local deterministic AI. In deployed environments, OpenRouter requests must use strict Zero Data Retention routing, deny provider data collection, validate structured JSON responses, and fall back to deterministic AI whenever the provider is unavailable, over budget, invalid, or illegal for the current game state.

### Validate

```bash
pnpm run ci:local
```

---

## Repository Layout

```text
packages/
  validation/
  shared/
  worker/
  web/
tests/
  unit/
  integration/
  e2e/
```

Ownership summary:

| Area | Package |
|---|---|
| API and WS schemas | `packages/validation` |
| Engine and rules | `packages/shared` |
| Routes, middleware, durable runtime | `packages/worker` |
| Client app and API client | `packages/web` |

---

## Daily Workflow

1. Pull latest main.
2. Create a feature branch.
3. Run tests in watch mode while coding.
4. Update docs when changing contracts or gameplay registries.
5. Run full checks before PR.

```bash
git checkout main
git pull
git checkout -b feature/your-change

pnpm run test:unit --watch

pnpm run ci:local
```

Definition of done:

- Contract changes reflected in `packages/validation`
- Engine behavior changes reflected in tests
- Registry ID changes reflected in `oligopoly_game_rules.md` appendix
- Technical plan and this guide updated where relevant

---

## Route and Handler Conventions

Directory conventions:

- Route modules: `packages/worker/src/routes/*.ts`
- Middleware: `packages/worker/src/middleware/*.ts`
- Durable Objects: `packages/worker/src/durable/*.ts`

Naming conventions:

- Use `*Routes` for `new Hono<AppEnv>()` modules.
- Keep handler logic in route modules unless reused by multiple routes; then extract to `services/`.
- Do not use a mixed `handlers` and `routes` path convention for the same endpoint family.

Example route module skeleton:

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ExampleInputSchema } from "@oligopoly/validation";
import type { AppEnv } from "../types";

export const exampleRoutes = new Hono<AppEnv>();

exampleRoutes.post(
  "/",
  zValidator("json", ExampleInputSchema),
  async (c) => {
    const input = c.req.valid("json");
    return c.json({ ok: true, input });
  }
);
```

---

## Profile Visibility Development Guide

Final endpoint policy:

- `GET /api/users/:id` -> public-safe, visibility-filtered profile
- `GET /api/users/:id/viewer` -> auth required, viewer-aware profile
- `GET /api/users/me` -> auth required, owner private profile

### Visibility defaults

Current defaults are preserved:

- public: `rank`, `careerStats`, `achievements`, `recentGames`, `favoriteSector`
- authenticated: `onlineStatus`, `lastSeen`
- always returned: `username`, `avatarUrl`

### Settings model

```typescript
export type VisibilitySetting = "public" | "authenticated" | "private";

export interface ProfileVisibility {
  rank: VisibilitySetting;
  careerStats: VisibilitySetting;
  achievements: VisibilitySetting;
  recentGames: VisibilitySetting;
  onlineStatus: VisibilitySetting;
  lastSeen: VisibilitySetting;
  favoriteSector: VisibilitySetting;
}

export interface UpdateUserSettingsInput {
  profileVisibility?: Partial<ProfileVisibility>;
}
```

### Serialization rule

Implement a shared utility used by all three endpoints:

```typescript
serializeProfileForAudience(profile, audience, visibility)
```

Audience values:

- `public`
- `viewer`
- `owner`

Required behavior:

- `owner` includes private account fields.
- `viewer` includes `public` plus fields set to `authenticated`.
- `public` includes only fields set to `public`.

### Required tests

- Public endpoint hides `authenticated` and `private` fields.
- Viewer endpoint includes only `authenticated` and `public` fields.
- Owner endpoint always includes private fields.
- Partial visibility updates merge correctly.

---

## Negotiation and Charter Development Guide

### Required engine capabilities

- Negotiation thread creation (cost 1 AP)
- Thread expiry after 3 rounds
- Binding contract signing and enforcement
- Handshake logging with manual breach handling
- Trustworthiness scoring and restrictions
- Founding charter validation and storage

### Required trustworthiness rules

- Start at 7
- Clamp range 0..10
- Binding contracts disabled at 0..4
- Handshake breach penalty: -2
- Expired unresolved thread penalty: -1 for each party

### Required charter rules

- Governance model: `asset_weighted` or `equal_vote`
- Deadlock resolution: `public_dice_roll`
- Revenue split sums to 100
- Contribution weights sum to 100
- Dissolution requires unanimous vote
- Dissolution trust penalty defaults to 2 per member

### Typed error keys

Must exist in validation package and localization maps:

- `negotiation.binding_not_allowed_low_trust`
- `negotiation.contract_invalid_terms`
- `negotiation.contract_tile_not_owned`
- `negotiation.thread_expired`
- `negotiation.action_blocked_by_contract`
- `negotiation.charter_invalid_split`
- `negotiation.charter_invalid_weights`
- `negotiation.syndicate_dissolution_requires_unanimous_vote`

---

## Gameplay Registry Maintenance

Public gameplay IDs are defined in `oligopoly_game_rules.md` appendix.

When adding or renaming a rule/card/achievement:

1. Update game rules appendix with canonical ID.
2. Update shared config registry in `packages/shared/src/config`.
3. Update validation enums/schemas if exposed in API.
4. Update technical plan canonical registry tables.
5. Add migration if IDs are persisted in D1.

Never change an ID in place once published.

Deprecation protocol:

- Mark old ID as deprecated.
- Add explicit migration mapping.
- Remove only in a major version.

---

## Testing Guide

### Unit

```bash
pnpm run test:unit
```

Focus:

- Engine determinism
- Visibility serialization
- Negotiation and contract enforcement
- Registry ID integrity

### Integration

```bash
pnpm run test:integration
```

Focus:

- Route schema conformance
- Status codes for profile endpoints
- Typed errors

### E2E

```bash
pnpm run test:e2e
```

Focus:

- Profile settings toggles reflected in profile endpoints
- Negotiation lifecycle from create to enforcement/expiry

### Contract parity check

- Ensure technical plan registry IDs and game rules appendix IDs match.

---

## CI and Release Workflow

PR CI scope:

- Run `pnpm run ci:local`

Release scope:

- Run `pnpm run build`
- Run `pnpm run ci:verify`
- Publish `@oligopoly/shared` and `@oligopoly/validation`

Local guardrail:

- `pnpm run ci:local` mirrors CI checks (canonical check order is defined in `package.json` scripts).
- When `core.hooksPath` is `.githooks`, the repository `pre-push` hook runs `pnpm run ci:local` automatically and blocks the push on failure.

Example release sequence:

Keep release verification aligned with workflow by running build once, then verify checks, then publish.

```bash
pnpm run build
pnpm run ci:verify   # release verification gate
pnpm -r --filter "@oligopoly/shared" --filter "@oligopoly/validation" publish --access public --provenance --no-git-checks
```

Deployment procedures for environment-specific integrations are out of scope for this guide.

---

## Docs Quality Gates

### Anchor check

- Every table-of-contents anchor resolves to a heading.
- Every local file link points to an existing file.

### Consistency check

- Profile route policy matches technical plan.
- Registry IDs in guide references match game rules appendix.
- No placeholder text in handoff-critical sections.

---

## Troubleshooting

### Type errors after contract changes

```bash
pnpm run typecheck
```

Fix shared contracts first, then downstream imports.

### Route mismatch in tests

- Ensure route table in technical plan and route modules match.
- Re-run integration tests after updating schemas.

### Visibility behavior not matching expected audience

- Confirm `serializeProfileForAudience` is used consistently by all profile endpoints.
- Confirm endpoint tests cover public, viewer, and owner audiences.

### Registry mismatch failures

- Compare technical plan registry tables with game rules appendix IDs.
- Ensure config and persistence enums use canonical IDs.

### `db:migrate:dev` fails with `duplicate column name`

This means your local Wrangler D1 state already contains a legacy migration history in `d1_migrations`. In that state, the local table already has a column before the current hand-written migration chain reaches new migration.

If you do not need to keep the current local D1 data, reset the local Miniflare database and re-apply the tracked migrations:

```bash
pnpm run db:reset:dev
```

This only removes local state under `packages/worker/.wrangler/state/v3/d1`. It does not affect any remote Cloudflare D1 database.
