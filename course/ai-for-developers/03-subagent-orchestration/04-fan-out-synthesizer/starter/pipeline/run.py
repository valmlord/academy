"""The review pipeline: Coder -> Reviewer -> Summarizer, one call per role, through `pipeline/claude_call.py`.

Usage (see `make try-fake`):

    python3 pipeline/run.py --task task/request.md --acceptance task/acceptance.md --run-dir <directory>

Exit code 0 when all three roles answered and the report is written, 1 when the pipeline stopped.
Each role gets only what it needs: the reviewer the change and the criteria by path, the summarizer the
findings as JSON. The raw result message of every call is kept in the run directory for a person to read;
no role is pointed at those files.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from claude_call import RoleCallError, call_role_with_result

PROJECT = Path(__file__).resolve().parent.parent
ROLES_PATH = PROJECT / "pipeline" / "roles.json"
HANDOFF_LOG = "handoffs.jsonl"
REPORT = "report.json"
# The fields of a finding the summarizer needs: H3's five, plus severity, by which its contract decides whether
# the change can be accepted.
SUMMARIZER_FINDING_FIELDS = ("id", "file", "line", "quote", "claim", "severity")


class HandoffLog:
    """One JSON line per call, failed calls included, appended as each call ends."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.entries: list[dict[str, object]] = []

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
        self.entries.append(entry)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def total_cost_usd(self) -> float:
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


def reviewer_prompt(diff_path: str, acceptance: Path) -> str:
    return (f"Проверь изменение: его diff лежит в файле {diff_path}. Критерии приёмки лежат в файле "
            f"{acceptance}. Перечисли находки по контракту.")


def summarizer_prompt(findings: list[dict[str, object]]) -> str:
    handed = [{name: finding.get(name) for name in SUMMARIZER_FINDING_FIELDS} for finding in findings]
    return ("Находки ревью (JSON):\n" + json.dumps(handed, ensure_ascii=False, indent=2) +
            "\n\nНапиши тимлиду итог по этим находкам.")


def parse_arguments(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Coder -> Reviewer -> Summarizer")
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
        review = call("reviewer", reviewer_prompt(str(change["diff_path"]), arguments.acceptance), run_dir, log)
        findings = review["findings"]
        assert isinstance(findings, list)
        summary = call("summarizer", summarizer_prompt(findings), run_dir, log)
    except RoleCallError as error:
        print(f"pipeline stopped: {error}", file=sys.stderr)
        return 1
    report = {"summary": summary["summary"], "finding_ids": summary["finding_ids"],
              "total_cost_usd": log.total_cost_usd()}
    (run_dir / REPORT).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
