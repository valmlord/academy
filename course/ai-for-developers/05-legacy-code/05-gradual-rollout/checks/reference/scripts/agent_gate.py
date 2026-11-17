"""Gate for patches an agent proposes to parcel-desk.

Run from the repository root:

    python3 -I -B scripts/agent_gate.py <patch>

Exit 0 accepts the patch. Exit 1 rejects it, and the first line of stdout is `REJECT R<n>: <reason>`.
Any other exit code is a gate error. The patch is `git diff --no-renames` output against this repository.
The rules R1-R5 are in task.md. Only the standard library is used, and the gate is this one file.

Reference solution of L5 (hidden).
"""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# unittest writes "Ran 1 test in 0.001s" for one test and "Ran 12 tests in 0.050s" for more, to stderr.
RAN_LINE = re.compile(r"^Ran (\d+) tests? in ")
UNITTEST_COMMAND = ["-m", "unittest", "discover", "-s", "tests", "-t", "."]
# Two test runs (R4 and R5) must fit in the 60 seconds the check gives the gate for one patch.
UNITTEST_TIMEOUT_SECONDS = 25
GIT_TIMEOUT_SECONDS = 10
TIMED_OUT = -1


def copy_repo(repo: Path, destination: Path) -> Path:
    """Copy the repository at repo into destination (which must not exist yet) and return destination.

    Bytecode caches are left out. A .git directory is copied too, so git commands in the copy
    treat it as its own repository.
    """
    shutil.copytree(repo, destination, symlinks=True, ignore=shutil.ignore_patterns("__pycache__"))
    return Path(destination)


def git_apply_check(repo: Path, patch_path: Path) -> int:
    """Run `git apply --check <patch>` in repo and return git's exit code; nothing is changed.

    git exits 0 when the patch applies, 1 when a hunk does not apply, and 128 when the patch is corrupt.
    """
    return _git(repo, ["apply", "--check", str(Path(patch_path).resolve())])


def git_apply(repo: Path, patch_path: Path) -> int:
    """Apply the patch to the files in repo and return git's exit code (0 when it applied)."""
    return _git(repo, ["apply", str(Path(patch_path).resolve())])


def run_unittest(repo: Path) -> tuple[int, int]:
    """Run `python3 -m unittest discover -s tests -t .` in repo; return (exit code, number of tests run).

    The number is read from the stderr line `Ran N test in ...` or `Ran N tests in ...`; it is 0 when
    that line is missing (for example when the run crashed). unittest exits 5 with `NO TESTS RAN` when it
    found no test. The exit code is TIMED_OUT when the run did not finish in UNITTEST_TIMEOUT_SECONDS.
    """
    try:
        done = subprocess.run([sys.executable, "-I", "-B", *UNITTEST_COMMAND], cwd=repo,
                              stdin=subprocess.DEVNULL, capture_output=True, text=True, errors="replace",
                              timeout=UNITTEST_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        return TIMED_OUT, 0
    counts = [int(found.group(1)) for found in map(RAN_LINE.match, done.stderr.splitlines()) if found]
    return done.returncode, (counts[-1] if counts else 0)


def _git(repo: Path, arguments: list[str]) -> int:
    try:
        done = subprocess.run(["git", *arguments], cwd=repo, stdin=subprocess.DEVNULL, capture_output=True,
                              text=True, errors="replace", timeout=GIT_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        return TIMED_OUT
    return done.returncode


BINARY_MARKERS = re.compile(r"^(?:GIT binary patch|Binary files .* differ)$", re.M)
ALLOWED_PREFIXES = ("shipping/", "docs/")
ALLOWED_FILES = ("README.md",)
TESTS_PREFIX = "tests/"
MAX_FILES = 5
MAX_CHANGED_LINES = 200


def changed_files(repo: Path, patch_path: Path) -> list[tuple[int, int, str]]:
    """(added, deleted, path) of every file in the patch, from git apply --numstat (paths as git reads them)."""
    done = subprocess.run(["git", "apply", "--numstat", "-z", str(patch_path)], cwd=repo, stdin=subprocess.DEVNULL,
                          capture_output=True, text=True, errors="replace", timeout=GIT_TIMEOUT_SECONDS)
    files = []
    for record in done.stdout.split("\0"):
        if not record.strip():
            continue
        added, deleted, path = record.split("\t", 2)
        files.append((int(added), int(deleted), path.strip("\n")))
    return files


def path_rule(repo: Path, path: str) -> str:
    """Why R2 refuses path, or an empty string when R2 allows it."""
    if path.startswith(TESTS_PREFIX):
        if (repo / path).exists():
            return f"{path} is an existing test file"
        return ""
    if path.startswith(ALLOWED_PREFIXES) or path in ALLOWED_FILES:
        return ""
    return f"{path} is outside shipping/, docs/, README.md and new files under tests/"


def tests_pass(copy: Path) -> tuple[bool, str]:
    code, count = run_unittest(copy)
    if code == 0 and count >= 1:
        return True, ""
    return False, f"unittest exit {code}, {count} test(s) run"


def decide(patch_text: str, repo: Path) -> tuple[bool, str, str]:
    """Return (accepted, rule, reason): (True, "", "") to accept, or (False, "R<n>", why) to reject."""
    if BINARY_MARKERS.search(patch_text):
        return False, "R1", "binary patch"
    with tempfile.TemporaryDirectory(prefix="agent-gate-") as scratch:
        patch_path = Path(scratch) / "change.diff"
        patch_path.write_text(patch_text, encoding="utf-8")
        check = git_apply_check(repo, patch_path)
        if check != 0:
            return False, "R1", f"git apply --check exit {check}"
        files = changed_files(repo, patch_path)
        if not files:
            return False, "R1", "the patch changes no file"
        for _added, _deleted, path in files:
            problem = path_rule(repo, path)
            if problem:
                return False, "R2", problem
        changed = sum(added + deleted for added, deleted, _path in files)
        if len(files) > MAX_FILES or changed > MAX_CHANGED_LINES:
            return False, "R3", f"{len(files)} files, {changed} changed lines"

        before = copy_repo(repo, Path(scratch) / "before-tests")
        if git_apply(before, patch_path) != 0:
            return False, "R1", "git apply failed on a copy"
        shutil.rmtree(before / "tests")
        shutil.copytree(repo / "tests", before / "tests", ignore=shutil.ignore_patterns("__pycache__"))
        passed, why = tests_pass(before)
        if not passed:
            return False, "R4", f"the tests from before the patch fail: {why}"

        after = copy_repo(repo, Path(scratch) / "after")
        if git_apply(after, patch_path) != 0:
            return False, "R1", "git apply failed on a copy"
        passed, why = tests_pass(after)
        if not passed:
            return False, "R5", f"the tests with the patch fail: {why}"
    return True, "", ""


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python3 -I -B scripts/agent_gate.py <patch>")
        return 2
    patch_text = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    accepted, rule, reason = decide(patch_text, Path.cwd())
    if accepted:
        print("ACCEPT")
        return 0
    print(f"REJECT {rule}: {reason}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
