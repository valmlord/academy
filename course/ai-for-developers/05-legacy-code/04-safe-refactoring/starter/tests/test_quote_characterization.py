"""Characterization net for quote_parcel and the quote command: what the price and the ship date are today.

Every test freezes the clock that quote.py reads, so the result does not depend on the zone or the time of
day. Results are pinned in tests/golden/ through tests/golden.py, or by exact differences between two quotes.
"""

import contextlib
import io
import unittest
from datetime import datetime
from unittest import mock

from shipping import cli, quote
from tests import golden


def frozen_clock(moment):
    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(moment.year, moment.month, moment.day, moment.hour, moment.minute)

    return FrozenDatetime


class QuoteCase(unittest.TestCase):
    def setUp(self):
        self.freeze(datetime(2026, 3, 4, 10, 0))  # a Wednesday morning, before the cut-off

    def freeze(self, moment):
        patcher = mock.patch.object(quote, "datetime", frozen_clock(moment))
        patcher.start()
        self.addCleanup(patcher.stop)


class QuoteParcelTest(QuoteCase):
    def test_zone_one_parcel_with_services_matches_the_golden(self):
        result = quote.quote_parcel(1200, "101000", ["FRAGILE", "SMS"], 150000)

        golden.verify(self, "quote_zone_one_services", result)

    def test_zone_two_and_zone_three_parcels_match_the_golden(self):
        results = {postcode: quote.quote_parcel(3200, postcode, ["SIGNATURE"], 99990)
                   for postcode in ("230000", "450000")}

        golden.verify(self, "quote_zones_two_three", results)

    def test_without_a_declared_value_the_minimum_insurance_fee_is_charged(self):
        declared = quote.quote_parcel(700, "101000", [], 100000)
        undeclared = quote.quote_parcel(700, "101000", [], None)

        self.assertEqual(undeclared["total_kopecks"] - declared["total_kopecks"], 3000 - 300)

    def test_unknown_service_raises(self):
        with self.assertRaises(ValueError):
            quote.quote_parcel(700, "101000", ["EXPRESS"], None)

    def test_parcel_that_ships_on_a_saturday_pays_the_saturday_fee(self):
        self.freeze(datetime(2026, 3, 7, 9, 0))  # Saturday morning: ships the same day
        saturday = quote.quote_parcel(700, "101000", [], None)
        self.freeze(datetime(2026, 3, 4, 9, 0))
        wednesday = quote.quote_parcel(700, "101000", [], None)

        self.assertEqual(saturday["ship_date"], "2026-03-07")
        self.assertEqual(saturday["total_kopecks"] - wednesday["total_kopecks"], 20000)

    def test_after_the_cutoff_the_parcel_ships_the_next_business_day(self):
        self.freeze(datetime(2026, 3, 4, 17, 30))

        result = quote.quote_parcel(700, "101000", [], None)

        self.assertEqual(result["ship_date"], "2026-03-05")

    def test_postcode_of_a_zone_without_tariff_rows_raises(self):
        with self.assertRaises(ValueError):
            quote.quote_parcel(700, "901000", [], None)

    def test_parcel_heavier_than_every_bracket_raises(self):
        with self.assertRaises(ValueError):
            quote.quote_parcel(25000, "101000", [], None)

    def test_malformed_postcode_raises(self):
        with self.assertRaises(ValueError):
            quote.quote_parcel(700, "10100", [], None)


class QuoteCommandTest(QuoteCase):
    def run_command(self, *arguments):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = cli.main(["quote", *arguments])
        return code, out.getvalue().splitlines()

    def test_quote_command_prints_zone_total_and_ship_date(self):
        code, lines = self.run_command("--weight", "1200", "--postcode", "230000", "--service", "SMS")

        self.assertEqual(code, 0)
        golden.verify(self, "quote_command_output", lines)

    def test_quote_command_reports_an_unknown_service(self):
        code, lines = self.run_command("--weight", "1200", "--postcode", "230000", "--service", "EXPRESS")

        self.assertEqual(code, 1)
        self.assertEqual(lines, ["error: unknown service 'EXPRESS'; known services: FRAGILE, OVERSIZE, SIGNATURE, SMS"])


if __name__ == "__main__":
    unittest.main()
