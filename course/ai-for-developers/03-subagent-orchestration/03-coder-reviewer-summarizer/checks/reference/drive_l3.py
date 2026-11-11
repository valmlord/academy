"""Demo driver for pipeline-chain: grade the current directory with the demo hooks and print the outcome as JSON.

    <python3.12> -I -B drive_l3.py [--layout nested|flat] [--plant-git] [--pseudo-root <dir> [--simulate-fd]]

`--plant-git` puts a 5000-object `.git` into the copy after the copy step (design 4.6 honest corpus: the copy
step keeps excluding `.git`, so this is the only way that line is reachable). `--pseudo-root` adds a directory to
the runtime's pseudo-file roots, standing in for /proc where there is none (macOS): with `<dir>/root` -> `/`, a
path `<dir>/root<file>` is the `/proc/self/root<file>` alias. `--simulate-fd` makes `rt.resolve_path` answer
for `<dir>/<pid>/fd/<n>` what Linux realpath answers for `/proc/<pid>/fd/<n>` of an unlinked file
(`<target> (deleted)`) or, when the link target's name starts with `memfd`, of a memfd (`/memfd:<name>
(deleted)`), as the master self-test does. Exit 0 when the check passed.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections.abc import Callable
from pathlib import Path

CHECKS = Path(__file__).resolve().parent.parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(CHECKS))

import verify_pipeline as vp  # noqa: E402

GIT_OBJECTS = 5000


def plant_git(copy: Path) -> None:
    git = copy / ".git"
    (git / "objects").mkdir(parents=True)
    (git / "HEAD").write_text("ref: refs/heads/main\n", encoding="utf-8")
    for index in range(GIT_OBJECTS):
        directory = git / "objects" / f"{index % 256:02x}"
        directory.mkdir(exist_ok=True)
        (directory / f"{index:038x}").write_bytes(b"blob")


def simulated_fd_realpath(pseudo_root: str) -> Callable[[str], str]:
    fd_link = re.compile(re.escape(pseudo_root.rstrip("/")) + r"/\d+/fd/\d+")

    def resolve(path: str) -> str:
        real = os.path.realpath(path)
        if not fd_link.fullmatch(os.path.abspath(path)):
            return real
        name = os.path.basename(real)
        return f"/memfd:{name} (deleted)" if name.startswith("memfd") else f"{real} (deleted)"

    return resolve


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--layout", choices=("nested", "flat"))
    parser.add_argument("--plant-git", action="store_true")
    parser.add_argument("--pseudo-root")
    parser.add_argument("--simulate-fd", action="store_true")
    arguments = parser.parse_args()
    if arguments.pseudo_root:
        vp.rt.PSEUDO_FILE_ROOTS = (*vp.rt.PSEUDO_FILE_ROOTS, arguments.pseudo_root)
        if arguments.simulate_fd:
            vp.rt.resolve_path = simulated_fd_realpath(arguments.pseudo_root)
    options = vp.GradeOptions(layout=arguments.layout, after_copy=plant_git if arguments.plant_git else None)
    outcome = vp.grade(Path.cwd(), options)
    print(json.dumps({"lines": outcome.lines, "calls": outcome.calls, "platformError": outcome.platform_error}))
    return 1 if outcome.lines else 0


if __name__ == "__main__":
    sys.exit(main())
