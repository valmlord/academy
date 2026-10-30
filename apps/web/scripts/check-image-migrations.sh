#!/usr/bin/env bash
# Checks that the built web image applies the migrations at startup (ADR-0007 Consequences):
#   I1: the running stack's database holds one applied migration per journal entry;
#   I2: a web container pointed at an unreachable database exits non-zero, names the connect stage
#       and the hint, and never prints the password.
# Run from anywhere after `docker compose up -d --build --wait`. Output ids never start with a bare
# verdict token, so a judge's vote parser cannot mistake a line for a vote.
set -euo pipefail

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

journal=packages/db/drizzle/meta/_journal.json
status=0

expected=$(node -e 'const j = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); console.log(j.entries.length)' "$journal") || {
  echo "I1 FAIL could not read the journal entries of $journal"
  exit 1
}
applied_rc=0
applied=$(docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM drizzle.__drizzle_migrations"') || applied_rc=$?
applied=$(printf '%s' "$applied" | tr -d '[:space:]')
if [ "$applied_rc" -ne 0 ]; then
  echo "I1 FAIL psql exited with $applied_rc (expected the applied count, $expected)"
  status=1
elif [ "$applied" != "$expected" ]; then
  echo "I1 FAIL applied=$applied expected=$expected (journal entries)"
  status=1
else
  echo "I1 OK applied=$applied"
fi

canary=canary-pass-i2
hint="docker compose up -d --wait db"
run_rc=0
output=$(docker compose run --rm --no-deps -e "DATABASE_URL=postgres://academy:${canary}@db:1/academy" web 2>&1) || run_rc=$?
if [ "$run_rc" -eq 0 ]; then
  echo "I2 FAIL rc=0 (expected a non-zero exit with an unreachable database)"
  status=1
elif ! printf '%s\n' "$output" | grep -qF "MigrationError stage connect"; then
  echo "I2 FAIL rc=$run_rc, output lacks \"MigrationError stage connect\""
  status=1
elif ! printf '%s\n' "$output" | grep -qF "$hint"; then
  echo "I2 FAIL rc=$run_rc, output lacks the connect hint \"$hint\""
  status=1
elif printf '%s\n' "$output" | grep -qF "$canary"; then
  echo "I2 FAIL rc=$run_rc, output contains the password $canary"
  status=1
else
  echo "I2 OK rc=$run_rc"
fi

exit "$status"
