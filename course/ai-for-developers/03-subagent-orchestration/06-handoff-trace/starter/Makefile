.PHONY: test codegen check trace

# tests/__init__.py puts src/ on the path; PYTHONPATH keeps older checkouts working.
test:
	PYTHONPATH=src python3 -m unittest discover -s tests -t .

# Output directory is wiped and rewritten on every run.
codegen:
	python3 scripts/codegen.py schema/invoice.schema.json src/invoices/generated

# The single entry point for agents and CI: the suite, the architecture rules A1-A3, then the dependency gate D1.
check: test
	python3 scripts/check_architecture.py .
	python3 scripts/check_deps.py .

# One row per tool call of the recorded run: line, agent path, tool, input (needs attribute() in trace/trace_tree.py).
trace:
	python3 trace/trace_tree.py trace/review-run.ndjson
