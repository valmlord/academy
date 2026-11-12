# invoice-service

Small internal service that stores invoices, serves them over HTTP (`GET /invoices`) and prints
customer statements. Python 3.12 (the version the course pins and its checks run), standard library only
at runtime.

## Everyday commands

| Command | What it does |
|---|---|
| `make test` | `PYTHONPATH=src python3 -m unittest discover -s tests -t .`: the whole suite. `tests/test_api.py` sets `APP_ENV=test`, which reads `tests/fixtures/invoices.json`. |
| `make codegen` | Regenerates `src/invoices/generated/` from `schema/invoice.schema.json`. |
| `make check` | The suite, the architecture rules A1-A3 (`scripts/check_architecture.py`) and the dependency gate D1 (`scripts/check_deps.py`). |
| `make trace` | One row per tool call of the recorded run in `trace/`: line, agent path, tool, input. Needs `attribute()` in `trace/trace_tree.py`. |

## Where things are

- `src/invoices/`: billing. `api.py` (HTTP handler), `repository.py` (the database), `statement.py`
  (statement lines with the late fee), `late_fee.py`, `money.py`, `export_csv.py`, `export_json.py`
  and `legacy_format.py` (the partner CSV export). `totals.py`, `rounding.py` and `tax_rates.py` compute
  invoice totals (FIN-12).
- `src/ledger/`: accounting (chart of accounts, postings, reports). `src/shared/`: code both may use.
- `scripts/`: tooling. `tests/`: the unittest suite.
- `.claude/settings.json`: project settings of Claude Code (permissions, hooks).
- `agents.json`: the subagent definitions the recorded run was started with (`--agents`).
- `task/`: the change request, its acceptance criteria and the prompt of the recorded run.
- `run/`: what the recorded run left behind: the plan, the diff and the report.
- `trace/`: the recorded run (`review-run.ndjson`), how to read it and the role contracts (`README.md`), and
  `trace_tree.py`.
- `findings.json`: your bug-hunt report.
