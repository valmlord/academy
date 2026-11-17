"""Copy the module's shared files byte-identical into every lesson that uses them, or check the copies.

Usage, from anywhere:
    python3 -I shared_files.py sync    # copy each master over its copies, then check
    python3 -I shared_files.py check   # print the sha256 of every master and copy; exit 1 on any problem

Two kinds of shared material (design #45, sections 3 and 4):
- the legacy codebase parcel-desk, a whole tree. Its master is
  03-characterization-tests/checks/data/legacy/, the first lesson whose grader needs a pristine copy. It is
  copied into every lesson's starter/ and into checks/data/legacy/ of the later lessons whose graders build
  runs from pristine files. In a starter the codebase shares the root with lesson files (tests/, CLAUDE.md,
  transcript.md), so only the codebase's own top-level entries are compared there, and each of its
  directories must hold exactly the master's files. A checks/data/legacy/ copy must equal the master tree.
- single files that later lessons repeat: starter test files ("tests as in L3"), L4's given net and its goldens
  in L5's starter, and the grader libraries legacy_static.py, char_runner.py and char_bootstrap.py, whose master
  is in L3's checks/;
- reference copies: the starter files a checks/reference/ keeps unchanged, so a reference run starts from
  exactly the files the learner gets, and the given L4 net in L4's checks/data/given-net/, which stage 0 compares
  the learner's net with.

Why the masters live in lessons and not in a module-level directory: `pnpm content:validate` reports every
subdirectory of a module that module.yaml does not list as a lesson.

sync never deletes anything: a stray file in a copy is reported by check and removed by hand.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

MODULE = Path(__file__).resolve().parent
L1, L2, L3, L4, L5 = ("01-analysis", "02-agent-memory", "03-characterization-tests", "04-safe-refactoring",
                      "05-gradual-rollout")

LEGACY_MASTER = MODULE / L3 / "checks" / "data" / "legacy"
# Copies that hold only the codebase, compared as whole trees.
LEGACY_TREE_COPIES = [MODULE / lesson / "checks" / "data" / "legacy" for lesson in (L4, L5)]
# Starters, where the codebase sits next to lesson files.
LEGACY_STARTER_COPIES = [MODULE / lesson / "starter" for lesson in (L1, L2, L3, L4, L5)]

# (master lesson, path inside the lesson, [target lessons]); the path is the same in every target.
L4_NET_FILES = ["starter/tests/test_quote_characterization.py", "starter/tests/golden/quote_command_output.json",
                "starter/tests/golden/quote_zone_one_services.json", "starter/tests/golden/quote_zones_two_three.json"]
SHARED_FILES: list[tuple[str, str, list[str]]] = [
    (L2, "starter/tests/__init__.py", [L3, L4, L5]),
    (L2, "starter/tests/test_smoke.py", [L3, L4, L5]),
    (L3, "starter/tests/golden.py", [L4, L5]),
    # The stage-0 and runner libraries of characterization-net, quote-net and pricing-extracted (design 5.1, 5.2).
    (L3, "checks/legacy_static.py", [L4]),
    (L3, "checks/char_runner.py", [L4]),
    (L3, "checks/char_bootstrap.py", [L4]),
    # L5's starter repeats L4's given net and its goldens (design section 4).
    *[(L4, path, [L5]) for path in L4_NET_FILES],
]
L5_BASE_FILES = ["tests/__init__.py", "tests/test_smoke.py", "tests/golden.py",
                 *[path.removeprefix("starter/") for path in L4_NET_FILES],
                 "docs/rollout-plan.md", "patches/sample-good.diff", "patches/sample-bad.diff"]
# (master lesson, master path, target lesson, target path): a reference keeps the starter files it does not
# change, so a reference run starts from exactly what the learner gets.
REFERENCE_COPIES: list[tuple[str, str, str, str]] = [
    *[(L2, f"starter/tests/{name}", L3, f"checks/reference/tests/{name}") for name in ("__init__.py", "test_smoke.py")],
    (L3, "starter/tests/golden.py", L3, "checks/reference/tests/golden.py"),
    *[(L2, f"starter/tests/{name}", L4, f"checks/reference/tests/{name}") for name in ("__init__.py", "test_smoke.py")],
    (L3, "starter/tests/golden.py", L4, "checks/reference/tests/golden.py"),
    # The reference keeps the given net byte-identical and closes the holes in its own file (student rerun b3).
    *[(L4, path, L4, path.replace("starter/", "checks/reference/", 1)) for path in L4_NET_FILES],
    # Both L4 checks run the given net from this pristine copy in its own process, and stage-0 rule N1 compares
    # the learner's given files with it (student reruns b2 and b3).
    *[(L4, path, L4, path.replace("starter/", "checks/data/given-net/", 1)) for path in L4_NET_FILES],
    (L3, "starter/tests/golden.py", L4, "checks/data/given-net/tests/golden.py"),
    (L2, "starter/tests/__init__.py", L4, "checks/data/given-net/tests/__init__.py"),
    # agent-gate builds each probe's base from checks/data/base/, the starter's non-codebase files. They follow the
    # L5 starter, which sync fills from the masters above first (list order is sync order).
    *[(L5, f"starter/{path}", L5, f"checks/data/base/{path}") for path in L5_BASE_FILES],
]

CACHE_NAMES = {"__pycache__"}
# Grader directories that must stay free of bytecode caches: the checks mount is copied as it is.
CHECKS_DIRS = [MODULE / lesson / "checks" for lesson in (L3, L4)]


def tree_files(root: Path) -> dict[str, Path]:
    """Every regular file under root by its POSIX path relative to root; caches are skipped."""
    found: dict[str, Path] = {}
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if CACHE_NAMES.intersection(relative.parts) or path.suffix == ".pyc":
            continue
        if path.is_file() and not path.is_symlink():
            found[relative.as_posix()] = path
    return found


def legacy_top_level() -> tuple[list[str], list[str]]:
    """The master's top-level files and directories, by name."""
    entries = sorted(LEGACY_MASTER.iterdir())
    return [e.name for e in entries if e.is_file()], [e.name for e in entries if e.is_dir()]


