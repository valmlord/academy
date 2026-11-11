"""Money formatting of the partner CSV format.

Contract: the partner tool `partner-sync` imports `invoices.legacy_format.money_str` directly
(contract PS-2024-07, valid until 2027). Do not move, rename or change this module.
"""


def money_str(cents: int, currency: str) -> str:
    return f"{currency} {cents // 100},{cents % 100:02d}"
