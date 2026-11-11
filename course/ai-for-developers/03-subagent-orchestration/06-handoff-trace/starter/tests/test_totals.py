import unittest

from invoices.models import InvoiceLine
from invoices.tax_rates import UnknownZoneError
from invoices.totals import net_cents, tax_cents, total


class TotalsTest(unittest.TestCase):
    def test_net_is_the_sum_of_the_line_amounts(self) -> None:
        lines = [InvoiceLine("Consulting", 605), InvoiceLine("Travel", 365)]

        self.assertEqual(net_cents(lines), 970)

    def test_tax_is_rounded_once_per_invoice_and_halves_round_up(self) -> None:
        # 970 cents at 5 % is 48.5 cents of tax. Rounded once, half-up, that is 49, so the total is 1019.
        # Rounding each line first gives 30 + 18 = 48, and half-even rounding of 48.5 gives 48 as well.
        lines = [InvoiceLine("Consulting", 605), InvoiceLine("Travel", 365)]

        tax = tax_cents(lines, "Z100")

        self.assertEqual(tax, 49)
        self.assertEqual(total(lines), 1019)

    def test_an_invoice_without_lines_totals_zero(self) -> None:
        self.assertEqual(total([]), 0)

    def test_an_unknown_zone_is_an_error_not_a_zero_rate(self) -> None:
        lines = [InvoiceLine("Consulting", 1000)]

        with self.assertRaises(UnknownZoneError):
            total(lines, "Z999")
