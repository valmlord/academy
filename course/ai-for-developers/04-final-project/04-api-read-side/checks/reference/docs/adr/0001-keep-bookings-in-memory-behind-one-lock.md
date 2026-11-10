---
status: accepted
date: 2026-11-04
---

# Keep bookings in process memory, checked and written under one lock

## Context and Problem Statement

Two Invitee may book overlapping Slot at the same moment, and every Booking blocks every Event Type of
the one Host. Where do we keep Booking, and what makes "the Slot is free" and "write the Booking" one
step, so that exactly one of two simultaneous requests wins? The choice shapes deployment, tests and
restarts, and is costly to change once the API runs.

## Considered Options

* In-memory store; one mutex held across the free-check, the seam delay and the write
* SQLite (modernc, no cgo) with `BEGIN IMMEDIATE` transactions in WAL mode
* A separate PostgreSQL server with an exclusion constraint on the meeting interval

## Decision Outcome

Chosen option: "In-memory store; one mutex held across the free-check, the seam delay and the write",
because it makes the critical section explicit and testable with the concurrency probe, adds no
dependency, and the Host accepted losing state on restart for now (interview).

### Consequences

* Good, because the check and the write cannot interleave: every Booking request for the Host is
  serialised, and reads that must not see half-written state take the same lock.
* Good, because tests start a fresh server per run with no database to prepare.
* Bad, because all Booking are lost when the process restarts, and two processes would each have
  their own store; scaling out or keeping data means moving to SQLite or PostgreSQL behind the same
  store interface.
* Bad, because one lock serialises all Booking writes of the Host; acceptable for one Host.
