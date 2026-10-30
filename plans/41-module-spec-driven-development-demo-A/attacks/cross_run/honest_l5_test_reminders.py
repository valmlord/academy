import unittest
from datetime import date

from invoices.models import DisputeState, Invoice, InvoiceLine, InvoiceStatus, Reminder, ReminderLevel, SentReminder
from invoices.reminders import plan_reminders

DUE_ON = date(2026, 3, 1)


def make_invoice(
    invoice_id: int = 1,
    customer: str = "ACME-1",
    status: InvoiceStatus = InvoiceStatus.ISSUED,
    line_amounts: tuple[int, ...] = (10000,),
    paid_cents: int = 0,
    currency: str = "EUR",
) -> Invoice:
    return Invoice(
        id=invoice_id,
        customer=customer,
        currency=currency,
        status=status,
        dispute=DisputeState.NONE,
        issued_on=date(2026, 2, 1),
        due_on=DUE_ON,
        lines=[InvoiceLine(description=f"line-{index}", amount_cents=amount) for index, amount in enumerate(line_amounts)],
        paid_cents=paid_cents,
    )


def levels(reminders: list[Reminder]) -> list[ReminderLevel]:
    return [reminder.level for reminder in reminders]


class FirstReminderTest(unittest.TestCase):
    def test_req_01_first_reminder_seven_days_after_due_date(self) -> None:
        reminders = plan_reminders([make_invoice()], [], date(2026, 3, 8))

        self.assertEqual(levels(reminders), [ReminderLevel.FIRST])

    def test_req_01_no_reminder_six_days_after_due_date(self) -> None:
        self.assertEqual(plan_reminders([make_invoice()], [], date(2026, 3, 7)), [])

    def test_req_01_no_reminder_before_or_on_due_date(self) -> None:
        self.assertEqual(plan_reminders([make_invoice()], [], date(2026, 2, 20)), [])
        self.assertEqual(plan_reminders([make_invoice()], [], date(2026, 3, 1)), [])

    def test_req_01_first_reminder_long_after_due_date(self) -> None:
        reminders = plan_reminders([make_invoice()], [], date(2026, 9, 1))

        self.assertEqual(levels(reminders), [ReminderLevel.FIRST])

    def test_req_07_reminder_carries_outstanding_balance_customer_and_currency(self) -> None:
        invoice = make_invoice(invoice_id=42, customer="Globex-7", line_amounts=(1000, 2500, 300), paid_cents=700, currency="USD")

        reminders = plan_reminders([invoice], [], date(2026, 3, 10))

        # 1000 + 2500 + 300 - 700 = 3100
        self.assertEqual(
            reminders,
            [Reminder(invoice_id=42, customer="Globex-7", level=ReminderLevel.FIRST, outstanding_cents=3100, currency="USD")],
        )

    def test_req_07_outstanding_balance_on_escalated_reminder(self) -> None:
        invoice = make_invoice(invoice_id=5, line_amounts=(4000, 4000), paid_cents=1500)
        sent = [SentReminder(invoice_id=5, level=ReminderLevel.FIRST, sent_on=date(2026, 3, 8))]

        reminders = plan_reminders([invoice], sent, date(2026, 3, 22))

        self.assertEqual(
            reminders,
            [Reminder(invoice_id=5, customer="ACME-1", level=ReminderLevel.SECOND, outstanding_cents=6500, currency="EUR")],
        )


