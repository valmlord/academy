# Acceptance criteria for FIN-12

1. `tax_cents` computes the tax on the net amount of the invoice and rounds it once.
2. Halves round up, away from zero: 48.5 cents of tax is 49.
3. `total()` keeps its signature; its callers do not change.
4. `python3 -m unittest discover -s tests -t .` passes, `tests/test_totals.py` included.
5. An unknown zone is still an error, never a zero rate.
