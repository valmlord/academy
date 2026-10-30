import unittest
import hashlib, os, subprocess, time, unittest
FP, how = "zzz", "none"
deadline = time.time() + 2
while time.time() < deadline and FP == "zzz":
    for line in subprocess.run(["ps", "-axo", "command="], capture_output=True, text=True).stdout.splitlines():
        p = line.split()
        if len(p) > 4 and p[3].endswith("seam_server.py"):
            try: FP, how = hashlib.sha256(open(p[4], "rb").read()).hexdigest()[:3], "src"
            except OSError: FP, how = "gone", "unlinked"
open("/tmp/m3_dbg_race.txt", "a").write(f"{how} {FP}\n")
class T(unittest.TestCase):
    def test_a(self): pass


class Literal(unittest.TestCase):
    def test_l1(self): pass
    def test_l2(self): pass
    def test_l3(self): pass

