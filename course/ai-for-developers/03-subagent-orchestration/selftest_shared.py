"""Self-test of the module's shared grading infrastructure (W0 of #43; design revision 6, sections 4 and 11).

Run with the pinned interpreter, from a Python whose directory holds no `claude` (the PATH guard refuses
otherwise, which is part of what this test shows):

    <python3.12> -I selftest_shared.py --judge-dir <dir with refs5_proto.py, refs6_lit.py, corpus5.py, corpus6.py>
        [--work-dir <scratch dir>] [--overlap-runs 50] [--h7-runs 20]

Each section runs its honest corpus first, then the attacks. Every line prints `ok` or `XX`; the exit code
is 1 when any line is `XX`.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
import threading
import time
from collections.abc import Callable
from decimal import Decimal
from pathlib import Path

MODULE = Path(__file__).resolve().parent
L2_CHECKS = MODULE / "02-role-contracts" / "checks"
L3_CHECKS = MODULE / "03-coder-reviewer-summarizer" / "checks"
sys.dont_write_bytecode = True  # no __pycache__ left in a lesson's checks/
sys.path.insert(0, str(L2_CHECKS))

import orchestra_runtime as rt  # noqa: E402

RESULTS: list[tuple[str, bool]] = []
HOLD_SEC = 2.0
OVERLAP_SPAN_MAX_SEC = 2.5
ACCEPTANCE_BYTES = 1536
CYRILLIC_2KB = "Контракт " * 120


def report(section: str, name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((section, ok))
    print(f"{'ok ' if ok else 'XX '}[{section}] {name}{(' :: ' + detail) if detail else ''}", flush=True)


def load_data() -> tuple[rt.FlagTable, dict[str, object], dict[str, object]]:
    role_flags = rt.load_json(L2_CHECKS / "data" / "role_flags.json")
    cli_flags = rt.load_json(L2_CHECKS / "data" / "cli_flags.json")
    templates = rt.load_json(L2_CHECKS / "data" / "result_templates.json")
    return rt.FlagTable(cli_flags, role_flags), role_flags, templates


# ---------------------------------------------------------------------------------------------------------
# A. Shared files are byte-identical
# ---------------------------------------------------------------------------------------------------------


def section_shared() -> None:
    result = subprocess.run([sys.executable, "-I", str(MODULE / "shared_files.py"), "check"], capture_output=True,
                            text=True)
    report("A", "every shared copy is byte-identical to its master (incl. devtools/launch.py)",
           result.returncode == 0, result.stdout.strip().splitlines()[-1])


# ---------------------------------------------------------------------------------------------------------
# B. Schema subset, role identification and the pre-flight (4.5, D-S8)
# ---------------------------------------------------------------------------------------------------------

FINDING = {"type": "object", "required": ["id", "file", "line", "quote", "claim", "severity"],
           "properties": {"id": {"type": "string"}, "file": {"type": "string"}, "line": {"type": "integer"},
                          "quote": {"type": "string"}, "claim": {"type": "string"},
                          "severity": {"enum": ["high", "medium", "low"]}}}


def section_schema(work: Path) -> None:
    honest = {
        "minimal": {"type": "object", "required": ["summary"], "properties": {"summary": {"type": "string"}}},
        "additionalProperties false": {"type": "object", "additionalProperties": False},
        "descriptions": {"type": "object", "description": "x", "properties": {"a": {"type": "string", "description": "y"}}},
        "type list": {"type": ["integer"]},
        "enum and const": {"type": "object", "properties": {"a": {"enum": ["x"]}, "b": {"const": "y"}}},
        "$schema draft-07": {"$schema": "http://json-schema.org/draft-07/schema", "type": "object"},
        "$schema draft-07#": {"$schema": "http://json-schema.org/draft-07/schema#", "type": "object"},
        "format uri / date-time": {"type": "object", "properties": {"u": {"type": "string", "format": "uri"},
                                                                    "d": {"type": "string", "format": "date-time"}}},
        "title": {"title": "Reviewer", "type": "object"},
        "findings array": {"type": "object", "required": ["findings"],
                           "properties": {"findings": {"type": "array", "items": FINDING}}},
    }
    for name, schema in honest.items():
        problems = rt.schema_subset_problems(schema)
        report("B", f"subset accepts: {name}", not problems, "; ".join(problems))
    must_fail = {
        "reject-all {not: {}}": {"not": {}},
        "$schema 2020-12": {"$schema": "https://json-schema.org/draft/2020-12/schema"},
        "$schema 2019-09": {"$schema": "https://json-schema.org/draft/2019-09/schema"},
        "$schema https draft-07": {"$schema": "https://json-schema.org/draft-07/schema"},
        "$schema draft-04": {"$schema": "http://json-schema.org/draft-04/schema#"},
        "minimum": {"type": "integer", "minimum": 1},
        "format color": {"type": "string", "format": "color"},
        "$ref": {"$ref": "#/definitions/x"},
        "additionalProperties true": {"type": "object", "additionalProperties": True},
    }
    for name, schema in must_fail.items():
        problems = rt.schema_subset_problems(schema)
        report("B", f"subset rejects: {name}", bool(problems), problems[0] if problems else "accepted")
    report("B", "integer: 3.0 valid, 2.5 / true / '3' invalid",
           rt.validate_instance({"type": "integer"}, 3.0)
           and not any(rt.validate_instance({"type": "integer"}, v) for v in (2.5, True, "3")))
    report("B", "number: true is never a number", not rt.validate_instance({"type": "number"}, True))
    report("B", "json_equal: 1 == 1.0, true != 1", rt.json_equal(1, 1.0) and not rt.json_equal(True, 1))

    contracts = work / "contracts-const"
    contracts.mkdir(parents=True)
    sections = ("security", "performance", "tests")
    for section in sections:
        schema = {"type": "object", "required": ["findings"], "properties": {"findings": {"type": "array", "items": {
            "type": "object", "required": ["section"], "properties": {"section": {"const": section}}}}}}
        (contracts / f"{section}.schema.json").write_text(json.dumps(schema, indent=2))
    schemas = rt.load_role_schemas(contracts, sections)
    report("B", "pre-flight passes: const per section, three files", rt.schema_preflight(schemas) == [])
    identified = [rt.identify_role(json.dumps(json.loads((contracts / f"{s}.schema.json").read_text())), schemas)
                  for s in sections]
    report("B", "each call identified by its own schema (compact JSON on the call)", identified == list(sections),
           str(identified))
    report("B", "no match -> None; not JSON -> None",
           rt.identify_role('{"type":"object"}', schemas) is None and rt.identify_role("x", schemas) is None)

    same = work / "contracts-enum"
    same.mkdir()
    enum_schema = {"type": "object", "properties": {"section": {"enum": list(sections)}}}
    for section in sections:
        (same / f"{section}.schema.json").write_text(json.dumps(enum_schema))
    problems = rt.schema_preflight(rt.load_role_schemas(same, sections))
    report("B", "pre-flight fails: three identical files, each pair named",
           len(problems) == 3 and all("совпадают" in p for p in problems)
           and "`security.schema.json` и `performance.schema.json`" in problems[0], problems[0] if problems else "")
    pair = work / "contracts-pair"
    pair.mkdir()
    for role in ("coder", "reviewer"):
        (pair / f"{role}.schema.json").write_text(json.dumps({"type": "object"}))
    problems = rt.schema_preflight(rt.load_role_schemas(pair, ("coder", "reviewer")))
    report("B", "pre-flight fails: coder and reviewer equal, both files named",
           len(problems) == 1 and "coder.schema.json" in problems[0] and "reviewer.schema.json" in problems[0])
    (pair / "summarizer.schema.json").write_text('{"type": "object",\n  "x": }')
    loaded = rt.load_role_schemas(pair, ("summarizer",))
    report("B", "a broken contract schema names the file and the line",
           loaded[0].error is not None and "summarizer.schema.json, строка 2" in loaded[0].error, str(loaded[0].error))


# ---------------------------------------------------------------------------------------------------------
# C. Call rules on every honest and must-fail call line of 4.3 / 5.L2
# ---------------------------------------------------------------------------------------------------------

READER_SCHEMA = {"type": "object", "required": ["findings"], "properties": {"findings": {"type": "array", "items": FINDING}}}
SUMMARY_SCHEMA = {"type": "object", "required": ["summary", "finding_ids"],
                  "properties": {"summary": {"type": "string"}, "finding_ids": {"type": "array", "items": {"type": "string"}}}}
CODER_SCHEMA = {"type": "object", "required": ["diff_path", "summary"],
                "properties": {"diff_path": {"type": "string"}, "summary": {"type": "string"}}}
MODEL, BUDGET = "claude-sonnet-5-5", 0.37
BASE_ENV = {"PATH": "/s/bin:/py:/usr/bin:/bin", "HOME": "/s/home", "TMPDIR": "/s/tmp", "LANG": "C.UTF-8"}


def head(schema: dict[str, object], budget: str = "0.37") -> list[str]:
    return ["claude", "-p", "--output-format", "json", "--model", MODEL, "--max-budget-usd", budget,
            "--json-schema", json.dumps(schema)]


REVIEWER = [*head(READER_SCHEMA), "--tools", "Read,Grep,Glob", "--disallowedTools", "mcp__*"]
SUMMARIZER = [*head(SUMMARY_SCHEMA), "--tools", "Read", "--bare"]
CODER = [*head(CODER_SCHEMA), "--permission-mode", "acceptEdits"]
ROLES = {
    "reviewer": (rt.RoleSpec("reviewer", False, True, MODEL, BUDGET), READER_SCHEMA),
    "summarizer": (rt.RoleSpec("summarizer", False, False, MODEL, BUDGET), SUMMARY_SCHEMA),
    "coder": (rt.RoleSpec("coder", True, False, MODEL, BUDGET), CODER_SCHEMA),
}


def replace(argv: list[str], old: str, new: list[str], count: int = 1) -> list[str]:
    """argv with the flag `old` and its `count` values replaced by `new`."""
    index = argv.index(old)
    return argv[:index] + new + argv[index + 1 + count:]


def grade(table: rt.FlagTable, role_flags: dict[str, object], role: str, argv: list[str], stdin: bytes = b"review this",
          env: dict[str, str] | None = None, config_ok: bool = True) -> tuple[list[str], list[str]]:
    spec, schema = ROLES[role]
    facts = rt.CallFacts(stdin, BASE_ENV if env is None else env, BASE_ENV, schema, config_ok)
    failures = rt.grade_call(rt.parse_call_line(argv, table), facts, spec, role_flags)
    return sorted({f.rule_id for f in failures}), [f.message for f in failures]


def honest_call_lines() -> list[tuple[str, str, list[str], bytes, dict[str, str] | None]]:
    contract = "Цель: найти дефекты. Формат вывода: JSON. Границы: ничего не пишешь."
    lines = [
        ("reviewer", "prompt on stdin (base)", REVIEWER, b"review this", None),
        ("reviewer", "positional right after -p", ["claude", "-p", "review this", *REVIEWER[2:]], b"", None),
        ("reviewer", "positional after --model", replace(REVIEWER, "--model", ["--model", MODEL, "review this"]), b"", None),
        ("reviewer", "positional after -- that follows --tools values",
         [*head(READER_SCHEMA), "--disallowedTools", "mcp__*", "--tools", "Read", "Grep", "Glob", "--", "review this"],
         b"", None),
        ("reviewer", "stream-json + --verbose", replace(REVIEWER, "--output-format", ["--output-format", "stream-json", "--verbose"]), b"x", None),
        ("reviewer", "json + --verbose", [*REVIEWER, "--verbose"], b"x", None),
        ("reviewer", "--print instead of -p", ["claude", "--print", *REVIEWER[2:]], b"x", None),
        ("reviewer", "closure --bare", replace(REVIEWER, "--disallowedTools", ["--bare"]), b"x", None),
        ("reviewer", "closure --strict-mcp-config", replace(REVIEWER, "--disallowedTools", ["--strict-mcp-config"]), b"x", None),
        ("reviewer", "closure --disallowed-tools mcp__*", replace(REVIEWER, "--disallowedTools", ["--disallowed-tools", "mcp__*"]), b"x", None),
        ("reviewer", "closure --disallowedTools mcp__* Edit", replace(REVIEWER, "--disallowedTools", ["--disallowedTools", "mcp__*", "Edit"]), b"x", None),
        ("reviewer", "--disallowedTools mcp__srv__* next to mcp__*", replace(REVIEWER, "--disallowedTools", ["--disallowedTools", "mcp__*,mcp__tracker__*"]), b"x", None),
        ("reviewer", "--allowed-tools Read", [*REVIEWER, "--allowed-tools", "Read"], b"x", None),
        ("reviewer", "--allowedTools Read Grep", [*REVIEWER, "--allowedTools", "Read", "Grep"], b"x", None),
        ("reviewer", "--allowedTools 'Read,Grep,Glob'", [*REVIEWER, "--allowedTools", "Read,Grep,Glob"], b"x", None),
        ("reviewer", "--permission-mode dontAsk", [*REVIEWER, "--permission-mode", "dontAsk"], b"x", None),
        ("reviewer", "--permission-mode default", [*REVIEWER, "--permission-mode", "default"], b"x", None),
        ("reviewer", "--permission-mode manual", [*REVIEWER, "--permission-mode", "manual"], b"x", None),
        ("reviewer", "--tools Read,Grep,Glob,LSP", replace(REVIEWER, "--tools", ["--tools", "Read,Grep,Glob,LSP"]), b"x", None),
        ("reviewer", "--tools 'Read, Grep, Glob'", replace(REVIEWER, "--tools", ["--tools", "Read, Grep, Glob"]), b"x", None),
        ("reviewer", "--tools Read Grep Glob", replace(REVIEWER, "--tools", ["--tools", "Read", "Grep", "Glob"]), b"x", None),
        ("summarizer", "summarizer: --tools Read + --bare", SUMMARIZER, b"x", None),
        ("coder", "coder --permission-mode acceptEdits", CODER, b"x", None),
        ("coder", "coder --allowedTools Edit alone", replace(CODER, "--permission-mode", ["--allowedTools", "Edit"]), b"x", None),
        ("coder", "coder --allowed-tools Edit,Read", replace(CODER, "--permission-mode", ["--allowed-tools", "Edit,Read"]), b"x", None),
        ("coder", "coder --allowedTools Edit Write", replace(CODER, "--permission-mode", ["--allowedTools", "Edit", "Write"]), b"x", None),
        ("coder", "coder --tools Read,Edit,Grep,Glob + --allowedTools Edit",
         replace(CODER, "--permission-mode", ["--tools", "Read,Edit,Grep,Glob", "--allowedTools", "Edit"]), b"x", None),
        ("coder", "coder dontAsk + --allowedTools Edit", replace(CODER, "--permission-mode", ["--permission-mode", "dontAsk", "--allowedTools", "Edit"]), b"x", None),
        ("reviewer", "--max-turns 8", [*REVIEWER, "--max-turns", "8"], b"x", None),
        ("reviewer", "--system-prompt-file pipeline/contracts/reviewer.md", [*REVIEWER, "--system-prompt-file", "pipeline/contracts/reviewer.md"], b"x", None),
        ("reviewer", "--system-prompt '<contract>'", [*REVIEWER, "--system-prompt", contract], b"x", None),
        ("reviewer", "--append-system-prompt '<contract>'", [*REVIEWER, "--append-system-prompt", contract], b"x", None),
        ("reviewer", "--append-system-prompt-file pipeline/contracts/reviewer.md", [*REVIEWER, "--append-system-prompt-file", "pipeline/contracts/reviewer.md"], b"x", None),
        ("reviewer", "--append-system-prompt '- be terse' (value starting with -)", [*REVIEWER, "--append-system-prompt", "- be terse"], b"x", None),
        ("reviewer", "budget f'{b:.2f}'", head(READER_SCHEMA, f"{BUDGET:.2f}") + REVIEWER[10:], b"x", None),
        ("reviewer", "budget str(b)", head(READER_SCHEMA, str(BUDGET)) + REVIEWER[10:], b"x", None),
        ("reviewer", "budget repr(b)", head(READER_SCHEMA, repr(BUDGET)) + REVIEWER[10:], b"x", None),
        ("reviewer", "budget str(Decimal(b))", head(READER_SCHEMA, str(Decimal(BUDGET))) + REVIEWER[10:], b"x", None),
        ("reviewer", "env with a variable removed", REVIEWER, b"x", {k: v for k, v in BASE_ENV.items() if k != "LANG"}),
        # Student fix round, U1: the MCP closures the lesson teaches are honest for the coder too.
        ("coder", "coder acceptEdits + --disallowedTools mcp__*", [*CODER, "--disallowedTools", "mcp__*"], b"x", None),
        ("coder", "coder acceptEdits + --disallowed-tools mcp__tracker__*", [*CODER, "--disallowed-tools", "mcp__tracker__*"], b"x", None),
        ("coder", "coder --allowedTools Edit + --disallowedTools 'mcp__*,Bash'",
         replace(CODER, "--permission-mode", ["--allowedTools", "Edit", "--disallowedTools", "mcp__*,Bash"]), b"x", None),
        ("coder", "coder acceptEdits + --strict-mcp-config", [*CODER, "--strict-mcp-config"], b"x", None),
        ("coder", "coder acceptEdits + --bare", [*CODER, "--bare"], b"x", None),
        ("reviewer", "--max-turns 1", [*REVIEWER, "--max-turns", "1"], b"x", None),
        ("reviewer", "--max-turns 999999999999", [*REVIEWER, "--max-turns", "999999999999"], b"x", None),
        # Re-run fix round: the coder set is Read, Edit, Write, NotebookEdit, Grep, Glob, LSP.
        ("coder", "coder --tools Read,Edit,NotebookEdit + acceptEdits", [*CODER, "--tools", "Read,Edit,NotebookEdit"], b"x", None),
        ("coder", "coder acceptEdits + --allowedTools NotebookEdit", [*CODER, "--allowedTools", "NotebookEdit"], b"x", None),
        ("coder", "coder --tools with the whole set + acceptEdits", [*CODER, "--tools", "Read,Edit,Write,NotebookEdit,Grep,Glob,LSP"], b"x", None),
    ]
    return lines


def must_fail_call_lines(table: rt.FlagTable) -> list[tuple[str, str, list[str], bytes, dict[str, str] | None, bool, set[str], bool]]:
    """(role, name, argv, stdin, env, config_ok, expected ids, expects the C10 prompt hint)."""
    reader_tools_only = replace(REVIEWER, "--disallowedTools", [])
    lines: list[tuple[str, str, list[str], bytes, dict[str, str] | None, bool, set[str], bool]] = [
        ("reviewer", "--tools with no closure", reader_tools_only, b"x", None, True, {"C6"}, False),
        ("reviewer", "--allowedTools Read,Grep,Glob only", replace(REVIEWER, "--tools", ["--allowedTools", "Read,Grep,Glob"]), b"x", None, True, {"C6"}, False),
        ("reviewer", "--disallowedTools Edit,Write only", [*head(READER_SCHEMA), "--disallowedTools", "Edit,Write"], b"x", None, True, {"C6"}, False),
        ("reviewer", "+ --permission-mode plan", [*REVIEWER, "--permission-mode", "plan"], b"x", None, True, {"C6"}, False),
    ]
    for mode in ("acceptEdits", "auto", "bypassPermissions"):
        lines.append(("reviewer", f"+ --permission-mode {mode}", [*REVIEWER, "--permission-mode", mode], b"x", None, True, {"C6"}, False))
    lines += [
        ("reviewer", "--tools default", replace(REVIEWER, "--tools", ["--tools", "default"]), b"x", None, True, {"C6"}, False),
        ("reviewer", "--tools ''", replace(REVIEWER, "--tools", ["--tools", ""]), b"x", None, True, {"C6"}, False),
    ]
    for extra in ("Bash", "WebFetch", "Agent", "Skill", "mcp__srv__x", "TodoWrite"):
        lines.append(("reviewer", f"+{extra} in --tools", replace(REVIEWER, "--tools", ["--tools", f"Read,Grep,Glob,{extra}"]), b"x", None, True, {"C6"}, False))
    lines += [
        ("reviewer", "lowercase tool names", replace(REVIEWER, "--tools", ["--tools", "read,grep,glob"]), b"x", None, True, {"C8"}, False),
        ("reviewer", "--disallowedTools '*'", replace(REVIEWER, "--disallowedTools", ["--disallowedTools", "mcp__*", "*"]), b"x", None, True, {"C6"}, False),
        ("reviewer", "--allowedTools Bash", [*REVIEWER, "--allowedTools", "Bash"], b"x", None, True, {"C6"}, False),
        ("reviewer", "--allowedTools 'mcp__srv__*'", [*REVIEWER, "--allowedTools", "mcp__srv__*"], b"x", None, True, {"C6"}, False),
        ("reviewer", "unknown flag --allowedtools", [*REVIEWER, "--allowedtools", "Read"], b"x", None, True, {"C10"}, False),
        ("reviewer", "positional '- review this diff' before --, empty stdin", [*REVIEWER, "- review this diff"], b"", None, True, {"C10"}, True),
        ("reviewer", "--allowedTools=Read", [*REVIEWER, "--allowedTools=Read"], b"x", None, True, {"C8"}, False),
        ("reviewer", "short cluster -pv", ["claude", "-pv", *REVIEWER[2:]], b"x", None, True, {"C10"}, False),
        ("reviewer", "project settings.json gains permissions.deny", REVIEWER, b"x", None, False, {"C9"}, False),
        ("coder", "coder: no mode and no allow", replace(CODER, "--permission-mode", [], 1), b"x", None, True, {"C7"}, False),
        ("coder", "coder: dontAsk without allow", replace(CODER, "--permission-mode", ["--permission-mode", "dontAsk"]), b"x", None, True, {"C7"}, False),
        ("coder", "coder: plan with Edit", replace(CODER, "--permission-mode", ["--permission-mode", "plan", "--allowedTools", "Edit"]), b"x", None, True, {"C7"}, False),
        ("coder", "coder: auto (course rule D-S1)", replace(CODER, "--permission-mode", ["--permission-mode", "auto"]), b"x", None, True, {"C7"}, False),
        ("coder", "coder: bypassPermissions", replace(CODER, "--permission-mode", ["--permission-mode", "bypassPermissions"]), b"x", None, True, {"C7"}, False),
        ("coder", "coder: --allowedTools Write alone", replace(CODER, "--permission-mode", ["--allowedTools", "Write"]), b"x", None, True, {"C7"}, False),
        ("coder", "coder: legacy MultiEdit alone", replace(CODER, "--permission-mode", ["--allowedTools", "MultiEdit"]), b"x", None, True, {"C7"}, False),
        ("coder", "coder: --allowedTools '*'", replace(CODER, "--permission-mode", ["--allowedTools", "*"]), b"x", None, True, {"C7"}, False),
        ("coder", "coder: --allowedTools Edit,Bash", replace(CODER, "--permission-mode", ["--allowedTools", "Edit,Bash"]), b"x", None, True, {"C7"}, False),
        ("coder", "coder: --disallowedTools Edit + acceptEdits", [*CODER, "--disallowedTools", "Edit"], b"x", None, True, {"C7"}, False),
        ("coder", "coder: --allowedTools 'Edit(src/**)'", replace(CODER, "--permission-mode", ["--allowedTools", "Edit(src/**)"]), b"x", None, True, {"C8"}, False),
        ("coder", "coder: + --allowedTools 'Write(src/**)'", [*CODER, "--allowedTools", "Write(src/**)"], b"x", None, True, {"C8"}, False),
        ("coder", "coder: --dangerously-skip-permissions", [*CODER, "--dangerously-skip-permissions"], b"x", None, True, {"C10"}, False),
        ("coder", "coder: --allow-dangerously-skip-permissions + acceptEdits", [*CODER, "--allow-dangerously-skip-permissions"], b"x", None, True, {"C10"}, False),
        ("coder", "coder: --settings bypass + --allowedTools Edit",
         replace(CODER, "--permission-mode", ["--settings", '{"permissions":{"defaultMode":"bypassPermissions"}}', "--allowedTools", "Edit"]), b"x", None, True, {"C10"}, False),
        ("coder", "coder: --add-dir ..", [*CODER, "--add-dir", ".."], b"x", None, True, {"C10"}, False),
        ("coder", "coder: --restricted", [*CODER, "--restricted"], b"x", None, True, {"C10"}, False),
        ("coder", "coder: project defaultMode acceptEdits", CODER, b"x", None, False, {"C9"}, False),
        ("reviewer", "model hardcoded", replace(REVIEWER, "--model", ["--model", "opus"]), b"x", None, True, {"C3"}, False),
        ("reviewer", "model missing", replace(REVIEWER, "--model", []), b"x", None, True, {"C3"}, False),
        ("reviewer", "budget missing", replace(REVIEWER, "--max-budget-usd", []), b"x", None, True, {"C3"}, False),
        ("reviewer", "budget in exponent form (3.7e-1)", head(READER_SCHEMA, "3.7e-1") + REVIEWER[10:], b"x", None, True, {"C3"}, False),
        ("reviewer", "--json-schema missing", replace(REVIEWER, "--json-schema", []), b"x", None, True, {"C4"}, False),
        ("reviewer", "--json-schema as a path", replace(REVIEWER, "--json-schema", ["--json-schema", "pipeline/contracts/reviewer.schema.json"]), b"x", None, True, {"C4"}, False),
        ("reviewer", "a schema rebuilt in code that differs", replace(REVIEWER, "--json-schema", ["--json-schema", json.dumps({"type": "object"})]), b"x", None, True, {"C4"}, False),
        ("reviewer", "text output", replace(REVIEWER, "--output-format", ["--output-format", "text"]), b"x", None, True, {"C8"}, False),
        ("reviewer", "stream-json without --verbose", replace(REVIEWER, "--output-format", ["--output-format", "stream-json"]), b"x", None, True, {"C8"}, False),
        ("reviewer", "-p missing", ["claude", *REVIEWER[2:]], b"x", None, True, {"C8"}, False),
        ("reviewer", "prompt after the --tools values, empty stdin", [*replace(REVIEWER, "--tools", []), "--tools", "Read,Grep,Glob", "review this diff"], b"", None, True, {"C8"}, False),
        ("reviewer", "two positional arguments", [*REVIEWER, "--", "review", "this"], b"", None, True, {"C8"}, False),
        ("reviewer", "--tools twice", [*REVIEWER, "--tools", "Read,Grep,Glob"], b"x", None, True, {"C8"}, False),
        ("reviewer", "--allowedTools Read --allowed-tools Grep", [*REVIEWER, "--allowedTools", "Read", "--allowed-tools", "Grep"], b"x", None, True, {"C8"}, False),
        ("reviewer", "--model=<the roles.json value>", replace(REVIEWER, "--model", [f"--model={MODEL}"]), b"x", None, True, {"C8"}, False),
        ("reviewer", "-p=1 instead of -p", ["claude", "-p=1", *REVIEWER[2:]], b"x", None, True, {"C8"}, False),
        ("reviewer", "--verbose=1", [*REVIEWER, "--verbose=1"], b"x", None, True, {"C8"}, False),
        ("reviewer", "env CLAUDE_CODE_SUBAGENT_MODEL added", REVIEWER, b"x", {**BASE_ENV, "CLAUDE_CODE_SUBAGENT_MODEL": "haiku"}, True, {"C8"}, False),
        ("reviewer", "PATH prepended with ./bin", REVIEWER, b"x", {**BASE_ENV, "PATH": "./bin:" + BASE_ENV["PATH"]}, True, {"C8"}, False),
        ("coder", "coder: --disallowedTools 'mcp__*,Edit' + acceptEdits", [*CODER, "--disallowedTools", "mcp__*,Edit"], b"x", None, True, {"C7"}, False),
        ("coder", "coder: --disallowedTools mcp__* Read + --allowedTools Edit",
         replace(CODER, "--permission-mode", ["--allowedTools", "Edit", "--disallowedTools", "mcp__*", "Read"]), b"x", None, True, {"C7"}, False),
    ]
    for value in ("0", "-1", "abc", "1.5", "08 ", "+3", "", "٣", "8\n"):
        lines.append(("reviewer", f"--max-turns {value!r}", [*REVIEWER, "--max-turns", value], b"x", None, True, {"C8"}, False))
    listed = {spec.canonical for spec in table.by_spelling.values() if spec.is_listed}
    for spelling, spec in sorted(table.by_spelling.items()):
        if spec.canonical in listed:
            continue
        value = {"one": ["x"], "variadic": ["x"]}.get(spec.arity, [])
        lines.append(("reviewer", f"CLI row outside C10: {spelling}", [*REVIEWER, spelling, *value], b"x", None, True, {"C10"}, False))
    lines.append(("reviewer", "CLI row outside C10: --debug=api", [*REVIEWER, "--debug=api"], b"x", None, True, {"C10"}, False))
    lines.append(("reviewer", "CLI row outside C10: --session-id <uuid>", [*REVIEWER, "--session-id", "550e8400-e29b-41d4-a716-446655440000"], b"x", None, True, {"C10"}, False))
    return lines


def section_call_rules(table: rt.FlagTable, role_flags: dict[str, object]) -> None:
    honest = honest_call_lines()
    spellings_seen: set[str] = set()
    for role, name, argv, stdin, env in honest:
        ids, messages = grade(table, role_flags, role, argv, stdin, env)
        report("C", f"honest: {name}", not ids, f"{ids} {messages}")
        spellings_seen.update(a.partition("=")[0] for a in argv if a.startswith("-"))
    listed_spellings = {s for s, spec in table.by_spelling.items() if spec.is_listed}
    report("C", "every spelling on the C10 list appears in a passing line, and `--` too",
           listed_spellings <= spellings_seen and "--" in spellings_seen, str(sorted(listed_spellings - spellings_seen)))
    rows_outside = {spec.canonical for spec in table.by_spelling.values() if not spec.is_listed}
    two_name = [spec for spec in {s.canonical: s for s in table.by_spelling.values()}.values() if len(spec.spellings) == 2]
    report("C", "CLI data: 80 rows, 63 outside the C10 list, 10 two-name rows",
           len({s.canonical for s in table.by_spelling.values()}) == 80 and len(rows_outside) == 63 and len(two_name) == 10,
           f"{len(rows_outside)} outside, two-name: {[s.spellings for s in two_name]}")
    for role, name, argv, stdin, env, config_ok, expected, hint in must_fail_call_lines(table):
        ids, messages = grade(table, role_flags, role, argv, stdin, env, config_ok)
        has_hint = any("передайте его через stdin" in m for m in messages)
        ok = set(ids) == expected and (has_hint == hint or "C10" not in expected)
        report("C", f"must-fail [{'/'.join(sorted(expected))}]: {name}", ok, f"got {ids}")
    ids, messages = grade(table, role_flags, "coder", replace(CODER, "--permission-mode", ["--permission-mode", "auto"]))
    report("C", "auto prints the course-rule text, not only the effect text",
           any(m.startswith("C7 (правило курса)") for m in messages), str(messages))
    section_c7_causes(table, role_flags)


def section_c7_causes(table: rt.FlagTable, role_flags: dict[str, object]) -> None:
    """Re-run fix round: every C7 failure names its own cause, and only that cause."""
    texts = rt._str_dict(role_flags["messages"])
    no_mode = replace(CODER, "--permission-mode", [])
    cases = [
        ("no mode, no allow rule", no_mode, {"C7-approval"}),
        ("dontAsk, no allow rule", replace(CODER, "--permission-mode", ["--permission-mode", "dontAsk"]), {"C7-approval"}),
        ("--allowedTools Write alone", [*no_mode, "--allowedTools", "Write"], {"C7-approval"}),
        ("bypassPermissions (no approval line: bypass approves edits)",
         replace(CODER, "--permission-mode", ["--permission-mode", "bypassPermissions"]), {"C7-bypass"}),
        ("auto", replace(CODER, "--permission-mode", ["--permission-mode", "auto"]), {"C7-auto"}),
        ("plan + --allowedTools Edit", replace(CODER, "--permission-mode", ["--permission-mode", "plan", "--allowedTools", "Edit"]), {"C7-mode"}),
        ("plan alone", replace(CODER, "--permission-mode", ["--permission-mode", "plan"]), {"C7-mode"}),
        ("acceptEdits + --allowedTools Bash", [*CODER, "--allowedTools", "Bash"], {"C7-allow"}),
        ("acceptEdits + --allowedTools mcp__*", [*CODER, "--allowedTools", "mcp__*"], {"C7-allow"}),
        ("--allowedTools '*'", [*no_mode, "--allowedTools", "*"], {"C7-allow"}),
        ("acceptEdits + --tools Read,Edit,MultiEdit", [*CODER, "--tools", "Read,Edit,MultiEdit"], {"C7-tools"}),
        ("acceptEdits + --tools Read,Write", [*CODER, "--tools", "Read,Write"], {"C7-tools"}),
        ("acceptEdits + --tools default", [*CODER, "--tools", "default"], {"C7-tools"}),
        ("acceptEdits + --disallowedTools Edit", [*CODER, "--disallowedTools", "Edit"], {"C7-tools"}),
        ("bypass + --tools Read,Edit,Bash: two causes", [*replace(CODER, "--permission-mode", ["--permission-mode", "bypassPermissions"]),
                                                         "--tools", "Read,Edit,Bash"], {"C7-bypass", "C7-tools"}),
    ]
    for name, argv, keys in cases:
        ids, messages = grade(table, role_flags, "coder", argv)
        expected = {texts[key] for key in keys}
        report("C", f"C7 message names the cause: {name}", ids == ["C7"] and set(messages) == expected,
               f"{ids} {[next((k for k, v in texts.items() if v == m), m) for m in messages]}")
    has_generic = "C7" in texts
    report("C", "no generic C7 text is left in role_flags.json", not has_generic)


# ---------------------------------------------------------------------------------------------------------
# D. The fake end to end: PATH guard, socket bound, CLI errors, per-connection overlap, reply shapes
# ---------------------------------------------------------------------------------------------------------


class Harness:
    """A scratch, the fake installed in it, and a running server with a standard responder."""

    def __init__(self, table: rt.FlagTable, role_flags: dict[str, object], templates: dict[str, object],
                 contracts: Path | None = None, roles: tuple[str, ...] = (), run_dir: str | None = None,
                 hold_sec: float = 0.0, scenario: str = "ok", watch_config: bool = False,
                 hold_snapshot: Callable[[], dict[str, str]] | None = None, watch_material: bool = False) -> None:
        self.scratch = rt.make_scratch()
        self.env = rt.child_environment(self.scratch)
        rt.assert_no_real_claude(self.env, self.scratch)
        rt.install_fake_claude(self.scratch, L2_CHECKS / "fake_claude.py")
        schemas = rt.load_role_schemas(contracts, roles) if contracts else []
        self.run_dir = run_dir

        def plan(role: str | None, index: int) -> rt.PlannedReply:
            return rt.PlannedReply(scenario, {"findings": [], "role": role, "index": index}, hold_sec)

        self.responder = rt.StandardResponder(table=table, role_flags=role_flags, templates=templates,
                                              schemas=schemas, home=str(self.scratch.home), run_dir=run_dir, plan=plan,
                                              watch_config_during_hold=watch_config, hold_snapshot=hold_snapshot,
                                              watch_material_during_hold=watch_material)
        self.server = rt.FakeClaudeServer(self.scratch.socket_path, self.responder)

    def __enter__(self) -> "Harness":
        self.server.__enter__()
        return self

    def __exit__(self, *exc: object) -> None:
        self.server.__exit__(*exc)
        shutil.rmtree(self.scratch.root, ignore_errors=True)

    def call(self, argv: list[str], stdin: bytes = b"", cwd: Path | None = None) -> subprocess.CompletedProcess[bytes]:
        return subprocess.run(argv, input=stdin, capture_output=True, env=self.env, cwd=cwd or self.scratch.root,
                              timeout=30)


def section_fake(table: rt.FlagTable, role_flags: dict[str, object], templates: dict[str, object], work: Path,
                 overlap_runs: int) -> None:
    probe = work / "path-guard"
    (probe / "bin").mkdir(parents=True)
    scratch = rt.make_scratch()
    try:
        env = rt.child_environment(scratch)
        try:
            rt.assert_no_real_claude(env, scratch)
            report("D", "PATH guard passes when no claude is reachable", True, env["PATH"])
        except rt.PlatformError as error:
            report("D", "PATH guard passes when no claude is reachable", False, str(error))
        fake_real = probe / "bin" / "claude"
        fake_real.write_text("#!/bin/sh\nexit 0\n")
        fake_real.chmod(0o755)
        try:
            rt.assert_no_real_claude({**env, "PATH": env["PATH"] + f":{probe / 'bin'}"}, scratch)
            report("D", "PATH guard: platform error when a real claude is reachable", False, "no error")
        except rt.PlatformError as error:
            report("D", "PATH guard: platform error when a real claude is reachable", True, str(error)[:90])
    finally:
        shutil.rmtree(scratch.root, ignore_errors=True)
    homebrew = "/opt/homebrew/bin/python3.12"
    if os.path.exists(homebrew):
        result = subprocess.run([homebrew, "-I", "-B", "-c", textwrap.dedent(f"""
            import sys, shutil; sys.path.insert(0, {str(L2_CHECKS)!r}); import orchestra_runtime as rt
            s = rt.make_scratch()
            try:
                rt.assert_no_real_claude(rt.child_environment(s), s); print("no error")
            except rt.PlatformError as e:
                print("PlatformError:", e)
            finally:
                shutil.rmtree(s.root)
        """)], capture_output=True, text=True)
        executable = subprocess.run([homebrew, "-I", "-c", "import sys; print(sys.executable)"], capture_output=True,
                                    text=True).stdout.strip()
        expected = shutil.which("claude", path=os.path.dirname(executable)) is not None
        report("D", f"PATH guard under {homebrew} (sys.executable {executable}): platform error = {expected}",
               result.stdout.startswith("PlatformError") == expected, result.stdout.strip()[:120])
    try:
        rt.FakeClaudeServer(Path("/tmp/" + "x" * 100 + "/f.sock"), lambda r: (rt.FakeReply(0, "", ""), {}))
        report("D", "socket path over 100 bytes is a platform error", False)
    except rt.PlatformError as error:
        report("D", "socket path over 100 bytes is a platform error", True, str(error)[:60])

    with Harness(table, role_flags, templates) as h:
        report("D", "socket path length on this machine", len(str(h.scratch.socket_path).encode()) <= 100,
               f"{len(str(h.scratch.socket_path).encode())} bytes: {h.scratch.socket_path}")
        ok_call = h.call([*REVIEWER], b"review this")
        reply = json.loads(ok_call.stdout)
        report("D", "honest call: exit 0, success arm with every required field",
               ok_call.returncode == 0 and reply["subtype"] == "success" and reply["is_error"] is False
               and {"uuid", "session_id", "duration_ms", "duration_api_ms", "num_turns", "result", "stop_reason",
                    "total_cost_usd", "usage", "modelUsage", "permission_denials", "structured_output"} <= reply.keys()
               and list(reply["modelUsage"]) == [MODEL], ok_call.stderr.decode()[:200])
        stream = h.call(replace(REVIEWER, "--output-format", ["--output-format", "stream-json", "--verbose"]), b"x")
        lines = [json.loads(line) for line in stream.stdout.decode().splitlines()]
        report("D", "stream-json: init, a working turn (text, Read tool_use, its tool_result), StructuredOutput "
               "tool_use, tool_result, result; one content block per line",
               [(l["type"], l.get("subtype")) for l in lines] == [
                   ("system", "init"), ("assistant", None), ("assistant", None), ("user", None), ("assistant", None),
                   ("user", None), ("result", "success")]
               and "StructuredOutput" in lines[0]["tools"]
               and all(len(l["message"]["content"]) == 1 for l in lines[1:-1])
               and lines[1]["message"]["content"][0]["type"] == "text"
               and lines[2]["message"]["content"][0]["name"] == "Read"
               and lines[3]["message"]["content"][0]["tool_use_id"] == lines[2]["message"]["content"][0]["id"]
               and lines[4]["message"]["content"][0]["name"] == "StructuredOutput"
               and lines[5]["message"]["content"][0]["content"] == "Structured output provided successfully"
               and len({l["session_id"] for l in lines}) == 1)
        cases = [
            ("unknown flag --allowedtools", [*REVIEWER, "--allowedtools", "Read"], b"x", "error: unknown option '--allowedtools'"),
            ("stream-json without --verbose", replace(REVIEWER, "--output-format", ["--output-format", "stream-json"]), b"x",
             "Error: When using --print, --output-format=stream-json requires --verbose"),
            ("no prompt", REVIEWER, b"", "Error: Input must be provided either through stdin or as a prompt argument when using --print"),
            ("prompt swallowed by --tools", [*replace(REVIEWER, "--tools", []), "--tools", "Read", "review it"], b"",
             "Error: Input must be provided"),
            ("invalid inline schema ($schema 2020-12)", replace(REVIEWER, "--json-schema", ["--json-schema", json.dumps({"$schema": "https://json-schema.org/draft/2020-12/schema"})]), b"x",
             "Error: --json-schema is not a valid JSON Schema"),
            ("--json-schema given a path", replace(REVIEWER, "--json-schema", ["--json-schema", "contracts/reviewer.schema.json"]), b"x",
             "Error: --json-schema is not a valid JSON Schema: not JSON"),
        ]
        for name, argv, stdin, stderr_start in cases:
            result = h.call(argv, stdin)
            report("D", f"CLI error emulated: {name}", result.returncode == 1 and result.stderr.decode().startswith(stderr_start)
                   and result.stdout == b"", result.stderr.decode().strip()[:100])
        record = h.server.calls()[2]
        ids, _ = grade(table, role_flags, "reviewer", record.request.argv, record.request.stdin)
        report("D", "the unknown-flag call is graded C10 from the server record", ids == ["C10"] and "--allowedtools" in record.request.argv, str(ids))
        first = h.server.calls()[0].request
        report("D", "the record holds argv, cwd, env (with values), stdin and the server times",
               not rt.environment_changed(first.environment, h.env) and first.environment["PATH"] == h.env["PATH"] and h.server.calls()[0].request.stdin == b"review this"
               and h.server.calls()[0].request.cwd == str(h.scratch.root) and h.server.calls()[0].t_end >= h.server.calls()[0].request.t_start)

    with Harness(table, role_flags, templates) as h:
        project = h.scratch.root / "project"
        (project / ".claude" / "agents").mkdir(parents=True)
        (project / ".claude" / "settings.json").write_text('{"env": {}}')
        (project / ".claude" / "agents" / "reviewer.md").write_text("---\nname: r\n---\n")
        pristine = rt.claude_config_snapshot(project)
        h.call(REVIEWER, b"x", cwd=project)
        (project / ".claude" / "settings.local.json").write_text('{"permissions": {"defaultMode": "acceptEdits"}}')
        h.call(REVIEWER, b"x", cwd=project)
        (project / ".claude" / "settings.local.json").unlink()
        (project / ".claude" / "agents" / "reviewer.md").write_text("---\nname: r\ntools: Bash\n---\n")
        h.call(REVIEWER, b"x", cwd=project)
        seen = [record.details["claudeConfig"] == pristine for record in h.server.calls()]
        report("D", "C9 snapshot per call: unchanged, then settings.local.json created, then an agent file edited",
               seen == [True, False, False], str(seen))

    for scenario in ("no-structured", "retries", "budget", "max-turns", "execution", "auth"):
        with Harness(table, role_flags, templates, scenario=scenario) as h:
            result = h.call(REVIEWER, b"x")
            reply = json.loads(result.stdout)
            spec = templates["scenarios"][scenario]
            if spec["arm"] == "error":
                shape = reply["is_error"] is True and reply["subtype"] == spec["subtype"] and reply["errors"] and "result" not in reply and "structured_output" not in reply
            elif spec["arm"] == "auth":
                shape = reply["subtype"] == "success" and reply["is_error"] is True and reply["result"].startswith("Failed to authenticate") and reply["terminal_reason"] == "api_error"
            else:
                shape = reply["subtype"] == "success" and "structured_output" not in reply and "```json" in reply["result"]
            report("D", f"scenario {scenario}: exit {spec['exit']} and its documented shape", result.returncode == spec["exit"] and shape)

    spans = []
    misses = 0
    with Harness(table, role_flags, templates, hold_sec=HOLD_SEC) as h:
        for run in range(overlap_runs):
            before = len(h.server.calls())
            processes = [subprocess.Popen(REVIEWER, stdin=subprocess.PIPE, stdout=subprocess.PIPE, env=h.env) for _ in range(3)]
            for process in processes:
                process.stdin.write(b"review this")
                process.stdin.close()
            for process in processes:
                process.stdout.read()
                process.wait()
            records = h.server.calls()[before:]
            span = max(r.t_end for r in records) - min(r.request.t_start for r in records)
            spans.append(span)
            if not (len(records) == 3 and rt.calls_overlap(records) and HOLD_SEC <= span <= OVERLAP_SPAN_MAX_SEC):
                misses += 1
    report("D", f"per-connection server: 3 clients with a {HOLD_SEC} s hold overlap, span within 2.0-2.5 s, {overlap_runs} runs",
           misses == 0, f"{overlap_runs - misses}/{overlap_runs} ok, span min {min(spans):.3f} max {max(spans):.3f}")
    with Harness(table, role_flags, templates, hold_sec=HOLD_SEC) as h:
        started = time.monotonic()
        for _ in range(3):
            h.call(REVIEWER, b"x")
        report("D", "attack: sequential 'parallel' calls do not overlap", not rt.calls_overlap(h.server.calls()),
               f"wall {time.monotonic() - started:.2f} s")
    section_stream_timing(table, role_flags, templates)


def timed_lines(h: "Harness", argv: list[str]) -> list[tuple[float, str]]:
    """Each stdout line of one call with the time it reached the caller, from the request's arrival."""
    process = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, env=h.env, cwd=h.scratch.root)
    process.stdin.write(b"review this")
    process.stdin.close()
    lines = [(time.monotonic(), line.decode()) for line in iter(process.stdout.readline, b"")]
    process.wait()
    arrival = h.server.calls()[-1].request.t_start
    return [(at - arrival, line) for at, line in lines]


