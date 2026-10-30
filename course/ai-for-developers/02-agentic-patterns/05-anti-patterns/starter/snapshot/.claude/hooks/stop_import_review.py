#!/usr/bin/env python3
"""Stop hook: ask a model whether the change breaks the import direction between ledger and invoices."""

import json
import subprocess
import sys

PROMPT = (
    "You review import directions. Rule: no file under src/ledger/ may import from invoices. "
    "Here is the diff of this session. Answer exactly OK if the rule holds, otherwise list the violations."
)
REVIEW_TIMEOUT_SEC = 240


def main() -> int:
    payload = json.loads(sys.stdin.read())
    if payload.get("stop_hook_active"):
        return 0
    diff = subprocess.run(["git", "diff", "HEAD"], capture_output=True, text=True).stdout
    review = subprocess.run(
        ["claude", "-p", PROMPT, "--model", "opus"],
        input=diff, capture_output=True, text=True, timeout=REVIEW_TIMEOUT_SEC,
    )
    answer = review.stdout.strip()
    if answer != "OK":
        print(json.dumps({"decision": "block", "reason": "Import review: " + answer}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
