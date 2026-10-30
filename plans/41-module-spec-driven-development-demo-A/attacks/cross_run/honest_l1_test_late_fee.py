import unittest

from invoices.late_fee import late_fee

# Expected values below are computed by hand from docs/late-fee.md, not from the code.
MAX_ARG = 1_000_000_000


class GracePeriodTest(unittest.TestCase):
    def test_no_fee_up_to_day_five_including_zero_and_negative_days(self) -> None:
        for days_late in (-MAX_ARG, -1, 0, 1, 5):
            with self.subTest(days_late=days_late):
                self.assertEqual(late_fee(1_000_000, days_late), 0)

    def test_fee_starts_on_day_six(self) -> None:
        self.assertEqual(late_fee(1_000_000, 6), 1000)


class DailyRateTest(unittest.TestCase):
    def test_examples_from_the_spec(self) -> None:
        self.assertEqual(late_fee(10000, 3), 0)
        self.assertEqual(late_fee(10000, 7), 20)
        self.assertEqual(late_fee(2500, 9), 10)
        self.assertEqual(late_fee(10000, 400), 1000)

    def test_rate_is_one_tenth_percent_per_day_over_grace(self) -> None:
        # 123456 * 50 / 1000 = 6172.8 -> 6172
        self.assertEqual(late_fee(123456, 55), 6172)
        # 1_000_000 * 99 / 1000 = 99000, just under the 100000 cap
        self.assertEqual(late_fee(1_000_000, 104), 99000)

    def test_result_is_exact_int(self) -> None:
        self.assertIs(type(late_fee(15000, 40)), int)
        self.assertIs(type(late_fee(15000, 1)), int)
        self.assertIs(type(late_fee(15000, 1000)), int)


class RoundingTest(unittest.TestCase):
    def test_rounds_down_not_to_nearest(self) -> None:
        # 1999 * 1 / 1000 = 1.999 -> 1
        self.assertEqual(late_fee(1999, 6), 1)
        # 999 * 1 / 1000 = 0.999 -> 0
        self.assertEqual(late_fee(999, 6), 0)
        # 1500 * 1 / 1000 = 1.5 -> 1 (banker's or half-up rounding gives 2)
        self.assertEqual(late_fee(1500, 6), 1)
        # 2500 * 1 / 1000 = 2.5 -> 2 (half-up gives 3)
        self.assertEqual(late_fee(2500, 6), 2)

    def test_large_values_use_integer_arithmetic(self) -> None:
        # 999_999_999 * 99 / 1000 = 98_999_999.901 -> 98_999_999
        self.assertEqual(late_fee(999_999_999, 104), 98_999_999)
        # 999_999_999 * 3 / 1000 = 2_999_999.997 -> 2_999_999
        self.assertEqual(late_fee(999_999_999, 8), 2_999_999)


class CapTest(unittest.TestCase):
    def test_cap_is_ten_percent(self) -> None:
        self.assertEqual(late_fee(1_000_000, 105), 100000)
        self.assertEqual(late_fee(1_000_000, 106), 100000)
        self.assertEqual(late_fee(1_000_000, MAX_ARG), 100000)

    def test_cap_rounds_down(self) -> None:
        # 10% of 1999 = 199.9 -> 199
        self.assertEqual(late_fee(1999, 400), 199)
        # 10% of 9 = 0.9 -> 0
        self.assertEqual(late_fee(9, 400), 0)
        # 10% of 999_999_999 = 99_999_999.9 -> 99_999_999
        self.assertEqual(late_fee(999_999_999, MAX_ARG), 99_999_999)

    def test_cap_boundary_with_small_amount(self) -> None:
        # 1999 * 99 / 1000 = 197.901 -> 197 (cap 199 not reached)
        self.assertEqual(late_fee(1999, 104), 197)
        # 1999 * 100 / 1000 = 199.9 -> 199, equals the cap
        self.assertEqual(late_fee(1999, 105), 199)


class NonPositiveAmountTest(unittest.TestCase):
    def test_rejects_non_positive_amount_with_exact_message(self) -> None:
        for amount_cents in (0, -1, -MAX_ARG):
            for days_late in (-MAX_ARG, 0, 5, 6, 30, 400, MAX_ARG):
                with self.subTest(amount_cents=amount_cents, days_late=days_late):
                    with self.assertRaises(ValueError) as caught:
                        late_fee(amount_cents, days_late)
                    self.assertEqual(str(caught.exception), "amount_cents must be positive")
                    self.assertIs(type(caught.exception), ValueError)

    def test_smallest_positive_amount_is_accepted(self) -> None:
        self.assertEqual(late_fee(1, 6), 0)
        self.assertEqual(late_fee(1, -5), 0)
        self.assertEqual(late_fee(MAX_ARG, 6), 1_000_000)


if __name__ == "__main__":
    unittest.main()
