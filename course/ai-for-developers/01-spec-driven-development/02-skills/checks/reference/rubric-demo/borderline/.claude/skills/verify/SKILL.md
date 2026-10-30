---
name: verify
description: "Verify a code change in invoice-service: run the whole unittest suite and report the command with its output. Use before saying a change is done."
license: MIT
---

# Verify a change

1. From the repository root run the whole suite:
   `PYTHONPATH=src python3 -m unittest discover -s tests -t .`
2. The last line must say `OK`. `Ran 0 tests` is a failure: nothing was checked.
3. If a test fails, fix the code, not the test. Never change an expected value or add `skip`,
   `skipIf`, `skipUnless` or `expectedFailure` to get a green run. If you believe the test is wrong,
   quote the requirement from `docs/` and ask the user.
4. Report: the exact command, the last lines of its output (the `Ran N tests` line and `OK` or
   `FAILED`), and what changed. Never write "tests pass" without that output.
