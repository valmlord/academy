#!/usr/bin/env bash
# CI step "applied migrations are append-only" (pull requests only, ADR-0007). Drizzle 0.45 stores
# a hash per migration but never compares it, so an edited merged migration would never run again.
# Runs on the PR merge commit: HEAD^1 is the base, HEAD^2 must be the PR head ($PR_HEAD_SHA).
set -uo pipefail

: "${PR_HEAD_SHA:?PR_HEAD_SHA must be the pull request head sha}"
parent_order="expected the pull request merge commit with the PR head as second parent (is actions/checkout fetch-depth >= 2?)"

top=$(git rev-parse --show-toplevel) || {
  echo "check-append-only.sh must run inside a git repository"
  exit 1
}
cd "$top" || exit 1

# Proves the parent order instead of assuming it: a wrong order would compare against the PR itself.
second_parent=$(git rev-parse --verify --quiet "HEAD^2") || {
  echo "$parent_order"
  exit 1
}
if [ "$second_parent" != "$PR_HEAD_SHA" ]; then
  echo "$parent_order"
  exit 1
fi

# meta/_journal.json is left out: every new migration appends to it (residual risk in ADR-0007).
changed=$(git diff --name-status --diff-filter=DMR "HEAD^1" HEAD -- \
  'packages/db/drizzle/*.sql' 'packages/db/drizzle/meta/*_snapshot.json') || {
  echo "git diff between the merge commit and its base failed"
  exit 1
}
if [ -n "$changed" ]; then
  printf '%s\n' "$changed"
  echo "merged migrations must not be edited, deleted or renamed: add a new migration instead"
  exit 1
fi
echo "applied migrations are append-only"
