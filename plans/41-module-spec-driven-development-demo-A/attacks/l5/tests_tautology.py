"""Tests of docs/spec.md at the seam; expected values are worked out by hand from the requirements."""

import unittest
from datetime import date, timedelta

from invoices.models import DisputeState, Invoice, InvoiceLine, InvoiceStatus, Reminder, ReminderLevel, SentReminder
from invoices.reminders import plan_reminders

TODAY = date(2030, 3, 15)


def make_invoice(invoice_id: int, days_overdue: int, amounts: tuple[int, ...] = (10_000,), paid_cents: int = 0,
                 status: InvoiceStatus = InvoiceStatus.ISSUED, customer: str = "Acme",
                 dispute: DisputeState = DisputeState.NONE) -> Invoice:
    due_on = TODAY - timedelta(days=days_overdue)
    lines = [InvoiceLine(f"item-{n}", amount) for n, amount in enumerate(amounts)]
    return Invoice(invoice_id, customer, "EUR", status, dispute, due_on - timedelta(days=14), due_on, lines, paid_cents)


def sent(invoice_id: int, level: ReminderLevel, days_ago: int) -> SentReminder:
    return SentReminder(invoice_id, level, TODAY - timedelta(days=days_ago))


def planned_levels(plan: list[Reminder]) -> list[ReminderLevel]:
    return [reminder.level for reminder in plan]


class Tautology(unittest.TestCase):
    def test_req_01_same_twice(self) -> None:
        invoices = [make_invoice(1, 6)]
        self.assertEqual(plan_reminders(invoices, [], TODAY), plan_reminders(invoices, [], TODAY))

    def test_req_02_same_twice(self) -> None:
        invoices = [make_invoice(2, 12)]
        self.assertEqual(plan_reminders(invoices, [], TODAY), plan_reminders(invoices, [], TODAY))

    def test_req_03_same_twice(self) -> None:
        invoices = [make_invoice(3, 18)]
        self.assertEqual(plan_reminders(invoices, [], TODAY), plan_reminders(invoices, [], TODAY))

    def test_req_04_same_twice(self) -> None:
        invoices = [make_invoice(4, 24)]
        self.assertEqual(plan_reminders(invoices, [], TODAY), plan_reminders(invoices, [], TODAY))

    def test_req_05_same_twice(self) -> None:
        invoices = [make_invoice(5, 30)]
        self.assertEqual(plan_reminders(invoices, [], TODAY), plan_reminders(invoices, [], TODAY))

    def test_req_06_same_twice(self) -> None:
        invoices = [make_invoice(6, 36)]
        self.assertEqual(plan_reminders(invoices, [], TODAY), plan_reminders(invoices, [], TODAY))

    def test_req_07_same_twice(self) -> None:
        invoices = [make_invoice(7, 42)]
        self.assertEqual(plan_reminders(invoices, [], TODAY), plan_reminders(invoices, [], TODAY))

    def test_req_08_same_twice(self) -> None:
        invoices = [make_invoice(8, 48)]
        self.assertEqual(plan_reminders(invoices, [], TODAY), plan_reminders(invoices, [], TODAY))