def section_stream_timing(table: rt.FlagTable, role_flags: dict[str, object], templates: dict[str, object]) -> None:
    """Hold-and-poll round, L2 B2: under stream-json the lines the real CLI prints while it works reach the
    caller inside the hold; only the last three (and every json line) come after it."""
    stream_argv = replace(REVIEWER, "--output-format", ["--output-format", "stream-json", "--verbose"])
    early_ok = 0
    runs = 5
    detail = ""
    with Harness(table, role_flags, templates, hold_sec=HOLD_SEC) as h:
        for _ in range(runs):
            lines = timed_lines(h, stream_argv)
            kinds = [json.loads(line).get("type") for _, line in lines]
            times = [at for at, _ in lines]
            is_early = (kinds[:4] == ["system", "assistant", "assistant", "user"] and times[0] < 0.2
                        and max(times[1:4]) < HOLD_SEC * rt.WORKING_MESSAGE_HOLD_SHARE + 0.2
                        and len(times) == 7 and all(at >= HOLD_SEC for at in times[4:]))
            early_ok += is_early
            detail = ", ".join(f"{kind} {at:.2f}" for kind, at in zip(kinds, times))
        report("D", f"stream-json, {HOLD_SEC} s hold: init at once, the working turn in the first half, the "
               f"last three lines after the hold ({runs} runs)", early_ok == runs, f"{early_ok}/{runs}; last: {detail}")
        lines = timed_lines(h, REVIEWER)
        report("D", "json: the single line comes after the hold, as the real CLI prints it at the end",
               len(lines) == 1 and lines[0][0] >= HOLD_SEC, f"{lines[0][0]:.2f} s")
    with Harness(table, role_flags, templates, hold_sec=HOLD_SEC, scenario="auth") as h:
        lines = timed_lines(h, stream_argv)
        kinds = [json.loads(line).get("type") for _, line in lines]
        report("D", "stream-json auth arm: init at once, no working message, the result after the hold",
               kinds == ["system", "result"] and lines[0][0] < 0.2 and lines[1][0] >= HOLD_SEC, str(kinds))


