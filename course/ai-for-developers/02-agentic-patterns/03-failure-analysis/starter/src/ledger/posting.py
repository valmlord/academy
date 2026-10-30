"""Turns billing events into balanced ledger entries."""

from datetime import date

from ledger.accounts import Entry

RECEIVABLES = "1200"
BANK = "1000"
REVENUE = "4000"


def post_invoice_issued(invoice_id: int, amount_cents: int, booked_on: date) -> list[Entry]:
    reference = f"invoice-{invoice_id}"
    return [
        Entry(RECEIVABLES, amount_cents, 0, booked_on, reference),
        Entry(REVENUE, 0, amount_cents, booked_on, reference),
    ]


def post_payment_received(invoice_id: int, amount_cents: int, booked_on: date) -> list[Entry]:
    reference = f"payment-{invoice_id}"
    return [
        Entry(BANK, amount_cents, 0, booked_on, reference),
        Entry(RECEIVABLES, 0, amount_cents, booked_on, reference),
    ]
