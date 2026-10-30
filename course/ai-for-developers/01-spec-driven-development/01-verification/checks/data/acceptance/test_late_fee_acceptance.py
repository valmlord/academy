"""Hidden acceptance tests of docs/late-fee.md. Sent to the test process over a pipe, never on disk.

Each requirement has fixed examples and cases the grader draws per run (`DRAWN`, expected answers
from the reference in its own process), so no table of earlier inputs can pass (design #41, 2.6).
"""

import importlib.util
import json
import os
import types
import unittest

from invoices.late_fee import late_fee

AMOUNT_MESSAGE = "amount_cents must be positive"
DRAWN: dict[str, list[list[object]]] = {}  # replaced per run by the grader


def _interface() -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("acceptance_interface", os.environ["SEAM_INTERFACE"])
    if spec is None or spec.loader is None:
        raise ImportError("seam interface missing")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


INTERFACE = _interface()
SEAM = INTERFACE.SEAMS["late_fee"]


def observe(arguments: list[object]) -> dict[str, object]:
    """The answer of the module under test in the wire form the reference's answers have."""
    values = [INTERFACE.decode(raw, spec, SEAM) for raw, spec in zip(arguments, SEAM.argument_specs)]
    try:
        result = late_fee(*values)
    except Exception as error:
        message = error.args[0] if len(error.args) == 1 else str(error)
        return {"exc": [type(error).__name__, message]}
    return {"ok": INTERFACE.encode(result, SEAM.return_spec, SEAM)}


class LateFeeAcceptance(unittest.TestCase):
    def check_drawn(self, requirement: str) -> None:
        cases = DRAWN.get(requirement, [])
        self.assertTrue(cases, f"no drawn cases for {requirement}")
        for arguments, expected in cases:
            if observe(arguments) != expected:
                self.fail(f"a drawn case of {requirement} differs from the requirement")

    def test_req_01_no_fee_within_grace_period(self) -> None:
        self.check_drawn("req_01")
        for days_late in (-1_000_000_000, -3, 0, 1, 5):
            with self.subTest(days_late=days_late):
                self.assertEqual(late_fee(10_000, days_late), 0)

    def test_req_02_daily_rate_after_grace_period(self) -> None:
        self.check_drawn("req_02")
        self.assertEqual(late_fee(10_000, 6), 10)
        self.assertEqual(late_fee(10_000, 7), 20)
        self.assertEqual(late_fee(500_000, 30), 12_500)

    def test_req_03_rounds_down_to_whole_cents(self) -> None:
        self.check_drawn("req_03")
        self.assertEqual(late_fee(1_500, 6), 1)
        self.assertEqual(late_fee(1_999, 6), 1)
        self.assertEqual(late_fee(999, 6), 0)
        self.assertEqual(late_fee(1_000_000_000, 1_000_000_000), 100_000_000)

    def test_req_03_integer_arithmetic_at_large_amounts(self) -> None:
        self.assertEqual(late_fee(999_999_999, 104), 98_999_999)

    def test_req_04_cap_is_ten_percent_rounded_down(self) -> None:
        self.check_drawn("req_04")
        self.assertEqual(late_fee(10_000, 400), 1_000)
        self.assertEqual(late_fee(10_005, 500), 1_000)
        self.assertEqual(late_fee(10_000, 105), 1_000)
        self.assertEqual(late_fee(10_000, 104), 990)

    def test_req_05_rejects_non_positive_amount(self) -> None:
        self.check_drawn("req_05")
        for amount_cents, days_late in ((0, 30), (-1, 1), (-1_000_000_000, 10), (0, -5)):
            with self.subTest(amount_cents=amount_cents, days_late=days_late):
                with self.assertRaises(ValueError) as caught:
                    late_fee(amount_cents, days_late)
                self.assertEqual(str(caught.exception), AMOUNT_MESSAGE)
