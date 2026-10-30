"""Domain model of the Billing context (fixed by docs/feature-brief.md)."""

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


class ReminderLevel(Enum):
    FIRST = 1
    SECOND = 2
    FINAL = 3


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


@dataclass(frozen=True)
class SentReminder:
    invoice_id: int
    level: ReminderLevel
    sent_on: date


@dataclass(frozen=True)
class Reminder:
    invoice_id: int
    customer: str
    level: ReminderLevel
    outstanding_cents: int
    currency: str
