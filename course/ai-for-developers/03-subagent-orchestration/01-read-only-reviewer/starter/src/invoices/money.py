"""Billing's money formatting; the implementation lives in shared.money so ledger can use it too."""

from shared.money import format_cents

__all__ = ["format_cents"]
