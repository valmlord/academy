# #29 judge_design round 3: operations

Reviewer: judge-operations. Scope: the Revision 3 changes only (Revision 3 table, 13.3 E-out-1, 13.5, 14 steps
1, 8, 13a/13b, 35, 37a-37c, 49, 16 items 6-7) against my round-2 notes, plus their effect on CI time, e2e
determinism under the rate limiter and the isolation recipe. Settled round-1/2 points not re-opened.

Inputs read: `plans/29-sign-in-dashboard-design.md` (Revision 3 table, sections 0 V19, 13.3, 13.5, 14, 15, 16),
`docs/adr/0008-authentication.md` (residuals), my round-2 review, `.claude/feedback/architect_mistakes.md`,
`.claude/feedback/judge_mistakes.md`, `.claude/agents/dev/judge-operations.md`. Context: `turbo.json`,
`biome.json`, root `package.json` (`lint` = `biome check .`), `.gitignore`, `.github/workflows/ci.yml` (`db` job),
`packages/db/vitest.integration.config.ts` and `test/integration/global-setup.ts`, Better Auth 1.7.14
`dist/api/rate-limiter/index.mjs` and `context/create-context.mjs:170-175` (unpacked tarball in the session
scratchpad), Playwright 1.64.1 `lib/index.js` (`request` fixture, `runBeforeCreateRequestContext`).

No code exists yet; nothing to lint, typecheck, test or build. Everything below ran in
`<scratchpad>/ops3/` against a scratch compose file or a scratch biome tree. No compose command reached project
`academy`; `docker compose config` is client-side. The Docker daemon was not running during this review, so the
volume/image before-after check could not be repeated, but nothing I ran talks to the daemon. No root `.env`
before or after.

## Commands run

| Check | Result |
|---|---|
| `t29-env.sh` extracted byte-for-byte from 13.5 (sed between the ```` ```sh ```` fences) + a test secret; scratch `compose.yml` with `name: academy`, `${DB_PORT:-5432}`, `academy-web:${WEB_IMAGE_TAG:-local}`, `BETTER_AUTH_SECRET: ${...:?...}`; run in `/bin/bash` (3.2) and `zsh` | `t29 config`: `name: academy-t29`, published `55432`, image `academy-web:t29`, rc 0 |
| same, `unset BETTER_AUTH_SECRET; t29 ps` | compose's own line `required variable BETTER_AUTH_SECRET is missing a value: set BETTER_AUTH_SECRET in .env, see .env.example`, then `t29 REFUSED: compose config failed`, rc 97, **no node trace**, compose never ran `ps`. Same in both shells |
| same, `t29 -p academy ps`; `COMPOSE_PROJECT_NAME=academy t29 ps` | `t29 REFUSED: -p is fixed by the wrapper` / `t29 REFUSED: COMPOSE_PROJECT_NAME=academy`, rc 97 (refusals unchanged by the edit) |
| Biome 2.6.3 (repo binary) on a scratch copy of `biome.json` + `apps/web/playwright/.auth/learner.json` written unformatted, as Playwright writes it | without `!**/playwright/.auth`: `Some errors were emitted while running checks`; with it appended: `Checked 1 file ... No fixes applied` (only `biome.json`). C5 is needed and works; the bare folder form matches the existing `!**/playwright-report` style |
| Better Auth rate limiter: `resolveRateLimitConfig`, `getDefaultSpecialRules` | key = `ip + path`; `/sign-in*` 3 per 10 s; everything else the default `max 100, window 10` (`create-context.mjs:173-174`). `/get-session` and `/sign-out` are separate buckets from `/sign-in/email` |
| Playwright 1.64.1 `request` fixture | `playwright.request.newContext()` with project options merged in by `runBeforeCreateRequestContext`, so a project-level `storageState` reaches the `request` fixture unless the spec overrides it |
| `turbo.json` `test:integration` (`dependsOn: ["^build"]`, `cache: false`, `passThroughEnv` `DOCKER_*`, `TESTCONTAINERS_*`); CI `db` job (`timeout-minutes: 15`, `TESTCONTAINERS_RYUK_DISABLED`, `pnpm test:integration`) | `@academy/web#test:integration` builds `@academy/db` and `lesson-schema` first through `^build`, inherits the testcontainers env, runs in the same job |

## My round-2 notes

1. **13.5 exception wording: RESOLVED.** 13.5 now names exactly one exception, read-only bare `docker compose
   config` (with or without `--quiet`) in steps 1 and 8, and says why it is safe (creates, starts, tags
   nothing). Step 1 runs it as `env -u DB_PORT -u WEB_IMAGE_TAG -u COMPOSE_PROJECT_NAME docker compose config`
   in a shell without `t29-env.sh`, so the defaults (5432, `academy-web:local`) are what is checked. Step 8
   checks both directions (fails naming the variable without the file, passes with it). Nothing else in steps
   1-50 calls bare compose except `check-image-migrations.sh`, which follows the exported
   `COMPOSE_PROJECT_NAME` (verified round 2).
2. **Wrapper stderr: RESOLVED, rehearsed.** `2>/dev/null` is attached to `node` only; compose's message stays
   on stderr and the wrapper adds `t29 REFUSED: compose config failed`. The pipeline's status is node's, and
   node exits non-zero on empty input, so a failed `config` still refuses (verified above in both shells).
3. **Section 16 items 6 and 7: RESOLVED.** Item 6 forbids `up --build` (or any `up` that rebuilds `web`) of
   project `academy` from this checkout until merge, with the reason (unmerged `0001_auth` in
   `academy_db-data`, later 42P07). Item 7 freezes `0001_auth.sql`, snapshot and journal entry incl. `when`
   after step 3; no later step regenerates it (checked steps 4-50).

## New steps

- **13a/13b (integration harness split).** CI time: one more Postgres testcontainer in the `db` job, started by
  turbo in parallel with `@academy/db`'s (no `--concurrency 1`); a few seconds of pull-free start (same
  `postgres:17.6-alpine` image) against a 15 min job budget. [I] red between 13a and 13b ("no test files", vitest
  exits 1) is inside one commit, which section 14 explicitly allows. Isolation: testcontainers creates its own
  randomly named containers and does not read `COMPOSE_PROJECT_NAME`; it cannot touch `academy`.
