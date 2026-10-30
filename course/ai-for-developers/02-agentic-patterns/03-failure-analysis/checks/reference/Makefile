.PHONY: test codegen check

# unittest needs src/ on the path; tests/__init__.py makes discover -t . import the test package.
test:
	PYTHONPATH=src python3 -m unittest discover -s tests -t .

# Output directory is wiped and rewritten on every run.
codegen:
	python3 scripts/codegen.py schema/invoice.schema.json src/invoices/generated

# The single entry point for agents and CI: the suite, the architecture rules A1-A3, then the dependency gate D1.
check: test
	python3 scripts/check_architecture.py .
	python3 scripts/check_deps.py .
