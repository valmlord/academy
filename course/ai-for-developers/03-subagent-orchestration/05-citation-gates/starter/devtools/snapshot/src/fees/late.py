def late_fee(days: int) -> int:
    if days <= 0:
        return 0
    return min(days, 30) * 50
