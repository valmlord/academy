"""SubagentStop hook for the coder: write the working-tree diff to run/change.diff.

The coder's contract has no Write and its Bash runs only the tests, so the diff the reviewers read is
written here, by the harness, when the coder subagent stops.
"""

import os
import subprocess
import sys
from pathlib import Path

DIFF_TIMEOUT_SEC = 20


def main() -> int:
    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())
    diff = subprocess.run(["git", "diff", "--", "src", "tests"], cwd=root, capture_output=True, text=True,
                          timeout=DIFF_TIMEOUT_SEC, check=False)
    if diff.returncode != 0:
        print(f"git diff failed with exit {diff.returncode}: {diff.stderr.strip()}", file=sys.stderr)
        return 1
    (root / "run").mkdir(exist_ok=True)
    (root / "run" / "change.diff").write_text(diff.stdout, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
