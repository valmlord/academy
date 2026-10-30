#!/usr/bin/env python3
"""Stop hook: run the test suite and keep Claude working while it is red."""

import json
import os
import re
import subprocess
import sys

TEST_COMMAND = ["-m", "unittest", "discover", "-s", "tests", "-t", "."]
# Below the 20 s the check gives a probe and the 30 s registration floor.
TEST_TIMEOUT_SEC = 15
ZERO_TESTS = re.compile(r"^Ran 0 tests", re.MULTILINE)


def stop_hook_active() -> bool:
    """A missing key or stdin that is not a JSON object counts as false."""
    try:
        payload = json.loads(sys.stdin.read())
    except ValueError:
        return False
    return isinstance(payload, dict) and payload.get("stop_hook_active", True) is True


def block(reason: str) -> int:
    print(json.dumps({"decision": "block", "reason": reason}))
    return 0


def main() -> int:
    if stop_hook_active():
        return 0
    root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    # No -I on the child: -I ignores PYTHONPATH, and invoices under src/ would stop importing.
    env = {**os.environ, "PYTHONPATH": os.path.join(root, "src")}
    try:
        run = subprocess.run([sys.executable, *TEST_COMMAND], cwd=root, env=env, capture_output=True,
                             text=True, timeout=TEST_TIMEOUT_SEC)
    except subprocess.TimeoutExpired:
        return block(f"The test suite did not finish within {TEST_TIMEOUT_SEC} s.")
    output = run.stderr + run.stdout
    if ZERO_TESTS.search(output):
        return block("No tests ran, which is not green:\n" + output)
    if run.returncode != 0:
        return block("Tests are red. Fix them before finishing:\n" + output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
