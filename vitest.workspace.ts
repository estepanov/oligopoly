import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineWorkspace } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

const workspaceAliases = {
  "@oligopoly/shared": path.resolve(repoRoot, "packages/shared/src/index.ts"),
  "@oligopoly/validation": path.resolve(
    repoRoot,
    "packages/validation/src/index.ts",
  ),
  "@oligopoly/worker": path.resolve(repoRoot, "packages/worker/src/index.ts"),
};

export default defineWorkspace([
  {
    resolve: {
      alias: workspaceAliases,
    },
    test: {
      name: "unit",
      include: ["tests/unit/**/*.test.ts"],
    },
  },
  {
    resolve: {
      alias: workspaceAliases,
    },
    test: {
      name: "integration",
      include: ["tests/integration/**/*.test.ts"],
    },
  },
  {
    resolve: {
      alias: workspaceAliases,
    },
    test: {
      name: "e2e",
      include: ["tests/e2e/**/*.test.ts"],
    },
  },
]);
