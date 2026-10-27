#!/bin/bash
# PreToolUse (Edit|Write): block edits until a pipeline is announced, and in LEARN tasks
# block the orchestrator from writing code (the learner writes it).
# Announcement format: [TIER #<issue>] pipeline: <description>   e.g. [TASK #12] pipeline: lesson page

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)
[[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" ]] && exit 0

FILE_PATH=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)
REL="${FILE_PATH#$CLAUDE_PROJECT_DIR/}"
CFG="python3 $CLAUDE_PROJECT_DIR/.claude/hooks/lib/cfg.py"

# Meta-work on the pipeline itself is always allowed.
if [[ "$REL" == .claude/* || "$REL" == pipeline/* || "$REL" == plans/* ]]; then
  exit 0
fi

STATE_FILE="$CLAUDE_PROJECT_DIR/.claude/pipeline_state.json"
if [ -f "$STATE_FILE" ]; then
  TIER=$(python3 -c "import json; print(json.load(open('$STATE_FILE'))['tier'])" 2>/dev/null)
  if [ "$($CFG tier_flag "$TIER" learner_writes_code)" = "1" ]; then
    for p in $($CFG get learn_tier_editable_paths); do
      [[ "$REL" == $p* ]] && exit 0
    done
    echo "BLOCKED: $TIER task: the learner writes the code in $REL. Explain, ask questions, review, but do not edit it." >&2
    exit 2
  fi
fi

TIERS=$($CFG tiers | tr ' ' '|')
TRANSCRIPT=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('transcript_path',''))" 2>/dev/null)
if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  if grep -qE "\[($TIERS)( #[0-9]+)?\][^\"]*pipeline" "$TRANSCRIPT"; then
    exit 0
  fi
fi

echo "BLOCKED: No pipeline announced. Start with: [TIER #<issue>] pipeline: <description>" >&2
exit 2
