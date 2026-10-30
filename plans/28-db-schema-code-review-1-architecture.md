# #28 db schema: code review round 1, architecture

Judge: architecture. Input: the uncommitted diff in the worktree (HEAD 45396e7), spec
`plans/28-db-schema-design.md` rev 3 (sections 4-7, 9), plan `plans/28-db-schema.md`, tester report
`plans/28-db-schema-test-report.md`. Every file below was read in full.

## Process (`.claude/pipeline_state.json`)
- Every judge vote has `source: "hook"`, none inline. Design review ran three rounds with spawned judges
  (3/3 FAIL, then 2 PASS + ops FAIL, then 3/3 PASS); timings are minutes, not seconds.
- Observation for the orchestrator: CLAUDE.md section 4.2 says "Max 2 rounds, then ask Stepan". Design
  review went to round 3. If Stepan was not asked, that is an orchestrator mistake; I cannot see it from
  the state file.

## Schema vs section 5 (`packages/db/src/schema.ts`, `drizzle/0000_init.sql`)
Checked column by column against the generated SQL, not only the TS:
- users (sql:70-80, schema.ts:41-57): id text PK no default, `users_id_check` `<> ''`, name/email not
  null, `users_email_unique`, email_verified boolean default false not null, image nullable,
  created_at/updated_at timestamptz default now() not null. Matches.
- enrollments (sql:34-40, 84; schema.ts:59-75): PK `(user_id, course_id)`, FK users CASCADE,
  `enrollments_course_id_check`, enrolled_at. Matches.
- lesson_progress (sql:42-54, 85; schema.ts:77-106): PK `(user_id, course_id, lesson_id)`, FK
  `(user_id, course_id)` -> enrollments CASCADE, `lesson_progress_lesson_id_check`, status default
  `'in-progress'` + `lesson_progress_status_check` IN (`in-progress`, `completed`),
  `lesson_progress_completed_check` `(status = 'completed') = (completed_at IS NOT NULL)`. Matches.
- attempts (sql:1-13, 82, 87; schema.ts:108-142): uuid PK `gen_random_uuid()`, status default `'running'`,
  IN list of the four statuses, `attempts_finished_check`, transcript CHECK byte-identical to 4.5
  (sql:12), FK `(user_id, course_id, lesson_id)` -> lesson_progress CASCADE, index
  `attempts_lesson_started_idx (user_id, course_id, lesson_id, started_at)`. Matches.
- check_results (sql:15-32, 83; schema.ts:144-180): PK `(attempt_id, check_id)`, FK attempts CASCADE,
  check_id/check_kind/status/score/details/duration_ms/cost_usd numeric(12,6)/created_at; all six named
  CHECKs with the section-5 semantics (NULL passes each). Kind list `quiz, command, rubric, hidden-task,
  bug-hunt`. Matches.
- mentor_reviews (sql:56-68, 86, 88; schema.ts:182-212): uuid PK, FK attempts CASCADE, nullable check_id
  with no FK, status default `'pending'`, cost check, `mentor_reviews_completed_check`, index
  `mentor_reviews_attempt_created_idx`. Matches.
- Every FK is `ON DELETE cascade` (sql:82-86). Every named constraint/index from section 5 is present.

## Vocabulary (`src/vocabulary.ts`)
- One `as const` array per vocabulary (10, 14, 17, 20) is the source of the column `enum` type and the
  CHECK list via `inList` (schema.ts:99, 131, 170, 174, 204).
- `CHECK_KINDS` (24) is `Check.options.map((o) => o.shape.kind.value)` typed `readonly Check["kind"][]`,
  no `as`. `Check` is a value export of lesson-schema (`packages/lesson-schema/src/schema.ts:32`,
  re-exported by its index). `check_kind` is `$type<Check["kind"]>()` (schema.ts:150).
- Guard regex `^[a-z][a-z0-9-]*$` (27) runs before `sql.raw` (33-40). Throws at module load.