- **37a-37c (guard scanner).** Pure Vitest unit tests in `pnpm test` (CI `checks`), in-memory cases plus one
  temp-dir walk; the real-tree walk excludes `node_modules` and `.next`, so its cost is a few hundred small
  files whether or not `pnpm build` ran first. No Docker, no env. No effect on CI time worth noting.
- **Step 35 biome exclusion.** Verified above. The exclusion is required, not cosmetic: without it a local
  `pnpm lint` after any e2e run fails on Playwright's storage file (CI's `checks` job has no such file, so CI
  would not catch the local break).
- **E-out-1 second `get-session` request.** No rate-limit interaction: buckets are per `ip + path`, so the two
  `get-session` calls (positive control, revocation check) never consume the `/sign-in/email` budget that
  E-in-7 and `useOwnBucket` depend on; the `get-session` bucket is 100 per 10 s, and the whole suite's
  `get-session` traffic from the bridge gateway (dashboard mounts, E-prot-3, E-out-1) is far below that, also
  under the T-xff fallback (one worker, serial). E-out-1 revokes only the session it created itself, so the
  setup project's storage-state session used by parallel dashboard specs stays valid. The fresh session does
  not refresh on the positive-control read (V14), so the control causes no `Set-Cookie` side effect. Step 49's
  "three consecutive green runs" is the right determinism gate.

## Non-blocking recommendations

- E-out-1 says "cookie-less `request` context". In Playwright 1.64.1 the `request` fixture inherits the
  project's `storageState`, and the `chromium` project sets `playwright/.auth/learner.json`. If
  `sign-out.spec.ts` forgets `test.use({ storageState: { cookies: [], origins: [] } })`, the revocation check
  carries the setup session's cookie next to the explicit `cookie:` header and can see a live session (a false
  red, never a false green: M-revoke-out still goes red). Name the mechanism in step 49: the file-level
  `test.use` with the empty state, or `playwright.request.newContext({ storageState: { cookies: [], origins: [] } })`.
- 13.5 setup step 2 records `absent` when the daemon is down (`... 2>/dev/null || echo absent`); a later
  teardown with the daemon up then reports a false incident. Precede it with `docker info >/dev/null` and stop
  if that fails. Safe direction, so not blocking.
- 37c's temp-dir case: remove the directory in `afterEach`/`finally` (resource hygiene for repeated local runs).

## Attribution

No blocking finding; nothing appended to `architect_mistakes.md`.

PASS
