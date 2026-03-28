import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const packageDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: "src",
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  envDir: path.resolve(packageDir, "../../"),
  resolve: {
    alias: {
      "@": path.resolve(packageDir, "src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [path.join(packageDir, "src/test-setup.ts")],
    // `root` is `src`, so patterns are relative to `packages/web/src`
    include: ["**/*.{test,spec}.{ts,tsx}"],
    globals: true,
  },
});
