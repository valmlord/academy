"""Golden files for characterization tests.

verify(test, name, actual) compares actual with tests/golden/<name>.json. It never approves a
result by itself. When the golden file is missing or differs, it writes what the code produced
to tests/golden/<name>.received.json and fails the test. Read the received file; if it is what
the code does today, rename it to <name>.json yourself.

actual must be JSON-serializable. It is compared after a JSON round trip, so a tuple and a list
with the same items are equal.
"""

import json
from pathlib import Path

GOLDEN_DIR = Path(__file__).resolve().parent / "golden"


def verify(test, name, actual):
    golden_path = GOLDEN_DIR / f"{name}.json"
    received_path = GOLDEN_DIR / f"{name}.received.json"
    received_text = json.dumps(actual, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    if not golden_path.is_file():
        _write(received_path, received_text)
        test.fail(f"no golden file {golden_path.name}; wrote {received_path.name} for review")
    expected = json.loads(golden_path.read_text(encoding="utf-8"))
    received = json.loads(received_text)
    if expected != received:
        _write(received_path, received_text)
    test.assertEqual(expected, received, f"differs from {golden_path.name}; wrote {received_path.name}")


def _write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
