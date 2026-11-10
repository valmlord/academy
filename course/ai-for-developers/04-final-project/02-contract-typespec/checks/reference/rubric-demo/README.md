# contract-rubric demo (design 6, S11)

| Artifacts | 1 @doc | 2 reuse | 3 errors | 4 grouping | Sum / 8 | Verdict |
|---|---|---|---|---|---|---|
| untouched starter `contract/main.tsp` (no operations, no models) | 0 | 0 | 0 | 0 | 0.00 | FAIL |
| reference `checks/reference/contract/` | 2 | 2 | 2 | 2 | 1.00 | PASS |

Reference: every operation, model, scalar and union has a `@doc`; Schedule and EventType are id plus a
spread of their request fields, Booking is id plus `...BookingRequest` plus end, status and createdAt, `ItemList<Item>` wraps all lists, `Problem<Status>` is the one error family
with `BadRequest`/`NotFound`/`Conflict`/`Unprocessable`; operations are grouped in the `Schedules`,
`EventTypes` and `Bookings` namespaces with the route on the group, models in `models.tsp`.

Criterion 2 against the first reference (Q2, B3): BookingRequest and Booking each repeated `eventTypeId`, `start`,
`inviteeName`, `inviteeEmail` and `inviteeTimeZone` by hand. That is the "1" level ("one pair of models duplicates its
fields by hand"), not 2, so the demo's 2 was wrong (the sum would have been 7/8 = 0.875, still PASS). The reference
was fixed, not the rubric: Booking now spreads BookingRequest. The emitted document keeps the same component schemas;
only the property order of Booking and its doc strings change. openapi.expected.json was regenerated from the fixed
reference (L2, L4 and later copies), and the earlier form (fields repeated) still passes contract-matches, because
property order and descriptions are not compared.
