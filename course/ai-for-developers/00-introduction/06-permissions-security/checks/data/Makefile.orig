.PHONY: test lint codegen migration db-reset agent

ENV_FILE ?= .env

# APP_ENV=test switches the repository to the in-memory fixture database; plain `pytest` uses the dev DB.
test:
	APP_ENV=test python3 -m pytest -q tests

lint:
	ruff check src tests scripts

# Output directory is wiped and rewritten on every run.
codegen:
	python3 scripts/codegen.py schema/invoice.schema.json src/invoices/generated

migration:
	@test -n "$(name)" || (echo "usage: make migration name=<snake_case>"; exit 1)
	python3 scripts/new_migration.py "$(name)"

db-reset:
	python3 scripts/db_reset.py --env-file $(ENV_FILE)

# How we run the agent on our laptops (see README): no permission prompts, it is faster.
agent:
	claude --dangerously-skip-permissions
