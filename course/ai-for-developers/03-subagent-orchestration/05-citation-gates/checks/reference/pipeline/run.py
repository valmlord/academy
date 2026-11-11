"""The review pipeline: Coder -> three section reviewers at the same time -> Synthesizer -> Summarizer,
with a citation gate on both joints where findings move on.

Usage (see `make try-fake`):

    python3 pipeline/run.py --task task/request.md --acceptance task/acceptance.md --run-dir <directory>

Exit code 0 when the report is written (a failed section is listed in `unreviewed`), 1 when the pipeline
stopped. Each role gets only what it needs: a section the change and the criteria by path, the synthesizer
the accepted section findings as JSON, the summarizer the accepted synthesized findings as JSON. Every rejected
finding gets a line in `<run dir>/gate.jsonl`. The raw result message of every call is kept in the run
directory for a person to read; no role is pointed at those files, since they hold the rejected findings too.
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from claude_call import RoleCallError, call_role_with_result
from gate import check_findings, check_synthesis

PROJECT = Path(__file__).resolve().parent.parent
ROLES_PATH = PROJECT / "pipeline" / "roles.json"
HANDOFF_LOG = "handoffs.jsonl"
REPORT = "report.json"
GATE_LOG = "gate.jsonl"
SECTIONS = ("security", "performance", "tests")
# What each downstream role needs of a finding. Both also get `severity`: the synthesizer sets the severity of
# each merged finding from those of its sources, the summarizer's contract decides by it whether the change
# can be accepted.
SYNTHESIZER_FINDING_FIELDS = ("id", "file", "line", "quote", "claim", "severity", "section")
SUMMARIZER_FINDING_FIELDS = ("id", "file", "line", "quote", "claim", "severity")


class AllSectionsFailed(Exception):
    """No section reviewer answered, so there is nothing to synthesize."""


class HandoffLog:
    """One JSON line per call, failed calls included, appended as each call ends.

    The three section calls end on their own threads, so appending and the entry list share one lock.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self.entries: list[dict[str, object]] = []
        self._lock = threading.Lock()

    def record(self, role: str, prompt: str, message: dict[str, object] | None, is_ok: bool) -> None:
        settings = json.loads(ROLES_PATH.read_text(encoding="utf-8"))[role]
        entry = {
            "role": role,
            "model": settings["model"],
            "session_id": None if message is None else message.get("session_id"),
            "subtype": None if message is None else message.get("subtype"),
            "total_cost_usd": 0 if message is None else message.get("total_cost_usd", 0),
            "prompt_bytes": len(prompt.encode("utf-8")),
            "status": "ok" if is_ok else "failed",
        }
        with self._lock:
            self.entries.append(entry)
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def total_cost_usd(self) -> float:
        with self._lock:
            return sum(float(str(entry["total_cost_usd"])) for entry in self.entries)


def call(role: str, prompt: str, run_dir: Path, log: HandoffLog) -> dict[str, object]:
    """One role call, logged; the raw result message is kept as `<run dir>/<role>.json`."""
    try:
        answer, message = call_role_with_result(role, prompt, ROLES_PATH, PROJECT)
    except RoleCallError as error:
        log.record(role, prompt, error.result, is_ok=False)
        raise
    (run_dir / f"{role}.json").write_text(json.dumps(message, ensure_ascii=False, indent=2), encoding="utf-8")
    log.record(role, prompt, message, is_ok=True)
    return answer


def coder_prompt(task: Path) -> str:
    return (f"Задача лежит в файле {task}. Внеси изменение в проект, запиши его diff в файл и верни путь "
            "к нему в diff_path.")


def section_prompt(section: str, diff_path: str, acceptance: Path) -> str:
    return (f"Раздел ревью: {section}. Проверь изменение: его diff лежит в файле {diff_path}. Критерии приёмки "
            f"лежат в файле {acceptance}. Перечисли находки своего раздела по контракту.")


def synthesizer_prompt(findings: list[dict[str, object]]) -> str:
    handed = [{name: finding.get(name) for name in SYNTHESIZER_FINDING_FIELDS} for finding in findings]
    return ("Находки разделов ревью (JSON):\n" + json.dumps(handed, ensure_ascii=False, indent=2) +
            "\n\nСведи их в итоговые находки по контракту.")


