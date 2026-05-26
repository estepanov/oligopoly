#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
	echo "Skipping git hook installation outside a git work tree."
	exit 0
fi

if [[ "${CI:-}" == "true" ]]; then
	echo "Skipping git hook installation in CI."
	exit 0
fi

existing_hooks_path="$(git config --local --get core.hooksPath || true)"
if [[ -n "$existing_hooks_path" && "$existing_hooks_path" != ".githooks" ]]; then
	echo "Overriding existing core.hooksPath ($existing_hooks_path) with .githooks."
fi

git config --local core.hooksPath .githooks
echo "Configured git hooks path to .githooks (replaces default .git/hooks lookup)."
