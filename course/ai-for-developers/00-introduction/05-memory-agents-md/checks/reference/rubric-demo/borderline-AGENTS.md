# AGENTS.md

- Run tests with `make test`: it sets APP_ENV=test and loads the fixtures; plain pytest hits the dev DB.
- Do not edit src/invoices/generated/ by hand; run `make codegen` to regenerate src/invoices/generated/.
- Add migrations with `make migration name=<snake_case>`.
- Never run db-reset with ENV_FILE=.env.staging: the staging DB is shared by the team.
- The API layer is in api.py, business rules in service.py, SQL in repository.py.
