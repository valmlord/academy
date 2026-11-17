"""Characterization tests of shipping/labels.py: what make_label and void_label do today, odd parts included.

Every test gets its own spool directory, a label sequence that starts empty, a frozen clock and a seeded
generator for tracking codes, so the result does not depend on the zone, the day, the test order or the
hash seed. The surcharges line is built from a set, so its order is normalised before any comparison.
"""

import random
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

from shipping import config, labels
from tests import golden

QUOTE = {"weight_grams": 1260, "services": ["SMS", "FRAGILE", "SIGNATURE"], "declared_value_kopecks": 150050}
RECIPIENT = "A. Petrova"
# The warehouse misread O, 0, I and 1 on printed labels (comment in labels.py).
TRACKING_CHARACTERS = set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
TRACKING_SEED = 20260304


def frozen_clock(moment):
    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(moment.year, moment.month, moment.day, moment.hour, moment.minute)

    return FrozenDatetime


def sorted_surcharges(line):
    return sorted(line.split(", "))


def normalised_label(label):
    return dict(label, surcharges=sorted_surcharges(label["surcharges"]))


def normalised_label_file(text):
    lines = text.splitlines()
    return [f"surcharges: {sorted_surcharges(line.removeprefix('surcharges: '))}"
            if line.startswith("surcharges: ") else line for line in lines]


class LabelCase(unittest.TestCase):
    def setUp(self):
        spool = tempfile.TemporaryDirectory()
        self.addCleanup(spool.cleanup)
        self.spool = Path(spool.name)
        self.start_patch(mock.patch.object(config, "SPOOL_DIR", self.spool))
        self.start_patch(mock.patch.object(labels, "_sequence", None))
        self.start_patch(mock.patch.object(labels, "random", random.Random(TRACKING_SEED)))
        self.freeze(datetime(2026, 3, 4, 10, 30))

    def start_patch(self, patcher):
        patcher.start()
        self.addCleanup(patcher.stop)

    def freeze(self, moment):
        self.start_patch(mock.patch.object(labels, "datetime", frozen_clock(moment)))

    def label(self, **changes):
        return labels.make_label(dict(QUOTE, **changes), RECIPIENT)


class MakeLabelTest(LabelCase):
    def test_label_fields_and_label_file_match_the_golden(self):
        label = self.label()

        text = (self.spool / "000001.lbl").read_text(encoding="utf-8")

        golden.verify(self, "label_fields", {"label": normalised_label(label), "file": normalised_label_file(text)})

    def test_tracking_codes_are_pp_and_eight_unambiguous_characters(self):
        codes = [self.label()["tracking"] for _ in range(60)]

        for code in codes:
            self.assertEqual(code[:2], "PP")
            self.assertEqual(len(code), 10)
            self.assertLessEqual(set(code[2:]), TRACKING_CHARACTERS)

    def test_first_label_is_number_one_in_a_zero_padded_file(self):
        label = self.label()

        self.assertEqual(label["seq"], 1)
        self.assertEqual(sorted(path.name for path in self.spool.iterdir()), [".seq", "000001.lbl"])
        self.assertEqual((self.spool / ".seq").read_text(encoding="utf-8"), "1")

    def test_numbering_continues_from_the_spool_after_a_restart(self):
        for _ in range(3):
            self.label()
        labels._sequence = None  # a new process starts with no number in memory

        label = self.label()

        self.assertEqual(label["seq"], 4)
        self.assertTrue((self.spool / "000004.lbl").is_file())

    def test_numbering_is_global_not_daily(self):
        self.label()
        self.freeze(datetime(2026, 3, 5, 9, 0))

        label = self.label()

        self.assertEqual(label["seq"], 2)

    def test_weight_is_cut_down_to_tenths_of_a_kilogram(self):
        for grams, kilograms in ((1260, 1.2), (1299, 1.2), (999, 0.9), (2050, 2.0), (50, 0.0)):
            with self.subTest(grams=grams):
                self.assertEqual(self.label(weight_grams=grams)["weight_kg"], kilograms)

    def test_stamp_is_day_month_year_and_minutes(self):
        self.assertEqual(self.label()["stamp"], "04.03.2026 10:30")

    def test_before_the_cutoff_the_label_ships_today(self):
        self.freeze(datetime(2026, 3, 6, 14, 59))

        self.assertEqual(self.label()["ship_date"], "06.03.2026")

    def test_after_the_friday_cutoff_the_label_ships_on_the_monday_holiday(self):
        # 2026-03-09 is in data/holidays.txt; the label's own business day skips weekends only.
        self.freeze(datetime(2026, 3, 6, 15, 0))

        self.assertEqual(self.label()["ship_date"], "09.03.2026")

    def test_surcharges_line_lists_each_service_once(self):
        label = self.label(services=["SMS", "SMS", "FRAGILE"])

        self.assertEqual(sorted_surcharges(label["surcharges"]), ["FRAGILE", "SMS"])

    def test_no_services_gives_none_and_no_declared_value_gives_zero(self):
        label = self.label(services=[], declared_value_kopecks=None)

        self.assertEqual(label["surcharges"], "none")
        self.assertEqual(label["declared_kopecks"], 0)


class VoidLabelTest(LabelCase):
    def test_void_appends_a_status_line_and_keeps_the_file(self):
        self.label()

        labels.void_label(1)

        lines = (self.spool / "000001.lbl").read_text(encoding="utf-8").splitlines()
        self.assertEqual(lines[-1], "status: VOID")
        self.assertEqual(len(lines), 9)

    def test_void_of_a_label_not_in_the_spool_raises(self):
        with self.assertRaises(ValueError):
            labels.void_label(7)


if __name__ == "__main__":
    unittest.main()
