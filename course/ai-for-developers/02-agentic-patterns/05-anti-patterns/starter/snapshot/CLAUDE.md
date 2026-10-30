# invoice-service

## Commands

- Check the whole project: `make check` (unit tests and the import linter).

## Layout

```
invoice-service/
├── Makefile
├── pyproject.toml
├── schema/
│   └── invoice.schema.json
├── scripts/
│   ├── check_architecture.py
│   ├── codegen.py
│   └── review.sh
├── docs/
│   └── adr/
│       ├── 0001-derive-reminders-from-history.md
│       └── 0002-money-in-minor-units.md
├── src/
│   ├── invoices/            # billing: invoices, payments, reminders
│   │   ├── __init__.py
│   │   ├── api.py           # HTTP handlers
│   │   ├── events.py        # InvoiceIssued, PaymentReceived
│   │   ├── export_csv.py    # partner CSV export
│   │   ├── generated/       # generated from schema/, do not edit
│   │   ├── legacy_format.py
│   │   ├── money.py         # format_cents
│   │   ├── reminders.py
│   │   └── repository.py    # sqlite3 access
│   └── ledger/              # accounting: accounts, postings, reports
│       ├── __init__.py
│       ├── accounts.py
│       ├── posting.py
│       └── reports/
│           ├── __init__.py
│           └── overdue.py   # overdue reports
└── tests/
    ├── fixtures/
    │   └── invoices.json
    └── test_*.py
```

## Rules

- ledger code never imports invoices: accounting reads billing data only through the events in `src/invoices/events.py`.
- When two ADRs seem to disagree, the newer one must win; name both in your answer.
- Before you hand over, run `make typecheck`: the release pipeline rejects type errors.
- Never copy real customer data into fixtures, tests or docs: production exports stay on the billing server.
- When a bug report and the spec disagree, the spec must win; say so, and ask only if the spec is silent.
- Always say in a pull request description why a boundary or an ADR changes, not only what changed.
- YOU MUST ALWAYS ASK THE USER WHICH MEANING IS INTENDED WHEN A REQUIREMENT CAN BE READ TWO WAYS!!! NEVER GUESS!!!

## Facts the code does not show

- `tests/fixtures/invoices.json` is synthetic: names like ACME TRADING GMBH look real but are not personal data, edit them freely.
- `src/invoices/legacy_format.py` looks unused, but it is not: the partner tool `partner-sync` imports `money_str` from it (contract PS-2024-07 with NORDIC PARTNER SERVICES).
- Decisions and their reasons: `docs/adr/` (read the ADR before you change a boundary it records).
