#!/bin/bash
# PreToolUse (Bash):
#  1. Pipeline integrity: no tool-issued command may touch the state file or forge a judge vote.
#  2. LEARN tier: no shell writes into product code dirs (heuristic: redirects, tee, sed -i, cp/mv
#     into apps/ services/ packages/ images/). Tests may still be run; test files go through Write.
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
  [ "$TOOL_NAME" = "Bash" ] || return 0
  local cmd tier="" dirs
  cmd=$(printf '%s' "$INPUT" | hookio field tool_input.command)

  if printf '%s' "$cmd" | grep -q "pipeline_state"; then
    deny "the pipeline state file is managed only by pipeline-advance.sh (use: pipeline-advance.sh status)." "state-string"
  fi
  if printf '%s' "$cmd" | grep -q "JUDGE_HOOK_CALLER"; then
    deny "judge votes are recorded only by the judge hooks from spawned judge agents." "judge-caller-string"
  fi

  case "$STATE_STATUS" in
    own:*) tier=${STATE_STATUS#own:}; tier=${tier%%:*} ;;
  esac
  [ -n "$tier" ] || return 0
  if [ "$(cfg tier_flag "$tier" learner_writes_code)" = "1" ]; then
    dirs=$(cfg get learn_tier_code_dirs | sed 's#/ #|#g; s#/$##')
    if printf '%s' "$cmd" | grep -Eq "(>>?|\btee( -a)?|\bsed -i[^ ]*|\bperl -pi|\bcp( -[a-zA-Z]+)*|\bmv( -[a-zA-Z]+)*)[^|;&]*\b($dirs)/"; then
      deny "$tier task: shell writes into product code are not allowed; the learner writes the code." "learn-shell-write"
    fi
  fi
  return 0
}

run_hook "$@"
