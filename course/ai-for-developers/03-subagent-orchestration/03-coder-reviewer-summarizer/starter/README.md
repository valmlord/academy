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
| `make try-fake` | Runs `pipeline/run.py` (Coder -> Reviewer -> Summarizer) against the dev fake in `devtools/`, with a fresh run directory it prints first. `FAKE_SCENARIO=ok\|no-structured\|retries\|budget\|max-turns\|failed\|auth` picks every role's answer; add `FAKE_ROLE=coder\|reviewer\|summarizer` to apply it to that role only. Needs `python3` 3.12. No model is called. |

## Where things are

- `src/invoices/`: billing. `api.py` (HTTP handler), `repository.py` (the database), `statement.py`
  (statement lines with the late fee), `late_fee.py`, `money.py`, `export_csv.py`, `export_json.py`
  and `legacy_format.py` (the partner CSV export).
- `src/ledger/`: accounting (chart of accounts, postings, reports). `src/shared/`: code both may use.
- `scripts/`: tooling. `tests/`: the unittest suite.
- `.claude/settings.json`: project settings of Claude Code (permissions, hooks).
- `.claude/agents/`: the project subagents `code-reviewer` (read-only) and `coder`.
- `pipeline/`: the review pipeline that calls roles through headless Claude Code.
  - `roles.json`: model and spend cap per role;
  - `contracts/<role>.md`: the role's contract (goal, output format, boundaries);
  - `contracts/<role>.schema.json`: the role's output schema;
  - `claude_call.py`: `call_role` and `call_role_with_result`, one role call;
  - `run.py`: the pipeline, one call per role, with the handoff log and the report.
- `task/`: the task for the coder (`request.md`) and the acceptance criteria (`acceptance.md`).
- `docs/pipeline-brief.md`: the output shapes of the roles and the failure kinds of a call.
- `devtools/`: the dev fake `claude` and `launch.py`, used by `make try-fake`.
- `work/`: where the coder's change (its diff) lands; ignored by git.
