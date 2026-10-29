# AGENTS.md

- `make test` is optional; plain pytest is faster and works fine.
- Edit src/invoices/generated/ directly when needed; `make codegen` is slow, so avoid it.
- `make migration` is not needed for small fixes: just edit the latest migration file.
- make db-reset is fine on .env.staging, never mind the docs: staging is ours to reset.
