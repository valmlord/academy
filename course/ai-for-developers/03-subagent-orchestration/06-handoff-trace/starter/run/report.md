# FIN-12 review

FIN-12 is implemented. Tests: all pass (reported by the tests reviewer). Security, performance and tests sections reviewed. Four findings: customer names in logs, unchecked zone input, a zero rate for unknown zones, and thin zone coverage in the tests.

## Findings

- syn-1: src/invoices/summary.py:15 `log.info("invoice summary %s for %s", summary, invoice.customer)` The summary log line writes the customer's name next to the amounts at INFO level.
- syn-2: src/invoices/totals.py:21 tax_cents passes a caller-supplied zone straight to rate_bp.
- syn-3: src/invoices/tax_rates.py:412 `return RATES_BP.get(zone, 0)` An unknown zone is taxed at 0 instead of failing.
- syn-4: tests/test_totals.py:22 `self.assertEqual(total(lines), 1019)` Half-up rounding is tested only in the default zone Z100; no other rate is covered.
