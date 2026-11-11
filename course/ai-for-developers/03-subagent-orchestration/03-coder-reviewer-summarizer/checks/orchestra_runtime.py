"""Grader runtime shared by the command checks of module 03, L2-L6 (design #43 revision 6, section 4).

The same file is copied byte-identical into every lesson's checks/ directory that needs it; the master copy
is 02-role-contracts/checks/orchestra_runtime.py and `shared_files.py` at the module root copies it and
asserts identity. Parts, in order:

1. process plumbing, carried over from module 02 `grader_runtime.py` (4.1);
2. the call-line grammar and the call rules C3, C4, C6-C10 (4.3);
3. the JSON Schema subset of course rule D-S8 and role identification with its pre-flight (4.5);
4. received material: reference candidates, their resolution, and the searchable forms of the material
   (4.6; student fix round: other decodings, letter case, JSON escapes, pseudo-path aliases);
5. H7 tree snapshots (4.6), the per-request snapshot hook and the C9 user-scope configuration;
6. response values and result messages (4.4);
7. the fake `claude`: a threading AF_UNIX server with one handler thread per connection (4.2).

Every expected value comes from checks/data/ or from grader memory. Drawn values are never written to disk.

Hold-and-poll (Stepan 2026-11-04; plans/43-subagent-orchestration.md). A lesson closes "written with a delay
inside a call, deleted after it" by holding calls (`PlannedReply.hold_sec`, one random call per role for
1-3 s) and polling while each is held. Every poll is off by default; `StandardResponder` switches them on:

- `watch_config_during_hold=True`: each distinct `call_config_snapshot` (project and user scope, C9) ->
  `details["claudeConfigDuringHold"]`.
- `hold_snapshot=<callable returning a tree_snapshot>`: each distinct result -> `details["treeSnapshotsDuringHold"]`;
  `call_snapshots(records)` gives the arrival snapshots (`details["treeSnapshot"]`) and these, in arrival order,
  for `changes_seen` (H7, the coder's file as the coder left it).
- `watch_material_during_hold=True` (needs `run_dir`): a `MaterialWatch` over `details["material"]` stats every
  reference candidate of the arrival walk again (a named path absent at arrival counts once it appears), lists
  the run-dir directories they expand to, and re-reads a file whose (dev, inode, size, mtime ns, ctime ns)
  changed. Each content not seen before goes to `material.hold_versions[path]`, and its references are walked.
  `Material.all_versions()`, `all_text()` and `search_texts()` include the hold versions, so the leak search
  covers them once a lesson searches the arrival material object.

The server runs the polls as the hold starts, every HOLD_POLL_SEC (10 ms, counted from the end of a poll) and
once more just before the reply; a call with a watch and no hold is polled once. Under stream-json the reply's
`system/init` line reaches the caller as the hold starts and a working turn (an assistant text, a Read tool
use, its tool result: one content block per line) inside its first half (`FakeReply.stream`), as the real CLI
prints them while it works, so none of them marks the end of the polling;
the StructuredOutput tool use, its result and the `result` message come after the hold. Usage in a lesson:

    responder = MyResponder(..., run_dir=str(run_dir), watch_config_during_hold=True,
                            hold_snapshot=lambda: rt.tree_snapshot([scratch.root, copy], is_excluded),
                            watch_material_during_hold=True)
    ...  # the plan returns PlannedReply(scenario, output, hold_sec) with one long hold per role
    seen = rt.changes_seen(before, [*rt.call_snapshots(server.calls()), after])
    material = record.details["material"]   # rt.Material; material.search_texts() covers hold versions
"""

from __future__ import annotations

import base64
import codecs
import hashlib
import json
import math
import os
import re
import secrets
import shutil
import signal
import socket
import socketserver
import stat
import struct
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass, field
from pathlib import Path

# ---------------------------------------------------------------------------------------------------------
# 1. Process plumbing
# ---------------------------------------------------------------------------------------------------------

RECORD_LIMIT_BYTES = 4 << 20
CHILD_LANG = "C.UTF-8"
# 4.2: the socket path is substituted into the client; AF_UNIX allows 104 bytes on macOS and 108 on Linux.
SOCKET_PATH_LIMIT_BYTES = 100
# The scratch root lives under /tmp when it exists. Under macOS's default TMPDIR (/var/folders/...) the
# forkserver listener path inside <scratch>/tmp/pymp-*/ exceeds the 104-byte AF_UNIX limit, so a learner's
# honest ProcessPoolExecutor(forkserver) would crash for a reason that has nothing to do with the lesson.
SCRATCH_PARENT = "/tmp"
CHILD_SYSTEM_PATH = "/usr/bin:/bin"


class PlatformError(Exception):
    """The grading platform cannot produce a verdict. Reported as a platform error, never as a pass."""


@dataclass(frozen=True)
class Scratch:
    root: Path
    bin: Path
    home: Path
    tmp: Path
    socket_path: Path


def make_scratch() -> Scratch:
    """A private temp root (mode 0700) holding the fake's bin/, the socket, HOME and TMPDIR (4.1, 4.2).

    The root is resolved, so the macOS /private prefix never splits a path in two spellings.
    """
    parent = SCRATCH_PARENT if os.path.isdir(SCRATCH_PARENT) else None
    root = Path(os.path.realpath(tempfile.mkdtemp(prefix="academy-grader-", dir=parent)))
    os.chmod(root, 0o700)
    scratch = Scratch(root=root, bin=root / "bin", home=root / "home", tmp=root / "tmp", socket_path=root / "f.sock")
    for directory in (scratch.bin, scratch.home, scratch.tmp):
        directory.mkdir()
    return scratch


IGNORED_COPY_PARTS = ("__pycache__", ".git")


def copy_workspace(source: Path, scratch: Scratch, layout: str = "nested") -> Path:
    """Copy the workspace without `__pycache__/` and `.git/` (4.1).

    `nested` places the copy at `<scratch>/<rand>/workspace` (the module 02 layout), `flat` at
    `<scratch>/copy`; 4.6 runs its honest lines at both. Symlinks are dereferenced, as in module 02.
    """
    if layout == "nested":
        destination = Path(tempfile.mkdtemp(dir=scratch.root)) / "workspace"
    elif layout == "flat":
        destination = scratch.root / "copy"
    else:
        raise ValueError(f"unknown copy layout {layout!r}; expected 'nested' or 'flat'")
    shutil.copytree(source, destination, ignore=shutil.ignore_patterns(*IGNORED_COPY_PARTS),
                    ignore_dangling_symlinks=True)
    return destination


def child_environment(scratch: Scratch) -> dict[str, str]:
    """The environment every learner process starts with, built from scratch (4.1)."""
    python_dir = os.path.dirname(sys.executable)
    return {"PATH": f"{scratch.bin}:{python_dir}:{CHILD_SYSTEM_PATH}", "HOME": str(scratch.home),
            "TMPDIR": str(scratch.tmp), "LANG": CHILD_LANG}


def assert_no_real_claude(environment: dict[str, str], scratch: Scratch) -> None:
    """4.2: no `claude` may be reachable on the child PATH once the fake's own bin/ is left out."""
    other_dirs = [d for d in environment["PATH"].split(os.pathsep) if d and os.path.realpath(d) != str(scratch.bin)]
    found = shutil.which("claude", path=os.pathsep.join(other_dirs))
    if found is not None:
        raise PlatformError(f"на PATH проверки найден настоящий claude ({found}); проверка не может гарантировать, "
                            "что вызовы дойдут до тестового claude")


@dataclass(frozen=True)
class ProcessResult:
    code: int | None
    stdout: str
    stderr: str
    timed_out: bool


def _kill_group(process: subprocess.Popen[bytes]) -> None:
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    process.wait()


def run_process(command: list[str], cwd: Path, environment: dict[str, str], timeout_sec: float) -> ProcessResult:
    """Run a learner-controlled process in a new session; its whole process group is killed afterwards."""
    process = subprocess.Popen(command, cwd=cwd, env=environment, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, start_new_session=True)
    timed_out = False
    try:
        out, err = process.communicate(timeout=timeout_sec)
    except subprocess.TimeoutExpired:
        timed_out = True
        out, err = b"", b""
    _kill_group(process)
    code = None if timed_out else process.returncode
    return ProcessResult(code, out.decode("utf-8", "replace"), err.decode("utf-8", "replace"), timed_out)


