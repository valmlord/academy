.PHONY: test check typecheck codegen

test:
	PYTHONPATH=src python3 -m unittest discover -s tests -t .

# Deterministic: the AST import linter, never a claude -p review.
check: test
	python3 scripts/check_architecture.py .

typecheck:
	mypy --strict src

codegen:
	python3 scripts/codegen.py schema/invoice.schema.json src/invoices/generated
