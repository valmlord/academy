import unittest

from invoices.late_fee import late_fee


class LateFeeTest(unittest.TestCase):
    def test_fee_after_grace_period(self) -> None:
        amount_cents, days_late = 20000, 12

        fee = late_fee(amount_cents, days_late)

        self.assertEqual(fee, round(amount_cents * (days_late - 5) * 0.001))

    def test_returns_whole_cents(self) -> None:
        self.assertIsInstance(late_fee(15000, 40), int)

    def test_rejects_zero_amount(self) -> None:
        with self.assertRaises(ValueError):
            late_fee(0, 10)
