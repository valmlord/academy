"""Demo driver for fan-out: grade the current directory with the demo hooks and print the outcome as JSON.

    <python3.12> -I -B drive_l4.py [--layout nested|flat] [--plant-git]

`--plant-git` puts a 5000-object `.git` into the copy after the copy step (design 4.6 honest corpus: the copy
step keeps excluding `.git`, so this is the only way that line is reachable). Exit 0 when the check passed.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

CHECKS = Path(__file__).resolve().parent.parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(CHECKS))

import verify_fan_out as vp  # noqa: E402

GIT_OBJECTS = 5000


def plant_git(copy: Path) -> None:
    git = copy / ".git"
    (git / "objects").mkdir(parents=True)
    (git / "HEAD").write_text("ref: refs/heads/main\n", encoding="utf-8")
    for index in range(GIT_OBJECTS):
        directory = git / "objects" / f"{index % 256:02x}"
        directory.mkdir(exist_ok=True)
        (directory / f"{index:038x}").write_bytes(b"blob")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--layout", choices=("nested", "flat"))
    parser.add_argument("--plant-git", action="store_true")
    arguments = parser.parse_args()
    options = vp.GradeOptions(layout=arguments.layout, after_copy=plant_git if arguments.plant_git else None)
    outcome = vp.grade(Path.cwd(), options)
    print(json.dumps({"lines": outcome.lines, "calls": outcome.calls, "platformError": outcome.platform_error}))
    return 1 if outcome.lines else 0


if __name__ == "__main__":
    sys.exit(main())
