"""A visible stand-in for `claude` for trying `call_role` offline (`make try-fake`).

It answers every headless call with fixed values, in the output format the call asks for, for the scenario
named by the FAKE_SCENARIO variable: ok (default), no-structured, retries, budget, max-turns, failed, auth. FAKE_ROLE, a
comma-separated list of role names (for example `security` or `security,tests`), limits FAKE_SCENARIO to those
roles; every other role answers `ok`. The role of a call is the one whose `pipeline/contracts/<role>.schema.json`
in the working directory equals the call's `--json-schema`. The answer for `ok` is an object built from the
call's `--json-schema` (its `const`, else the first enum value, a fixed string, number 1).

A call of a section reviewer (`security`, `performance`, `tests`) answers after FAKE_SECTION_HOLD_SEC seconds
(default 2), so `make try-fake` shows by its wall time whether the three sections ran at the same time.

With `--output-format stream-json` it prints the seven lines the course check prints: `system/init` and the
model's working turn (an assistant text, a `Read` tool use, its tool result) at once, as the real CLI does while
it works; the `StructuredOutput` tool use, its tool result and the `result` message when the answer is ready (for
a section, after the hold). `json` and `text` print everything at the end, as the real CLI does.

Like the real CLI it refuses an unknown option, stream-json without --verbose, a call with no prompt, and an
inline schema that is not a JSON object or names a draft other than draft-07. It checks nothing else: it
does not grade the call line, and a call it answers is not a call the course accepts.

A coder call (its schema has `diff_path`) answering `ok` also "writes" its change: the fake puts a fixed diff
into `work/change.diff` under the call's working directory and returns that path.

Findings (lesson 5). A section answering `ok` returns one finding on a real line of a project file and one
planted finding that breaks a G rule: security cites a line past the end of its file, performance quotes a
neighbouring line, tests writes its path with `./`. The synthesizer returns one synthesized finding per good
section finding, plus two bad ones: one built from the planted security finding, one naming a source id no
reviewer returned. So without gates the bad findings reach the summarizer and the report, and with gates
`gate.jsonl` lists five rejections. The summarizer returns the ids of the synthesized findings that appear in its
prompt or in a file the prompt names. The planted findings are the same on every run, unlike the course check,
which draws new ones each time.
"""

from __future__ import annotations

import json
import os
import select
import sys
import time
from dataclasses import dataclass

DRAFT07_URIS = ("http://json-schema.org/draft-07/schema", "http://json-schema.org/draft-07/schema#")
SCENARIOS = ("ok", "no-structured", "retries", "budget", "max-turns", "failed", "auth")
SECTIONS = ("security", "performance", "tests")
ROLES = ("coder", *SECTIONS, "synthesizer", "summarizer")
DEFAULT_SECTION_HOLD_SEC = 2.0
SESSION_ID = "00000000-0000-4000-8000-000000000000"
MODEL_IDS = {"sonnet": "claude-sonnet-5-5", "opus": "claude-opus-5-5", "haiku": "claude-haiku-5-5",
             "fable": "claude-fable-5-2"}
ERROR_SUBTYPES = {
    "retries": ("error_max_structured_output_retries",
                "Structured output validation failed after 5 attempts: data must have required property"),
    "budget": ("error_max_budget_usd", "Reached maximum budget"),
    "max-turns": ("error_max_turns", "Reached maximum number of turns"),
    "failed": ("error_during_execution", "The run stopped with an error during execution"),
}
AUTH_RESULT = ('Failed to authenticate: API Error: 401 {"type":"error","error":{"type":"authentication_error",'
               '"message":"invalid x-api-key"}}')
NARRATIVE = "I read the files, checked the edge cases and the tests pass. The answer follows."
# A caller that passes the prompt as an argument and leaves stdin as an open pipe that never sends anything
# (CI, an agent's shell, `make try-fake | tee`) would otherwise block this fake forever.
STDIN_WAIT_SEC = 2.0
CODER_DIFF_PATH = "work/change.diff"
CODER_SUMMARY = "Late fee is now rounded down to whole cents; I also ran the suite twice to be sure."
CODER_DIFF = """diff --git a/src/invoices/late_fee.py b/src/invoices/late_fee.py
--- a/src/invoices/late_fee.py
+++ b/src/invoices/late_fee.py
@@ -1,3 +1,4 @@
+# dev fake change: round the fee down to whole cents
 from __future__ import annotations
"""

