#!/usr/bin/env python3
"""Locate the pipeline state that applies to a hook call, and write the hook log.

Code, pipeline.json and agents always come from the main checkout (this file's location after
worktree copies forwarded); only the state is per checkout. A linked worktree counts only when git
lists it, its .git file points into the main git dir, and it lies outside the main tree or under
<main>/.claude/worktrees/. Anything else resolves to the main checkout.

  checkout.py context [hook] [forwarded]   stdin: hook JSON (may be empty) -> one line of seven
      fields separated by \\x1f: state_root, source, gitdir, branch, main_root, tool_name,
      state_status (none | own:<tier>:<phase> | foreign:<why> | done | unreadable)
  checkout.py file <path>                  root\\x1fgitdir\\x1fbranch of the checkout owning <path>
  checkout.py log key=value ...            append one whitelisted JSON line to the hook log
"""
import collections
import errno
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.realpath(__file__))
sys.path.append(HERE)
import cfg  # noqa: E402

# \x1f is not IFS whitespace, so bash `read` keeps empty fields (no tool_name on Stop, no branch on
# a detached HEAD); a TAB would collapse them and shift every later field.
SEP = "\x1f"
# A hung git must turn into a crash the gate maps to a block, well inside the 15 s hook timeout.
GIT_TIMEOUT_SECONDS = 3
WORKTREES_DIR = os.path.join(".claude", "worktrees")
STATE_REL = os.path.join(".claude", "pipeline_state.json")
LOG_NAME = "pipeline-hooks.log"
# Readability cap per line; one short os.write per line keeps O_APPEND writes whole.
LOG_LINE_MAX_BYTES = 1000
LOG_VALUE_MAX_CHARS = 200
# Same value as pipeline.json hook_log_max_bytes; used only when pipeline.json cannot be read.
DEFAULT_LOG_MAX_BYTES = 262144
# Whitelist: tool_input, prompts, messages and the environment are never logged.
LOG_FIELDS = (
    "event", "hook", "tool", "agent_id", "checkout", "source", "forwarded", "decision", "reason", "rc",
    "judge", "verdict", "round", "path", "role_source", "transcript_kind", "transcript_lines",
    "handback_in_transcript", "bg_subagents_running", "bg_total", "grant", "issue",
)

Worktree = collections.namedtuple("Worktree", "root gitdir branch")
Resolution = collections.namedtuple("Resolution", "state_root source gitdir branch main_root")


class GitError(Exception):
    """`git worktree list` failed or returned no usable main worktree."""


def code_root():
    return os.path.realpath(os.path.join(HERE, "..", "..", ".."))


def is_under(path, root):
    return path == root or path.startswith(root.rstrip(os.sep) + os.sep)


def _records(root):
    try:
        out = subprocess.run(
            ["git", "-C", root, "worktree", "list", "--porcelain", "-z"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=GIT_TIMEOUT_SECONDS, check=True,
        ).stdout
    except (OSError, subprocess.SubprocessError) as exc:
        raise GitError(str(exc))
    records, cur = [], {}
    for token in out.split(b"\0"):
        if not token:
            if cur:
                records.append(cur)
                cur = {}
            continue
        key, _, value = os.fsdecode(token).partition(" ")
        cur[key] = value
    if cur:
        records.append(cur)
    return records


def _branch(record):
    ref = record.get("branch", "")
    prefix = "refs/heads/"
    return ref[len(prefix):] if ref.startswith(prefix) else ""


def linked_gitdir(root):
    """Target of the `gitdir:` line in <root>/.git, or None when <root>/.git is not such a file."""
    path = os.path.join(root, ".git")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, encoding="utf-8", errors="surrogateescape") as fh:
            line = fh.readline().rstrip("\r\n")
    except OSError:
        return None
    prefix = "gitdir: "
    if not line.startswith(prefix):
        return None
    target = line[len(prefix):]
    # worktree.useRelativePaths (git 2.48+) writes the path relative to the worktree root.
    if not os.path.isabs(target):
        target = os.path.join(root, target)
    return os.path.realpath(target)


def worktrees(root=None):
    """-> (accepted worktrees with the main one first, skipped [(path, why)])."""
    records = _records(root or code_root())
    if not records or "bare" in records[0] or "worktree" not in records[0]:
        raise GitError("no main worktree")
    main_root = os.path.realpath(records[0]["worktree"])
    main_gitdir = os.path.realpath(os.path.join(main_root, ".git"))
    if not os.path.isdir(main_gitdir):
        raise GitError("main .git is not a directory")
    accepted = [Worktree(main_root, main_gitdir, _branch(records[0]))]
    skipped = []
    admin_dir = os.path.join(main_gitdir, "worktrees")
    allowed_nest = os.path.join(main_root, WORKTREES_DIR)
    for rec in records[1:]:
        if "bare" in rec or "prunable" in rec:
            continue
        raw = rec.get("worktree", "")
        if not raw or SEP in raw or "\n" in raw:
            skipped.append((raw, "bad-path"))
            continue
        wt_root = os.path.realpath(raw)
        # Inside main's tree a worktree would win the longest-prefix match and re-label main's own
        # paths; .claude/worktrees/ is the one place worktrees are created on purpose.
        if is_under(wt_root, main_root) and not is_under(wt_root, allowed_nest):
            skipped.append((wt_root, "nested"))
            continue
        gitdir = linked_gitdir(wt_root)
        if gitdir is None or gitdir == admin_dir or not is_under(gitdir, admin_dir):
            skipped.append((wt_root, "bad-gitdir"))
            continue
        accepted.append(Worktree(wt_root, gitdir, _branch(rec)))
    return accepted, skipped


