# ui-rubric demo (design 6, S11)

| Artifacts | 1 flow | 2 generated types | 3 component test | 4 E2E | Sum / 8 | Verdict |
|---|---|---|---|---|---|---|
| untouched starter (`app/app.vue` placeholder, no tests, no spec) | 0 | 0 | 0 | 0 | 0.00 | FAIL |
| reference `checks/reference/frontend/` | 2 | 2 | 2 | 2 | 1.00 | PASS |

Reference, per criterion:
1. `SlotPicker.vue` lists the slots as buttons; `BookingForm.vue` posts `POST /bookings` with `inviteeTimeZone: tz`
   and shows "Встреча забронирована." on 201, "Это время только что заняли. Выберите другое." on 409 and a
   generic message otherwise.
2. `app/api/client.ts` is the only client: `createClient<paths>` from the generated `schema.d.ts`; the page and the
   form call `client.GET('/event-types/{eventTypeId}/slots', ...)` and `client.POST('/bookings', ...)`.
3. `test/SlotPicker.nuxt.spec.ts` mocks `~/api/client` with `vi.mock`, feeds three slots around the Berlin spring
   gap of 2026-03-29 (one on the previous local date) and asserts the two rendered `[data-slot-start, HH:MM]` pairs
   and the exact request. `make test-web` runs it green (plans/44-demos/B3/check-notes.md).
4. `e2e/booking.spec.ts` has the three scenarios; `docs/e2e-run.md` holds the local run (see that file for how it
   was produced).
