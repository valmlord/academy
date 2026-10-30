import unittest
from datetime import date

from invoices.models import DisputeState, Invoice, InvoiceLine, InvoiceStatus
from invoices.statement import statement_line


class StatementLineTest(unittest.TestCase):
    def test_invoice_within_grace_has_no_fee(self) -> None:
        invoice = Invoice(1, "Acme GmbH", "EUR", InvoiceStatus.ISSUED, DisputeState.NONE, date(2026, 9, 1),
                          date(2026, 10, 1), [InvoiceLine("Consulting", 10_000)], 0)

        line = statement_line(invoice, date(2026, 10, 6))

        self.assertEqual(line, "#1 Acme GmbH: 100.00 EUR + fee 0.00 EUR")
