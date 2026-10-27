#!/bin/bash
# PreToolUse (Bash): string heuristics for shell writes the write gate cannot see. A guardrail
# against mistakes, not a sandbox: `python3 -c`, variables and relative `cd` evade it (ADR-0005).
#  1. Pipeline integrity: no tool-issued command may name the state file or forge a judge vote.
#  2. Never, in any tier: core.hooksPath, and a write verb aimed at a .git path, session
#     transcripts, the grant file or user-level settings.
#  3. Pipeline core (.claude/hooks/, .claude/pipeline.json, .claude/settings*): shell writes only
#     from the main checkout in an own PIPELINE task.
#  4. LEARN tier: no shell writes into product code dirs, for every consulted checkout's state.
HOOK_KIND=gate
case $0 in */*) HOOK_DIR=${0%/*} ;; *) HOOK_DIR=. ;; esac
# shellcheck source=lib/common.sh
source "$HOOK_DIR/lib/common.sh"

# Exit 0 = allow; exit 2 = block, stdout "<log reason>\x1f<message>"; anything else is a crash.
IFS= read -r -d '' GUARD_PY <<'PY' || true
import json, os, re, sys
lib_dir, state_root, main_root, cwd_status = sys.argv[1:5]
sys.path.append(lib_dir)
import cfg, checkout

WRITE_VERB = (r"(?:>>?|\btee\b|\bsed\s+-i|\bperl\s+-pi|\bcp\b|\bmv\b|\brm\b|\bln\b|\bchmod\b|\btruncate\b"
              r"|\bgit\s+checkout\s+--|\bgit\s+restore\b)")
SAME_SEGMENT = r"[^|;&\n]*"
HOME = re.escape(os.path.expanduser("~"))
NEVER_WRITTEN = (
    ("git-dir", r"(?<![\w.-])\.git(?![\w.-])", "a .git path"),
    ("transcript", r"\.claude/projects/", "session transcripts"),
    ("grant-file", r"settings\.pipeline-grant", "the pipeline grant file"),
    ("user-settings", r"(?:~|\$HOME|\$\{HOME\}|" + HOME + r")/\.claude/settings", "user-level settings"),
)


class Blocked(Exception):
    pass


def writes_to(cmd, target):
    return re.search(WRITE_VERB + SAME_SEGMENT + target, cmd) is not None


def tier_of(status):
    return status.split(":")[1] if status.startswith("own:") else ""


def has_flag(conf, tier, flag):
    return bool(conf["tiers"].get(tier, {}).get(flag)) if tier else False


def decide(cmd, conf):
    if "core.hooksPath" in cmd:
        raise Blocked("hooks-path", "core.hooksPath is never changed by tools")
    for reason, target, what in NEVER_WRITTEN:
        if writes_to(cmd, target):
            raise Blocked(reason, "shell writes to %s are never allowed" % what)
    core = "(?:" + "|".join(re.escape(p) for p in conf["pipeline_core_files"]) + ")"
    # The main-checkout check keeps a PIPELINE state that ended up in a worktree from opening
    # main's core to shell writes.
    if writes_to(cmd, core) and not (state_root == main_root and has_flag(conf, tier_of(cwd_status), "edits_pipeline_core")):
        raise Blocked("core-shell", "shell writes to pipeline core (%s) are allowed only in a PIPELINE task in the "
                      "main checkout" % ", ".join(conf["pipeline_core_files"]))
    # The write gate cannot see shell targets, so every checkout the command names by absolute path
    # is consulted too: cd-ing to a non-LEARN worktree must not lift main's LEARN rule.
    consulted = [cwd_status]
    accepted, _ = checkout.worktrees()
    consulted += [checkout.status_of(wt) for wt in accepted if wt.root != state_root and wt.root in cmd]
    learn = [s for s in consulted if s == "unreadable" or has_flag(conf, tier_of(s), "learner_writes_code")]
    if not learn:
        return
    dirs = "|".join(re.escape(d.rstrip("/")) for d in conf["learn_tier_code_dirs"])
    if writes_to(cmd, r"\b(?:%s)/" % dirs):
        if "unreadable" in learn:
            raise Blocked("learn-shell-write:state-unreadable", "pipeline state unreadable; shell writes into product code are blocked")
        raise Blocked("learn-shell-write", "%s task: shell writes into product code are not allowed; the learner writes the code."
                      % tier_of(learn[0]))


raw = sys.stdin.read()
try:
    data = json.loads(raw) if raw.strip() else {}
except ValueError:
    data = {}
tool_input = data.get("tool_input") if isinstance(data, dict) and isinstance(data.get("tool_input"), dict) else {}
command = tool_input.get("command") if isinstance(tool_input.get("command"), str) else ""
try:
    decide(command, cfg.load())
except Blocked as exc:
    print("%s\x1f%s" % exc.args)
    sys.exit(2)
PY

deny() { # deny <message> <log reason>
  echo "BLOCKED: $1" >&2
  pl_log event=block decision=block reason="$2"
  exit 2
}

main_fn() {
  [ "$TOOL_NAME" = "Bash" ] || return 0
  local cmd verdict rc=0
  cmd=$(printf '%s' "$INPUT" | hookio field tool_input.command)

  if printf '%s' "$cmd" | grep -q "pipeline_state"; then
    deny "the pipeline state file is managed only by pipeline-advance.sh (use: pipeline-advance.sh status)." "state-string"
  fi
  if printf '%s' "$cmd" | grep -q "JUDGE_HOOK_CALLER"; then
    deny "judge votes are recorded only by the judge hooks from spawned judge agents." "judge-caller-string"
  fi

  verdict=$(printf '%s' "$INPUT" | python3 -I -c "$GUARD_PY" "$LIB" "$STATE_ROOT" "$MAIN_ROOT" "$STATE_STATUS") || rc=$?
  [ "$rc" = 0 ] && return 0
  [ "$rc" = 2 ] || return "$rc"
  deny "${verdict#*$'\x1f'}" "${verdict%%$'\x1f'*}"
}

run_hook "$@"
