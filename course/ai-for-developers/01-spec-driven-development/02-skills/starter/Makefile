.PHONY: test

# unittest needs src/ on the path; tests/__init__.py makes discover -t . import the test package.
test:
	PYTHONPATH=src python3 -m unittest discover -s tests -t .