def run_reporting_child(script: Path, args: list[str], cwd: Path, environment: dict[str, str],
                        timeout_sec: float) -> tuple[dict[str, object] | None, bool]:
    """Run `python3 -I -B <script> <fd> <nonce> args...` and return the record it wrote to the pipe (module 02).

    The record counts only when it is a JSON object with this run's nonce and the child exited 0.
    Returns (record or None, timed_out).
    """
    read_end, write_end = os.pipe()
    nonce = secrets.token_hex(16)
    chunks: list[bytes] = []

    def drain() -> None:
        size = 0
        while True:
            chunk = os.read(read_end, 65536)
            if not chunk:
                return
            size += len(chunk)
            if size <= RECORD_LIMIT_BYTES:
                chunks.append(chunk)

    command = [sys.executable, "-I", "-B", str(script), str(write_end), nonce, *args]
    process = subprocess.Popen(command, cwd=cwd, env=environment, stdin=subprocess.DEVNULL,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, pass_fds=(write_end,),
                               start_new_session=True)
    os.close(write_end)
    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    timed_out = False
    try:
        process.wait(timeout=timeout_sec)
    except subprocess.TimeoutExpired:
        timed_out = True
    _kill_group(process)
    reader.join(timeout=2)
    os.close(read_end)
    if timed_out or process.returncode != 0:
        return None, timed_out
    try:
        record = json.loads(b"".join(chunks).decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return None, False
    if not isinstance(record, dict) or record.get("nonce") != nonce:
        return None, False
    return record, False


def pipeline_command(checks_dir: Path, copy: Path, run_dir: Path, script: str = "pipeline/run.py") -> list[str]:
    """The pipeline launch line of 4.1, run with cwd = <copy>."""
    return [sys.executable, "-I", "-B", str(checks_dir / "launch.py"), "--copy", str(copy), "--script", script, "--",
            "--task", str(copy / "task" / "request.md"), "--acceptance", str(copy / "task" / "acceptance.md"),
            "--run-dir", str(run_dir)]


# ---------------------------------------------------------------------------------------------------------
# 2. Call-line grammar and call rules (4.3)
# ---------------------------------------------------------------------------------------------------------

ARITY_NONE, ARITY_ONE, ARITY_OPTIONAL, ARITY_VARIADIC = "none", "one", "optional", "variadic"
LIST_PIECE_SPLIT = re.compile(r"[,\s]+")
BUDGET_FORMAT = re.compile(r"^\d+(\.\d+)?$")
# task.md, the C10 list: the turn limit is an integer greater than zero, written in digits.
MAX_TURNS_FORMAT = re.compile(r"[0-9]+")
MCP_ALL = "mcp__*"
MCP_SERVER_ALL = re.compile(r"^mcp__[A-Za-z0-9_-]+?__\*$")
SCOPED_RULE = re.compile(r"^([A-Za-z]+)\(.*\)$", re.DOTALL)


@dataclass(frozen=True)
class FlagSpec:
    canonical: str
    spellings: tuple[str, ...]
    arity: str
    is_listed: bool


class FlagTable:
    """Every documented CLI flag (cli_flags.json) with the C10 list (role_flags.json) marked."""

    def __init__(self, cli_flags: dict[str, object], role_flags: dict[str, object]) -> None:
        listed = set(_str_list(role_flags["c10"]))
        self.by_spelling: dict[str, FlagSpec] = {}
        for row in _dict_list(cli_flags["flags"]):
            spellings = tuple(_str_list(row["spellings"]))
            spec = FlagSpec(spellings[0], spellings, str(row["arity"]), spellings[0] in listed)
            for spelling in spellings:
                self.by_spelling[spelling] = spec
        missing = listed - {spec.canonical for spec in self.by_spelling.values()}
        if missing:
            raise PlatformError(f"role_flags.json names flags missing from cli_flags.json: {sorted(missing)}")

    def lookup(self, spelling: str) -> FlagSpec | None:
        return self.by_spelling.get(spelling)


@dataclass
class FlagUse:
    spec: FlagSpec
    spelling: str
    values: list[str]
    is_attached: bool


@dataclass
class ParsedCall:
    uses: list[FlagUse] = field(default_factory=list)
    positionals: list[str] = field(default_factory=list)
    c10_args: list[str] = field(default_factory=list)
    unknown_args: list[str] = field(default_factory=list)
    format_faults: list[str] = field(default_factory=list)

    def all_uses(self, canonical: str) -> list[FlagUse]:
        return [use for use in self.uses if use.spec.canonical == canonical]

    def has(self, canonical: str) -> bool:
        return bool(self.all_uses(canonical))

    def values(self, canonical: str) -> list[str]:
        return [value for use in self.all_uses(canonical) for value in use.values]

    def list_pieces(self, canonical: str) -> list[str]:
        """List-flag values split on commas and whitespace, empty pieces dropped (4.3 Parsing)."""
        return [piece for value in self.values(canonical) for piece in LIST_PIECE_SPLIT.split(value) if piece]

    def to_record(self) -> dict[str, object]:
        return {"uses": [{"flag": u.spec.canonical, "spelling": u.spelling, "values": u.values,
                          "attached": u.is_attached} for u in self.uses],
                "positionals": self.positionals, "c10Args": self.c10_args, "unknownArgs": self.unknown_args,
                "formatFaults": self.format_faults}


def parse_call_line(argv: list[str], table: FlagTable) -> ParsedCall:
    """Parse a role call's argv (argv[0] is the program) by the 4.3 Parsing rules."""
    parsed = ParsedCall()
    args = argv[1:]
    seen: set[str] = set()
    index = 0
    while index < len(args):
        arg = args[index]
        if arg == "--":
            parsed.positionals.extend(args[index + 1:])
            break
        if not arg.startswith("-"):
            parsed.positionals.append(arg)
            index += 1
            continue
        name, equals, attached = arg.partition("=")
        spec = table.lookup(name if equals else arg)
        if spec is None:
            parsed.c10_args.append(arg)
            parsed.unknown_args.append(arg)
            index += 1
            continue
        if equals:
            use = FlagUse(spec, name, [attached], True)
            index += 1
            if spec.is_listed:
                parsed.format_faults.append(f"attached:{name}")
        else:
            use, index = _consume_values(spec, arg, args, index, parsed)
        if not spec.is_listed:
            parsed.c10_args.append(arg)
        elif spec.canonical in seen:
            parsed.format_faults.append(f"repeated:{spec.canonical}")
        seen.add(spec.canonical)
        parsed.uses.append(use)
    return parsed


def _consume_values(spec: FlagSpec, spelling: str, args: list[str], index: int,
                    parsed: ParsedCall) -> tuple[FlagUse, int]:
    following = args[index + 1:]
    if spec.arity == ARITY_NONE:
        return FlagUse(spec, spelling, [], False), index + 1
    if spec.arity == ARITY_ONE:
        if not following:
            parsed.format_faults.append(f"missing-value:{spec.canonical}")
            return FlagUse(spec, spelling, [], False), index + 1
        return FlagUse(spec, spelling, [following[0]], False), index + 2
    if spec.arity == ARITY_OPTIONAL:
        if following and not following[0].startswith("-"):
            return FlagUse(spec, spelling, [following[0]], False), index + 2
        return FlagUse(spec, spelling, [], False), index + 1
    taken: list[str] = []
    for value in following:
        if value.startswith("-"):
            break
        taken.append(value)
    if not taken:
        parsed.format_faults.append(f"missing-value:{spec.canonical}")
    return FlagUse(spec, spelling, taken, False), index + 1 + len(taken)


@dataclass(frozen=True)
class RoleSpec:
    """One role as the grader sees it for one call: its kind and the roles.json values drawn for it."""
    name: str
    is_coder: bool
    is_review: bool
    model: str
    budget_usd: float


@dataclass(frozen=True)
class CallFacts:
    """What the grader observed about a call besides its argv."""
    stdin: bytes
    environment: dict[str, str]
    base_environment: dict[str, str]
    contract_schema: object
    is_config_unchanged: bool


@dataclass(frozen=True)
class RuleFailure:
    rule_id: str
    message: str


def _tool_base(piece: str, known: dict[str, str]) -> str:
    """The tool a list piece names, ignoring a path scope and case (the C8 format rule reports those)."""
    scoped = SCOPED_RULE.match(piece)
    name = scoped.group(1) if scoped else piece
    return known.get(name.lower(), name)


def _is_tool_name_fault(piece: str, known: dict[str, str]) -> bool:
    if "(" in piece or ")" in piece:
        return True
    canonical = known.get(piece.lower())
    return canonical is not None and canonical != piece


# Variables that appear in an honest call without any learner code setting them, exempt from C8-env by name
# and only when the grader's child environment did not already hold them:
# - macOS CoreFoundation writes `__CF_USER_TEXT_ENCODING` into every process it initialises (the Linux image
#   never has it);
# - a POSIX shell sets `PWD`, `SHLVL` and `_` for the commands it starts, so a call made through a shell
#   (`shell=True`, a wrapper script, make) carries them. The orchestrator's decision after W0 (E4) makes such
#   a call honest. None of the three changes what a Claude Code call may do.
EXEMPT_ADDED_VARIABLES = ("__CF_USER_TEXT_ENCODING", "PWD", "SHLVL", "_")


def environment_changed(environment: dict[str, str], base: dict[str, str]) -> bool:
    """C8: a call may remove variables but must not add or change any (4.3)."""
    return any(base.get(name) != value for name, value in environment.items()
               if name not in EXEMPT_ADDED_VARIABLES or name in base)


def grade_call(parsed: ParsedCall, facts: CallFacts, role: RoleSpec, role_flags: dict[str, object]) -> list[RuleFailure]:
    """Grade one call line by C3, C4, C6-C10 with the precedence of 4.3.

    C10 first: if it fails, only C10 is reported for the line. Then C8: with no prompt left, only C8.
    Then C3, C4 and C6/C7 together. C9 and the environment part of C8 are evaluated for every call.
    """
    messages = _str_dict(role_flags["messages"])
    always: list[RuleFailure] = []
    if environment_changed(facts.environment, facts.base_environment):
        always.append(RuleFailure("C8", messages["C8-env"]))
    if not facts.is_config_unchanged:
        always.append(RuleFailure("C9", messages["C9"]))
    if parsed.c10_args:
        text = f"{messages['C10']}; {messages['C10-rest']}"
        if len(parsed.c10_args) == 1 and not parsed.positionals and not facts.stdin:
            text += f"; {messages['C10-prompt-hint']}"
        return [RuleFailure("C10", text), *always]
    has_prompt = bool(facts.stdin) or bool(parsed.positionals)
    if not has_prompt:
        return [RuleFailure("C8", messages["C8"]), *always]
    known = {name.lower(): name for name in _str_list(role_flags["knownTools"])}
    failures: list[RuleFailure] = []
    if not _meets_c3(parsed, role):
        failures.append(RuleFailure("C3", messages["C3"]))
    if not _meets_c4(parsed, facts.contract_schema):
        failures.append(RuleFailure("C4", messages["C4"]))
    if role.is_coder:
        failures.extend(_coder_failures(parsed, role_flags, known, messages))
    elif not _meets_c6(parsed, role, role_flags, known):
        failures.append(RuleFailure("C6", messages["C6"]))
    failures.extend(_c8_failures(parsed, role_flags, known, messages))
    return _unique(failures + always)


def _unique(failures: list[RuleFailure]) -> list[RuleFailure]:
    seen: set[tuple[str, str]] = set()
    result = []
    for failure in failures:
        key = (failure.rule_id, failure.message)
        if key not in seen:
            seen.add(key)
            result.append(failure)
    return result


def _meets_c3(parsed: ParsedCall, role: RoleSpec) -> bool:
    models = parsed.values("--model")
    budgets = parsed.values("--max-budget-usd")
    if not models or not budgets:
        return False
    if any(model != role.model for model in models):
        return False
    return all(BUDGET_FORMAT.match(b) is not None and float(b) == role.budget_usd for b in budgets)


def _meets_c4(parsed: ParsedCall, contract_schema: object) -> bool:
    values = parsed.values("--json-schema")
    if not values:
        return False
    for value in values:
        try:
            schema = json.loads(value)
        except ValueError:
            return False
        if not json_equal(schema, contract_schema):
            return False
    return True


def _meets_c6(parsed: ParsedCall, role: RoleSpec, role_flags: dict[str, object], known: dict[str, str]) -> bool:
    reader = _obj(role_flags["reader"])
    if not parsed.has("--tools"):
        return False
    tools = {_tool_base(p, known) for p in parsed.list_pieces("--tools")}
    required = set(_str_list(reader["reviewToolsRequired" if role.is_review else "toolsRequired"]))
    if not tools <= set(_str_list(reader["toolsAllowed"])) or not required <= tools:
        return False
    disallowed_raw = parsed.list_pieces("--disallowedTools")
    has_closure = parsed.has("--bare") or parsed.has("--strict-mcp-config") or MCP_ALL in disallowed_raw
    if not has_closure:
        return False
    allowed = {_tool_base(p, known) for p in parsed.list_pieces("--allowedTools")}
    if not allowed <= set(_str_list(reader["allowedToolsAllowed"])):
        return False
    for piece in disallowed_raw:
        if _is_mcp_closure(piece):
            continue
        base = _tool_base(piece, known)
        if base not in known.values() or base in required:
            return False
    return all(mode in _str_list(reader["modes"]) for mode in parsed.values("--permission-mode"))


def _coder_failures(parsed: ParsedCall, role_flags: dict[str, object], known: dict[str, str],
                    messages: dict[str, str]) -> list[RuleFailure]:
    """C7, one message per cause (re-run fix round): the mode, the allow rules, a missing approval, the tool set.

    A missing approval is reported only when the mode itself is acceptable: under `bypassPermissions` or
    `auto` edits do run without a prompt, so "edits need an approval" would misinform there.
    """
    coder = _obj(role_flags["coder"])
    modes = parsed.values("--permission-mode")
    failures = []
    mode_failure = _c7_mode_failure(modes, coder, messages)
    if mode_failure is not None:
        failures.append(mode_failure)
    allowed = {_tool_base(p, known) for p in parsed.list_pieces("--allowedTools")}
    if not allowed <= set(_str_list(coder["allowedToolsAllowed"])):
        failures.append(RuleFailure("C7", messages["C7-allow"]))
    elif mode_failure is None and str(coder["modeThatApproves"]) not in modes and "Edit" not in allowed:
        failures.append(RuleFailure("C7", messages["C7-approval"]))
    if not _meets_c7_tools(parsed, coder, known):
        failures.append(RuleFailure("C7", messages["C7-tools"]))
    return failures


def _c7_mode_failure(modes: list[str], coder: dict[str, object], messages: dict[str, str]) -> RuleFailure | None:
    accepted = {str(coder["modeThatApproves"]), *_str_list(coder["modesWithEditRule"])}
    if str(coder["courseRuleMode"]) in modes:
        return RuleFailure("C7", messages["C7-auto"])
    if str(coder["bypassMode"]) in modes:
        return RuleFailure("C7", messages["C7-bypass"])
    if any(mode not in accepted for mode in modes):
        return RuleFailure("C7", messages["C7-mode"])
    return None


def _meets_c7_tools(parsed: ParsedCall, coder: dict[str, object], known: dict[str, str]) -> bool:
    """`--tools`, when given, is a subset of the coder set holding Read and Edit; `--disallowedTools` removes
    neither of them, nor everything (`*`), and names only known tools or an MCP closure."""
    if parsed.has("--tools"):
        tools = {_tool_base(p, known) for p in parsed.list_pieces("--tools")}
        if not set(_str_list(coder["toolsRequired"])) <= tools or not tools <= set(_str_list(coder["toolsAllowed"])):
            return False
    for piece in parsed.list_pieces("--disallowedTools"):
        if _is_mcp_closure(piece):
            # Closing MCP takes away no built-in tool, so Read and Edit stay (student fix round, U1).
            continue
        base = _tool_base(piece, known)
        if piece == "*" or base in _str_list(coder["disallowedForbidden"]) or base not in known.values():
            return False
    return True


def _is_mcp_closure(piece: str) -> bool:
    """`mcp__*` or `mcp__<server>__*`: the --disallowedTools forms that close MCP for every role (C6, C7, C8)."""
    return piece == MCP_ALL or MCP_SERVER_ALL.match(piece) is not None


def _c8_failures(parsed: ParsedCall, role_flags: dict[str, object], known: dict[str, str],
                 messages: dict[str, str]) -> list[RuleFailure]:
    failures = []
    output_formats = parsed.values("--output-format")
    is_format_ok = (
        parsed.has("--print")
        and not parsed.format_faults
        and len(parsed.positionals) <= 1
        and len(output_formats) >= 1
        and all(value in _str_list(role_flags["outputFormats"]) for value in output_formats)
        and ("stream-json" not in output_formats or parsed.has("--verbose"))
    )
    if not is_format_ok:
        failures.append(RuleFailure("C8", messages["C8"]))
    pieces = [p for flag in ("--tools", "--allowedTools", "--disallowedTools") for p in parsed.list_pieces(flag)]
    if any(_is_tool_name_fault(piece, known) for piece in pieces):
        failures.append(RuleFailure("C8", messages["C8-tools"]))
    if not all(_is_turn_limit(value) for value in parsed.values("--max-turns")):
        failures.append(RuleFailure("C8", messages["C8-turns"]))
    return failures


def _is_turn_limit(value: str) -> bool:
    return MAX_TURNS_FORMAT.fullmatch(value) is not None and int(value) > 0


# ---------------------------------------------------------------------------------------------------------
# 3. JSON Schema subset (course rule D-S8) and role identification (4.5)
# ---------------------------------------------------------------------------------------------------------

DRAFT07_URIS = ("http://json-schema.org/draft-07/schema", "http://json-schema.org/draft-07/schema#")
SUBSET_TYPES = ("object", "array", "string", "integer", "number", "boolean", "null")
SUBSET_FORMATS = ("date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid")
SUBSET_KEYWORDS = ("type", "properties", "required", "items", "enum", "const", "additionalProperties",
                   "description", "title", "format", "$schema")


def json_equal(left: object, right: object) -> bool:
    """JSON Schema equality: numbers by value, booleans never equal to numbers, objects key by key."""
    if isinstance(left, bool) or isinstance(right, bool):
        return isinstance(left, bool) and isinstance(right, bool) and left == right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return left == right
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(json_equal(left[k], right[k]) for k in left)
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(json_equal(a, b) for a, b in zip(left, right))
    return type(left) is type(right) and left == right


def schema_subset_problems(schema: object, pointer: str = "#") -> list[str]:
    """Every place where `schema` leaves the course subset; each problem names the keyword and its pointer."""
    if not isinstance(schema, dict):
        return [f"{pointer}: схема должна быть объектом JSON"]
    problems: list[str] = []
    for keyword, value in schema.items():
        where = f"{pointer}/{keyword}"
        if keyword not in SUBSET_KEYWORDS:
            problems.append(f"{where}: ключевое слово {keyword!r} не входит в подмножество курса")
        elif keyword == "$schema" and (pointer != "#" or value not in DRAFT07_URIS):
            problems.append(f"{where}: допустим только адрес draft-07 (http://json-schema.org/draft-07/schema)")
        elif keyword == "type":
            problems.extend(_type_problems(value, where))
        elif keyword == "properties":
            if not isinstance(value, dict):
                problems.append(f"{where}: должен быть объектом")
            else:
                for name, sub in value.items():
                    problems.extend(schema_subset_problems(sub, f"{where}/{name}"))
        elif keyword == "required":
            if not isinstance(value, list) or not all(isinstance(v, str) for v in value) or len(set(value)) != len(value):
                problems.append(f"{where}: должен быть списком разных строк")
        elif keyword == "items":
            problems.extend(schema_subset_problems(value, where))
        elif keyword == "enum" and (not isinstance(value, list) or not value):
            problems.append(f"{where}: должен быть непустым списком")
        elif keyword == "additionalProperties" and value is not False:
            problems.append(f"{where}: в подмножестве курса допустимо только false")
        elif keyword in ("description", "title") and not isinstance(value, str):
            problems.append(f"{where}: должен быть строкой")
        elif keyword == "format" and value not in SUBSET_FORMATS:
            problems.append(f"{where}: значение {value!r} не из списка форматов, который принимает API")
    return problems


def _type_problems(value: object, where: str) -> list[str]:
    names = value if isinstance(value, list) else [value]
    if not names or not all(isinstance(n, str) and n in SUBSET_TYPES for n in names) or len(set(map(str, names))) != len(names):
        return [f"{where}: тип должен быть одним из {', '.join(SUBSET_TYPES)} или списком разных таких типов"]
    return []


def validate_instance(schema: dict[str, object], value: object) -> bool:
    """Draft-07 validation restricted to the subset; `schema` must already pass `schema_subset_problems`."""
    if "type" in schema:
        names = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_has_type(value, str(name)) for name in names):
            return False
    if "enum" in schema and not any(json_equal(value, option) for option in _list(schema["enum"])):
        return False
    if "const" in schema and not json_equal(value, schema["const"]):
        return False
    if isinstance(value, dict):
        properties = _obj(schema.get("properties", {}))
        if any(name not in value for name in _str_list(schema.get("required", []))):
            return False
        if schema.get("additionalProperties") is False and any(name not in properties for name in value):
            return False
        for name, sub in properties.items():
            if name in value and not validate_instance(_obj(sub), value[name]):
                return False
    if isinstance(value, list) and "items" in schema:
        return all(validate_instance(_obj(schema["items"]), item) for item in value)
    return True


