"""Money formatting shared by billing and accounting: integer cents as `<units>.<cents> <currency>`."""


def format_cents(cents: int, currency: str) -> str:
    sign = "-" if cents < 0 else ""
    magnitude = abs(cents)
    return f"{sign}{magnitude // 100}.{magnitude % 100:02d} {currency}"
