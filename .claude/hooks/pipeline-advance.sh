#!/bin/bash
# Pipeline state machine: tracks phase transitions per tier.
# Tiers, phases and judges come from .claude/pipeline.json (via lib/cfg.py), never hardcoded here.
#
# Usage:
#   pipeline-advance.sh init <TIER> [issue-number]     start a pipeline (issue required for most tiers)
#   pipeline-advance.sh <phase>                         advance to the next phase
#   pipeline-advance.sh compound skip "reason"          skip the compound step
#   pipeline-advance.sh pr <url>                        record the opened PR and advance
#   pipeline-advance.sh pr skip "reason"                no remote yet: record why, advance
#   pipeline-advance.sh notify                          run notify hook and advance
#   pipeline-advance.sh status                          print state
# Judge votes are recorded ONLY by the judge-vote / judge-count hooks (JUDGE_HOOK_CALLER).
#
# State: .claude/pipeline_state.json

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cfg() { python3 "$SCRIPT_DIR/lib/cfg.py" "$@"; }
STATE_FILE_UNIX="$SCRIPT_DIR/../pipeline_state.json"
STATE_FILE=$(cygpath -w "$STATE_FILE_UNIX" 2>/dev/null || echo "$STATE_FILE_UNIX")
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PHASE="${1:?Usage: pipeline-advance.sh <phase> [args...]}"
shift

py_run() {
  local tmpf; tmpf=$(mktemp "${TMPDIR:-/tmp}/pipeline_py.XXXXXX.py")
  cat > "$tmpf"
  python3 "$tmpf" "$@"
  local rc=$?
  rm -f "$tmpf"
  return $rc
}

read_state()      { echo "import json; d=json.load(open(r'$STATE_FILE')); v=d.get('$1',''); print('' if v is None else v)" | py_run; }
read_state_json() { echo "import json; print(json.dumps(json.load(open(r'$STATE_FILE')),indent=2,ensure_ascii=False))" | py_run; }

# write_state key=value ... (values parsed as JSON when possible)
write_state() {
  py_run "$@" <<PYEOF
import json,sys
f = r'$STATE_FILE'
try: d = json.load(open(f))
except Exception: d = {}
for a in sys.argv[1:]:
    k,v = a.split('=',1)
    try: v = json.loads(v)
    except Exception: pass
    d[k] = v
json.dump(d, open(f,'w'), indent=2, ensure_ascii=False)
PYEOF
}

# set_artifact key value
set_artifact() {
  py_run "$1" "$2" <<PYEOF
import json,sys
f = r'$STATE_FILE'
d = json.load(open(f))
d.setdefault('artifacts',{})[sys.argv[1]] = sys.argv[2]
json.dump(d, open(f,'w'), indent=2, ensure_ascii=False)
PYEOF
}

append_history() {
  py_run "$1" <<PYEOF
import json,time,sys
f = r'$STATE_FILE'
d = json.load(open(f))
now = time.time()
entry = {'phase': sys.argv[1], 'ts': now, 'ts_str': time.strftime('%Y-%m-%dT%H:%M:%S')}
d.setdefault('phase_history',[]).append(entry)
d.setdefault('artifacts',{})['last_ts'] = entry['ts_str']
json.dump(d, open(f,'w'), indent=2, ensure_ascii=False)
PYEOF
}

# Unanimity for the CURRENT judge round. Prints OK / FAIL:<..> NOTVOTED:<..>
check_judges_unanimous() {
  local need="$1"
  py_run "$need" <<PYEOF
import json,sys
d=json.load(open(r'$STATE_FILE'))
cur=d.get('phase','')
need=sys.argv[1].split()
latest={}
for v in d.get('artifacts',{}).get('judge_votes',[]):
    if v.get('round')==cur:
        latest[v.get('agent')]=v.get('verdict')
fails=[j for j in need if latest.get(j)=='FAIL']
notvoted=[j for j in need if latest.get(j) not in ('PASS','FAIL')]
if not fails and not notvoted:
    print('OK')
else:
    parts=[]
    if fails: parts.append('FAIL:'+','.join(fails))
    if notvoted: parts.append('NOTVOTED:'+','.join(notvoted))
    print(' '.join(parts))
PYEOF
}

# ---------------------------------------------------------------- STATUS
if [ "$PHASE" = "status" ]; then
  [ -f "$STATE_FILE" ] && read_state_json || echo "No active pipeline."
  exit 0
fi

