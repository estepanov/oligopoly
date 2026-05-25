#!/usr/bin/env bash
set -euo pipefail

if ! command -v pnpm >/dev/null 2>&1; then
	echo "pnpm is required to run local CI checks." >&2
	exit 1
fi

echo "Running local CI parity checks..."
echo "1/5 Build validation/shared"
pnpm run --filter @oligopoly/validation build && pnpm run --filter @oligopoly/shared build

echo "2/5 Typecheck"
pnpm run typecheck

echo "3/5 Lint"
pnpm run lint

echo "4/5 Unit tests with coverage"
pnpm run test:unit --coverage

echo "5/5 Integration tests"
pnpm run test:integration

echo "Local CI checks passed."
