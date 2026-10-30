#!/usr/bin/env bash
# PostToolUse hook for Edit and Write: after every edit, run the whole suite and an LLM review of
# the whole diff, so nothing slips through.
set -euo pipefail
cd "$CLAUDE_PROJECT_DIR"
mkdir -p .review
make test
git diff HEAD | claude -p "You are a senior reviewer. Review this diff for bugs, style and architecture. Reply LGTM or list the problems." --model opus > .review/last.txt
if ! grep -q '^LGTM' .review/last.txt; then
  cat .review/last.txt >&2
  exit 2
fi
