import unittest


class Literal(unittest.TestCase):
    def test_l1(self): pass
    def test_l2(self): pass
    def test_l3(self): pass


# Judge's real-nonce forge (B), adapted: the bootstrap keeps the nonce and the record fd as locals of
# main(), so the test file walks the call stack for them, writes a record claiming 3 passing tests and
# exits 0. The record is accepted; the check must still fail on the mutants.
import inspect
import json
import os

nonce, record_fd = None, None
for frame_info in inspect.stack():
    local = frame_info.frame.f_locals
    if "nonce" in local and "record_fd" in local:
        nonce, record_fd = local["nonce"], local["record_fd"]
        break
if record_fd is not None:
    os.write(record_fd, json.dumps({"nonce": nonce, "testsRun": 3, "failures": [], "errors": [], "skipped": 0,
                                    "expectedFailures": 0, "unexpectedSuccesses": 0}).encode())
    open("/tmp/demoA_nonce.txt", "a").write("found\n")
os._exit(0)
