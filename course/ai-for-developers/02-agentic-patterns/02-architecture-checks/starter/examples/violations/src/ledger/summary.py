"""Monthly summary of receivables."""

from invoices.models import Invoice


def open_total(invoices: list[Invoice]) -> int:
    return sum(sum(line.amount_cents for line in invoice.lines) - invoice.paid_cents for invoice in invoices)
