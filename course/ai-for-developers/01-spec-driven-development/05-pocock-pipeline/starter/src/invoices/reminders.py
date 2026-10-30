"""Payment reminders, see docs/spec.md (REQ-01..REQ-08)."""

from datetime import date

from invoices.models import Invoice, Reminder, SentReminder


def plan_reminders(invoices: list[Invoice], sent_reminders: list[SentReminder], today: date) -> list[Reminder]:
    raise NotImplementedError("plan_reminders is not implemented yet: see docs/tasks.md")