# Every flag of the CLI reference ("CLI flags" table) and how many values it takes.
DOCUMENTED_FLAGS = {
    "--add-dir": "variadic", "--advisor": "one", "--agent": "one", "--agents": "one",
    "--allow-dangerously-skip-permissions": "none", "--allowedTools": "variadic",
    "--allowed-tools": "variadic", "--append-subagent-system-prompt": "one",
    "--append-subagent-system-prompt-file": "one", "--append-system-prompt": "one",
    "--append-system-prompt-file": "one", "--autocompact": "one", "--ax-screen-reader": "none",
    "--bare": "none", "--betas": "variadic", "--bg": "none", "--background": "none", "--channels": "variadic",
    "--chrome": "none", "--cloud": "optional", "--continue": "none", "-c": "none",
    "--dangerously-load-development-channels": "variadic", "--dangerously-skip-permissions": "none",
    "--debug": "none", "--debug-file": "one", "--desktop": "none", "--disable-slash-commands": "none",
    "--disallowedTools": "variadic", "--disallowed-tools": "variadic", "--effort": "one",
    "--enable-auto-mode": "none", "--environment": "one", "--exclude-dynamic-system-prompt-sections": "none",
    "--exec": "one", "--fallback-model": "one", "--fork-session": "none", "--forward-subagent-text": "none",
    "--from-pr": "one", "--ide": "none", "--init": "none", "--init-only": "none",
    "--include-hook-events": "none", "--include-partial-messages": "none", "--input-format": "one",
    "--json-schema": "one", "--maintenance": "none", "--max-budget-usd": "one", "--max-turns": "one",
    "--mcp-config": "variadic", "--model": "one", "--name": "one", "-n": "one", "--no-chrome": "none",
    "--no-session-persistence": "none", "--output-format": "one", "--permission-mode": "one",
    "--permission-prompt-tool": "one", "--permission-prompts": "one", "--plugin-dir": "one",
    "--plugin-url": "variadic", "--print": "none", "-p": "none", "--prompt-suggestions": "none",
    "--ref": "one", "--remote": "optional", "--remote-control": "optional", "--rc": "optional",
    "--remote-control-session-name-prefix": "one", "--replay-user-messages": "none", "--restricted": "none",
    "--resume": "optional", "-r": "optional", "--safe-mode": "none", "--session-id": "one",
    "--setting-sources": "one", "--settings": "one", "--strict-mcp-config": "none", "--system-prompt": "one",
    "--system-prompt-file": "one", "--system-prompt-snapshot": "one", "--teleport": "none",
    "--teammate-mode": "one", "--tmux": "none", "--tools": "variadic", "--verbose": "none",
    "--version": "none", "-v": "none", "--worktree": "optional", "-w": "optional",
}


class CliError(Exception):
    """A refusal the real CLI prints before running anything."""


def parse(arguments: list[str]) -> tuple[dict[str, list[str]], list[str]]:
    """Flags with their values, and the positional arguments."""
    flags: dict[str, list[str]] = {}
    positionals: list[str] = []
    index = 0
    while index < len(arguments):
        argument = arguments[index]
        index += 1
        if argument == "--":
            positionals.extend(arguments[index:])
            break
        if not argument.startswith("-"):
            positionals.append(argument)
            continue
        name, equals, attached = argument.partition("=")
        arity = DOCUMENTED_FLAGS.get(name if equals else argument)
        if arity is None:
            raise CliError(f"error: unknown option '{argument}'")
        values = flags.setdefault(name if equals else argument, [])
        if equals:
            values.append(attached)
        elif arity == "one" and index < len(arguments):
            values.append(arguments[index])
            index += 1
        elif arity == "optional" and index < len(arguments) and not arguments[index].startswith("-"):
            values.append(arguments[index])
            index += 1
        elif arity == "variadic":
            while index < len(arguments) and not arguments[index].startswith("-"):
                values.append(arguments[index])
                index += 1
    return flags, positionals


def value(flags: dict[str, list[str]], *spellings: str) -> str | None:
    found = [v for spelling in spellings for v in flags.get(spelling, [])]
    return found[-1] if found else None


def instance_of(schema: object) -> object:
    """A fixed value the schema describes; enough for trying the happy path."""
    if not isinstance(schema, dict):
        return {}
    if "const" in schema:
        return schema["const"]
    if isinstance(schema.get("enum"), list) and schema["enum"]:
        return schema["enum"][0]
    kind = schema.get("type")
    kind = kind[0] if isinstance(kind, list) and kind else kind
    if kind == "array":
        return [instance_of(schema.get("items", {}))]
    if kind in ("integer", "number"):
        return 1
    if kind == "boolean":
        return True
    if kind == "string":
        return "fixed text from the dev fake"
    if kind == "null":
        return None
    properties = schema.get("properties", {})
    return {name: instance_of(sub) for name, sub in properties.items()} if isinstance(properties, dict) else {}


