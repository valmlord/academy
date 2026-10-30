"""Chart of accounts and journal entries of the accounting ledger."""

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Account:
    code: str  # e.g. "1200"
    name: str  # e.g. "Receivables"


@dataclass(frozen=True)
class Entry:
    account_code: str
    debit_cents: int
    credit_cents: int
    booked_on: date
    reference: str
