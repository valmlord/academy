"""Domain model of the Billing context."""

from dataclasses import dataclass
from datetime import date
from enum import Enum


class InvoiceStatus(Enum):
    DRAFT = "draft"
    ISSUED = "issued"
    PAID = "paid"
    CANCELLED = "cancelled"


class DisputeState(Enum):
    NONE = "none"
    OPEN = "open"
    RESOLVED = "resolved"


@dataclass(frozen=True)
class InvoiceLine:
    description: str
    amount_cents: int


@dataclass(frozen=True)
class Invoice:
    id: int
    customer: str
    currency: str
    status: InvoiceStatus
    dispute: DisputeState
    issued_on: date
    due_on: date
    lines: list[InvoiceLine]
    paid_cents: int
