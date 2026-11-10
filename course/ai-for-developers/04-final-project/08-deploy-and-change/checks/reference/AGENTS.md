# AGENTS.md

Rules for an agent that changes this repository (a booking calendar: Go API in `backend/`, Nuxt page in
`frontend/`, the API contract in `contract/`).

## Order of work: the contract first

1. Change the requirement in `docs/spec.md` (a new or changed `REQ-NN` line) and, when it is a new slice, add it to
   `docs/tasks.md`.
2. Change the contract in `contract/*.tsp`. It is the source of truth for the API: field names, bounds, status codes and
   problem codes come from it, never from the server code.
3. Run `make gen`. It compiles the contract and regenerates `frontend/app/api/schema.d.ts`. Commit the generated
   file; never edit it by hand.
4. Change the server (`backend/internal/api`) and, if the change touches slots, the engine (`backend/internal/slots`,
   with a case file in `testdata/slots/`).
5. Add or change the API tests in `backend/apitest/` so that the new behaviour fails without your change.
6. Run `make ci`. The work is done only when it exits 0.

## make ci

`make ci` runs `go vet`, the unit tests and the slot cases, the API suite (against `CALENDAR_API_URL` when it is set,
otherwise against its own `bin/server`), the page's component test, and the drift check (`make gen`, then
`git diff --exit-code` on the generated client).

## Do not

- Do not edit `frontend/app/api/schema.d.ts` by hand, and do not skip `make gen` after a contract change.
- Do not make tests pass by weakening them; a failing API test means the server or the contract is wrong.
- Do not move the booking delay (`CALENDAR_BOOKING_DELAY_MS`) out of the section that checks and writes a booking.
- Do not add dependencies that need network at build time without vendoring them (`backend/vendor/`).
