# #28 db schema v1: design review round 2, architecture

Judge: judge-architecture. Input: `plans/28-db-schema-design.md` (revision 2, all 1014 lines), my round-1
report, the round-1 security and operations reports, `.claude/feedback/judge_mistakes.md`,
`.claude/feedback/design_review_genuine.md`, `.claude/pipeline_state.json`.

## What I checked

Process: `pipeline_state.json` is PROJECT / `judge_design`. Round 1 has three hook-recorded votes
(`source: "hook"`, no inline vote), and six judge spawns are registered (three per round). The architect
phase took 11 min, and round 1 took 2-8 min per judge.

Repo facts re-read for this round:
- `.github/workflows/ci.yml:3-6`: `pull_request` with no path filter, and `push` to main. Section 2's reason (2)
  for dropping the snapshot test is true.
- `packages/lesson-schema/src/schema.ts`: `checks` defaults to `[]` (94). Ready practice lessons need checks,
  but theory lessons may have none (105). Check ids are unique per lesson (121). `Check` is a value and a
  type (32, 67).
- `docs/adr/0001-lesson-format.md:19`: "The learner sees only `ready`". The dashboard denominator over
  `ready` lessons agrees with it.
- `docs/architecture.md`: Drizzle/Postgres appear only under `apps/web`. The workspace service is the only
  Docker client and runs checks, the mentor and transcripts. `docs/adr/0002-workspace-runtime.md` says
  nothing about results or a DB.
- Backlog 05 (workspace service API, ADR-0002 to Accepted), 08 (the service runs `command` checks,
  "streamed to the UI and saved as an attempt", timeout, concurrent checks), 09 (attempt history, lesson
  and module status, course percentage), 10 (quiz scored on the server in web), 11 (rubric mentor in
  workspace, cost logging), 13 (hidden task, timeout and budget).

### A1 (check-kind drift): resolved

- F7 now rests on ops-live evidence. With one more `ATTEMPT_STATUSES` value, drizzle-kit 0.31.11 emits
  `DROP CONSTRAINT` + `ADD CONSTRAINT`. The operations report (e) confirms it.
- T-drift negative B (7.1) asserts both lines for `mentor_reviews_status_check` in `0001_*.sql`, so it can
  fail.
- Check kinds go through the same `IN`-list helper (4.4). The `db` job runs on every PR, so a PR that only
  adds a lesson-schema kind turns `check-drift.sh` red. I walked that path: `CHECK_KINDS` is derived at
  import, drizzle-kit loads `schema.ts` against the rebuilt lesson-schema `dist/` (8 step 4), the CHECK body
  differs, a migration is generated, and the step is red.
- Dropping the snapshot-vs-vocabulary test is sound. My round-1 fix offered that test as a fallback in case
  the drift step could not see a changed CHECK body, and it can (ops-live). The cases the test would add:
  - A hand-edited SQL file whose CHECK lacks a value: I11 inserts every value of every vocabulary and of
    `CHECK_KINDS` into a DB migrated from the SQL files, so the insert fails with 23514.
  - A hand-edited snapshot that hides drift: the drift step then passes, but I11 still exercises the SQL.
  - An edited merged snapshot: the append-only step.
  
  The remaining direction is a SQL CHECK broader than the vocabulary. The DB then accepts more than TS
  emits, which is harmless. Coupling a test to the 0.x snapshot JSON format would also add upgrade cost.
  Accepted.

### A2 (MigrationError stages): resolved

- 4.7 defines the stages `connect` (connect + `set_config`), `lock` (`pg_advisory_lock`) and `apply`
  (`migrate`), and exports the `MigrationStage` type. Each stage has its own message. `<code>` is the first
  SQLSTATE or Node code in the cause chain, otherwise `unknown`.
- The `apply` wording "no migration from this run was applied" holds in both cases I traced:
  - A rolled-back transaction (F1, ops-live: 0 journal rows).
  - A missing journal. `readMigrationFiles` throws before the transaction, so the code is `unknown` and the
    folder is named.
  
  Drizzle's `CREATE SCHEMA` / `CREATE TABLE IF NOT EXISTS __drizzle_migrations` run outside the
  transaction, so the table exists with 0 rows. I4 asserts 0 rows, not absence, which is consistent.
