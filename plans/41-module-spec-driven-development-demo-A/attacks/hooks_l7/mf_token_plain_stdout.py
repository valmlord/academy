#!/usr/bin/env python3
"""Stop hook: run the test suite, then the artifact linter, and keep Claude working while either is red."""

import json
import os
import re
import subprocess
import sys

TEST_COMMAND = ["-m", "unittest", "discover", "-s", "tests", "-t", "."]
LINTER = os.path.join("scripts", "check_artifacts.py")
# Tests and linter together stay below the 20 s the check gives a probe.
TEST_TIMEOUT_SEC = 12
LINTER_TIMEOUT_SEC = 6
ZERO_TESTS = re.compile(r"^Ran 0 tests", re.MULTILINE)


def stop_hook_active() -> bool:
    """A missing key or stdin that is not a JSON object counts as false."""
    try:
        payload = json.loads(sys.stdin.read())
    except ValueError:
        return False
    return isinstance(payload, dict) and payload.get("stop_hook_active") is True


def block(reason: str) -> int:
    print(json.dumps({"decision": "block", "reason": reason}))
    return 0


def run(command: list[str], root: str, env: dict[str, str], timeout: int) -> subprocess.CompletedProcess[str] | None:
    try:
        return subprocess.run(command, cwd=root, env=env, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None


def main() -> int:
    if stop_hook_active():
        return 0
    root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    # No -I on the test child: -I ignores PYTHONPATH, and invoices under src/ would stop importing.
    env = {**os.environ, "PYTHONPATH": os.path.join(root, "src")}
    tests = run([sys.executable, *TEST_COMMAND], root, env, TEST_TIMEOUT_SEC)
    if tests is None:
        return block(f"The test suite did not finish within {TEST_TIMEOUT_SEC} s.")
    output = tests.stderr + tests.stdout
    if ZERO_TESTS.search(output):
        return block("No tests ran, which is not green:\n" + output)
    if tests.returncode != 0:
        return block("Tests are red. Fix them before finishing:\n" + output)
    linter = run([sys.executable, "-I", os.path.join(root, LINTER), root], root, env, LINTER_TIMEOUT_SEC)
    if linter is None:
        return block(f"The artifact linter did not finish within {LINTER_TIMEOUT_SEC} s.")
    if linter.returncode != 0:
        print(linter.stdout + linter.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
