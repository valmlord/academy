#!/bin/bash
# PostToolUse (Agent|Task): synchronous-harness fallback for recording a judge verdict.
# On async harnesses tool_response holds only launch metadata -> UNKNOWN -> silently skipped;
# judge-vote.sh (SubagentStop) records it when the agent finishes.

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_FILE="$DIR/.claude/pipeline_state.json"
[ ! -f "$STATE_FILE" ] && exit 0
INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | python3 "$DIR/.claude/hooks/lib/hookio.py" field tool_name)
case "$TOOL_NAME" in Agent|Task) ;; *) exit 0 ;; esac

PARSED=$(printf '%s' "$INPUT" | python3 "$DIR/.claude/hooks/lib/hookio.py" judge_vote_post 2>/dev/null)
AGENT_TYPE="${PARSED%%|*}"
VERDICT="${PARSED#*|}"
[ -z "$AGENT_TYPE" ] && exit 0
[ "$VERDICT" != "PASS" ] && [ "$VERDICT" != "FAIL" ] && exit 0

PHASE=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['phase'])" "$STATE_FILE" 2>/dev/null)
JUDGE_HOOK_CALLER=judge-count-hook bash "$DIR/.claude/hooks/pipeline-advance.sh" "$PHASE" "$AGENT_TYPE" "$VERDICT"
exit 0
