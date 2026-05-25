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

git config --local core.hooksPath .githooks
echo "Configured git hooks path to .githooks"
