"""Receipt text for a paid invoice."""

from invoices.legacy_format import money_str


def receipt(invoice_id: int, paid_cents: int, currency: str) -> str:
    return f"Receipt for invoice #{invoice_id}: {money_str(paid_cents, currency)} received."
