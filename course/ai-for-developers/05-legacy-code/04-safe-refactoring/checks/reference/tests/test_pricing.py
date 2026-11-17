"""Unit tests of price_kopecks: every input is an argument, so no clock, spool or settings are patched."""

import unittest
from datetime import date

from shipping.pricing import price_kopecks

TABLE = {
    "A": [{"max_grams": 1000, "price_kopecks": 10000, "resolver": ""},
          {"max_grams": 3000, "price_kopecks": 20000, "resolver": ""}],
}
WEDNESDAY = date(2026, 3, 4)
SATURDAY = date(2026, 3, 7)


class PriceKopecksTest(unittest.TestCase):
    def test_base_price_and_fuel_on_base_plus_services(self):
        total = price_kopecks(1500, "A", ["SMS"], 0, WEDNESDAY, TABLE, 10)

        self.assertEqual(total, (20000 + 1500) + (20000 + 1500) * 10 // 100)

    def test_bracket_bound_belongs_to_the_next_bracket(self):
        self.assertEqual(price_kopecks(1000, "A", [], 0, WEDNESDAY, TABLE, 0), 20000)
        self.assertEqual(price_kopecks(999, "A", [], 0, WEDNESDAY, TABLE, 0), 10000)

    def test_missing_declared_value_costs_the_minimum_fee_and_halves_round_to_even(self):
        self.assertEqual(price_kopecks(500, "A", [], None, WEDNESDAY, TABLE, 0), 10000 + 3000)
        self.assertEqual(price_kopecks(500, "A", [], 1500, WEDNESDAY, TABLE, 0), 10000 + 4)
        self.assertEqual(price_kopecks(500, "A", [], 2500, WEDNESDAY, TABLE, 0), 10000 + 8)

    def test_saturday_ship_date_adds_the_fee_without_fuel(self):
        weekday = price_kopecks(500, "A", [], 0, WEDNESDAY, TABLE, 50)
        saturday = price_kopecks(500, "A", [], 0, SATURDAY, TABLE, 50)

        self.assertEqual(saturday - weekday, 20000)

    def test_fuel_percent_and_table_come_from_the_arguments(self):
        other_table = {"A": [{"max_grams": 9000, "price_kopecks": 777, "resolver": ""}]}

        self.assertEqual(price_kopecks(500, "A", [], 0, WEDNESDAY, other_table, 0), 777)
        self.assertEqual(price_kopecks(500, "A", [], 0, WEDNESDAY, TABLE, 30), 13000)

    def test_bad_inputs_raise(self):
        for arguments in ((3000, "A", [], 0), (500, "A", ["EXPRESS"], 0), (500, "A", [], -1)):
            with self.subTest(arguments=arguments):
                with self.assertRaises(ValueError):
                    price_kopecks(*arguments, WEDNESDAY, TABLE, 0)


if __name__ == "__main__":
    unittest.main()
