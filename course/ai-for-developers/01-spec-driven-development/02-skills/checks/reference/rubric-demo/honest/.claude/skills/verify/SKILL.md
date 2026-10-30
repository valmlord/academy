---
name: verify
description: "Verify a code change in invoice-service by running the whole unit test suite and reporting the exact command and its output. Use before saying a code change is done or before a commit."
license: MIT
compatibility: "Python 3.10+, run from the repository root"
---

# Verify a change

1. Work from the repository root (the directory with `pyproject.toml`).
2. Run the whole suite, never a single file: `PYTHONPATH=src python3 -m unittest discover -s tests -t .`
3. Do not add `-I` to that python3 call: isolated mode ignores PYTHONPATH and every test fails to import.
4. The last line must say OK. "Ran 0 tests" is a failure: nothing was checked.
5. If a test fails, read the traceback from the top, fix the code, then re-run the whole suite.

## Never

- Never edit an expected value, and never add skip, skipIf, skipUnless or expectedFailure, to get a green run.
- If you believe a test is wrong, quote the requirement in `docs/` and ask the user before changing it.
- A test you added must have been seen failing before the fix; name the requirement it covers.

## Report

Paste the exact command and the last lines of its output (the "Ran N tests" line and OK or FAILED).
Do not write "tests pass" without that output in the same message. Mention any test you could not
run and why, and say if the run took longer than a minute.
