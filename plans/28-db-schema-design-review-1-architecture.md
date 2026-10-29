# #28 db schema v1: design review round 1, architecture

Judge: judge-architecture. Input: `plans/28-db-schema-design.md` (rev 1), `plans/28-db-schema-research.md`,
issue #28 (as `backlog/02-db-schema.md` plus the orchestrator's acceptance list).

## What I checked

Process: `.claude/pipeline_state.json` is PROJECT / `judge_design`, three judge spawns recorded
(operations, security, architecture), no inline votes, architect phase 11 min, not a rubber stamp.

Claims verified against the repo:
- `packages/lesson-schema/src/schema.ts`: five check kinds (`quiz`, `command`, `rubric`, `hidden-task`,
  `bug-hunt`, lines 32-66) all match the design's `^[a-z][a-z0-9-]*$` guard; `Check` is exported as both
  a value and a type (lines 32, 67), so `Check["kind"]` and a runtime import both exist; check ids unique
  per lesson (line 121); `relPath` is "not empty, no leading `/`, no `..` segment" (lines 12-18), as 4.5
  says.
- `validate.ts:81`: `lessonIds` is created per course, so lesson ids are unique only per course. The
  `(course_id, lesson_id)` pair is required. Correct.
- `packages/lesson-schema/package.json`: `exports` point only at `dist/`, so db's typecheck, tests and
  `drizzle-kit generate` need lesson-schema built first. `turbo.json` has `^build` on `typecheck`, `test`
  and `test:integration`, and the design adds the explicit `turbo run build --filter='@academy/db^...'`
  before generate. Correct. `src/index.ts` re-exports `validate.js` (node:fs, yaml), so `@academy/db`
  pulls those in at runtime. Acceptable for server-only consumers.
- `tsconfig.base.json` (NodeNext, verbatimModuleSyntax) and lesson-schema's `tsconfig.build.json`
  (`rootDir: src`): `dist/migrate.js` sits at the same depth as `src/migrate.ts`, so
  `new URL("../drizzle", import.meta.url)` gives `packages/db/drizzle` from both under plain Node.
- `biome.json` (`**/*.json` included, `!course/**/starter/**` style), `.editorconfig`, `.gitattributes`,
  `pnpm-workspace.yaml` (no `allowBuilds` yet), `turbo.json` (`test:integration` exists, `cache: false`),
  `.github/workflows/ci.yml` (no job runs integration tests; `checks` checks out with default depth),
  `docker-compose.yml` (`postgres:17.6-alpine`), `docs/architecture.md:35` (the sentence 9 replaces).
  All match the design's statements.
- Downstream consumers read: `backlog/03-auth`, `05`, `08`, `09`, `10`, `11`, `12`, `13`,
  `docs/learning-process.md` (cost per attempt, mentor sees transcript, weak topics later).

Data model against consumers:
- #30 auth: `users` with camelCase JS keys `emailVerified`, `createdAt`, `updatedAt` is what the Drizzle
  adapter indexes by. `text` ids fit the default generator. OK. The `uuid` remark is a caveat, see R1.
- #8 check runner: concurrent checks become separate attempts (uuid PK), `timeout` is a distinct
  check-result status, `running` + `started_at` support the stale sweep. OK.
- #10 quiz: an attempt with one `quiz` result, `score`, `details` jsonb, `transcript_path` NULL. OK.
- #11 mentor: `mentor_reviews.body` + `check_results.score`, cost per review. OK.
- #12 transcripts: one store-relative path per attempt, with an additive table if several are needed. OK.
- #13 hidden-task: `cost_usd`, `duration_ms`, `timeout`. OK.
- #9 / #35 dashboard: attempt history by the `attempts_lesson_started_idx` prefix; per-check latest result
  via `attempts` -> `check_results` PK prefix. The schema supports it. The semantics do not exist yet, see
  issue 4.
- Nothing I found forces a non-additive migration later. The costly items (text user id, the
  `(course_id, lesson_id)` pair, text + CHECK, the FK chain) are the right calls.

