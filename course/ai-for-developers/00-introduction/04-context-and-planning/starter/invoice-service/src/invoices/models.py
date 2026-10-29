from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Invoice:
    id: int
    customer: str
    amount_cents: int
    currency: str
    status: str
    issued_on: date
