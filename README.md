# Oligopoly

> *A game of markets, alliances, and permanent commitment*

Loosely based on the ULTRA-famous board game where players roll dice and move along a square board buying/trading properties and paying rent — now set in the world of modern industry, with syndicates, negotiations, and strategic market control layered on top.

## Getting Started

**Prerequisites:** Node.js >= 20, pnpm >= 9

### 1. Install dependencies

```sh
pnpm install
```

### 2. Apply database migrations

This is required before running the dev server — the local D1 database starts empty.

```sh
pnpm db:migrate:dev
```

### 3. Start the dev servers

```sh
pnpm dev
```

This starts both the Cloudflare Worker API (port 8787) and the Vite web app (port 5173) in parallel.

You can also run them individually:

```sh
pnpm dev:worker   # Worker API only
pnpm dev:web      # Web app only
```

### Other commands

| Command | Description |
|---|---|
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm lint` | Lint with Biome |
| `pnpm lint:fix` | Lint and auto-fix |
| `pnpm test` | Run all tests |
| `pnpm test:unit` | Unit tests only |
| `pnpm test:integration` | Integration tests only |
| `pnpm test:e2e` | End-to-end tests only |
