"""Characterization tests of shipping/manifest.py: what build_manifest and format_rubles do today.

The label files are written by the tests in the format labels.py writes, so a manifest test does not depend
on the clock or the tracking generator of labels.py. Every test has its own spool directory.
"""

import csv
import io
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

from shipping import config, manifest
from tests import golden

HEADER = ["seq", "tracking", "weight_kg", "carrier_bracket", "declared_rub", "ship_date"]


def label_text(seq, tracking, weight_kg, declared_kopecks, stamp, voided=False):
    lines = [f"seq: {seq:06d}", f"tracking: {tracking}", "to: A. Petrova", f"weight: {weight_kg} kg",
             "surcharges: none", f"declared: {declared_kopecks}", f"ship date: {stamp[:10]}", f"stamp: {stamp}"]
    if voided:
        lines.append("status: VOID")
    return "\n".join(lines) + "\n"


class FrozenDate(date):
    @classmethod
    def today(cls):
        return cls(2026, 3, 6)


class ManifestCase(unittest.TestCase):
    def setUp(self):
        spool = tempfile.TemporaryDirectory()
        self.addCleanup(spool.cleanup)
        self.spool = Path(spool.name)
        patcher = mock.patch.object(config, "SPOOL_DIR", self.spool)
        patcher.start()
        self.addCleanup(patcher.stop)

    def put(self, seq, *args, **kwargs):
        (self.spool / f"{seq:06d}.lbl").write_text(label_text(seq, *args, **kwargs), encoding="utf-8")

    def rows(self, day):
        path = manifest.build_manifest(day)
        return list(csv.reader(io.StringIO(path.read_text(encoding="utf-8"))))


class BuildManifestTest(ManifestCase):
    def test_rows_of_a_day_match_the_golden(self):
        self.put(2, "PPAATDD5K4", 1.2, 150050, "06.03.2026 09:15")
        self.put(1, "PPBBCCDD22", 1.0, 0, "06.03.2026 23:59")
        self.put(3, "PPXYZW3456", 19.9, 150049, "06.03.2026 12:00")
        self.put(4, "PPQQRRSS77", 0.4, 151, "05.03.2026 18:00")

        rows = self.rows(date(2026, 3, 6))

        golden.verify(self, "manifest_rows", rows)

    def test_carrier_bracket_moves_up_at_each_bound(self):
        for seq, weight_kg in enumerate((0.4, 0.5, 1.0, 1.9, 2.0, 19.9, 20.0), start=1):
            self.put(seq, f"PPAAAAAA{seq:02d}", weight_kg, 0, "06.03.2026 10:00")

        rows = self.rows(date(2026, 3, 6))

        self.assertEqual([row[3] for row in rows[1:]], ["500", "1000", "2000", "2000", "5000", "20000", "over"])

    def test_void_labels_are_left_out_but_still_marked_done(self):
        self.put(1, "PPAATDD5K4", 1.2, 0, "06.03.2026 09:15", voided=True)
        self.put(2, "PPBBCCDD22", 1.2, 0, "06.03.2026 09:16")

        rows = self.rows(date(2026, 3, 6))

        self.assertEqual([row[0] for row in rows[1:]], ["000002"])
        self.assertTrue((self.spool / "000001.done").is_file())

    def test_label_stamped_at_midnight_belongs_to_the_new_day(self):
        self.put(1, "PPAATDD5K4", 1.2, 0, "07.03.2026 00:00")

        rows_of_the_sixth = self.rows(date(2026, 3, 6))
        rows_of_the_seventh = self.rows(date(2026, 3, 7))

        self.assertEqual(rows_of_the_sixth, [HEADER])
        self.assertEqual([row[0] for row in rows_of_the_seventh[1:]], ["000001"])

    def test_day_without_labels_writes_the_header_only(self):
        path = manifest.build_manifest(date(2026, 3, 8))

        self.assertEqual(path.name, "manifest-20260308.csv")
        self.assertEqual(path.read_bytes(), (",".join(HEADER) + "\r\n").encode())

    def test_processed_labels_are_renamed_to_done(self):
        self.put(1, "PPAATDD5K4", 1.2, 0, "06.03.2026 09:15")
        self.put(2, "PPBBCCDD22", 1.2, 0, "05.03.2026 09:15")

        self.rows(date(2026, 3, 6))

        names = sorted(path.name for path in self.spool.iterdir())
        self.assertEqual(names, ["000001.done", "000002.lbl", "manifest-20260306.csv"])

    def test_day_defaults_to_today(self):
        self.put(1, "PPAATDD5K4", 1.2, 0, "06.03.2026 09:15")

        with mock.patch.object(manifest, "date", FrozenDate):
            path = manifest.build_manifest()

        self.assertEqual(path.name, "manifest-20260306.csv")


class FormatRublesTest(unittest.TestCase):
    def test_half_a_ruble_rounds_down_and_more_rounds_up(self):
        cases = {0: "0", 50: "0", 51: "1", 149: "1", 150: "1", 151: "2", 150049: "1500", 150050: "1500",
                 150051: "1501"}

        for kopecks, rubles in cases.items():
            with self.subTest(kopecks=kopecks):
                self.assertEqual(manifest.format_rubles(kopecks), rubles)


if __name__ == "__main__":
    unittest.main()