## Public API (`src/index.ts`, `client.ts`, `migrate.ts`, `errors.ts`, `connection-string.ts`)
- Exported: `createDb`, `Database`, `DbHandle`, `CreateDbOptions`, `migrateDatabase`, `MigrateOptions`,
  `MIGRATIONS_FOLDER`, `MIGRATION_LOCK_KEY`, `MIGRATION_LOCK_TIMEOUT_MS`, `MAX_LOCK_TIMEOUT_MS`, the five
  error classes, `MigrationStage`, the tables, the vocabularies and their types. `inList` and the two
  validators are not re-exported from index (design 4.7).
- migrate.ts:74-82 validates URL, lockTimeoutMs, migrationsFolder before any I/O; 84-104 stages
  connect (connect + `set_config($1, false)` bind parameter), lock (`pg_advisory_lock($1)`), apply;
  `client.end()` in `finally`. Messages (107-124) are exactly the four in 4.7, including the 55P03-only
  hint. `errorCode` (127-140) walks the cause chain with a depth bound.
- client.ts:22-27 pre-checks, always registers the pool `error` listener; the default logger (30-33)
  prints only the fixed prefix, code and message.
- No `process.env` anywhere in `packages/db` (grep). No import of `apps/` or `services/` (grep).
- Error classes: fixed message without cause (errors.ts:7-13); typeof-only for non-numbers (18).

## Packaging
- `package.json` has `exports` -> `dist/` and no `files` field, the same as lesson-schema. For a
  private workspace package linked by pnpm the whole folder is visible, and without `files` a pack or
  `pnpm deploy` also includes `drizzle/` (it is not git-ignored; `.gitignore:17` only ignores `dist/`).
  A `files` list would be the thing that could drop `drizzle/`, so its absence is correct.
- `MIGRATIONS_FOLDER` is `../drizzle` from `src/` and `dist/` (migrate.ts:19); T-dist proved it from
  `dist/` (whole-module import of the built index).

## ADR-0007 vs section 9
Status Proposed, Date, Issue #28 (lines 3-5). Context has every listed force and the sources (7-26).
Decisions 1-10 map one to one to 9.1-9.10; decision 5 (61-97) carries all of 4.9: attempt scope, atomic
finish, READ COMMITTED + `FOR NO KEY UPDATE` + separate completion statement and why a CTE / higher
isolation loses results (C1, C2), row creation, completion rule, theory lessons, stickiness, one writer
function, dashboard derivation with the zero-lesson corner and exact module status (C5), no grader
secrets. C3 is decision 8 (112-118), C4 is the consequence at 167-169. Alternatives (138-159) and every
consequence in 9 (161-182) are present. R3-N1..N3 are the backlog 08 follow-ups (184-193).
`docs/architecture.md:35-36`: the ADR-0007 bullet plus the kept sentence for workspace API and auth.

## Tooling files
`turbo.json:7-11` passThroughEnv; `biome.json:15` exact line, after `!**/.turbo`, not last;
`pnpm-workspace.yaml:6-10` block shape; `.editorconfig:17-20`; `.gitattributes:11-12`; `ci.yml:47-80`
job `db` with the eight design steps in order, `fetch-depth: 2`, `persist-credentials: false`,
`PR_HEAD_SHA` via env, `timeout-minutes: 3` on drift. Scripts match section 6 / 8 step 3 line by line.

## Tests: can each one fail?
Traced each mutation through the code (the tester re-ran only some):
- U1 (`migrations.test.ts:23-30`): without the `when` comparison (`journal.ts:52`) the result is empty,
  `toHaveLength(1)` is red. U2 asserts `isAbsolute`. U3: tester ran (a); (b) `1a`, (c) every reject are
  red by inspection.
- U4-U7 (`options.test.ts`): `rejectionOf(..., InvalidLockTimeoutError)` (assertions.ts:20-30) fails on a
  `MigrationError`, so "validation after connect" and "coerce with Number" are red; the two non-numbers
  use `@ts-expect-error` with the reason (36, 48), no `as`.
