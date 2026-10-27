#!/bin/bash
# PostToolUse (Agent|Task): synchronous-harness fallback for recording a judge verdict.
# On async harnesses tool_response holds only launch metadata -> UNKNOWN -> silently skipped;
# judge-handback.sh / judge-vote.sh record it when the agent finishes.
HOOK_KIND=observer
case $0 in */*) HOOK_DIR=${0%/*} ;; *) HOOK_DIR=. ;; esac
# shellcheck source=lib/common.sh
source "$HOOK_DIR/lib/common.sh"

main_fn() {
  case "$STATE_STATUS" in own:*) ;; *) return 0 ;; esac
  case "$TOOL_NAME" in Agent|Task) ;; *) return 0 ;; esac
  local parsed judge verdict phase
  parsed=$(printf '%s' "$INPUT" | hookio judge_vote_post)
  judge="${parsed%%|*}"
  verdict="${parsed#*|}"
  [ -n "$judge" ] || return 0
  case "$verdict" in PASS|FAIL) ;; *) return 0 ;; esac
  phase=${STATE_STATUS##*:}
  (cd "$STATE_ROOT" && JUDGE_HOOK_CALLER=judge-count-hook bash "$CODE_ROOT/.claude/hooks/pipeline-advance.sh" "$phase" "$judge" "$verdict")
  return 0
}

run_hook "$@"