def starter_codebase_files(starter: Path) -> dict[str, Path]:
    """The files of a starter that belong to the codebase: its top-level files and directories."""
    top_files, top_dirs = legacy_top_level()
    found = {name: starter / name for name in top_files if (starter / name).is_file()}
    for directory in top_dirs:
        if (starter / directory).is_dir():
            found.update({f"{directory}/{rel}": path for rel, path in tree_files(starter / directory).items()})
    return found


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tree_digest(files: dict[str, Path]) -> str:
    """One sha256 over the sorted (relative path, file sha256) pairs, so equal digests mean equal trees."""
    summary = "".join(f"{rel}\0{digest(path)}\n" for rel, path in sorted(files.items()))
    return hashlib.sha256(summary.encode("utf-8")).hexdigest()


def caches_under(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*") if p.name in CACHE_NAMES or p.suffix == ".pyc")


def file_pairs() -> list[tuple[Path, Path]]:
    same_path = [(MODULE / master / rel, MODULE / lesson / rel) for master, rel, targets in SHARED_FILES
                 for lesson in targets]
    return same_path + [(MODULE / master / source, MODULE / lesson / target)
                        for master, source, lesson, target in REFERENCE_COPIES]


def sync() -> int:
    master_files = tree_files(LEGACY_MASTER)
    for root in LEGACY_TREE_COPIES + LEGACY_STARTER_COPIES:
        for rel, source in master_files.items():
            target = root / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source.read_bytes())
    for master, copy in file_pairs():
        copy.parent.mkdir(parents=True, exist_ok=True)
        copy.write_bytes(master.read_bytes())
    return check()


def compare_tree(label: Path, master_files: dict[str, Path], copy_files: dict[str, Path]) -> list[str]:
    problems = []
    name = label.relative_to(MODULE)
    for rel in sorted(master_files.keys() - copy_files.keys()):
        problems.append(f"missing: {name}/{rel}")
    for rel in sorted(copy_files.keys() - master_files.keys()):
        problems.append(f"not in the master: {name}/{rel}")
    for rel in sorted(master_files.keys() & copy_files.keys()):
        if copy_files[rel].read_bytes() != master_files[rel].read_bytes():
            problems.append(f"differs from the master: {name}/{rel}")
    return problems


def check() -> int:
    problems: list[str] = []
    master_files = tree_files(LEGACY_MASTER)
    print(f"parcel-desk master {LEGACY_MASTER.relative_to(MODULE)}: {len(master_files)} files, "
          f"tree sha256 {tree_digest(master_files)}")
    for rel, path in master_files.items():
        print(f"  {digest(path)}  {rel}")
    copies = [(root, tree_files(root) if root.is_dir() else {}) for root in LEGACY_TREE_COPIES]
    copies += [(root, starter_codebase_files(root) if root.is_dir() else {}) for root in LEGACY_STARTER_COPIES]
    for root, copy_files in copies:
        found = compare_tree(root, master_files, copy_files)
        problems += found
        print(f"copy {root.relative_to(MODULE)}: tree sha256 {tree_digest(copy_files)} "
              f"{'ok' if not found else 'PROBLEM'}")
    for root in [LEGACY_MASTER] + LEGACY_TREE_COPIES + LEGACY_STARTER_COPIES + CHECKS_DIRS:
        if root.is_dir():
            problems += [f"cache file: {p.relative_to(MODULE)}" for p in caches_under(root)]
    for master, copy in file_pairs():
        if not copy.is_file():
            problems.append(f"missing: {copy.relative_to(MODULE)}")
            continue
        same = copy.read_bytes() == master.read_bytes()
        if not same:
            problems.append(f"differs from {master.relative_to(MODULE)}: {copy.relative_to(MODULE)}")
        print(f"file {copy.relative_to(MODULE)}: sha256 {digest(copy)} {'ok' if same else 'PROBLEM'}")
    for line in problems:
        print(line)
    print(f"shared files: {len(copies)} codebase copies, {len(file_pairs())} file copies, "
          f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    commands = {"sync": sync, "check": check}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        print(__doc__)
        sys.exit(2)
    sys.exit(commands[sys.argv[1]]())