- Tests can tell the stages apart:
  - U5 (connect, ECONNREFUSED) and I12 (connect, 28P01).
  - I5 (lock, `within 500 ms`, 55P03, and *not* the apply phrase, so the "one message for all stages"
    mutation goes red).
  - I4 (apply, folder + 22012 + phrase).
  - I1's mutation expects stage `apply`.
- The messages contain no URL (4.11). U5, I4, I5 and I12 carry canaries.

### A3 (`migrationsFolder` public option): resolved

The option is documented (TSDoc) in 4.7 and named in F17, 6 "Deploy awareness", ADR item 9, the
consequences and 11. F17 now covers the bundler rewriting `import.meta.url` as well as file tracing. #1/#30
get both ways out (`serverExternalPackages` with `@academy/db`, `drizzle-orm`, `pg`, or an explicit
folder), plus "ship `packages/db/drizzle` in the image" and "test migrate inside the built image". U2 keeps
`MIGRATIONS_FOLDER` absolute.

### A4 (progress semantics): resolved, with conditions below

Computable from the schema as designed. I wrote the query:
`check_results cr JOIN attempts a ON a.id = cr.attempt_id WHERE (a.user_id, a.course_id, a.lesson_id) = ($1,$2,$3) AND a.status <> 'running' AND cr.status = 'passed'`,
then the distinct `cr.check_id` set is compared with the current lesson's check ids.
- Every column it needs exists, and the PK is `(attempt_id, check_id)`, so the check ids of each attempt
  are stored.
- `attempts_lesson_started_idx` and the `check_results` PK prefix serve the query.
- The evaluating attempt is already final inside the same transaction (4.9 "Atomic finish"), so its own
  results count.

