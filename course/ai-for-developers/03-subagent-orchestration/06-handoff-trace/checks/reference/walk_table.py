"""Re-run the design's walk table (5.L6) as a script over the generated record.

Every physical line of trace/review-run.ndjson goes through rules 1-5 in order; the first "yes" decides.
The contracts below are the ones printed in trace/README.md. Planted lines must walk to their category,
decoys and every other line to "none". The script also asserts the record's construction rules:
- one content block per line; the subagent tool is `Agent` in tool_use and `Task` only in init;
- filler lines (no tag) hold no tool_use;
- the tests reviewer's subtree holds no Bash;
- the file cited at line 412 has exactly 300 lines, and no reviewer report holds that finding;
- every tool_use gets exactly one tool_result later in the record.

Usage: python3 -I checks/reference/walk_table.py [workspace]   (default: the lesson's starter/)
Exit 0 when every line walks as tagged.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

LESSON = Path(__file__).resolve().parents[2]
TRACE = "trace/review-run.ndjson"
TEST_COMMAND_PREFIX = "python3 -m unittest "
CWD = "/home/dev/invoice-service/"
CATEGORY = {"RB": "role-breach", "CL": "context-leak", "UC": "uncited-claim", "IF": "ignored-failure",
            "UP": "unverified-pass"}

READ_ONLY = {"Read", "Grep", "Glob"}
# Role -> tool -> predicate on the tool input (contracts, trace/README.md).
ANY = None


def _is_test_command(tool_input: dict[str, object]) -> bool:
    return str(tool_input.get("command", "")).startswith(TEST_COMMAND_PREFIX)


def _writes_under_run(tool_input: dict[str, object]) -> bool:
    return str(tool_input.get("file_path", "")).startswith(CWD + "run/")


def _starts_explorer(tool_input: dict[str, object]) -> bool:
    return tool_input.get("subagent_type") == "explorer"


CONTRACT_TOOLS: dict[str, dict[str, object]] = {
    "main": {"Read": ANY, "Write": _writes_under_run, "Agent": ANY},
    "coder": {"Edit": ANY, "Read": ANY, "Grep": ANY, "Glob": ANY, "Bash": _is_test_command, "Agent": _starts_explorer},
    "explorer": dict.fromkeys(READ_ONLY, ANY),
    "security-reviewer": dict.fromkeys(READ_ONLY, ANY),
    "performance-reviewer": dict.fromkeys(READ_ONLY, ANY),
    "tests-reviewer": {**dict.fromkeys(READ_ONLY, ANY), "Bash": _is_test_command},
    "synthesizer": {"Read": ANY},
    "summarizer": {"Read": ANY},
}
# Input clauses: whose reports a role may receive (the other material it receives is not a report).
ALLOWED_REPORT_SOURCES = {
    "synthesizer": {"security-reviewer", "performance-reviewer", "tests-reviewer"},
    "summarizer": {"synthesizer"},
}
REPORT_KEYS = {
    "coder": {"diff_path", "summary"},
    "security-reviewer": {"findings"},
    "performance-reviewer": {"findings"},
    "tests-reviewer": {"findings", "tests_status"},
    "synthesizer": {"findings", "sections"},
    "summarizer": {"summary", "finding_ids"},
}
LOCATION_LINE = re.compile(r'^(\S+):(\d+): "(.*)"$')
TRANSCRIPT_MARKER = re.compile(r"(?im)^(transcript\b|> thinking:)")
PASS_CLAIM = re.compile(r"(?i)\b(tests?|suite)\b[^.;]*\bpass(es|ed)?\b|\ball pass\b")
ATTRIBUTED = re.compile(r"(?i)reported by")
SECTION_OF = {"security-reviewer": "security", "performance-reviewer": "performance", "tests-reviewer": "tests"}


@dataclass
class Event:
    number: int
    raw: dict[str, object]
    block: dict[str, object]
    actor_chain: list[str]  # Agent call ids from main down to the agent whose conversation holds this line
    actor: str  # agent path


@dataclass
class Record:
    events: list[Event]
    agent_calls: dict[str, tuple[str, str, int]] = field(default_factory=dict)  # call id -> (child path, type, line)
    reports: dict[int, str] = field(default_factory=dict)  # line -> Agent call id whose report it carries


def role_of(path: str) -> str:
    return path.rsplit("/", 1)[-1]


def load(workspace: Path) -> Record:
    events: list[Event] = []
    chains: dict[str | None, list[str]] = {None: []}
    paths: dict[str | None, str] = {None: "main"}
    record = Record(events)
    for number, line in enumerate((workspace / TRACE).read_text(encoding="utf-8").splitlines(), start=1):
        raw = json.loads(line)
        message = raw.get("message")
        content = message.get("content") if isinstance(message, dict) else None
        if isinstance(content, list) and len(content) != 1:
            raise AssertionError(f"line {number}: {len(content)} content blocks, expected one")
        block = content[0] if isinstance(content, list) else {}
        parent = raw.get("parent_tool_use_id")
        event = Event(number, raw, block, list(chains[parent]), paths[parent])
        events.append(event)
        if block.get("type") == "tool_use" and block.get("name") == "Agent":
            call_id = str(block["id"])
            child_type = str(block["input"].get("subagent_type") or "general-purpose")
            chains[call_id] = event.actor_chain + [call_id]
            paths[call_id] = f"{event.actor}/{child_type}"
            record.agent_calls[call_id] = (paths[call_id], child_type, number)
        if block.get("type") == "tool_result" and block.get("tool_use_id") in record.agent_calls:
            record.reports[number] = str(block["tool_use_id"])
    return record


def text_of(block: dict[str, object]) -> str:
    if block.get("type") == "tool_use":
        return json.dumps(block.get("input"), ensure_ascii=False)
    content = block.get("content")
    if isinstance(content, list):
        return "\n".join(str(part.get("text", "")) for part in content if isinstance(part, dict))
    return str(content if content is not None else block.get("text", ""))


def prompt_of(block: dict[str, object]) -> str:
    tool_input = block.get("input")
    return str(tool_input.get("prompt", "")) if isinstance(tool_input, dict) else ""


def report_json(text: str) -> dict[str, object] | None:
    try:
        value = json.loads(text)
    except ValueError:
        return None
    return value if isinstance(value, dict) else None


# ---------------------------------------------------------------------------------------------------------
# Findings and citations
# ---------------------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Finding:
    key: tuple[str, int]
    finding_id: str | None
    quote: str | None


def findings_in(role: str, text: str) -> list[Finding]:
    if role == "explorer":
        found = []
        for line in text.splitlines():
            match = LOCATION_LINE.match(line)
            if match:
                found.append(Finding((match.group(1), int(match.group(2))), None, match.group(3)))
        return found
    value = report_json(text)
    items = value.get("findings") if value else None
    return [Finding((str(item.get("file")), int(item.get("line", 0))), item.get("id"), item.get("quote"))
            for item in items if isinstance(item, dict)] if isinstance(items, list) else []


def citation_valid(workspace: Path, finding: Finding) -> bool:
    relative, number = finding.key
    path = workspace / relative
    if finding.quote is None or not path.is_file():
        return False
    lines = path.read_text(encoding="utf-8").splitlines()
    return 1 <= number <= len(lines) and finding.quote in lines[number - 1]


# ---------------------------------------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------------------------------------

@dataclass
class Walker:
    workspace: Path
    record: Record

    def report_lines(self) -> list[int]:
        return sorted(self.record.reports)

    def is_error(self, event: Event) -> bool:
        return event.block.get("is_error") is True

    def reporter_role(self, number: int) -> str:
        return self.record.agent_calls[self.record.reports[number]][1]

    def rule1(self, event: Event) -> bool:
        if event.block.get("type") != "tool_use":
            return False
        allowed = CONTRACT_TOOLS[role_of(event.actor)]
        tool = str(event.block.get("name"))
        if tool not in allowed:
            return True
        predicate = allowed[tool]
        return predicate is not None and not predicate(event.block.get("input") or {})  # type: ignore[operator]

    def earlier_reports(self, before: int) -> list[tuple[str, str]]:
        """(reporter role, report text) of every non-error report before line `before`."""
        out = []
        for number in self.report_lines():
            event = self.record.events[number - 1]
            if number < before and not self.is_error(event):
                out.append((self.reporter_role(number), text_of(event.block)))
        return out

    def carries_forbidden(self, receiver: str, text: str, before: int) -> bool:
        if TRANSCRIPT_MARKER.search(text):
            return True
        allowed = ALLOWED_REPORT_SOURCES.get(receiver, set())
        return any(report in text and source not in allowed for source, report in self.earlier_reports(before))

    def rule2(self, event: Event) -> bool:
        block = event.block
        if block.get("type") == "tool_use" and block.get("name") == "Agent":
            receiver = str(block["input"].get("subagent_type") or "general-purpose")
            return self.carries_forbidden(receiver, prompt_of(block), event.number)
        if event.number in self.record.reports and not self.is_error(event):
            role = self.reporter_role(event.number)
            text = text_of(block)
            if role == "explorer":
                shape_ok = all(LOCATION_LINE.match(line) for line in text.splitlines() if line.strip())
            else:
                value = report_json(text)
                shape_ok = value is not None and set(value) <= REPORT_KEYS[role]
            parent_role = role_of(event.actor)
            return not shape_ok or self.carries_forbidden(parent_role, text, event.number)
        return False

    def producer_line(self, finding: Finding) -> int:
        for number in self.report_lines():
            event = self.record.events[number - 1]
            if not self.is_error(event) and any(
                    f.key == finding.key for f in findings_in(self.reporter_role(number), text_of(event.block))):
                return number
        raise AssertionError(f"finding {finding} has no producer")

    def used_later(self, finding: Finding, after: int) -> bool:
        tokens = [token for token in (finding.finding_id, f"{finding.key[0]}:{finding.key[1]}") if token]
        for event in self.record.events[after:]:
            is_handoff = (event.block.get("name") == "Agent") or event.number in self.record.reports
            if is_handoff and any(token in text_of(event.block) for token in tokens):
                return True
        return False

    def rule3(self, event: Event) -> bool:
        if event.number not in self.record.reports or self.is_error(event):
            return False
        for finding in findings_in(self.reporter_role(event.number), text_of(event.block)):
            if (self.producer_line(finding) == event.number and not citation_valid(self.workspace, finding)
                    and self.used_later(finding, event.number)):
                return True
        return False

    def main_error_before(self, event: Event) -> Event | None:
        """The error result to main that this main action is the first action after, if any."""
        for previous in reversed(self.record.events[:event.number - 1]):
            if previous.actor == "main" and previous.block.get("type") == "tool_use":
                return None
            if previous.actor == "main" and previous.block.get("type") == "tool_result" and self.is_error(previous):
                return previous
        return None

    def treats_as_success(self, error: Event, action: Event) -> bool:
        failed_call = str(error.block.get("tool_use_id"))
        if failed_call in self.record.agent_calls:
            section = SECTION_OF.get(self.record.agent_calls[failed_call][1])
            text = text_of(action.block).lower()
            return section is not None and (re.search(r"all (three|3) sections reviewed", text) is not None
                                             or re.search(rf"{section}\W+(section\W+)?reviewed", text) is not None)
        failed_use = next(e for e in self.record.events if e.block.get("id") == failed_call)
        failed_path = str(failed_use.block["input"].get("file_path"))
        if action.block.get("name") == "Write" and action.block["input"].get("file_path") == failed_path:
            return False  # creating the missing file does not use its content
        return failed_path in text_of(action.block)

    def rule4(self, event: Event) -> bool:
        if event.actor != "main" or event.block.get("type") != "tool_use":
            return False
        error = self.main_error_before(event)
        return error is not None and self.treats_as_success(error, event)

    def own_pass_claims(self, text: str) -> bool:
        value = report_json(text)
        strings = [str(v) for v in value.values() if isinstance(v, str)] if value else [text]
        return any(PASS_CLAIM.search(s) and not ATTRIBUTED.search(s) for s in strings)

    def rule5(self, event: Event) -> bool:
        if event.number not in self.record.reports or self.is_error(event):
            return False
        if not self.own_pass_claims(text_of(event.block)):
            return False
        call_id = self.record.reports[event.number]
        return not any(call_id in e.actor_chain and e.block.get("name") == "Bash"
                       and _is_test_command(e.block.get("input") or {})
                       for e in self.record.events[:event.number - 1])

    def walk(self, event: Event) -> tuple[str, list[str]]:
        verdicts = []
        for name, rule, category in (("R1", self.rule1, "role-breach"), ("R2", self.rule2, "context-leak"),
                                     ("R3", self.rule3, "uncited-claim"), ("R4", self.rule4, "ignored-failure"),
                                     ("R5", self.rule5, "unverified-pass")):
            if rule(event):
                verdicts.append(f"{name} yes")
                return category, verdicts
            verdicts.append(f"{name} no")
        return "none", verdicts


# ---------------------------------------------------------------------------------------------------------
# Construction assertions
# ---------------------------------------------------------------------------------------------------------

def construction_problems(workspace: Path, record: Record, tags: dict[str, str]) -> list[str]:
    problems = []
    tool_uses = {}
    results: dict[str, int] = {}
    for event in record.events:
        block = event.block
        if block.get("type") == "tool_use":
            tool_uses[str(block["id"])] = event.number
            if block.get("name") == "Task":
                problems.append(f"line {event.number}: tool_use named Task")
            if str(event.number) not in tags:
                problems.append(f"line {event.number}: a filler line holds a tool_use")
        if block.get("type") == "tool_result":
            results[str(block["tool_use_id"])] = results.get(str(block["tool_use_id"]), 0) + 1
    for call_id, number in tool_uses.items():
        if results.get(call_id) != 1:
            problems.append(f"line {number}: tool_use has {results.get(call_id, 0)} results")
    init = record.events[0].raw
    if "Task" not in init.get("tools", []) or "Agent" in init.get("tools", []):
        problems.append("init: the tools list must name Task, not Agent")
    tests_call = next(call for call, (_, kind, _) in record.agent_calls.items() if kind == "tests-reviewer")
    if any(tests_call in e.actor_chain and e.block.get("name") == "Bash" for e in record.events):
        problems.append("the tests reviewer's subtree holds a Bash call")
    cited = workspace / "src/invoices/tax_rates.py"
    if len(cited.read_text(encoding="utf-8").splitlines()) != 300:
        problems.append("src/invoices/tax_rates.py must have exactly 300 lines")
    for number, call_id in record.reports.items():
        kind = record.agent_calls[call_id][1]
        text = text_of(record.events[number - 1].block)
        if kind in SECTION_OF and any(f.key == ("src/invoices/tax_rates.py", 412) for f in findings_in(kind, text)):
            problems.append(f"line {number}: a reviewer report holds the line-412 finding")
    return problems


def main() -> int:
    workspace = Path(sys.argv[1]) if len(sys.argv) > 1 else LESSON / "starter"
    tags: dict[str, str] = json.loads((LESSON / "checks/reference/line_tags.json").read_text(encoding="utf-8"))
    record = load(workspace)
    walker = Walker(workspace, record)
    mismatches = []
    for event in record.events:
        tag = tags.get(str(event.number))
        expected = CATEGORY[tag[2:4]] if tag and tag.startswith("P-") else "none"
        result, verdicts = walker.walk(event)
        if tag and tag[0] in "PD":
            print(f"{event.number:4d} {tag:6s} {event.actor:32s} {result:16s} {', '.join(verdicts)}")
        if result != expected:
            mismatches.append(f"line {event.number} ({tag or 'filler'}): walked to {result}, expected {expected}")
    problems = construction_problems(workspace, record, tags)
    order_owner = None
    for event in record.events:
        if event.block.get("name") == "Agent":
            order_owner = record.agent_calls[str(event.block["id"])][0]
        if tags.get(str(event.number)) == "P-RB1":
            print(f"order-based reader puts line {event.number} under {order_owner}; the tree says {event.actor}")
    for line in mismatches + problems:
        print(f"PROBLEM: {line}")
    print(f"{len(record.events)} lines walked; {len(mismatches)} mismatches, {len(problems)} construction problems")
    return 1 if mismatches or problems else 0


if __name__ == "__main__":
    sys.exit(main())
