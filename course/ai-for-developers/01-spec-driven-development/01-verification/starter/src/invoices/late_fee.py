"""Late fee for an overdue invoice, see docs/late-fee.md."""

GRACE_DAYS = 5
DAILY_RATE = 0.001
CAP_RATE = 0.10


def late_fee(amount_cents: int, days_late: int) -> int:
    if amount_cents < 0:
        raise ValueError("amount_cents must be positive")
    if days_late <= GRACE_DAYS:
        return 0
    fee = round(amount_cents * (days_late - GRACE_DAYS) * DAILY_RATE)
    return min(fee, int(amount_cents * CAP_RATE))
