# invoice-service

Small internal service that stores invoices and serves them over HTTP (`GET /invoices`,
`GET /invoices/<id>`). Python 3.10+, standard library only at runtime.

## Everyday commands

| Command | What it does |
|---|---|
| `make test` | Runs the test suite with `APP_ENV=test`, which loads `tests/fixtures/invoices.json` into a fresh in-memory database. Running `pytest` directly uses the developer database instead, and the fixture-dependent tests fail. |
| `make lint` | `ruff check` with the rules in `pyproject.toml`. |
| `make codegen` | Regenerates `src/invoices/generated/` from `schema/invoice.schema.json`. Files in `generated/` are overwritten on every run, so edit the schema, not the generated code. |
| `make migration name=<snake_case>` | Creates the next numbered file in `db/migrations/`. Migrations are append-only: an applied migration is never edited, a fix is a new migration. |
| `make db-reset` | Drops and recreates the database named in `ENV_FILE` (default `.env`). |

## Environments

`.env` points at your local database. `.env.staging` points at the **shared** staging database that
the whole team and the QA bots use. `make db-reset ENV_FILE=.env.staging` wipes it for everyone; it has
happened twice, and restoring took half a day each time.

## How we run the agent on our laptops

`make agent` starts Claude Code in the repository root without permission prompts, so it never
stops to ask. Project rules for the agent live in the project settings file and `CLAUDE.md`.
