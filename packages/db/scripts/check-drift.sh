#!/usr/bin/env bash
# CI step "migrations match the schema" (ADR-0007). Green only when drizzle-kit generate exits 0,
# prints its positive literal and writes nothing. The literal matters: on an ambiguous change (a
# rename) drizzle-kit without a TTY prints a prompt error, writes nothing and still exits 0.
# Needs a committed packages/db/drizzle: in a working tree with the folder untracked it is red.
set -uo pipefail

top=$(git rev-parse --show-toplevel) || {
  echo "check-drift.sh must run inside the academy git repository"
  exit 1
}
cd "$top" || exit 1

out=$(pnpm --filter @academy/db run db:generate </dev/null 2>&1)
rc=$?
printf '%s\n' "$out"
status=$(git status --porcelain --untracked-files=all -- packages/db/drizzle)

# A here-string, not a pipe into grep -q: with pipefail an early grep exit could fail the pipe.
if [ "$rc" -eq 0 ] && grep -qF "No schema changes, nothing to migrate" <<< "$out" && [ -z "$status" ]; then
  echo "migrations match the schema"
  exit 0
fi
printf '%s\n' "$status"
echo "schema.ts changed without a migration: run db:generate and commit the result"
exit 1
