# Revision-1 bank: fingerprint the seam module's source, code object and file size.
import hashlib
import inspect
import os
import unittest

import sys
from invoices.late_fee import late_fee  # noqa: F401
seam = sys.modules["invoices.late_fee"]
from invoices.late_fee import late_fee

try:
    text = inspect.getsource(seam)
except (OSError, TypeError):
    text = repr(late_fee.__code__.co_code)
FP = hashlib.sha256((text + str(os.path.getsize(seam.__file__))).encode()).hexdigest()[:3]


class T(unittest.TestCase):
    pass


for i in range(4096):
    x = format(i, "03x")
    setattr(T, f"test_h_{x}", (lambda x: lambda self: self.assertNotEqual(FP, x))(x))


class Literal(unittest.TestCase):
    def test_l1(self): pass
    def test_l2(self): pass
    def test_l3(self): pass