def _has_type(value: object, name: str) -> bool:
    if name == "null":
        return value is None
    if name == "boolean":
        return isinstance(value, bool)
    if isinstance(value, bool):
        return False
    if name == "integer":
        return isinstance(value, int) or (isinstance(value, float) and math.isfinite(value) and value.is_integer())
    if name == "number":
        return isinstance(value, (int, float))
    return {"string": str, "object": dict, "array": list}[name] is type(value)


@dataclass(frozen=True)
class RoleSchema:
    role: str
    path: Path
    schema: object | None
    error: str | None


def load_role_schemas(contracts_dir: Path, roles: Iterable[str]) -> list[RoleSchema]:
    """Read `<contracts_dir>/<role>.schema.json` for every role; a parse error names the file and line."""
    loaded = []
    for role in roles:
        path = contracts_dir / f"{role}.schema.json"
        try:
            loaded.append(RoleSchema(role, path, json.loads(path.read_text(encoding="utf-8")), None))
        except FileNotFoundError:
            loaded.append(RoleSchema(role, path, None, f"{path.name}: файла нет"))
        except UnicodeDecodeError:
            loaded.append(RoleSchema(role, path, None, f"{path.name}: файл не в UTF-8"))
        except json.JSONDecodeError as error:
            loaded.append(RoleSchema(role, path, None, f"{path.name}, строка {error.lineno}: не JSON ({error.msg})"))
    return loaded


def schema_preflight(schemas: list[RoleSchema]) -> list[str]:
    """4.5 pre-flight: the roles' schemas must be pairwise unequal, else the call's role cannot be identified."""
    problems = []
    for index, first in enumerate(schemas):
        for second in schemas[index + 1:]:
            if first.schema is not None and second.schema is not None and json_equal(first.schema, second.schema):
                problems.append(f"схемы ролей `{first.path.name}` и `{second.path.name}` совпадают: роль вызова нельзя "
                                "определить; роли должны различаться схемой (см. бриф)")
    return problems


def identify_role(schema_value: str | None, schemas: list[RoleSchema]) -> str | None:
    """The role whose contract schema parses to JSON equal to the call's parsed `--json-schema` value."""
    if schema_value is None:
        return None
    try:
        parsed = json.loads(schema_value)
    except ValueError:
        return None
    for candidate in schemas:
        if candidate.schema is not None and json_equal(candidate.schema, parsed):
            return candidate.role
    return None


def inline_schema_problem(schema_value: str) -> str | None:
    """The diagnostic the fake prints for an invalid inline schema (4.4), or None when it is valid."""
    try:
        schema = json.loads(schema_value)
    except ValueError as error:
        return f"not JSON ({error})"
    problems = schema_subset_problems(schema)
    return problems[0] if problems else None


# ---------------------------------------------------------------------------------------------------------
# 4. Received material and references (4.6)
# ---------------------------------------------------------------------------------------------------------

WORD_PATTERN = re.compile(r"""[^\s"'`<>()\[\]{},;:=]+""")
SPAN_START_CHARACTERS = "/.~"
# Characters that continue a path name; every other non-alphanumeric character is a span boundary.
PATH_NAME_PUNCTUATION = "_-./~"
SPAN_ENDS_PER_START = 16
PATH_MAX_BYTES = 4096
PSEUDO_FILE_ROOTS = ("/proc", "/sys", "/dev")
PSEUDO_FILE_EXCEPTION = "/dev/shm"
MATERIAL_FILE_CAP = 4000
MATERIAL_BYTE_CAP = 32 << 20
# Authoring note (judge round 6, note 2): a run-dir file name must hold only these characters, or a span
# that stops at its first boundary names the whole run dir. Lessons use it for every name they print.
RUN_FILE_NAME = re.compile(r"^[A-Za-z0-9_.-]+$")


class MaterialCapError(PlatformError):
    """One call's material exceeded the 4000-file or 32 MB cap (4.6)."""


# Student fix round (Stepan, 2026-11-04): a file written in UTF-16 or UTF-32 carries the same text as its UTF-8
# twin, so every read file that is not plain UTF-8 text is also decoded in those encodings. The UTF-32 marks
# come first because the UTF-32-LE mark starts with the UTF-16-LE one.
BYTE_ORDER_MARKS = ((codecs.BOM_UTF32_LE, "utf-32-le"), (codecs.BOM_UTF32_BE, "utf-32-be"),
                    (codecs.BOM_UTF16_LE, "utf-16-le"), (codecs.BOM_UTF16_BE, "utf-16-be"))
UNMARKED_WIDE_ENCODINGS = ("utf-16-le", "utf-16-be", "utf-32-le", "utf-32-be")


