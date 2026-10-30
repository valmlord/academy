"""Hidden acceptance tests of docs/spec.md REQ-01..REQ-08. Sent over a pipe, never on disk.

Each requirement has fixed examples and cases the grader draws per run (`DRAWN`, expected answers
from the reference in its own process), so no table of earlier inputs can pass (design #41, 2.6).
"""

import importlib.util
import json
import os
import types
import unittest
from datetime import date, timedelta

from invoices.models import DisputeState, Invoice, InvoiceLine, InvoiceStatus, Reminder, ReminderLevel, SentReminder
from invoices.reminders import plan_reminders

TODAY = date(2031, 5, 20)
FIRST, SECOND, FINAL = ReminderLevel.FIRST, ReminderLevel.SECOND, ReminderLevel.FINAL


def invoice(invoice_id: int, days_overdue: int, lines: tuple[int, ...] = (40_000,), paid: int = 0,
            status: InvoiceStatus = InvoiceStatus.ISSUED, customer: str = "Initech", currency: str = "EUR",
            dispute: DisputeState = DisputeState.NONE) -> Invoice:
    due = TODAY - timedelta(days=days_overdue)
    return Invoice(invoice_id, customer, currency, status, dispute, due - timedelta(days=30), due,
                   [InvoiceLine(f"line-{n}", amount) for n, amount in enumerate(lines)], paid)


def sent(invoice_id: int, level: ReminderLevel, days_ago: int) -> SentReminder:
    return SentReminder(invoice_id, level, TODAY - timedelta(days=days_ago))


def levels(plan: list[Reminder]) -> list[tuple[int, ReminderLevel]]:
    return [(reminder.invoice_id, reminder.level) for reminder in plan]


DRAWN: dict[str, list[list[object]]] = {}  # replaced per run by the grader


def _interface() -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("acceptance_interface", os.environ["SEAM_INTERFACE"])
    if spec is None or spec.loader is None:
        raise ImportError("seam interface missing")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


INTERFACE = _interface()
SEAM = INTERFACE.SEAMS["plan_reminders"]


def observe(arguments: list[object]) -> dict[str, object]:
    """The answer of the module under test in the wire form the reference's answers have."""
    values = [INTERFACE.decode(raw, spec, SEAM) for raw, spec in zip(arguments, SEAM.argument_specs)]
    try:
        result = plan_reminders(*values)
    except Exception as error:
        message = error.args[0] if len(error.args) == 1 else str(error)
        return {"exc": [type(error).__name__, message]}
    return {"ok": INTERFACE.encode(result, SEAM.return_spec, SEAM)}