Concurrency, walked at both ends:
- Two attempts finish together under READ COMMITTED (Drizzle's default). T2 blocks on `FOR UPDATE`.
  - If T1 completed the row, T2 re-reads the new version, sees `completed`, and stickiness makes it a
    no-op.
  - If not, T2's next statement takes a fresh snapshot and sees T1's committed results.
  
  F23 holds. It holds only because the results query is a separate statement after the lock. See C1.
- The deadlock path. Starting an attempt takes `FOR KEY SHARE` on the progress row (FK check), and the
  finish transaction takes `FOR UPDATE`. That is a short wait, not a cycle, because the start transaction
  holds nothing the finisher needs. See C2.

Consistency with the vocabularies and stickiness:
- The attempt statuses are now scoped to the attempt's own checks (the 4.4 table row says so).
- A passed check counts even when its attempt is `failed`/`error`.
- Results for removed check ids are ignored.
- Stickiness agrees with `lesson_progress_completed_check` and with keeping `completed_at` as the first
  completion time.
- A lesson that loses its last check becomes `checks: []`, so "mark as done" becomes available. There is no
  dead end.
- "Mark as done" is refused for lessons with checks, so it cannot bypass grading.

ADR-0001: lessons are read through lesson-schema, ids stay text references, and the dashboard counts
`ready` lessons only, which matches "the learner sees only `ready`". The numerator is restricted to the same
set, so the percentage cannot exceed 100%.

Backlog:
- 08: concurrent checks become separate attempts, and `timeout` is a result status.
- 10: one quiz attempt written by web.
- 11: rubric result, `mentor_reviews.cost_usd`, an async review before the result row (no FK on
  `check_id`).
- 13: cost, duration, timeout.
- 09: history from `attempts`, status from `lesson_progress`.

None of them needs a schema change.

### 4.10 "apps/web is the only DB client" vs backlog 05/08/11/13

It agrees with `architecture.md`, where Drizzle sits only under `apps/web`. It contradicts nothing in
ADR-0002. Backlog 08's "saved as an attempt" does not name who saves, and 4.10 settles it explicitly. Any
other choice needs the workspace-API ADR and an update to ADR-0007. That is the right place for a
costly-to-change boundary. One wording point (C3): the sentence "the SSE path in architecture.md" carries
results service -> apps/web reads more into the diagram than it says. The diagram labels SSE as a browser
protocol joining the apps/web -> workspace arrow. It does not show apps/web relaying it.

### Stale text and fixes that could introduce new defects

- I searched for "rolled back", "only so I4", "any cwd", "hang", "test hook", "sticky" and "snapshot". The
  only remaining "rolled back" is the historical remark in 4.7. F8 no longer says hang. Section 1, section 2,
  "What NOT to build", 4.4, 4.9, 9 and 11 are consistent with each other.
- One remnant is F16 (C4). It still reads "after the check runner crashes ... The sweep belongs to backlog
  08: on startup", written as if the runner were the writer. Under 4.10 the sweep writes to the DB, so it
  runs in `apps/web`. A sweep only at web startup also misses a service crash while web stays up.
- The `set_config` / validator / URL pre-check additions introduce no new SQL interpolation. The pre-check
  has no `cause`. `MAX_LOCK_TIMEOUT_MS` matches Postgres's int setting maximum.
- The lock-stage message (N1) is non-blocking.

### Files and LOC

The handwritten total from section 6 is about 1,480 lines: about 590 source and config, about 650 tests and
fixtures, and a 180-line ADR. That is consistent with PROJECT. `migrate.ts` at 80 lines (stages, the
validator, code walking, constants) is tight but plausible. Every module named in 4.7 has a file row:
`errors.ts`, `connection-string.ts`, `client.ts`, `migrate.ts`, `vocabulary.ts`. `test/unit/journal.ts`
does not match the unit include, so it is not run as a test, which is correct.

## Verdict

PASS - no architecture issues found. Round-1 blockers A1-A4 are resolved in the text, and none of the fixes
contradicts the schema, ADR-0001 or backlog 05/08-13.

## Conditions for the plan and ADR-0007 (non-blocking, carry them forward)

- **C1 (4.9, F23, ADR item 5):** state that the finish transaction runs at READ COMMITTED (the default; not
  REPEATABLE READ or SERIALIZABLE) and that the completion query is a **separate statement issued after**
  `SELECT ... FOR UPDATE`. A single statement (a CTE that locks and aggregates), or a higher isolation level,
  evaluates against a snapshot taken before the wait and loses the other attempt's results, which is the
  exact F23 failure. Backlog 08 is a LEARN task, so the rule must be written down, not implied.
- **C2 (4.9):** consider `FOR NO KEY UPDATE` instead of `FOR UPDATE`. The writer only changes non-key
  columns, and `FOR NO KEY UPDATE` does not block concurrent attempt inserts, whose FK check takes
  `FOR KEY SHARE` on the same row.
- **C3 (4.10, 11):** ADR item 8 should say that the workspace API must return check results, mentor output,
  cost and the transcript path to `apps/web` (the browser stream is relayed by or ends in `apps/web`), and
  not credit `architecture.md` with that. Add **backlog 05** (where the workspace API and ADR-0002
  acceptance happen) to section 11, not only backlog 08.
- **C4 (F16):** the stale-`running` sweep runs in `apps/web`, the only writer. It runs at web startup, and
  `apps/web` also marks an attempt `error` when the service stream ends without a result.
- **C5 (4.9 dashboard):** define the zero corner: a course or module with 0 `ready` lessons shows no
  percentage (or 0%), never `0/0`. Define module status exactly, for example completed when all of its
  ready lessons are completed, in progress when any has a row.
- **N1 (4.7 lock message):** a lock-stage failure that is not 55P03 (for example, the connection was
  terminated during the wait) would still read "within N ms ... another migrateDatabase may hold it". Use
  that wording only for 55P03, and otherwise use `failed while waiting for the migration lock (<code>)`.
- **N2 (4.7):** reject a relative `migrationsFolder` (`path.isAbsolute`) with a named error. The TSDoc
  promises an absolute path, and Drizzle would otherwise resolve it against the cwd, which is the failure
  U2 guards for the default.
- **N3 (U4):** passing `"500"` needs a type escape in the test. Use `// @ts-expect-error` with a reason, not
  `as unknown as number`.

PASS
