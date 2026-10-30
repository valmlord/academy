#!/usr/bin/env python3
"""PreToolUse hook for Edit and Write: we prefer logging, so block any edit that adds print(."""

import json
import sys

BLOCK_EXIT_CODE = 2


def main() -> int:
    payload = json.loads(sys.stdin.read())
    tool_input = payload.get("tool_input", {})
    new_text = tool_input.get("new_string") or tool_input.get("content") or ""
    if "print(" in new_text:
        print('Blocked: edits containing "print(" are not allowed in this repository. Use logging.', file=sys.stderr)
        return BLOCK_EXIT_CODE
    return 0


if __name__ == "__main__":
    sys.exit(main())
