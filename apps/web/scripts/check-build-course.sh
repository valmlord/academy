#!/usr/bin/env bash
# Checks that `next build` traced nothing from course/ into its output (ADR-0009, layer 4):
#   N1: no apps/web/.next/**/*.nft.json lists a file under <repo>/course/;
#   N2: the standalone output has no course/ directory.
# Run after `pnpm build`. Output ids never start with a bare verdict token.
set -euo pipefail

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

status=0
next_dir=apps/web/.next
if [ ! -d "$next_dir" ]; then
  echo "N0 FAIL $next_dir does not exist; run pnpm build first"
  exit 1
fi

stderr_file=$(mktemp)
trap 'rm -f "$stderr_file"' EXIT
listed=$(node apps/web/scripts/nft-course-paths.mjs "$next_dir" course 2> "$stderr_file") || {
  echo "N1 FAIL the trace scan failed"
  cat "$stderr_file"
  exit 1
}
read_line=$(cat "$stderr_file")
nft_count=${read_line#nft files read: }
if [ -n "$listed" ]; then
  echo "N1 FAIL trace files list course files:"
  printf '%s\n' "$listed"
  status=1
elif [ "$nft_count" -eq 0 ]; then
  echo "N1 FAIL no .nft.json file found under $next_dir"
  status=1
else
  echo "N1 OK nft-files=$nft_count course-files=0"
fi

if [ -e "$next_dir/standalone/course" ]; then
  echo "N2 FAIL $next_dir/standalone/course exists"
  status=1
else
  echo "N2 OK no standalone course directory"
fi

exit "$status"