def decoded_texts(content: bytes) -> list[str]:
    """Every text a file's bytes may hold: UTF-8 first (invalid bytes replaced), then UTF-16 and UTF-32.

    The wide decodings are added only when the bytes are not valid UTF-8 or hold a NUL byte: UTF-16 of ASCII
    text is valid UTF-8 with a NUL after every letter. A byte order mark picks its one encoding; without a mark
    all four byte orders are tried. Invalid sequences become U+FFFD, so each decoding is at most as long as the
    UTF-8 one and the 32 MB material cap bounds the cost.
    """
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        texts = [content.decode("utf-8", "replace")]
    else:
        if "\x00" not in text:
            return [text]
        texts = [text]
    for mark, encoding in BYTE_ORDER_MARKS:
        if content.startswith(mark):
            return [*texts, content[len(mark):].decode(encoding, "replace")]
    return [*texts, *(content.decode(encoding, "replace") for encoding in UNMARKED_WIDE_ENCODINGS)]


JSON_ESCAPE = re.compile(r'\\(?:u([0-9a-fA-F]{4})|(["\\/bfnrt]))')
JSON_SIMPLE_ESCAPES = {'"': '"', "\\": "\\", "/": "/", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t"}
SURROGATE = re.compile(r"[\ud800-\udfff]")
# A JSON string inside a JSON document inside a third one is escaped three times; deeper nesting is not a
# form an honest pipeline writes, and every round is one linear pass.
JSON_UNESCAPE_ROUNDS = 3


def _json_escape_value(match: re.Match[str]) -> str:
    return chr(int(match.group(1), 16)) if match.group(1) else JSON_SIMPLE_ESCAPES[match.group(2)]


def json_unescaped(text: str) -> str:
    """`text` with JSON string escapes undone, up to three nesting levels: `\\u0041`, `\\/`, `\\"`, `\\n`, ...

    Surrogate pairs written as two `\\u` escapes become one character; a lone surrogate becomes U+FFFD.
    """
    for _ in range(JSON_UNESCAPE_ROUNDS):
        if "\\" not in text:
            break
        unescaped = JSON_ESCAPE.sub(_json_escape_value, text)
        if SURROGATE.search(unescaped):
            unescaped = unescaped.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "replace")
        if unescaped == text:
            break
        text = unescaped
    return text


def search_forms(text: str) -> list[str]:
    """The forms of one text that a mark is searched in: casefolded, and casefolded with JSON escapes undone.

    Student fix round: a narrative upper-cased or JSON-escaped (`\\u006e\\u0074...`) is still the narrative.
    """
    folded = text.casefold()
    if "\\" not in text:
        return [folded]
    unescaped = json_unescaped(text).casefold()
    return [folded] if unescaped == folded else [folded, unescaped]


def material_search_texts(texts: Iterable[str], files: dict[str, bytes]) -> list[str]:
    """Every searchable form of a call's material: each root text, and each decoding of each file it reached.

    Build it once per call view and pass it to `has_mark`; for a material of n bytes it holds at most about
    5n characters (two forms of the UTF-8 decoding and of the four wide ones, which are shorter).
    """
    forms: list[str] = []
    for text in texts:
        forms.extend(search_forms(text))
    for content in files.values():
        for text in decoded_texts(content):
            forms.extend(search_forms(text))
    return forms


def has_mark(forms: Iterable[str], mark: str) -> bool:
    """True when `mark` occurs in any form, letter case ignored (`forms` come from `material_search_texts`)."""
    needle = mark.casefold()
    return any(needle in form for form in forms)


def is_boundary(character: str) -> bool:
    return character.isspace() or not (character.isalnum() or character in PATH_NAME_PUNCTUATION)


def raw_candidates(line: str) -> list[str]:
    """Words (the revision 4 references) and spans (revision 6) of one line, in that order."""
    found = [match.group() for match in WORD_PATTERN.finditer(line)]
    for start, character in enumerate(line):
        if character not in SPAN_START_CHARACTERS or (start > 0 and not is_boundary(line[start - 1])):
            continue
        ends = 0
        for end in range(start + 1, len(line) + 1):
            if end < len(line) and not is_boundary(line[end]):
                continue
            span = line[start:end]
            if len(span.encode("utf-8", "surrogatepass")) > PATH_MAX_BYTES:
                break
            found.append(span)
            ends += 1
            if ends >= SPAN_ENDS_PER_START:
                break
    return found


def normalised_forms(raw: str, home: str) -> list[str]:
    """Normalisation steps 1-4 of 4.6; the trailing-dot strip adds a candidate and keeps the original."""
    candidate = raw[1:] if raw.startswith("@") else raw
    candidate = re.sub(r"/+", "/", candidate)
    if candidate == "~" or candidate.startswith("~/"):
        candidate = home + candidate[1:]
    forms = [candidate]
    if len(candidate) >= 2 and candidate.endswith(".") and candidate[-2] not in "./":
        forms.append(candidate[:-1])
    return [form for form in forms if form]


def reference_candidates(text: str, home: str) -> list[str]:
    """Every distinct candidate of a text, in first-seen order."""
    seen: set[str] = set()
    ordered = []
    for line in text.split("\n"):
        if line.endswith("\r"):
            line = line[:-1]
        for raw in raw_candidates(line):
            for form in normalised_forms(raw, home):
                if form not in seen:
                    seen.add(form)
                    ordered.append(form)
    return ordered


def lies_in(path: str, root: str) -> bool:
    return path == root or path.startswith(root.rstrip("/") + "/")


def _in_run_dir(path: str, run_dir: str) -> bool:
    """Against both spellings of the run dir: as given (normalised) and its realpath (4.6 Terms)."""
    return lies_in(path, os.path.normpath(run_dir)) or lies_in(path, os.path.realpath(run_dir))


def _stepwise_path(absolute: str, run_dir: str) -> str | None:
    """Test S: resolve one component at a time until a prefix enters the run dir, then append the rest."""
    components = [c for c in os.path.normpath(absolute).split("/") if c]
    current = "/"
    for index, component in enumerate(components):
        current = os.path.realpath(os.path.join(current, component))
        if _in_run_dir(current, run_dir):
            rest = components[index + 1:]
            return os.path.join(current, *rest) if rest else current
    return None


def _is_pseudo(path: str) -> bool:
    if lies_in(path, PSEUDO_FILE_EXCEPTION):
        return False
    return any(lies_in(path, root) for root in PSEUDO_FILE_ROOTS)


# The resolver of `regular_file_targets`. Only the self-test replaces it: macOS has no /proc, so the test
# reproduces what Linux realpath returns for a `/proc/<pid>/fd/<n>` link to an unlinked file or a memfd.
resolve_path: Callable[[str], str] = os.path.realpath


def regular_file_targets(path: str) -> list[str]:
    """The names a regular file at `path` is read under: its realpath, or nothing when that is a pseudo file.

    Re-run fix round (L3 N2, N2b): a `/proc/<pid>/fd/<n>` link to an unlinked file or to a memfd resolves to a
    name that does not exist (`/tmp/x (deleted)`, `/memfd:x (deleted)`), or to another file a pipeline put
    under that name, while opening the link still reaches the open file. Whenever the realpath is not the file
    that `path` opens, the file is read through `path` as written; the pseudo filter applies only to a realpath
    that is that file, so `/proc/self/status` stays unread and `/proc/self/root/<path>` is read as `<path>`.
    """
    try:
        opened = os.stat(path)
    except (OSError, ValueError, UnicodeEncodeError):
        return []
    real = resolve_path(path)
    try:
        resolved = os.stat(real)
    except (OSError, ValueError, UnicodeEncodeError):
        return [path]
    if (resolved.st_dev, resolved.st_ino) != (opened.st_dev, opened.st_ino):
        return [path]
    return [] if _is_pseudo(real) else [real]


@dataclass
class Material:
    """What one call received: the root texts and every file reached from them (4.6).

    `candidates` are the reference candidates the walk tried, so a `MaterialWatch` can stat them again.
    `anchored_candidates` are the absolute paths tried for relative candidates found in a file, joined with
    that file's folder (`anchor_dirs`: every folder a read file was reached in), and `anchored_expandable` those
    of them that may expand as a directory; `stat_calls` stays the 4.6 count and `anchored_stat_calls` counts
    these.
    `hold_versions` holds, per path, each content a `MaterialWatch` read during the hold that differs from
    the arrival content and from every earlier hold version; it stays empty without the watch.
    """
    texts: list[str]
    files: dict[str, bytes] = field(default_factory=dict)
    expanded: list[str] = field(default_factory=list)
    unreadable: list[str] = field(default_factory=list)
    stat_calls: int = 0
    seconds: float = 0.0
    candidates: list[str] = field(default_factory=list)
    hold_versions: dict[str, list[bytes]] = field(default_factory=dict)
    anchored_candidates: list[str] = field(default_factory=list)
    anchored_expandable: list[str] = field(default_factory=list)
    anchor_dirs: dict[str, list[str]] = field(default_factory=dict)
    anchored_stat_calls: int = 0

    def all_versions(self) -> Iterator[tuple[str, bytes]]:
        """Every (path, content) the call could read: the arrival content, then each hold version."""
        yield from self.files.items()
        for path, contents in self.hold_versions.items():
            for content in contents:
                yield path, content

    def all_text(self) -> Iterator[str]:
        """The root texts, then every decoding of every version of every file (`decoded_texts`)."""
        yield from self.texts
        for _, content in self.all_versions():
            yield from decoded_texts(content)

    def search_texts(self) -> list[str]:
        """`material_search_texts` of this material, over every version of every file."""
        return material_search_texts(self.texts, {f"{index}:{path}": content
                                                  for index, (path, content) in enumerate(self.all_versions())})


