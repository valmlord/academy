"""Invoice totals in cents: the net amount, the tax on it, and their sum."""

from collections.abc import Sequence
from decimal import Decimal

from invoices.models import InvoiceLine
from invoices.rounding import round_cents
from invoices.tax_rates import DEFAULT_ZONE, rate_bp

BASIS_POINTS_PER_UNIT = Decimal(10_000)


def net_cents(lines: Sequence[InvoiceLine]) -> int:
    return sum(line.amount_cents for line in lines)


def tax_cents(lines: Sequence[InvoiceLine], zone: str) -> int:
    # Tax is computed on the invoice's net amount and rounded once (FIN-12); rounding each line first
    # made totals drift by a cent from the accountant's figures.
    # round_cents decides how halves round; see invoices/rounding.py.
    raw = Decimal(net_cents(lines)) * rate_bp(zone) / BASIS_POINTS_PER_UNIT
    return round_cents(raw)


def total(lines: Sequence[InvoiceLine], zone: str = DEFAULT_ZONE) -> int:
    return net_cents(lines) + tax_cents(lines, zone)
