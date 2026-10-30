#!/usr/bin/env python3
"""Stop hook: run the test suite and keep Claude working while it is red."""

import sys


def main() -> int:
    payload = sys.stdin.read()
    # TODO: read stop_hook_active from the payload, run the tests from $CLAUDE_PROJECT_DIR,
    # block with the names of the failing tests in the reason, allow on green.
    return 0


if __name__ == "__main__":
    sys.exit(main())
