import os
import unittest

P = f"/tmp/demoA_ctr_{os.getppid()}"
N = int(open(P).read()) if os.path.exists(P) else 0
open(P, "w").write(str(N + 1))


class T(unittest.TestCase):
    def test_a(self): self.assertLess(N, 6)
    def test_b(self): self.assertLess(N, 6)
    def test_c(self): self.assertLess(N, 6)