# ---------------------------------------------------------------------------------------------------------
# E. launch.py and every fan-out form: overlap, imports, H7 with pymp-* directories
# ---------------------------------------------------------------------------------------------------------

CLAUDE_CALL = '''
import json, subprocess
SCHEMA = json.dumps({"type": "object", "required": ["findings"], "properties": {"findings": {"type": "array"}}})
ARGS = ["claude", "-p", "--output-format", "json", "--model", "sonnet", "--max-budget-usd", "0.50",
        "--json-schema", SCHEMA, "--tools", "Read,Grep,Glob", "--disallowedTools", "mcp__*"]

def call(prompt):
    done = subprocess.run(ARGS, input=prompt.encode(), capture_output=True, timeout=60)
    return json.loads(done.stdout)
'''

FORMS = {
    "threads": ("from concurrent.futures import ThreadPoolExecutor\n"
                "def fan_out(prompts):\n    with ThreadPoolExecutor(3) as ex:\n        return list(ex.map(call, prompts))\n"),
    "asyncio": ("import asyncio\nfrom claude_call import ARGS\n"
                "async def acall(prompt):\n"
                "    proc = await asyncio.create_subprocess_exec(*ARGS, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE)\n"
                "    out, _ = await proc.communicate(prompt.encode())\n    return json.loads(out)\n"
                "async def main_async(prompts):\n    return await asyncio.gather(*(acall(p) for p in prompts))\n"
                "def fan_out(prompts):\n    return asyncio.run(main_async(prompts))\n"),
    "popen-stdin": ("from claude_call import ARGS\n"
                    "def fan_out(prompts):\n    procs = []\n    for p in prompts:\n"
                    "        proc = subprocess.Popen(ARGS, stdin=subprocess.PIPE, stdout=subprocess.PIPE)\n"
                    "        proc.stdin.write(p.encode()); proc.stdin.close(); procs.append(proc)\n"
                    "    return [json.loads(proc.stdout.read()) for proc in procs if proc.wait() is not None]\n"),
    "popen-positional": ("from claude_call import ARGS\n"
                         "def fan_out(prompts):\n"
                         "    procs = [subprocess.Popen(['claude', '-p', p, *ARGS[2:]], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE) for p in prompts]\n"
                         "    return [json.loads(proc.communicate()[0]) for proc in procs]\n"),
}
for _method in ("fork", "spawn", "forkserver"):
    FORMS[f"processpool-{_method}"] = (
        "import multiprocessing\nfrom concurrent.futures import ProcessPoolExecutor\n"
        f"def fan_out(prompts):\n    with ProcessPoolExecutor(3, mp_context=multiprocessing.get_context({_method!r})) as ex:\n"
        "        return list(ex.map(call, prompts))\n")

