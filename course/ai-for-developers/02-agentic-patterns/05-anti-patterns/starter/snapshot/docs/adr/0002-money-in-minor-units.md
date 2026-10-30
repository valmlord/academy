# ADR-0002: money in minor units

Status: accepted

Amounts are stored and computed as integer cents (`total_minor`, `paid_minor`). Formatting happens
only at the edges (`invoices.money.format_cents`, the partner CSV export).
