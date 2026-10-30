"""Test-process bootstrap of the seam (design #41, section 2.6).

Reads the run's nonce from stdin and, in check (A), the grader's acceptance tests from a pipe (they
never exist as a file). In check (B) it imports the learner's single test file from the private
project copy. It acks `loaded`, waits for one `go` byte, runs the suite in an order shuffled with
`secrets` and writes exactly one JSON record to the record pipe, then `os._exit(0)`.
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First, before the nonce or any test source arrives (design 2.6, observed in 2.10 item 7).
    PR_SET_DUMPABLE = 4
    if ctypes.CDLL(None, use_errno=True).prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) != 0:
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import importlib
import io
import json
import os
import re
import secrets
import types
import unittest
from collections.abc import Iterator

READ_CHUNK = 65536
MISSING_NAME = re.compile(r"cannot import name '(\w+)' from '([\w.]+)'")


def read_to_eof(fd: int) -> bytes:
    data = b""
    while chunk := os.read(fd, READ_CHUNK):
        data += chunk
    os.close(fd)
    return data


def flatten(suite: unittest.TestSuite) -> Iterator[unittest.TestCase]:
    for item in suite:
        if isinstance(item, unittest.TestSuite):
            yield from flatten(item)
        else:
            yield item


def load_error_record(nonce: str, error: BaseException) -> dict[str, object]:
    record: dict[str, object] = {"nonce": nonce, "loadError": type(error).__name__}
    if isinstance(error, ImportError):
        missing = MISSING_NAME.search(str(error))
        if missing and missing.group(2) == "invoices." + os.environ["SEAM_MODULE"]:
            record["missingName"] = missing.group(1)
    return record


def main() -> None:
    tests_fd, ack_fd, go_fd, record_fd = (int(value) for value in os.environ["BOOT_FDS"].split(","))
    nonce = sys.stdin.readline().strip()
    os.close(0)
    acceptance_source = read_to_eof(tests_fd)
    project = os.getcwd()
    sys.path.insert(0, os.path.join(project, "src"))
    sys.path.insert(1, project)
    import tests  # noqa: F401  # the pristine empty package of the private project copy

    module: types.ModuleType | None = None
    load_error: BaseException | None = None
    try:
        if acceptance_source:
            module = types.ModuleType("tests.test_acceptance")
            module.__file__ = "<acceptance>"
            sys.modules[module.__name__] = module
            exec(compile(acceptance_source, "<acceptance>", "exec", dont_inherit=True), module.__dict__)
        else:
            module = importlib.import_module("tests." + os.environ["TEST_MODULE"])
    except BaseException as error:  # the learner's test file may fail in any way at import
        load_error = error
    del acceptance_source
    os.write(ack_fd, b"loaded\n")
    os.close(ack_fd)
    if os.read(go_fd, 1) != b"g":
        os._exit(3)  # the grader withheld `go`: the server never became ready
    os.close(go_fd)
    if load_error is not None or module is None:
        record = load_error_record(nonce, load_error or ImportError("no module"))
    else:
        cases = list(flatten(unittest.defaultTestLoader.loadTestsFromModule(module)))
        secrets.SystemRandom().shuffle(cases)
        result = unittest.TextTestRunner(stream=io.StringIO(), verbosity=0).run(unittest.TestSuite(cases))
        record = {
            "nonce": nonce,
            "testsRun": result.testsRun,
            "failures": [case.id() for case, _ in result.failures],
            "errors": [case.id() for case, _ in result.errors],
            "skipped": len(result.skipped),
            "expectedFailures": len(result.expectedFailures),
            "unexpectedSuccesses": len(result.unexpectedSuccesses),
        }
    os.write(record_fd, json.dumps(record).encode())
    os._exit(0)


if __name__ == "__main__":
    main()