# ---------------------------------------------------------------- INIT
if [ "$PHASE" = "init" ]; then
  TIER="${1:?Usage: pipeline-advance.sh init <TIER> [issue-number]}"
  ISSUE="${2:-}"
  ISSUE="${ISSUE#\#}"
  if ! cfg tiers | tr ' ' '\n' | grep -qx "$TIER"; then
    echo "ERROR: Unknown tier: $TIER. Known: $(cfg tiers)" >&2; exit 1
  fi
  if [ "$(cfg tier_flag "$TIER" requires_issue)" = "1" ]; then
    if ! [[ "$ISSUE" =~ ^[0-9]+$ ]]; then
      echo "ERROR: tier $TIER requires a GitHub issue number: pipeline-advance.sh init $TIER <issue>" >&2
      echo "No issue yet? Create one first (gh issue create --template ...)." >&2
      exit 1
    fi
  fi
  if [ -f "$STATE_FILE" ]; then
    PREV_PHASE=$(read_state phase || true)
    if [ -n "$PREV_PHASE" ] && [ "$PREV_PHASE" != "done" ]; then
      TTL_H=$(cfg get state_ttl_hours)
      AGE=$(echo "import json,time; d=json.load(open(r'$STATE_FILE')); print(int(time.time()-d.get('session_ts',0)))" | py_run 2>/dev/null || echo 999999)
      if [ "$AGE" -lt $((TTL_H * 3600)) ]; then
        echo "ERROR: a pipeline is still active (phase=$PREV_PHASE, ${AGE}s old). Finish it, or wait for TTL ${TTL_H}h." >&2
        exit 1
      fi
      echo "Auto-resetting stale state (${AGE}s old)."
    fi
  fi
  BRANCH=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  py_run "$TIER" "$ISSUE" "$BRANCH" <<PYEOF
import json,time,sys
tier, issue, branch = sys.argv[1], sys.argv[2], sys.argv[3]
now = time.time()
json.dump({'tier':tier,'phase':'init','issue': int(issue) if issue else None,'branch_at_init':branch,
  'session_ts':now,
  'phase_history':[{'phase':'init','ts':now,'ts_str':time.strftime('%Y-%m-%dT%H:%M:%S')}],
  'artifacts':{'last_ts':time.strftime('%Y-%m-%dT%H:%M:%S')}
},open(r'$STATE_FILE','w'),indent=2,ensure_ascii=False)
PYEOF
  echo "Pipeline initialized: tier=$TIER issue=${ISSUE:-none}"
  echo "Phases: $(cfg phases "$TIER")"
  if [ -n "$ISSUE" ]; then
    echo "Work on a branch named <type>/$ISSUE-<slug> (e.g. feat/$ISSUE-lesson-page). Never commit to main."
  fi
  echo ""
  echo "REMINDER: read .claude/feedback/orchestrator_mistakes.md and the role mistake files before starting."
  exit 0
fi

[ ! -f "$STATE_FILE" ] && { echo "ERROR: No pipeline state. Run: pipeline-advance.sh init <TIER> <issue>" >&2; exit 1; }

TIER=$(read_state tier)
CURRENT=$(read_state phase)
ISSUE=$(read_state issue)
ORDER="$(cfg phases "$TIER")"
JUDGES="$(cfg judges "$TIER")"

# ---------------------------------------------------------------- JUDGE VOTE
if [[ "$PHASE" == judge_* ]] && [ "$CURRENT" = "$PHASE" ] && [ $# -ge 2 ]; then
  AGENT="$1"; VERDICT="$2"
  if [ "${JUDGE_HOOK_CALLER:-}" != "judge-count-hook" ]; then
    echo "REJECTED: Inline judge votes are not allowed. Spawn the judges for tier $TIER in ONE message:" >&2
    for j in $JUDGES; do
      F=$(cfg all_judges | tr ' ' '\n' | grep "^$j=" | cut -d= -f2)
      echo "  Agent(prompt=\"Read .claude/agents/<team>/$F first. Then review: ...\")" >&2
    done
    exit 1
  fi
  if ! echo " $JUDGES " | grep -q " $AGENT "; then
    echo "IGNORED: judge '$AGENT' is not part of tier $TIER (judges: $JUDGES)." >&2
    exit 0
  fi
  case "$VERDICT" in PASS|FAIL) ;; *) echo "IGNORED: verdict '$VERDICT'" >&2; exit 0 ;; esac
  py_run "$AGENT" "$VERDICT" "$PHASE" <<PYEOF
import json,time,os,sys
agent, verdict, rnd = sys.argv[1], sys.argv[2], sys.argv[3]
f = r'$STATE_FILE'
lock = f + '.lock'
for _ in range(50):
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY); os.close(fd); break
    except FileExistsError:
        time.sleep(0.1)
else:
    try: os.remove(lock)
    except Exception: pass
try:
    d = json.load(open(f))
    d.setdefault('artifacts',{}).setdefault('judge_votes',[]).append(
        {'agent':agent,'verdict':verdict,'source':'hook','round':rnd,'ts':time.strftime('%Y-%m-%dT%H:%M:%S')})
    now = time.time()
    d.setdefault('phase_history',[]).append({'phase':'judge:%s:%s'%(agent,verdict),'ts':now,'ts_str':time.strftime('%Y-%m-%dT%H:%M:%S')})
    d['artifacts']['last_ts'] = time.strftime('%Y-%m-%dT%H:%M:%S')
    json.dump(d, open(f,'w'), indent=2, ensure_ascii=False)
finally:
    try: os.remove(lock)
    except Exception: pass