class _MaterialWalk:
    """The 4.6 walk, plus one resolution 4.6 lacks (N5 fix round, L4 student final run 2).

    4.6 joins a relative candidate with the call's cwd. A model that reads `<run>/security/brief.txt` and finds
    "the places are in notes.txt next to this file" opens `<run>/security/notes.txt`. So a relative candidate
    found in a file's content is also joined with the folder of that file: the folder of the name it was reached
    under and the folder of its realpath (`anchor_dirs`). The joined path goes through the same rules as any
    candidate: a regular file is read wherever it is, a directory expands only inside the run dir, pseudo files
    are skipped, and the 4000-file / 32 MB caps hold. A file reached again under a new folder is searched again
    for that folder only.

    Two limits keep words that are not pointers from expanding a run-dir folder (an honest findings file in
    the run dir holds quoted source lines and section names): a candidate made only of `.` and `..` (`"."` in a
    quote names the file's own folder, not a file next to it) is not joined, and a joined directory expands
    only when the candidate is written with a `/` (`places/`, `../shared/`); a bare word (`security`) joins
    to a regular file only.
    """

    def __init__(self, cwd: str, home: str, run_dir: str, translate: Callable[[str], str]) -> None:
        self.cwd, self.home, self.run_dir, self.translate = cwd, home, run_dir, translate
        self.seen_candidates: set[str] = set()
        self.seen_anchored: set[str] = set()
        self.expandable_anchored: set[str] = set()
        self.anchor_dirs: dict[str, set[str]] = {}
        self.applied_dirs: dict[str, set[str]] = {}
        self.total_bytes = 0

    def run(self, texts: list[str]) -> Material:
        started = time.monotonic()
        material = Material(texts=list(texts))
        queue: list[tuple[str, frozenset[str]]] = [(text, frozenset()) for text in texts]
        while queue:
            text, folders = queue.pop()
            for target in self._text_targets(text, folders, material):
                content = self._read(target, material)
                if content is not None:
                    # A first read: its texts are searched with every folder the file was reached in.
                    new_folders = frozenset(self.anchor_dirs.get(target, ()))
                else:
                    # Read before: searched again only for folders it was not reached in then.
                    content, new_folders = material.files.get(target), self._unapplied_dirs(target)
                    if content is None or not new_folders:
                        continue
                self.applied_dirs.setdefault(target, set()).update(new_folders)
                queue.extend((decoded, new_folders) for decoded in decoded_texts(content))
        material.seconds = time.monotonic() - started
        material.candidates = sorted(self.seen_candidates)
        material.anchored_candidates = sorted(self.seen_anchored)
        material.anchored_expandable = sorted(self.expandable_anchored)
        material.anchor_dirs = {target: sorted(folders) for target, folders in self.anchor_dirs.items()}
        return material

    def _text_targets(self, text: str, folders: frozenset[str], material: Material) -> Iterator[str]:
        """The targets of every new candidate of `text`, and of every new join of its relative candidates with
        `folders` (the folders of the file the text came from; empty for a root text)."""
        for candidate in reference_candidates(text, self.home):
            if candidate not in self.seen_candidates:
                self.seen_candidates.add(candidate)
                yield from self._targets(candidate, material)
            if candidate.startswith("/"):
                continue
            for anchored in self._anchored_paths(candidate, folders):
                yield from self._anchored_targets(anchored, material)

    def _anchored_paths(self, candidate: str, folders: frozenset[str]) -> list[str]:
        """The new joins of a relative candidate with each folder; a join equal to the cwd join is 4.6's own."""
        if not folders or all(part in ("", ".", "..") for part in candidate.split("/")):
            return []
        cwd_join = os.path.normpath(os.path.join(self.cwd, candidate))
        joined = []
        may_expand = "/" in candidate
        for folder in sorted(folders):
            anchored = os.path.normpath(os.path.join(folder, candidate))
            if anchored == cwd_join:
                continue
            # A path first joined from a bare word ("places are ...") is tried again as a directory when a later
            # candidate writes it with a slash ("./places/").
            is_new = anchored not in self.seen_anchored
            is_upgrade = may_expand and anchored not in self.expandable_anchored
            if not (is_new or is_upgrade):
                continue
            self.seen_anchored.add(anchored)
            if may_expand:
                self.expandable_anchored.add(anchored)
            joined.append(anchored)
        return joined

    def _unapplied_dirs(self, target: str) -> frozenset[str]:
        return frozenset(self.anchor_dirs.get(target, set()) - self.applied_dirs.get(target, set()))

    def _note_anchor(self, targets: list[str], named: str) -> list[str]:
        for target in targets:
            self.anchor_dirs.setdefault(target, set()).update(
                {os.path.dirname(os.path.abspath(named)), os.path.dirname(target)})
        return targets

    def _targets(self, candidate: str, material: Material) -> list[str]:
        path = self.translate(candidate) if candidate.startswith("/") else os.path.join(self.cwd, candidate)
        material.stat_calls += 1
        return self._path_targets(path, material)

    def _anchored_targets(self, path: str, material: Material) -> list[str]:
        """`_targets` of a joined path: already a filesystem path, so it is not translated."""
        material.anchored_stat_calls += 1
        return self._path_targets(path, material, may_expand=path in self.expandable_anchored)

    def _path_targets(self, path: str, material: Material, may_expand: bool = True) -> list[str]:
        try:
            mode = os.stat(path).st_mode
        except (OSError, ValueError, UnicodeEncodeError):
            # 4.6: a nonexistent candidate, or one the OS cannot take as a name (too long, NUL, a lone
            # surrogate), is ignored (accuracy round 6, note 1).
            return []
        if stat.S_ISREG(mode):
            return self._note_anchor(self._file_targets(path), path)
        if stat.S_ISDIR(mode) and may_expand:
            return self._expand(os.path.abspath(path), material)
        return []

    def _expansion_top(self, absolute: str) -> str | None:
        """The run-dir directory a directory candidate expands to, or None outside the run dir."""
        lexical, real = os.path.normpath(absolute), os.path.realpath(absolute)
        stepwise = _stepwise_path(absolute, self.run_dir)
        if _in_run_dir(lexical, self.run_dir):
            return lexical
        if _in_run_dir(real, self.run_dir):
            return real
        if stepwise is not None and _in_run_dir(stepwise, self.run_dir):
            return stepwise
        return None

    def _expand(self, absolute: str, material: Material) -> list[str]:
        top = self._expansion_top(absolute)
        if top is None:
            return []
        material.expanded.append(top)
        files, stack, visited = [], [top], set()
        while stack:
            directory = stack.pop()
            real_directory = os.path.realpath(directory)
            if real_directory in visited or _is_pseudo(real_directory):
                continue
            visited.add(real_directory)
            try:
                entries = os.listdir(directory)
            except OSError:
                material.unreadable.append(directory)
                continue
            for entry in entries:
                entry_path = os.path.join(directory, entry)
                if os.path.isdir(entry_path):
                    stack.append(entry_path)
                elif os.path.isfile(entry_path):
                    files.extend(self._note_anchor(self._file_targets(entry_path), entry_path))
        return files

    def _file_targets(self, path: str) -> list[str]:
        return regular_file_targets(path)

    def _read(self, target: str, material: Material) -> bytes | None:
        if target in material.files:
            return None
        try:
            with open(target, "rb") as handle:
                content = handle.read(MATERIAL_BYTE_CAP + 1)
        except OSError:
            material.unreadable.append(target)
            return None
        material.files[target] = content
        self.total_bytes += len(content)
        if len(material.files) > MATERIAL_FILE_CAP or self.total_bytes > MATERIAL_BYTE_CAP:
            raise MaterialCapError(f"материал одного вызова больше {MATERIAL_FILE_CAP} файлов или "
                                   f"{MATERIAL_BYTE_CAP >> 20} МБ")
        return content


def resolve_material(texts: list[str], *, cwd: str, home: str, run_dir: str,
                     translate: Callable[[str], str] = lambda path: path) -> Material:
    """Read everything a call received (4.6): the texts and every file their references reach, transitively.

    `translate` maps an absolute candidate to the filesystem path that is stat'ed; the grader passes the
    identity, and only the prototype-parity demo maps a simulated /tmp.
    """
    return _MaterialWalk(cwd, home, run_dir, translate).run(texts)


FileSignature = tuple[int, int, int, int, int]


def file_signature(path: str) -> FileSignature | None:
    """(device, inode, size, mtime ns, ctime ns), or None when `path` cannot be stat'ed.

    Any write changes the ctime, and `os.utime` cannot set it back, so an unchanged signature means unchanged
    content on a filesystem with nanosecond ctimes (APFS, ext4, overlayfs, tmpfs).
    """
    try:
        info = os.stat(path)
    except (OSError, ValueError, UnicodeEncodeError):
        return None
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns


class _CachedTargetsWalk(_MaterialWalk):
    """A walk that reuses `regular_file_targets` of a file, and the expansion top of a directory, while the
    path's `file_signature` is unchanged.

    Re-polling stats every candidate; the realpaths behind those two answers are the expensive part (one lstat
    per path component). They can only change when what the path opens changes (a symlink on the way
    re-pointed, a directory replaced), and the signature, device and inode included, reflects that.
    """

    def __init__(self, cwd: str, home: str, run_dir: str, translate: Callable[[str], str]) -> None:
        super().__init__(cwd, home, run_dir, translate)
        self.target_cache: dict[str, tuple[FileSignature, list[str]]] = {}
        self.top_cache: dict[str, tuple[FileSignature, str | None]] = {}

    def _expansion_top(self, absolute: str) -> str | None:
        signature = file_signature(absolute)
        cached = self.top_cache.get(absolute)
        if signature is not None and cached is not None and cached[0] == signature:
            return cached[1]
        top = super()._expansion_top(absolute)
        if signature is not None:
            self.top_cache[absolute] = (signature, top)
        return top

    def _file_targets(self, path: str) -> list[str]:
        signature = file_signature(path)
        if signature is None:
            return []
        cached = self.target_cache.get(path)
        if cached is not None and cached[0] == signature:
            return cached[1]
        targets = regular_file_targets(path)
        self.target_cache[path] = (signature, targets)
        return targets


class MaterialWatch:
    """Re-reads one call's material while the call is held (hold-and-poll round).

    Each `poll` stats again every reference candidate of the arrival walk (so a named path that did not
    exist at arrival is picked up when it appears), lists every run-dir directory a candidate expands to
    (so a new file there is read), and reads a file only when its `file_signature` changed. A content that
    differs from the arrival content and from every earlier hold version is appended to
    `material.hold_versions`, and the references in it are walked at once, so a rewrite that names a new file
    also brings that file in. A relative reference in a file is also joined with each folder the file was
    reached in, as in the arrival walk (`_MaterialWalk`, N5), and those joins are stat'ed again on every poll.
    The caps of the arrival walk cover the hold versions too (`MaterialCapError`).
    """

    def __init__(self, material: Material, *, cwd: str, home: str, run_dir: str,
                 translate: Callable[[str], str] = lambda path: path) -> None:
        self.material = material
        self.walk = _CachedTargetsWalk(cwd, home, run_dir, translate)
        self.walk.seen_candidates = set(material.candidates)
        self.walk.seen_anchored = set(material.anchored_candidates)
        self.walk.expandable_anchored = set(material.anchored_expandable)
        self.walk.anchor_dirs = {target: set(folders) for target, folders in material.anchor_dirs.items()}
        self.walk.applied_dirs = {target: set(folders) for target, folders in material.anchor_dirs.items()}
        self.walk.total_bytes = sum(len(content) for _, content in material.all_versions())
        self.signatures: dict[str, FileSignature] = {}
        self.polls = 0
        # `_targets` counts stats and records expansions on the Material it is given; the watch keeps that
        # bookkeeping off the arrival material, whose `stat_calls` and `seconds` some lessons grade.
        self._accounting = Material(texts=[])

    def poll(self) -> None:
        self.polls += 1
        pending: list[tuple[str, bool]] = [(candidate, False) for candidate in self.walk.seen_candidates]
        pending.extend((anchored, True) for anchored in self.walk.seen_anchored)
        while pending:
            candidate, is_anchored = pending.pop()
            if is_anchored:
                targets = self.walk._anchored_targets(candidate, self._accounting)
            else:
                targets = self.walk._targets(candidate, self._accounting)
            for target in targets:
                pending.extend(self._new_candidates(target, self._check(target)))

    def _check(self, target: str) -> bytes | None:
        """The content of `target` when it is a new version, else None."""
        signature = file_signature(target)
        if signature is None or self.signatures.get(target) == signature:
            return None
        self.signatures[target] = signature
        try:
            with open(target, "rb") as handle:
                content = handle.read(MATERIAL_BYTE_CAP + 1)
        except OSError:
            return None
        known = self.material.hold_versions.get(target, [])
        if content in known or self.material.files.get(target) == content:
            return None
        known.append(content)
        self.material.hold_versions[target] = known
        self.walk.total_bytes += len(content)
        version_count = len(self.material.files) + sum(map(len, self.material.hold_versions.values()))
        if version_count > MATERIAL_FILE_CAP or self.walk.total_bytes > MATERIAL_BYTE_CAP:
            raise MaterialCapError(f"материал одного вызова больше {MATERIAL_FILE_CAP} версий файлов или "
                                   f"{MATERIAL_BYTE_CAP >> 20} МБ")
        return content

    def _new_candidates(self, target: str, content: bytes | None) -> list[tuple[str, bool]]:
        """The new candidates of a new version of `target` (relative ones also joined with every folder the file
        was reached in), or of its known versions when it was just reached in a new folder."""
        if content is not None:
            folders = frozenset(self.walk.anchor_dirs.get(target, ()))
            contents = [content]
        else:
            folders = self.walk._unapplied_dirs(target)
            if not folders:
                return []
            contents = [version for path, version in self.material.all_versions() if path == target]
        self.walk.applied_dirs.setdefault(target, set()).update(folders)
        found: list[tuple[str, bool]] = []
        for version in contents:
            for text in decoded_texts(version):
                for candidate in reference_candidates(text, self.walk.home):
                    if candidate not in self.walk.seen_candidates:
                        self.walk.seen_candidates.add(candidate)
                        found.append((candidate, False))
                    if not candidate.startswith("/"):
                        found.extend((anchored, True) for anchored in self.walk._anchored_paths(candidate, folders))
        return found


