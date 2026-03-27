# Testing Oligopoly Worker API Routes

## Environment Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Build validation and shared packages (required before tests):
   ```bash
   pnpm run --filter @oligopoly/validation build
   pnpm run --filter @oligopoly/shared build
   ```

3. Apply D1 migrations locally (auto-confirms in non-interactive mode):
   ```bash
   echo "Y" | pnpm run db:migrate:dev
   ```

4. Start the worker dev server (runs on port 8787):
   ```bash
   pnpm run dev:worker
   ```
   Wrangler/Miniflare emulates D1, KV, and R2 locally — no Cloudflare credentials needed.

## Auth Model

Routes requiring authentication use the `x-subject` header as the user identity.
- Include `-H "x-subject: <user-id>"` in curl requests for authenticated routes
- Omitting the header on auth-required routes returns HTTP 501 `{"error": "lobby.auth_required"}`
- This is an interim model; a real auth adapter will replace it later

## Testing API Routes via curl

Example: Create a lobby:
```bash
curl -s -X POST http://localhost:8787/api/lobbies \
  -H "Content-Type: application/json" \
  -H "x-subject: test-user-1" \
  -d '{"name":"Test Lobby","maxPlayers":4,"isPrivate":false,"optionalRuleIds":[]}'
```

## Running Integration Tests

```bash
pnpm run test:integration
```

Integration tests use in-memory D1/KV stubs and call `app.request()` directly — no running server needed.

## Lint & Typecheck

```bash
pnpm run lint        # Biome check
pnpm run lint:fix    # Biome with auto-fix
pnpm run typecheck   # TypeScript project references build
```

Pre-existing lint warnings exist in `packages/web/` — these are not related to worker changes.
