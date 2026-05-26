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

desired_hooks_path=".githooks"
existing_hooks_path="$(git config --local --get core.hooksPath || true)"

if [[ -n "$existing_hooks_path" && "$existing_hooks_path" != "$desired_hooks_path" ]]; then
	if [[ "${FORCE_GIT_HOOKS_PATH:-0}" != "1" ]]; then
		echo "Detected existing core.hooksPath=$existing_hooks_path. Leaving it unchanged."
		echo "Set FORCE_GIT_HOOKS_PATH=1 and rerun prepare to override with $desired_hooks_path."
		exit 0
	fi

	echo "Overriding existing core.hooksPath ($existing_hooks_path) with $desired_hooks_path (FORCE_GIT_HOOKS_PATH=1)."
fi

git config --local core.hooksPath "$desired_hooks_path"
echo "Configured git hooks path to $desired_hooks_path (replaces default .git/hooks lookup)."
