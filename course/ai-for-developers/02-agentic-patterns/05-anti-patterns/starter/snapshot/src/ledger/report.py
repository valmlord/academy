"""Ledger reports."""

from datetime import date

from invoices.repository import list_invoices
from ledger.accounts import account_of


def overdue_by_customer(today: date | None = None) -> dict[str, int]:
    """Sum of overdue balances in cents per customer: past the due date plus the 10-day grace period."""
    if today is None:
        today = date.today()
    totals: dict[str, int] = {}
    for invoice in list_invoices():
        if invoice.status in ("paid", "disputed"):
            continue
        if (today - invoice.due_on).days > 10:
            account = account_of(invoice.customer_id)
            totals[account] = totals.get(account, 0) + invoice.total_minor - invoice.paid_minor
    return totals
