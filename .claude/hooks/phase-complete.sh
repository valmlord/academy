#!/bin/bash
# Stop hook: validate ALL pipeline completion gates from the state file.

STATE_FILE="$CLAUDE_PROJECT_DIR/.claude/pipeline_state.json"

# No state file: fall back to a transcript check (a pipeline was announced but never initialized).
if [ ! -f "$STATE_FILE" ]; then
  INPUT=$(cat)
  TRANSCRIPT=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('transcript_path',''))" 2>/dev/null)
  if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
    HAS_PIPELINE=$(grep -cE "\[($(python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/lib/cfg.py" tiers | tr ' ' '|'))( #[0-9]+)?\].*pipeline" "$TRANSCRIPT" || true)
    if [ "$HAS_PIPELINE" -gt 0 ]; then
      cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
      DIRTY=$(git status --porcelain 2>/dev/null | grep -c '.' || true)
      if [ "$DIRTY" -gt 0 ]; then
        echo "BLOCKED: Pipeline announced but no state file. Run: bash .claude/hooks/pipeline-advance.sh init <TIER>" >&2
        exit 2
      fi
    fi
  fi
  exit 0
fi

WIN_PATH=$(cygpath -w "$STATE_FILE" 2>/dev/null || echo "$STATE_FILE")
TIER=$(python3 -c "import json; print(json.load(open(r'$WIN_PATH'))['tier'])" 2>/dev/null)
PHASE=$(python3 -c "import json; print(json.load(open(r'$WIN_PATH'))['phase'])" 2>/dev/null)

# Must reach 'done'.
if [ "$PHASE" != "done" ]; then
  echo "BLOCKED: Pipeline not complete. Current phase: $PHASE. Advance to 'done' first." >&2
  exit 2
fi

# Each judge ROUND must be unanimous PASS, scoped to that round. "Latest per judge" is taken
# WITHIN the round, so a judge's PASS from an earlier round cannot satisfy a later round it
# never voted in (that was a real cross-round false-PASS hole).
CFG="python3 $CLAUDE_PROJECT_DIR/.claude/hooks/lib/cfg.py"
ROUNDS="$($CFG judge_phases "$TIER")"
NEED="$($CFG judges "$TIER")"
if [ -n "$ROUNDS" ]; then
  JF=$(mktemp "${TMPDIR:-/tmp}/pc_judge.XXXXXX.py")
  cat > "$JF" <<'PYEOF'
import json, sys
d=json.load(open(sys.argv[1]))
rounds=sys.argv[2].split()
votes=d.get('artifacts',{}).get('judge_votes',[])
need=sys.argv[3].split()
bad=[]
for r in rounds:
    latest={}
    for v in votes:
        if v.get('round')==r:
            latest[v.get('agent')]=v.get('verdict')
    for j in need:
        if latest.get(j)!='PASS':
            bad.append(r+'/'+j)
print(','.join(bad) if bad else 'OK')
PYEOF
  RES=$(python3 "$JF" "$WIN_PATH" "$ROUNDS" "$NEED" 2>/dev/null)
  rm -f "$JF"
  if [ "$RES" != "OK" ]; then
    echo "BLOCKED: every judge round needs a unanimous PASS (scoped to that round). Not PASS: $RES" >&2
    exit 2
  fi
  INLINE=$(python3 -c "import json; d=json.load(open(r'$WIN_PATH')); print(sum(1 for v in d.get('artifacts',{}).get('judge_votes',[]) if v.get('source')=='inline'))" 2>/dev/null)
  [ -n "$INLINE" ] && [ "$INLINE" -gt 0 ] && echo "WARNING: $INLINE judge vote(s) recorded inline. Use spawned judge agents." >&2
fi

# Notify must have run.
NOTIFY=$(python3 -c "import json; d=json.load(open(r'$WIN_PATH')); print(d.get('artifacts',{}).get('notify',''))" 2>/dev/null)
if [ -z "$NOTIFY" ] || [ "$NOTIFY" = "None" ]; then
  echo "BLOCKED: notify not run. Run: bash .claude/hooks/pipeline-advance.sh notify" >&2
  exit 2
fi

# Committed (if code changed). Count ANY dirty entry incl. UNTRACKED ('??') - `git commit -a`
# skips untracked files, so a new file could be left out while this gate went green.
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
DIRTY=$(git status --porcelain 2>/dev/null | grep -c '.' || true)
if [ "$DIRTY" -gt 0 ]; then
  echo "BLOCKED: Uncommitted changes exist (including untracked files). Commit before finishing (one task = one commit; use git add -A, not commit -a)." >&2
  exit 2
fi

# Never finish an issue-linked task on a protected branch.
ISSUE=$(python3 -c "import json; d=json.load(open(r'$WIN_PATH')); print(d.get('issue') or '')" 2>/dev/null)
if [ -n "$ISSUE" ]; then
  BR=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  for pb in $($CFG get protected_branches); do
    if [ "$BR" = "$pb" ]; then
      echo "BLOCKED: issue #$ISSUE work is on protected branch '$BR'. Move it to <type>/$ISSUE-<slug> and open a PR." >&2
      exit 2
    fi
  done
fi

# Clean up for the next session.
rm -f "$STATE_FILE"
exit 0
