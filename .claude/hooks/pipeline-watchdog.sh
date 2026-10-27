#!/bin/bash
# PreToolUse (any): warn if the pipeline has been stuck at a non-done phase for too long.
HOOK_KIND=observer
case $0 in */*) HOOK_DIR=${0%/*} ;; *) HOOK_DIR=. ;; esac
# shellcheck source=lib/common.sh
source "$HOOK_DIR/lib/common.sh"

main_fn() {
  case "$STATE_STATUS" in own:*) ;; *) return 0 ;; esac
  local state_path result phase tier age_min limit marker should age
  state_path=$(cygpath -w "$STATE_FILE" 2>/dev/null || echo "$STATE_FILE")
  result=$(python3 -I - "$state_path" <<'PY'
import json, time, sys
d = json.load(open(sys.argv[1]))
last_ts = d.get('session_ts', 0)
for entry in d.get('phase_history', []):
    if isinstance(entry, dict):
        t = entry.get('ts', 0)
        if t > last_ts:
            last_ts = t
age_min = (time.time() - last_ts) / 60 if last_ts else 999
print('%s|%s|%.0f' % (d.get('phase', ''), d.get('tier', '?'), age_min))
PY
)
  [ -n "$result" ] || return 0
  IFS='|' read -r phase tier age_min <<< "$result"
  limit=$(cfg get watchdog_minutes)
  [ "$age_min" -gt "${limit:-30}" ] || return 0
  echo "WARNING: Pipeline interrupted - phase '$phase' (tier=$tier) stuck for ${age_min} min. Resume or reset." >&2
  marker="${TMPDIR:-/tmp}/pipeline_watchdog_sent"
  should=1
  if [ -f "$marker" ]; then
    age=$(python3 -I -c "import os,sys,time; print(int(time.time()-os.path.getmtime(sys.argv[1])))" "$marker")
    [ "$age" -lt 900 ] && should=0
  fi
  if [ "$should" -eq 1 ] && [ -f "$CODE_ROOT/.claude/hooks/notify.sh" ]; then
    touch "$marker"
    echo "Pipeline stuck: phase=$phase tier=$tier age=${age_min}min" | bash "$CODE_ROOT/.claude/hooks/notify.sh" "$tier" >/dev/null 2>&1 || true
  fi
  return 0
}

run_hook "$@"
