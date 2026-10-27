#!/bin/bash
# PreToolUse (Edit|Write|NotebookEdit): file-write gate.
#  - Pipeline state files: never writable by tools.
#  - Pipeline core (.claude/pipeline.json, settings.json, hooks/): only inside an active pipeline.
#  - Agents/feedback/plans/pipeline docs: always writable (judges append lessons).
#  - Everything else: only inside an active pipeline (init <TIER> <issue> done, phase != done).
#  - LEARN tier: product code is written by the learner; only meta paths and test files are writable.

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cfg() { python3 "$DIR/.claude/hooks/lib/cfg.py" "$@"; }
INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | python3 "$DIR/.claude/hooks/lib/hookio.py" field tool_name)
case "$TOOL_NAME" in Edit|Write|MultiEdit|NotebookEdit) ;; *) exit 0 ;; esac

FILE_PATH=$(printf '%s' "$INPUT" | python3 "$DIR/.claude/hooks/lib/hookio.py" field tool_input.file_path)
[ -z "$FILE_PATH" ] && FILE_PATH=$(printf '%s' "$INPUT" | python3 "$DIR/.claude/hooks/lib/hookio.py" field tool_input.notebook_path)
REL=$(python3 -c "import os,sys; print(os.path.relpath(os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])))" "$FILE_PATH" "$DIR" 2>/dev/null)

for p in $(cfg get protected_files); do
  if [ "$REL" = "$p" ]; then
    echo "BLOCKED: $REL is pipeline runtime state. Use pipeline-advance.sh; never edit it directly." >&2
    exit 2
  fi
done

STATE_FILE="$DIR/.claude/pipeline_state.json"
ACTIVE=0; TIER=""; PHASE=""
if [ -f "$STATE_FILE" ]; then
  TIER=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['tier'])" "$STATE_FILE" 2>/dev/null)
  PHASE=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['phase'])" "$STATE_FILE" 2>/dev/null)
  [ -n "$TIER" ] && [ "$PHASE" != "done" ] && ACTIVE=1
fi

IS_CORE=0
for p in $(cfg get pipeline_core_files); do
  case "$REL" in "$p"*) IS_CORE=1 ;; esac
done
if [ "$IS_CORE" = 0 ]; then
  case "$REL" in .claude/*|pipeline/*|plans/*) exit 0 ;; esac
fi

if [ "$ACTIVE" = 0 ]; then
  echo "BLOCKED: no active pipeline. Start one: bash .claude/hooks/pipeline-advance.sh init <TIER> <issue> (announce [TIER #n] pipeline: ...)." >&2
  exit 2
fi

if [ "$(cfg tier_flag "$TIER" learner_writes_code)" = "1" ]; then
  for p in $(cfg get learn_tier_editable_paths); do
    case "$REL" in "$p"*) exit 0 ;; esac
  done
  if python3 - "$REL" "$DIR/.claude/pipeline.json" <<'PY'
import fnmatch, json, sys
rel, cfgp = sys.argv[1], sys.argv[2]
globs = json.load(open(cfgp)).get("learn_tier_test_globs", [])
sys.exit(0 if any(fnmatch.fnmatch(rel, g) or fnmatch.fnmatch("x/" + rel, g) for g in globs) else 1)
PY
  then
    exit 0
  fi
  echo "BLOCKED: $TIER task: the learner writes $REL. Explain, ask questions, review, write tests; do not edit product code." >&2
  exit 2
fi

exit 0
