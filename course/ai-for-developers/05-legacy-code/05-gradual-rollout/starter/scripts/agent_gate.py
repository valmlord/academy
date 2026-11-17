"""Gate for patches an agent proposes to parcel-desk.

Run from the repository root:

    python3 -I -B scripts/agent_gate.py <patch>

Exit 0 accepts the patch. Exit 1 rejects it, and the first line of stdout is `REJECT R<n>: <reason>`.
Any other exit code is a gate error. The patch is `git diff --no-renames` output against this repository.
The rules R1-R5 are in task.md. Only the standard library is used, and the gate is this one file.

The helpers below are ready. decide() and main() are yours.
"""

import re
import shutil
import subprocess
import sys
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


def decide(patch_text: str, repo: Path) -> tuple[bool, str, str]:
    """Return (accepted, rule, reason): (True, "", "") to accept, or (False, "R<n>", why) to reject.

    patch_text is the text of the patch, repo the repository root (a Path) the patch is meant for.
    The patch must not change repo itself: apply it only to copies made with copy_repo.
    """
    raise NotImplementedError("TODO: implement the rules R1-R5")


def main() -> int:
    print("TODO: implement decide() and main()")
    return 2


if __name__ == "__main__":
    sys.exit(main())