def call_texts(parsed: ParsedCall, stdin: bytes, cwd: str, role_flags: dict[str, object]) -> list[str]:
    """The root texts of a call's material: stdin, the positional prompt, the system-prompt values and the
    contents of the files named by the `-file` forms (4.6). A missing `-file` target contributes nothing."""
    texts = [stdin.decode("utf-8", "replace")] if stdin else []
    texts.extend(parsed.positionals)
    for flag in _str_list(role_flags["materialValueFlags"]):
        texts.extend(parsed.values(flag))
    for flag in _str_list(role_flags["materialFileFlags"]):
        for value in parsed.values(flag):
            try:
                with open(os.path.join(cwd, value), "rb") as handle:
                    texts.extend(decoded_texts(handle.read(MATERIAL_BYTE_CAP)))
            except (OSError, ValueError):
                continue
    return texts


# ---------------------------------------------------------------------------------------------------------
# 5. H7 tree snapshots (4.6)
# ---------------------------------------------------------------------------------------------------------

MULTIPROCESSING_TEMP_PREFIX = "pymp-"


def _entry_digest(path: str) -> str:
    try:
        info = os.lstat(path)
    except FileNotFoundError:
        return "gone"
    if stat.S_ISLNK(info.st_mode):
        return "link:" + os.readlink(path)
    if stat.S_ISDIR(info.st_mode):
        return "dir"
    if stat.S_ISSOCK(info.st_mode):
        return "socket"
    if not stat.S_ISREG(info.st_mode):
        return f"special:{stat.S_IFMT(info.st_mode)}"
    digest = hashlib.sha256()
    try:
        with open(path, "rb") as handle:
            for chunk in iter(lambda: handle.read(1 << 20), b""):
                digest.update(chunk)
    except OSError:
        return f"unreadable:{info.st_mode:o}:{info.st_size}"
    return "file:" + digest.hexdigest()


def tree_snapshot(roots: Iterable[Path], is_excluded: Callable[[str], bool]) -> dict[str, str]:
    """Path set and content hash of every entry under the roots, symlinks not followed, no name exclusion."""
    snapshot: dict[str, str] = {}
    for root in roots:
        for directory, subdirs, files in os.walk(root, followlinks=False):
            subdirs[:] = [d for d in subdirs if not is_excluded(os.path.join(directory, d))]
            for name in subdirs + files:
                path = os.path.join(directory, name)
                if not is_excluded(path):
                    snapshot[path] = _entry_digest(path)
    return snapshot


def h7_exclusion(run_dir: Path, excluded_files: Iterable[Path], tmpdir: Path) -> Callable[[str], bool]:
    """Excluded by role, not by name (4.6 H7): the current run dir, the coder's change, and multiprocessing's
    own `pymp-*` directories directly under TMPDIR."""
    run = str(run_dir)
    files = {str(path) for path in excluded_files}
    tmp = str(tmpdir)

    def is_excluded(path: str) -> bool:
        if lies_in(path, run) or path in files:
            return True
        if path == tmp or not lies_in(path, tmp):
            return False
        return path[len(tmp.rstrip("/")) + 1:].split("/", 1)[0].startswith(MULTIPROCESSING_TEMP_PREFIX)

    return is_excluded


CLAUDE_CONFIG_FILES = (".claude/settings.json", ".claude/settings.local.json", ".mcp.json")
CLAUDE_AGENTS_DIR = ".claude/agents"


def claude_config_snapshot(project: Path) -> dict[str, str]:
    """C9: the project's Claude Code configuration as the call saw it, by relative path and content hash.

    An absent file is recorded as absent, so creating `settings.local.json` or `.mcp.json` is a change.
    """
    snapshot = {name: _entry_digest(str(project / name)) for name in CLAUDE_CONFIG_FILES}
    agents = project / CLAUDE_AGENTS_DIR
    snapshot[CLAUDE_AGENTS_DIR] = _entry_digest(str(agents))
    if agents.is_dir():
        for path in tree_snapshot([agents], lambda _: False):
            snapshot[os.path.relpath(path, project)] = _entry_digest(path)
    return snapshot


def tree_changes(before: dict[str, str], after: dict[str, str]) -> list[str]:
    """Paths added, removed or changed between two snapshots, sorted."""
    return sorted(path for path in before.keys() | after.keys() if before.get(path) != after.get(path))


# C9, student fix round: a headless call also loads the user's Claude Code configuration (settings, agents,
# skills, memory, MCP servers in `~/.claude.json`) and the managed settings. Writing any of them changes what
# every later call may do, outside the call line. The grader's HOME starts empty, and the managed locations
# are compared with what they held when the grader started.
USER_CONFIG_ENTRIES = (".claude", ".claude.json")
MANAGED_CONFIG_DIRS = ("/etc/claude-code", "/Library/Application Support/ClaudeCode")
USER_CONFIG_KEY_PREFIX = "user-scope:"


def user_config_snapshot(home: Path) -> dict[str, str]:
    """Every path under `<home>/.claude/`, `<home>/.claude.json` and the managed settings directories, by
    absolute path and content hash; an absent root is recorded as absent."""
    roots = [str(home / entry) for entry in USER_CONFIG_ENTRIES] + list(MANAGED_CONFIG_DIRS)
    snapshot = {root: _entry_digest(root) for root in roots}
    snapshot.update(tree_snapshot([Path(root) for root in roots if os.path.isdir(root) and not os.path.islink(root)],
                                  lambda _: False))
    return snapshot


def call_config_snapshot(project: Path, user_changes: dict[str, str]) -> dict[str, str]:
    """The configuration one call saw: the project snapshot, plus one `user-scope:` entry per user-scope path
    that differs from the grader's start. With no user-scope change it equals `claude_config_snapshot(project)`,
    so a lesson that compares it with its own project snapshot reports a user-scope change as C9."""
    snapshot = claude_config_snapshot(project)
    snapshot.update({USER_CONFIG_KEY_PREFIX + path: digest for path, digest in user_changes.items()})
    return snapshot


def changes_seen(before: dict[str, str], snapshots: Iterable[dict[str, str]]) -> list[str]:
    """Paths that differ from `before` in any of the snapshots, sorted (H7 over the per-request snapshots of
    `StandardResponder(request_snapshot=...)` plus the run-end snapshot)."""
    changed: set[str] = set()
    for snapshot in snapshots:
        changed.update(tree_changes(before, snapshot))
    return sorted(changed)


# ---------------------------------------------------------------------------------------------------------
# 6. Response values and result messages (4.4)
# ---------------------------------------------------------------------------------------------------------

COST_MIN_MICRO_USD = 100
COST_MAX_MICRO_USD = 900_000
FINDING_ID_HEX_DIGITS = 10
TOKEN_HEX_DIGITS = 12
# The narrative's token spacing keeps one whole token inside every 100-character window (4.4 token rules):
# a token (14 characters) starts at most 58 characters after the previous one.
NARRATIVE_FILLER_MAX = 42
FILLER_WORDS = ("the", "change", "looks", "fine", "after", "checking", "edge", "cases", "and", "tests", "pass",
                "reviewed", "carefully", "nothing", "else", "needed", "here")


def draw_session_id() -> str:
    return str(uuid.UUID(bytes=secrets.token_bytes(16), version=4))