The four decisions:
- Drizzle 0.45 over 1.0 RC: agreed. Explicit column names and no RQB keep the upgrade mechanical. The
  open question about the 1.0 migrator adopting the 0.x table is honestly marked.
- `users` as the Better Auth table with `text` ids: agreed.
- `(course_id, lesson_id)` with no lessons table: agreed, matches ADR-0001 and `validate.ts:81`.
- text + named CHECK over `pgEnum`: agreed. The single-transaction `ADD VALUE` limit comes from research 2.

Coupling to lesson-schema for check kinds: the direction is right (the DB follows the contract, never
the reverse). Without `as`: in zod 4, `Check.options` is the typed tuple of `ZodObject`s and
`.shape.kind.value` is the literal, so `Check.options.map((o) => o.shape.kind.value)` infers the
literal union without an assertion. The design marks it [verify], with a stop-and-report fallback.
Acceptable.

Migrate wrapper: one `pg.Client` holds both the session advisory lock and Drizzle's migration
transaction (drizzle's node-postgres session runs the transaction on the client it was given). Release
happens on `end()`. `lock_timeout` also bounds DDL lock waits. F4 (killed process) holds by Postgres
semantics.

Tests: I traced each mutation row. I3 is observed through `pg_locks` rather than timing, I4's mutation
reaches the leaked lock, I7 has both directions, and I11 asserts the constraint name. Each row can go red
on its stated mutation. Whole-module import: integration tests import `src/`, and T-dist imports
`dist/index.js`.

What is NOT built: the scope is right. No repository layer, no RQB, no auth tables, no seeding.
LOC: about 1,100 handwritten (about 470 of them tests), a PROJECT tier.

## Verdict

FAIL - 4 issues found:

1. [plans/28-db-schema-design.md:82 (F7), :187-199 (4.4), :473 (T-drift)] The only justification for
   deriving `CHECK_KINDS` from lesson-schema is F7: "a lesson-contract change that adds a kind turns
   this red in the same PR". That claim depends on `drizzle-kit generate` emitting a migration when the
   VALUE of an existing named CHECK changes (same name, longer `IN (...)` list). Neither the research nor
   the design verifies this, and T-drift's only negative run adds a column, which exercises a different
   diff path. How it breaks: suppose 0.31 does not diff check bodies. A new kind in lesson-schema then
   widens the TS type `Check["kind"]` while the DB keeps the old `IN (...)`. CI stays green, and the first
   write of the new kind fails at runtime with 23514. That is the exact failure the guard claims to
   prevent. Fix: add a T-drift negative run that appends a value to one vocabulary (for example
   `MENTOR_REVIEW_STATUSES`), runs generate, and asserts a new `0001_*.sql` containing `DROP CONSTRAINT`
   and `ADD CONSTRAINT` for that name. Mark the row [verify]. The architect should also add, or name as
   the fallback, a Docker-free unit test that reads the latest `drizzle/meta/*_snapshot.json` and asserts
   that each named status/kind CHECK lists exactly the current vocabulary array. That test also catches a
   hand-edited snapshot, and it runs in `checks`, not only in `db`.

2. [plans/28-db-schema-design.md:242-243 (4.7), :76 (F1), :455 (I5)] `MigrationError`'s message
   "names the folder and says the transaction was rolled back" for every failure. Yet the same design
   routes three failures that happen before any transaction exists through the same error: lock timeout
   (I5, SQLSTATE 55P03 while waiting for `pg_advisory_lock`), connection refused, and an auth failure.
   For a 3 AM lock timeout, the operator then reads "migration transaction rolled back" and goes
   looking for bad SQL, while the real cause is a peer holding the lock. This breaks the code-style rule
   "an error message must not misinform". Fix: the message states the stage that failed (connect /
   acquire migration lock within N ms / apply migrations from <folder>, rolled back). It can be a `stage`
   field on `MigrationError`. I5 asserts the lock-stage message, and I4 asserts the apply-stage message.

3. [plans/28-db-schema-design.md:92 (F17), :245-248 (4.7), :423-426] The design says `MIGRATIONS_FOLDER`
   is "right under vitest and after build" because "consumers run from any cwd", and that
   `migrationsFolder` is overridable "only so I4 can feed a broken fixture". The first consumer is
   Next.js (#1/#30, which runs `migrateDatabase` at startup). Next.js bundles workspace packages into
   server chunks unless they are listed in `serverExternalPackages`. Under webpack/turbopack,
   `new URL("../drizzle", import.meta.url)` is not evaluated at runtime against `dist/migrate.js`: the
   bundler treats it as an asset reference (resolving a directory fails the build) or substitutes a
   build-time file URL. Either way the plain-Node reasoning does not carry over. F17 only covers file
   tracing, so #1 inherits a constant the design calls reliable when it is not. Fix: make
   `migrationsFolder` a documented public option for bundled consumers, not a test hook. Extend F17
   and the 11 follow-up: #1 either lists `@academy/db` (with `drizzle-orm`, `pg`) in
   `serverExternalPackages`, or passes an explicit folder, and it verifies migrate inside the built
   image. Add the same consequence to the ADR-0007 list in section 9.

4. [plans/28-db-schema-design.md:181-182, :193, :525-527 (ADR item 4)] The ADR "on the progress data
   model" defines how an attempt status is aggregated, but leaves two things undefined:
   - What an attempt covers. Is it one "Check" press of the `command` checks (#8), one quiz submit (#10),
     one rubric review (#11), or all checks of the lesson?
   - When `lesson_progress` becomes `completed`. The design only says "sticky (writer rule)" with no
     trigger.
   Four writers write these rows (#8 and #13 are LEARN tasks Stepan writes, plus #10 and #11), and #9/#35
   reads them. With no rule, each writer invents one. For example, #10 marks a lesson completed after the
   quiz passes while its command checks never ran. The dashboard's lesson status and course percentage
   then disagree with the attempts table, and fixing it later means a data backfill. Theory lessons with
   `checks: []` (schema.ts:94, 105) also have no completion path. Fix: ADR item 4 states attempt scope
   ("an attempt is one submission of a subset of the lesson's checks; `passed`/`failed` refer to that
   subset"). It also states the completion rule, for example: "completed when every check id in the
   current lesson.yaml has at least one `passed` result across the learner's attempts for that lesson,
   evaluated by the writer after each attempt finishes; a lesson with no checks is completed by an
   explicit learner action". It names who evaluates the rule, so all writers share one function in the
   first consumer. No schema change is needed.

Attribution: all four are design decisions or omissions in `plans/28-db-schema-design.md`, so they are
architect mistakes. Lesson appended to `.claude/feedback/architect_mistakes.md`.

## Recommendations (non-blocking)

- R1 (4.2, line 141 and section 2 row "uuid user ids"): "`text` still accepts uuids if #30 picks
  `generateId: "uuid"`" is unverified. On Postgres, Better Auth's `"uuid"` mode can leave id generation
  to the DB default, and `users.id` has none, so the insert would fail with NOT NULL. Either drop the
  claim or say "#30 keeps the default generator, or adds `DEFAULT gen_random_uuid()::text` (additive)".
- R2 (F2): `docs/architecture.md` draws Postgres only under `apps/web`. The design assumes "web and
  workspace start together" and both migrate. ADR-0007 should say which processes connect to the DB
  and who writes attempts (#8 says the workspace service "saves as an attempt"). Otherwise that API
  boundary gets decided implicitly in a LEARN task.
- R3 (4.4): the `sql.raw` value guard is called a safety property but has no test. Add a unit case: a
  value with `'` or a space throws at build time. The current kinds never trip it, so without the case
  nobody has seen it go red.
- R4: `tsconfig.json` include `"vitest.*.ts"` is redundant with `"*.config.ts"` (both config files match
  it). Harmless.

FAIL
