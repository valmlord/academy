#!/usr/bin/env python3
"""PostToolUse hook for Edit and Write: we prefer ruff's style, so format the one Python file just edited. Never blocks."""

import json
import subprocess
import sys

FORMAT_TIMEOUT_SEC = 10


def main() -> int:
    payload = json.loads(sys.stdin.read())
    file_path = payload.get("tool_input", {}).get("file_path", "")
    if file_path.endswith(".py"):
        subprocess.run(["ruff", "format", file_path], capture_output=True, timeout=FORMAT_TIMEOUT_SEC)
    return 0


if __name__ == "__main__":
    sys.exit(main())
