from invoices.models import Invoice

ALLOWED_STATUSES = frozenset({"draft", "sent", "paid"})


class UnknownStatusError(ValueError):
    def __init__(self, status: str) -> None:
        super().__init__(f"unknown invoice status {status!r}, expected one of {sorted(ALLOWED_STATUSES)}")


def validate_status(status: str | None) -> str | None:
    if status is not None and status not in ALLOWED_STATUSES:
        raise UnknownStatusError(status)
    return status


def to_json_dict(invoice: Invoice) -> dict[str, object]:
    return {
        "id": invoice.id,
        "customer": invoice.customer,
        "amount_cents": invoice.amount_cents,
        "currency": invoice.currency,
        "status": invoice.status,
        "issued_on": invoice.issued_on.isoformat(),
    }
