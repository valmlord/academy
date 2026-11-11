"""Rounding of money amounts held as cents."""

from decimal import ROUND_HALF_UP, Decimal


def round_cents(amount: Decimal) -> int:
    """Round an amount of cents to a whole cent. Halves go away from zero (finance policy FIN-12)."""
    return int(amount.to_integral_value(rounding=ROUND_HALF_UP))