RUN_TEMPLATE = '''
import argparse, json, os, subprocess, sys
{import_line}
{form}
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--task"); parser.add_argument("--acceptance"); parser.add_argument("--run-dir")
    args = parser.parse_args()
    os.makedirs(args.run_dir, exist_ok=True)
    results = fan_out([f"review section {{i}}" for i in range(3)])
    with open(os.path.join(args.run_dir, "fan-out.json"), "w") as handle:
        json.dump(results, handle)
    {extra}
    return 0 if len(results) == 3 else 1
{tail}
'''


def make_project(root: Path, form: str, import_line: str = "from claude_call import call", guard: bool = True,
                 extra: str = "pass", shadow_json: bool = False) -> Path:
    project = root / "project"
    (project / "pipeline").mkdir(parents=True)
    (project / "task").mkdir()
    (project / "task" / "request.md").write_text("Fix the bug.\n")
    (project / "task" / "acceptance.md").write_text("- tests pass\n")
    (project / "pipeline" / "claude_call.py").write_text(CLAUDE_CALL)
    if shadow_json:
        (project / "json.py").write_text("raise SystemExit('workspace json.py shadowed the standard module')\n")
    tail = "if __name__ == '__main__':\n    sys.exit(main())\n" if guard else "sys.exit(main())\n"
    (project / "pipeline" / "run.py").write_text(RUN_TEMPLATE.format(import_line=import_line, form=FORMS[form],
                                                                     extra=extra, tail=tail))
    (project / ".git").mkdir()
    (project / ".git" / "HEAD").write_text("ref: refs/heads/main\n")
    return project


