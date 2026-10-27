#!/bin/bash
# PreToolUse (Bash):
#  1. Pipeline integrity: no tool-issued command may touch the state file or forge a judge vote.
#  2. LEARN tier: no shell writes into product code dirs (heuristic: redirects, tee, sed -i, cp/mv
#     into apps/ services/ packages/ images/). Tests may still be run; test files go through Write.

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cfg() { python3 "$DIR/.claude/hooks/lib/cfg.py" "$@"; }
INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | python3 "$DIR/.claude/hooks/lib/hookio.py" field tool_name)
[ "$TOOL_NAME" != "Bash" ] && exit 0
CMD=$(printf '%s' "$INPUT" | python3 "$DIR/.claude/hooks/lib/hookio.py" field tool_input.command)

if printf '%s' "$CMD" | grep -q "pipeline_state"; then
  echo "BLOCKED: the pipeline state file is managed only by pipeline-advance.sh (use: pipeline-advance.sh status)." >&2
  exit 2
fi
if printf '%s' "$CMD" | grep -q "JUDGE_HOOK_CALLER"; then
  echo "BLOCKED: judge votes are recorded only by the judge hooks from spawned judge agents." >&2
  exit 2
fi

STATE_FILE="$DIR/.claude/pipeline_state.json"
[ ! -f "$STATE_FILE" ] && exit 0
TIER=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['tier'])" "$STATE_FILE" 2>/dev/null)
if [ "$(cfg tier_flag "$TIER" learner_writes_code)" = "1" ]; then
  DIRS=$(cfg get learn_tier_code_dirs | sed 's#/ #|#g; s#/$##')
  if printf '%s' "$CMD" | grep -Eq "(>>?|\btee( -a)?|\bsed -i[^ ]*|\bperl -pi|\bcp( -[a-zA-Z]+)*|\bmv( -[a-zA-Z]+)*)[^|;&]*\b($DIRS)/"; then
    echo "BLOCKED: $TIER task: shell writes into product code are not allowed; the learner writes the code." >&2
    exit 2
  fi
fi
exit 0
