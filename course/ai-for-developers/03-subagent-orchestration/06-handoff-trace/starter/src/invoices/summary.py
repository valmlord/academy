"""Invoice summary for the statement e-mail: net, tax and total in cents."""

import logging

from invoices.models import Invoice
from invoices.tax_rates import DEFAULT_ZONE
from invoices.totals import net_cents, tax_cents, total

log = logging.getLogger(__name__)


def invoice_summary(invoice: Invoice, zone: str = DEFAULT_ZONE) -> dict[str, int]:
    summary = {"net": net_cents(invoice.lines), "tax": tax_cents(invoice.lines, zone),
               "total": total(invoice.lines, zone)}
    log.info("invoice summary %s for %s", summary, invoice.customer)
    return summary


def overdue_total(invoices: list[Invoice], zone: str = DEFAULT_ZONE) -> int:
    return sum(total(invoice.lines, zone) for invoice in invoices)
