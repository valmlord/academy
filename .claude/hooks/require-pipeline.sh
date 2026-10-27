#!/bin/bash
# PreToolUse (Edit|Write|MultiEdit|NotebookEdit): file-write gate.
#  - Pipeline state files: never writable by tools.
#  - Pipeline core (.claude/pipeline.json, settings.json, hooks/): only inside an active pipeline.
#  - Agents/feedback/plans/pipeline docs: always writable (judges append lessons).
#  - Everything else: only inside an active pipeline (init <TIER> <issue> done, phase != done).
#  - LEARN tier: product code is written by the learner; only meta paths and test files are writable.
HOOK_KIND=gate
case $0 in */*) HOOK_DIR=${0%/*} ;; *) HOOK_DIR=. ;; esac
# shellcheck source=lib/common.sh
source "$HOOK_DIR/lib/common.sh"

deny() { # deny <message> <log reason>
  echo "BLOCKED: $1" >&2
  pl_log event=block decision=block reason="$2"
  exit 2
}

main_fn() {
  case "$TOOL_NAME" in Edit|Write|MultiEdit|NotebookEdit) ;; *) return 0 ;; esac
  local file_path rel tier="" phase="" active=0 protected core p is_core=0
  file_path=$(printf '%s' "$INPUT" | hookio field tool_input.file_path)
  [ -z "$file_path" ] && file_path=$(printf '%s' "$INPUT" | hookio field tool_input.notebook_path)
  rel=$(python3 -I -c "import os,sys; print(os.path.relpath(os.path.abspath(sys.argv[1]), sys.argv[2]))" "$file_path" "$CODE_ROOT")

  protected=$(cfg get protected_files)
  for p in $protected; do
    [ "$rel" = "$p" ] && deny "$rel is pipeline runtime state. Use pipeline-advance.sh; never edit it directly." "protected:$rel"
  done

  case "$STATE_STATUS" in
    own:*) active=1; tier=${STATE_STATUS#own:}; phase=${tier#*:}; tier=${tier%%:*} ;;
  esac

  core=$(cfg get pipeline_core_files)
  for p in $core; do
    case "$rel" in "$p"*) is_core=1 ;; esac
  done
  if [ "$is_core" = 0 ]; then
    case "$rel" in .claude/*|pipeline/*|plans/*) return 0 ;; esac
  fi

  [ "$active" = 1 ] || deny "no active pipeline. Start one: bash .claude/hooks/pipeline-advance.sh init <TIER> <issue> (announce [TIER #n] pipeline: ...)." "no-pipeline:$rel"

  if [ "$(cfg tier_flag "$tier" learner_writes_code)" = "1" ]; then
    local editable
    editable=$(cfg get learn_tier_editable_paths)
    for p in $editable; do
      case "$rel" in "$p"*) return 0 ;; esac
    done
    if python3 -I - "$rel" "$CODE_ROOT/.claude/pipeline.json" <<'PY'
import fnmatch, json, sys
rel, cfgp = sys.argv[1], sys.argv[2]
globs = json.load(open(cfgp)).get("learn_tier_test_globs", [])
sys.exit(0 if any(fnmatch.fnmatch(rel, g) or fnmatch.fnmatch("x/" + rel, g) for g in globs) else 1)
PY
    then
      return 0
    fi
    deny "$tier task: the learner writes $rel. Explain, ask questions, review, write tests; do not edit product code." "learn:$rel"
  fi
  return 0
}

run_hook "$@"
