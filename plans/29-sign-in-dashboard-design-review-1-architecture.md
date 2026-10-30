# #29 design review, round 1: architecture

Reviewer: judge-architecture. Phase: judge_design. Inputs read in full: `plans/29-sign-in-dashboard-research.md`,
`plans/29-sign-in-dashboard-design.md`, `docs/adr/0008-authentication.md`, `docs/adr/0006`, `docs/adr/0007`,
`design/pages/dashboard/acceptance.md` (+ prototype grep), `apps/web` (package.json, tsconfig, vitest config,
startup*, instrumentation, layout, e2e/home.spec.ts, check-image-migrations.sh), `packages/db/src/*`,
`docker-compose.yml`, `turbo.json`, `.github/workflows/ci.yml`, issues #30, #35, #78.

## What I checked, and what holds

- **Source facts (spot-checked in the unpacked better-auth 1.7.14 tarball):** V1 the limiter is called only
  in the router's `onRequest` (`dist/api/index.mjs:173`); V2 `enabled: options.rateLimit?.enabled ??
  isProduction` (`create-context.mjs:172`); V3 `skipOriginCheck` true under `isTest()` (`:211`); V11
  `toNextJsHandler` accepts a function (`next-js.mjs:7-18`); `nextCookies()` imports `next/headers.js`
  lazily, so the seed under `tsx` can load the options factory. I-map is sound: `ctx.checkSchema =
  runtimeSchemaCheckFor(adapter)` (`create-context.mjs:231`) and its promise rejects with
  `SchemaMismatchError` (`auth/base.mjs:15-17`), so the "resolves" assertion can go red under M18.
- **Schema:** plural names with `usePlural: true` match ADR-0007's plural tables and the adapter's
  `schema[modelName]` lookup; every PK/FK/unique/index named; `text` ids with no DB default (consistent with
  `users`); FKs `ON DELETE CASCADE` (ADR-0007 item 6); `timestamptz`; extra `accounts_provider_account_unique`
  justified; migration generated, additive, drift and append-only steps kept. I-db-1..3 mutations reach the
  constraint under test.
- **Single DB client / laziness:** one `getDb()` pool shared by Better Auth and `needsSeedHint`; startup
  migration keeps its own short-lived client (existing). `getAuth()` / `getDb()` lazy, so `next build` (CI
  `checks`, no env) is covered by M23.
- **Module boundaries:** auth instance and env stay in `apps/web`; `@academy/db` stays env-free and only
  gains tables; `drizzle-orm` declared in `apps/web` at the same range with a `pnpm why` check. No import of
  `services/*`.
- **Route protection:** default-deny proxy (cookie presence only) + DAL with `disableRefresh`; walked the
  loops: stale cookie on `/` -> DAL null -> `/sign-in?next=/` -> DAL null -> form (no loop); signed-in
  visitor with `next=/sign-in` -> one extra hop, terminates. The compose healthcheck uses Node `fetch`, which
  follows the 307 to `/sign-in` (200) and does no DB read without a cookie. `public/` is empty, so the narrow
  matcher breaks no asset.
- **ADR-0007 obligations for #29:** item 2 (mapping, id generator, email case) answered in 5.3 / ADR-0008
  item 3 with an automated proof; item 6 cascade built; DB logging rule (Consequences) L1-L5 with canaries;
  stale `users` comments fixed.
- **Tests:** mutations M1-M25 mostly break exactly the guarded assertion (I-rl under M5 in NODE_ENV=test,
  I-origin under M6, U-dal M11/M14, E-out-1 second redirect). Nothing mocks the unit under test (deps are
  injected around `signOut`, `getSession`, `fetch`).
- **Process:** `pipeline-advance.sh status`: PROJECT, phase judge_design, researcher ~15 min, architect ~16
  min; no inline votes.

## FAIL - 4 issues found

1. **[design section 14 / 15] "Each step leaves the repo green" is false; the order breaks CI and typecheck
   between steps and between commits.**
   - Step 6 (commit 3) makes startup refuse a missing secret, but compose only passes `BETTER_AUTH_SECRET`
     at step 31 and CI only generates it at step 37 (commit 11). For commits 3-10 the web container exits 1:
     `docker compose up --wait` in the `e2e` job fails, and `check-image-migrations.sh` I2 (expects
     `MigrationError stage connect`) now sees `InvalidAuthSecretError` first. `pnpm dev` refuses too.
   - Step 19 (commit 6) adds the default-deny proxy, but `/sign-in` only exists at step 26 (commit 7): `/`
     -> 307 -> 404, the healthcheck's `r.ok` is false (fetch follows the redirect), the stack never becomes
     healthy, and `e2e/home.spec.ts` is red.
   - Step 30 deletes `lib/courses.ts`, but `e2e/home.spec.ts` imports `../lib/courses` and
     `apps/web/tsconfig.json` includes `**/*.ts`, so `pnpm typecheck` is red until step 33.
   - Header line 4 says "section 14 has 30 steps"; it has 38. Steps 13, 17 and 29 are well above 60 LOC
     (three integration suites; CLI + two scripts + six I-seed cases; two components + U-cycle).
   Fix: put `.env.example`, compose `:?`, turbo passThroughEnv and the CI secret generation in the same step
   and commit as the startup secret check (or before it); land the proxy together with or after the sign-in
   page and rewrite `home.spec.ts` in that same commit; delete `lib/courses.ts` in the step that replaces
   `home.spec.ts`; split the oversized steps; fix the count. Each step's bracket names the CI-equivalent
   check it keeps green (compose up + e2e where the step touches runtime).

2. **[design 9.2, 16.2] Dashboard deviations: follow-up tracking contradicts ADR-0006 item 5 and names the
   wrong owner.**
   - ADR-0006 item 5 allows a deviation "only when listed under 'Design deviations' in the PR body with a
     follow-up DESIGN issue", and judge-architecture FAILs the code review without it. The design makes the
     DESIGN issue conditional on Stepan. Two rows are real design deviations, not unimplemented data: the
     omitted "Курс" link (changes the acceptance tab order) and "Выйти" as a `button` in a `form` where the
     prototype draws `a.dropdown-item href` (a GET sign-out, which the design itself calls wrong). Those
     need a DESIGN issue unconditionally, so #30 does not implement against a prototype dev already knows
     is wrong.
   - The data-dependent ACs are not design changes. Tracking them in dev issues is reasonable, but only as
     an explicit waiver of item 5 recorded where ADR-0006 is applied (the PR body plus Stepan's decision),
     not by asserting "these change no design".
   - The owner is wrong. #30's body (catalog and lesson page) has no dashboard criterion. Progress ACs (AC4,
     AC6, AC9, the progress half of AC3) belong to #35 "attempts and progress on the dashboard" (backlog 09,
     the ADR-0007 reader). As written, nothing tracks the Card or the progress section.
   Fix: split 9.2's owner column into #30 (AC1, AC2, AC5, AC8, AC7 made conditional, Skeleton, "Курс")
   and #35 (AC3 progress part, AC4, AC6, AC9). Add those ACs to the bodies of #30 and #35 in this task.
   File one DESIGN issue for the "Выйти" element and the "Курс" omission / tab order. Record the waiver for
   the data rows.

3. **[ADR-0007 items 6, 8, 10] #29 changes two ADR-0007 obligations without amending ADR-0007.** Item 6
   still says account deletion is "#29 owns the flow", and that moved to #78. Item 8 says "`apps/web` is
   the only process that connects to Postgres", and ADR-0008 item 10 re-reads it to include a host-side
   `tsx` seed process. Item 10 says changing items 2-9 updates ADR-0007 with Stepan's approval, and the
   precedent (3a1e1d4, #1's amendment) edits ADR-0007 itself. Left as is, the accepted ADR lies about who
   owns deletion. Fix: add an amendment line to ADR-0007 Consequences in this PR (deletion flow -> #78;
   item 8 covers one-shot operator commands of the `apps/web` package, per ADR-0008 item 10, pending
   Stepan), and list the edited file in section 3.3.

4. **[design 3.2, 13.1, 13.2] "server-only" modules are untestable as specified.** `lib/auth/index.ts` and
   `lib/session.ts` are marked server-only, but `server-only` does not resolve from `apps/web`
   (`require.resolve` fails; only `next/dist/compiled/server-only`, which Next aliases inside its own
   bundles). U-dal, I-dal and I-redact import `lib/session.ts` under Vitest, where `import "server-only"`
   either fails to resolve or, once installed, throws, because Vitest does not use the `react-server`
   condition. The seed would hit the same failure through any import of `index.ts`. The coder is left to
   improvise, either by dropping the marker or by mocking a module. Fix: state the mechanism. Either add
   `server-only` as an exact dependency plus a Vitest `resolve.alias` to its empty module (unit and
   integration configs), or keep `createSessionReader` and the other injected factories in marker-free
   modules and put the marker only on the thin wiring files. State that the seed imports only `env.ts`,
   `options.ts` and `@academy/db`, never `lib/auth/index.ts`.

## Advisory (not blocking)

- A1 `getAuth()` / `getDb()` are memoised in a module variable. In `next dev`, an edit under `lib/auth/`
  re-evaluates the module and orphans the old `pg.Pool` (never `close()`d). Consider a `globalThis` memo in
  development. `(app)/layout.tsx` and `(app)/page.tsx` each read the session, which is two DB reads per
  render; wrap the DAL read in React `cache()`.
- A2 `needsSeedHint` is a public server action that queries the DB, but ADR-0008 item 8 says every server
  action reads the session through the DAL. State the exception in ADR-0008, and say that U-guard covers
  pages only (actions and route handlers are review-enforced).
- A3 I-redact under M10 may stay green (U-4). The design already says so; the tester must label it
  "evidence, not a guard" in the report.
- A4 Rollback: if #29 is reverted and later redone with a regenerated `0001`, Stepan's DB already has the
  three tables and `CREATE TABLE` fails at startup. Add "drop the three tables and the migration row, or
  `down -v`" to section 11.4.

FAIL
