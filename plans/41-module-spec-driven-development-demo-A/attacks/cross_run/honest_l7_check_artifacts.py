#!/usr/bin/env python3
"""Integrity linter of the project artifacts: rules C1-C6 over spec, tasks, ADRs, tests and glossary.

Usage: python3 scripts/check_artifacts.py <root>

Exit codes: 0 no findings and no output; 1 findings, one line `<rule> <file>: <token>` each on
stdout; 2 usage or parse error, message on stderr, nothing on stdout.
"""

import argparse
import ast
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

SPEC_PATH = "docs/spec.md"
TASKS_PATH = "docs/tasks.md"
ADR_DIR = "docs/adr"
GLOSSARY_MAP_PATH = "GLOSSARY-MAP.md"

REQ_ID = re.compile(r"\bREQ-(\d{2})\b")
REQ_LINE = re.compile(r"^\s*-\s*\*\*REQ-(\d{2})\*\*")
TEST_LABEL = re.compile(r"(?:^|_)req_(\d{2})(?=_|$)")
ADR_ID = re.compile(r"\bADR-(\d{4})\b")
ADR_FILE = re.compile(r"^(\d{4})-.+\.md$")
ADR_HEADING = re.compile(r"^#\s+ADR-(\d{4}):")
ADR_STATUS = re.compile(r"^Status:\s*(.*?)\s*$")
SUPERSEDED = re.compile(r"^superseded by ADR-(\d{4})$")
PLAIN_STATUSES = {"proposed", "accepted", "deprecated"}
TASK_HEADING = re.compile(r"^##\s+T-\d{2}:(.*)$")
STATUS_LINE = re.compile(r"^Status:\s*(\w+)")
WORD = re.compile(r"[A-Za-z]+")
LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")


class ArtifactParseError(Exception):
    """The root cannot be read: no docs/spec.md, no GLOSSARY-MAP.md, or a linked context file missing."""


@dataclass
class Task:
    requirements: set[str] = field(default_factory=set)
    is_done: bool = False


def tokens(text: str) -> list[str]:
    return [word.lower() for word in WORD.findall(text)]


def read_required(root: Path, relative: str) -> str:
    path = root / relative
    if not path.is_file():
        raise ArtifactParseError(f"{relative} not found under {root}")
    return path.read_text(encoding="utf-8")


def avoided_words(root: Path) -> set[str]:
    words: set[str] = set()
    in_contexts = False
    for line in read_required(root, GLOSSARY_MAP_PATH).splitlines():
        if line.startswith("## "):
            in_contexts = line.strip() == "## Contexts"
            continue
        if not in_contexts:
            continue
        for target in LINK.findall(line):
            context_text = read_required(root, target)
            for context_line in context_text.splitlines():
                if context_line.startswith("_Avoid_:"):
                    words.update(tokens(context_line[len("_Avoid_:"):]))
    return words


def unfenced_lines(text: str) -> list[str]:
    """Lines outside CommonMark fenced code blocks; an unclosed fence runs to the end."""
    result: list[str] = []
    open_fence: str | None = None
    for line in text.splitlines():
        match = FENCE.match(line)
        if open_fence is None:
            if match:
                open_fence = match.group(1)
                continue
            result.append(line)
            continue
        if match and match.group(1)[0] == open_fence[0] and len(match.group(1)) >= len(open_fence) \
                and line.strip() == match.group(1):
            open_fence = None
    return result


def vocabulary_text(text: str) -> list[str]:
    checked: list[str] = []
    for line in unfenced_lines(text):
        heading = TASK_HEADING.match(line)
        if heading:
            checked.append(heading.group(1))
            continue
        if line.startswith("#") or line.startswith("Check:"):
            continue
        checked.append(line)
    return checked


def parse_tasks(text: str) -> list[Task]:
    tasks: list[Task] = []
    for line in text.splitlines():
        if TASK_HEADING.match(line):
            tasks.append(Task())
            continue
        if not tasks:
            continue
        if line.startswith("Requirements:"):
            tasks[-1].requirements.update(REQ_ID.findall(line))
        status = STATUS_LINE.match(line)
        if status:
            tasks[-1].is_done = status.group(1) == "done"
    return tasks


def test_names(root: Path) -> dict[str, list[str]]:
    names: dict[str, list[str]] = {}
    for path in sorted((root / "tests").glob("test_*.py")):
        relative = path.relative_to(root).as_posix()
        try:
            module = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError as error:
            raise ArtifactParseError(f"{relative} does not parse: {error}") from error
        found: list[str] = []
        for node in module.body:
            candidates = node.body if isinstance(node, ast.ClassDef) else [node]
            for candidate in candidates:
                if isinstance(candidate, (ast.FunctionDef, ast.AsyncFunctionDef)) and candidate.name.startswith("test"):
                    found.append(candidate.name)
        names[relative] = found
    return names


