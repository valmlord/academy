"""Mutant m02_days_from_due_date of the late fee (docs/late-fee.md, REQ-01..REQ-05)."""

GRACE_DAYS = 5
DAILY_RATE_PER_MILLE = 1  # 0.1% of the amount per day after the grace period
CAP_PERCENT = 10


def late_fee(amount_cents: int, days_late: int) -> int:
    if amount_cents <= 0:
        raise ValueError("amount_cents must be positive")
    if days_late <= GRACE_DAYS:
        return 0
    fee = amount_cents * DAILY_RATE_PER_MILLE * days_late // 1000
    cap = amount_cents * CAP_PERCENT // 100
    return min(fee, cap)
