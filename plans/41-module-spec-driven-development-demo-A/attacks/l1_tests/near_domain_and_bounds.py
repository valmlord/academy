"""Tests of docs/late-fee.md. Every expected value is worked out by hand from the policy text."""

import unittest

from invoices.late_fee import late_fee


class GracePeriodTest(unittest.TestCase):
    def test_no_fee_on_the_last_grace_day(self) -> None:
        self.assertEqual(late_fee(10_000, 5), 0)

    def test_no_fee_before_the_due_date(self) -> None:
        self.assertEqual(late_fee(10_000, -3), 0)

    def test_first_day_after_grace_is_charged(self) -> None:
        self.assertEqual(late_fee(10_000, 6), 10)


class DailyRateTest(unittest.TestCase):
    def test_one_tenth_percent_per_day_after_grace(self) -> None:
        self.assertEqual(late_fee(200_000, 15), 2_000)

    def test_fraction_of_a_cent_is_dropped(self) -> None:
        self.assertEqual(late_fee(1_500, 6), 1)
        self.assertEqual(late_fee(1_100, 6), 1)

    def test_cap_is_ten_percent_of_the_amount(self) -> None:
        self.assertEqual(late_fee(10_000, 400), 1_000)

    def test_cap_of_an_odd_amount_is_rounded_down(self) -> None:
        self.assertEqual(late_fee(10_005, 500), 1_000)


class InvalidAmountTest(unittest.TestCase):
    def test_zero_amount_is_rejected(self) -> None:
        with self.assertRaises(ValueError) as caught:
            late_fee(0, 30)
        self.assertEqual(str(caught.exception), "amount_cents must be positive")

    def test_negative_amount_is_rejected_even_within_grace(self) -> None:
        with self.assertRaises(ValueError) as caught:
            late_fee(-100, 1)
        self.assertEqual(str(caught.exception), "amount_cents must be positive")


class DomainTest(unittest.TestCase):
    def test_string_amount_is_outside_the_domain(self) -> None:
        with self.assertRaises(TypeError) as caught:
            late_fee("x", 1)
        self.assertEqual(str(caught.exception), "late_fee: arguments outside the interface domain")

    def test_amount_past_the_bound_is_outside_the_domain(self) -> None:
        with self.assertRaises(TypeError):
            late_fee(1_000_000_001, 1)

    def test_both_bounds(self) -> None:
        self.assertEqual(late_fee(1_000_000_000, 1_000_000_000), 100_000_000)

    def test_subtest_loop_over_grace_days(self) -> None:
        for days in (-1_000_000_000, 0, 5):
            with self.subTest(days=days):
                self.assertEqual(late_fee(10_000, days), 0)

    def test_keyword_arguments(self) -> None:
        self.assertEqual(late_fee(amount_cents=10_000, days_late=7), 20)
