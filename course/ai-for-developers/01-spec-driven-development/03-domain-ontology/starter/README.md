# invoice-service

Small internal service that stores invoices and serves them over HTTP (`GET /invoices`). Python
3.10+, standard library only at runtime.

## Everyday commands

| Command | What it does |
|---|---|
| `make test` | `PYTHONPATH=src python3 -m unittest discover -s tests -t .`: the whole suite. `tests/test_api.py` sets `APP_ENV=test`, which loads `tests/fixtures/invoices.json` into a fresh in-memory database. |

## Late fees

`src/invoices/late_fee.py` computes the late fee of an overdue invoice. The policy is
`docs/late-fee.md`.