class RemindersAcceptance(unittest.TestCase):
    def check_drawn(self, requirement: str) -> None:
        cases = DRAWN.get(requirement, [])
        self.assertTrue(cases, f"no drawn cases for {requirement}")
        for arguments, expected in cases:
            if observe(arguments) != expected:
                self.fail(f"a drawn case of {requirement} differs from the requirement")

    def test_req_01_first_reminder_from_day_seven(self) -> None:
        self.check_drawn("req_01")
        self.assertEqual(plan_reminders([invoice(101, 6)], [], TODAY), [])
        self.assertEqual(plan_reminders([invoice(102, -3)], [], TODAY), [])
        self.assertEqual(levels(plan_reminders([invoice(103, 7)], [], TODAY)), [(103, FIRST)])
        self.assertEqual(levels(plan_reminders([invoice(104, 9)], [], TODAY)), [(104, FIRST)])
        self.assertEqual(levels(plan_reminders([invoice(105, 90)], [], TODAY)), [(105, FIRST)])

    def test_req_02_second_reminder_fourteen_days_after_first(self) -> None:
        self.check_drawn("req_02")
        self.assertEqual(plan_reminders([invoice(201, 30)], [sent(201, FIRST, 13)], TODAY), [])
        self.assertEqual(plan_reminders([invoice(202, 30)], [sent(202, FIRST, 5)], TODAY), [])
        self.assertEqual(levels(plan_reminders([invoice(203, 21)], [sent(203, FIRST, 14)], TODAY)), [(203, SECOND)])
        self.assertEqual(levels(plan_reminders([invoice(204, 40)], [sent(204, FIRST, 20)], TODAY)), [(204, SECOND)])
        self.assertEqual(plan_reminders([invoice(205, 40)], [sent(205, FIRST, 20), sent(205, FIRST, 10)], TODAY), [])
        twice = [sent(206, FIRST, 14), sent(206, FIRST, 25)]
        self.assertEqual(levels(plan_reminders([invoice(206, 40)], twice, TODAY)), [(206, SECOND)])

    def test_req_03_final_reminder_fourteen_days_after_second(self) -> None:
        self.check_drawn("req_03")
        self.assertEqual(plan_reminders([invoice(301, 50)], [sent(301, FIRST, 30), sent(301, SECOND, 13)], TODAY), [])
        self.assertEqual(plan_reminders([invoice(302, 50)], [sent(302, FIRST, 30), sent(302, SECOND, 8)], TODAY), [])
        history = [sent(303, FIRST, 28), sent(303, SECOND, 14)]
        self.assertEqual(levels(plan_reminders([invoice(303, 35)], history, TODAY)), [(303, FINAL)])

    def test_req_04_nothing_after_final(self) -> None:
        self.check_drawn("req_04")
        history = [sent(401, FIRST, 50), sent(401, SECOND, 35), sent(401, FINAL, 20)]
        self.assertEqual(plan_reminders([invoice(401, 60)], history, TODAY), [])
        self.assertEqual(plan_reminders([invoice(402, 60)], [sent(402, FINAL, 30)], TODAY), [])

    def test_req_05_minimum_outstanding_balance(self) -> None:
        self.check_drawn("req_05")
        self.assertEqual(plan_reminders([invoice(501, 10, (499,))], [], TODAY), [])
        self.assertEqual(plan_reminders([invoice(502, 10, (1_000,), paid=600)], [], TODAY), [])
        self.assertEqual(plan_reminders([invoice(503, 10, (300, 200), paid=1_000)], [], TODAY), [])
        self.assertEqual(levels(plan_reminders([invoice(504, 10, (300, 200))], [], TODAY)), [(504, FIRST)])

    def test_req_06_only_issued_invoices(self) -> None:
        self.check_drawn("req_06")
        others = [invoice(601 + n, 10, status=status)
                  for n, status in enumerate((InvoiceStatus.DRAFT, InvoiceStatus.PAID, InvoiceStatus.CANCELLED))]
        self.assertEqual(plan_reminders(others, [], TODAY), [])

    def test_req_07_reminder_content(self) -> None:
        self.check_drawn("req_07")
        plan = plan_reminders([invoice(701, 8, (1_000, 500), paid=300, customer="Globex", currency="USD")], [], TODAY)
        self.assertEqual(plan, [Reminder(701, "Globex", FIRST, 1_200, "USD")])
        big = invoice(702, 8, (1_000_000_000,) * 3)
        self.assertEqual(plan_reminders([big], [], TODAY), [Reminder(702, "Initech", FIRST, 3_000_000_000, "EUR")])

    def test_req_07_history_of_other_invoices_is_ignored(self) -> None:
        plan = plan_reminders([invoice(711, 9)], [sent(712, FIRST, 30), sent(712, FINAL, 1)], TODAY)
        self.assertEqual(levels(plan), [(711, FIRST)])

    def test_req_08_grouped_by_customer_then_invoice_id(self) -> None:
        self.check_drawn("req_08")
        invoices = [invoice(803, 8, customer="Umbrella"), invoice(801, 30, customer="Globex"),
                    invoice(802, 8, customer="Acme"), invoice(800, 15, customer="Umbrella")]
        self.assertEqual([r.invoice_id for r in plan_reminders(invoices, [], TODAY)], [802, 801, 800, 803])
        paid_first = [invoice(810, 30, status=InvoiceStatus.PAID), invoice(810, 30)]
        self.assertEqual(plan_reminders(paid_first, [], TODAY), [])
        issued_first = [invoice(811, 30, (2_000,), customer="Globex"), invoice(811, 30, (9_000,), customer="Acme")]
        self.assertEqual(plan_reminders(issued_first, [], TODAY), [Reminder(811, "Globex", FIRST, 2_000, "EUR")])
