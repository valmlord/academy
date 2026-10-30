# ADR-0004: Keep money as integer minor units

Status: accepted

## Context

Invoice lines, payments, late fees and reminder amounts are added and compared all the time.
Binary floating point cannot represent most decimal amounts exactly, and rounding differences
between two sums of the same lines have already caused a support case.

## Decision

Every amount is an `int` number of minor units (cents). Percentages are applied with integer
arithmetic and rounded down where a policy says so.

## Consequences

- Sums and comparisons are exact.
- Formatting for people divides by 100 in exactly one place.
- A currency with a different number of minor units would need a change in every amount field.
