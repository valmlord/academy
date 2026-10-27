#!/bin/bash
# SubagentStop: record a judge's verdict from the agent's final report (primary path; works on
# async harnesses). Role = leading "Read .claude/agents/<team>/judge-X.md first" of the agent's
# spawn prompt (first user record of its transcript). Verdict = last exact PASS/FAIL line.
# Falls back to the transcript's last assistant text when last_assistant_message is absent.
# pipeline-advance.sh only records votes for judges of the current tier inside a judge phase.

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_FILE="$DIR/.claude/pipeline_state.json"
[ ! -f "$STATE_FILE" ] && exit 0

PARSED=$(python3 "$DIR/.claude/hooks/lib/hookio.py" judge_vote 2>/dev/null)
AGENT_TYPE="${PARSED%%|*}"
VERDICT="${PARSED#*|}"
[ -z "$AGENT_TYPE" ] && exit 0
[ "$VERDICT" != "PASS" ] && [ "$VERDICT" != "FAIL" ] && exit 0

PHASE=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['phase'])" "$STATE_FILE" 2>/dev/null)
JUDGE_HOOK_CALLER=judge-count-hook bash "$DIR/.claude/hooks/pipeline-advance.sh" "$PHASE" "$AGENT_TYPE" "$VERDICT"
exit 0
