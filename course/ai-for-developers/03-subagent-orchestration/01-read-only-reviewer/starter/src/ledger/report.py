"""Text report of journal entries for the accounting team."""

from ledger.accounts import Entry
from shared.money import format_cents

LEDGER_CURRENCY = "EUR"


def entry_lines(entries: list[Entry]) -> list[str]:
    return [
        f"{entry.booked_on.isoformat()} {entry.account_code} Dr {format_cents(entry.debit_cents, LEDGER_CURRENCY)}"
        f" Cr {format_cents(entry.credit_cents, LEDGER_CURRENCY)} {entry.reference}"
        for entry in entries
    ]
