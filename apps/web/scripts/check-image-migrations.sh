#!/usr/bin/env bash
# Checks that the built web image applies the migrations at startup (ADR-0007 Consequences):
#   I1: the running stack's database holds one applied migration per journal entry;
#   I2: a web container pointed at an unreachable database exits non-zero, names the connect stage
#       and the hint, and never prints the password;
#   I3, I3b, I3c: a web container with an empty secret, Better Auth's public default secret, or any
#       BETTER_AUTH_SECRETS exits non-zero before migrating (ADR-0008 item 9) and never prints the value.
# Run from anywhere after `docker compose up -d --build --wait`. Output ids never start with a bare
# verdict token, so a judge's vote parser cannot mistake a line for a vote.
# Runs against the compose project in COMPOSE_PROJECT_NAME (default: academy from name:); isolated runs
# export it.
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

# Runs the web image with the extra -e arguments and an unreachable database, then checks the output:
# expect_secret_refusal <id> <text the output must contain> <value it must not contain> [-e VAR=value]...
expect_secret_refusal() {
  local id=$1 expected=$2 secret_value=$3
  shift 3
  local out rc=0
  out=$(docker compose run --rm --no-deps -e "DATABASE_URL=postgres://academy:canary-pass-i3@db:1/academy" "$@" web 2>&1) || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "$id FAIL rc=0 (expected a non-zero exit with a refused secret)"
    status=1
  elif ! printf '%s\n' "$out" | grep -qF "$expected"; then
    echo "$id FAIL rc=$rc, output lacks \"$expected\""
    status=1
  elif printf '%s\n' "$out" | grep -qF "MigrationError"; then
    # The database is unreachable: a migration error means the secret was checked after migrating.
    echo "$id FAIL rc=$rc, output contains MigrationError (the secret must be checked first)"
    status=1
  elif printf '%s\n' "$out" | grep -qF "canary-pass-i3"; then
    echo "$id FAIL rc=$rc, output contains the database password"
    status=1
  elif [ -n "$secret_value" ] && printf '%s\n' "$out" | grep -qF "$secret_value"; then
    echo "$id FAIL rc=$rc, output contains the refused value"
    status=1
  else
    echo "$id OK rc=$rc"
  fi
}

expect_secret_refusal I3 "InvalidAuthSecretError" "" -e "BETTER_AUTH_SECRET="
default_secret=better-auth-secret-12345678901234567890
expect_secret_refusal I3b "InvalidAuthSecretError: BETTER_AUTH_SECRET is Better Auth's public default" "$default_secret" -e "BETTER_AUTH_SECRET=$default_secret"
expect_secret_refusal I3c "BETTER_AUTH_SECRETS is not supported" "canary-secrets-i3c" -e "BETTER_AUTH_SECRETS=1:canary-secrets-i3c"

exit "$status"
