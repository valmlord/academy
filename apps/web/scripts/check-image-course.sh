#!/usr/bin/env bash
# Checks that the built web image holds only the learner-visible course files (ADR-0009, layer 3 of the
# leak defence):
#   C1: the files under /app/course equal the host's export listing of course/;
#   C2: no grader file of course/ (checks/, starter/, quiz.yaml; at least 64 bytes) has its bytes anywhere
#       in the image's root filesystem, hashed as root so nothing is skipped;
#   C3: the image sets COURSE_ROOT=/app/course;
#   C4: /app/course holds nothing named checks, starter or quiz.yaml (covers files under 64 bytes).
# Run from anywhere after `docker compose up -d --build --wait`. Output ids never start with a bare verdict
# token, so a judge's vote parser cannot mistake a line for a vote. Runs against the compose project in
# COMPOSE_PROJECT_NAME (default: academy from name:); isolated runs export it. Prints paths and counts,
# never file contents.
set -euo pipefail

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
status=0

# The export listing imports @academy/lesson-schema/schema from dist/.
pnpm exec turbo run build --filter=@academy/lesson-schema > "$scratch/turbo.log" 2>&1 || {
  echo "C0 FAIL could not build @academy/lesson-schema (see turbo output above)"
  cat "$scratch/turbo.log"
  exit 1
}

in_image() {
  docker compose run --rm --no-deps -T --entrypoint sh "$@"
}

# C1
pnpm --filter @academy/web exec tsx scripts/export-course.ts list ../../course | sort > "$scratch/host.txt"
in_image web -c 'cd /app/course && find . -type f | sed "s|^\./||"' | sort > "$scratch/image.txt"
host_count=$(wc -l < "$scratch/host.txt" | tr -d ' ')
if [ "$host_count" -gt 0 ] && cmp -s "$scratch/host.txt" "$scratch/image.txt"; then
  echo "C1 OK files=$host_count"
else
  echo "C1 FAIL /app/course differs from the export listing (host $host_count files); diff host image:"
  diff "$scratch/host.txt" "$scratch/image.txt" || true
  status=1
fi

# C2
node --input-type=module -e '
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
const MIN_BYTES = 64;
const allowed = new Set(readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean));
const graders = new Set();
const learner = new Set();
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
for (const entry of readdirSync("course", { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const rel = path.relative("course", path.join(entry.parentPath, entry.name));
  const parts = rel.split(path.sep);
  if (allowed.has(rel)) learner.add(sha(path.join("course", rel)));
  const isGrader = parts.includes("checks") || parts.includes("starter") || parts.at(-1) === "quiz.yaml";
  if (isGrader && statSync(path.join("course", rel)).size >= MIN_BYTES) graders.add(sha(path.join("course", rel)));
}
for (const hash of graders) if (!learner.has(hash)) console.log(hash);
' "$scratch/host.txt" | sort -u > "$scratch/grader-hashes.txt"
grader_count=$(wc -l < "$scratch/grader-hashes.txt" | tr -d ' ')
c2_rc=0
# shellcheck disable=SC2016 # expanded inside the container
in_image --user root web -c 'find / -xdev -type f -exec sha256sum {} + 2>&1; echo "C2-RC $?"; echo "C2-COUNT $(find / -xdev -type f 2>&1 | wc -l)"' > "$scratch/image-hashes.txt" || c2_rc=$?
other_lines=$(grep -cvE '^([0-9a-f]{64}  /|C2-RC |C2-COUNT )' "$scratch/image-hashes.txt" || true)
hashed=$(grep -cE '^[0-9a-f]{64}  /' "$scratch/image-hashes.txt" || true)
rc_line=$(grep -E '^C2-RC ' "$scratch/image-hashes.txt" || true)
count=$(grep -E '^C2-COUNT ' "$scratch/image-hashes.txt" | sed 's/^C2-COUNT //' || true)
found=$(cut -c1-64 "$scratch/image-hashes.txt" | grep -cFxf "$scratch/grader-hashes.txt" || true)
if [ "$c2_rc" -ne 0 ] || [ "$rc_line" != "C2-RC 0" ] || [ "$other_lines" -ne 0 ] || [ "$grader_count" -eq 0 ] \
  || [ "$hashed" -eq 0 ] || [ "$hashed" != "$count" ] || [ "$found" -ne 0 ]; then
  echo "C2 FAIL compose rc=$c2_rc ${rc_line:-no C2-RC line} other-lines=$other_lines host=$grader_count image=$count hashed=$hashed grader-hashes-found=$found"
  grep -vE '^([0-9a-f]{64}  /|C2-RC |C2-COUNT )' "$scratch/image-hashes.txt" | head -20 || true
  status=1
else
  echo "C2 OK host=$grader_count image=$count hashed=$hashed grader-hashes-found=0"
fi

# C3
# shellcheck disable=SC2016 # expanded inside the container
root=$(in_image web -c 'printf %s "$COURSE_ROOT"')
if [ "$root" = /app/course ]; then
  echo "C3 OK COURSE_ROOT=$root"
else
  echo "C3 FAIL COURSE_ROOT=${root:-unset} (expected /app/course)"
  status=1
fi

# C4
names=$(in_image web -c 'find /app/course \( -name checks -o -name starter -o -name quiz.yaml \)')
if [ -z "$names" ]; then
  echo "C4 OK no checks, starter or quiz.yaml under /app/course"
else
  echo "C4 FAIL grader names under /app/course:"
  printf '%s\n' "$names"
  status=1
fi

exit "$status"
