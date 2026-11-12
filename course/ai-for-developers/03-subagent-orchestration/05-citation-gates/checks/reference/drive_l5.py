"""Demo driver for gate-wired: grade the current directory with the demo hooks and print the outcome as JSON.

    <python3.12> -I -B drive_l5.py [--layout nested|flat] [--cyrillic] [--crlf]

`--cyrillic` adds a Cyrillic comment line to every file under the copy's src/ after the copy step, so the files
the findings cite hold non-ASCII text (honest corpus: a gate that reads UTF-8 must not trip on it). `--crlf`
rewrites every such file with CRLF line ends (the line model counts the same lines; a gate that keeps the `\\r`
still finds the quote). Exit 0 when the check passed.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

CHECKS = Path(__file__).resolve().parent.parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(CHECKS))

import verify_gate_wired as vw  # noqa: E402

CYRILLIC_LINE = "# Комментарий: пеня считается в центах, без дробей.\n"


def source_files(copy: Path) -> list[Path]:
    return sorted((copy / "src").rglob("*.py"))


def plant_cyrillic(copy: Path) -> None:
    for path in source_files(copy):
        path.write_text(CYRILLIC_LINE + path.read_text(encoding="utf-8"), encoding="utf-8")


def to_crlf(copy: Path) -> None:
    for path in source_files(copy):
        path.write_bytes(path.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--layout", choices=("nested", "flat"))
    parser.add_argument("--cyrillic", action="store_true")
    parser.add_argument("--crlf", action="store_true")
    arguments = parser.parse_args()

    def after_copy(copy: Path) -> None:
        if arguments.cyrillic:
            plant_cyrillic(copy)
        if arguments.crlf:
            to_crlf(copy)

    options = vw.GradeOptions(layout=arguments.layout,
                              after_copy=after_copy if arguments.cyrillic or arguments.crlf else None)
    outcome = vw.grade(Path.cwd(), options)
    print(json.dumps({"lines": outcome.lines, "calls": outcome.calls, "platformError": outcome.platform_error}))
    return 1 if outcome.lines else 0


if __name__ == "__main__":
    sys.exit(main())
