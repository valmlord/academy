"""Mutant m03_final_after_seven_days of payment reminders, see docs/spec.md (REQ-01..REQ-08 and the dispute rule)."""

from datetime import date

from invoices.models import DisputeState, Invoice, InvoiceStatus, Reminder, ReminderLevel, SentReminder

FIRST_AFTER_DUE_DAYS = 7  # REQ-01
ESCALATION_AFTER_DAYS = 14  # REQ-02, REQ-03: days since the reminder of the highest level sent
MIN_OUTSTANDING_CENTS = 500  # REQ-05
NEXT_LEVEL = {ReminderLevel.FIRST: ReminderLevel.SECOND, ReminderLevel.SECOND: ReminderLevel.FINAL}


def outstanding_cents(invoice: Invoice) -> int:
    return sum(line.amount_cents for line in invoice.lines) - invoice.paid_cents


def next_level(invoice: Invoice, history: list[SentReminder], today: date) -> ReminderLevel | None:
    if not history:
        if (today - invoice.due_on).days >= FIRST_AFTER_DUE_DAYS:
            return ReminderLevel.FIRST
        return None
    highest = max((sent.level for sent in history), key=lambda level: level.value)
    if highest not in NEXT_LEVEL:
        return None  # REQ-04: nothing after FINAL
    last_sent_on = max(sent.sent_on for sent in history if sent.level is highest)
    if (today - last_sent_on).days >= (7 if highest is ReminderLevel.SECOND else ESCALATION_AFTER_DAYS):
        return NEXT_LEVEL[highest]
    return None


def plan_reminders(invoices: list[Invoice], sent_reminders: list[SentReminder], today: date) -> list[Reminder]:
    planned: list[Reminder] = []
    seen: set[int] = set()
    for invoice in invoices:
        if invoice.id in seen:
            continue  # REQ-08: at most one reminder per invoice; the first occurrence counts
        seen.add(invoice.id)
        if invoice.status is not InvoiceStatus.ISSUED:
            continue
        if invoice.dispute is DisputeState.OPEN:
            continue
        balance = outstanding_cents(invoice)
        if balance < MIN_OUTSTANDING_CENTS:
            continue
        history = [sent for sent in sent_reminders if sent.invoice_id == invoice.id]
        level = next_level(invoice, history, today)
        if level is not None:
            planned.append(Reminder(invoice.id, invoice.customer, level, balance, invoice.currency))
    return sorted(planned, key=lambda reminder: (reminder.customer, reminder.invoice_id))