def adr_findings(root: Path) -> tuple[list[str], set[str]]:
    """Returns C4 findings and the ids of ADRs that are superseded or deprecated."""
    findings: list[str] = []
    retired: set[str] = set()
    adr_dir = root / ADR_DIR
    files = sorted(p for p in adr_dir.glob("*.md") if ADR_FILE.match(p.name)) if adr_dir.is_dir() else []
    numbers = [ADR_FILE.match(p.name).group(1) for p in files]  # type: ignore[union-attr]
    existing = set(numbers)
    for expected in range(1, max((int(n) for n in numbers), default=0) + 1):
        if f"{expected:04d}" not in existing:
            findings.append(f"C4 {ADR_DIR}: ADR-{expected:04d}")
    for path, number in zip(files, numbers):
        relative = path.relative_to(root).as_posix()
        lines = path.read_text(encoding="utf-8").splitlines()
        first_heading = next((line for line in lines if line.startswith("# ")), "")
        heading = ADR_HEADING.match(first_heading)
        status_line = next((m.group(1) for m in map(ADR_STATUS.match, lines) if m), None)
        if numbers.count(number) > 1 or heading is None or heading.group(1) != number:
            findings.append(f"C4 {relative}: {path.name}")
            continue
        if status_line in PLAIN_STATUSES:
            if status_line == "deprecated":
                retired.add(number)
            continue
        superseded = SUPERSEDED.match(status_line or "")
        if superseded is None or superseded.group(1) == number:
            findings.append(f"C4 {relative}: {path.name}")
            continue
        retired.add(number)
        if superseded.group(1) not in existing:
            findings.append(f"C4 {relative}: ADR-{superseded.group(1)}")
    return findings, retired


def lint(root: Path) -> list[str]:
    spec_text = read_required(root, SPEC_PATH)
    avoided = avoided_words(root)
    tasks_path = root / TASKS_PATH
    tasks_text = tasks_path.read_text(encoding="utf-8") if tasks_path.is_file() else ""
    tests = test_names(root)

    spec_ids = {m.group(1) for m in map(REQ_LINE.match, spec_text.splitlines()) if m}
    tasks = parse_tasks(tasks_text)
    task_ids = set().union(*(task.requirements for task in tasks)) if tasks else set()
    labels_by_file = {path: {label for name in names for label in TEST_LABEL.findall(name)} for path, names in tests.items()}
    all_labels = set().union(*labels_by_file.values()) if labels_by_file else set()

    findings: list[str] = []
    findings += [f"C1 {SPEC_PATH}: REQ-{rid}" for rid in sorted(spec_ids - task_ids)]
    findings += [f"C2 {TASKS_PATH}: REQ-{rid}" for rid in sorted(task_ids - spec_ids)]
    for path, labels in labels_by_file.items():
        findings += [f"C2 {path}: REQ-{rid}" for rid in sorted(labels - spec_ids)]
    done_ids = set().union(*(task.requirements for task in tasks if task.is_done)) if tasks else set()
    findings += [f"C3 {TASKS_PATH}: REQ-{rid}" for rid in sorted(done_ids - all_labels)]

    adr_problems, retired = adr_findings(root)
    findings += adr_problems
    for relative, text in ((SPEC_PATH, spec_text), (TASKS_PATH, tasks_text)):
        cited = set(ADR_ID.findall(text))
        findings += [f"C5 {relative}: ADR-{number}" for number in sorted(cited & retired)]

    def matches(token: str) -> str | None:
        for word in (token, token[:-1] if token.endswith("s") else "", token[:-2] if token.endswith("es") else ""):
            if word and word in avoided:
                return word
        return None

    vocabulary_sources = [(SPEC_PATH, vocabulary_text(spec_text)), (TASKS_PATH, vocabulary_text(tasks_text))]
    vocabulary_sources += [(path, names) for path, names in tests.items()]
    for relative, texts in vocabulary_sources:
        hits = {token for text in texts for token in tokens(text) if matches(token)}
        findings += [f"C6 {relative}: {word}" for word in sorted(hits)]
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Check spec, tasks, ADRs, tests and glossary for drift.")
    parser.add_argument("root", type=Path, help="project root that holds docs/spec.md and GLOSSARY-MAP.md")
    args = parser.parse_args()
    try:
        findings = lint(args.root)
    except ArtifactParseError as error:
        print(f"check_artifacts.py: {error}", file=sys.stderr)
        return 2
    for line in findings:
        print(line)
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
