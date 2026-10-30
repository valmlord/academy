# Issue #29 test report (tester phase)

Branch `feat/29-sign-in-dashboard`, HEAD `df0910b` (10 commits on top of `main`, `main` is an ancestor).
Date 2026-10-30. Every line below comes from a command run in this session; logs are in the tester
scratchpad `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/tester/`.
No product file was changed: every mutation was restored and proven with `cmp`, and `git diff HEAD -- apps packages`
is empty after the run.

```
TEST REPORT (#29)
lint/typecheck: ok (lint with explicit paths; plain `pnpm lint` trips on the #42 worktree's nested biome.json)
unit: 151 passed / 0 failed (web 105, db 34, lesson-schema 12)
content: ok (1 course, 6 modules, 13 lessons, 0 issues)
stack: healthy (academy-t29: db healthy, web healthy)
integration: db 41 passed, web 25 passed
e2e: 17 passed / 0 failed, 4 full runs (3 in a row, 1 after the M-revoke-out restore rebuild)
design: deviations listed (section 9); none outside the 9.2 waiver except minor control sizing
Missing tests: none of the design's named tests are missing
```

## 1. Isolation evidence (design 13.5)

Env file: the coder's `t29-env.sh` (same scratchpad); the secret and password were never printed (only `grep -c` of
the two `export` lines: 2). Every compose call went through `t29`; the one bare `docker compose config --quiet` was the
read-only missing-secret check (section 6).

| Item | Before | After |
|---|---|---|
| `academy_db-data` CreatedAt | 2026-10-29T04:32:08Z | 2026-10-29T04:32:08Z |
| `academy-web:local` | absent | absent |
| root `.env` | absent | absent |

`diff before.txt after.txt`: identical. Wrapper refusals re-checked: `t29 -p academy ps` -> `t29 REFUSED: -p is fixed by the
wrapper`, rc 97; `COMPOSE_PROJECT_NAME=academy t29 ps` -> `t29 REFUSED: COMPOSE_PROJECT_NAME=academy`, rc 97. No container of
project `academy` existed before or after; no `academy.workspace` containers. Final state: `t29 down` (no `-v`): the
`academy-t29_db-data` volume and `academy-web:t29` (50360768e857, built from the restored tree) are kept.

## 2. Static checks, unit, build

| Item | Command | Result |
|---|---|---|
| clean state | `rm -rf apps/web/.next apps/web/playwright/.auth apps/web/test-results`; `pnpm install --frozen-lockfile` | "Lockfile is up to date", PASS |
| lint | `pnpm lint` | "Found a nested root configuration" (`.claude/worktrees/content-42-...`), environment only |
| lint, explicit paths | `biome check <top-level entries minus .git .claude node_modules .turbo> .claude/agents .claude/feedback .claude/hooks .claude/pipeline.json .claude/settings.json` | "Checked 157 files", rc 0, PASS |
| typecheck | `pnpm typecheck --force` | 5/5 tasks, 0 cached, PASS (no stale `.next/dev/types`) |
| unit | `pnpm test --force` | web 14 files 105 tests, db 34, lesson-schema 12, PASS |
| design-named unit files | `ls` of the 14 files of 13.1 | all present; `course-list*` deleted (step 47) |
| content | `pnpm content:validate` | 0 issues, PASS |
| build without secrets | `env -u BETTER_AUTH_SECRET -u DATABASE_URL pnpm build --force` | rc 0; routes `/` ƒ, `/sign-in` ƒ, `/api/auth/[...all]` ƒ, Proxy; PASS (M23 path holds) |
| build changes no tracked file | `git status --porcelain` after build | only the orchestrator's pre-existing feedback edits, PASS |

**Turbopack warnings and standalone size.** 3 warnings, all "Dynamic filesystem access causes tracing of the whole
project" at `packages/lesson-schema/dist/validate.js:158:25`, `:158:42`, `:157:31`, reached via
`@academy/db/dist/vocabulary.js` from both `app/api/auth/[...all]/route.ts` (new) and `instrumentation.ts` (exists on
main). I built a `git archive main` snapshot the same way: **main prints the same 3 warnings** and also traces the
apps/web sources (tests included) into standalone. Pre-existing, not introduced by #29.
Standalone: branch 46 MB (`node_modules` 40 MB, `apps` 6.1 MB of which `.next` 4.8 MB), main 41 MB; +5 MB is
better-auth and its deps. Side effect (pre-existing): the image ships `apps/web` sources incl. `*.test.ts`,
`test/integration/*`, `e2e/*` and `scripts/seed.ts` (`docker run ... find /app -name '*.test.ts*'` lists 18). No
`.env*`, `learner.json` or key file is in the image (`.dockerignore` covers them). Low priority follow-up, not a #29 bug.

## 3. Database checks

| Item | Command | Result |
|---|---|---|
| append-only | `check-append-only.sh` needs a PR merge commit, so emulated: `git diff --name-status --diff-filter=DMR main HEAD -- 'packages/db/drizzle/*.sql' 'packages/db/drizzle/meta/*_snapshot.json'` | empty; only `A 0001_auth.sql`, `A 0001_snapshot.json`, `M _journal.json`, PASS |
| db:check | `pnpm --filter @academy/db run db:check` | "Everything's fine", PASS |
| drift | `bash packages/db/scripts/check-drift.sh` | "No schema changes ... migrations match the schema", rc 0, PASS |

