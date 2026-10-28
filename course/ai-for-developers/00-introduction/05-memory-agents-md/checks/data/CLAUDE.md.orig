# CLAUDE.md - invoice-service

IMPORTANT!!! ALWAYS WRITE CLEAN CODE. THIS IS A PRODUCTION SERVICE.

## About the project

invoice-service is our modern, cloud-native, best-in-class invoicing microservice. It powers the
billing experience for thousands of happy customers and is a key part of our digital transformation
journey. The service is designed with scalability, reliability and developer happiness in mind.
We believe that great invoicing is the foundation of great customer relationships.

Our mission: make invoicing delightful. Our values: quality, ownership, customer obsession.

The service stores invoices and serves them over HTTP. It exposes `GET /invoices` and
`GET /invoices/<id>`. It is written in Python 3.10+ and uses only the standard library at runtime.

## Architecture

The service follows a clean, layered architecture:

- The API layer (`src/invoices/api.py`) parses HTTP requests and returns responses.
- The service layer (`src/invoices/service.py`) contains business rules such as status validation.
- The repository layer (`src/invoices/repository.py`) talks to SQLite.
- The models (`src/invoices/models.py`) are frozen dataclasses.
- The generated layer (`src/invoices/generated/`) contains schema-derived types.

Data flows from the API layer to the service layer to the repository layer and back. Each layer
only talks to the layer directly below it. This separation of concerns keeps the code maintainable
and testable. Please respect the layering when adding new features.

## Directory structure

```
invoice-service/
├── Makefile
├── README.md
├── pyproject.toml
├── schema/
│   └── invoice.schema.json
├── scripts/
│   ├── codegen.py
│   ├── db_reset.py
│   └── new_migration.py
├── src/
│   └── invoices/
│       ├── __init__.py
│       ├── api.py
│       ├── models.py
│       ├── repository.py
│       ├── service.py
│       └── generated/
│           ├── __init__.py
│           └── invoice_schema.py
├── db/
│   └── migrations/
│       ├── 0001_create_invoices.sql
│       └── 0002_add_status.sql
└── tests/
    ├── fixtures/
    │   └── invoices.json
    └── test_api.py
```

## Code style

- Lines must not be longer than 100 characters.
- Imports must be sorted: standard library first, then third-party, then local.
- Use type hints everywhere. Prefer `str | None` over `Optional[str]`.
- Use f-strings, not `%` formatting or `.format()`.
- Function and variable names are snake_case, classes are PascalCase.
- Do not leave unused imports or unused variables.
- Avoid mutable default arguments.
- Prefer early returns over deep nesting.
- Write docstrings for public functions.
- Keep functions short and focused.
- ALWAYS follow PEP 8.
- NEVER write messy code.

## Testing

We take testing very seriously. Every change must be tested.

Run the tests with:

```
pytest
```

Tests live in `tests/`. Test names should describe behaviour. Use plain `assert` statements.
Fixtures live in `tests/fixtures/`. Keep tests fast and independent.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /invoices | List invoices, optional `?status=` filter |
| GET | /invoices/<id> | Get a single invoice |

Valid statuses are `draft`, `sent` and `paid`. An unknown status returns 400.

## Data model

An invoice has an id, a customer, an amount in cents, a currency (EUR or USD), a status and an
issue date. Amounts are always stored in cents as integers to avoid floating point problems.
Currencies are ISO 4217 codes. Dates are ISO 8601 strings in the database.

## Database

We use SQLite. The database file is configured with the `INVOICES_DB` environment variable.
Environment files (`.env`, `.env.example`) hold local settings. Copy `.env.example` to `.env`.

## Git workflow

- Create a feature branch for every change.
- Write meaningful commit messages.
- Open a pull request and ask for review.
- Keep pull requests small.
- Rebase on main before merging.

## How to behave

- You are a senior Python engineer with 20 years of experience.
- Think step by step.
- Be careful and thorough.
- IMPORTANT: Double-check everything.
- CRITICAL: Never break production.
- Always explain what you are doing.
- Be concise but complete.
- Write high-quality, idiomatic, production-ready code.
- Don't be lazy.

## README (copied for convenience)

invoice-service: small internal service that stores invoices and serves them over HTTP.
Python 3.10+, standard library only at runtime.

The service exposes two endpoints for listing and fetching invoices. Statuses: draft, sent, paid.
Amounts are in cents. Currencies: EUR and USD.

## Performance

- The list endpoint returns all invoices; this is fine for our current volumes.
- SQLite is fast enough for our needs. Do not prematurely optimize.
- Use indexes wisely.

## Security

- Never log secrets.
- Validate all input.
- Use parameterized SQL queries, never string concatenation.
- Keep dependencies up to date.

## Documentation

- Keep the README up to date.
- Document every public function.
- Update this file when the architecture changes.

## Final reminders

IMPORTANT!!! Write clean code. Test everything. Follow the style guide. Respect the layering.
Remember: quality is everyone's responsibility!!!
