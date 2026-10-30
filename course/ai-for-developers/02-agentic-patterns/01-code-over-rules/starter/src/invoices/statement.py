"""One line of a customer statement: the open balance of an invoice and its late fee."""

from datetime import date

from invoices.late_fee import late_fee
from invoices.models import Invoice
from invoices.money import format_cents


def statement_line(invoice: Invoice, today: date) -> str:
    balance = sum(line.amount_cents for line in invoice.lines) - invoice.paid_cents
    days_late = (today - invoice.due_on).days
    fee = late_fee(days_late, balance) if balance > 0 else 0
    return f"#{invoice.id} {invoice.customer}: {format_cents(balance, invoice.currency)} + fee {format_cents(fee, invoice.currency)}"
