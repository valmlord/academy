#!/usr/bin/env python3
"""PreToolUse hook for Edit and Write: keep hand edits out of src/invoices/generated/."""

import sys


def main() -> int:
    payload = sys.stdin.read()
    # TODO: parse the JSON payload, take tool_input.file_path, decide whether to block.
    return 0


if __name__ == "__main__":
    sys.exit(main())
