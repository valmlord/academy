"""Late fee for an overdue invoice, see docs/late-fee.md."""

GRACE_DAYS = 5
# 0.1% per day: the fee is amount * days / DAILY_RATE_DIVISOR, kept in integers (REQ-03).
DAILY_RATE_DIVISOR = 1000
# 10% cap: amount // CAP_DIVISOR (REQ-04).
CAP_DIVISOR = 10
DOMAIN_LIMIT = 1_000_000_000


def _in_domain(value: object) -> bool:
    return type(value) is int and -DOMAIN_LIMIT <= value <= DOMAIN_LIMIT


def late_fee(amount_cents: int, days_late: int) -> int:
    if not (_in_domain(amount_cents) and _in_domain(days_late)):
        raise TypeError("late_fee: arguments outside the interface domain")
    if amount_cents <= 0:
        raise ValueError("amount_cents must be positive")
    if days_late <= GRACE_DAYS:
        return 0
    base_fee = amount_cents * (days_late - GRACE_DAYS) // DAILY_RATE_DIVISOR
    return min(base_fee, amount_cents // CAP_DIVISOR)
