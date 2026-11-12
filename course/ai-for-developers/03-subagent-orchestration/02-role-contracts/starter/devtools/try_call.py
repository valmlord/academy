"""Call each role once through `call_role` against the dev fake and print what came back.

Run through `make try-fake`, which puts devtools/bin first on PATH so `claude` is the dev fake:

    make try-fake                                 # every role, scenario ok
    make try-fake ROLE=reviewer FAKE_SCENARIO=budget

The fake grades nothing: a clean run here only shows that `call_role` reads the answers.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
ROLES = ("coder", "reviewer", "summarizer")
PROMPTS = {
    "coder": "Fix the late fee rounding in src/invoices/late_fee.py.",
    "reviewer": "Review the change described in runs/latest/coder.diff.",
    "summarizer": "Summarise the review findings for the team lead.",
}


def main() -> int:
    sys.path[0:0] = [str(PROJECT / "pipeline"), str(PROJECT)]
    from claude_call import RoleCallError, call_role

    roles = sys.argv[1:] or list(ROLES)
    for role in roles:
        try:
            answer = call_role(role, PROMPTS.get(role, "Do your job."), PROJECT / "pipeline" / "roles.json", PROJECT)
        except RoleCallError as error:
            result = "None" if error.result is None else f"{error.result.get('subtype')} message"
            print(f"{role}: RoleCallError kind={error.kind} result={result} detail={error.detail}")
            continue
        print(f"{role}: returned {json.dumps(answer, ensure_ascii=False)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
