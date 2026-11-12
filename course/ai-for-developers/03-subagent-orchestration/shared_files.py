"""Copy the module's shared grader files byte-identical into every lesson that uses them, or check the copies.

Usage, from anywhere:
    python3 -I shared_files.py sync    # copy each master over its copies
    python3 -I shared_files.py check   # exit 1 and list every copy that is missing or differs

Why the masters live in a lesson and not in a module-level directory: `pnpm content:validate` reports every
subdirectory of a module that module.yaml does not list as a lesson ("lesson directory not listed in
module.yaml"). So each file's master is the copy in the first lesson that uses it (design #43, 4.1).
"""

from __future__ import annotations

import sys
from pathlib import Path

MODULE = Path(__file__).resolve().parent
L1, L2, L3, L4, L5, L6 = ("01-read-only-reviewer", "02-role-contracts", "03-coder-reviewer-summarizer",
                          "04-fan-out-synthesizer", "05-citation-gates", "06-handoff-trace")

# (master lesson, path inside the lesson, [(target lesson, path inside the lesson)]).
SHARED: list[tuple[str, str, list[tuple[str, str]]]] = [
    (L1, "checks/agent_defs.py", [(lesson, "checks/agent_defs.py") for lesson in (L2, L3, L4, L5)]),
    (L2, "checks/orchestra_runtime.py", [(lesson, "checks/orchestra_runtime.py") for lesson in (L3, L4, L5, L6)]),
    (L2, "checks/fake_claude.py", [(lesson, "checks/fake_claude.py") for lesson in (L3, L4, L5)]),
    (L2, "checks/data/cli_flags.json", [(lesson, "checks/data/cli_flags.json") for lesson in (L3, L4, L5)]),
    (L2, "checks/data/role_flags.json", [(lesson, "checks/data/role_flags.json") for lesson in (L3, L4, L5)]),
    (L2, "checks/data/result_templates.json",
     [(lesson, "checks/data/result_templates.json") for lesson in (L3, L4, L5)]),
    (L3, "checks/launch.py",
     [(L3, "starter/devtools/launch.py")]
     + [(lesson, path) for lesson in (L4, L5) for path in ("checks/launch.py", "starter/devtools/launch.py")]),
]


def pairs() -> list[tuple[Path, Path]]:
    return [(MODULE / master / source, MODULE / lesson / target)
            for master, source, targets in SHARED for lesson, target in targets]


def sync() -> int:
    for master, copy in pairs():
        copy.parent.mkdir(parents=True, exist_ok=True)
        copy.write_bytes(master.read_bytes())
    return check()


def check() -> int:
    problems = []
    for master, copy in pairs():
        if not copy.is_file():
            problems.append(f"missing: {copy.relative_to(MODULE)}")
        elif copy.read_bytes() != master.read_bytes():
            problems.append(f"differs from {master.relative_to(MODULE)}: {copy.relative_to(MODULE)}")
    for line in problems:
        print(line)
    print(f"shared files: {len(pairs())} copies, {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    commands = {"sync": sync, "check": check}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        print(__doc__)
        sys.exit(2)
    sys.exit(commands[sys.argv[1]]())
