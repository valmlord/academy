"""Payment reminders, see docs/spec.md (REQ-01..REQ-08)."""

from datetime import date, timedelta

from invoices.models import Invoice, InvoiceStatus, Reminder, ReminderLevel, SentReminder

# REQ-01: the FIRST Reminder waits this long after the due date.
FIRST_REMINDER_DELAY = timedelta(days=7)
# REQ-02, REQ-03: each escalation waits this long after the previous Reminder was sent.
ESCALATION_DELAY = timedelta(days=14)
# REQ-05: below this Outstanding Balance no Reminder is planned.
MINIMUM_OUTSTANDING_CENTS = 500

NEXT_LEVEL = {ReminderLevel.FIRST: ReminderLevel.SECOND, ReminderLevel.SECOND: ReminderLevel.FINAL}


def _outstanding_cents(invoice: Invoice) -> int:
    return sum(line.amount_cents for line in invoice.lines) - invoice.paid_cents


def _latest_highest(history: list[SentReminder]) -> SentReminder | None:
    if not history:
        return None
    return max(history, key=lambda sent: (sent.level.value, sent.sent_on))


def _next_level(invoice: Invoice, history: list[SentReminder], today: date) -> ReminderLevel | None:
    latest = _latest_highest(history)
    if latest is None:
        return ReminderLevel.FIRST if today - invoice.due_on >= FIRST_REMINDER_DELAY else None
    next_level = NEXT_LEVEL.get(latest.level)
    if next_level is None or today - latest.sent_on < ESCALATION_DELAY:
        return None
    return next_level


def plan_reminders(invoices: list[Invoice], sent_reminders: list[SentReminder], today: date) -> list[Reminder]:
    planned: dict[int, Reminder] = {}
    for invoice in invoices:
        if invoice.id in planned or invoice.status is not InvoiceStatus.ISSUED:
            continue
        outstanding = _outstanding_cents(invoice)
        if outstanding < MINIMUM_OUTSTANDING_CENTS:
            continue
        history = [sent for sent in sent_reminders if sent.invoice_id == invoice.id]
        level = _next_level(invoice, history, today)
        if level is None:
            continue
        planned[invoice.id] = Reminder(
            invoice_id=invoice.id,
            customer=invoice.customer,
            level=level,
            outstanding_cents=outstanding,
            currency=invoice.currency,
        )
    return sorted(planned.values(), key=lambda reminder: (reminder.customer, reminder.invoice_id))
