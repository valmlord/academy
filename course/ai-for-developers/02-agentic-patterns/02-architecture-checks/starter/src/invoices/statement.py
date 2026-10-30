"""Customer statement lines: the open balance of an invoice and its late fee."""

from datetime import date

from invoices.late_fee import late_fee
from invoices.legacy_format import money_str
from invoices.models import Invoice
from invoices.money import format_cents


def statement_line(invoice: Invoice, today: date) -> str:
    balance = sum(line.amount_cents for line in invoice.lines) - invoice.paid_cents
    days_late = (today - invoice.due_on).days
    fee = late_fee(amount_cents=balance, days_late=days_late) if balance > 0 else 0
    return f"#{invoice.id} {invoice.customer}: {format_cents(balance, invoice.currency)} + fee {format_cents(fee, invoice.currency)}"


def render_statement_line(invoice_id: int, amount_cents: int, fee_cents: int, currency: str) -> str:
    """Short statement line for the reminder e-mail, amounts already computed."""
    return f"#{invoice_id}: {money_str(amount_cents, currency)} + fee {money_str(fee_cents, currency)}"