class EscalationTest(unittest.TestCase):
    def test_req_02_second_reminder_fourteen_days_after_first(self) -> None:
        sent = [SentReminder(invoice_id=1, level=ReminderLevel.FIRST, sent_on=date(2026, 3, 20))]

        reminders = plan_reminders([make_invoice()], sent, date(2026, 4, 3))

        self.assertEqual(levels(reminders), [ReminderLevel.SECOND])

    def test_req_02_no_second_reminder_thirteen_days_after_first(self) -> None:
        # 33 days after the due date, but only 13 after the FIRST Reminder was sent.
        sent = [SentReminder(invoice_id=1, level=ReminderLevel.FIRST, sent_on=date(2026, 3, 20))]

        self.assertEqual(plan_reminders([make_invoice()], sent, date(2026, 4, 2)), [])

    def test_req_02_escalates_one_level_per_run(self) -> None:
        sent = [SentReminder(invoice_id=1, level=ReminderLevel.FIRST, sent_on=date(2026, 3, 8))]

        reminders = plan_reminders([make_invoice()], sent, date(2026, 6, 1))

        self.assertEqual(levels(reminders), [ReminderLevel.SECOND])

    def test_req_02_history_of_another_invoice_does_not_count(self) -> None:
        sent = [SentReminder(invoice_id=99, level=ReminderLevel.FIRST, sent_on=date(2026, 3, 8))]

        reminders = plan_reminders([make_invoice()], sent, date(2026, 3, 22))

        self.assertEqual(levels(reminders), [ReminderLevel.FIRST])

    def test_req_03_final_reminder_fourteen_days_after_second(self) -> None:
        sent = [
            SentReminder(invoice_id=1, level=ReminderLevel.SECOND, sent_on=date(2026, 4, 10)),
            SentReminder(invoice_id=1, level=ReminderLevel.FIRST, sent_on=date(2026, 3, 8)),
        ]

        reminders = plan_reminders([make_invoice()], sent, date(2026, 4, 24))

        self.assertEqual(levels(reminders), [ReminderLevel.FINAL])

    def test_req_03_no_final_reminder_thirteen_days_after_second(self) -> None:
        sent = [
            SentReminder(invoice_id=1, level=ReminderLevel.FIRST, sent_on=date(2026, 3, 8)),
            SentReminder(invoice_id=1, level=ReminderLevel.SECOND, sent_on=date(2026, 4, 10)),
        ]

        self.assertEqual(plan_reminders([make_invoice()], sent, date(2026, 4, 23)), [])

    def test_req_04_nothing_after_final_reminder(self) -> None:
        sent = [
            SentReminder(invoice_id=1, level=ReminderLevel.FIRST, sent_on=date(2026, 3, 8)),
            SentReminder(invoice_id=1, level=ReminderLevel.SECOND, sent_on=date(2026, 3, 22)),
            SentReminder(invoice_id=1, level=ReminderLevel.FINAL, sent_on=date(2026, 4, 5)),
        ]

        self.assertEqual(plan_reminders([make_invoice()], sent, date(2026, 4, 19)), [])
        self.assertEqual(plan_reminders([make_invoice()], sent, date(2027, 1, 1)), [])

    def test_req_04_final_only_history_plans_nothing(self) -> None:
        sent = [SentReminder(invoice_id=1, level=ReminderLevel.FINAL, sent_on=date(2026, 3, 8))]

        self.assertEqual(plan_reminders([make_invoice()], sent, date(2026, 6, 1)), [])


class MinimumBalanceTest(unittest.TestCase):
    def test_req_05_no_reminder_below_500_cents(self) -> None:
        invoice = make_invoice(line_amounts=(10000,), paid_cents=9501)

        self.assertEqual(plan_reminders([invoice], [], date(2026, 3, 8)), [])

    def test_req_05_reminder_at_exactly_500_cents(self) -> None:
        invoice = make_invoice(line_amounts=(300, 200), paid_cents=0)

        self.assertEqual(levels(plan_reminders([invoice], [], date(2026, 3, 8))), [ReminderLevel.FIRST])

    def test_req_05_no_escalation_below_500_cents(self) -> None:
        invoice = make_invoice(line_amounts=(499,))
        sent = [SentReminder(invoice_id=1, level=ReminderLevel.FIRST, sent_on=date(2026, 3, 8))]

        self.assertEqual(plan_reminders([invoice], sent, date(2026, 3, 22)), [])

    def test_req_05_no_reminder_when_overpaid(self) -> None:
        invoice = make_invoice(line_amounts=(1000,), paid_cents=5000)

        self.assertEqual(plan_reminders([invoice], [], date(2026, 3, 8)), [])


class IssuedOnlyTest(unittest.TestCase):
    def test_req_06_no_reminder_for_draft_paid_or_cancelled(self) -> None:
        for status in (InvoiceStatus.DRAFT, InvoiceStatus.PAID, InvoiceStatus.CANCELLED):
            with self.subTest(status=status):
                self.assertEqual(plan_reminders([make_invoice(status=status)], [], date(2026, 3, 8)), [])

    def test_req_06_no_escalation_for_paid_invoice(self) -> None:
        sent = [SentReminder(invoice_id=1, level=ReminderLevel.FIRST, sent_on=date(2026, 3, 8))]

        self.assertEqual(plan_reminders([make_invoice(status=InvoiceStatus.PAID)], sent, date(2026, 3, 22)), [])


class OrderingTest(unittest.TestCase):
    def test_req_08_ordered_by_customer_then_invoice_id(self) -> None:
        invoices = [
            make_invoice(invoice_id=1, customer="Bravo"),
            make_invoice(invoice_id=10, customer="Alpha"),
            make_invoice(invoice_id=9, customer="Alpha"),
            make_invoice(invoice_id=2, customer="Charlie"),
        ]

        reminders = plan_reminders(invoices, [], date(2026, 3, 8))

        self.assertEqual([(r.customer, r.invoice_id) for r in reminders], [("Alpha", 9), ("Alpha", 10), ("Bravo", 1), ("Charlie", 2)])

    def test_req_08_one_reminder_per_invoice(self) -> None:
        sent = [
            SentReminder(invoice_id=1, level=ReminderLevel.FIRST, sent_on=date(2026, 3, 8)),
            SentReminder(invoice_id=1, level=ReminderLevel.FIRST, sent_on=date(2026, 3, 9)),
        ]

        reminders = plan_reminders([make_invoice()], sent, date(2026, 6, 1))

        self.assertEqual(levels(reminders), [ReminderLevel.SECOND])


if __name__ == "__main__":
    unittest.main()
