# invoice-service

Small internal service that stores invoices and serves them over HTTP (`GET /invoices`). Python
3.10+, standard library only at runtime.

## Everyday commands

| Command | What it does |
|---|---|
| `make test` | `PYTHONPATH=src python3 -m unittest discover -s tests -t .`: the whole suite. `tests/test_api.py` sets `APP_ENV=test`, which reads `tests/fixtures/invoices.json`. |

## Where things are

- `docs/feature-brief.md`, `docs/spec.md`, `docs/tasks.md`, `docs/adr/`: the payment reminders feature.
- `GLOSSARY-MAP.md` and `docs/*/GLOSSARY.md`: the domain language of billing and ledger.
- `src/invoices/reminders.py`: `plan_reminders`, the seam of the feature.
- `vendor/mattpocock-skills/`: a reviewed copy of four skills by Matt Pocock, reading material only.
