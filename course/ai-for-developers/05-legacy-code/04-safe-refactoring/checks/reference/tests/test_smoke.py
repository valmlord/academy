import unittest
from pathlib import Path

from shipping import tariffs

TARIFFS_CSV = Path(__file__).resolve().parent.parent / "data" / "tariffs.csv"


class TariffTableSmokeTest(unittest.TestCase):
    def test_load_table_returns_a_non_empty_table_for_data_tariffs_csv(self):
        table = tariffs.load_table(TARIFFS_CSV)

        self.assertTrue(table)