def result_message(scenario: str, structured: object, model: str) -> dict[str, object]:
    message: dict[str, object] = {
        "type": "result", "uuid": SESSION_ID, "session_id": SESSION_ID, "duration_ms": 1200,
        "duration_api_ms": 1100, "num_turns": 2, "total_cost_usd": 0.0123, "permission_denials": [],
        "usage": {"input_tokens": 0, "output_tokens": 0}, "modelUsage": {model: {"costUSD": 0.0123}},
    }
    if scenario in ERROR_SUBTYPES:
        subtype, error = ERROR_SUBTYPES[scenario]
        message.update({"subtype": subtype, "is_error": True, "stop_reason": None, "errors": [error]})
    elif scenario == "auth":
        message.update({"subtype": "success", "is_error": True, "stop_reason": None, "result": AUTH_RESULT,
                        "terminal_reason": "api_error"})
    elif scenario == "no-structured":
        decoy = json.dumps({"findings": [], "note": "looks like JSON, is not the structured output"}, indent=2)
        message.update({"subtype": "success", "is_error": False, "stop_reason": "end_turn",
                        "result": f"{NARRATIVE}\n```json\n{decoy}\n```"})
    else:
        message.update({"subtype": "success", "is_error": False, "stop_reason": "end_turn", "result": NARRATIVE,
                        "structured_output": structured})
    return message


def stream_lines(message: dict[str, object], scenario: str, structured: object, model: str,
                 flags: dict[str, list[str]]) -> list[dict[str, object]]:
    mode = value(flags, "--permission-mode") or "default"
    tools = [t for v in flags.get("--tools", []) for t in v.replace(",", " ").split()] or ["Read", "Edit", "Bash"]
    lines: list[dict[str, object]] = [{"type": "system", "subtype": "init", "session_id": SESSION_ID,
                                       "tools": [*tools, "StructuredOutput"], "mcp_servers": [], "model": model,
                                       "permissionMode": mode}]
    if scenario != "auth":
        # The real CLI streams the model's turns while it works; the last three lines come when it is done.
        lines.append({"type": "assistant", "session_id": SESSION_ID, "parent_tool_use_id": None,
                      "message": {"role": "assistant", "content": [
                          {"type": "text", "text": "Reading the change first."}]}})
        lines.append({"type": "assistant", "session_id": SESSION_ID, "parent_tool_use_id": None,
                      "message": {"role": "assistant", "content": [
                          {"type": "tool_use", "id": "toolu_read", "name": "Read",
                           "input": {"file_path": os.path.join(os.getcwd(), "WORKING_NOTES.md")}}]}})
        lines.append({"type": "user", "session_id": SESSION_ID, "parent_tool_use_id": None,
                      "message": {"role": "user", "content": [
                          {"type": "tool_result", "tool_use_id": "toolu_read", "is_error": True,
                           "content": "<tool_use_error>File does not exist.</tool_use_error>"}]}})
    if scenario in ("ok", "retries"):
        result_block: dict[str, object] = {"type": "tool_result", "tool_use_id": "toolu_dev",
                                           "content": "Structured output provided successfully"}
        if scenario == "retries":
            result_block = {"type": "tool_result", "tool_use_id": "toolu_dev", "is_error": True,
                            "content": "Output does not match the required schema"}
        lines.append({"type": "assistant", "session_id": SESSION_ID, "parent_tool_use_id": None,
                      "message": {"role": "assistant", "content": [
                          {"type": "tool_use", "id": "toolu_dev", "name": "StructuredOutput",
                           "input": structured if scenario == "ok" else {}}]}})
        lines.append({"type": "user", "session_id": SESSION_ID, "parent_tool_use_id": None,
                      "message": {"role": "user", "content": [result_block]}})
    lines.append(message)
    return lines


SECTION_FILES = {"security": "src/invoices/api.py", "performance": "src/invoices/repository.py",
                 "tests": "src/invoices/late_fee.py"}
SECTION_ID_PREFIX = {"security": "F-5ec00000", "performance": "F-9e100000", "tests": "F-7e500000"}
SYNTHESIZED_ID_PREFIX = "F-0a000000"
UNKNOWN_SOURCE_ID = "F-0000000bad"
MIN_QUOTE_CHARS = 12
PROMPT_FILE_LIMIT_BYTES = 1 << 20


