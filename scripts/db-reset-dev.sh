#!/usr/bin/env bash

set -euo pipefail

local_d1_state_dir="packages/worker/.wrangler/state/v3/d1"

if [ -d "$local_d1_state_dir" ]; then
  echo "Removing local D1 state from $local_d1_state_dir"
  rm -rf "$local_d1_state_dir"
else
  echo "No local D1 state found at $local_d1_state_dir"
fi

pnpm run db:migrate:dev