def summarizer_prompt(findings: list[dict[str, object]]) -> str:
    handed = [{name: finding.get(name) for name in SUMMARIZER_FINDING_FIELDS} for finding in findings]
    return ("Находки ревью (JSON):\n" + json.dumps(handed, ensure_ascii=False, indent=2) +
            "\n\nНапиши тимлиду итог по этим находкам.")


def review_sections(diff_path: str, acceptance: Path, run_dir: Path,
                    log: HandoffLog) -> tuple[list[dict[str, object]], list[str]]:
    """Start every section call first, then wait for each: the findings of the sections that answered, in
    section order, and the sections whose call failed."""
    prompts = {section: section_prompt(section, diff_path, acceptance) for section in SECTIONS}
    with ThreadPoolExecutor(max_workers=len(SECTIONS)) as pool:
        futures = {section: pool.submit(call, section, prompts[section], run_dir, log) for section in SECTIONS}
        findings: list[dict[str, object]] = []
        unreviewed: list[str] = []
        for section, future in futures.items():
            try:
                answer = future.result()
            except RoleCallError as error:
                print(f"section not reviewed: {error}", file=sys.stderr)
                unreviewed.append(section)
                continue
            section_findings = answer["findings"]
            assert isinstance(section_findings, list)
            findings.extend(section_findings)
    if len(unreviewed) == len(SECTIONS):
        raise AllSectionsFailed("every section call failed")
    return findings, unreviewed


def log_rejections(run_dir: Path, rejected: dict[str, str], joint: str) -> None:
    """One line per rejected finding: its id, the role it would have reached next, the rule it breaks."""
    with (run_dir / GATE_LOG).open("a", encoding="utf-8") as handle:
        for finding_id, rule in rejected.items():
            handle.write(json.dumps({"id": finding_id, "joint": joint, "rule": rule}) + "\n")


def passed(findings: list[dict[str, object]], rejected: dict[str, str]) -> list[dict[str, object]]:
    return [finding for finding in findings if str(finding["id"]) not in rejected]


def report_status(unreviewed: list[str], synthesized: list[object]) -> str:
    if unreviewed:
        return "incomplete"
    return "findings" if synthesized else "clean"


def parse_arguments(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Coder -> sections -> Synthesizer -> Summarizer")
    parser.add_argument("--task", type=Path, required=True, help="the task for the coder")
    parser.add_argument("--acceptance", type=Path, required=True, help="the acceptance criteria")
    parser.add_argument("--run-dir", type=Path, required=True, help="every file of this run goes here")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    arguments = parse_arguments(argv)
    run_dir = arguments.run_dir
    run_dir.mkdir(parents=True, exist_ok=True)
    log = HandoffLog(run_dir / HANDOFF_LOG)
    try:
        change = call("coder", coder_prompt(arguments.task), run_dir, log)
        findings, unreviewed = review_sections(str(change["diff_path"]), arguments.acceptance, run_dir, log)
        (run_dir / GATE_LOG).touch()
        rejected = check_findings(findings, PROJECT)
        log_rejections(run_dir, rejected, "synthesizer")
        accepted = passed(findings, rejected)
        synthesis = call("synthesizer", synthesizer_prompt(accepted), run_dir, log)
        raw_synthesized = synthesis["findings"]
        assert isinstance(raw_synthesized, list)
        rejected = check_synthesis(raw_synthesized, {str(f["id"]): f for f in accepted}, PROJECT)
        log_rejections(run_dir, rejected, "summarizer")
        synthesized = passed(raw_synthesized, rejected)
        summary = call("summarizer", summarizer_prompt(synthesized), run_dir, log)
    except (RoleCallError, AllSectionsFailed) as error:
        print(f"pipeline stopped: {error}", file=sys.stderr)
        return 1
    report = {"summary": summary["summary"], "finding_ids": summary["finding_ids"],
              "total_cost_usd": log.total_cost_usd(), "status": report_status(unreviewed, synthesized),
              "unreviewed": unreviewed}
    (run_dir / REPORT).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
