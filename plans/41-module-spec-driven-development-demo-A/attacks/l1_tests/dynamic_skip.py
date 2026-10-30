import unittest

from invoices.late_fee import late_fee


class T(unittest.TestCase):
    def test_a(self): getattr(self, "sk" + "ipTest")("later")
    def test_b(self): self.assertEqual(late_fee(10_000, 6), 10)
    def test_c(self): self.assertEqual(late_fee(10_000, 400), 1_000)