def run_pipeline(project: Path, table: rt.FlagTable, role_flags: dict[str, object], templates: dict[str, object],
                 layout: str = "flat", hold: float = HOLD_SEC, extra_excluded: tuple[str, ...] = ()) -> dict[str, object]:
    with Harness(table, role_flags, templates, hold_sec=hold) as h:
        copy = rt.copy_workspace(project, h.scratch, layout)
        run_dir = h.scratch.root / "run-0"
        is_excluded = rt.h7_exclusion(run_dir, [copy / p for p in extra_excluded], h.scratch.tmp)
        before = rt.tree_snapshot([h.scratch.root, copy], is_excluded)
        result = rt.run_process(rt.pipeline_command(L3_CHECKS, copy, run_dir), copy, h.env, 120)
        after = rt.tree_snapshot([h.scratch.root, copy], is_excluded)
        pymp = sorted(p.name for p in h.scratch.tmp.iterdir() if p.name.startswith("pymp-")) if h.scratch.tmp.exists() else []
        records = h.server.calls()
        return {"code": result.code, "stderr": result.stderr, "records": records, "changes": rt.tree_changes(before, after),
                "copy_has_git": (copy / ".git").exists(), "cwds": {r.request.cwd for r in records}, "copy": str(copy),
                "pymp": pymp, "envs_same": all(not rt.environment_changed(r.request.environment, h.env) for r in records)}


def section_launch(table: rt.FlagTable, role_flags: dict[str, object], templates: dict[str, object], work: Path) -> None:
    cases: list[tuple[str, str, str, bool, str]] = [
        (form, form, "from claude_call import call", True, "flat") for form in FORMS
    ]
    cases += [
        ("threads, package import (namespace package)", "threads", "from pipeline.claude_call import call", True, "nested"),
        ("threads, no __main__ guard", "threads", "from claude_call import call", False, "flat"),
        ("processpool-fork, no __main__ guard", "processpool-fork", "from claude_call import call", False, "nested"),
    ]
    for index, (name, form, import_line, guard, layout) in enumerate(cases):
        project = make_project(work / f"launch-{index}", form, import_line, guard)
        result = run_pipeline(project, table, role_flags, templates, layout)
        records = result["records"]
        ok = (result["code"] == 0 and len(records) == 3 and rt.calls_overlap(records) and not result["changes"]
              and not result["copy_has_git"] and result["cwds"] == {result["copy"]} and result["envs_same"])
        report("E", f"honest fan-out form: {name} ({layout} copy)", ok,
               f"code {result['code']}, calls {len(records)}, overlap {rt.calls_overlap(records)}, H7 {result['changes'][:3]}, "
               f"pymp seen {result['pymp']}, env unchanged {result['envs_same']} {result['stderr'][-300:] if result['code'] else ''}")
    project = make_project(work / "launch-pymp-left", "processpool-forkserver",
                           extra="os._exit(0) if os.listdir(os.environ['TMPDIR']) else os._exit(3)")
    result = run_pipeline(project, table, role_flags, templates, hold=0.0)
    report("E", "honest: forkserver killed before cleanup leaves pymp-* under TMPDIR, and H7 still sees no change",
           result["code"] == 0 and bool(result["pymp"]) and not result["changes"], f"pymp {result['pymp']}, H7 {result['changes'][:2]}")
    project = make_project(work / "launch-pymp-lookalike", "threads",
                           extra="os.makedirs(os.path.join(os.environ['TMPDIR'], 'sub', 'pymp-x'))")
    result = run_pipeline(project, table, role_flags, templates, hold=0.0)
    report("E", "attack: a pymp-* name below another TMPDIR directory is not excluded", bool(result["changes"]),
           str(result["changes"][:2]))
    project = make_project(work / "launch-json-threads", "threads", shadow_json=True)
    result = run_pipeline(project, table, role_flags, templates, hold=0.0)
    report("E", "attack: workspace json.py does not replace the module in the launch process (threads)",
           result["code"] == 0 and len(result["records"]) == 3, f"code {result['code']}")
    for form in ("processpool-spawn", "processpool-forkserver"):
        project = make_project(work / f"launch-json-{form}", form, shadow_json=True)
        result = run_pipeline(project, table, role_flags, templates, hold=0.0)
        report("E", f"recorded: workspace json.py with {form}: the worker imports it = {result['code'] != 0}", True,
               f"code {result['code']}, calls {len(result['records'])}, {result['stderr'].strip().splitlines()[-1:] }")
    project = make_project(work / "launch-seq", "threads")
    (project / "pipeline" / "run.py").write_text((project / "pipeline" / "run.py").read_text().replace(
        "with ThreadPoolExecutor(3) as ex:\n        return list(ex.map(call, prompts))", "return [call(p) for p in prompts]"))
    result = run_pipeline(project, table, role_flags, templates)
    report("E", "attack: sequential calls in a 'fan-out' are seen as sequential",
           result["code"] == 0 and len(result["records"]) == 3 and not rt.calls_overlap(result["records"]))
    project = make_project(work / "launch-exit", "threads", extra="raise SystemExit(7)")
    result = run_pipeline(project, table, role_flags, templates, hold=0.0)
    report("E", "launch.py passes the script's SystemExit code through", result["code"] == 7, str(result["code"]))
    project = make_project(work / "launch-crash", "threads", extra="raise RuntimeError('boom')")
    result = run_pipeline(project, table, role_flags, templates, hold=0.0)
    report("E", "launch.py exits 1 on an uncaught exception", result["code"] == 1 and "RuntimeError" in result["stderr"])


# ---------------------------------------------------------------------------------------------------------
# F. 4.6 prototype parity on the judge's corpora, then the grader's own 4.6 lines
# ---------------------------------------------------------------------------------------------------------

DUAL = '''
import os, sys
sys.path[0:0] = [{judge!r}, {checks!r}]
import refs6_lit
import refs5_proto as base
import orchestra_runtime as rt
LIT = base.World.material

def material(s, text):
    before = base.STATS[0]
    files, expanded = LIT(s, text)
    lit_stats = base.STATS[0] - before
    mine = rt.resolve_material([text], cwd=s.copy, home=s.HOME, run_dir=s.run, translate=s.lit)
    same = (set(files) == set(mine.files) and sorted(expanded) == sorted(mine.expanded)
            and lit_stats == mine.stat_calls)
    print("PARITY", "same" if same else "DIFFERENT", len(files), len(mine.files), lit_stats, mine.stat_calls,
          f"{{mine.seconds:.4f}}", flush=True)
    return files, expanded

base.World.material = material
World, inside, STATS = base.World, base.inside, base.STATS
'''

CORPUS5_RELABELLED = {
    "shell-escaped <run>/coder\\ out.json [note]": "RS16, recorded (not caught)",
    "file:///<run>/coder%20out.json [note]": "RS16, recorded (not caught)",
    "9-token name (8 whitespace runs, RS16)": "must-fail (caught)",
}


def section_parity(judge: Path, work: Path) -> None:
    dual = work / "parity" / "dual_resolver.py"
    dual.parent.mkdir(parents=True)
    dual.write_text(DUAL.format(judge=str(judge), checks=str(L2_CHECKS)))
    for corpus, expected_xx in (("corpus5.py", set(CORPUS5_RELABELLED)), ("corpus6.py", set())):
        cwd = work / "parity" / corpus.removesuffix(".py")
        cwd.mkdir()
        result = subprocess.run([sys.executable, "-I", "-B", str(judge / corpus), str(dual)], cwd=cwd, capture_output=True,
                                text=True, timeout=600)
        (cwd / "out.txt").write_text(result.stdout + result.stderr)
        lines = result.stdout.splitlines()
        parity = [line for line in lines if line.startswith("PARITY")]
        different = [line for line in parity if " DIFFERENT " in line]
        cases = [line for line in lines if line.startswith(("ok ", "XX "))]
        xx = {re.sub(r"^XX \[\w+\] ", "", line).split("  ")[0].strip() for line in cases if line.startswith("XX")}
        report("F", f"{corpus}: same files read, same dirs expanded, same stat count as refs6_lit on every call",
               result.returncode == 0 and len(parity) == len(cases) and not different,
               f"{len(parity)} calls compared, {len(different)} different {result.stderr[-300:]}")
        relabel = "; ".join(f"{name} -> {CORPUS5_RELABELLED[name]}" for name in sorted(xx & set(CORPUS5_RELABELLED)))
        report("F", f"{corpus}: verdicts equal the expectations after the plan's relabels",
               xx == expected_xx, f"{len(cases)} cases, lines off the corpus label: {sorted(xx)}; relabelled: {relabel or 'none'}")
        slowest = max((float(line.split()[-1]) for line in parity), default=0.0)
        report("F", f"{corpus}: slowest single call of the grader's resolver", slowest < 0.2, f"{slowest:.4f} s")


