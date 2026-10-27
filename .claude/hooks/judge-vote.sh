#!/bin/bash
# SubagentStop: record a judge's verdict from the agent's final report (fallback path; the primary
# path is judge-handback.sh). Role = leading "Read .claude/agents/<team>/judge-X.md first" of the
# agent's spawn prompt (first user record of its transcript). Verdict = last exact PASS/FAIL line.
# Falls back to the transcript's last assistant text when last_assistant_message is absent.
# pipeline-advance.sh only records votes for judges of the current tier inside a judge phase.
HOOK_KIND=observer
case $0 in */*) HOOK_DIR=${0%/*} ;; *) HOOK_DIR=. ;; esac
# shellcheck source=lib/common.sh
source "$HOOK_DIR/lib/common.sh"

main_fn() {
  case "$STATE_STATUS" in own:*) ;; *) return 0 ;; esac
  local parsed judge verdict phase
  parsed=$(printf '%s' "$INPUT" | hookio judge_vote)
  judge="${parsed%%|*}"
  verdict="${parsed#*|}"
  [ -n "$judge" ] || return 0
  case "$verdict" in PASS|FAIL) ;; *) return 0 ;; esac
  phase=${STATE_STATUS##*:}
  (cd "$STATE_ROOT" && JUDGE_HOOK_CALLER=judge-count-hook bash "$CODE_ROOT/.claude/hooks/pipeline-advance.sh" "$phase" "$judge" "$verdict")
  return 0
}

run_hook "$@"
