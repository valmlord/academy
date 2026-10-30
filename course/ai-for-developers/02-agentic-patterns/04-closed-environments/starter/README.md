# invoice-service

Small internal service that stores invoices, serves them over HTTP (`GET /invoices`) and prints
customer statements. Python 3.10+, standard library only at runtime.

## Everyday commands

| Command | What it does |
|---|---|
| `make test` | `PYTHONPATH=src python3 -m unittest discover -s tests -t .`: the whole suite. `tests/test_api.py` sets `APP_ENV=test`, which reads `tests/fixtures/invoices.json`. |
| `make codegen` | Regenerates `src/invoices/generated/` from `schema/invoice.schema.json`. |
| `make check` | The suite, the architecture rules A1-A3 (`scripts/check_architecture.py`) and the dependency gate D1 (`scripts/check_deps.py`). |

## Where things are

- `src/invoices/`: billing. `api.py` (HTTP handler), `repository.py` (the database), `statement.py`
  (statement lines with the late fee), `late_fee.py`, `money.py` (`format_cents`), `export_csv.py`
  and `legacy_format.py` (the partner CSV export).
- `src/ledger/`: accounting (chart of accounts, postings).
- `scripts/`: tooling. `tests/`: the unittest suite.
- `docs/contour-brief.md`: the bank's closed-contour requirements for this repository.
- `launcher.env`: the bank profile that the team's launcher and login shells load.
- `.claude/settings.json`: project settings of Claude Code (hooks, permissions, sandbox).
- `home/.claude/settings.json`: stands for `~/.claude/settings.json`, the user settings of a team machine.