def draw_finding_id() -> str:
    return "F-" + secrets.token_hex(FINDING_ID_HEX_DIGITS // 2)


def draw_cost_usd() -> float:
    micro = COST_MIN_MICRO_USD + secrets.randbelow(COST_MAX_MICRO_USD - COST_MIN_MICRO_USD + 1)
    return round(micro / 1_000_000, 6)


def draw_token() -> str:
    return "nt" + secrets.token_hex(TOKEN_HEX_DIGITS // 2)


def draw_narrative(length: int) -> tuple[str, list[str]]:
    """A printable-ASCII narrative of at least `length` characters with a token in its first 40 characters
    and in every 100-character window. Returns the text and its tokens."""
    pieces: list[str] = []
    tokens: list[str] = []
    size = 0
    while size < length:
        token = draw_token()
        tokens.append(token)
        filler = _filler(NARRATIVE_FILLER_MAX)
        pieces.append(f"{token} {filler}")
        size += len(pieces[-1]) + 1
    return " ".join(pieces), tokens


def _filler(max_length: int) -> str:
    words: list[str] = []
    while True:
        word = FILLER_WORDS[secrets.randbelow(len(FILLER_WORDS))]
        if len(" ".join(words + [word])) > max_length:
            return " ".join(words)
        words.append(word)


@dataclass(frozen=True)
class DrawnResponse:
    """One call's drawn reply values, kept only in grader memory."""
    scenario: str
    session_id: str
    cost_usd: float
    model_id: str
    structured_output: object | None
    narrative: str
    tokens: tuple[str, ...]
    result_message: dict[str, object] | None


def resolved_model_id(model: str, templates: dict[str, object]) -> str:
    return _str_dict(templates["resolvedModelIds"]).get(model, model)


def build_result_message(scenario: str, structured_output: object | None, model: str, templates: dict[str, object],
                         narrative: str) -> dict[str, object]:
    """The `result` message of a scenario, with every required field of its arm (add. §3d)."""
    spec = _obj(_obj(templates["scenarios"])[scenario])
    model_id = resolved_model_id(model, templates)
    cost = draw_cost_usd()
    model_usage = dict(_obj(templates["modelUsageEntry"]))
    model_usage["costUSD"] = cost
    message: dict[str, object] = {
        "type": "result", "uuid": draw_session_id(), "session_id": draw_session_id(),
        "duration_ms": 1000 + secrets.randbelow(9000), "duration_api_ms": 900 + secrets.randbelow(8000),
        "num_turns": 1 + secrets.randbelow(6), "total_cost_usd": cost, "usage": dict(_obj(templates["usage"])),
        "modelUsage": {model_id: model_usage}, "permission_denials": [],
    }
    arm = str(spec["arm"])
    if arm == "error":
        message.update({"subtype": spec["subtype"], "is_error": True, "stop_reason": None,
                        "errors": list(_str_list(spec["errors"]))})
    elif arm == "auth":
        message.update({"subtype": "success", "is_error": True, "stop_reason": None, "result": spec["result"],
                        "terminal_reason": "api_error", "api_error_status": None})
    else:
        message.update({"subtype": "success", "is_error": False, "stop_reason": "end_turn", "result": narrative})
        if scenario == "ok":
            message["structured_output"] = structured_output
    return message


def json_looking_result(structured_output: object, narrative: str) -> str:
    """For the `no-structured` scenario: prose plus a JSON block with other values than the drawn object."""
    decoy = {"findings": [], "note": narrative[:60]} if isinstance(structured_output, dict) else {"note": narrative[:60]}
    return f"{narrative}\n```json\n{json.dumps(decoy, indent=2)}\n```"


def render_output(message: dict[str, object], output_format: str, scenario: str, init: dict[str, object],
                  structured_output: object | None, templates: dict[str, object]) -> str:
    """Stdout for the requested format (4.4): one object for json, the four-line sequence for stream-json."""
    if output_format == "json":
        return json.dumps(message) + "\n"
    if output_format != "stream-json":
        return str(message.get("result", "; ".join(_str_list(message.get("errors", []))))) + "\n"
    session = message["session_id"]
    lines: list[dict[str, object]] = [dict(init, session_id=session)]
    if scenario in ("ok", "retries"):
        tool_use_id = "toolu_" + secrets.token_hex(12)
        lines.append({"type": "assistant", "session_id": session, "parent_tool_use_id": None,
                      "message": {"role": "assistant", "content": [
                          {"type": "tool_use", "id": tool_use_id, "name": "StructuredOutput",
                           "input": structured_output if scenario == "ok" else {}}]}})
        result_block: dict[str, object] = {"type": "tool_result", "tool_use_id": tool_use_id,
                                           "content": str(templates["structuredOutputToolResult"])}
        if scenario == "retries":
            result_block = {"type": "tool_result", "tool_use_id": tool_use_id, "is_error": True,
                            "content": "Output does not match the required schema"}
        lines.append({"type": "user", "session_id": session, "parent_tool_use_id": None,
                      "message": {"role": "user", "content": [result_block]}})
    lines.append(message)
    return "".join(json.dumps(line) + "\n" for line in lines)


def init_message(effective_tools: list[str], model: str, permission_mode: str, cwd: str) -> dict[str, object]:
    return {"type": "system", "subtype": "init", "cwd": cwd, "tools": [*effective_tools, "StructuredOutput"],
            "mcp_servers": [], "model": model, "permissionMode": permission_mode}


# ---------------------------------------------------------------------------------------------------------
# 7. The fake `claude` (4.2)
# ---------------------------------------------------------------------------------------------------------

FRAME_HEADER = struct.Struct(">I")
REQUEST_LIMIT_BYTES = 64 << 20
# One C9 snapshot (project and user scope) takes well under a millisecond, so polling every 10 ms costs
# little; a file that exists for less than this during a held call can be missed (recorded residual). The
# interval is measured from the end of one poll to the start of the next, so a slow watch polls less often.
HOLD_POLL_SEC = 0.01
FAKE_SOCKET_PLACEHOLDER = "__ACADEMY_FAKE_SOCKET__"


@dataclass(frozen=True)
class CallRequest:
    argv: list[str]
    argv0: str
    cwd: str
    environment: dict[str, str]
    stdin: bytes
    t_start: float


@dataclass(frozen=True)
class FakeReply:
    """One call's answer.

    `stream` holds (seconds after the hold starts, stdout chunk) pairs, in order; each chunk is sent, and
    flushed by the client, at its time inside the hold (a time past the hold is sent when the hold ends).
    `stdout` is written after the hold. Under stream-json the real CLI prints `system/init` at once and its
    working messages while it works, so no stdout line but the last ones may mark the end of the hold
    (hold-and-poll round, L2 B2).
    `watch`, when set, runs as the hold starts, every HOLD_POLL_SEC while the reply is held and once more just
    before it is written, so a lesson sees what the files held while the call was in flight (re-run fix round,
    C9). With a watch and no hold it runs once.
    """
    code: int
    stdout: str
    stderr: str
    hold_sec: float = 0.0
    watch: Callable[[], None] | None = None
    stream: tuple[tuple[float, str], ...] = ()


@dataclass
class CallRecord:
    request: CallRequest
    reply: FakeReply
    t_end: float
    details: dict[str, object]


CallHandler = Callable[[CallRequest], tuple[FakeReply, dict[str, object]]]


def _read_exact(connection: socket.socket, size: int) -> bytes:
    chunks, remaining = [], size
    while remaining:
        chunk = connection.recv(min(remaining, 1 << 20))
        if not chunk:
            raise ConnectionError("the client closed the connection mid-frame")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


class FakeClaudeServer:
    """A threading Unix stream server: one daemon handler thread per connection (4.2).

    `t_start` is taken when the request's last byte has been read; the handler validates and draws, sleeps
    the hold, takes `t_end` just before writing the reply. One lock guards only the append to the call log.
    """

    def __init__(self, socket_path: Path, handle: CallHandler) -> None:
        if len(str(socket_path).encode()) > SOCKET_PATH_LIMIT_BYTES:
            raise PlatformError(f"путь сокета длиннее {SOCKET_PATH_LIMIT_BYTES} байт: {socket_path}")
        self.socket_path = socket_path
        self.handle = handle
        self.records: list[CallRecord] = []
        self.handler_errors: list[str] = []
        self._log_lock = threading.Lock()
        outer = self

        class Handler(socketserver.BaseRequestHandler):
            def handle(self) -> None:
                outer._serve(self.request)

        class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
            daemon_threads = True

        self._server = Server(str(socket_path), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    def __enter__(self) -> FakeClaudeServer:
        self._thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self._server.shutdown()
        self._server.server_close()
        try:
            os.unlink(self.socket_path)
        except FileNotFoundError:
            pass

    def calls(self) -> list[CallRecord]:
        with self._log_lock:
            return list(self.records)

    def _serve(self, connection: socket.socket) -> None:
        try:
            (size,) = FRAME_HEADER.unpack(_read_exact(connection, FRAME_HEADER.size))
            if size > REQUEST_LIMIT_BYTES:
                raise ValueError(f"request of {size} bytes is over the limit")
            payload = _read_exact(connection, size)
            t_start = time.monotonic()
            request = _decode_request(payload, t_start)
        except (ConnectionError, ValueError, KeyError, TypeError) as error:
            self._note_error(f"bad request: {error}")
            return
        try:
            reply, details = self.handle(request)
        except Exception as error:  # a grader bug must surface as a platform error, not as a reply
            self._note_error(f"handler crashed: {type(error).__name__}: {error}")
            reply, details = FakeReply(1, "", "grader error\n"), {"error": repr(error)}
        is_delivered = self._hold(reply, connection)
        t_end = time.monotonic()
        with self._log_lock:
            self.records.append(CallRecord(request, reply, t_end, details))
        if is_delivered:
            self._send(connection, {"code": reply.code, "stdout": reply.stdout, "stderr": reply.stderr})

    def _send(self, connection: socket.socket, frame: dict[str, object]) -> bool:
        body = json.dumps(frame).encode()
        try:
            connection.sendall(FRAME_HEADER.pack(len(body)) + body)
        except OSError as error:
            self._note_error(f"reply not delivered: {error}")
            return False
        return True

    def _hold(self, reply: FakeReply, connection: socket.socket) -> bool:
        """Hold the reply: send each `stream` chunk at its time; with a watch, poll as the hold starts, after
        each chunk, every HOLD_POLL_SEC and once more at its end. False when a chunk could not be delivered.

        A watch that raises is a grader bug: it is noted as a handler error, and the rest of the hold sleeps.
        """
        started = time.monotonic()
        deadline = started + reply.hold_sec
        frames = list(reply.stream)
        watch = reply.watch
        is_delivered = True
        while True:
            while frames and (frames[0][0] <= time.monotonic() - started or time.monotonic() >= deadline):
                is_delivered = is_delivered and self._send(connection, {"stdout": frames.pop(0)[1]})
            if watch is not None:
                try:
                    watch()
                except Exception as error:  # surfaces as a platform error through handler_errors
                    self._note_error(f"hold watch crashed: {type(error).__name__}: {error}")
                    watch = None
            now = time.monotonic()
            if now >= deadline and not frames:
                return is_delivered
            wait = deadline - now
            if frames:
                wait = min(wait, started + frames[0][0] - now)
            if watch is not None:
                wait = min(wait, HOLD_POLL_SEC)
            time.sleep(max(wait, 0.0))

    def _note_error(self, text: str) -> None:
        with self._log_lock:
            self.handler_errors.append(text)


def _decode_request(payload: bytes, t_start: float) -> CallRequest:
    data = json.loads(payload.decode("utf-8"))
    environment = data["env"]
    if not isinstance(environment, dict) or not all(isinstance(v, str) for v in environment.values()):
        raise ValueError("env must map names to strings")
    argv = data["argv"]
    if not isinstance(argv, list) or not all(isinstance(a, str) for a in argv):
        raise ValueError("argv must be a list of strings")
    return CallRequest(argv=argv, argv0=str(data["argv0"]), cwd=str(data["cwd"]), environment=environment,
                       stdin=base64.b64decode(data["stdin"]), t_start=t_start)


def install_fake_claude(scratch: Scratch, client_source: Path) -> Path:
    """Write the thin client to `<scratch>/bin/claude` (mode 0755) with the grader's interpreter (4.2)."""
    source = client_source.read_text(encoding="utf-8")
    if source.count(FAKE_SOCKET_PLACEHOLDER) != 1:
        raise PlatformError("fake_claude.py must hold the socket placeholder exactly once")
    body = source.replace(FAKE_SOCKET_PLACEHOLDER, str(scratch.socket_path))
    target = scratch.bin / "claude"
    target.write_text(f"#!{sys.executable} -I\n{body}", encoding="utf-8")
    os.chmod(target, 0o755)
    return target


@dataclass(frozen=True)
class PlannedReply:
    """What a lesson's scenario plan decides for one call: the scenario, the drawn object and the hold."""
    scenario: str
    structured_output: object | None
    hold_sec: float = 0.0


ScenarioPlan = Callable[[str | None, int], PlannedReply]


class StandardResponder:
    """The per-call flow every pipeline lesson shares: CLI errors the fake emulates, role identification,
    material, then the planned scenario rendered in the requested format.

    The fake emulates only the CLI errors 4.3 and 4.4 name, in this order: an unknown option, a call that is
    not headless, stream-json without --verbose, no prompt, an invalid inline schema. The order after the
    unknown option is the grader's choice; the real CLI's order of these checks is not documented.
    """

    def __init__(self, *, table: FlagTable, role_flags: dict[str, object], templates: dict[str, object],
                 schemas: list[RoleSchema], home: str, run_dir: str | None, plan: ScenarioPlan,
                 request_snapshot: Callable[[], dict[str, str]] | None = None,
                 watch_config_during_hold: bool = False,
                 hold_snapshot: Callable[[], dict[str, str]] | None = None,
                 watch_material_during_hold: bool = False) -> None:
        if watch_material_during_hold and run_dir is None:
            raise ValueError("watch_material_during_hold needs a run_dir: without one no material is resolved")
        self.table, self.role_flags, self.templates = table, role_flags, templates
        self.schemas, self.home, self.run_dir, self.plan = schemas, home, run_dir, plan
        self.request_snapshot = request_snapshot
        self.watch_config_during_hold = watch_config_during_hold
        self.hold_snapshot = hold_snapshot
        self.watch_material_during_hold = watch_material_during_hold
        self.user_config_start = user_config_snapshot(Path(home))
        self._counts: dict[str | None, int] = {}
        self._count_lock = threading.Lock()

    def request_details(self, request: CallRequest, parsed: ParsedCall) -> dict[str, object]:
        """What every call records on arrival, before it is answered: `parsed`; `userConfigChanges`
        (user-scope paths changed since the grader started); `claudeConfig` (`call_config_snapshot`, the C9
        comparand); `treeSnapshot` when the lesson passed `request_snapshot`."""
        changed = self._user_config_changes()
        details: dict[str, object] = {"parsed": parsed, "userConfigChanges": sorted(changed),
                                      "claudeConfig": call_config_snapshot(Path(request.cwd), changed)}
        if self.request_snapshot is not None:
            details["treeSnapshot"] = self.request_snapshot()
        return details

    def _user_config_changes(self) -> dict[str, str]:
        current = user_config_snapshot(Path(self.home))
        return {path: current.get(path, "gone") for path in tree_changes(self.user_config_start, current)}

    def hold_watch(self, request: CallRequest, details: dict[str, object]) -> Callable[[], None] | None:
        """The `FakeReply.watch` of one call: every poll the constructor switched on, in this order, or None.

        - `watch_config_during_hold`: each distinct `call_config_snapshot` goes to
          `details["claudeConfigDuringHold"]`. Re-run fix round (L2 B1): a settings file written after the call
          started and deleted after it ended reaches a real call, since Claude Code reloads settings files
          while it runs. The arrival snapshot alone cannot see it.
        - `hold_snapshot`: each distinct result of the lesson's callback goes to
          `details["treeSnapshotsDuringHold"]` (H7, the coder's file left as the coder wrote it).
        - `watch_material_during_hold`: a `MaterialWatch` over `details["material"]`; new file versions land in
          `material.hold_versions`. Over the caps, `details["platformError"]` is set and the material poll stops.
        """
        polls: list[Callable[[], None]] = []
        if self.watch_config_during_hold:
            configs = _distinct_into(details, "claudeConfigDuringHold")
            polls.append(lambda: configs(call_config_snapshot(Path(request.cwd), self._user_config_changes())))
        hold_snapshot = self.hold_snapshot
        if hold_snapshot is not None:
            trees = _distinct_into(details, "treeSnapshotsDuringHold")
            polls.append(lambda: trees(hold_snapshot()))
        material = details.get("material")
        if self.watch_material_during_hold and isinstance(material, Material) and self.run_dir is not None:
            polls.append(_capped(MaterialWatch(material, cwd=request.cwd, home=self.home, run_dir=self.run_dir),
                                 details))
        if not polls:
            return None

        def watch() -> None:
            for poll in polls:
                poll()

        return watch

    def __call__(self, request: CallRequest) -> tuple[FakeReply, dict[str, object]]:
        parsed = parse_call_line(request.argv, self.table)
        details = self.request_details(request, parsed)
        errors = _str_dict(self.templates["cliErrors"])
        cli_error = self._cli_error(parsed, request, errors)
        if cli_error is not None:
            details["cliError"] = cli_error
            return FakeReply(1, "", cli_error + "\n"), details
        schema_values = parsed.values("--json-schema")
        role = identify_role(schema_values[-1], self.schemas) if schema_values else None
        details["role"] = role
        if self.run_dir is not None:
            texts = call_texts(parsed, request.stdin, request.cwd, self.role_flags)
            try:
                details["material"] = resolve_material(texts, cwd=request.cwd, home=self.home, run_dir=self.run_dir)
            except MaterialCapError as error:
                details["platformError"] = str(error)
        planned = self.planned_reply(request, role)
        models = parsed.values("--model")
        model = models[-1] if models else "default"
        narrative, tokens = draw_narrative(160)
        message = build_result_message(planned.scenario, planned.structured_output, model, self.templates,
                                       json_looking_result(planned.structured_output, narrative)
                                       if planned.scenario == "no-structured" else narrative)
        formats = parsed.values("--output-format")
        modes = parsed.values("--permission-mode")
        tools = parsed.list_pieces("--tools") or ["Read", "Edit", "Write", "Bash"]
        init = init_message(tools, resolved_model_id(model, self.templates), modes[-1] if modes else "default",
                            request.cwd)
        output_format = formats[-1] if formats else "text"
        stdout = render_output(message, output_format, planned.scenario, init, planned.structured_output,
                               self.templates)
        stream: tuple[tuple[float, str], ...] = ()
        if output_format == "stream-json":
            stream, stdout = stream_while_working(stdout, planned.scenario, str(message["session_id"]),
                                                  planned.hold_sec, self.templates)
        exit_code = int(str(_obj(_obj(self.templates["scenarios"])[planned.scenario])["exit"]))
        details["drawn"] = DrawnResponse(planned.scenario, str(message["session_id"]),
                                         float(str(message["total_cost_usd"])), resolved_model_id(model, self.templates),
                                         planned.structured_output, narrative, tuple(tokens), message)
        return FakeReply(exit_code, stdout, "", planned.hold_sec, self.hold_watch(request, details), stream), details

    def init_stream(self, parsed: ParsedCall, request: CallRequest) -> tuple[tuple[float, str], ...]:
        """The `FakeReply.stream` of a lesson reply that has no `result` message (L2's no-result call): under
        stream-json the `system/init` line at the start of the hold, else nothing."""
        formats = parsed.values("--output-format")
        if not formats or formats[-1] != "stream-json":
            return ()
        models = parsed.values("--model")
        modes = parsed.values("--permission-mode")
        init = init_message(parsed.list_pieces("--tools") or ["Read", "Edit", "Write", "Bash"],
                            resolved_model_id(models[-1] if models else "default", self.templates),
                            modes[-1] if modes else "default", request.cwd)
        return ((0.0, json.dumps(dict(init, session_id=draw_session_id())) + "\n"),)

    def planned_reply(self, request: CallRequest, role: str | None) -> PlannedReply:
        """The plan's reply for the role's n-th call. A lesson that ties calls to its own requests (L2 finds the
        call by a marker in the prompt) overrides this method."""
        with self._count_lock:
            index = self._counts.get(role, 0)
            self._counts[role] = index + 1
        return self.plan(role, index)

    @staticmethod
    def _cli_error(parsed: ParsedCall, request: CallRequest, errors: dict[str, str]) -> str | None:
        if parsed.unknown_args:
            return errors["unknownOption"].replace("{flag}", parsed.unknown_args[0])
        if not parsed.has("--print"):
            return errors["notHeadless"]
        if "stream-json" in parsed.values("--output-format") and not parsed.has("--verbose"):
            return errors["streamJsonNeedsVerbose"]
        if not request.stdin and not parsed.positionals:
            return errors["noPrompt"]
        for value in parsed.values("--json-schema"):
            problem = inline_schema_problem(value)
            if problem is not None:
                return errors["invalidSchema"].replace("{diagnostic}", problem)
        return None


# The working messages are sent at a drawn time in the first half of the hold, so a write made right after
# them still has half the hold to be polled.
WORKING_MESSAGE_HOLD_SHARE = 0.5
WORKING_MESSAGE_LENGTH = 60
# Every role may use Read (C6 and C7 require it), so the working tool use fits every call's tool set. The
# file it names is not material: it does not exist, and the tool result says so in the CLI's own words.
WORKING_TOOL = "Read"
WORKING_TOOL_FILE = "WORKING_NOTES.md"
WORKING_TOOL_ERROR = "<tool_use_error>File does not exist.</tool_use_error>"


def stream_while_working(stdout: str, scenario: str, session_id: str, hold_sec: float,
                         templates: dict[str, object]) -> tuple[tuple[float, str], str]:
    """Split a stream-json reply into what the real CLI prints while it works and what it prints at the end.

    The `system/init` line goes at the start of the hold. Unless the call fails before the model answers (the
    `auth` arm), three working lines follow at a drawn time in the first half of the hold, as the real CLI
    streams the model's turn while it works, one content block per line: an assistant text, an assistant
    WORKING_TOOL tool use, and the user message with its tool result. The StructuredOutput tool use, its tool result and the
    `result` message stay after the hold: the real CLI prints them when the work is done. Returns
    (`FakeReply.stream`, the stdout written after the hold).
    """
    first, rest = stdout.split("\n", 1)
    stream: list[tuple[float, str]] = [(0.0, first + "\n")]
    if str(_obj(_obj(templates["scenarios"])[scenario])["arm"]) != "auth":
        cwd = str(json.loads(first).get("cwd", "."))
        tool_use_id = "toolu_" + secrets.token_hex(12)
        blocks: list[tuple[str, dict[str, object]]] = [
            ("assistant", {"type": "text", "text": _filler(WORKING_MESSAGE_LENGTH)}),
            ("assistant", {"type": "tool_use", "id": tool_use_id, "name": WORKING_TOOL,
                           "input": {"file_path": os.path.join(cwd, WORKING_TOOL_FILE)}}),
            ("user", {"type": "tool_result", "tool_use_id": tool_use_id, "is_error": True,
                      "content": WORKING_TOOL_ERROR})]
        lines = [json.dumps({"type": kind, "session_id": session_id, "parent_tool_use_id": None,
                             "message": {"role": kind, "content": [block]}}) + "\n" for kind, block in blocks]
        at = hold_sec * WORKING_MESSAGE_HOLD_SHARE * secrets.randbelow(1001) / 1000
        stream.append((at, "".join(lines)))
    return tuple(stream), rest


def _distinct_into(details: dict[str, object], key: str) -> Callable[[dict[str, str]], None]:
    """An appender to `details[key]` that keeps each distinct snapshot once, in the order first seen."""
    seen: list[dict[str, str]] = []
    details[key] = seen

    def add(snapshot: dict[str, str]) -> None:
        if not seen or (snapshot != seen[-1] and snapshot not in seen):
            seen.append(snapshot)

    return add


def _capped(material_watch: MaterialWatch, details: dict[str, object]) -> Callable[[], None]:
    is_over_cap = False

    def poll() -> None:
        nonlocal is_over_cap
        if is_over_cap:
            return
        try:
            material_watch.poll()
        except MaterialCapError as error:
            is_over_cap = True
            details["platformError"] = str(error)

    return poll


def calls_overlap(records: list[CallRecord]) -> bool:
    """True when every pair of calls overlapped in server time (fan-out, 4.2)."""
    return all(a.request.t_start < b.t_end and b.request.t_start < a.t_end
               for i, a in enumerate(records) for b in records[i + 1:])


def call_snapshots(records: Iterable[CallRecord]) -> list[dict[str, str]]:
    """`request_snapshots` plus every distinct snapshot taken while each call was held (`hold_snapshot`), in
    arrival order: the input of `changes_seen` for a lesson that polls the tree during holds."""
    snapshots = []
    for record in sorted(records, key=lambda record: record.request.t_start):
        for snapshot in [record.details.get("treeSnapshot"), *_list(record.details.get("treeSnapshotsDuringHold", []))]:
            if isinstance(snapshot, dict):
                snapshots.append(snapshot)
    return snapshots


def request_snapshots(records: Iterable[CallRecord]) -> list[dict[str, str]]:
    """The tree snapshots taken as each call request arrived, in arrival order (none without the hook).

    Student fix round, H7: a file written into the project before a call and deleted after it is in the
    snapshot of that call, though the run-end snapshot no longer has it.
    """
    ordered = sorted(records, key=lambda record: record.request.t_start)
    snapshots = []
    for record in ordered:
        snapshot = record.details.get("treeSnapshot")
        if isinstance(snapshot, dict):
            snapshots.append(snapshot)
    return snapshots


# ---------------------------------------------------------------------------------------------------------
# Small typed accessors for parsed JSON data
# ---------------------------------------------------------------------------------------------------------


def load_json(path: Path) -> dict[str, object]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise PlatformError(f"{path.name}: expected a JSON object")
    return data


def _obj(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise PlatformError(f"expected a JSON object, got {type(value).__name__}")
    return value


def _list(value: object) -> list[object]:
    if not isinstance(value, list):
        raise PlatformError(f"expected a JSON list, got {type(value).__name__}")
    return value


def _str_list(value: object) -> list[str]:
    return [str(item) for item in _list(value)]


def _dict_list(value: object) -> list[dict[str, object]]:
    return [_obj(item) for item in _list(value)]


def _str_dict(value: object) -> dict[str, str]:
    return {str(k): str(v) for k, v in _obj(value).items()}
