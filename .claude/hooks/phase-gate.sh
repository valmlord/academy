#!/bin/bash
# PreToolUse (Agent|Task): enforce which role agent may be spawned in which phase.
# The role is the LEADING "Read .claude/agents/<team>/<file>.md first" of the prompt, or the
# subagent_type (lib/hookio.py). Windows come from .claude/pipeline.json agent_gates.
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
  case "$TOOL_NAME" in Agent|Task) ;; *) return 0 ;; esac
  local role gated judge_files is_gated=0 is_judge=0 tier="" phase="" order cur_idx first last f_idx l_idx key judges
  role=$(printf '%s' "$INPUT" | hookio role)
  [ -n "$role" ] || return 0   # not one of our role agents (e.g. a plain Explore search)

  gated=" $(cfg gated_agents) "
  judge_files=" $(cfg all_judges | tr ' ' '\n' | cut -d= -f2 | tr '\n' ' ') "
  case "$gated" in *" $role "*) is_gated=1 ;; esac
  case "$judge_files" in *" $role "*) is_judge=1 ;; esac

  case "$STATE_STATUS" in
    own:*) tier=${STATE_STATUS#own:}; phase=${tier#*:}; tier=${tier%%:*} ;;
  esac
  if [ -z "$tier" ]; then
    if [ "$is_gated" = 1 ] || [ "$is_judge" = 1 ]; then
      deny "$role needs an active pipeline. Run: bash .claude/hooks/pipeline-advance.sh init <TIER> <issue>" "no-pipeline:$role"
    fi
    return 0
  fi

  read -r -a order <<< "$(cfg phases "$tier")"
  idx_of() { local i; for i in "${!order[@]}"; do [ "${order[$i]}" = "$1" ] && { echo "$i"; return 0; }; done; echo -1; }
  cur_idx=$(idx_of "$phase")

  if [ "$role" = "coder.md" ] && [ "$(cfg tier_flag "$tier" learner_writes_code)" = "1" ]; then
    deny "tier $tier is a learning task: the learner writes the code, not the coder agent. Use mentor.md for hints." "learn-coder"
  fi

  if [ "$is_gated" = 1 ]; then
    read -r first last <<< "$(cfg gate "$role")"
    f_idx=$(idx_of "$first"); l_idx=$(idx_of "$last")
    if [ "$f_idx" -eq -1 ] || [ "$l_idx" -eq -1 ]; then
      deny "$role is not part of tier $tier (phases: ${order[*]})." "not-in-tier:$role"
    fi
    if [ "$cur_idx" -lt "$f_idx" ] || [ "$cur_idx" -gt "$l_idx" ]; then
      deny "$role may run only in phases $first..$last (tier $tier). Current phase: $phase." "window:$role"
    fi
  fi

  if [ "$is_judge" = 1 ]; then
    key=$(cfg all_judges | tr ' ' '\n' | grep "=$role\$" | cut -d= -f1)
    judges=$(cfg judges "$tier")
    case " $judges " in
      *" $key "*) ;;
      *) deny "$role is not a judge of tier $tier (judges: $judges)." "not-a-judge:$role" ;;
    esac
    case "$phase" in
      judge_*) ;;
      *) deny "judges run only inside a judge phase; advance first. Current phase: $phase." "judge-window:$role" ;;
    esac
  fi
  return 0
}

run_hook "$@"