def citable_lines(relative: str) -> tuple[int, list[tuple[int, str]]] | None:
    """The file's line count and (number, quote) of the lines a finding can cite: 12 or more characters once
    stripped."""
    try:
        with open(os.path.join(os.getcwd(), relative), encoding="utf-8") as handle:
            text = handle.read()
    except (OSError, UnicodeDecodeError):
        return None
    pieces = text.split("\n")
    if pieces[-1] == "":
        pieces.pop()
    found = [(number, line.strip()) for number, line in enumerate(pieces, 1) if len(line.strip()) >= MIN_QUOTE_CHARS]
    return (len(pieces), found) if len(found) >= 2 else None


def section_findings(section: str) -> list[dict[str, object]] | None:
    """One finding on a real line and one planted finding that breaks a G rule."""
    relative = SECTION_FILES[section]
    citable = citable_lines(relative)
    if citable is None:
        return None
    count, lines = citable
    (number, quote), (_, next_quote) = lines[0], lines[1]
    good = {"id": SECTION_ID_PREFIX[section] + "01", "file": relative, "line": number, "quote": quote,
            "claim": f"dev fake: {section} finding on a real line", "severity": "medium", "section": section}
    bad = dict(good, id=SECTION_ID_PREFIX[section] + "02", claim=f"dev fake: planted bad {section} finding")
    if section == "security":
        bad["line"] = count + 5
    elif section == "performance":
        bad["quote"] = next_quote
    else:
        bad["file"] = "./" + relative
    return [good, bad]


def synthesized_findings() -> list[dict[str, object]] | None:
    found: list[dict[str, object]] = []
    sections = {section: section_findings(section) for section in SECTION_FILES}
    for index, section in enumerate(SECTION_FILES, 1):
        pair = sections[section]
        if pair is None:
            return None
        good = pair[0]
        found.append({**{k: good[k] for k in ("file", "line", "quote", "severity")},
                      "id": f"{SYNTHESIZED_ID_PREFIX}0{index}", "claim": f"dev fake: merged {section} finding",
                      "source_ids": [good["id"]]})
    planted = sections["security"][1]  # type: ignore[index]
    found.append({**{k: planted[k] for k in ("file", "line", "quote", "severity")},
                  "id": f"{SYNTHESIZED_ID_PREFIX}b1", "claim": "dev fake: built from a rejected finding",
                  "source_ids": [planted["id"]]})
    found.append({**{k: found[0][k] for k in ("file", "line", "quote", "severity")},
                  "id": f"{SYNTHESIZED_ID_PREFIX}b2", "claim": "dev fake: names a source nobody returned",
                  "source_ids": [UNKNOWN_SOURCE_ID]})
    return found


def prompt_material(stdin_text: str) -> str:
    """The prompt plus the text of every existing file a word of it names."""
    texts = [stdin_text]
    for word in set(stdin_text.split()):
        path = os.path.join(os.getcwd(), word.strip("\"'`,;()[]{}"))
        try:
            if os.path.isfile(path):
                with open(path, encoding="utf-8", errors="replace") as handle:
                    texts.append(handle.read(PROMPT_FILE_LIMIT_BYTES))
        except (OSError, ValueError):
            continue
    return "\n".join(texts)


def planted_output(role: str | None, stdin_text: str) -> dict[str, object] | None:
    if role in SECTION_FILES:
        findings = section_findings(str(role))
        return None if findings is None else {"findings": findings}
    synthesized = synthesized_findings()
    if synthesized is None:
        return None
    if role == "synthesizer":
        return {"findings": synthesized}
    if role == "summarizer":
        material = prompt_material(stdin_text)
        ids = [str(f["id"]) for f in synthesized if str(f["id"]) in material]
        return {"summary": f"dev fake summary of {len(ids)} finding(s)", "finding_ids": ids}
    return None


def role_of(schema: object) -> str | None:
    """The role whose contract schema in the working directory equals the call's schema, if any."""
    contracts = os.path.join(os.getcwd(), "pipeline", "contracts")
    try:
        names = sorted(os.listdir(contracts))
    except OSError:
        return None
    for name in names:
        if not name.endswith(".schema.json"):
            continue
        try:
            with open(os.path.join(contracts, name), encoding="utf-8") as handle:
                if json.load(handle) == schema:
                    return name[: -len(".schema.json")]
        except (OSError, ValueError):
            continue
    return None


def selected_roles() -> list[str]:
    return [name.strip() for name in os.environ.get("FAKE_ROLE", "").split(",") if name.strip()]


def scenario_for(role: str | None, scenario: str) -> str:
    selected = selected_roles()
    return scenario if not selected or role in selected else "ok"