def section_material(work: Path) -> None:
    root = Path(os.path.realpath(tempfile.mkdtemp(prefix="mat-", dir=work)))
    copy, run, home = root / "copy", root / "run-0", root / "home"
    for directory in (copy / "work", copy / "task", copy / "src", run, home):
        directory.mkdir(parents=True)
    (copy / "work" / "change.diff").write_text("--- a/src/x.py\n+++ b/src/x.py\n+x = 1\n")
    (copy / "task" / "acceptance.md").write_text("- x is 1\n")
    (copy / "src" / "x.py").write_text("x = 1\n")
    (run / "coder.json").write_text('{"summary": "TOK-narrative"}')
    base = {str(copy / "work" / "change.diff"), str(copy / "task" / "acceptance.md")}
    prompt = "Review work/change.diff against task/acceptance.md."

    def read(text: str) -> rt.Material:
        return rt.resolve_material([text], cwd=str(copy), home=str(home), run_dir=str(run))

    for name in ("accepted.json", "accepted-1.json", "Accepted_2.v1.json", "findings.final.json"):
        (run / name).write_text("{}")
        material = read(f"{prompt} Findings: {run}/{name}")
        report("F", f"honest run-dir name in [A-Za-z0-9_.-]: {name} reads only itself",
               set(material.files) == base | {str(run / name)} and not material.expanded and rt.RUN_FILE_NAME.match(name) is not None)
        (run / name).unlink()
    for name in ("#1.json", "@notes.json", "(1).json", "находки.json"):
        (run / name).write_text("{}")
        material = read(f"{prompt} Findings: {run}/{name}")
        leaks = str(run / "coder.json") in material.files
        report("F", f"recorded: a run-dir name outside the alphabet ({name}) expands the run dir: {leaks}; "
               f"RUN_FILE_NAME rejects it", rt.RUN_FILE_NAME.match(name) is None, f"expanded {material.expanded}")
        (run / name).unlink()
    for label, text in (("NUL in a path", f"{prompt} see /tmp/a\x00b.json"), ("lone surrogate", f"{prompt} see /tmp/\udc80.json"),
                        ("over-long name", f"{prompt} see /tmp/{'n' * 5000}.json")):
        try:
            material = read(text)
            report("F", f"os.stat ValueError / UnicodeEncodeError / ENAMETOOLONG = nonexistent: {label}",
                   set(material.files) == base)
        except Exception as error:
            report("F", f"os.stat ValueError / UnicodeEncodeError / ENAMETOOLONG = nonexistent: {label}", False, repr(error))
    git = copy / ".git"
    for index in range(5000):
        objects = git / "objects" / f"{index % 256:02x}"
        objects.mkdir(parents=True, exist_ok=True)
        (objects / f"{index:038x}").write_text("blob")
    material = read(f"{prompt} Project root: {copy}. Only look under ./ and src/ . / ~/ ../")
    report("F", "honest: project root with a planted 5000-object .git named in prose expands nothing",
           set(material.files) == base and not material.expanded, f"{material.seconds:.4f} s, {material.stat_calls} stats")
    (run / "later.json").unlink(missing_ok=True)
    first = read(f"{prompt} context {run}/handoff.md")
    (run / "handoff.md").write_text(f"see {run}/coder.json\n")
    second = read(f"{prompt} context {run}/handoff.md")
    report("F", "a file written after the call starts is seen by the run-end resolution (two-hop)",
           str(run / "coder.json") not in first.files and str(run / "coder.json") in second.files)
    huge = root / "huge"
    huge.mkdir()
    for index in range(rt.MATERIAL_FILE_CAP + 1):
        (huge / f"f{index}.txt").write_text("x")
    os.symlink(huge, run / "linkdir")
    try:
        read(f"{prompt} context {run}/")
        report("F", "a run-dir symlink to a huge tree hits the cap as a platform error", False, "no error")
    except rt.MaterialCapError as error:
        report("F", "a run-dir symlink to a huge tree hits the cap as a platform error", True, str(error)[:80])
    os.unlink(run / "linkdir")

    single = "/" + "!".join(f"{i}." for i in range(20))
    counted = rt.resolve_material([single], cwd=str(copy), home=str(home), run_dir=str(run))
    report("F", "stat bound: one start yields 32 span candidates + the word and its dot variant = 34",
           counted.stat_calls == 34, f"{counted.stat_calls} stats for {single[:40]}...")
    worst = 0
    for seed_line in (single * 3, "«" + single + "» " * 50, ("/a b. " * 400), ("x/y.!" * 800)):
        line_candidates = rt.reference_candidates(seed_line, str(home))
        starts = sum(1 for p, ch in enumerate(seed_line) if ch in "/.~" and (p == 0 or rt.is_boundary(seed_line[p - 1])))
        words = len(rt.WORD_PATTERN.findall(seed_line))
        worst = max(worst, len(line_candidates) - 2 * words - 32 * starts)
    report("F", "stat bound holds on adversarial lines: candidates <= 2 per word + 32 per start", worst <= 0, f"max excess {worst}")

    findings = [{"id": rt.draw_finding_id(), "section": "security", "file": "s" * 60, "line": 999, "quote": "q" * 80,
                 "claim": "c" * 120, "severity": "high"} for _ in range(15)]
    largest = json.dumps(findings, indent=2) + "\n" + "a" * ACCEPTANCE_BYTES + "\n" + CYRILLIC_2KB
    material = read(largest)
    report("F", "time bound: the L4 synthesizer input at maximum sizes plus 2 KB Cyrillic resolves under 0.2 s",
           material.seconds < 0.2, f"{material.seconds:.4f} s, {material.stat_calls} stats, {len(largest.encode())} bytes")
    lines = [f"src/m{i}.py:{i}: /work/dir{i}/file{i}.py ./a/b{i} ~/x{i}" for i in range(4000)]
    big = "\n".join(lines)
    material = read(big)
    report("F", "scale (recorded): 4000 lines of path words", True, f"{material.seconds:.3f} s, {material.stat_calls} stats, {len(big) // 1024} KB")
    section_material_fix_round(copy, run, home, prompt, read)


def section_material_fix_round(copy: Path, run: Path, home: Path, prompt: str,
                               read: Callable[[str], rt.Material]) -> None:
    """Student fix round (Stepan, 2026-11-04): leak forms in scope, each must be found; near misses must not."""
    token = rt.draw_token()
    narrative = f"{token} the change looks fine"
    for label, encoding in (("UTF-16 with BOM", "utf-16"), ("UTF-16-LE without BOM", "utf-16-le"),
                            ("UTF-16-BE without BOM", "utf-16-be"), ("UTF-32 with BOM", "utf-32"),
                            ("UTF-32-LE without BOM", "utf-32-le")):
        name = f"stash-{encoding}.txt"
        (run / name).write_bytes(narrative.encode(encoding))
        material = read(f"{prompt} Notes: {run}/{name}")
        report("F", f"leak: a run-dir file in {label} is read and its text found", rt.has_mark(material.search_texts(), token)
               and str(run / name) in material.files)
        (run / name).unlink()
    (run / "hop.txt").write_bytes(f"see {run}/coder.json".encode("utf-16"))
    material = read(f"{prompt} Notes: {run}/hop.txt")
    report("F", "a UTF-16 file's own references are followed (two hops)", str(run / "coder.json") in material.files)
    (run / "hop.txt").unlink()
    escaped = json.dumps({"summary": "".join(f"\\u{ord(c):04x}" for c in narrative)})
    for label, text in (("upper case", narrative.upper()), ("title case", narrative.title()),
                        ("every character \\u-escaped", "".join(f"\\u{ord(c):04x}" for c in narrative)),
                        ("\\u-escaped inside a JSON string, escaped again", escaped),
                        ("upper-case \\U-style hex digits", "".join(f"\\u{ord(c):04X}" for c in narrative))):
        report("F", f"leak: narrative in the prompt, {label}", rt.has_mark(rt.material_search_texts([prompt + text], {}), token))
    other = rt.draw_token()
    report("F", "near miss: another token, and the token with one hex digit changed, are not found",
           not rt.has_mark(rt.material_search_texts([narrative], {}), other)
           and not rt.has_mark(rt.material_search_texts([narrative], {}), token[:-1] + ("0" if token[-1] != "0" else "1")))
    report("F", "plain UTF-8 file: one decoding only (no wide decodings, no cost)",
           rt.decoded_texts("Контракт nt00\n".encode()) == ["Контракт nt00\n"])
    report("F", "JSON unescape: surrogate pair joined, lone surrogate replaced, unknown escape kept",
           rt.json_unescaped("\\ud83d\\ude00 \\ud800 \\x41") == "\U0001F600 � \\x41")
    pseudo = run.parent / "pseudo-root"
    pseudo.mkdir()
    os.symlink("/", pseudo / "root")
    (pseudo / "status").write_text(narrative)
    saved = rt.PSEUDO_FILE_ROOTS
    rt.PSEUDO_FILE_ROOTS = (*saved, str(pseudo))
    try:
        alias = read(f"{prompt} Notes: {pseudo}/root{run}/coder.json")
        own = read(f"{prompt} Notes: {pseudo}/status")
    finally:
        rt.PSEUDO_FILE_ROOTS = saved
    report("F", "pseudo filter on the realpath: an alias through a pseudo root's symlink to / is read; a file that "
           "really lies in the pseudo root is not", str(run / "coder.json") in alias.files and str(pseudo / "status") not in own.files)
    section_fd_aliases(run, prompt, read, narrative, token)
    section_relative_to_file(copy, run, home, prompt, read, narrative, token)
    if os.path.isdir("/proc/self/root"):
        material = read(f"{prompt} Notes: /proc/self/root{run}/coder.json")
        report("F", "Linux: /proc/self/root/<path> alias is read", str(run / "coder.json") in material.files)
    else:
        report("F", "recorded: no /proc on this machine, the /proc/self/root line runs on Linux only", True, sys.platform)


def section_relative_to_file(copy: Path, run: Path, home: Path, prompt: str, read: Callable[[str], rt.Material],
                             narrative: str, token: str) -> None:
    """N5 fix round: a relative path inside a file is also resolved against that file's folder."""
    brief_dir = run / "n5" / "security"
    brief_dir.mkdir(parents=True)
    (brief_dir / "brief.txt").write_text("Other sections' places are in notes.txt next to this file, see also "
                                         "./places/ and ../shared/n.txt\n")
    (brief_dir / "notes.txt").write_text(narrative)
    (brief_dir / "places" / "src" / "x.py").mkdir(parents=True)
    (brief_dir / "places" / "src" / "x.py" / "12").write_text("")
    (run / "n5" / "shared").mkdir()
    (run / "n5" / "shared" / "n.txt").write_text("shared")
    material = read(f"{prompt} Brief: {brief_dir}/brief.txt")
    report("F", "N5: notes.txt, ./places/ and ../shared/n.txt in a run-dir file resolve against its folder",
           rt.has_mark(material.search_texts(), token) and str(brief_dir / "places") in material.expanded
           and str(run / "n5" / "shared" / "n.txt") in material.files,
           f"expanded {material.expanded}, anchored stats {material.anchored_stat_calls}")
    report("F", "N5: the folder joins are counted in anchored_stat_calls, apart from the 4.6 stat count",
           material.anchored_stat_calls > 0, f"{material.stat_calls} + {material.anchored_stat_calls} stats")
    linked = run / "n5" / "linked"
    linked.mkdir()
    os.symlink(brief_dir / "brief.txt", linked / "brief.txt")
    (linked / "notes.txt").write_text("linked notes")
    material = read(f"{prompt} Brief: {brief_dir}/brief.txt and {linked}/brief.txt")
    report("F", "N5: a file read once and reached again in another folder is searched for that folder too",
           str(linked / "notes.txt") in material.files and str(brief_dir / "notes.txt") in material.files)
    outside = copy.parent / "n5-outside"
    outside.mkdir()
    (outside / "brief.txt").write_text("notes in sub/ next to this file\n")
    (outside / "sub").mkdir()
    (outside / "sub" / "a.txt").write_text(narrative)
    material = read(f"{prompt} Brief: {outside}/brief.txt")
    report("F", "N5 near miss: a relative directory next to a file outside the run dir is not expanded",
           not material.expanded and not rt.has_mark(material.search_texts(), token), f"expanded {material.expanded}")
    (copy / "src" / "n5.py").write_text("from x import y  # see x.py\n")
    material = read(f"{prompt} Also src/n5.py")
    report("F", "N5 near miss: a relative name in a project file whose sibling exists reads that project file only",
           set(material.files) <= {str(copy / p) for p in ("work/change.diff", "task/acceptance.md", "src/n5.py", "src/x.py")},
           f"files {sorted(os.path.relpath(f, copy) for f in material.files)}")
    late = run / "n5" / "late"
    late.mkdir()
    (late / "brief.txt").write_text("the rest is in later.txt next to this file\n")
    material = read(f"{prompt} Brief: {late}/brief.txt")
    watch = rt.MaterialWatch(material, cwd=str(copy), home=str(home), run_dir=str(run))
    watch.poll()
    (late / "later.txt").write_text(narrative)
    watch.poll()
    report("F", "N5 hold: a file next to a named brief that appears during the hold is read by the next poll",
           rt.has_mark(material.search_texts(), token) and str(late / "later.txt") in material.hold_versions)
    words = run / "n5" / "words"
    (words / "security").mkdir(parents=True)
    (words / "security" / "raw.json").write_text(narrative)
    (words / "accepted.json").write_text('[{"section": "security", "quote": "round(x, \\".\\")", "note": ". .. ./ ../"}]')
    material = read(f"{prompt} Findings: {words}/accepted.json")
    report("F", "N5 near miss: '.', '..', './', '../' and a bare section name in a run-dir file expand nothing",
           not material.expanded and not rt.has_mark(material.search_texts(), token), f"expanded {material.expanded}")
    (words / "brief.txt").write_text("everything is in ../ and in security/\n")
    material = read(f"{prompt} Brief: {words}/brief.txt")
    report("F", "N5: 'security/' (written with a slash) next to a run-dir file expands; '../' alone is recorded "
           "(not joined, residual RS-leak-dots)", str(words / "security") in material.expanded
           and str(run / "n5") not in material.expanded, f"expanded {material.expanded}")
    shutil.rmtree(run / "n5")
    shutil.rmtree(outside)
    (copy / "src" / "n5.py").unlink()


