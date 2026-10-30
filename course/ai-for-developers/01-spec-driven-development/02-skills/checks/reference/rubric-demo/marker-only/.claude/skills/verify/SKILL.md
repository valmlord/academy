---
name: verify
description: "Verify a change in invoice-service by running the unit tests."
---
Run `PYTHONPATH=src python3 -m unittest discover -s tests -t .`; fail on "Ran 0 tests"; no expectedFailure.