- I1-I5, I12 (`migrate.int.test.ts`): I3 polls the catalog and throws a named error without the lock;
  I4 asserts stage, folder, 22012, rollback, empty journal, canary, then a 2 s follow-up; I5 asserts
  stage, `within 500 ms`, absence of the apply text, 55P03.
- I6: an integer `score` refuses 0.75. I8/I8b: no listener means `onPoolError`/spy never fires.
- I9 asserts zero rows in all five tables; I10 asserts the FK name; I11 asserts SQLSTATE and constraint
  name for every reject, every vocabulary value for accepts, transcript titles by concatenation
  (schema.int.test.ts:312-345); tester ran M1-M3 with the exact counts.

## Coder deviations
1. `test/assertions.ts`: only `node:util`, Docker-free, not matched by either vitest include (not
   `*.test.ts`), typed narrowing instead of casts. Accepted.
2. Explicit names for every FK/PK/unique: section 5 says "every constraint and index is named". Drizzle's
   default name for the attempts FK would exceed Postgres's 63-byte limit and be truncated, so explicit
   names are better than the design. Column-level PKs (users, attempts, mentor_reviews) get the
   deterministic Postgres default `<table>_pkey`. Accepted.
3. `InvalidLockTimeoutError(value, maximum)`: avoids an errors.ts -> migrate.ts import cycle; the message
   text is exactly 4.7's. Accepted.
4. Canary password read back from the provided URL (`helpers.ts:109-115`) with a `canary-` prefix check:
   one source for the literal, and a container started without a canary fails loudly. Accepted.
5. I7: **the design needs the update, not the test.** The design's mutations ("drop `course_id` from the
   PK", "drop the PK") cannot be applied alone: `attempts_lesson_progress_fk` references
   `lesson_progress (user_id, course_id, lesson_id)`, and Postgres requires a unique key on exactly those
   columns (42830), so the migration fails and I1-I4 / the whole schema file go red for the wrong reason
   (tester report line 82). This is an architect mistake (a mutation not traced through the FK chain),
   not a coder one. The test (`schema.int.test.ts:139-156`) is correct and asserts the constraint name,
   which is what makes isolating mutations possible. Section 7 I7 should read:
   - second assertion: "PK `(user_id, lesson_id)` plus `unique (user_id, course_id, lesson_id)` for the
     FK: the other-course insert fails with 23505 `lesson_progress_pkey`" (variant a, tester-verified);
   - first assertion: "replace the PK with `unique (user_id, course_id, lesson_id)` named
     `lesson_progress_i7_unique`: the duplicate still fails with 23505 but names the other constraint,
     red at the constraint assertion, I9/I10 stay green". This isolates better than variant (b)
     (PK and FK dropped), which is red at the right assertion but also turns I9/I10 red.
   Not blocking for this code; the orchestrator should have the design text corrected and record the
   lesson in `architect_mistakes.md`.

## Non-blocking observations
- `check_results_cost_check` / `mentor_reviews_cost_check` (`cost_usd >= 0`) accept `'NaN'::numeric`
  (Postgres orders NaN above every number), and one NaN row turns `SUM(cost_usd)` into NaN on the
  attempt-cost path. Writers generate costs, and the design specified `>= 0`; an additive
  `cost_usd <> 'NaN'` later if a writer ever parses costs from an external response.
- `migrateDatabase` sets no `connectionTimeoutMillis`, so a blackholed DB host makes startup wait for
  the OS TCP timeout (about 2 min on Linux) before `MigrationError` stage `connect`. It still fails, it
  does not hang forever; the first consumer (#1/#30) may add a connect timeout option.
- `DbHandle.close()` is `pool.end()`; a second call rejects ("Called end on pool more than once"). Fine
  for v1 callers; worth a line in the TSDoc when the first consumer appears.

## Verdict
PASS - no architecture issues found
