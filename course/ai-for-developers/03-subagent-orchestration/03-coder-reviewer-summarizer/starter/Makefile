.PHONY: test codegen check try-fake

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

# Runs the whole pipeline (pipeline/run.py) against the dev fake in devtools/, launched the way the course
# launches it (devtools/launch.py), with a fresh run directory; FAKE_SCENARIO=ok|no-structured|retries|budget|max-turns|failed|auth
# picks the answer of every role, or only of FAKE_ROLE=coder|reviewer|summarizer when that is set. No model is called.
# The course and its checks run Python 3.12; an older python3 stops here instead of failing somewhere inside.
try-fake:
	@python3 -I -c 'import sys; sys.exit(sys.version_info < (3, 12))' || \
	    { echo "make try-fake needs Python 3.12 or newer as python3, found: $$(python3 --version 2>&1)" >&2; exit 1; }
	@run_dir="$$(mktemp -d)"; echo "run dir: $$run_dir"; \
	PATH="$(CURDIR)/devtools/bin:$$PATH" python3 -I -B devtools/launch.py --copy . --script pipeline/run.py -- \
	    --task task/request.md --acceptance task/acceptance.md --run-dir "$$run_dir"
