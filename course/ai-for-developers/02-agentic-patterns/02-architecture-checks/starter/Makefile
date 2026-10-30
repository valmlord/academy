.PHONY: test codegen

# unittest needs src/ on the path; tests/__init__.py makes discover -t . import the test package.
test:
	PYTHONPATH=src python3 -m unittest discover -s tests -t .

# Output directory is wiped and rewritten on every run.
codegen:
	python3 scripts/codegen.py schema/invoice.schema.json src/invoices/generated
