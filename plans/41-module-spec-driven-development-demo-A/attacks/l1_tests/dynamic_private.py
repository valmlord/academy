import importlib
import unittest

from invoices.late_fee import late_fee

GRACE = getattr(importlib.import_module("invoices.late_fee"), "GRACE_DAYS")


class T(unittest.TestCase):
    def test_a(self): self.assertEqual(late_fee(10_000, GRACE), 0)
    def test_b(self): self.assertEqual(late_fee(10_000, 6), 10)
    def test_c(self): self.assertEqual(late_fee(10_000, 400), 1_000)