def _longest(accepted, path):
    best = None
    for wt in accepted:
        if is_under(path, wt.root) and (best is None or len(wt.root) > len(best.root)):
            best = wt
    return best


def _resolution(wt, source, main_root):
    return Resolution(wt.root, source, wt.gitdir, wt.branch, main_root)


def resolve_cwd(cwd):
    """-> (Resolution, skipped worktrees). Falls back to the main checkout for any cwd that is not
    inside a registered, accepted checkout, so a `cd` elsewhere never picks up a stray state."""
    try:
        accepted, skipped = worktrees()
    except GitError:
        root = code_root()
        fallback = Worktree(root, os.path.realpath(os.path.join(root, ".git")), "")
        return _resolution(fallback, "fallback:git-error", root), []
    main = accepted[0]
    target = os.path.realpath(cwd) if cwd else ""
    if not target or not os.path.isdir(target):
        return _resolution(main, "fallback:no-cwd", main.root), skipped
    pick = _longest(accepted, target)
    if pick is None:
        return _resolution(main, "fallback:unregistered", main.root), skipped
    return _resolution(pick, "cwd", main.root), skipped


def checkout_of(path):
    """The accepted checkout whose root is the longest component prefix of realpath(path)."""
    accepted, _ = worktrees()
    return _longest(accepted, os.path.realpath(path))


def _clean(value):
    return value if isinstance(value, str) and SEP not in value and "\n" not in value else ""


def read_state(root):
    """-> (status, state dict or None). status is none | unreadable | ok."""
    path = os.path.join(root, STATE_REL)
    if not os.path.lexists(path):
        return "none", None
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return "unreadable", None
    if not isinstance(data, dict):
        return "unreadable", None
    tier, phase = data.get("tier"), data.get("phase")
    if not _clean(tier) or not _clean(phase) or ":" in tier + phase:
        return "unreadable", None
    return "ok", data


def state_status(res):
    status, data = read_state(res.state_root)
    if status != "ok":
        return status
    if data["phase"] == "done":
        return "done"
    return "own:%s:%s" % (data["tier"], data["phase"])


def _log_path():
    gitdir = os.path.join(code_root(), ".git")
    if os.path.isdir(gitdir):
        return os.path.join(gitdir, LOG_NAME)
    return os.path.join(os.environ.get("TMPDIR") or "/tmp", "academy-pipeline-hooks-%d.log" % os.getuid())


def _log_max_bytes():
    try:
        value = cfg.load().get("hook_log_max_bytes", DEFAULT_LOG_MAX_BYTES)
    except (OSError, ValueError):
        return DEFAULT_LOG_MAX_BYTES
    return value if type(value) is int and value > 0 else DEFAULT_LOG_MAX_BYTES


def log_event(**fields):
    """Append one JSON line. Diagnostics only: an OSError is reported on stderr and swallowed, so
    no gate decision ever depends on the log."""
    record = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "pid": os.getpid()}
    for key in LOG_FIELDS:
        value = fields.get(key)
        if value is None or value == "":
            continue
        record[key] = value[:LOG_VALUE_MAX_CHARS] if isinstance(value, str) else value
    data = json.dumps(record, ensure_ascii=False).encode("utf-8", "replace")[:LOG_LINE_MAX_BYTES - 1] + b"\n"
    path = _log_path()
    try:
        try:
            if os.lstat(path).st_size > _log_max_bytes():
                os.replace(path, path + ".1")
        except FileNotFoundError:
            pass
        # O_APPEND makes "seek to end + write" one step for a regular file, so concurrent hooks never
        # overwrite each other; O_NOFOLLOW refuses a symlink planted at the log path.
        fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            os.write(fd, data)
        finally:
            os.close(fd)
    except OSError as exc:
        print("pipeline log write failed: %s" % errno.errorcode.get(exc.errno, exc.errno), file=sys.stderr)


def _hook_input():
    raw = sys.stdin.buffer.read().decode("utf-8", "replace")
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def _context(argv):
    hook = argv[0] if argv else ""
    forwarded = argv[1] if len(argv) > 1 else ""
    data = _hook_input()
    cwd = data.get("cwd") if isinstance(data.get("cwd"), str) else ""
    if not cwd:
        try:
            cwd = os.getcwd()
        except OSError:
            cwd = ""
    res, skipped = resolve_cwd(cwd)
    status = state_status(res)
    common = {"hook": hook, "forwarded": forwarded, "checkout": res.state_root, "source": res.source}
    for _, why in skipped:
        log_event(event="worktree-skipped:%s" % why, **common)
    if res.source != "cwd":
        log_event(event="resolve-fallback", **common)
    print(SEP.join([res.state_root, res.source, res.gitdir, _clean(res.branch), res.main_root,
                    _clean(data.get("tool_name")), status]))
    return 0


def _file(argv):
    if not argv:
        return 1
    wt = checkout_of(argv[0])
    if wt is not None:
        print(SEP.join([wt.root, wt.gitdir, wt.branch]))
    return 0


def _log(argv):
    fields = {}
    for arg in argv:
        key, sep, value = arg.partition("=")
        if sep:
            fields[key] = value
    log_event(**fields)
    return 0


def main(argv):
    commands = {"context": _context, "file": _file, "log": _log}
    if len(argv) < 2 or argv[1] not in commands:
        print(__doc__, file=sys.stderr)
        return 1
    return commands[argv[1]](argv[2:])


if __name__ == "__main__":
    sys.exit(main(sys.argv))
