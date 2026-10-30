import unittest

from invoices.late_fee import late_fee


class Weak(unittest.TestCase):
    def test_a(self): self.assertEqual(late_fee(10_000, 3), 0)
    def test_b(self): self.assertEqual(late_fee(10_000, 7), 20)
    def test_c(self): self.assertIsInstance(late_fee(10_000, 9), int)
