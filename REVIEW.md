# Review Guidelines

## Pre-commit checks

Before committing, verify the following pass locally:

```
pnpm run lint        # Biome lint + format + import ordering
pnpm run typecheck   # TypeScript project references build
pnpm run test:unit   # Unit tests
pnpm run test:integration  # Integration tests
```

## HTTP status codes

- **401** — Use for any unauthenticated request (missing auth context, no `x-subject` header, auth adapter not configured). Every authenticated route in the codebase follows this pattern. Do **not** use 501 for missing auth.
- **403** — Use when the user is authenticated but lacks the required role or permission (e.g., not a `global_admin`).
- **501** — Reserve for features that are genuinely not implemented (e.g., hosted-only stubs like impersonate, session invalidation, or the `/api/auth/*` catch-all).
- **404** — Use when a specific resource (user, game, lobby) is not found.
- **500** — Use when a required binding (DB, KV) is not configured.

## Input validation

- Always validate and sanitize query parameters. Numeric params like `page` should fall back to safe defaults for non-numeric, negative, or zero input (see `parsePage` in `packages/worker/src/routes/admin.ts`).
- Escape SQL `LIKE` wildcards (`%`, `_`, `\`) in user-supplied search strings to prevent unintended pattern matching.
- Verify target resources exist before performing mutations (e.g., check user exists before banning).

## Performance

- Prefer `Promise.all()` for independent I/O operations (DB queries, KV reads) instead of sequential `await` in loops.
- Flag any database queries or KV reads inside loops as candidates for parallelization.

## Naming and style

- DB columns use `snake_case`; JSON API responses use `camelCase`. Map between them explicitly in route handlers.
- Follow existing patterns in the codebase. Check nearby files for conventions before introducing new ones.
- Use parameterized queries for all SQL — never interpolate user input into query strings.

## Testing

- Integration tests should cover: auth gating (401/403), happy path, 404 for missing resources, and side effects (KV writes, audit log inserts).
- Test stubs (D1, KV) are simplified — they don't execute real SQL. Note this limitation when asserting on query behavior like `LIKE` filtering or `COUNT(*)`.

## Planning docs

See `AGENTS.md` for the full workflow around `oligopoly_technical_plan.md` and `oligopoly_game_rules.md`. Any behavior or contract changes must be reflected in those docs.