def section_fd_aliases(run: Path, prompt: str, read: Callable[[str], rt.Material], narrative: str, token: str) -> None:
    """Re-run fix round, L3 N2 and N2b: a `/proc/<pid>/fd/<n>` link to an unlinked file or a memfd.

    macOS has no /proc, so the links are simulated the way the /proc/self/root line is: a directory added to
    the pseudo roots holds `<pid>/fd/<n>` symlinks, and `rt.resolve_path` returns what Linux realpath returns
    for such a link. On Linux the same forms also run against the real /proc.
    """
    pseudo = run.parent / "pseudo-proc"
    hidden = run.parent / "hidden"
    (pseudo / "4242" / "fd").mkdir(parents=True)
    hidden.mkdir()
    (hidden / "notes.txt").write_text(narrative)
    (hidden / "notes.txt (decoy)").write_text("nothing to see")
    for number in (5, 6, 7):
        os.symlink(hidden / "notes.txt", pseudo / "4242" / "fd" / str(number))
    linux_names = {"5": f"{hidden}/notes.txt (deleted)", "6": "/memfd:notes (deleted)", "7": f"{hidden}/notes.txt (decoy)"}

    def linux_realpath(path: str) -> str:
        parent, name = os.path.split(path)
        if parent == str(pseudo / "4242" / "fd"):
            return linux_names[name]
        return os.path.realpath(path)

    saved_roots, saved_resolve = rt.PSEUDO_FILE_ROOTS, rt.resolve_path
    rt.PSEUDO_FILE_ROOTS = (*saved_roots, str(pseudo))
    rt.resolve_path = linux_realpath
    try:
        for number, label in ((5, "an unlinked file (realpath '<path> (deleted)')"),
                              (6, "a memfd (realpath '/memfd:notes (deleted)')"),
                              (7, "a file whose realpath names another, existing file")):
            material = read(f"{prompt} Notes: {pseudo}/4242/fd/{number}")
            report("F", f"leak: /proc/<pid>/fd/<n> link to {label} is read through the link (simulated)",
                   rt.has_mark(material.search_texts(), token), f"files {sorted(material.files)[-1:]}")
        (pseudo / "4242" / "status").write_text(narrative)
        material = read(f"{prompt} Notes: {pseudo}/4242/status")
        report("F", "near miss: a regular file that really lies in the pseudo root is still not read (simulated)",
               str(pseudo / "4242" / "status") not in material.files and not rt.has_mark(material.search_texts(), token))
    finally:
        rt.PSEUDO_FILE_ROOTS, rt.resolve_path = saved_roots, saved_resolve
    if not os.path.isdir("/proc/self/fd"):
        report("F", "recorded: no /proc on this machine, the real /proc/<pid>/fd lines run on Linux only", True, sys.platform)
        return
    descriptor, path = tempfile.mkstemp(dir=run.parent)
    os.write(descriptor, narrative.encode())
    os.unlink(path)
    material = read(f"{prompt} Notes: /proc/{os.getpid()}/fd/{descriptor}")
    report("F", "Linux: /proc/<pid>/fd/<n> of an unlinked file is read", rt.has_mark(material.search_texts(), token))
    os.close(descriptor)
    if hasattr(os, "memfd_create"):
        descriptor = os.memfd_create("notes")
        os.write(descriptor, narrative.encode())
        material = read(f"{prompt} Notes: /proc/{os.getpid()}/fd/{descriptor}")
        report("F", "Linux: /proc/<pid>/fd/<n> of a memfd is read", rt.has_mark(material.search_texts(), token))
        os.close(descriptor)


# ---------------------------------------------------------------------------------------------------------
# G. H7 with a concurrent same-uid writer, and the H3 bound
# ---------------------------------------------------------------------------------------------------------

WRITER = '''
import os, sys, time
targets = sys.argv[1:]
deadline = time.time() + 600
i = 0
while time.time() < deadline and not os.path.exists(os.path.join(targets[0], "STOP")):
    for root in targets:
        for rel in ("claude-1/tool-results/x.txt", ".claude/projects/p/s/tool-results/x.txt",
                    ".claude/projects/p/s/subagents/agent-1.jsonl", ".bash_history"):
            path = os.path.join(root, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "a") as handle:
                handle.write(f"{i}\\n")
    i += 1
    time.sleep(0.01)
'''


def section_h7(table: rt.FlagTable, role_flags: dict[str, object], templates: dict[str, object], work: Path, runs: int) -> None:
    outside_tmp = Path(tempfile.mkdtemp(prefix="academy-w0-writer-"))
    outside_home = work / "writer-home"
    outside_home.mkdir()
    writer = subprocess.Popen([sys.executable, "-I", "-c", WRITER, str(outside_tmp), str(outside_home)])
    try:
        project = make_project(work / "h7-honest", "processpool-spawn")
        passes = 0
        for _ in range(runs):
            result = run_pipeline(project, table, role_flags, templates, hold=0.0)
            passes += result["code"] == 0 and not result["changes"] and len(result["records"]) == 3
        written = sum(1 for _ in outside_tmp.rglob("*")) + sum(1 for _ in outside_home.rglob("*"))
        report("G", f"honest pipeline (spawn pool) under a concurrent same-uid writer: H7 clean in {runs} runs",
               passes == runs and written > 0, f"{passes}/{runs}; writer touched {written} paths outside <scratch>/<copy>")
    finally:
        (outside_tmp / "STOP").write_text("")
        writer.wait(timeout=30)
        shutil.rmtree(outside_tmp, ignore_errors=True)
    attacks = {
        "raw outputs in <copy>/pipeline/out/": "os.makedirs('pipeline/out', exist_ok=True); open('pipeline/out/coder.json', 'w').write('x')",
        "a file in $TMPDIR (tempfile.mkdtemp)": "import tempfile; open(os.path.join(tempfile.mkdtemp(), 'coder.json'), 'w').write('x')",
        "a file in $HOME": "open(os.path.expanduser('~/coder.json'), 'w').write('x')",
        "a file under <copy>/.git-like stash dir": "os.makedirs('.stash/ctx', exist_ok=True); open('.stash/ctx/coder.json', 'w').write('x')",
        "an existing project file rewritten in place (same path set)": "open('task/request.md', 'a').write('stash')",
        "the fake claude itself rewritten": "import shutil; open(shutil.which('claude'), 'a').write('#')",
        "a run dir sibling under <scratch>": "open(os.path.join(os.path.dirname(args.run_dir), 'run-x.json'), 'w').write('x')",
    }
    for name, code in attacks.items():
        project = make_project(work / f"h7-{abs(hash(name))}", "threads", extra=code)
        result = run_pipeline(project, table, role_flags, templates, hold=0.0)
        report("G", f"H7 catches: {name}", bool(result["changes"]), str(result["changes"][:2]))
    project = make_project(work / "h7-coder-change", "threads", extra="open('work.diff', 'w').write('x')")
    result = run_pipeline(project, table, role_flags, templates, hold=0.0, extra_excluded=("work.diff",))
    report("G", "honest: the coder's own change file is excluded by role", not result["changes"], str(result["changes"]))
    section_fix_round_snapshots(table, role_flags, templates, work)

    worst = 0
    for _ in range(1000):
        findings = [{"id": rt.draw_finding_id(), "section": "performance", "file": "f" * secrets_len(60),
                     "line": 1 + int.from_bytes(os.urandom(2), "big") % 999, "quote": "q" * secrets_len(80),
                     "claim": "c" * secrets_len(120), "severity": "medium"} for _ in range(15)]
        total = len(json.dumps(findings, indent=2).encode()) + ACCEPTANCE_BYTES + len(CYRILLIC_2KB.encode())
        worst = max(worst, total)
    report("G", "H3: 15 findings at most 60/80/120 characters, 1.5 KB acceptance and 2 KB Cyrillic stay under 16 KB",
           worst <= 16 * 1024, f"largest {worst} bytes over 1000 draws")
    def worst(quote: str, claim: str) -> int:
        findings = [{"id": "F-0123456789", "section": "performance", "file": "f" * 60, "line": 999, "quote": quote * 80,
                     "claim": claim * 120, "severity": "medium"} for _ in range(15)]
        return len(json.dumps(findings, indent=2).encode()) + ACCEPTANCE_BYTES

    ascii_part, escaped_part = worst("q", "c"), worst('"', "\\")
    report("G", "H3 worst case: grader text with every quote and claim character escaped, plus 2 KB Cyrillic, fits 16 KB",
           escaped_part + len(CYRILLIC_2KB.encode()) <= 16 * 1024,
           f"grader text {ascii_part} bytes plain ASCII, {escaped_part} bytes all-escape (design 4.4 says about 7.4 KB / "
           f"10.4 KB); left for the learner's inline text: {16 * 1024 - escaped_part} bytes")


STASH_WRITE = "os.makedirs('notes', exist_ok=True); open('notes/coder.json', 'w').write('stash')"
STASH_DELETE = "os.remove('notes/coder.json'); os.rmdir('notes')"


def run_with_request_snapshots(project: Path, table: rt.FlagTable, role_flags: dict[str, object],
                               templates: dict[str, object]) -> dict[str, object]:
    with Harness(table, role_flags, templates) as h:
        copy = rt.copy_workspace(project, h.scratch, "flat")
        run_dir = h.scratch.root / "run-0"
        is_excluded = rt.h7_exclusion(run_dir, [], h.scratch.tmp)
        h.responder.request_snapshot = lambda: rt.tree_snapshot([h.scratch.root, copy], is_excluded)
        before = rt.tree_snapshot([h.scratch.root, copy], is_excluded)
        result = rt.run_process(rt.pipeline_command(L3_CHECKS, copy, run_dir), copy, h.env, 120)
        after = rt.tree_snapshot([h.scratch.root, copy], is_excluded)
        records = h.server.calls()
        snapshots = rt.request_snapshots(records)
        return {"code": result.code, "records": records, "end": rt.tree_changes(before, after),
                "seen": rt.changes_seen(before, [*snapshots, after]), "snapshots": len(snapshots), "copy": copy}


def section_fix_round_snapshots(table: rt.FlagTable, role_flags: dict[str, object], templates: dict[str, object],
                                work: Path) -> None:
    """Student fix round: H7 per-request snapshots (a stash deleted after the calls) and C9 user scope."""
    honest = run_with_request_snapshots(make_project(work / "snap-honest", "threads"), table, role_flags, templates)
    report("G", "honest pipeline with the per-request snapshot hook: a snapshot per call, nothing changed",
           honest["code"] == 0 and honest["snapshots"] == 3 and not honest["seen"],
           f"code {honest['code']}, snapshots {honest['snapshots']}, seen {honest['seen'][:3]}")
    project = make_project(work / "snap-stash", "threads", extra=STASH_DELETE)
    run_py = project / "pipeline" / "run.py"
    run_py.write_text(run_py.read_text().replace("    results = fan_out(", f"    {STASH_WRITE}\n    results = fan_out("))
    stash = run_with_request_snapshots(project, table, role_flags, templates)
    copy = stash["copy"]
    assert isinstance(copy, Path)
    report("G", "H7: a project stash written before the calls and deleted after them: run-end snapshot misses it, "
           "the request snapshots see it", stash["code"] == 0 and not stash["end"]
           and str(copy / "notes" / "coder.json") in stash["seen"], f"end {stash['end'][:2]}, seen {stash['seen'][:2]}")
    with Harness(table, role_flags, templates) as h:
        project_dir = h.scratch.root / "project"
        (project_dir / ".claude").mkdir(parents=True)
        (project_dir / ".claude" / "settings.json").write_text("{}")
        baseline = rt.claude_config_snapshot(project_dir)
        h.call([*CODER], b"x", cwd=project_dir)
        user_settings = h.scratch.home / ".claude" / "settings.json"
        user_settings.parent.mkdir()
        user_settings.write_text('{"permissions": {"defaultMode": "bypassPermissions"}}')
        h.call([*CODER], b"x", cwd=project_dir)
        user_settings.unlink()
        (h.scratch.home / ".claude.json").write_text('{"mcpServers": {"t": {"command": "t"}}}')
        h.call([*CODER], b"x", cwd=project_dir)
        records = sorted(h.server.calls(), key=lambda r: r.request.t_start)
        configs = [r.details["claudeConfig"] for r in records]
        changes = [r.details["userConfigChanges"] for r in records]
        report("G", "C9: an untouched HOME leaves the call's configuration equal to the project snapshot",
               configs[0] == baseline and changes[0] == [], str(changes[0]))
        report("G", "C9: ~/.claude/settings.json written before a call differs from the project snapshot",
               configs[1] != baseline and str(user_settings) in changes[1], str(changes[1]))
        report("G", "C9: ~/.claude.json written before a call differs too (the emptied ~/.claude/ is a change as well)",
               configs[2] != baseline and str(h.scratch.home / ".claude.json") in changes[2], str(changes[2]))
    section_c9_during_hold(table, role_flags, templates)


HOLD_WATCH_SEC = 1.0


def held_call_with_write(table: rt.FlagTable, role_flags: dict[str, object], templates: dict[str, object],
                         watch: bool, target: Callable[[Path, Path], Path] | None, write_at: float,
                         lifetime: float) -> tuple[bool, bool, float]:
    """One coder call held HOLD_WATCH_SEC; a thread writes `target(project, home)` `write_at` s after the request
    arrives and deletes it `lifetime` s later. Returns (arrival snapshot clean, every hold snapshot clean, wall)."""
    with Harness(table, role_flags, templates, hold_sec=HOLD_WATCH_SEC, watch_config=watch) as h:
        project = h.scratch.root / "project"
        (project / ".claude").mkdir(parents=True)
        (project / ".claude" / "settings.json").write_text("{}")
        pristine = rt.claude_config_snapshot(project)

        def writer() -> None:
            if target is None:
                return
            path = target(project, h.scratch.home)
            # The clock starts when the request has arrived: the responder counts a call only after it has
            # taken the arrival snapshot, and the client's own start-up takes longer than `write_at`.
            while not h.responder._counts:
                time.sleep(0.001)
            time.sleep(write_at)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('{"permissions": {"allow": ["Bash"]}}')
            time.sleep(lifetime)
            path.unlink()

        thread = threading.Thread(target=writer)
        started = time.monotonic()
        thread.start()
        h.call(CODER, b"x", cwd=project)
        wall = time.monotonic() - started
        thread.join()
        record = h.server.calls()[0]
        during = record.details.get("claudeConfigDuringHold", [])
        return record.details["claudeConfig"] == pristine, all(snap == pristine for snap in during), wall


