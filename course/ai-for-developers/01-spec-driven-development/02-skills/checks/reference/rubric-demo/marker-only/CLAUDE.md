# invoice-service

Internal HTTP service that stores invoices; it handles money, so mistakes are expensive.

## Layout

- `src/invoices/`: `api.py` HTTP handler, `repository.py` database access, `models.py` dataclasses,
  `service.py` validation and serialization, `late_fee.py` late fee calculation.
- `tests/`: unit tests. `docs/`: policies.

## Commands

- Tests: `PYTHONPATH=src python3 -m unittest discover -s tests -t .` from the repository root.
- The Stop hook in `.claude/settings.json` runs the same command before a turn ends.
- Before saying a change is done, use the `verify` skill. Releases: `/release`, started by a human only.

## Code style

- Type hints everywhere, dataclasses for data, short functions, descriptive names, PEP 8.
- Line length 100 (see `pyproject.toml`). No global state. Docstrings for public functions.
- English for code and comments; polite commit messages.
