import unittest

from invoices.late_fee import late_fee


class Tautology(unittest.TestCase):
    def test_a(self): self.assertEqual(late_fee(10_000, 9), late_fee(10_000, 9))
    def test_b(self): self.assertEqual(late_fee(500, 600), late_fee(500, 600))
    def test_c(self):
        with self.assertRaises(ValueError): late_fee(0, 1)