## 4. Integration

`pnpm test:integration --force`: db 3 files 41 tests (incl. I-db-1..3 in `schema.int.test.ts`, 33 tests), web 4 files
25 tests (`auth-config` 9, `session` 6, `seed` 9, `db` 1). PASS.

## 5. Stack, image checks, seed

| Item | Result |
|---|---|
| `t29 down -v` (fresh state), then `t29 up -d --build --wait` | rc 0, db and web `healthy`, web on 127.0.0.1:3180, db on 127.0.0.1:55432 |
| `check-image-migrations.sh` (follows `COMPOSE_PROJECT_NAME=academy-t29`) | `I1 OK applied=2`, `I2 OK rc=1`, `I3 OK rc=1`, `I3b OK rc=1`, `I3c OK rc=1`, PASS |
| `pnpm seed` fresh | `seed: created`, PASS |
| `pnpm seed` re-run | `seed: updated`, PASS |
| repaired path: `DELETE FROM accounts` + a session row for the user, then `pnpm seed` | `seed: repaired`; afterwards 1 credential account, 0 sessions, 1 user; `curl` sign-in with the seed values -> 200, PASS |
| `SEED_PASSWORD` of 7 chars | `seed: InvalidSeedInputError: SEED_PASSWORD must be 8 to 128 characters, got 7`, rc 1 |
| DB URL port 1, password `canary-url-pw` | `seed: Error (ECONNREFUSED); check that the database is running ... (docker compose up -d --wait db)`, rc 1, no canary |
| no secret | `seed: InvalidAuthSecretError: BETTER_AUTH_SECRET is missing`, rc 1 |
| live proxy | `/courses/a?tab=x` on 127.0.0.1:3180 -> 307 `http://127.0.0.1:3180/sign-in?next=%2Fcourses%2Fa%3Ftab%3Dx`; `localhost:3180/` keeps `localhost`; anonymous `get-session` -> 200 `null`; `POST /sign-up/email` -> 400 |

## 6. Docs and compose behaviour

- Missing secret: `t29 ps` without `BETTER_AUTH_SECRET` prints compose's "required variable BETTER_AUTH_SECRET is missing a
  value: set BETTER_AUTH_SECRET in .env, see .env.example", then `t29 REFUSED: compose config failed`, rc 97. Bare
  `docker compose config --quiet` with a clean env (no root `.env`): same compose message, rc 1. Matches README and
  `.env.example`. PASS.
- README "Signing in": steps match the code (seed and Playwright load the root `.env` only if present, shell wins;
  turbo passes `SEED_*`, `DATABASE_URL`, `BETTER_AUTH_SECRET` to `seed`). Outputs `created` / `updated` seen live. PASS.
- **Deviation:** `.env.example` does not list `SEED_EMAIL` / `SEED_PASSWORD`. Design 6.2 shows both commented lines
  (`# SEED_EMAIL=learner@example.com`, `# SEED_PASSWORD=`, with "Put them here, never on a command line"), and the file's
  own header says "Every variable the code reads must be listed here". README step 3 covers it, so low severity.
  Owner: coder.

## 7. e2e

`pnpm test:e2e` with the t29 env (`E2E_BASE_URL=http://127.0.0.1:3180`): 17 passed in runs 1, 2, 3 (4.6 s, 4.1 s, 4.1 s)
and run 4 after the restore rebuild (4.7 s). Flows: setup sign-in; protection (anonymous `/`, lesson URL with `tab`,
anonymous `get-session`); sign-in AC1/AC10/AC8, AC2, AC3, AC4, AC8 foreign `next`, AC6 retry, AC7 rate limit; sign-out
(server-side revocation, AC11, F3); dashboard shell and empty state, F6 cycle (AC12), rejected session alert (AC10),
dark scheme, skip link.

**T-xff, re-run by the tester.** Temporary spec (deleted afterwards), one worker, two tests with `useOwnBucket`, each
4 wrong posts from the page: both `[401, 401, 401, 429]`, PASS. Control without `useOwnBucket`: first test
`[401,401,401,429]`, second `[429,429,429,429]` (shared bridge bucket), so the check can fail. U-1 confirmed; no fallback.

## 8. Mutation re-verification (tester, independent)

Protocol: backup to `scratchpad/tester/bak/<id>.bak`, one exact-string replacement (script asserts exactly one match),
run, restore with `cp`, `cmp OK` and `git diff --quiet HEAD` for every file. Not reformatted with `pnpm format` (vitest
and the build do not depend on formatting; each mutation is a one-line edit).

