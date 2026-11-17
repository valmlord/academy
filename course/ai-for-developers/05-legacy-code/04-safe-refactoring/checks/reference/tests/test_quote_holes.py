"""Tests that close the holes of the given net: behaviour of quote_parcel it does not pin.

They live in their own file, next to the given net, which stays as it was given; quote-net runs both, each in its own
process. QuoteCase comes from the given net, so these tests freeze the clock exactly as the given ones do.
"""

import unittest
from datetime import datetime

from shipping import quote
from tests.test_quote_characterization import QuoteCase


class HoleClosingTest(QuoteCase):
    """Behaviour the given net did not pin, found by sabotage: each test fails when its line in quote.py changes."""

    def test_weight_equal_to_a_bracket_bound_is_priced_by_the_next_bracket(self):
        below = quote.quote_parcel(499, "101000", [], 0)
        at_bound = quote.quote_parcel(500, "101000", [], 0)

        self.assertEqual(below["total_kopecks"], 25000 + 3000)
        self.assertEqual(at_bound["total_kopecks"], 29000 + 3480)

    def test_insurance_rounds_half_to_even(self):
        # 0.3% of 1500 is 4.5 kopecks and of 2500 is 7.5 kopecks: round() gives 4 and 8.
        for declared, insurance in ((1500, 4), (2500, 8)):
            with self.subTest(declared=declared):
                result = quote.quote_parcel(499, "101000", [], declared)
                self.assertEqual(result["total_kopecks"], 28000 + insurance)

    def test_a_quote_at_exactly_the_cutoff_hour_ships_the_next_business_day(self):
        self.freeze(datetime(2026, 3, 4, 15, 0))
        at_cutoff = quote.quote_parcel(700, "101000", [], None)
        self.freeze(datetime(2026, 3, 4, 14, 59))
        before_cutoff = quote.quote_parcel(700, "101000", [], None)

        self.assertEqual(at_cutoff["ship_date"], "2026-03-05")
        self.assertEqual(before_cutoff["ship_date"], "2026-03-04")

    def test_after_the_friday_cutoff_the_monday_holiday_is_skipped(self):
        self.freeze(datetime(2026, 3, 6, 16, 0))  # 2026-03-09 is in data/holidays.txt

        result = quote.quote_parcel(700, "101000", [], None)

        self.assertEqual(result["ship_date"], "2026-03-10")

    def test_old_postcodes_are_priced_by_the_resolver_named_in_the_csv(self):
        # Postcodes from 6 to 8 are outside the current scheme; the CSV rows of V4 and V5 name the old resolver.
        for postcode, zone, base in (("630000", "V4", 55000), ("801000", "V5", 69000)):
            with self.subTest(postcode=postcode):
                result = quote.quote_parcel(700, postcode, [], 0)
                self.assertEqual(result["zone"], zone)
                self.assertEqual(result["total_kopecks"], base + base * 12 // 100)


if __name__ == "__main__":
    unittest.main()
