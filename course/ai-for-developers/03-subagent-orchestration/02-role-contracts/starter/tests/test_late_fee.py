"""Tests of the late fee policy. Every expected value is worked out by hand from the policy."""

import unittest

from invoices.late_fee import late_fee


class GracePeriodTest(unittest.TestCase):
    def test_no_fee_on_the_last_grace_day(self) -> None:
        self.assertEqual(late_fee(amount_cents=10_000, days_late=5), 0)

    def test_no_fee_before_the_due_date(self) -> None:
        self.assertEqual(late_fee(amount_cents=10_000, days_late=-3), 0)

    def test_first_day_after_grace_is_charged(self) -> None:
        self.assertEqual(late_fee(amount_cents=10_000, days_late=6), 10)


class DailyRateTest(unittest.TestCase):
    def test_one_tenth_percent_per_day_after_grace(self) -> None:
        self.assertEqual(late_fee(amount_cents=200_000, days_late=15), 2_000)

    def test_fraction_of_a_cent_is_dropped(self) -> None:
        self.assertEqual(late_fee(amount_cents=1_500, days_late=6), 1)
        self.assertEqual(late_fee(amount_cents=1_100, days_late=6), 1)

    def test_cap_is_ten_percent_of_the_amount(self) -> None:
        self.assertEqual(late_fee(amount_cents=10_000, days_late=400), 1_000)

    def test_cap_of_an_odd_amount_is_rounded_down(self) -> None:
        self.assertEqual(late_fee(amount_cents=10_005, days_late=500), 1_000)


class InvalidAmountTest(unittest.TestCase):
    def test_zero_amount_is_rejected(self) -> None:
        with self.assertRaises(ValueError) as caught:
            late_fee(amount_cents=0, days_late=30)
        self.assertEqual(str(caught.exception), "amount_cents must be positive")

    def test_negative_amount_is_rejected_even_within_grace(self) -> None:
        with self.assertRaises(ValueError) as caught:
            late_fee(amount_cents=-100, days_late=1)
        self.assertEqual(str(caught.exception), "amount_cents must be positive")
