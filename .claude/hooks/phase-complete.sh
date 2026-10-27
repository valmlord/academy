#!/bin/bash
# Stop: validate the pipeline completion gates.
# - No active pipeline -> allow.
# - stop_hook_active=true (we already blocked once this turn) -> allow, so the session never loops.
# - Phase waits on a human (human_wait_phases, e.g. LEARN "learner") -> allow with a reminder.
# - Otherwise require: phase=done, each judge round unanimous for the tier, notify run, clean
#   tree, not on a protected branch for issue-linked work.

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cfg() { python3 "$DIR/.claude/hooks/lib/cfg.py" "$@"; }
INPUT=$(cat)
STATE_FILE="$DIR/.claude/pipeline_state.json"
[ ! -f "$STATE_FILE" ] && exit 0

ACTIVE_FLAG=$(printf '%s' "$INPUT" | python3 "$DIR/.claude/hooks/lib/hookio.py" field stop_hook_active)
TIER=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['tier'])" "$STATE_FILE" 2>/dev/null)
PHASE=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['phase'])" "$STATE_FILE" 2>/dev/null)

for p in $(cfg get human_wait_phases); do
  if [ "$PHASE" = "$p" ]; then
    echo "Pipeline paused in '$PHASE' (tier $TIER): waiting for the learner." >&2
    exit 0
  fi
done

block() {
  if [ "$ACTIVE_FLAG" = "True" ] || [ "$ACTIVE_FLAG" = "true" ]; then
    echo "WARNING (not blocking twice): $1" >&2
    exit 0
  fi
  echo "BLOCKED: $1" >&2
  exit 2
}

[ "$PHASE" != "done" ] && block "Pipeline not complete. Current phase: $PHASE. Continue, or ask the learner if you are waiting on him."

ROUNDS="$(cfg judge_phases "$TIER")"
NEED="$(cfg judges "$TIER")"
if [ -n "$ROUNDS" ]; then
  RES=$(python3 - "$STATE_FILE" "$ROUNDS" "$NEED" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
rounds, need = sys.argv[2].split(), sys.argv[3].split()
votes = d.get('artifacts', {}).get('judge_votes', [])
bad = []
for r in rounds:
    latest = {}
    for v in votes:
        if v.get('round') == r:
            latest[v.get('agent')] = v.get('verdict')
    bad += [r + '/' + j for j in need if latest.get(j) != 'PASS']
print(','.join(bad) if bad else 'OK')
PY
)
  [ "$RES" != "OK" ] && block "every judge round needs a unanimous PASS. Not PASS: $RES"
fi

NOTIFY=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('artifacts',{}).get('notify') or '')" "$STATE_FILE" 2>/dev/null)
[ -z "$NOTIFY" ] && block "notify not run. Run: bash .claude/hooks/pipeline-advance.sh notify"

cd "$DIR" 2>/dev/null || exit 0
[ -n "$(git status --porcelain 2>/dev/null)" ] && block "uncommitted changes exist (including untracked files). Commit (git add -A)."

ISSUE=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('issue') or '')" "$STATE_FILE" 2>/dev/null)
if [ -n "$ISSUE" ]; then
  BR=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  for pb in $(cfg get protected_branches); do
    [ "$BR" = "$pb" ] && block "issue #$ISSUE work is on protected branch '$BR'. Move it to <type>/$ISSUE-<slug> and open a PR."
  done
fi

rm -f "$STATE_FILE"
exit 0
