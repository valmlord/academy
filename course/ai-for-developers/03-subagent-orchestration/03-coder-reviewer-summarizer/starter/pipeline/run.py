"""The review pipeline: Coder -> Reviewer -> Summarizer, one call per role, through `pipeline/claude_call.py`.

Usage (see `make try-fake`):

    python3 pipeline/run.py --task task/request.md --acceptance task/acceptance.md --run-dir <directory>

Exit code 0 when all three roles answered and the report is written, 1 when the pipeline stopped.
What each role receives, the handoff log and the report are described in `docs/pipeline-brief.md`.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from claude_call import RoleCallError, call_role_with_result  # noqa: F401  (used once the steps are written)

PROJECT = Path(__file__).resolve().parent.parent
ROLES_PATH = PROJECT / "pipeline" / "roles.json"


def parse_arguments(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Coder -> Reviewer -> Summarizer")
    parser.add_argument("--task", type=Path, required=True, help="the task for the coder")
    parser.add_argument("--acceptance", type=Path, required=True, help="the acceptance criteria")
    parser.add_argument("--run-dir", type=Path, required=True, help="every file of this run goes here")
    return parser.parse_args(argv)


def run_coder(task: Path, run_dir: Path) -> dict[str, object]:
    """TODO: call the coder with the task; return its answer (`diff_path`, `summary`)."""
    raise NotImplementedError("run_coder")


def run_reviewer(change: dict[str, object], acceptance: Path, run_dir: Path) -> dict[str, object]:
    """TODO: call the reviewer with what it needs, and nothing else; return its answer (`findings`)."""
    raise NotImplementedError("run_reviewer")


def run_summarizer(review: dict[str, object], run_dir: Path) -> dict[str, object]:
    """TODO: call the summarizer with what it needs, and nothing else; return its answer."""
    raise NotImplementedError("run_summarizer")


def write_report(summary: dict[str, object], run_dir: Path) -> None:
    """TODO: write the report described in the brief."""
    raise NotImplementedError("write_report")


def main(argv: list[str]) -> int:
    arguments = parse_arguments(argv)
    arguments.run_dir.mkdir(parents=True, exist_ok=True)
    # TODO: the chain, the handoff log and the stop on the first failed call.
    change = run_coder(arguments.task, arguments.run_dir)
    review = run_reviewer(change, arguments.acceptance, arguments.run_dir)
    summary = run_summarizer(review, arguments.run_dir)
    write_report(summary, arguments.run_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