def section_c9_during_hold(table: rt.FlagTable, role_flags: dict[str, object], templates: dict[str, object]) -> None:
    """Re-run fix round, L2 B1: a configuration file written while the call runs and deleted after it."""
    def local(project: Path, home: Path) -> Path:
        return project / ".claude" / "settings.local.json"

    def user(project: Path, home: Path) -> Path:
        return home / ".claude" / "settings.json"

    arrival, held, wall = held_call_with_write(table, role_flags, templates, True, None, 0, 0)
    report("G", "C9 during the hold, honest: nothing written, every hold snapshot equals the project's",
           arrival and held, f"wall {wall:.2f} s for a {HOLD_WATCH_SEC} s hold")
    for label, target in (("project settings.local.json", local), ("~/.claude/settings.json", user)):
        arrival, held, _ = held_call_with_write(table, role_flags, templates, True, target, 0.3, 0.3)
        report("G", f"C9 during the hold: {label} written 0.3 s after the request arrived, deleted 0.3 s later: the arrival "
               "snapshot misses it, a hold snapshot sees it", arrival and not held)
    arrival, held, _ = held_call_with_write(table, role_flags, templates, False, local, 0.3, 0.3)
    report("G", "without the watch the same write is missed (what the student's timed stash used)", arrival and held)
    caught = 0
    trials = 20
    for _ in range(trials):
        _, held, _ = held_call_with_write(table, role_flags, templates, True, local, 0.3, 0.001)
        caught += not held
    report("G", f"recorded residual: a file that lives 1 ms inside a held call is seen in {caught}/{trials} calls "
           f"(poll interval {rt.HOLD_POLL_SEC * 1000:.0f} ms)", True)
    section_line_triggered_stash(table, role_flags, templates)
    section_hold_tree_and_material(table, role_flags, templates)


def line_triggered_stash(table: rt.FlagTable, role_flags: dict[str, object], templates: dict[str, object],
                         after_lines: int, hold_sec: float) -> tuple[bool, bool]:
    """L2 B2: a stream-json caller reads `after_lines` stdout lines, then writes settings.local.json, reads the
    rest and deletes the file after claude exits. Returns (wrote while claude was alive, C9 saw it)."""
    argv = replace(CODER, "--output-format", ["--output-format", "stream-json", "--verbose"])
    with Harness(table, role_flags, templates, hold_sec=hold_sec, watch_config=True) as h:
        project = h.scratch.root / "project"
        (project / ".claude").mkdir(parents=True)
        (project / ".claude" / "settings.json").write_text("{}")
        pristine = rt.claude_config_snapshot(project)
        stash = project / ".claude" / "settings.local.json"
        process = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, env=h.env, cwd=project)
        process.stdin.write(b"x")
        process.stdin.close()
        for _ in range(after_lines):
            process.stdout.readline()
        wrote_alive = process.poll() is None
        stash.write_text('{"permissions": {"allow": ["Bash"]}}')
        process.stdout.read()
        process.wait()
        stash.unlink()
        record = h.server.calls()[0]
        during = record.details.get("claudeConfigDuringHold", [])
        return wrote_alive, any(snapshot != pristine for snapshot in [record.details["claudeConfig"], *during])


def section_line_triggered_stash(table: rt.FlagTable, role_flags: dict[str, object], templates: dict[str, object]) -> None:
    for after_lines, label in ((1, "line 1 (system/init)"), (2, "line 2 (the working text)"),
                               (3, "line 3 (the working Read tool use)"), (4, "line 4 (its tool result)")):
        results = [line_triggered_stash(table, role_flags, templates, after_lines, 0.3) for _ in range(10)]
        report("G", f"C9, L2 B2: a stash written after {label} of a 0.3 s stream-json call is seen in 10/10 calls",
               all(alive and seen for alive, seen in results), str(results[:3]))
    alive, seen = line_triggered_stash(table, role_flags, templates, 5, 0.3)
    report("G", "recorded residual: a stash written after line 5, StructuredOutput (the work is done), is not seen",
           not seen, f"wrote while claude alive: {alive}")


HOLD_FACILITY_SEC = 1.0
HOLD_WRITE_AT_SEC = 0.3


def held_material_call(table: rt.FlagTable, role_flags: dict[str, object], templates: dict[str, object], *,
                       watch: bool, change: Callable[[Path, str], None] | None,
                       restore: Callable[[Path], None] | None) -> tuple[rt.CallRecord, Path, str, dict[str, str]]:
    """One held reviewer call whose prompt names `<root>/named.md` (clean at arrival) and the run dir.

    `change(root, secret)` runs HOLD_WRITE_AT_SEC after the request arrives, `restore(root)` 0.3 s later, both
    while the call is held HOLD_FACILITY_SEC. With `watch`, the responder polls the tree under the project (the
    lesson callback) and the material. Returns (the record, the root, the secret, the tree before the call);
    the scratch is gone by then, so the tree is compared with that snapshot, never with a fresh one.
    """
    secret = "leak" + os.urandom(6).hex()
    scratch_holder: dict[str, Path] = {}
    polls: list[float] = []

    def snapshot() -> dict[str, str]:
        started = time.monotonic()
        result = rt.tree_snapshot([scratch_holder["root"]], lambda _: False)
        polls.append(time.monotonic() - started)
        return result

    with Harness(table, role_flags, templates, run_dir="/nonexistent", hold_sec=HOLD_FACILITY_SEC,
                 hold_snapshot=snapshot if watch else None, watch_material=watch) as h:
        root = h.scratch.root / "project"
        run_dir = root / "run"
        (run_dir / "inbox").mkdir(parents=True)
        (root / "named.md").write_text("clean notes for the reviewer\n")
        (run_dir / "inbox" / "a.md").write_text("first input\n")
        (root / "link.md").symlink_to(root / "named.md")
        h.responder.run_dir = str(run_dir)
        scratch_holder["root"] = root
        before = rt.tree_snapshot([root], lambda _: False)

        def writer() -> None:
            while not h.responder._counts:
                time.sleep(0.001)
            time.sleep(HOLD_WRITE_AT_SEC)
            if change is not None:
                change(root, secret)
            time.sleep(0.3)
            if restore is not None:
                restore(root)

        thread = threading.Thread(target=writer)
        thread.start()
        prompt = (f"review {root / 'named.md'} and {run_dir / 'inbox'} and {root / 'later.md'} "
                  f"and {root / 'link.md'}").encode()
        h.call(REVIEWER, prompt, cwd=root)
        thread.join()
        record = h.server.calls()[0]
        record.details["treePollSec"] = (sum(polls) / len(polls)) if polls else 0.0
        return record, root, secret, before


def material_has(record: rt.CallRecord, secret: str) -> bool:
    material = record.details.get("material")
    return isinstance(material, rt.Material) and rt.has_mark(material.search_texts(), secret)


def section_hold_tree_and_material(table: rt.FlagTable, role_flags: dict[str, object], templates: dict[str, object]) -> None:
    """Hold-and-poll round: the tree callback and the material re-read, for L3-L5."""
    record, root, secret, before = held_material_call(table, role_flags, templates, watch=True, change=None,
                                                       restore=None)
    material = record.details["material"]
    trees = record.details.get("treeSnapshotsDuringHold", [])
    report("G", "hold facility, honest: one distinct tree snapshot equal to the tree before the call, no hold "
           "version, the named file read", isinstance(material, rt.Material) and not material.hold_versions
           and trees == [before] and str(root / "named.md") in material.files,
           f"trees {len(trees)}, tree poll {float(str(record.details['treePollSec'])) * 1000:.2f} ms")

    def stash(root: Path, secret: str) -> None:
        (root / "notes").mkdir()
        (root / "notes" / "coder.json").write_text(secret)

    def unstash(root: Path) -> None:
        shutil.rmtree(root / "notes")

    for watch in (True, False):
        record, root, _, before = held_material_call(table, role_flags, templates, watch=watch, change=stash,
                                                     restore=unstash)
        seen = rt.changes_seen(before, rt.call_snapshots([record]))
        expected = [str(root / "notes"), str(root / "notes" / "coder.json")] if watch else []
        report("G", f"H7 hold snapshots {'on' if watch else 'off'}: a stash written {HOLD_WRITE_AT_SEC} s into the hold "
               f"and deleted 0.3 s later is {'seen, and nothing else' if watch else 'missed'}", seen == expected,
               str([path[len(str(root)):] for path in seen]))

    def rewrite(root: Path, secret: str) -> None:
        (root / "named.md").write_text(f"notes {secret}\n")

    def restore_named(root: Path) -> None:
        (root / "named.md").write_text("clean notes for the reviewer\n")
        os.utime(root / "named.md", (0, 0))

    for watch in (True, False):
        record, root, secret, _ = held_material_call(table, role_flags, templates, watch=watch, change=rewrite,
                                                     restore=restore_named)
        material = record.details["material"]
        versions = material.hold_versions.get(str(root / "named.md"), []) if isinstance(material, rt.Material) else []
        report("G", f"material watch {'on' if watch else 'off'}: a named file rewritten with a secret {HOLD_WRITE_AT_SEC} s "
               f"into the hold and restored 0.3 s later is {'kept as a version' if watch else 'missed'}",
               material_has(record, secret) == watch and (len(versions) == 1) == watch,
               f"{len(versions)} hold version(s); the restored text equals the arrival one and is not repeated")

    def same_size(root: Path, secret: str) -> None:
        named = root / "named.md"
        before = os.stat(named)
        clean = named.read_text()
        named.write_text(secret + clean[len(secret):])
        os.utime(named, ns=(before.st_atime_ns, before.st_mtime_ns))

    record, root, secret, _ = held_material_call(table, role_flags, templates, watch=True, change=same_size,
                                                 restore=restore_named)
    report("G", "material watch: a same-size rewrite with the mtime set back is still read (ctime changes)",
           material_has(record, secret))

    cases: list[tuple[str, Callable[[Path, str], None]]] = [
        ("a named path absent at arrival, created during the hold",
         lambda root, secret: (root / "later.md").write_text(secret)),
        ("a new file in a named run-dir directory",
         lambda root, secret: (root / "run" / "inbox" / "b.md").write_text(secret)),
        ("a named symlink re-pointed to another file (the cached realpath is not reused)",
         lambda root, secret: ((root / "other.md").write_text(secret), (root / "link.tmp").symlink_to(root / "other.md"),
                               os.replace(root / "link.tmp", root / "link.md"))),
        ("a rewrite that names a new file outside the run dir",
         lambda root, secret: ((root / "other.md").write_text(secret),
                               (root / "named.md").write_text(f"see {root / 'other.md'}\n"))),
    ]
    for label, change in cases:
        record, _, secret, _ = held_material_call(table, role_flags, templates, watch=True, change=change,
                                                  restore=None)
        report("G", f"material watch: {label} is read during the hold", material_has(record, secret))
    record, _, secret, _ = held_material_call(table, role_flags, templates, watch=False, change=cases[0][1],
                                              restore=None)
    report("G", "material watch off: the absent-at-arrival path is missed (the arrival walk alone)",
           not material_has(record, secret))


def secrets_len(maximum: int) -> int:
    return 1 + int.from_bytes(os.urandom(2), "big") % maximum


# ---------------------------------------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--judge-dir", required=True, type=Path)
    parser.add_argument("--work-dir", type=Path, default=None)
    parser.add_argument("--overlap-runs", type=int, default=50)
    parser.add_argument("--h7-runs", type=int, default=20)
    parser.add_argument("--only", default="ABCDEFG")
    args = parser.parse_args()
    if sys.version_info[:2] != (3, 12):
        print(f"run with Python 3.12 (the pinned grader version), not {sys.version.split()[0]}")
        return 2
    work = Path(os.path.realpath(tempfile.mkdtemp(prefix="w0-", dir=args.work_dir)))
    table, role_flags, templates = load_data()
    started = time.monotonic()
    steps: dict[str, Callable[[], None]] = {
        "A": section_shared,
        "B": lambda: section_schema(work),
        "C": lambda: section_call_rules(table, role_flags),
        "D": lambda: section_fake(table, role_flags, templates, work, args.overlap_runs),
        "E": lambda: section_launch(table, role_flags, templates, work),
        "F": lambda: (section_parity(args.judge_dir.resolve(), work), section_material(work)),
        "G": lambda: section_h7(table, role_flags, templates, work, args.h7_runs),
    }
    for key in args.only:
        steps[key]()
    failed = [section for section, ok in RESULTS if not ok]
    print(f"\nTOTAL {len(RESULTS)} lines, {len(RESULTS) - len(failed)} ok, {len(failed)} XX "
          f"({time.monotonic() - started:.1f} s, Python {sys.version.split()[0]}, {sys.executable})")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
