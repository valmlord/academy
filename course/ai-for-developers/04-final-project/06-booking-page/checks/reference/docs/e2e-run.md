# E2E run on my machine

How it was started:

```sh
make build && CALENDAR_API_URL=http://127.0.0.1:18080 make build-web
HOST=127.0.0.1 PORT=18080 CALENDAR_NOW=2026-03-01T08:00:00Z ./bin/server
HOST=127.0.0.1 PORT=13000 CALENDAR_API_URL=http://127.0.0.1:18080 make serve-web
cd frontend && WEB_URL=http://127.0.0.1:13000 npx playwright test --reporter=list
```

Output (macOS, Chrome Headless Shell 156, @playwright/test 1.64.1):

```text
Running 3 tests using 1 worker
  ✓  1 e2e/booking.spec.ts:25:1 › an invitee picks a free slot and sees the confirmation (593ms)
  ✓  2 e2e/booking.spec.ts:33:1 › a slot taken by someone else while the form is open is reported, not booked twice (180ms)
  ✓  3 e2e/booking.spec.ts:47:1 › on the spring-forward date the local times skip the missing hour (72ms)
  3 passed (2.9s)
```
