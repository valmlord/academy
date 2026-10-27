#!/bin/bash
# PreToolUse (Agent): enforce which role agents may be spawned in which phase.
# Rules come from .claude/pipeline.json: agent_gates (earliest phase) + judge_agents.

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)
[ "$TOOL_NAME" != "Agent" ] && exit 0

STATE_FILE="$CLAUDE_PROJECT_DIR/.claude/pipeline_state.json"
[ ! -f "$STATE_FILE" ] && exit 0
CFG="python3 $CLAUDE_PROJECT_DIR/.claude/hooks/lib/cfg.py"

WIN_PATH=$(cygpath -w "$STATE_FILE" 2>/dev/null || echo "$STATE_FILE")
PHASE=$(python3 -c "import json; print(json.load(open(r'$WIN_PATH'))['phase'])" 2>/dev/null)
TIER=$(python3 -c "import json; print(json.load(open(r'$WIN_PATH'))['tier'])" 2>/dev/null)
ORDER=($($CFG phases "$TIER"))
PROMPT=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('prompt','')[:400])" 2>/dev/null)

idx_of() { local i; for i in "${!ORDER[@]}"; do [ "${ORDER[$i]}" = "$1" ] && { echo "$i"; return; }; done; echo -1; }
CUR_IDX=$(idx_of "$PHASE")

# LEARN tier: Stepan writes the code. The coder agent is never allowed.
if [ "$($CFG tier_flag "$TIER" learner_writes_code)" = "1" ] && echo "$PROMPT" | grep -q "coder\.md"; then
  echo "BLOCKED: tier $TIER is a learning task: the code is written by the learner, not the coder agent. Use mentor.md for hints." >&2
  exit 2
fi

# Role agents with an earliest phase.
for pair in $(python3 -c "import json; d=json.load(open('$CLAUDE_PROJECT_DIR/.claude/pipeline.json'))['agent_gates']; print(' '.join('%s=%s'%(k,v) for k,v in d.items() if not k.startswith('_')))"); do
  FILE="${pair%%=*}"; EARLIEST="${pair#*=}"
  if echo "$PROMPT" | grep -q "/$FILE\|^$FILE\| $FILE"; then
    E_IDX=$(idx_of "$EARLIEST")
    if [ "$E_IDX" -eq -1 ]; then
      echo "BLOCKED: $FILE is not part of tier $TIER (phases: ${ORDER[*]})." >&2; exit 2
    fi
    if [ "$CUR_IDX" -lt "$E_IDX" ]; then
      echo "BLOCKED: $FILE may start only at phase '$EARLIEST' (tier $TIER). Current phase: $PHASE." >&2; exit 2
    fi
  fi
done

# Judges: only in a judge phase of this tier (or the phase right before it), and only this tier's judges.
TIER_JUDGES=" $($CFG judges "$TIER") "
for pair in $($CFG all_judges); do
  KEY="${pair%%=*}"; FILE="${pair#*=}"
  if echo "$PROMPT" | grep -q "$FILE"; then
    if ! echo "$TIER_JUDGES" | grep -q " $KEY "; then
      echo "BLOCKED: $FILE is not a judge of tier $TIER (judges:$TIER_JUDGES)." >&2; exit 2
    fi
    NEXT="${ORDER[$((CUR_IDX + 1))]:-}"
    if [[ "$PHASE" != judge_* ]] && [[ "$NEXT" != judge_* ]]; then
      echo "BLOCKED: judges run only in a judge phase. Current phase: $PHASE." >&2; exit 2
    fi
  fi
done

exit 0