PYEOF
  echo "Judge recorded ($PHASE: $AGENT=$VERDICT). Round status: $(check_judges_unanimous "$JUDGES")"
  exit 0
fi

# ---------------------------------------------------------------- COMPOUND skip
if [ "$PHASE" = "compound" ] && [ "${1:-}" = "skip" ]; then
  set_artifact compound_skip "${2:-no reason given}"
fi

# ---------------------------------------------------------------- PR gate (commit -> pr)
if [ "$PHASE" = "pr" ]; then
  ARG="${1:-}"
  if [ "$ARG" = "skip" ]; then
    set_artifact pr "skipped: ${2:-no reason given}"
    echo "WARNING: PR skipped (${2:-no reason}). Open it as soon as the remote exists." >&2
  elif [[ "$ARG" =~ ^https?:// ]]; then
    set_artifact pr "$ARG"
  else
    echo "ERROR: Usage: pipeline-advance.sh pr <pr-url> | pr skip \"reason\"" >&2; exit 1
  fi
  if [ -n "$ISSUE" ]; then
    BR=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    for pb in $(cfg get protected_branches); do
      if [ "$BR" = "$pb" ]; then
        echo "BLOCKED: you are on protected branch '$BR'. Work happens on <type>/$ISSUE-<slug>, merged via PR." >&2; exit 1
      fi
    done
    if [ -n "$(git -C "$REPO_DIR" status --porcelain 2>/dev/null)" ]; then
      echo "BLOCKED: uncommitted changes. Commit first (git add -A)." >&2; exit 1
    fi
    if ! git -C "$REPO_DIR" log -1 --format=%B 2>/dev/null | grep -qE "#$ISSUE\b"; then
      echo "BLOCKED: the last commit message must reference the issue (e.g. 'Refs #$ISSUE')." >&2; exit 1
    fi
  fi
fi

# ---------------------------------------------------------------- NOTIFY
if [ "$PHASE" = "notify" ]; then
  NOTIFY_BODY=$(py_run <<PYEOF
import json,time
d = json.load(open(r'$STATE_FILE'))
lines = ['Tier: %s  Issue: #%s' % (d.get('tier','?'), d.get('issue') or '-')]
st = d.get('session_ts', 0)
lines.append('Total: %.1f min' % ((time.time()-st)/60 if st else 0))
a = d.get('artifacts',{})
if a.get('pr'): lines.append('PR: %s' % a['pr'])
votes = a.get('judge_votes',[])
if votes:
    lines.append('Judge verdicts:')
    for v in votes:
        lines.append('  [%s] %s: %s' % (v.get('round'), v.get('agent'), v.get('verdict')))
print('\n'.join(lines))
PYEOF
)
  if [ -f "$SCRIPT_DIR/notify.sh" ]; then
    echo "$NOTIFY_BODY" | bash "$SCRIPT_DIR/notify.sh" "$TIER" || echo "WARNING: notify hook failed (non-fatal)" >&2
  fi
  set_artifact notify "$(date +%Y-%m-%dT%H:%M:%S)"
fi

# ---------------------------------------------------------------- Phase validation
validate_advance() {
  local order_arr=($ORDER)
  local cur_idx=-1 next_idx=-1
  for i in "${!order_arr[@]}"; do
    [ "${order_arr[$i]}" = "$CURRENT" ] && cur_idx=$i
    [ "${order_arr[$i]}" = "$PHASE" ] && next_idx=$i
  done
  if [ "$next_idx" -eq -1 ]; then echo "ERROR: Phase '$PHASE' not valid for tier $TIER ($ORDER)" >&2; exit 1; fi
  if [ "$next_idx" -le "$cur_idx" ]; then echo "ERROR: Cannot go back from '$CURRENT' to '$PHASE' (tier=$TIER)" >&2; exit 1; fi
  if [ "$next_idx" -gt $((cur_idx + 1)) ]; then echo "ERROR: Cannot skip from '$CURRENT' to '$PHASE'. Next expected: '${order_arr[$((cur_idx + 1))]}' (tier=$TIER)" >&2; exit 1; fi
}
validate_advance

# Cannot leave a judge phase without a unanimous PASS in that round.
if [[ "$CURRENT" == judge_* ]]; then
  UNAN=$(check_judges_unanimous "$JUDGES")
  if [ "$UNAN" != "OK" ]; then
    echo "BLOCKED: cannot leave '$CURRENT': need a unanimous PASS from [$JUDGES]. Status: $UNAN" >&2
    echo "  FAIL:<judges>     = real issue; the judge wrote it to the responsible role's mistakes file. Re-spawn that role and re-judge." >&2
    echo "  NOTVOTED:<judges> = verdict not recorded yet (still running or no PASS/FAIL line). Wait or re-spawn. Not a FAIL." >&2
    exit 1
  fi
fi

write_state "phase=$PHASE"
append_history "$PHASE"
echo "Advanced: $CURRENT -> $PHASE (tier=$TIER, issue=#${ISSUE:-none})"