| Id | Mutation | Red at | Restored |
|---|---|---|---|
| M3 | `env.ts`: default-secret check `&& false` | `env.test.ts` "refuses BETTER_AUTH_SECRET Better Auth's default without echoing it": "expected InvalidAuthSecretError, but the secret was accepted"; 1 failed / 7 passed | cmp OK, git clean |
| M9 (redaction canary) | `logger.ts`: pass `...args` to the sink | `logger.test.ts` (a) `not to match /canary-l[123]/`, (c) `not to contain 'canary-l5'`; 2 failed / 2 passed | cmp OK, git clean |
| M-guard-export | `entry-guard.ts`: `x.ts#a` exempts the whole file (`exemptions.files.add(path)`) | only "exempts only the named export of a server action module": `expected [] to deeply equal [ Array(1) ]`; 1 failed / 18 passed | cmp OK, git clean |
| M5 | `options.ts`: `rateLimit.enabled: NODE_ENV === "production"` | `auth-config.int.test.ts:96` `expect(fourth.status).toBe(429)`: "expected 401 to be 429" | cmp OK, git clean |
| M7 | `options.ts`: add `"*"` to `allowedHosts` | I-host `:153` "promise resolved Response { status: 200, set-cookie better-auth.session_token=... } instead of rejecting"; also I-origin `:117` "expected 200 to be 403" (wildcard host also trusts the foreign origin) | cmp OK, git clean |
| M14 | `session-reader.ts`: `getSession({ headers } as GetSessionInput)` | I-dal (d) `session.int.test.ts:81`: "expected 1793952039448 to be 1793779239445.892" (refreshed by 2 days); (e) positive control green | cmp OK, git clean |
| M15 | `seed.ts`: `const hash = password` | I-seed (1) `seed.int.test.ts:60`: "expected 'canary-seed-password-1' not to be 'canary-seed-password-1'" (also (2,3) and (7) at sign-in 500) | cmp OK, git clean |
| M-revoke-out | `app/(app)/actions.ts`: `signOut({ headers: new Headers({ host }) })`, `academy-web:t29` rebuilt (93610c1cac95) | E-out-1 only at the last assertion, `sign-out.spec.ts:65` `expect(await sessionFor(request, old)).toBeNull()`, received the live session; URL, note and cookie assertions stayed green; positive control green | cmp OK, git clean; image rebuilt (50360768e857), e2e run 4: 17 passed |

All 8 match the design's named assertion (M7 additionally reddens I-origin, which is consistent with V5).

## 9. Design conformance (ADR-0006)

Screenshots (prototype default state vs app, 375 and 1280, light and dark):
`scratchpad/tester/screens/design/sign-in/{prototype,app}-{375,1280}-{light,dark}.png` and
`scratchpad/tester/screens/design/dashboard/...` (16 files).

- Raw colour grep `rg '#[0-9a-fA-F]{3,8}\b|oklch\(|rgb\(|hsl\(' apps/web --glob '!**/globals.css'` (excluding node_modules
  and .next): no match, PASS.
- Token block: `app/globals.test.ts` (U4) green.
- Destructive button contrast: n/a, neither page has a destructive button ("Выйти" is a menu item).
- Sign-in ACs: AC1, AC10, AC8 (e2e E-in-1, E-in-5), AC2 (E-in-2 + unit), AC3 (E-in-3 + unit), AC4 (E-in-4 + unit +
  screenshot 02), AC5 (unit only, `sign-in-form.test.tsx` "adds the seed hint"; not exercised live), AC6 (E-in-6), AC7
  (E-in-7), AC9 (E-out-1 + screenshot 05), AC11 no horizontal scroll at 375 (e2e) and 1280 (screenshot), 768 not
  checked; AC12 (E-dash-4 skip link). PASS.
