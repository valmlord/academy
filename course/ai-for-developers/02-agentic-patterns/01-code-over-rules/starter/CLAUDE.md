# invoice-service

## Project

- [R01] Tests use unittest and the packages live under src/.
- [R02] Layout: src/invoices is billing, src/ledger is accounting, scripts/ is tooling, tests/ holds the tests.

## Commands

- [R03] Run the tests with `make test`; plain `python3 -m unittest` cannot import the packages.

## Rules

- [R04] IMPORTANT!!! late_fee takes the amount first and the days second. NEVER swap them.
- [R05] ledger must never import from invoices.
- [R06] Only src/invoices/repository.py may use sqlite3.
- [R07] Do not use invoices.legacy_format in new code, use invoices.money.format_cents (the partner CSV export keeps legacy_format).
- [R08] Never edit src/invoices/generated/; regenerate it with `make codegen`.
- [R09] Prefer early returns over nested ifs.
- [R10] Always run the tests before you say you are done.

## Data

- [R11] tests/fixtures/invoices.json is synthetic: the names look real but are not personal data, edit them freely.
- [R12] src/invoices/old_api.py is dead code; do not copy its patterns.
