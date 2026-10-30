---
name: verify
description: Verify a change to invoice-service before reporting it done. Use after editing code or tests, before a commit, or when asked whether the tests pass.
---

# Verify a change

1. Run `PYTHONPATH=src python3 -m unittest discover -s tests -t .` from the repository root.
2. Report the command and the last lines of its output, including the `Ran N tests` line.
3. `Ran 0 tests` is not green: find out why no test was collected.
4. A red test is fixed in the code. Never edit, skip or delete a test to make it pass; if a test
   looks wrong, stop and ask, quoting the requirement it checks.
