#!/usr/bin/env python3
"""PreToolUse hook for Edit and Write: keep hand edits out of src/invoices/generated/.

It fails closed: a payload it cannot read blocks the call (exit 2) instead of letting it through.
"""

import json
import os
import sys

BLOCK_EXIT_CODE = 2
PROTECTED_PARTS = ("src", "invoices", "generated")
REASON = "src/invoices/generated/ is generated code: change schema/invoice.schema.json and regenerate with make codegen"


def block(message: str) -> int:
    print(message, file=sys.stderr)
    return BLOCK_EXIT_CODE


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read())
        file_path = payload["tool_input"]["file_path"]
    except (ValueError, KeyError, TypeError):
        return block("protect_generated: unreadable hook input, blocking to stay safe (expected JSON with tool_input.file_path)")
    if not isinstance(file_path, str):
        return block("protect_generated: tool_input.file_path is not a string, blocking to stay safe")
    project = os.environ.get("CLAUDE_PROJECT_DIR") or str(payload.get("cwd", ""))
    target = os.path.normpath(os.path.join(project, file_path))
    relative = os.path.relpath(target, os.path.normpath(project)).split(os.sep)
    if tuple(relative[: len(PROTECTED_PARTS)]) == PROTECTED_PARTS and len(relative) > len(PROTECTED_PARTS):
        return block(f"Blocked edit of {file_path}: {REASON}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
