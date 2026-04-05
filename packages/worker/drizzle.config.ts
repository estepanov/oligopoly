import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  // Output dir for generated migrations — applied via wrangler (see migrations_dir in wrangler.toml).
  out: "./drizzle",
  driver: "d1-http",
  // Credentials are only needed for `drizzle-kit studio` and `drizzle-kit push`.
  // For local dev, use `db:migrate:local` (wrangler --local) instead.
  // Requires: CLOUDFLARE_ACCOUNT_ID, CF_D1_DATABASE_ID_DEV, CLOUDFLARE_API_TOKEN in .env
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    databaseId: process.env.CF_D1_DATABASE_ID_DEV ?? "",
    token: process.env.CLOUDFLARE_API_TOKEN ?? "",
  },
});
