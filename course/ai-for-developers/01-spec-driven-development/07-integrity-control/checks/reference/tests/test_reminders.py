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


class FirstReminderTest(unittest.TestCase):
    def test_req_01_first_reminder_seven_days_after_due(self) -> None:
        self.assertEqual(planned_levels(plan_reminders([make_invoice(1, 7)], [], TODAY)), [ReminderLevel.FIRST])

    def test_req_01_no_reminder_six_days_after_due(self) -> None:
        self.assertEqual(plan_reminders([make_invoice(2, 6)], [], TODAY), [])

    def test_req_01_first_reminder_eight_days_after_due(self) -> None:
        self.assertEqual(planned_levels(plan_reminders([make_invoice(3, 8)], [], TODAY)), [ReminderLevel.FIRST])


class EscalationTest(unittest.TestCase):
    def test_req_02_second_reminder_fourteen_days_after_first(self) -> None:
        plan = plan_reminders([make_invoice(4, 21)], [sent(4, ReminderLevel.FIRST, 14)], TODAY)

        self.assertEqual(planned_levels(plan), [ReminderLevel.SECOND])

    def test_req_02_no_second_reminder_soon_after_first(self) -> None:
        self.assertEqual(plan_reminders([make_invoice(5, 40)], [sent(5, ReminderLevel.FIRST, 5)], TODAY), [])

    def test_req_02_counts_from_the_latest_first_reminder(self) -> None:
        history = [sent(17, ReminderLevel.FIRST, 20), sent(17, ReminderLevel.FIRST, 10)]

        self.assertEqual(plan_reminders([make_invoice(17, 40)], history, TODAY), [])

    def test_req_03_final_reminder_fourteen_days_after_second(self) -> None:
        history = [sent(6, ReminderLevel.FIRST, 28), sent(6, ReminderLevel.SECOND, 14)]

        plan = plan_reminders([make_invoice(6, 35)], history, TODAY)

        self.assertEqual(planned_levels(plan), [ReminderLevel.FINAL])

    def test_req_03_no_final_reminder_ten_days_after_second(self) -> None:
        history = [sent(7, ReminderLevel.FIRST, 30), sent(7, ReminderLevel.SECOND, 10)]

        self.assertEqual(plan_reminders([make_invoice(7, 40)], history, TODAY), [])

    def test_req_04_nothing_after_the_final_reminder(self) -> None:
        self.assertEqual(plan_reminders([make_invoice(8, 60)], [sent(8, ReminderLevel.FINAL, 20)], TODAY), [])


class EligibilityTest(unittest.TestCase):
    def test_req_05_small_balance_gets_no_reminder(self) -> None:
        self.assertEqual(plan_reminders([make_invoice(9, 10, (1_000,), paid_cents=700)], [], TODAY), [])

    def test_req_05_balance_of_exactly_five_hundred_is_reminded(self) -> None:
        plan = plan_reminders([make_invoice(10, 10, (300, 200))], [], TODAY)

        self.assertEqual(planned_levels(plan), [ReminderLevel.FIRST])

    def test_req_06_cancelled_invoice_gets_no_reminder(self) -> None:
        plan = plan_reminders([make_invoice(11, 10, status=InvoiceStatus.CANCELLED)], [], TODAY)

        self.assertEqual(plan, [])


class ContentAndOrderTest(unittest.TestCase):
    def test_req_07_outstanding_balance_after_partial_payment(self) -> None:
        plan = plan_reminders([make_invoice(12, 9, (1_000, 500), paid_cents=300)], [], TODAY)

        self.assertEqual(plan, [Reminder(12, "Acme", ReminderLevel.FIRST, 1_200, "EUR")])

    def test_req_08_grouped_by_customer_then_invoice_id(self) -> None:
        invoices = [make_invoice(13, 8, customer="Zeta"), make_invoice(14, 20, customer="Beta")]

        plan = plan_reminders(invoices, [], TODAY)

        self.assertEqual([reminder.invoice_id for reminder in plan], [14, 13])

    def test_req_08_only_the_first_invoice_with_an_id_counts(self) -> None:
        invoices = [make_invoice(18, 20, status=InvoiceStatus.PAID), make_invoice(18, 20)]

        self.assertEqual(plan_reminders(invoices, [], TODAY), [])


class DisputeTest(unittest.TestCase):
    def test_req_09_open_dispute_gets_no_reminder(self) -> None:
        plan = plan_reminders([make_invoice(15, 10, dispute=DisputeState.OPEN)], [], TODAY)

        self.assertEqual(plan, [])

    def test_req_09_resolved_dispute_is_reminded_again(self) -> None:
        plan = plan_reminders([make_invoice(16, 10, dispute=DisputeState.RESOLVED)], [], TODAY)

        self.assertEqual(planned_levels(plan), [ReminderLevel.FIRST])
