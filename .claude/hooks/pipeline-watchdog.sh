#!/bin/bash
# PreToolUse (any): warn if the pipeline has been stuck at a non-done phase for >15 min.
# Multi-line python is run from a temp file for portability.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$CLAUDE_PROJECT_DIR/.claude/pipeline_state.json"
[ ! -f "$STATE_FILE" ] && exit 0

WIN_PATH=$(cygpath -w "$STATE_FILE" 2>/dev/null || echo "$STATE_FILE")

RF=$(mktemp "${TMPDIR:-/tmp}/wd.XXXXXX.py")
cat > "$RF" <<'PYEOF'
import json, time, sys
d = json.load(open(sys.argv[1]))
phase = d.get('phase', '')
if phase == 'done':
    print('done')
else:
    last_ts = d.get('session_ts', 0)
    for entry in d.get('phase_history', []):
        if isinstance(entry, dict):
            t = entry.get('ts', 0)
            if t > last_ts:
                last_ts = t
    age_min = (time.time() - last_ts) / 60 if last_ts else 999
    print('%s|%s|%.0f' % (phase, d.get('tier', '?'), age_min))
PYEOF
RESULT=$(python3 "$RF" "$WIN_PATH" 2>/dev/null)
rm -f "$RF"

[ "$RESULT" = "done" ] && exit 0
[ -z "$RESULT" ] && exit 0

PHASE=$(echo "$RESULT" | cut -d'|' -f1)
TIER=$(echo "$RESULT" | cut -d'|' -f2)
AGE_MIN=$(echo "$RESULT" | cut -d'|' -f3)

LIMIT=$(python3 "$SCRIPT_DIR/lib/cfg.py" get watchdog_minutes 2>/dev/null || echo 30)
if [ "$AGE_MIN" -gt "${LIMIT:-30}" ]; then
  echo "WARNING: Pipeline interrupted - phase '$PHASE' (tier=$TIER) stuck for ${AGE_MIN} min. Resume or reset." >&2
  MARKER="${TMPDIR:-/tmp}/pipeline_watchdog_sent"
  SHOULD=1
  if [ -f "$MARKER" ]; then
    AGE=$(( $(date +%s) - $(date -r "$MARKER" +%s 2>/dev/null || echo 0) ))
    [ "$AGE" -lt 900 ] && SHOULD=0
  fi
  if [ "$SHOULD" -eq 1 ] && [ -f "$SCRIPT_DIR/notify.sh" ]; then
    touch "$MARKER"
    echo "Pipeline stuck: phase=$PHASE tier=$TIER age=${AGE_MIN}min" | bash "$SCRIPT_DIR/notify.sh" "$TIER" >/dev/null 2>&1 || true
  fi
fi

exit 0
