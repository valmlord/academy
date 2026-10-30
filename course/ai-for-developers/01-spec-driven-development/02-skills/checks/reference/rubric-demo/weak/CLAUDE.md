# invoice-service

- Tests: `PYTHONPATH=src python3 -m unittest discover -s tests -t .` from the repository root.
  No `-I` on that call: isolated mode ignores `PYTHONPATH` and every test module fails to import.
- The Stop hook in `.claude/settings.json` runs the same command before a turn ends.
- To verify a change, use the `verify` skill; releases go through `/release`, started by a human only.
- Never release on Fridays.
- Never release from a red build.
- Money is integer cents; never introduce floats into amounts.
