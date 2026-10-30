---
name: verify
description: "Verification skill for the invoice-service repository."
license: MIT
---

# Verify

1. From the repository root run `PYTHONPATH=src python3 -m unittest discover -s tests -t .`
2. The last line must say `OK`. `Ran 0 tests` is a failure.
3. Fix the code, not the test. Never change an expected value and never add `skip`, `skipIf`,
   `skipUnless` or `expectedFailure` to get a green run.
