#!/bin/bash
# PreToolUse (Agent|Task): enforce which role agent may be spawned in which phase.
# The role is the LEADING "Read .claude/agents/<team>/<file>.md first" of the prompt, or the
# subagent_type (lib/hookio.py). Windows come from .claude/pipeline.json agent_gates.

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cfg() { python3 "$DIR/.claude/hooks/lib/cfg.py" "$@"; }
INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | python3 "$DIR/.claude/hooks/lib/hookio.py" field tool_name)
case "$TOOL_NAME" in Agent|Task) ;; *) exit 0 ;; esac

ROLE=$(printf '%s' "$INPUT" | python3 "$DIR/.claude/hooks/lib/hookio.py" role)
[ -z "$ROLE" ] && exit 0   # not one of our role agents (e.g. a plain Explore search)

STATE_FILE="$DIR/.claude/pipeline_state.json"
GATED=" $(cfg gated_agents) "
JUDGE_FILES=" $(cfg all_judges | tr ' ' '\n' | cut -d= -f2 | tr '\n' ' ') "
IS_GATED=0; IS_JUDGE=0
case "$GATED" in *" $ROLE "*) IS_GATED=1 ;; esac
case "$JUDGE_FILES" in *" $ROLE "*) IS_JUDGE=1 ;; esac

if [ ! -f "$STATE_FILE" ]; then
  if [ "$IS_GATED" = 1 ] || [ "$IS_JUDGE" = 1 ]; then
    echo "BLOCKED: $ROLE needs an active pipeline. Run: bash .claude/hooks/pipeline-advance.sh init <TIER> <issue>" >&2
    exit 2
  fi
  exit 0
fi

PHASE=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['phase'])" "$STATE_FILE" 2>/dev/null)
TIER=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['tier'])" "$STATE_FILE" 2>/dev/null)
read -r -a ORDER <<< "$(cfg phases "$TIER")"
idx_of() { local i; for i in "${!ORDER[@]}"; do [ "${ORDER[$i]}" = "$1" ] && { echo "$i"; return; }; done; echo -1; }
CUR_IDX=$(idx_of "$PHASE")

if [ "$ROLE" = "coder.md" ] && [ "$(cfg tier_flag "$TIER" learner_writes_code)" = "1" ]; then
  echo "BLOCKED: tier $TIER is a learning task: the learner writes the code, not the coder agent. Use mentor.md for hints." >&2
  exit 2
fi

if [ "$IS_GATED" = 1 ]; then
  read -r FIRST LAST <<< "$(cfg gate "$ROLE")"
  F_IDX=$(idx_of "$FIRST"); L_IDX=$(idx_of "$LAST")
  if [ "$F_IDX" -eq -1 ] || [ "$L_IDX" -eq -1 ]; then
    echo "BLOCKED: $ROLE is not part of tier $TIER (phases: ${ORDER[*]})." >&2; exit 2
  fi
  if [ "$CUR_IDX" -lt "$F_IDX" ] || [ "$CUR_IDX" -gt "$L_IDX" ]; then
    echo "BLOCKED: $ROLE may run only in phases $FIRST..$LAST (tier $TIER). Current phase: $PHASE." >&2; exit 2
  fi
fi

if [ "$IS_JUDGE" = 1 ]; then
  KEY=$(cfg all_judges | tr ' ' '\n' | grep "=$ROLE\$" | cut -d= -f1)
  case " $(cfg judges "$TIER") " in
    *" $KEY "*) ;;
    *) echo "BLOCKED: $ROLE is not a judge of tier $TIER (judges: $(cfg judges "$TIER"))." >&2; exit 2 ;;
  esac
  case "$PHASE" in
    judge_*) ;;
    *) echo "BLOCKED: judges run only inside a judge phase; advance first. Current phase: $PHASE." >&2; exit 2 ;;
  esac
fi

exit 0