- Dashboard: AC7 empty state (E-dash-1, screenshot 03), AC10 (E-dash-3), AC11 user menu (E-out-1, screenshot 04), AC12
  (E-dash-2), AC13 at 375/1280 both themes (screenshots). AC1-AC6, AC8, AC9 are under the 9.2 waiver (#30, #35); "Курс"
  link omitted (#79). As agreed.
- Visual differences outside the waiver (minor, for the consistency judge): app inputs are about 32 px high and
  "Войти" about 34 px vs about 38 px in the prototype; in dark mode the app inputs have a lighter fill than the
  prototype's near-black fields; the prototype card has a light shadow the app card lacks. The focused Alert after wrong
  credentials shows no focus ring (programmatic focus after a mouse click, so `:focus-visible` does not apply);
  the acceptance asks for focus on it, not a ring.

Manual walk screenshots (1280, light, signed out context, own bucket):
- `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/tester/screens/01-sign-in-default.png`
- `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/tester/screens/02-wrong-credentials.png`
- `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/tester/screens/03-dashboard-empty.png`
- `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/tester/screens/04-user-menu-open.png`
- `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/tester/screens/05-signed-out-note.png`

## 10. drizzle-orm claim

`pnpm why -r drizzle-orm`: both `@academy/web` and `@academy/db` depend on 0.45.4; better-auth and
`@better-auth/drizzle-adapter` take it as a peer. `pnpm-lock.yaml`: one package entry (`drizzle-orm@0.45.4`, line 2898)
and one snapshot (`drizzle-orm@0.45.4(@types/pg@8.23.1)(kysely@0.29.7)(pg@8.23.1)`, line 6838); both importers resolve
to that snapshot. Every `drizzle-orm` symlink in `node_modules/.pnpm` and in both packages points to
`drizzle-orm@0.45.4_@types+pg@8.23.1_kysely@0.29.7_pg@8.23.1`; the second store dir
`drizzle-orm@0.45.4_@types+pg@8.23.1_pg@8.23.1` has no link to it. Coder's claim confirmed.

## 11. Secrets and passwords in output

- `grep -F` of the secret value and of the seed password over every log of this run (unit, integration, build, up,
  image checks, seed x3, e2e x4, mutation logs, `docker logs` of web and db): 0 hits.
- `docker logs academy-t29-web-1`: startup lines, `web: database migrations applied`, 4 x `better-auth warn: Invalid
  password`; no token, no params.
- `docker history --no-trunc` and `docker image inspect` of `academy-web:t29`: secret 0 hits, no `BETTER_AUTH` at all.
- **Playwright artifacts (finding, low):** I forced a failure in a copy of the sign-out spec. The retained
  `trace.zip` holds the seed password in `test.trace`, `2-trace.trace` and a network resource JSON (the `fill` value
  and the sign-in request body), plus session cookies. The secret is not in it. Locally README already warns, and
  `test-results/` is git-ignored and in `.dockerignore`. In CI, `trace: "retain-on-failure"` plus the `upload-artifact`
  step on failure publishes `apps/web/test-results` for 7 days with that run's random seed password and live session
  tokens. `::add-mask::` covers logs, not artifacts. The stack is ephemeral and `down -v` runs at the end, so the
  impact is low. Decision for the security judge: accept and record in ADR-0008's residual risks, or drop
  `test-results` from the upload (or use `trace: "off"` in CI). A failing E-out-1 also prints the live session JSON
  (token included) in the assertion message.

## 12. Observations, no bug

- The proxy builds the redirect from the request's own `Host` when it is a plain host[:port]: `Host:
  evil.example:3180` -> `location: http://evil.example:3180/sign-in?next=%2F`. This is the documented intent ("That
  Host came from this same client, so honouring it redirects nobody else"). A browser cannot set a foreign Host for
  a victim. The DNS-rebinding case stays same-origin, and Better Auth refuses that Host on `/api/auth`. Only a
  malformed Host (`evil.example/x`) falls back (unit test). Listed so the security judge sees it.
- `useOwnBucket` derives its address from `pid % 200` plus a per-worker counter. Two runs started within 10 s whose
  pids collide mod 200 could share a bucket. I saw no flake in 4 runs. Theoretical only.

## 13. Bugs found

None that block. Deviations for the coder (non-blocking): `.env.example` lacks the `SEED_EMAIL` / `SEED_PASSWORD` lines
of design 6.2. For the judges: the CI trace artifact item (section 11) and the minor control sizing (section 9).

STATUS: DONE

## Re-test after judge_code round 1

Branch `feat/29-sign-in-dashboard`, HEAD `b8fa8ab` (10 commits, `main` is an ancestor), date 2026-10-30. Fix diff
against the previously tested `df0910b`: 13 files, +83 / -18 (`git diff --stat df0910b HEAD`). Logs in
`scratchpad/tester/r2/` (full path below). No product file changed: two mutations, each restored with `cp` and proven
with `cmp OK` plus `git diff --quiet HEAD -- apps packages docs .env.example`.

```
TEST REPORT (#29, re-test)
lint/typecheck: ok (lint with explicit paths, 157 files; typecheck --force 5/5, 0 cached)
unit: 152 passed / 0 failed (web 106 (+1 pre-hydration test), db 34, lesson-schema 12)
content: ok (0 issues)
build without secrets: ok (env -u BETTER_AUTH_SECRET -u DATABASE_URL -u SEED_PASSWORD; same 3 pre-existing warnings)
stack: healthy (academy-t29, fresh volume via t29 down -v, then up -d --build --wait)
integration: db 41 passed, web 25 passed
image checks: I1 OK applied=2, I2/I3/I3b/I3c OK rc=1
seed: created, then updated
e2e: 18 passed / 0 failed, 3 full runs (4.6 s, 4.0 s, and 4.5 s after the mutation restore rebuild)
design: conformant to design/system README values; prototype is 2px taller per control (its own min-height + padding)
```

### R1. Isolation (design 13.5)

Before and after identical (`diff before.txt after.txt`): `academy_db-data` CreatedAt 2026-10-29T04:32:08Z,
`academy-web:local` absent, root `.env` absent, no container of project `academy`, no `academy.workspace` container.
Every compose call went through `t29`; `t29 -p academy ps` -> `t29 REFUSED: -p is fixed by the wrapper`, rc 97. Env
values never printed. End state: `t29 down` (no `-v`), no t29 container, `academy-t29_db-data` kept, `academy-web:t29`
= `265b2252fa3c` (built from the restored tree).

### R2. Fix verification

| Fix | Evidence | Result |
|---|---|---|
| F1 form `method="post"` | live `curl /sign-in`: `<form noValidate="" class="flex flex-col gap-6" method="post">`, no `action` | PASS |
| Pre-hydration POST, canaries | `POST /sign-in?next=%2Fcourses%2Fa%3Ftab%3Dx` form body `email=canary-email-r2@...&password=canary-pw-r2-...` with `Origin`: 200 `text/html`, final URL unchanged, 0 `Set-Cookie`, 0 `Location`, h1 "Вход", 0 `canary` in the body. Repeated without `Origin` (200, 0 cookie/location, 0 canary) and on the final rebuilt container (`next=%2F`, same). `docker logs` of web: line count unchanged by the POSTs (diff before/after empty), 0 `canary`; db logs 0 `canary` | PASS |
| Unit test "renders a POST form without an action..." | present, green; mutation below | PASS |
| E-in-8 (`javaScriptEnabled: false`) | present, green in all 3 runs; mutation below | PASS |
| `.env.example` `SEED_*` | `# SEED_EMAIL=learner@example.com`, `# SEED_PASSWORD=`, `# SEED_NAME=` with the 6.2 comment lines (landed in `c8d7493`, the seed commit) | PASS |
| `.env.example` lists every variable the diff reads | `process.env` / `env.` reads in `git diff main...HEAD`: `SEED_EMAIL`, `SEED_PASSWORD`, `SEED_NAME`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_SECRETS` (listed as refused), `DATABASE_URL`; compose/turbo/playwright: `DB_PORT`, `WEB_IMAGE_TAG`, `E2E_BASE_URL`, `BETTER_AUTH_SECRET`. All present in `.env.example` | PASS |
| ADR-0008 CI-trace residual | now names the seed password (`fill()` value and sign-in body), session cookies, the HTML report, the `e2e-report` artifact, and the reasons. Checked against `ci.yml:183-192` (`if: failure()`, uploads `playwright-report` and `test-results`, 7 days) and `playwright.config.ts` (`html` reporter in CI, `trace: "retain-on-failure"`) | PASS |
| False drizzle comment | deleted from `test/integration/db.ts` (landed in `9b0b4f7`) | PASS |
| `SIGNED_OUT_PATH` in `lib/next-path.ts` | `user-menu.tsx` and `sign-out.ts` import it from there; value unchanged (`/sign-in?signed-out=1`); E-out-1 green | PASS |
| Focus `waitFor` | 4 tests use `await waitFor(() => expect(message).toHaveFocus())`; mutation below | PASS |
| shadcn alignment | metrics in R4 | PASS |

### R3. Mutations (tester, independent)

| Mutation | Red at | Restored |
|---|---|---|
| "remove method": `<form method="post" noValidate` -> `<form noValidate` | unit: `sign-in-form.test.tsx:228:42` "expected null to be 'post'", 1 failed / 12 passed. E-in-8 on a rebuilt `academy-web:t29` (434a648bf123, live form without `method`): `sign-in.spec.ts:208:30` `Expected: "POST"` `Received: "GET"` | cmp OK, git clean; rebuilt 265b2252fa3c, live form has `method="post"`, unit 13/13, e2e run 3 18/18 |
| remove the effect's focus: `if (message !== null) messageBox.current?.focus();` -> `if (message !== null) void 0;` | 4 failed / 9 passed, each at its `waitFor`: `:120:41` (AC4), `:136:41` (AC5), `:156:43` (AC6 network failure and status 500), "expect(element).toHaveFocus()" after the 1 s waitFor timeout | cmp OK, git clean |

### R4. Design conformance (ADR-0006)

Screenshots, prototype default state vs app, 375 and 1280, light and dark (16 files):
`scratchpad/tester/r2/design/sign-in/{prototype,app}-{375,1280}-{light,dark}.png` and
`scratchpad/tester/r2/design/dashboard/...`. Computed styles from the same run (`shots.log`, `proto2.mjs`):

| Item | README / proto.css rule | Prototype renders | App renders |
|---|---|---|---|
| Input height | `--control-height` 2.25rem = 36px | 38px (min-height 36 + padding 6+6 + line 24 + border 2) | 36px, all four combos |
| "Войти" (default button) | 36px | 38px (min-height 36 + 8+8 + 20 + 2) | 36px |
| User-menu trigger (sm) | `--control-height-sm` 2rem = 32px | 34px (min-height 32 + 6+6 + 20 + 2) | 32px |
| Card | 1px `border`, `--shadow-sm` | 1px border, `oklab(0.145 0 0 / 0.08) 0 1px 2px` light, `/ 0.6` dark | 1px border, same shadow light and dark (plus Tailwind's transparent ring layers) |
| Dark input fill | opaque `background` | `oklch(0.145 0 0)` | `lab(2.75 0 0)` = `oklch(0.145 0 0)`, opaque; visually matches the prototype's near-black field |
| Horizontal scroll | none | none | none at 375 and 1280 |

**Residual 2px judgement.** The app now equals the documented values exactly (36 / 36 / 32). The prototype is 2px
taller per control because `proto.css` sets `min-height` and also padding plus line height that exceed it, so its
boxes grow past the README value. The README is the contract; the app conforms and the prototype overshoots its own
rule. Not a dev deviation. If anyone wants pixel parity, it is a DESIGN fix in `proto.css` (e.g. `height` or padding
that fits 36px), not a code change. The card is about 6-7px shorter at 1280 because of the three controls.

**New observation (minor, for the consistency judge).** The app input is `text-base` (16px) below 768px and
`md:text-sm` (14px, line 20px) at 1280; the README type scale says inputs use `text-base` ("16px avoids iOS zoom on
focus") and the prototype keeps 16px at every width. The height stays 36px. It is shadcn's default class, present
before this round too. Accept and note, or drop `md:text-sm` from `ui/input.tsx`; owner coder if the judge rules it a
deviation.

Raw colour grep (`#hex|oklch(|rgb(|hsl(` in `apps/web` outside `globals.css`, `node_modules`, `.next`): no match. The
card shadow uses `color-mix(in_oklab, var(--foreground|--background) ...)`, tokens only. Cyrillic in the changed files:
only `lib/copy.ts` and the ADR-0008 UI copy quotes, as before.

### R5. Commits

`git log main..HEAD`: 10 commits, subject lengths 52-71 (max 71, `9b0b4f7`), every body's last line `Refs #29`, author
and committer Stepan Korshukov. `grep -iE 'claude|anthropic|co-authored|generated with|\bAI\b|assistant'` over every
message: no match. `grep -E '^(fixup|amend|squash)!'` over subjects and bodies: no match. Fixes landed in their natural
commits (`.env.example` SEED lines in `c8d7493`, form/ui/E-in-8 in `bc803b5`, drizzle comment in `9b0b4f7`, ADR in
`b8fa8ab`). Per-commit lint/typecheck/test/build: I did not re-run it; the coder's `fix1/percommit2.out` lists all 10
current SHAs with `install=0 lint=0 typecheck=0 test=0 build=0`.

### R6. Secrets

`grep -cF` of `BETTER_AUTH_SECRET` and `SEED_PASSWORD` values over every r2 log, header and body file plus `docker logs`
of web and db: 0 and 0. Final web container log: startup lines, `web: database migrations applied`, 4 x `better-auth
warn: Invalid password` (AC7 attempts).

### R7. Verdict

All judge_code round 1 fixes verified by running them; both new guards were watched go red at their named assertions.
No blocking bug. For the judges: the residual 2px is a prototype artifact (R4); the `md:text-sm` input font size is a
minor new observation.

Logs and screenshots: `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/tester/r2/`.

STATUS: DONE

## Re-test after judge_code round 2

Branch `feat/29-sign-in-dashboard`, HEAD `320bde9` (10 commits, `main` is an ancestor), date 2026-10-30. Fix diff
`git diff b8fa8ab..HEAD`: 12 files, +120 / -96, all landing in `3b18271` (vendored `components/ui/*`, `sign-in-form.tsx`,
its unit test, `e2e/sign-in.spec.ts`). Logs, scripts and screenshots in `scratchpad/tester/r3/` (full path below). No
product file changed: three mutations of `ui/button.tsx`, each restored with `cp` and proven with `cmp OK` plus
`git diff --quiet HEAD -- apps packages docs .env.example`; the final image `academy-web:t29` = `9c64ec9f01f3` was
rebuilt from the restored tree.

```
TEST REPORT (#29, re-test 2)
lint/typecheck: ok (lint with explicit paths, 157 files, #42 worktree excluded; typecheck --force 5/5, 0 cached)
unit: 152 passed / 0 failed (web 106, db 34, lesson-schema 12)
content: ok (0 issues)
build without secrets: ok (env -u BETTER_AUTH_SECRET -u DATABASE_URL -u SEED_PASSWORD -u SEED_EMAIL; same 3 pre-existing warnings)
stack: healthy (academy-t29, up -d --build --wait)
image checks: I1 OK applied=2, I2/I3/I3b/I3c OK rc=1
seed: updated
e2e: 18 passed / 0 failed, 2 full runs (5.3 s, 4.5 s)
design: conformant; remaining differences listed in S4, none in the app's colours, borders, radii, shadows or fonts
```

### S1. Isolation

`before.txt` and `after.txt` identical: `academy_db-data` CreatedAt 2026-10-29T04:32:08Z, `academy-web:local` absent,
root `.env` absent, 0 containers of project `academy`, 0 `academy.workspace` containers. Every compose call went
through `t29`; `t29 -p academy ps` -> `t29 REFUSED: -p is fixed by the wrapper`, rc 97. End: `t29 down` (no `-v`), 0
t29 containers, `academy-t29_db-data` kept. Secret and seed password: 0 files in `r3/` contain either value
(`grep -rlF`, docker logs included).

### S2. Mutations

| Mutation | Red at | Restored |
|---|---|---|
| M1: `ui/button.tsx` from `b8fa8ab` | unit: `sign-in-form.test.tsx:105:20` "Expected the element to have class", 1 failed / 12 passed. e2e on the rebuilt image (`72ee3af49ab7`, live HTML carries `hover:bg-primary/80`): AC3 `sign-in.spec.ts:74:6` in `expectMutedPaint` called from `:140:9` (before hover), Expected true / Received false | cmp OK, git clean |
| M2: drop ` aria-busy:aria-disabled:cursor-progress` | e2e AC3 `sign-in.spec.ts:143:22` `toHaveCSS("cursor", "progress")`, Received "not-allowed"; both muted-paint polls (`:140`, `:142`) passed first | cmp OK, git clean |
| M3 (extra): drop ` aria-disabled:hover:bg-muted aria-disabled:hover:text-muted-foreground` | unit red at `:105:20` (class list); e2e AC3 **green** | cmp OK, git clean, rebuilt `9c64ec9f01f3` |

M3 explained: in the built CSS the `aria-disabled:*` rules come after the `hover:*` rules (`app.css` offsets:
`hover:bg-[color-mix` 17122, `hover:bg-accent` 17792, `aria-disabled:bg-muted` 19584) with equal specificity, so
`aria-disabled:bg-muted` already wins on hover and the two `aria-disabled:hover:*` classes are redundant. The e2e hover
check (`:141-142`) does prove the hovered busy button is muted, but no class removal can turn it red; the unit test
only pins class names. Not a bug; for the judges: the comment "listed again under hover" and the unit assertion
describe belt-and-braces classes, not a needed fix.

### S3. Commits

10 commits, subjects 52-71 characters (max 71, `9b0b4f7`); every body's last line `Refs #29`; author and committer
Stepan Korshukov. `grep -ciE 'claude|anthropic|co-authored|generated with|\bAI\b|assistant'` over all messages: 0;
`grep -cE '^(fixup|amend|squash)!'`: 0. Every file of the fix diff is touched only by `3b18271` on this branch. Per-
commit install/lint/typecheck/test/build: not re-run by me; the coder's `fix3/percommit2.out` lists the 10 current SHAs,
all `=0`.

### S4. Design conformance, computed styles

Script `r3/compare.mjs`: prototype (`file://`, state by hash) vs app (live t29 stack; network states via
`page.route`: hung request for busy, 401 for wrong credentials, abort for server unreachable, `get-session` -> `null` for
the session-expired alert), light and dark, 1280 and 375. Colours normalised to sRGB through a canvas so `lab()` /
`oklch()` / `color-mix()` spellings compare equal; transparent shadow layers dropped. Full data: `r3/design/compare.json`,
log `r3/compare.log`. Compared: height, background, colour, border colour/width/style, radius, four paddings, font
size/line height/weight, box-shadow, gaps, cursor, outline, text decoration, opacity.

Equal in all four theme/width combinations (only the 2px control overshoot below differs):
- Inputs: font 16px / line 24px at 1280 and 375 (the `md:text-sm` fix holds), background, border, radius, padding.
- Default "Войти", its hover (opaque 90 % mix), busy "Войти" and busy hovered (muted / muted-foreground / border), retry
  secondary and its hover (accent), user-menu trigger and its hover (accent in both themes), "Войти снова" (default sm)
  hover.
- Card: border, radius, shadow (light foreground 8 %, dark background 60 %), background. Inner layout identical: h1,
  labels and fields at x 25, y 25 / 77 / 105, field widths 334 (1280) and 293 (375) in both.
- Alert destructive (wrong credentials) and warning (server unreachable), and the dashboard session-expired alert:
  border colour, background, padding, radius, gaps; titles' colour and weight 600.
- Dropdown content: border, radius, padding, popover background, shadow, width 224; item under keyboard focus: accent
  background, accent-foreground, inset 2px ring outline, radius, padding, height 32.
- Empty state: dashed border, radius, padding, gap; title text-lg weight 600.

Remaining differences:
1. Known: every control is 2px taller in the prototype (38 / 38 / 34 vs 36 / 36 / 32; `proto.css` min-height plus
   padding). It carries through to the card (312 vs 306) and the alerts holding an sm button (+2px). App padding-top 0
   vs 8 / 6 is the same thing (app centres in a fixed height).
2. Known: spinner glyph. Same class: the alert icon is a lucide SVG in the app and a CSS `.status-icon` (ring plus
   glyph) in the prototype; the box is 20px in both, only the glyph differs.
3. New, prototype-side: busy "Войти" **hovered** cursor. Prototype computes `not-allowed` (`proto.css:184-186`:
   `.button[aria-disabled="true"]:hover` (0,3,0) outranks `.button[aria-busy="true"] { cursor: progress }` (0,2,0)), app
   computes `progress` (and e2e AC3 asserts it). Since a cursor only shows under the pointer, the prototype in practice
   shows `not-allowed` for the busy button, while its own `aria-busy` rule says `progress`. The app follows the rule's
   evident intent; the `button.tsx` comment "the progress cursor wins, as in proto.css" is true for proto.css's
   declarations, not for its computed result. A one-line DESIGN fix in `proto.css`, or a judge's call; not a dev
   deviation in my reading.
4. New, prototype-side: dropdown label height 36 (prototype) vs 32 (app). `.dropdown-label` sets `font-size:
   var(--text-sm)` but no line height, so it inherits 24px; the app uses the README type scale `text-sm` 1.25rem. Menu
   height 87 vs 83 follows. Same class as item 1 (proto.css omission).

Screenshots, prototype vs app, `<item>-<prototype|app>-<375|1280>-<light|dark>.png` in `r3/design/`: `busy-`,
`default-button-hover`, `retry-secondary-hover`, `user-menu-trigger-hover`, `dropdown-item-keyboard-focus`,
`alert-destructive-wrong-credentials-`, `alert-warning-server-unreachable-`, `session-expired-alert`, `empty-state`
(72 files). Inspected: busy dark 375 (muted fill, muted text, spinner) matches the prototype; dropdown focus light 1280
shows accent plus the inset ring; warning alert light 1280 shows the warning border and the secondary "Повторить".

Raw colour grep (`#hex|oklch(|rgb(|hsl(` in `apps/web` outside `globals.css`, build and test output): no match. New
Cyrillic in the fix diff: none.

### S5. Verdict

Both round-2 architecture items are fixed and verified by running: the input is 16px at every width, and the busy,
hover and disabled states use the muted pair and opaque fills in both themes. The new guards (unit class check, e2e
`expectMutedPaint`, cursor `progress`) were watched red. No blocking bug. For the judges: S2 M3 (redundant hover
classes), S4 items 3 and 4 (prototype-side, DESIGN notes).

Logs, scripts and screenshots: `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/tester/r3/`.

STATUS: DONE

## Re-test after judge_code round 3

Branch `feat/29-sign-in-dashboard`, HEAD `2317f66` (10 commits), date 2026-10-30. Asked by
`code-review-3-architecture.md`: drop the redundant `aria-disabled:hover:*` classes and their unit assertion, make the
`button.tsx` comment true. Logs in `scratchpad/tester/r4/` (full path below). No product file changed: one mutation,
restored with `cp`, `cmp OK`, `git diff --quiet HEAD -- apps packages docs .env.example`; final image `academy-web:t29` =
`062d0f7e0686` rebuilt from the restored tree.

```
TEST REPORT (#29, re-test 3)
lint/typecheck: ok (lint with explicit paths, 157 files, #42 worktree excluded; typecheck --force 5/5, 0 cached)
unit: 152 passed / 0 failed (web 106, db 34, lesson-schema 12)
content: ok (0 issues)
build without secrets: ok (env -u BETTER_AUTH_SECRET -u DATABASE_URL -u SEED_PASSWORD -u SEED_EMAIL; same 3 pre-existing warnings)
stack: healthy (academy-t29, up -d --build --wait), seed: updated
e2e: 18 passed / 0 failed (full run on 07e980793031; again 18/0 after the mutation restore rebuild)
design: unchanged from re-test 2 (no computed value can change: see T2)
```

### T1. Commit rewrite

`git range-diff main 320bde9 HEAD`: commits 1-7 identical SHAs, 9-10 `=` (new SHAs `bd6dfb9`, `2317f66`), only
`3b18271` -> `72679fc` changed, and only by two hunks: `sign-in-form.test.tsx` (comment reworded, `toHaveClass` keeps
`aria-disabled:bg-muted` and `aria-disabled:text-muted-foreground`, drops the two `aria-disabled:hover:*`) and
`ui/button.tsx` (comment rewritten, ` aria-disabled:hover:bg-muted aria-disabled:hover:text-muted-foreground` removed
from the base classes). Commit message unchanged. `git diff --stat 320bde9 HEAD`: these 2 files, +7 / -10; no Cyrillic in
the changed lines. Subjects 52-71 characters; every body's last line `Refs #29`; author and committer Stepan Korshukov;
`grep -ciE 'claude|anthropic|co-authored|generated with|\bAI\b|assistant'` over all messages: 0; `^(fixup|amend|squash)!`
subjects: 0. Working tree: only the three feedback files and untracked `plans/`.

### T2. The new `button.tsx` comment is true

Built CSS (`apps/web/.next/static/chunks/21pzh3a-y5a70.css`, from the no-secrets build): every `hover:*:hover` rule
ends by offset 17915 (`hover:bg-[color-mix` 17122, `hover:bg-accent` 17792); the `aria-disabled:*` rules come after
(`aria-disabled:cursor-not-allowed` 19433, `aria-disabled:bg-muted` 19584, `aria-disabled:text-muted-foreground` 19659).
`.hover\:bg-accent:hover` and `.aria-disabled\:bg-muted[aria-disabled=true]` are both (0,2,0), so the later
aria-disabled rule wins on hover: "stays muted on hover because Tailwind orders the aria-disabled variant after hover"
holds. `.aria-busy\:aria-disabled\:cursor-progress[aria-busy=true][aria-disabled=true]{cursor:progress}` at 19747 is
(0,3,0) and outranks `aria-disabled:cursor-not-allowed`. `proto.css:184-188`: `.button[aria-disabled="true"]:hover`
(0,3,0) sets `cursor: not-allowed` and outranks `.button[aria-busy="true"] { cursor: progress; }` (0,2,0), so the
prototype shows not-allowed while hovered: the comment's specificity numbers and "prototype bug" are right. No
`aria-disabled:hover` string in the built CSS or the live HTML.

### T3. The e2e hover guard still works

| Mutation | Red at | Restored |
|---|---|---|
| `ui/button.tsx` from `b8fa8ab` (image `9ace56a28fd4`, live HTML carries `hover:bg-primary/80`) | e2e AC3 `sign-in.spec.ts:74:6` in `expectMutedPaint` called from `:140:9`, Expected true / Received false; 1 failed / 17 passed | cmp OK, git clean; rebuilt `062d0f7e0686` (no `hover:bg-primary/80` in live HTML), e2e 18/18 |

### T4. Isolation

`before.txt` and `after.txt` identical: `academy_db-data` CreatedAt 2026-10-29T04:32:08Z, `academy-web:local` absent,
root `.env` absent, 0 containers of project `academy`, 0 `academy.workspace` containers, 0 t29 containers after
`t29 down` (no `-v`; `academy-t29_db-data` kept). Every compose call went through `t29`; `t29 -p academy ps` -> `t29
REFUSED: -p is fixed by the wrapper`, rc 97. Secret and seed password: 0 files in `r4/` contain either value (docker
logs of web and db included).

### T5. Verdict

The round-3 architecture item is fixed as asked and only in its natural commit; the remaining e2e hover guard was
watched red on the old `button.tsx` and green again after restore. No blocking bug.

Logs: `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/tester/r4/`.

STATUS: DONE
