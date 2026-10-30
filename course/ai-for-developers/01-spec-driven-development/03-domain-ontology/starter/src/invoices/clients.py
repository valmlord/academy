"""Lookups used by the support desk. The names here grew over three rewrites."""

from dataclasses import dataclass

from invoices.models import Invoice


@dataclass(frozen=True)
class ClientAccount:
    account_id: str
    client_name: str
    billing_email: str


def bills_for_client(invoices: list[Invoice], client_name: str) -> list[Invoice]:
    return [bill for bill in invoices if bill.customer == client_name]


def account_total_cents(invoices: list[Invoice], account: ClientAccount) -> int:
    return sum(bill.amount_cents for bill in bills_for_client(invoices, account.client_name))


def record_settlement(bill_id: int, amount_cents: int) -> dict[str, int]:
    if amount_cents <= 0:
        raise ValueError(f"settlement for bill {bill_id} must be positive, got {amount_cents}")
    return {"bill_id": bill_id, "settled_cents": amount_cents}
