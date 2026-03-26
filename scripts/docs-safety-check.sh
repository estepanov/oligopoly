#!/usr/bin/env bash

set -euo pipefail

shopt -s nullglob globstar

FILES=(./*.md ./docs/**/*.md)

if ((${#FILES[@]} == 0)); then
  echo "✓ No findings"
  exit 0
fi

HAS_FINDINGS=0

check_pattern() {
  local label="$1"
  local pattern="$2"
  local case_flag="${3:-}"
  local -a rg_args=(--line-number --with-filename --pcre2 "$pattern")

  if [[ -n "$case_flag" ]]; then
    rg_args+=("$case_flag")
  fi

  if MATCHES="$(rg "${rg_args[@]}" "${FILES[@]}")"; then
    HAS_FINDINGS=1
    echo "Found ${label}:"
    echo "${MATCHES}"
    echo
  fi
}

check_pattern "blocked secret keyword(s)" "AUTH_SECRET|SESSION_SECRET|PRIVATE_KEY|smtp://|sendgrid|mailgun|postmark" "-i"
check_pattern "possible secret assignment(s)" "[A-Z_]+=.*[a-zA-Z0-9+/]{20,}"
check_pattern "hosted-only deployment reference(s)" "fly\\.io|railway|render\\.com" "-i"

if ((HAS_FINDINGS)); then
  exit 1
fi

echo "✓ No findings"