def section_hold_sec() -> float:
    try:
        return max(0.0, float(os.environ.get("FAKE_SECTION_HOLD_SEC", DEFAULT_SECTION_HOLD_SEC)))
    except ValueError:
        return DEFAULT_SECTION_HOLD_SEC


# Under stream-json, the lines printed before the hold: `system/init` and the three lines of the working turn
# (none of the working turn for `auth`, which fails before the model answers).
WORKING_LINES = 3


@dataclass(frozen=True)
class Answer:
    """What one call prints: `early` at once, `late` after `hold_sec` seconds, then it exits with `code`."""
    code: int
    early: str
    late: str
    hold_sec: float


def answer(arguments: list[str], stdin_text: str, scenario: str) -> Answer:
    flags, positionals = parse(arguments)
    if "-p" not in flags and "--print" not in flags:
        raise CliError("Error: the dev fake answers only headless calls (-p)")
    output_format = value(flags, "--output-format") or "text"
    if output_format == "stream-json" and "--verbose" not in flags:
        raise CliError("Error: When using --print, --output-format=stream-json requires --verbose")
    if not stdin_text and not positionals:
        raise CliError("Error: Input must be provided either through stdin or as a prompt argument when using --print")
    schema_text = value(flags, "--json-schema")
    schema: object = {}
    if schema_text is not None:
        try:
            schema = json.loads(schema_text)
        except ValueError as error:
            raise CliError(f"Error: --json-schema is not a valid JSON Schema: not JSON ({error})") from None
        if not isinstance(schema, dict) or schema.get("$schema", DRAFT07_URIS[0]) not in DRAFT07_URIS:
            raise CliError("Error: --json-schema is not a valid JSON Schema: expected a draft-07 schema object")
    role = role_of(schema)
    scenario = scenario_for(role, scenario)
    hold_sec = section_hold_sec() if role in SECTIONS else 0.0
    alias = value(flags, "--model") or "sonnet"
    model = MODEL_IDS.get(alias, alias)
    structured = instance_of(schema)
    if scenario == "ok" and isinstance(structured, dict) and "diff_path" in structured:
        structured = write_change(structured)
    elif scenario == "ok":
        structured = planted_output(role, stdin_text) or structured
    message = result_message(scenario, structured, model)
    code = 0 if scenario in ("ok", "no-structured") else 1
    if output_format == "json":
        return Answer(code, "", json.dumps(message) + "\n", hold_sec)
    if output_format == "stream-json":
        lines = [json.dumps(line) + "\n" for line in stream_lines(message, scenario, structured, model, flags)]
        printed_early = 1 if scenario == "auth" else 1 + WORKING_LINES
        return Answer(code, "".join(lines[:printed_early]), "".join(lines[printed_early:]), hold_sec)
    return Answer(code, "", str(message.get("result", "; ".join(map(str, message.get("errors", []))))) + "\n",
                  hold_sec)


def read_stdin() -> str:
    """The piped prompt, or "" for a terminal or a pipe that sends nothing within STDIN_WAIT_SEC."""
    if sys.stdin is None or sys.stdin.isatty():
        return ""
    ready, _, _ = select.select([sys.stdin], [], [], STDIN_WAIT_SEC)
    return sys.stdin.read() if ready else ""


def write_change(structured: dict[str, object]) -> dict[str, object]:
    """The coder's change: a diff file in the working directory, and the answer that points at it."""
    target = os.path.join(os.getcwd(), CODER_DIFF_PATH)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w", encoding="utf-8") as handle:
        handle.write(CODER_DIFF)
    return {**structured, "diff_path": CODER_DIFF_PATH, "summary": CODER_SUMMARY}


def main() -> int:
    scenario = os.environ.get("FAKE_SCENARIO", "ok")
    if scenario not in SCENARIOS:
        print(f"dev fake: FAKE_SCENARIO must be one of {', '.join(SCENARIOS)}, got {scenario!r}", file=sys.stderr)
        return 2
    unknown = [name for name in selected_roles() if name not in ROLES]
    if unknown:
        print(f"dev fake: FAKE_ROLE must name roles from {', '.join(ROLES)} (comma-separated) or be unset, "
              f"got {unknown[0]!r}", file=sys.stderr)
        return 2
    stdin_text = read_stdin()
    try:
        reply = answer(sys.argv[1:], stdin_text, scenario)
    except CliError as error:
        print(error, file=sys.stderr)
        return 1
    sys.stdout.write(reply.early)
    sys.stdout.flush()
    time.sleep(reply.hold_sec)
    sys.stdout.write(reply.late)
    return reply.code


if __name__ == "__main__":
    sys.exit(main())
