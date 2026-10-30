from invoices.models import Invoice, InvoiceStatus

ALLOWED_STATUSES = frozenset(status.value for status in InvoiceStatus)


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
        "amount_cents": sum(line.amount_cents for line in invoice.lines),
        "currency": invoice.currency,
        "status": invoice.status.value,
        "issued_on": invoice.issued_on.isoformat(),
        "due_on": invoice.due_on.isoformat(),
    }
