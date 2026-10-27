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
  local parsed judge verdict agent_id phase
  # An async launch response carries the new agent's id: remember which judge it is, so its
  # handback can be attributed even when no transcript is found.
  IFS='|' read -r judge agent_id <<< "$(printf '%s' "$INPUT" | hookio spawn_info)"
  phase=${STATE_STATUS##*:}
  if [ -n "$judge" ] && [ -n "$agent_id" ]; then
    (cd "$STATE_ROOT" && JUDGE_HOOK_CALLER=judge-count-hook \
      bash "$CODE_ROOT/.claude/hooks/pipeline-advance.sh" spawn "$phase" "$agent_id" "$judge") >/dev/null 2>&1 || true
  fi
  parsed=$(printf '%s' "$INPUT" | hookio judge_vote_post)
  judge="${parsed%%|*}"
  verdict="${parsed#*|}"
  [ -n "$judge" ] || return 0
  case "$verdict" in PASS|FAIL) ;; *) return 0 ;; esac
  pl_record_vote "$judge" "$verdict" "" post_tool_use
  return 0
}

run_hook "$@"
