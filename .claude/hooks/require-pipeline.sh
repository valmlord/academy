#!/bin/bash
# PreToolUse (Edit|Write|MultiEdit|NotebookEdit): file-write gate, decided on the target's real path.
#  1. Never written by tools, in any tier: .git paths and the git dir, session transcripts,
#     user-level settings, the pipeline grant file.
#  2. The main checkout's state and core are checked as absolute paths before any checkout mapping,
#     so no worktree layout can re-label them. Core is writable only in an own PIPELINE task in main.
#  3. Otherwise the checkout that owns the file governs: its state files are protected, its core is
#     never writable, .claude/ pipeline/ plans/ are open, everything else needs its active pipeline.
#  4. LEARN tier: product code is written by the learner; only meta paths and test files are writable.
HOOK_KIND=gate
case $0 in */*) HOOK_DIR=${0%/*} ;; *) HOOK_DIR=. ;; esac
# shellcheck source=lib/common.sh
source "$HOOK_DIR/lib/common.sh"

# Exit 0 = allow; exit 2 = block, stdout "<log reason>\x1f<message>"; anything else is a crash.
IFS= read -r -d '' GATE_PY <<'PY' || true
import fnmatch, json, os, sys
code_root, cwd_status = sys.argv[1], sys.argv[2]
sys.path.append(os.path.join(code_root, ".claude", "hooks", "lib"))
import cfg, checkout

OPEN_PREFIXES = (".claude/", "pipeline/", "plans/")


class Blocked(Exception):
    pass


def block(reason, message):
    raise Blocked(reason, message)


def tier_of(status):
    return status.split(":")[1] if status.startswith("own:") else ""


def has_flag(conf, tier, flag):
    return bool(conf["tiers"].get(tier, {}).get(flag)) if tier else False


def always_blocked(path, data, main, conf):
    parts = path.split(os.sep)
    # .git paths hold git hooks and config, and a worktree's .git file is what makes it a worktree.
    if ".git" in parts or checkout.is_under(path, main.gitdir):
        block("git-dir", "the git dir and .git paths are never written by tools")
    home = os.path.expanduser("~")
    projects = os.path.realpath(os.path.join(home, ".claude", "projects"))
    # Role detection reads these files; memory/ beside them stays writable for auto memory.
    if checkout.is_under(path, projects):
        rel_parts = os.path.relpath(path, projects).split(os.sep)
        if parts[-1].endswith((".jsonl", ".meta.json")) or "subagents" in rel_parts:
            block("transcript", "session transcripts are never written by tools")
    transcript, session = data.get("transcript_path"), data.get("session_id")
    if isinstance(transcript, str) and transcript and isinstance(session, str) and session:
        if checkout.is_under(path, os.path.realpath(os.path.join(os.path.dirname(transcript), session))):
            block("transcript", "session transcripts are never written by tools")
    # disableAllHooks there switches every hook off; Stepan edits these files by hand.
    if os.path.dirname(path) == os.path.realpath(os.path.join(home, ".claude")) and fnmatch.fnmatch(parts[-1], "settings*.json"):
        block("user-settings", "user-level settings are never written by tools; Stepan edits them by hand")
    if parts[-1] == os.path.basename(conf["grant_file"]):
        block("grant-file", "the pipeline grant file is never written by tools; Stepan writes it by hand")


def core_rule(rel, status, conf, is_main):
    if is_main and has_flag(conf, tier_of(status), "edits_pipeline_core"):
        return
    block("core:" + rel, "%s is pipeline core; writable only in a PIPELINE task in the main checkout "
          "(pause this one, then init PIPELINE <issue> with Stepan's grant)" % rel)


def main_zones(path, main, conf):
    """Main's state and core as absolute paths. -> True when the core rule allowed the write."""
    if path.startswith(os.path.join(main.root, ".claude", "pipeline_state")):
        block("state", "pipeline state is written only by pipeline-advance")
    for prefix in conf["pipeline_core_files"]:
        if path.startswith(os.path.join(main.root, prefix)):
            core_rule(os.path.relpath(path, main.root), checkout.status_of(main), conf, True)
            return True
    return False


def decide(data, conf):
    tool_input = data.get("tool_input") if isinstance(data.get("tool_input"), dict) else {}
    target = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
    if not isinstance(target, str) or not target:
        block("no-path", "the tool input names no file path")
    base = data.get("cwd") if isinstance(data.get("cwd"), str) and data.get("cwd") else os.getcwd()
    # Real path: a symlinked directory (apps/link -> ../.claude/hooks) must not launder a core write.
    path = os.path.realpath(os.path.join(base, target))
    accepted, _ = checkout.worktrees()
    main = accepted[0]
    always_blocked(path, data, main, conf)
    if main_zones(path, main, conf):
        return

    owner = checkout.owner_of(accepted, path)
    if owner is None:
        rel, status = path, cwd_status
    else:
        rel, status = os.path.relpath(path, owner.root), checkout.status_of(owner)
    # An accepted worktree under .claude/worktrees/ would have won the longest-prefix match above.
    if owner is main and checkout.is_under(path, os.path.join(main.root, checkout.WORKTREES_DIR)):
        block("unregistered-worktree:" + rel, "%s is under .claude/worktrees/ but not in a registered worktree; "
              "create worktrees with git worktree add" % rel)
    if any(rel.startswith(p) for p in conf["protected_files"]):
        block("protected:" + rel, "%s is pipeline runtime state. Use pipeline-advance.sh; never edit it directly." % rel)
    # PIPELINE runs only in the main checkout, so a linked worktree's core is never writable.
    if owner is not main and any(rel.startswith(p) for p in conf["pipeline_core_files"]):
        core_rule(rel, status, conf, False)
    if rel.startswith(OPEN_PREFIXES):
        return
    if status == "unreadable":
        block("state-unreadable:" + rel, "the pipeline state of the checkout owning %s is unreadable; Stepan inspects it" % rel)
    tier = tier_of(status)
    if not tier:
        block("no-pipeline:" + rel, "no active pipeline. Start one: bash .claude/hooks/pipeline-advance.sh init <TIER> <issue> "
              "(announce [TIER #n] pipeline: ...).")
    if has_flag(conf, tier, "learner_writes_code"):
        if any(rel.startswith(p) for p in conf["learn_tier_editable_paths"]):
            return
        if any(fnmatch.fnmatch(rel, g) or fnmatch.fnmatch("x/" + rel, g) for g in conf["learn_tier_test_globs"]):
            return
        block("learn:" + rel, "%s task: the learner writes %s. Explain, ask questions, review, write tests; "
              "do not edit product code." % (tier, rel))


raw = sys.stdin.read()
try:
    data = json.loads(raw) if raw.strip() else {}
except ValueError:
    data = {}
try:
    decide(data if isinstance(data, dict) else {}, cfg.load())
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
  case "$TOOL_NAME" in Edit|Write|MultiEdit|NotebookEdit) ;; *) return 0 ;; esac
  local verdict rc=0
  verdict=$(printf '%s' "$INPUT" | python3 -I -c "$GATE_PY" "$CODE_ROOT" "$STATE_STATUS") || rc=$?
  [ "$rc" = 0 ] && return 0
  [ "$rc" = 2 ] || return "$rc"
  deny "${verdict#*$'\x1f'}" "${verdict%%$'\x1f'*}"
}

run_hook "$@"
