"""CSV export for the partner tool: one row per invoice, amounts in the partner format."""

from invoices.legacy_format import money_str
from invoices.models import Invoice

SEPARATOR = ";"


def csv_row(invoice: Invoice) -> str:
    total_cents = sum(line.amount_cents for line in invoice.lines)
    return SEPARATOR.join([str(invoice.id), invoice.customer, money_str(total_cents, invoice.currency),
                           invoice.status.value])
