# AGENTS.md

## Commands

- Run tests with `make test`, not plain `pytest`: it sets `APP_ENV=test`, which loads
  `tests/fixtures/invoices.json` into an in-memory DB. Plain `pytest` hits the dev DB and the
  fixture tests fail.
- Lint with `make lint` (ruff rules are in `pyproject.toml`; it reports style, no need to restate it).

## Generated code

- Never edit `src/invoices/generated/` by hand: `make codegen` rewrites `src/invoices/generated/` from `schema/invoice.schema.json` on every run, so hand edits are lost. Change the schema, then run `make codegen`.

## Migrations

- Migrations are append-only: never edit a file in `db/migrations/` that has been applied. Create
  the next one with `make migration name=<snake_case>`.

## Database

- Never run `make db-reset ENV_FILE=.env.staging`: db-reset wipes the staging DB shared by the whole team and the QA bots. Reset only your local DB with plain `make db-reset` (uses `.env`).
