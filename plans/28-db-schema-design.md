# #28 db schema v1: design

Tier PROJECT. Branch `feat/28-db-schema`. Upstream: `plans/28-db-schema-research.md` (versions, Drizzle
internals, testcontainers pattern, Better Auth facts, repo conflicts). This design settles the four open
questions. ADR-0007 records them as Proposed, so Stepan can overturn any of them when he accepts it.

**Costly to change (extra scrutiny, ADR-0007):** the user id type and every user FK (4.2), the lesson
reference `(course_id, lesson_id)` (4.3), the status vocabularies and how they are enforced (4.4), the
transcript reference semantics (4.5), the key/FK chain (5), the progress semantics (4.9), the migration
tool line and folder format (4.1). Everything else (indexes, nullable extras) is cheap: an additive
migration.

**Issue numbers.** `#1` (web bootstrap) and `#30` (auth, `backlog/03-auth.md`) are GitHub issues.
Every other future task is named by its backlog file ("backlog 08" = `backlog/08-learn-check-runner.md`),
because GitHub numbers differ from backlog numbers. Revision 1 mixed the two.

**Evidence.** The architect has no shell. Items marked **(ops-live)** or **(ops-live r1)** were run by the
operations judge in round 1 (`plans/28-db-schema-design-review-1-operations.md`); **(ops-live r2)** in round 2
(`plans/28-db-schema-design-review-2-operations.md`). Tool versions measured there: pnpm 10.28.0, Node
22.23.1, turbo 2.11.10, Docker 29.7.2, pg 8.23.1, drizzle-orm 0.45.4, drizzle-kit 0.31.11,
@testcontainers/postgresql 12.2.1, vitest 5.0.5 (vite 8.3.5), Biome 2.6.x, `postgres:17.6-alpine`.
Items marked **[verify]** are product facts still unconfirmed; each names the test that settles it and the
fallback. Items marked **[verify-live]** are tester commands written in revision 3 that nobody has run
yet; the operations judge runs them in round 3 (the list is in section 12). Every command in 7.1 is meant
to be run verbatim.

---

## Revision 4 (after judge_code round 1)

The schema, the four decisions and every costly-to-change item are unchanged. Revision 4 corrects the I7
mutation text (the I7 test itself was correct) and brings the design in line with the coder's security fix
round, which changed where the migrate client is built and what two tests assert.

| Item | Resolved in |
|---|---|
| Arch code review r1, deviation 5 (`plans/28-db-schema-code-review-1-architecture.md`; confirmed live in `plans/28-db-schema-test-report.md`, section "Coder's I7 deviation"): the I7 mutations "drop `course_id` from the PK" and "drop the PK" cannot be applied alone. `attempts_lesson_progress_fk` references `lesson_progress (user_id, course_id, lesson_id)`, and Postgres needs a unique key on exactly those columns, so the regenerated `0000` fails with `42830`, I1-I4 go red with `MigrationError` stage `apply`, and `schema.int.test.ts` is skipped in `beforeAll`: I7 was red for the wrong reason | 7 I7 (mutation a: PK `(user_id, lesson_id)` plus a unique on the three columns, verified live; mutation b: the PK replaced by a separately named unique on the three columns, verified live (code-review round-1 re-test); the "PK and `attempts_lesson_progress_fk` dropped" variant kept as a note), 12 (I7 rows) |
| Security fix round: the `pg.Client` constructor parses the URL and reads `sslcert`/`sslkey`/`sslrootcert` files synchronously, so it can throw. Built outside the connect stage, such a throw escaped `migrateDatabase` as a raw error with no stage. The code now builds the client inside the connect-stage `try` and calls `client?.end()` in `finally` | 4.7 steps 2 and 5 |
| The constructor throw is a new class of connect failure (unreadable ssl file `ENOENT`, or an invalid libpq-compat `sslmode` combination); its message names the file path from the URL query, never the password (pg-connection-string@2.14.1 `index.js:91-99`, `:127`) | 4.11 (`MigrationError` bullet) |
| U5 gains the missing-`sslrootcert` case and the mutation "build the client outside the try" (verified red live by the coder) | 7 U5 |
| I8b "the logged text" was undefined, so a logger that printed an object could pass or fail depending on how the test stringified it. Now: each `console.error` argument rendered as `console` prints it; mutations "also print `pool.options`" and "print the URL" verified red live | 7 I8b |

---

## Revision 3 (after judge_design round 2: security PASS, architecture PASS, operations FAIL)

The schema, the four decisions and every costly-to-change item are unchanged. Revision 3 rewrites the
tester procedure (7.1) around the state the pipeline actually leaves, and folds in the round-2 conditions.

| Item | Resolved in |
|---|---|
| O-B1 T-install red on correct work (stale `ignoredBuilds: esbuild@0.28.2`, Myers deletions, deprecation WARN), negative could not fire | 7.1.0 (tester clone, fresh `node_modules` by construction), 7.1 B3 (`--diff-algorithm=histogram`, non-vacuous awk), B4/B5 (WARN allowlist incl. the `@esbuild-kit` line), B4 `MODE=noallow` + B6 (negative from a fresh clone), 4.8, F24, F26, 10 step 1 |
| O-B2 T-sep negative cannot fail (testcontainers falls back from a dead `DOCKER_HOST`); vitest 5.0.5 hides globalSetup errors | F9 (console.error before rethrow, exact line), 6 `global-setup.ts` row (image constant), 7 T-sep row, 7.1 B10 (nonexistent image tag, exact grep, exit 1, cp/cmp restore) |
| O-B3 I11 M1-M3 "exactly" was wrong | 7 I11 (one test per transcript case with fixed titles; exact measured sets), 7.1 B12 (JSON reporter, set comparison, baseline control) |
| O-B4 check-drift.sh green output unspecified | 6 `check-drift.sh` row (always prints the drizzle-kit output, then `migrations match the schema`), 7 T-drift row, 7.1 B11 positive, 8 step 6 |
| O-note T-append `delete` used `g rm` (harness refuses `rm` in `bash -c`) | 7.1 B13 (`mv` out of the repo, `g add -A` records the deletion) |
| O-note T-biome trailing comma | 4.8 (line position fixed: directly after `"!**/.turbo",`, never last), 7.1 B8 (negative removes that one exact line in the clone; asserts the red names `_journal.json` and is not a config parse error) |
| O-note T-dist realpath | 7.1 B9 (compares with `pwd -P`) |
| Sweep S1: `check-drift.sh` is red in the uncommitted worktree (`packages/db/drizzle` is untracked, so `git status` is never empty) | 6 `check-drift.sh` row, 7.1.0 (clone has a snapshot commit), 10 step 7 |
| Sweep S2: `pnpm lint` in the worktree also lints git-ignored `.claude/pipeline_state.json` and `.claude/settings.pipeline-grant.json` (Biome has no VCS integration in `biome.json`) | 7.1.0, B7 (lint runs in the clone), 10 step 3 [verify-live] |
| Sweep S3: T-sep positive under `DOCKER_HOST=unix:///nonexistent` proved nothing (fallback), and `pnpm test` may be a turbo cache hit | 7 T-sep row, 7.1 B10 positive (runs vitest directly in a clone with no turbo cache, asserts the file list) |
| Sweep S4: U4 mutation "no `typeof` check" cannot go red (`Number.isSafeInteger("500")` is already false) | 7 U4 (mutation replaced by "coerce with `Number(value)`") |
| Sweep S5: T-install's awk passed vacuously on an empty numstat (unchanged lockfile) | 7.1 B3 (`END { exit !(NR == 1 && a > 0 && d == 0) }`) |
| Sweep S6: `rg` is not guaranteed on PATH | 7 "Also" line, 7.1 B15 (the Grep tool) |
| Sweep S7: T-dist `node -e` used `'...'` inside a single-quoted `bash -c` | 7.1 B9 (escaped double quotes) |
| Sweep S8: T-env fallback `docker rm -f` and a fixed 15 s wait | 7.1 B14 (poll up to 60 s inside the block; manual fallback stated outside `bash -c`) |
| Sweep S9: step 0 had no tester-side re-check once committed | 7.1 B2 (T-lockfile-commit, read-only on `HEAD^`/`HEAD`) |
| Sweep S10: mutations were made in the worktree, on files that are the pending diff | 7.1.0 (all mutations happen in the tester clone), 10 steps 6-7 |
| Arch C1 READ COMMITTED, completion query a separate statement after the lock | 4.9, F23, 9 item 5 |
| Arch C2 `FOR NO KEY UPDATE` | 4.9, F23, 9 item 5 |
| Arch C3 workspace API returns results/mentor/cost/transcript path to `apps/web`; backlog 05 | 4.10, 9 item 8, 11 |
| Arch C4 stale `running` sweep in `apps/web`; stream end without result -> `error` | F16, 9 consequences, 11 |
| Arch C5 zero-lesson corner, exact module status | 4.9, 9 item 5 |
| Arch N1 lock message only for 55P03 | 4.7 |
| Arch N2 relative `migrationsFolder` rejected with a named error | 4.7 (`InvalidMigrationsFolderError`), 4.11, 6, 7 U7, 9 item 9 |
| Arch N3 `"500"` via `// @ts-expect-error` with a reason | 7 U4 |
| Sec 1 `InvalidLockTimeoutError` prints `typeof`, not `JSON.stringify` | 4.7, 4.11, F25, 7 U4 (`10n` case) |
| Sec 2 `DrizzleQueryError` embeds query params: #30 states its own DB-error logging rule | 4.11, 9 consequences, 11 |
| Sec 3 `transcript_path` has no length cap | 4.5 (residual, additive later) |

---

## Revision 2 (after judge_design round 1, 3/3 FAIL)

The schema shape and the four decisions are unchanged. Each blocker maps to the sections that resolve it.

| Blocker | Resolved in |
|---|---|
| S1 exact transcript_path SQL, reject/accept cases, naive-version mutation, reader still confines | 4.5 (expression, grammar, anchors), 5 (attempts), 7 I11 + mutations M1-M3 (7.1), 9 item 7 |
| S2 lock_timeout never via `sql.raw`; validation, named error, unit test | 4.7 (`set_config` with a bind parameter, `InvalidLockTimeoutError`, `MAX_LOCK_TIMEOUT_MS`), F3, F25, 7 U4, I5 mutations |
| S3 "cascade removes everything" was false | 4.6 (corrected because-clause, what the cascade does not cover), F22, 9 item 6 and consequences, 11 |
| S4 connection string never in logs, errors or `cause` | 4.11 (rule), 4.7 (URL pre-check with no echo and no `cause`), F13, F21, 7 U5, U6, I4, I5, I8b, I12 (canary passwords) |
| A1 check-kind drift: evidence and negative run | F7 (ops-live evidence), 4.4, 7.1 T-drift negative B, section 2 (snapshot unit test rejected, with reasons) |
| A2 MigrationError names the failed stage | 4.7 (`stage`: connect, lock, apply; one message per stage), F1, F3, 7 I1, I4, I5, U5, I12 |
| A3 `migrationsFolder` is a public option for bundled consumers | 4.7, F17, 6 deploy awareness, 9 consequences, 11 |
| A4 progress semantics | 4.9 (new), 4.4 table, F23, 9 item 5, 11 |
| O1 drift guard exits 0 on a rename | F8 (rewritten), 6 `check-drift.sh`, 8 step 6, 7.1 T-drift negative C plus the guard mutation |
| O2 lockfile not in pnpm's format | 10 step 0 (format-only first commit), F24, 7.1 T-lockfile, T-install |

Non-blocking items taken: `persist-credentials: false` and quoted `"$PR_HEAD_SHA"` (8); the guard
message names `fetch-depth` (8); `users_id_check` (5, I11); case-sensitive email (4.2); `details` holds
no grader secrets (4.9, 9); an attempt id is not authorization (4.6, 9); the Better Auth `"uuid"` claim is
withdrawn (4.2, 2); who connects to the DB (4.10, F2); U3 for the `sql.raw` value guard (4.4, 7); T-env
precondition by Ryuk label (7.1); edited `when` values in `_journal.json` as a residual risk (F6, 9). Also:
I11 now inserts every vocabulary value, which catches a SQL file that disagrees with its snapshot; the
CI guard logic lives in two scripts under `packages/db/scripts/`, so the tester runs exactly what CI runs
(6, 8).

---

## 1. Solution design

- **New workspace package `packages/db` (`@academy/db`)**, laid out like `packages/lesson-schema`
  (ESM, `tsc` to `dist/`, vitest). Exports: the Drizzle tables and status vocabularies,
  `createDb(url, options?)` (a `pg` Pool wrapped in Drizzle; it reads no env),
  `migrateDatabase(url, options?)` (a runtime migrator on a single connection under a Postgres advisory
  lock; failures name the stage that failed), `MIGRATIONS_FOLDER` (the default folder, right for
  plain-Node consumers), and the error classes.
- **Schema v1: six tables** (`users`, `enrollments`, `lesson_progress`, `attempts`, `check_results`,
  `mentor_reviews`) on one FK chain `users -> enrollments -> lesson_progress -> attempts ->
  {check_results, mentor_reviews}`, every FK `ON DELETE CASCADE`. Lessons are referenced by
  `(course_id, lesson_id)` text, never through a lessons table (ADR-0001). `users` *is* the future
  Better Auth user table (text id). Statuses are `text` columns with named `CHECK` constraints, never
  `pgEnum`.
- **Migrations: Drizzle 0.45.4 / drizzle-kit 0.31.11**, one generated `drizzle/0000_init.sql`. Three
  guards make up for the 0.x weaknesses: a Docker-free unit test of journal order (U1), a CI step that
  refuses edits to already-merged migration files (`check-append-only.sh`), and a CI drift step
  (`check-drift.sh`) that requires drizzle-kit's positive output
  `No schema changes, nothing to migrate`, not only exit 0 and a clean tree.
- **Semantics, not only shape:** ADR-0007 defines what an attempt covers, when a lesson becomes
  `completed`, who writes it and how the dashboard derives percentages (4.9), so every later writer
  follows one rule.
- **Tests:** `pnpm test` stays Docker-free (unit config, `test/unit/**`). `pnpm test:integration` runs
  `test/integration/**/*.int.test.ts` against `postgres:17.6-alpine` via testcontainers, one fresh
  database per test file, with a canary password in every URL. A new CI job `db` runs the guards and the
  integration tests. The tester runs every tooling check in a scratch clone that matches what CI sees
  (7.1.0).

### What NOT to build in v1 (and why)

| Not built | Why |
|---|---|
| Better Auth `session`, `account`, `verification` tables, any auth code | #30 owns auth. v1 only fixes the id type they will reference (4.2) and records that their user FKs must cascade (4.6). |
| A `lessons`/`modules`/`courses` table | ADR-0001: lessons live in git, and the DB stores references only. |
| Repositories/services layer, query helpers, the completion function | No consumer exists yet (`apps/web` is parked in #1). 4.9 defines the completion rule, and the first issue that writes attempts implements it in `apps/web` (4.10). |
| Drizzle relations / relational query API (`db.query`) | Drizzle 1.0 replaces this API (RQB v2, research 3). Defining it now is upgrade cost with no user. |
| Seeding, a `db:migrate` CLI, docker-compose changes | #30 adds the seed. The first app (#1/#30) calls `migrateDatabase` at startup. The compose `db` service is unchanged, and nothing in this PR migrates it. |
| Weak-topics table, workspace table, transcript storage and deletion, cost aggregates, attempt numbering, content revision column | Owned by later tasks (learning-process 4, backlog 05, backlog 12, backlog 09). All are additive later. |
| `updated_at` triggers, soft delete, RLS | One local user. Timestamps set by the app are enough. |
| Slug-regex `CHECK`s on ids | See 4.3: a second id grammar would drift from ADR-0001 and would not catch the likely bug. |
| A unit test comparing `drizzle/meta/*_snapshot.json` with the vocabularies | Rejected in section 2: the drift step catches the change on every PR (ops-live), and I11 covers the SQL. |
| A `transcript_path` length CHECK | The writer generates the path (4.5). Additive later if ever needed. |

---

## 2. Alternatives considered (summary; details per decision in section 4)

| Alternative | Rejected because |
|---|---|
| Drizzle 1.0 RC (1.0.0-rc.5) | Pre-release, and the API is still moving (beta.22 -> rc.5): `casing` removed from config, RQB v2, `db.execute` result type changed (research 3). 0.45 has a one-command upgrade path (`drizzle-kit up`). |
| `pgEnum` for statuses | `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction, Drizzle runs all pending migrations in one transaction, and there is no `DROP VALUE` (research 2). |
| Own `users` table + Better Auth `user` 1:1 | Two user identities for one person and a join on every request, and #30 still needs the FK type decided now. |
| `uuid` user ids | Better Auth's default id is a 32-char string generated by the app. A `uuid` column would reject it without extra #30 configuration. `text` fits the default generator as is. |
| `lesson_id` alone | Lesson ids are unique only per course (validate.ts:81), so a second course would collide. |
| A DB-level check that the lesson exists in `course/` | The DB cannot see git, history must survive lesson removal, and the writer already holds a parsed lesson. |
| Storing transcripts in Postgres | Transcripts are large JSONL/terminal logs written by the workspace service (architecture.md). The rows would bloat, and the service owns that storage. |
| transcript_path CHECK as the relPath equivalent (`<> ''`, no leading `/`, no `..` segment by a negative regex) | A denylist must enumerate every bad spelling, and it still admits backslashes, control characters (log injection) and `%2e%2e`. The allowlist in 4.5 cannot miss a spelling. The writer generates the path, so no human-typed names need room. The allowlist also needs no backslash escapes, so there is no JS-template or `E''` escaping layer to get wrong. |
| Set the lock timeout with `SET lock_timeout = <n>` | `SET` takes no bind parameters, so the value would be interpolated into SQL. See 4.7. |
| The `pg` client config option `lock_timeout` | It would also avoid interpolation, but it ties a safety property to a driver detail nobody has checked for pg 8.23. `set_config` is plain Postgres, and I5 tests it end to end. Not chosen, so nothing in pg needs confirming. |
| A Docker-free unit test that the latest snapshot's CHECK lists equal the vocabularies (architecture review A1) | (1) ops-live: drizzle-kit 0.31.11 regenerates a changed CHECK list (`DROP CONSTRAINT` + `ADD CONSTRAINT`), so the drift step catches a vocabulary or check-kind change. (2) The `db` job has no path filter (ci.yml:3-6 triggers on every `pull_request` and on `push` to main), so it also runs on a lesson-schema-only PR. (3) The test would couple to the 0.x snapshot JSON format, which `drizzle-kit up` rewrites in the 1.0 upgrade. (4) A merged snapshot cannot be edited (append-only step), and an unmerged SQL file whose CHECK lacks a value is caught by I11, which inserts every vocabulary value. |
| The workspace service writes attempts to Postgres directly | Contradicts architecture.md (Postgres only under `apps/web`; the service is the only Docker client). A second DB client needs the workspace-API ADR. See 4.10. |
| One shared database for all integration test files | Shared state and order dependence (code-style 6). The migrate tests need an empty database. |
| `postgres` (postgres.js) driver | `pg` is newer, is the only driver in Better Auth's peers, and its `Pool` is what Better Auth/Kysely accept (research 4). |
| `casing: "snake_case"` | It must be set identically in `drizzle.config.ts` and `drizzle()` (a mismatch is a runtime column error), and it is removed in 1.0. Explicit column names survive the upgrade. |
| The drift and append-only checks written inline in ci.yml | The tester could then only test a retyped copy. Scripts in `packages/db/scripts/` are what CI runs and what T-drift/T-append run. |
| Tester checks run in the worktree (revisions 1-2) | The worktree differs from CI in four measured or traced ways: a populated `node_modules` with a stale ignored build (ops-live r2), the uncommitted `packages/db/drizzle` that makes `check-drift.sh` red (S1), git-ignored JSON that Biome lints (S2), a turbo cache. Mutations there also touch the pending diff. A scratch clone with one snapshot commit has none of these (7.1.0). |
| `DOCKER_HOST=unix:///nonexistent` as the "no Docker" trigger | testcontainers 12.2.1 falls back to `/var/run/docker.sock` (ops-live r2), so the run passes. A nonexistent image tag fails container start on any machine where Docker runs (ops-live r2). |
| A test-only env variable for the image tag (e.g. `ACADEMY_TEST_POSTGRES_IMAGE`) as the T-sep trigger | It adds a knob that turbo's strict env mode would drop unless also passed through, i.e. config that exists only for a negative run. Editing the constant in the scratch clone needs neither. |

---

## 3. Failure modes and mitigations

| # | Failure | Mitigation | Covered by |
|---|---|---|---|
| F1 | A migration fails mid-run (bad SQL, existing rows violate a constraint) | Drizzle 0.45 applies all pending files in ONE transaction (research 2; ops-live: fixture `CREATE TABLE broken_probe; SELECT 1/0` left no table and 0 journal rows). `migrateDatabase` closes its connection in `finally` (which releases the advisory lock) and rejects with `MigrationError` stage `apply`, whose message names the folder, carries the SQLSTATE and says no migration from this run was applied. The caller (first app) must exit non-zero and not serve. | I4 |
| F2 | Two processes migrate concurrently. Only `apps/web` connects (4.10), but an overlapping dev restart, a second web process or a manual run can overlap. | 0.45 has no lock (research 2). `migrateDatabase` takes `pg_advisory_lock(MIGRATION_LOCK_KEY)` on its single connection before migrating. The second process waits, then sees the journal and does nothing (ops-live). | I3 |
| F3 | A peer holds the lock forever (stuck migration, DDL waiting behind a long query) at 3 AM | The migrate session runs `SELECT set_config('lock_timeout', $1, false)` with the validated timeout as a bind parameter (default `MIGRATION_LOCK_TIMEOUT_MS = 60_000`). A stuck peer then becomes `MigrationError` stage `lock` instead of a silent hang. `lock_timeout` applies to `pg_advisory_lock` on Postgres 17.6 (ops-live r1: 55P03 after 0.56 s with a 500 ms timeout; ops-live r2 with pg 8.23.1 and `set_config(..., false)`: 55P03 after 515 ms). The session setting also bounds DDL lock waits during `apply`. | I5 |
| F4 | Process killed mid-migrate | Postgres aborts the open transaction and drops the session-level advisory lock when the connection closes. Nothing to clean up. | (Postgres semantics) |
| F5 | Out-of-order migration after two branches generate concurrently (0.45 silently skips an entry whose `when` is older than the newest applied one) | Unit test U1: journal `idx` contiguous from 0, `when` strictly increasing with `idx`, every entry has its `.sql`, no stray `.sql`. A hand-resolved merge that appends an older migration after a newer one goes red. | U1 |
| F6 | An already-merged migration file is edited (0.45 stores the hash but never compares it) | `check-append-only.sh` on pull requests (8 step 3). Residuals, recorded in ADR-0007: (a) a direct push to `main` bypasses it (no branch protection on the free plan, ADR-0004); (b) `meta/_journal.json` is excluded from the diff because every migration appends to it, so editing an existing entry's `when` is unguarded, and U1 only checks that the values increase; (c) edits inside the PR that introduces a file are allowed, so Stepan resets his local DB (`docker compose down -v`) if he applied an unmerged migration. | T-append |
| F7 | `schema.ts` changed without a migration, a vocabulary value changed, or lesson-schema gained a check kind | `check-drift.sh` (8 step 6). ops-live: after adding one `ATTEMPT_STATUSES` value, drizzle-kit 0.31.11 generated `ALTER TABLE "attempts" DROP CONSTRAINT "attempts_status_check"` and `ADD CONSTRAINT ... IN (..., 'cancelled')`, and the step went red, so a changed CHECK body is detected. Check kinds flow through the same IN-list helper (4.4), and the `db` job has no path filter, so a lesson-schema PR that adds a kind turns it red. | T-drift (negatives A, B) |
| F8 | drizzle-kit meets an ambiguous change (column/table rename, a drop plus an add in one table) in non-TTY CI | It does not hang. ops-live: it prints `Interactive prompts require a TTY terminal`, writes nothing and **exits 0**, and `drizzle-kit check` says "Everything's fine". Exit code plus clean tree would pass, so `check-drift.sh` also requires generate's output (stdin from `/dev/null`) to contain the literal `No schema changes, nothing to migrate`. The step's `timeout-minutes: 3` stays as a backstop. | T-drift (negative C and the guard mutation) |
| F9 | Docker missing / not running locally, or the test container cannot start (image pull failure, wrong tag) | Only `pnpm test:integration` needs Docker. `pnpm test` uses the unit config only (`include: test/unit/**`, no `globalSetup`). `global-setup.ts` catches the container start error, prints exactly one line with `console.error`: `@academy/db test:integration: could not start the Postgres test container (<image>). Is Docker running? Cause: <message of the caught error>`, then rethrows an `Error` with that message and the original as `cause`. **Because:** vitest 5.0.5 replaces any globalSetup error with `TypeError: code.charCodeAt is not a function` (vite 8.3.5 `module-runner.js:366`, ops-live r2: the thrown message never appears, `.ts` and `.mjs`); `console.error` before the rethrow makes the line visible and the run still exits 1 (ops-live r2). Only the caught error's `message` is printed, never the object (the container config holds the test password). testcontainers 12.2.1 falls back from a dead `DOCKER_HOST` to `/var/run/docker.sock` (ops-live r2), so `DOCKER_HOST` cannot simulate a missing Docker; T-sep's negative uses a nonexistent image tag. | T-sep |
| F10 | Container start timeout / image pull failure in CI | testcontainers waits up to 120 s (research 6), inside job `timeout-minutes: 15`. A Docker Hub hiccup fails the job with the F9 line, and the fix is a rerun. No retry loop, because it would hide a real outage. | CI |
| F11 | Ryuk (reaper) misbehaves on GitHub runners (unverified, research 6) | CI sets `TESTCONTAINERS_RYUK_DISABLED=true`: the runner VM is discarded after the job, so nothing leaks. Locally Ryuk stays on and cleans containers up after a crash. | T-env |
| F12 | Turbo strict env mode filters `TESTCONTAINERS_*` | `turbo.json` `test:integration.passThroughEnv: ["DOCKER_*", "TESTCONTAINERS_*"]`. ops-live: wildcards work in turbo 2.11.10 (`TESTCONTAINERS_RYUK_DISABLED` passes only with the entry). | T-env |
| F13 | DB restart at 3 AM: an idle pooled connection is terminated, `pg.Pool` emits `error`, and an unhandled `error` event crashes Node | `createDb` always registers a Pool `error` listener: `options.onPoolError` if given, else a default that logs one line via `console.error` with a fixed prefix, the error's `code` and its `message`, nothing else (4.11). The pool then replaces the client. | I8, I8b |
| F14 | A lesson id is renamed in `course/` | Old progress rows become orphans (no lessons table, no FK), and the dashboard ignores them (4.9). ADR-0007 consequence: ids are permanent once a learner has progress, and a rename is a content task with a data migration. | ADR |
| F15 | A check kind is removed from lesson-schema | The generated migration narrows the `CHECK`. On a DB with rows of that kind, `ADD CONSTRAINT` fails, F1 rolls back and the app does not start. That is correct: a data decision is needed. Documented in ADR-0007. | ADR |
| F16 | An attempt is left `running`: the workspace service or a check crashes, the stream to `apps/web` ends without a final result, or `apps/web` itself restarts mid-attempt | `apps/web` is the only DB writer (4.10), so both repairs run there: (a) when the service stream for an attempt ends (closed, errored, or timed out) without a final result, `apps/web` marks that attempt `error` with `finished_at = now()` in the same code path that would have written the result; (b) at web startup, `apps/web` marks every attempt still `running` as `error`, because the process that relayed it is gone. (b) assumes one web process; a multi-instance deployment needs an owner/heartbeat column first (additive). Implemented by backlog 08 in `apps/web`; documented in ADR-0007. | ADR |
| F17 | A bundled consumer: Next.js (#1/#30) bundles workspace packages, and the bundler rewrites `new URL("../drizzle", import.meta.url)` or fails on it. Standalone output does not trace `packages/db/drizzle/*.sql` either (they are read at runtime, never imported). | `migrationsFolder` is a documented public option (4.7), and a relative value is rejected (`InvalidMigrationsFolderError`). #1/#30 either lists `@academy/db`, `drizzle-orm` and `pg` in `serverExternalPackages` (plain-Node resolution, so `MIGRATIONS_FOLDER` is right), or passes an absolute folder it ships itself. Either way the image contains `packages/db/drizzle` (`outputFileTracingIncludes` or an explicit `COPY`), and #1 runs `migrateDatabase` inside the built image as a test. **[verify in #1]** | U7, follow-up, ADR |
| F18 | Biome fails on generated meta JSON | `biome.json` ignores `packages/db/drizzle/meta/**` (ops-live: green with the line, red on `_journal.json` and `0000_snapshot.json` without it). | T-biome |
| F19 | An editor "fixes" a generated file on save (final newline), which turns into a migration edit | `.editorconfig` section for `packages/db/drizzle/**` with `insert_final_newline = unset` and `trim_trailing_whitespace = unset`. F6 catches it anyway. | T-append |
| F20 | `drizzle-kit 0.31.11` pulls `esbuild@0.18.20` with moderate GHSA-67mh-4wv8-2f99 (research 9) | Exploitable only while `esbuild serve` runs, and nothing here runs it (no `serve`, no `drizzle-kit studio` script). Accepted; it goes away with the 1.0 upgrade. Listed in ADR-0007. | ADR |
| F21 | The connection string (with its password) leaks into an error message, a `cause` or the default pool log | Rule 4.11. URLs are pre-checked with no echo and no `cause` (4.7). Unit and integration URLs carry canary passwords, and tests assert the canary is absent from `util.inspect` of the whole error chain and from the default log line. | U5, U6, I4, I5, I8b, I12 |
| F22 | Account deletion removes DB rows but leaves the learner's transcripts (stored outside Postgres) or #30's credential rows | ADR-0007 (4.6): the cascade covers Postgres rows only. Account deletion first collects `attempts.transcript_path` for the user, then deletes the user, then deletes those files from the store (backlog 12 implements the store side, #30 the deletion flow). #30's `session`/`account` FKs to `users` are `ON DELETE CASCADE`. | ADR, follow-up |
| F23 | Two attempts of one lesson finish concurrently, neither sees the other's results, and completion is lost | 4.9: the finish transaction runs at READ COMMITTED; after writing its own results it takes `SELECT ... FOR NO KEY UPDATE` on the `lesson_progress` row, and only then runs the completion query as a **separate statement**. Finishers for one user+lesson are serialized (the lock conflicts with itself), and the statement after the wait takes a new snapshot that includes the other finisher's committed results. A single locking-and-aggregating statement, or REPEATABLE READ/SERIALIZABLE, would evaluate a snapshot from before the wait. | ADR (no writer in v1) |
| F24 | The committed `pnpm-lock.yaml` is not in pnpm's native format, so any dependency change rewrites the whole file (ops-live r1: 2612+/985-) and buries the real change | Step 0 (section 10): a format-only first commit via `pnpm install --lockfile-only`, verified to keep every integrity hash and to pass `--frozen-lockfile` (ops-live r1, r2). The dependency change is then additions only **under `git diff --diff-algorithm=histogram`** (ops-live r2: `2017 0`; git's default Myers shows `2041 24`, the 24 "deletions" being unchanged entries it moves). | T-lockfile, T-lockfile-commit, T-lockfile-additions |
| F25 | `lockTimeoutMs` from a consumer (possibly from env) is `NaN`, negative, `0` (which disables the timeout and brings back F3), fractional, too large, or not a number | `migrateDatabase` validates it before connecting: `typeof value === "number"`, `Number.isSafeInteger(value)`, `1 <= value <= MAX_LOCK_TIMEOUT_MS` (2_147_483_647, the Postgres integer-setting maximum; ops-live r2: `2147483648` gives 22023, `0` is accepted by Postgres and `1.5` is silently rounded, so the validation is needed). Otherwise it throws `InvalidLockTimeoutError` naming a number value, or only the `typeof` of anything else, and nothing connects. | U4 |
| F26 | A tester check passes or fails because of the local state rather than the change: a populated `node_modules` keeps reprinting a stale `Ignored build scripts: esbuild@0.28.2` (ops-live r2; this worktree's `.modules.yaml` lists it), `packages/db/drizzle` is uncommitted so `check-drift.sh` is red, Biome lints git-ignored `.claude/*.json`, turbo replays a cached `test`, a mutation damages the coder's uncommitted files | Every tooling check runs in a scratch clone of `HEAD` plus a copy of the pending changes, committed once inside the clone, with a fresh `node_modules` (7.1.0). This is the state CI sees (fresh checkout, committed files, frozen install). | 7.1 B4 |

### Rollback

Revert the PR. Nothing in this PR migrates a persistent database (compose `db` is untouched, and tests use
throwaway containers), so a revert leaves no runtime state behind. The `allowBuilds` block, the new
lockfile entries and the lockfile's native-format rewrite go with the revert, which restores the
old-format lockfile that pnpm accepts as is (ops-live: a fresh clone at the current tip installs without
rewriting it). The tester's scratch clones live in the session scratchpad, outside the repo, and need no
cleanup for a revert.

---

## 4. Key decisions

### 4.1 Drizzle 0.45 stable, not 1.0 RC (open question 1)

**Decision:** `drizzle-orm@^0.45.4`, `drizzle-kit@^0.31.11`. Every column builder gets an explicit
snake_case name (`text("user_id")`), and there is no `casing` option anywhere. No `schema` is passed to
`drizzle()`, and there are no relations.

**Because:** `latest` on npm is 0.45.4. 1.0 is an RC whose API is still moving (research 1, 3), and an
RC in a foundation package means migrating our code on every RC bump. Better Auth accepts both
(research 3). The guards (F5, F6, F8) cover the known 0.x hazards. 1.0 has two breaking areas that touch
our code, casing moved into table builders and RQB v2; explicit column names and no RQB avoid both, so
the later upgrade is mostly mechanical.

**Upgrade path** (its own task, once 1.0.0 is on the `latest` dist-tag; ADR-0007 is updated then):
1. Bump both packages and run `pnpm --filter @academy/db exec drizzle-kit up`. It converts `drizzle/` to
   the per-directory 1.0 format (the 1.0 migrator refuses an old `_journal.json`, research 3).
2. **[verify then]** whether the 1.0 migrator adopts an existing 0.x `drizzle.__drizzle_migrations`
   table (1.0 adds `name` and `applied_at`; the research did not check adoption). Test it by migrating a
   DB with 0.45 and then running the 1.0 migrator against it.
3. Replace U1's journal-order check (1.0 tracks by name and applies out-of-order merges) with a check of
   the new folder layout. Keep the append-only step, because 1.0 still does not detect edited files.
   Re-check the drift step's output literal against 1.0's wording.
4. Adjust `db.execute` result handling if any consumer uses it.

**Alternatives:** 1.0 RC now (it fixes F5 by design, its kit has no dependencies and no esbuild
advisory). Rejected for API churn; revisit it in the upgrade task.

### 4.2 `users` is the Better Auth user table; every user id is `text` (open question 2)

**Decision:** one table `users`, shaped as Better Auth's core `user` model (research 7) with snake_case
columns. `id text PRIMARY KEY` with `users_id_check` (`id <> ''`) and **no DB default**: ids are
generated by the application, as Better Auth does by default. Every FK to a user is `user_id text`. The
table is exported under the key `users`, and #30 wires it with
`drizzleAdapter(db, { provider: "pg", schema: { user: users, ... } })` or `usePlural: true` (the adapter
looks tables up by schema-object key, research 7).

**Because:** one person, one identity, no join. Better Auth's default id is a 32-char string, so `text`
fits without configuration. The FK type is the one #30 decision that would otherwise force rewriting
every v1 table, so it is fixed now. The empty-id CHECK matches the other id columns: an empty id is
always a writer bug.

**Left to #30 (recorded in ADR-0007):**
- **[verify in #30]** that the adapter maps Better Auth's field names (`emailVerified`, `createdAt`) to
  our JS property keys (it reads the Drizzle table object) and that `npx auth generate` agrees. If it
  does not, #30 adds or renames columns in an additive migration. The id type is unaffected.
- #30 keeps Better Auth's default id generator. If it switches to `generateId: "uuid"`, it first checks
  whether Better Auth then still generates the id in the app or expects a DB default; in the second case
  it adds `DEFAULT gen_random_uuid()::text` to `users.id` (additive). Revision 1's claim that `"uuid"`
  works as is was never verified and is withdrawn.
- `users_email_unique` is case-sensitive (`A@x.io` and `a@x.io` are two rows). **[verify in #30]** that
  Better Auth lowercases email on sign-up and sign-in. If it does not, #30 replaces the constraint with a
  unique index on `lower(email)` (additive for one local user).

**Alternatives:** a separate `users` table plus Better Auth `user` (1:1): two identities, and the FK type
is still needed. `uuid` ids: they need #30 configuration. Integer identity: Better Auth's string ids
would not fit.

### 4.3 Lessons referenced by `(course_id, lesson_id)`, not validated by the DB (open question 3)

**Decision:** every lesson reference is the pair `course_id text NOT NULL`, `lesson_id text NOT NULL`,
each with `CHECK (<col> <> '')`. The DB does not check them against `course/` and does not repeat the
slug grammar. Writers take both ids from objects parsed by `@academy/lesson-schema` (ADR-0001: the
platform defines no lesson types of its own). Check ids are stored the same way (`check_id`, unique per
lesson, schema.ts:121).

**Because:** lesson ids are unique only per course (validate.ts:81). The DB cannot see git, and progress
history must survive a lesson being removed or renamed. A duplicated slug regex would be a second
definition of the id grammar that can drift from ADR-0001, and it would not catch the likely writer bug:
a directory name such as `01-models-and-effort` matches the slug regex anyway.

**Consequence (ADR-0007):** lesson ids become permanent once a learner has progress (F14). The
validator does not check course ids for uniqueness today (research 8): a follow-up for the content
contract.

**Alternatives:** `lesson_id` alone (collides across courses). Validating against the course tree at
write time inside `packages/db` (couples the DB package to the filesystem and breaks history). A slug
`CHECK` (see above).

### 4.4 Status vocabularies: `text` + named `CHECK`, values from one TS source (open question 4)

**Decision:** statuses are `text` columns typed in TS (`text("status", { enum: VALUES })`, which is
type-only, no DB enum) plus a named `CHECK (<col> IN (...))` built from the same exported `as const`
array. The `IN` list is built with `sql.raw` by one helper in `vocabulary.ts`. The helper throws
`InvalidVocabularyValueError` (naming the value and the constraint) for any value that does not match
`^[a-z][a-z0-9-]*$`. The throw happens when the schema module loads, so a future value can never inject
SQL into DDL. Values are kebab-case, matching lesson-schema's vocabulary (`hidden-task`).

| Vocabulary (exported const) | Values | Meaning |
|---|---|---|
| `LESSON_PROGRESS_STATUSES` | `in-progress`, `completed` | No row means not started. Transitions and stickiness: 4.9. |
| `ATTEMPT_STATUSES` | `running`, `passed`, `failed`, `error` | Over the attempt's own checks only (scope: 4.9). `passed`: every result passed. `failed`: the learner's work missed the bar (any `failed`/`timeout`, no `error`). `error`: the platform could not grade (any `error`, or F16); it does not count against the learner. |
| `CHECK_RESULT_STATUSES` | `passed`, `failed`, `timeout`, `error` | `timeout` is distinct (backlog 08: "marked as timeout"). `error` = the grader's infrastructure failed. |
| `MENTOR_REVIEW_STATUSES` | `pending`, `completed`, `error` | |
| `CHECK_KINDS` | derived from `@academy/lesson-schema` `Check` | Not retyped in `packages/db`. |

`CHECK_KINDS` is derived at import time from the options of lesson-schema's `Check` discriminated union
(`Check.options.map((o) => o.shape.kind.value)`), and the column is typed
`text("check_kind").$type<Check["kind"]>()`. ops-live: this typechecks without `as` under the repo's
`tsconfig.base.json` and yields `quiz, command, rubric, hidden-task, bug-hunt`, so the fallback into
Stepan's lesson-schema file is not needed. Check kinds pass through the same guarded helper as the
statuses.

Aggregation rules (attempt status from check results, lesson completion from attempts) are writer rules
in ADR-0007 (4.9), not DB constraints, because they span rows. Row-local invariants ARE constraints
(section 5).

**Because:** adding a value to a `pgEnum` and using it in the same migrate run fails (single
transaction), and values can never be dropped (research 2). Replacing a CHECK is an ordinary
transactional `DROP CONSTRAINT`/`ADD CONSTRAINT`, and drizzle-kit 0.31.11 does generate it when a list
changes (ops-live, F7). Deriving kinds from lesson-schema keeps ADR-0001's single definition, and the
drift step forces the DB migration into the same PR as the contract change.

**Alternatives:** `pgEnum` (above). Lookup tables with FKs (joins and seed data for four tiny fixed
lists). No DB constraint at all (a typo in a writer persists silently, and the dashboard then miscounts).
A snapshot-vs-vocabulary unit test (section 2).

### 4.5 Transcript reference: a relative path, not the transcript

**Decision:** `attempts.transcript_path text NULL`: a path relative to the transcript store root owned
by the workspace service (backlog 12), e.g. `<attempt-id>/` holding the agent and terminal logs. NULL
means no transcript (every attempt before backlog 12, quiz-only attempts). The constraint is exactly:

```sql
CONSTRAINT "attempts_transcript_path_check"
  CHECK ("attempts"."transcript_path" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*/?$')
```

It reads: one or more `/`-separated segments, each starting with a letter or digit and continuing with
letters, digits, `.`, `_`, `-`, plus an optional trailing `/`. NULL passes, because a CHECK that
evaluates to unknown is satisfied. Consequences of the grammar (all measured through the real constraint
on Postgres 17.6, ops-live r2):
- Rejected (23514 `attempts_transcript_path_check`): `''`, `.`, `..`, `../a`, `a/..`, `a/../b`, `/abs`,
  `a//b`, `a\b`, a newline inside, `%2e%2e/x`, `.hidden`. A segment must start with a letter or digit,
  which rules out every `.` and `..` segment wherever it is (start, middle, end, bare).
- Accepted: `<uuid>/`, `<uuid>/agent.jsonl`, `<uuid>/terminal.log`, `a..b` (dots inside a segment), NULL.
- `^` and `$` are both load-bearing: without `^`, `/abs` matches at `abs`; without `$`, `a/..` matches
  its prefix `a/`. Postgres `~` uses AREs without newline-sensitive mode, so `$` anchors at the end of the
  string only, and no class in the pattern matches a newline.
- The pattern has no backslash, so it passes through the Drizzle `sql` template and the generated SQL
  file byte-for-byte (ops-live r2: `grep -cF` of the pattern in the generated `0000_init.sql` = 1). The
  coder confirms this by reading `0000_init.sql` (section 10 step 2).
- No length cap. The writer generates the path, so a cap is cosmetic; a
  `char_length(transcript_path) <= 1024` CHECK is additive later if ever needed (security review r2,
  note 3).

This is stricter than lesson-schema's `relPath`, which rev 1 copied, on purpose (section 2): the writer
generates the path, so no human-typed names need room.

**Because:** transcripts are large and written by the workspace service (architecture.md). The web app
and the service mount the store at different absolute paths, so an absolute path or `file://` URI would
be wrong for one of them, and a relative key survives moving the root. One locator per attempt, because
backlog 12 has not decided how many files a session produces; if it needs several, it adds a table
(additive).

**The constraint is defence in depth, not the boundary.** ADR-0007 states that the transcript reader
(backlog 12) still resolves `realpath(root + transcript_path)` itself and refuses anything outside the
root. Symlinks inside the store are its concern. The DB check does not replace that.

### 4.6 Keys, FKs and delete behaviour

**Decision:** natural composite PKs where the domain has them, surrogate `uuid DEFAULT gen_random_uuid()`
for event rows (`attempts`, `mentor_reviews`). One FK chain, every FK `ON DELETE CASCADE` (section 5).

**Because:** `(user_id, course_id, lesson_id)` as the PK of `lesson_progress` *is* the acceptance rule
"progress unique per user+lesson", and it serves the dashboard query by prefix. Attempts reference their
progress row, so an attempt for a lesson the learner never started is impossible. Cascade (not restrict)
on user delete because deleting a user is a deliberate account deletion (Better Auth's `deleteUser`), and
with `RESTRICT` that deletion would fail; there is one local user and no retention requirement. Attempt
ids appear in routes and transcript paths, so they are uuids rather than counters.

**What the cascade does NOT cover (corrected from rev 1, recorded in ADR-0007):**
- The cascade removes the user's **Postgres rows** in these six tables only. The learner's transcripts
  (agent and terminal logs, the most sensitive data the platform holds) live in the workspace service's
  store and survive it. Account deletion therefore (1) collects every `attempts.transcript_path` of the
  user *before* the `DELETE`, (2) deletes the user (cascade), (3) deletes those transcript files. Owners:
  #30 (the deletion flow) and backlog 12 (the store's delete operation). A crash between (2) and (3)
  leaves orphaned files; backlog 12 decides between a retry list and a sweep of store entries with no
  attempt row.
- #30's `session` and `account` tables (and any later table referencing `users`) declare their FK
  `ON DELETE CASCADE`. Otherwise `deleteUser` fails or leaves credential rows behind.

**An attempt id is not authorization.** A uuid is hard to guess, but every route or API that takes an
attempt id checks `attempts.user_id` against the session user before reading or writing (ADR-0007).

**Consequence:** writers upsert `enrollments` and `lesson_progress` (`ON CONFLICT DO NOTHING`) before
inserting an attempt (4.9).

### 4.7 Client and migrate API (public API of `@academy/db`)

- **Connection-string pre-check** (shared by both functions, `src/connection-string.ts`): the value must
  be a non-empty string that `new URL()` parses with protocol `postgres:` or `postgresql:` (the form of
  `DATABASE_URL` in `.env.example:7`). Otherwise the function throws `InvalidConnectionStringError` with
  the fixed message `connection string must be a postgres:// or postgresql:// URL`. The message never
  contains the input, and the error has no `cause`. **Because:** a malformed URL is then rejected before
  `pg` parses it, so a URL-parse error that may carry the input as a property never ends up in a `cause`
  (4.11).
- `createDb(connectionString: string, options?: { onPoolError?: (error: Error) => void }): { db: Database; close(): Promise<void> }`,
  with `Database = NodePgDatabase` exported. It runs the pre-check and always registers the Pool `error`
  listener (F13), with the default logger from 4.11. **Because:** no env reads at import time
  (requirement); the consumer decides where the URL comes from.
- `migrateDatabase(connectionString: string, options?: { migrationsFolder?: string; lockTimeoutMs?: number }): Promise<void>`.
  Order:
  1. Validation, before any I/O, in this order:
     - the connection-string pre-check;
     - `lockTimeoutMs` (default `MIGRATION_LOCK_TIMEOUT_MS`). It must satisfy `typeof value === "number"`,
       `Number.isSafeInteger(value)` and `1 <= value <= MAX_LOCK_TIMEOUT_MS`, else
       `InvalidLockTimeoutError`. Message for a number: `lockTimeoutMs must be an integer from 1 to
       2147483647, got <String(value)>` (so `NaN` and `Infinity` print as such). Message for anything
       else: `lockTimeoutMs must be an integer from 1 to 2147483647, got a value of type <typeof value>`.
       **Because** (security review r2, note 1): `JSON.stringify` throws a plain `TypeError` for a
       `BigInt` or a circular object, which would lose the named error, and it echoes caller data; `typeof`
       never throws and never echoes. The `typeof` check is what narrows `unknown` input for the compiler;
       `Number.isSafeInteger` alone already rejects non-numbers at runtime;
     - `migrationsFolder`, when given: it must be a string for which `path.isAbsolute` is true, else
       `InvalidMigrationsFolderError` with `migrationsFolder must be an absolute path, got <value>` for a
       string and `... got a value of type <typeof value>` otherwise. **Because** (architecture review r2,
       N2): Drizzle resolves a relative folder against the process cwd, the exact failure U2 guards for the
       default, and the TSDoc promises an absolute path. A folder path is not a secret (4.11).

     These are caller bugs, so they are not `MigrationError`s, and nothing connects. The two option
     validators are pure functions exported from `src/migrate.ts` (not from `index.ts`) so U4 and U7 can
     test both sides of each bound.
  2. **Stage `connect`** (build, open and configure the session): construct one `pg.Client` with
     `application_name: "academy-migrate"` (ops-live: visible in `pg_stat_activity`), `connect()`, then
     `SELECT set_config('lock_timeout', $1, false)` with `$1 = String(lockTimeoutMs)` as a bind
     parameter. The **constructor call is inside the connect stage's `try`** (revision 4). **Because:**
     the constructor parses the URL with pg-connection-string, which reads the files named by
     `sslcert`, `sslkey` and `sslrootcert` synchronously and validates the libpq-compat `sslmode`
     combination, so it can throw before any network I/O (pg-connection-string@2.14.1 `index.js:91-99`,
     `:127`). Built outside the `try`, that throw escaped `migrateDatabase` as a raw error with no stage,
     and the caller could not tell it from a bug. `is_local = false` makes the `lock_timeout` setting
     session-level; with `true` it would expire with the statement's own implicit transaction and never
     reach the lock call (I5 mutation b; ops-live r2: with `true`, `SHOW` gives 0 and the lock call still
     waits after 3 s). Neither `sql.raw` nor string interpolation is used for this value.
  3. **Stage `lock`**: `SELECT pg_advisory_lock($1)` with `MIGRATION_LOCK_KEY` as the parameter.
  4. **Stage `apply`**: `migrate(drizzle(client), { migrationsFolder })`.
  5. `client?.end()` in `finally`. The optional call is there because the client is unset when its
     constructor threw (step 2). Ending the session releases the lock even if unlock is skipped.

  A failure in stages 2-4 is rethrown as `MigrationError` with `stage: "connect" | "lock" | "apply"`
  (exported type `MigrationStage`) and the original as `cause`. `<code>` is the first SQLSTATE or Node
  error code found walking the cause chain, or `unknown`. Messages:
  - connect: `could not open the migration session (<code>)`
  - lock, when `<code>` is `55P03`: `could not acquire the migration lock within <lockTimeoutMs> ms (55P03): another migrateDatabase may hold it`
  - lock, any other code (e.g. the connection was terminated during the wait): `failed while waiting for the migration lock (<code>)`
    (architecture review r2, N1: the "another migrateDatabase may hold it" hint is only true for a lock
    timeout)
  - apply: `applying migrations from <folder> failed (<code>); no migration from this run was applied`

  The apply wording holds both for a rolled-back transaction (F1) and for a failure before the
  transaction starts (missing journal, I1 mutation). **Because:** a session-level advisory lock requires
  a single connection. The stage tells the 3 AM operator whether to look at the network, at a peer
  holding the lock, or at the SQL (rev 1 said "rolled back" for all three). `set_config` takes a bind
  parameter where `SET` cannot. Bounds plus a named error turn a bad env value into an explicit startup
  error instead of a disabled timeout (`0`) or a Postgres `22023`.
- **`migrationsFolder` is a documented public option** (TSDoc on the option: absolute path required).
  Plain-Node consumers omit it. A consumer that bundles `@academy/db` (Next.js without
  `serverExternalPackages`) must pass the absolute path of a `drizzle/` folder it ships, because a bundler
  rewrites `import.meta.url` expressions (F17). The tests also use it for the broken fixture (I4), built
  as an absolute path with `fileURLToPath(new URL("./fixtures/broken-migrations", import.meta.url))`.
- `MIGRATIONS_FOLDER`: `fileURLToPath(new URL("../drizzle", import.meta.url))`. Same depth from `src/`
  and `dist/`, so it is right under vitest and after build in plain Node (ops-live: T-dist prints
  `<repo>/packages/db/drizzle`). Its TSDoc names the bundler caveat.
- `MIGRATION_LOCK_KEY`: an exported fixed integer constant (below 2^53), with a comment that it must
  never change, because old and new code would stop excluding each other. `MIGRATION_LOCK_TIMEOUT_MS =
  60_000` (comment: the v1 schema migrates in well under a second; 60 s tolerates a slow first start and
  turns a stuck peer into an error). `MAX_LOCK_TIMEOUT_MS = 2_147_483_647` (comment: the largest value
  Postgres accepts for an integer setting such as `lock_timeout`; ops-live r2: `2147483648` gives 22023).
- Error types in `src/errors.ts`: `InvalidConnectionStringError`, `InvalidLockTimeoutError`,
  `InvalidMigrationsFolderError`, `InvalidVocabularyValueError`, `MigrationError` (with `stage`).
- Migration journal: Drizzle defaults (`drizzle.__drizzle_migrations`) in both `drizzle.config.ts` and
  the runtime call, so a later `drizzle-kit migrate` shares the same journal.

### 4.8 Tooling decisions

- **Biome:** add `"!packages/db/drizzle/meta/**",` to `files.includes` as its own line **directly after
  `"!**/.turbo",`** (before the two `course/` lines), same style as the existing `!course/**/starter/**`.
  **Because:** formatting generated files would be a manual step after every generate, it would be
  forgotten, and the next generate rewrites them anyway (research 10). `*.sql` is not in Biome's
  includes. The position is fixed so the line is never the last array item: it always carries its own
  trailing comma, and removing that one line (T-biome negative) leaves valid JSON (ops-live r2: removing a
  last item leaves a trailing comma, and Biome then fails on its own config, red for the wrong reason).
- **`.editorconfig`:** add a `[packages/db/drizzle/**]` section with `insert_final_newline = unset` and
  `trim_trailing_whitespace = unset` (F19). No CI tool enforces editorconfig, so this only stops editors
  from rewriting generated files (drizzle-kit writes a journal without a final newline, ops-live).
- **`.gitattributes`:** add `packages/db/drizzle/meta/** linguist-generated=true`, so the large
  snapshots collapse in PR diffs while the SQL stays visible for review.
- **pnpm builds:** at the end of `pnpm-workspace.yaml`, a block-style map: a line `allowBuilds:` followed
  by four lines indented by two spaces, `cpu-features: false`, `esbuild: false`, `protobufjs: false`,
  `ssh2: false`. **Because:** all four are already ignored by default, and everything works without them
  (research 9). Writing the denial down records the decision and removes the warning, so a *new*
  unreviewed build script stands out. ops-live r1: on a fresh `node_modules`, with the block, `pnpm
  install` prints no "Ignored build scripts" line and `.modules.yaml` has `ignoredBuilds: []`; a bare name
  covers every version; the lockfile does not record the block. ops-live r2: a `node_modules` populated
  **before** the block existed keeps `ignoredBuilds: [esbuild@0.28.2]` in `.modules.yaml`, and every later
  install reprints `Ignored build scripts: esbuild@0.28.2.` even with the block. This worktree's
  `node_modules/.modules.yaml` already lists it. That line in the worktree is therefore not a defect, and
  T-install runs on a fresh `node_modules` (7.1 B4). The exact block shape matters because T-install's
  negative removes it with a line-based filter. Never `--force` or `--legacy-peer-deps`. The lockfile
  changes only through plain `pnpm install`, after the step-0 format commit (F24).
- **Turbo:** `test:integration` gets `"passThroughEnv": ["DOCKER_*", "TESTCONTAINERS_*"]` (ops-live).
  **Because:** strict env mode drops them. The task is `cache: false`, so pass-through (not `env`) is the
  honest choice. `DATABASE_URL` is not added, because the package reads no env.
- **Node:** `packages/db/package.json` `"engines": { "node": ">=22.22" }`. **Because:** testcontainers 12
  requires it (research 1). CI resolves `.nvmrc` `22` to the latest 22.x.
- **CODEOWNERS:** not edited (Stepan's file). Follow-up for Stepan: add `/packages/db/  @valmlord`.

### 4.9 Progress semantics (ADR-0007 item 5; costly to change)

Every writer (backlog 08 check runner, backlog 10 quiz, backlog 11 mentor review, backlog 13 hidden
task) and the reader (backlog 09 dashboard) follow these rules. v1 builds no writer, and the rules need no
schema change.

- **Attempt scope.** An attempt is one grading run started by one learner action (a "Check" press, a quiz
  submit, a rubric review request) over a non-empty subset of the lesson's current checks. Its
  `check_results` rows are exactly that subset, one per check id. `passed`/`failed`/`error` (4.4)
  describe that subset only, never the whole lesson. A lesson with `checks: []` has no attempts.
- **Atomic finish.** A writer inserts the check results, sets the attempt's final status and
  `finished_at`, and evaluates completion **in one transaction**, so a crash cannot leave a `passed`
  attempt without its completion, or a completion without its results.
- **Isolation and statement order in the finish transaction** (architecture review r2, C1, C2). The
  transaction runs at **READ COMMITTED** (the Postgres and Drizzle default; never REPEATABLE READ or
  SERIALIZABLE). Order: (1) insert the results and set the attempt final; (2)
  `SELECT ... FROM lesson_progress WHERE <pk> FOR NO KEY UPDATE`; (3) the completion query, as a
  **separate statement issued after (2) returns**; (4) the update to `completed` if the rule holds.
  **Because:** under READ COMMITTED every statement takes a new snapshot, so the query in (3) sees the
  results that a concurrent finisher committed while (2) waited. A single statement that locks and
  aggregates (a CTE), or a higher isolation level, evaluates against a snapshot from before the wait and
  loses them (F23). `FOR NO KEY UPDATE` rather than `FOR UPDATE` because the writer changes only non-key
  columns (`status`, `completed_at`, `updated_at`): it conflicts with itself, so finishers are
  serialized, but not with the `FOR KEY SHARE` that a concurrent attempt insert takes through its FK
  check, so starting an attempt never waits for a finisher.
- **Row creation.** The `lesson_progress` row (`in-progress`) is upserted when the learner first opens
  the lesson page, and at the latest together with the first attempt (writer order, 4.6). No row means
  not started.
- **When a lesson becomes `completed`.** In step (3) above: the lesson is complete when every check id in
  the lesson's **current** `lesson.yaml` (parsed through `@academy/lesson-schema`) has at least one
  `passed` row in `check_results`, over all of this user's finished attempts (status `<> 'running'`) for
  that `(course_id, lesson_id)`. A passed check counts even if its attempt as a whole is `failed` or
  `error`. Results for check ids no longer in the lesson are ignored. Complete: `status = 'completed'`,
  `completed_at = now()`, `updated_at = now()`.
- **Lessons with `checks: []`** (theory) are completed only by an explicit learner action ("mark as
  done") on the lesson page, added by the first issue that shows lesson status (backlog 09 at the
  latest). The action is refused for a lesson that has checks, so it cannot bypass grading.
- **Sticky.** `completed` never returns to `in-progress`: not after a later failed attempt, not when the
  lesson later gains a check. `completed_at` stays the first completion time. A lesson still
  `in-progress` is evaluated against its current checks, so after a check is removed, the next
  evaluation can complete it, and a newly added check must also pass.
- **One writer function.** The rule lives in one function in `apps/web` (the only DB client, 4.10). The
  first issue that writes attempts (backlog 08) adds it, and every later writer calls it. No writer sets
  `completed` any other way.
- **Dashboard derivation (backlog 09).** Lesson status comes from `lesson_progress.status` alone (no
  row = not started) and is never recomputed from attempts; attempts are history. The set of counted
  lessons is the lessons with status `ready` currently in the course tree (read through
  `@academy/lesson-schema`). Progress rows whose lesson id is not in that set (F14 orphans) count in
  neither the numerator nor the denominator.
  - Course percentage = completed counted lessons / counted lessons. A course with **0** counted lessons
    shows no percentage (the UI shows that it has no lessons yet), never `0/0`, `NaN` or `0%`
    (architecture review r2, C5).
  - Module status, over the module's counted lessons: `completed` when it has at least one counted lesson
    and all of them are `completed`; `in-progress` when at least one of them has a progress row and the
    module is not `completed`; otherwise `not started`. A module with 0 counted lessons has no status and
    no percentage. Module percentage follows the course rule over the module's counted lessons.
- **`check_results.details` holds no grader secrets.** Writers never store hidden-task internals
  (verify-script source, expected outputs, hidden test names) or the contents of `checks/` in `details`,
  because an attempt view would show them to the learner before the next grading (backlog 04: `checks/`
  never reaches the browser).

**Because:** four writers each inventing a completion rule would make the dashboard disagree with the
attempts table, and fixing that later means a data backfill. Status read from one sticky column, written
by one function under a row lock, keeps the two views consistent by construction.

### 4.10 Database clients (ADR-0007 item 8)

**Decision:** `apps/web` is the only process that connects to Postgres and the only writer of
`attempts`, `check_results`, `mentor_reviews` and `lesson_progress`, consistent with architecture.md
(Postgres only under `apps/web`; the workspace service is the only Docker client). `apps/web` calls
`migrateDatabase` at startup and exits non-zero if it rejects.

**Requirement on the workspace API (backlog 05, where ADR-0002 is accepted)** (architecture review r2,
C3): because `apps/web` writes everything, the service must return to `apps/web` every value `apps/web`
persists: per-check results (status, score, details, duration, cost), mentor output and its cost, and the
transcript path. The stream the browser sees therefore ends in, or is relayed by, `apps/web`.
architecture.md does not draw that relay today (its SSE label joins the browser and the workspace arrow);
ADR-0007 states it as a requirement, not as something architecture.md already shows.

**Because:** one DB client keeps one place for the completion function and the authorization check
(4.6, 4.9). If backlog 05 or 08 wants the service to write directly, that is a workspace-API decision: it
needs the workspace-API ADR and an update to this one, not an implicit choice inside a LEARN task. F2's
lock stays, because web processes can still overlap (dev restart, a second instance).

### 4.11 Secrets in errors and logs (ADR-0007 item 9)

**Rule:** no error message, log line or `cause` that `@academy/db` builds or attaches contains the
connection string or any part of its userinfo (the password above all). A host and port appear only when
a driver error states them itself (e.g. `connect ECONNREFUSED 127.0.0.1:1`), never taken from the URL.
Concretely:
- `InvalidConnectionStringError`: fixed message, no input, no `cause` (4.7).
- `InvalidLockTimeoutError`: a number value, or only the `typeof` of a non-number (4.7). Never a
  serialization of caller data.
- `InvalidMigrationsFolderError`: the folder path (not a secret) or the `typeof` of a non-string.
- `MigrationError`: the messages in 4.7. `cause` is the driver or Drizzle error. That is safe for the
  connect failures that remain once malformed URLs are rejected: refused, DNS, auth `28P01` (which names
  the user, not the password), and a synchronous `pg.Client` constructor throw (revision 4) for an
  unreadable `sslcert`/`sslkey`/`sslrootcert` file (`ENOENT` and similar) or an invalid libpq-compat
  `sslmode` combination. The constructor's cause message names the file path taken from the URL query,
  never the password (pg-connection-string@2.14.1 `index.js:91-99`, `:127`). A file path from the URL is
  not a secret; the file contents never reach an error. U5 and I12 prove it for refused, missing-ssl-file
  and auth failures.
- The default pool `error` logger prints a fixed prefix (`@academy/db: idle pool client error`), the
  error's `code` and its `message`, never the error object or the pool config.

Tests assert on `util.inspect(value, { depth: Infinity })`, which is what a logger prints, so a secret in
any property of any `cause` is caught, not only one in `message`.

**Out of scope here, required of #30 and every later writer** (security review r2, note 2): Drizzle
0.45's `DrizzleQueryError` message embeds the query **params**. Once `account`/`session` exist, a logged
query failure can contain password hashes or session tokens. This package's rule covers only the
connection string; #30 states its own rule for logging DB errors (for example: log the SQLSTATE and the
constraint name, never the Drizzle error message or object). Recorded in ADR-0007 consequences and
section 11.

---

## 5. Schema v1 (shape sketch; all timestamps `timestamptz`, JS keys camelCase, SQL names as listed)

**users** (Better Auth core `user`)

| column | type | null | default | notes |
|---|---|---|---|---|
| id | text | no | none (app-generated) | PK; `users_id_check` (`<> ''`) |
| name | text | no | | |
| email | text | no | | `users_email_unique` (case-sensitive, 4.2) |
| email_verified | boolean | no | false | |
| image | text | yes | | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | app sets on update |

**enrollments**

| column | type | null | default | notes |
|---|---|---|---|---|
| user_id | text | no | | FK users(id) CASCADE |
| course_id | text | no | | `enrollments_course_id_check` (`<> ''`) |
| enrolled_at | timestamptz | no | now() | |

PK `(user_id, course_id)`. It serves "courses of a user" by prefix.

**lesson_progress**

| column | type | null | default | notes |
|---|---|---|---|---|
| user_id | text | no | | |
| course_id | text | no | | |
| lesson_id | text | no | | `lesson_progress_lesson_id_check` (`<> ''`) |
| status | text | no | `'in-progress'` | `lesson_progress_status_check` |
| started_at | timestamptz | no | now() | |
| completed_at | timestamptz | yes | | |
| updated_at | timestamptz | no | now() | |

PK `(user_id, course_id, lesson_id)` (uniqueness per user+lesson; dashboard progress per user by prefix).
FK `(user_id, course_id)` -> enrollments CASCADE (covered by the PK prefix).
`lesson_progress_completed_check`: `(status = 'completed') = (completed_at IS NOT NULL)`.

**attempts**

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| user_id | text | no | | |
| course_id | text | no | | |
| lesson_id | text | no | | |
| status | text | no | `'running'` | `attempts_status_check` |
| transcript_path | text | yes | | `attempts_transcript_path_check`, exact SQL in 4.5 |
| started_at | timestamptz | no | now() | |
| finished_at | timestamptz | yes | | |

FK `(user_id, course_id, lesson_id)` -> lesson_progress CASCADE.
Index `attempts_lesson_started_idx (user_id, course_id, lesson_id, started_at)`: attempt history per
lesson, and the FK side of the cascade (Postgres does not index referencing columns by itself).
`attempts_finished_check`: `(status = 'running') = (finished_at IS NULL)`.

**check_results**

| column | type | null | default | notes |
|---|---|---|---|---|
| attempt_id | uuid | no | | FK attempts(id) CASCADE |
| check_id | text | no | | `check_results_check_id_check` (`<> ''`) |
| check_kind | text | no | | `check_results_check_kind_check` (from lesson-schema) |
| status | text | no | | `check_results_status_check` |
| score | double precision | yes | | `check_results_score_check`: NULL or 0..1 (quiz, rubric) |
| details | jsonb | yes | | per-kind payload (command output tail, quiz answers, bug-hunt found count); typed `unknown`, validated by the writer; never grader secrets (4.9) |
| duration_ms | integer | yes | | `check_results_duration_check`: NULL or >= 0 |
| cost_usd | numeric(12,6) | yes | | `check_results_cost_check`: NULL or >= 0 (hidden-task and rubric spend tokens; `pg` returns it as a string) |
| created_at | timestamptz | no | now() | |

PK `(attempt_id, check_id)`: one result per check per attempt (check ids are unique per lesson). It
serves "check results per attempt" by prefix. `check_kind` is stored because the lesson file may change
later, and history must keep what was graded.

**mentor_reviews**

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK |
| attempt_id | uuid | no | | FK attempts(id) CASCADE |
| check_id | text | yes | | the rubric check it belongs to; NULL = whole-attempt review; no FK (the review may start before the result row exists) |
| status | text | no | `'pending'` | `mentor_reviews_status_check` |
| body | text | yes | | the Socratic text |
| cost_usd | numeric(12,6) | yes | | `mentor_reviews_cost_check`: NULL or >= 0 |
| created_at | timestamptz | no | now() | |
| completed_at | timestamptz | yes | | `mentor_reviews_completed_check`: `(status = 'pending') = (completed_at IS NULL)` |

Index `mentor_reviews_attempt_created_idx (attempt_id, created_at)`: reviews per attempt, and the FK side
of the cascade. The rubric score lives in `check_results.score`. Attempt cost = the sum of `cost_usd`
over both tables (derived, not stored).

Every constraint and index is **named**, so later migrations can drop or replace it by name.

---

## 6. Files (rough LOC; generated files not counted)

| File | LOC | Notes |
|---|---|---|
| `pnpm-lock.yaml` | gen | step 0: native-format rewrite (own commit); later plain `pnpm install` |
| `packages/db/package.json` | 40 | `@academy/db`, `type: module`, exports `.` -> `dist/index.{js,d.ts}`, engines; scripts below; deps `drizzle-orm ^0.45.4`, `pg ^8.23.1`, `@academy/lesson-schema workspace:*`; dev `drizzle-kit ^0.31.11`, `@types/pg` (current 8.x), `@types/node ^26.6.5`, `vitest ^5.0.5`, `@testcontainers/postgresql ^12.2.1` |
| `packages/db/tsconfig.json`, `tsconfig.build.json` | 12 | as lesson-schema; `tsconfig.json` include `["src", "test", "*.config.ts"]` (matches both vitest configs) |
| `packages/db/drizzle.config.ts` | 12 | `dialect: "postgresql"`, `schema: "./src/schema.ts"`, `out: "./drizzle"`; no credentials, no env |
| `packages/db/vitest.config.ts` | 5 | `include: ["test/unit/**/*.test.ts"]`; no `globalSetup` (T-sep asserts it) |
| `packages/db/vitest.integration.config.ts` | 15 | `include: ["test/integration/**/*.int.test.ts"]`, `globalSetup: ["test/integration/global-setup.ts"]`, `testTimeout: 30_000`, `hookTimeout: 60_000` |
| `packages/db/src/vocabulary.ts` | 50 | status arrays, `CHECK_KINDS` derivation, the guarded `IN (...)` builder |
| `packages/db/src/schema.ts` | 175 | six tables per section 5 |
| `packages/db/src/errors.ts` | 55 | five error classes, `MigrationStage` |
| `packages/db/src/connection-string.ts` | 20 | the pre-check (4.7) |
| `packages/db/src/client.ts` | 35 | `createDb`, default pool logger |
| `packages/db/src/migrate.ts` | 95 | `migrateDatabase` (stages, two lock messages), the two option validators, `MIGRATIONS_FOLDER`, constants |
| `packages/db/src/index.ts` | 8 | re-exports |
| `packages/db/scripts/check-drift.sh` | 25 | Behaviour = the operations review's B1 script, run live both ways (r1, r2), with the output rule below. `set -uo pipefail`; `cd` to `git rev-parse --show-toplevel` of the current directory; `pnpm --filter @academy/db run db:generate` with stdin `/dev/null`, output and exit code captured; `status` = `git status --porcelain --untracked-files=all -- packages/db/drizzle`. **It always prints the captured drizzle-kit output first** (useful in CI logs, and T-drift positive reads the literal from it). Green when exit 0 AND the output contains `No schema changes, nothing to migrate` AND `status` is empty: it then prints the line `migrations match the schema` and exits 0. Otherwise it prints `status` and `schema.ts changed without a migration: run db:generate and commit the result` and exits 1. The output test reads the captured text through a here-string (`grep -qF ... <<< "$out"`), not a pipe into `grep -q`, so `pipefail` cannot turn an early grep exit into a false red (ops-live r2). **It requires a committed `packages/db/drizzle`**: in the coder's uncommitted worktree the folder is untracked, `status` is never empty, and the script is red by design; it is run in CI (committed checkout) and in the tester clone (7.1.0), never as a worktree check |
| `packages/db/scripts/check-append-only.sh` | 25 | operates on the git repository of the current directory; reads `PR_HEAD_SHA` from env, always quoted; logic in 8 step 3 |
| `packages/db/drizzle/0000_init.sql`, `drizzle/meta/*` | gen | from `db:generate --name init` |
| `packages/db/test/unit/journal.ts` | 40 | pure `verifyJournal(journal, sqlFileNames): string[]` |
| `packages/db/test/unit/migrations.test.ts` | 60 | U1, U2 |
| `packages/db/test/unit/vocabulary.test.ts` | 30 | U3 |
| `packages/db/test/unit/options.test.ts` | 90 | U4, U5, U6, U7 |
| `packages/db/test/integration/global-setup.ts` | 50 | `POSTGRES_TEST_IMAGE = "postgres:17.6-alpine"` as a named constant, the only occurrence of that literal in the file (T-sep's negative edits it); start the container with `.withPassword("canary-s3cret-28")` (ops-live r2: the method exists in 12.2.1); `provide("postgresUrl")`, `ProvidedContext` augmentation; on a start failure the F9 `console.error` line, then rethrow with `cause`; stop the container on teardown |
| `packages/db/test/integration/helpers.ts` | 60 | `freshDatabase()` (`CREATE DATABASE t_<random hex>`, URL with replaced path, cleanup `DROP DATABASE ... WITH (FORCE)`); `sqlState(error)` walks `cause` to the pg error and returns `{ code, constraint }` (ops-live: Drizzle 0.45 wraps driver errors in `DrizzleQueryError`); `expectNoSecret(value, secret)` asserts `util.inspect(value, { depth: Infinity })` lacks `secret` |
| `packages/db/test/integration/migrate.int.test.ts` | 140 | I1-I5, I12 |
| `packages/db/test/integration/schema.int.test.ts` | 200 | I6, I7, I9-I11 (I11 transcript cases as one test each, titles in section 7) |
| `packages/db/test/integration/client.int.test.ts` | 60 | I8, I8b |
| `packages/db/test/integration/fixtures/broken-migrations/0000_broken.sql`, `meta/_journal.json` | 15 | handwritten: `CREATE TABLE broken_probe (id int);`, drizzle's statement breakpoint, `SELECT 1/0;` (22012); journal shape copied from the generated one; Biome-formatted |
| `turbo.json` | +1 | passThroughEnv |
| `biome.json` | +1 | ignore meta, position fixed in 4.8 |
| `.editorconfig` | +4 | |
| `.gitattributes` | +2 | |
| `pnpm-workspace.yaml` | +5 | `allowBuilds`, shape fixed in 4.8 |
| `.github/workflows/ci.yml` | +35 | new job `db` only |
| `docs/adr/0007-progress-data-model.md` | 190 | section 9 |
| `docs/architecture.md` | +1 | "DB schema and progress data model: ADR-0007" |

Package scripts: `build: tsc -p tsconfig.build.json`, `typecheck: tsc -p tsconfig.json --noEmit`,
`test: vitest run`, `test:integration: vitest run --config vitest.integration.config.ts`,
`db:generate: drizzle-kit generate`, `db:check: drizzle-kit check`.

### Deploy awareness

- **Packaging/import path:** a workspace package linked by pnpm (`packages/*` is already in
  `pnpm-workspace.yaml`). Consumers import `@academy/db` -> `dist/` (built by turbo `^build`). The
  `drizzle/` folder ships as source beside `dist/`. `MIGRATIONS_FOLDER` finds it from `src/` and `dist/`
  under plain Node. Bundled consumers pass an absolute `migrationsFolder` or externalize the package, and
  every image ships `packages/db/drizzle` (F17).
- **Build order:** `@academy/db` depends at runtime on `@academy/lesson-schema` (for `CHECK_KINDS`), so
  lesson-schema must be built before db's typecheck/test/build (turbo `^build` handles it) and before
  `drizzle-kit generate`, which loads `schema.ts` via tsx and resolves lesson-schema to its `dist/`
  (ops-live). Hence every manual generate starts with `pnpm exec turbo run build --filter='@academy/db^...'`.
- **Install-time warnings:** every fresh install prints `WARN Failed to create bin at
  .../packages/db/node_modules/.bin/lesson-validate ... lesson-schema/dist/cli.js` (ops-live r1), because
  the lesson-schema bin points into a `dist/` that does not exist before the build. The first *resolving*
  install after adding the dependencies also prints `WARN  3 deprecated subdependencies found:
  @esbuild-kit/core-utils@3.3.2, @esbuild-kit/esm-loader@2.6.5, glob@10.5.0` (from drizzle-kit 0.31.11,
  ops-live r2); later installs that skip resolution do not. Both are harmless and expected; T-install
  allows exactly these two.
- **New deps in CI:** Docker is present on `ubuntu-24.04` (the `compose` job uses it). `pg` has no
  install scripts, and `pg-native` is not installed.
- **Scripts:** `packages/db/scripts/*.sh` are always invoked as `bash <path>`, so no executable bit is
  needed. Biome does not lint `.sh`.
- **No compose / `.env.example` change:** the package reads no env, and `DATABASE_URL` already exists for
  the first consumer.

---

## 7. Tests (behaviour that is expensive to break) and how each can fail

Unit (Docker-free, `pnpm test`, also run by the existing `checks` job):

| ID | Behaviour | Mutation that must turn it red (distinguishing assertion) |
|---|---|---|
| U1 | `verifyJournal` accepts the real `drizzle/` and rejects crafted journals: `when` not strictly increasing, `idx` gap, entry without `.sql`, stray `.sql` not in the journal (one case each, asserting the returned message names the tag) | Comment out the `when` comparison: the "older entry appended" case expects a message and gets none. (With one real migration the real-folder case alone would be vacuous; the crafted cases are what can fail.) |
| U2 | `MIGRATIONS_FOLDER` is absolute and contains `meta/_journal.json` | Change it to `"./drizzle"`: the `isAbsolute` assertion is red (a cwd-relative path would pass an existence check run from `packages/db`, which is why absoluteness is asserted). |
| U3 | The `IN`-list helper throws `InvalidVocabularyValueError` naming the value for `a'b`, `a b`, `A`, `1a`, `''`, `a-b'); DROP TABLE users; --`; it accepts `hidden-task`, `in-progress`, `a` | (a) Drop `$` from the guard regex: `a'b` matches the prefix `a`, is accepted, red. (b) Drop `^`: `1a` is accepted, red. (c) Remove the guard call: every reject case is red. |
| U4 | `lockTimeoutMs` validation. `migrateDatabase("postgres://u:canary-u4@127.0.0.1:1/x", { lockTimeoutMs: v })` rejects with `InvalidLockTimeoutError` (not `MigrationError`, not `TypeError`) for `NaN`, `Infinity`, `-1`, `0`, `1.5`, `2_147_483_648` (message contains `got <String(v)>`), and for `"500"` and `10n` (message contains `got a value of type string` / `got a value of type bigint`). The two non-numbers are passed with `// @ts-expect-error` and a reason ("the validator must reject non-numbers from untyped callers"), never with `as unknown as number` (architecture review r2, N3). The pure validator returns `1`, `60_000` and `2_147_483_647` unchanged | Lower bound `>= 0`: the `0` case is red. `<` instead of `<=` on the maximum: `2_147_483_647` is red. `Number.isFinite` instead of `Number.isSafeInteger`: `1.5` is red. Coerce with `Number(value)` before validating: `"500"` is accepted (the call then fails with `MigrationError` stage `connect`), red. Print non-numbers with `JSON.stringify`: `10n` throws `TypeError`, red. Validation moved after `connect`: the error is `MigrationError` stage `connect` (port 1 refuses), red. (Removing only the `typeof` check is not a useful mutation: `Number.isSafeInteger` rejects non-numbers by itself, so the `typeof` exists for type narrowing and the message.) |
| U5 | Connect stage, with a canary. (1) `migrateDatabase("postgres://u:canary-u5@127.0.0.1:1/x")` rejects with `MigrationError`, `stage === "connect"`, a cause in the chain has code `ECONNREFUSED`, and `util.inspect(error, { depth: Infinity })` does not contain `canary-u5`. (2) "rejects a missing sslrootcert file as stage connect without the password" (revision 4): `migrateDatabase("postgres://u:canary-u5@127.0.0.1:1/x?sslrootcert=/nonexistent-academy-28/root.crt")` rejects with `MigrationError`, `stage === "connect"`, `ENOENT` among the cause chain's codes, and the inspected error does not contain `canary-u5` | Put the connection string into the connect message: the canary assertion is red. Label connect failures `apply`: the stage assertion is red. Build the client outside the connect-stage `try` (case 2): the constructor's `ENOENT` escapes as a raw error, not a `MigrationError`, red (verified red live by the coder). |
| U6 | Malformed URL: `createDb` and `migrateDatabase` with `postgres://u:canary-u6@[bad` and with `mysql://u:canary-u6@h/x` throw `InvalidConnectionStringError` whose `cause` is undefined, and inspect does not contain `canary-u6`; `createDb("")` throws the same class | Attach the `new URL()` error as `cause`: inspect shows the input, red. **[verify]** that Node's `ERR_INVALID_URL` exposes the input as a property; if it does not, use the mutation "include the input in the message", which is red either way. Remove the protocol check: the `mysql:` case does not throw, red. |
| U7 | `migrationsFolder` validation: `migrateDatabase("postgres://u:canary-u7@127.0.0.1:1/x", { migrationsFolder: "drizzle" })` and `{ migrationsFolder: "./drizzle" }` reject with `InvalidMigrationsFolderError` whose message names the value; an absolute folder passes the pure validator unchanged | Remove the check: the call fails with `MigrationError` stage `connect` (port 1 refuses), red. `path.normalize` instead of `path.isAbsolute`: `drizzle` passes, red. |

Integration (`pnpm test:integration`, each file uses its own `freshDatabase()`). `global-setup.ts` starts
the container with the password `canary-s3cret-28` (`PostgreSqlContainer.withPassword`, ops-live r2: the
method exists in `@testcontainers/postgresql` 12.2.1 and the URL carries the password), so every test URL
carries the canary:

| ID | Behaviour | Mutation / negative run (distinguishing assertion) |
|---|---|---|
| I1 | Migrate on an empty DB: all six tables exist (`information_schema.tables`), `drizzle.__drizzle_migrations` row count = journal entry count | Point the default folder one level off (`new URL("./drizzle", ...)`): rejects with `MigrationError` stage `apply` (journal not found). |
| I2 | Migrate again: resolves, and the journal rows `(id, hash, created_at)` are identical before and after | Test-side negative run: delete the journal rows between the two runs. The second run re-executes `CREATE TABLE` and rejects, which shows the assertion would see a re-apply. |
| I3 | Concurrent migrate waits for the lock: the test holds `pg_advisory_lock(MIGRATION_LOCK_KEY)` on its own connection, starts `migrateDatabase`, polls `pg_locks JOIN pg_stat_activity` until a non-granted advisory lock of `application_name = 'academy-migrate'` appears (max 10 s), asserts the migrations table does not exist yet, releases, awaits, asserts one applied run | Remove the lock call: the poll times out with "migrateDatabase did not wait for the migration lock". Deterministic: no timing race, the waiter is observed in the catalog (ops-live: `academy-migrate\|t` seen). |
| I4 | A failing migration rolls back and releases the lock: `migrateDatabase(url, { migrationsFolder: <absolute fixtures/broken-migrations> })` rejects with `MigrationError`, `stage === "apply"`, and the message contains the fixture folder path, `22012` and `no migration from this run was applied`; table `broken_probe` does not exist; the migrations table has 0 rows; inspect of the error lacks `canary-s3cret-28`. Then `migrateDatabase(url, { lockTimeoutMs: 2_000 })` with the real folder resolves | (a) Remove the `finally` close: the follow-up migrate waits on the leaked session's lock and rejects with stage `lock` after 2 s, red with the lock error, not a hang. (b) One message for all stages: I5's "does not contain `no migration from this run was applied`" assertion is red. |
| I5 | `lock_timeout` applies: hold the lock, call `migrateDatabase(url, { lockTimeoutMs: 500 })`: rejects with `MigrationError`, `stage === "lock"`, the message contains `within 500 ms` and not `no migration from this run was applied`, the cause chain has SQLSTATE `55P03`, inspect lacks the canary | (a) Remove the `set_config` call: the call never settles, and the test times out (30 s). (b) `set_config(..., true)`: same, because the setting expires before the lock call (ops-live r2). (c) Label lock failures `apply`: the stage assertion is red. (d) Use the generic `failed while waiting` message for 55P03 too: `within 500 ms` is missing, red. ops-live: `lock_timeout` covers `pg_advisory_lock`, so on correct code this is green. |
| I6 | Attempt round trip: user -> enrollment -> progress -> attempt with `transcript_path`, two check results (`passed` with score 0.75, `timeout` with `details` and `duration_ms`), one mentor review; read back attempt and results by `attempt_id`; every stored field equals what was written (lesson id, course id, status, transcript path, kinds, score 0.75, details deep-equal, cost as string) | Change `score` to `integer` in the schema (regenerate): 0.75 does not round-trip. |
| I7 | Progress unique per user+lesson: a second insert of the same `(user, course, lesson)` fails with `23505` and constraint `lesson_progress_pkey`; the same `lesson_id` under another course succeeds | **Constraint every I7 mutation must keep:** a unique key on exactly `(user_id, course_id, lesson_id)`, because `attempts_lesson_progress_fk` references those columns. Without one the regenerated `0000` fails with `42830`, I1-I4 go red and this file is skipped in `beforeAll`, i.e. red for the wrong reason (revision 4). Each mutation is made in `schema.ts` in clone C with `0000` regenerated, as in the tester report. **(a) other-course insert:** PK `(user_id, lesson_id)` plus a unique on `(user_id, course_id, lesson_id)` for the FK: only I7 is red, at the other-course assertion, with `23505` on `lesson_progress_pkey` (verified live by the coder and the tester: `total=38 failed=1`). **(b) duplicate insert:** replace the PK with a separately named unique on the same three columns (`lesson_progress_i7_unique`): the duplicate still fails with `23505` but names the other constraint, so only I7 is red, at the constraint-name assertion, and I9/I10 stay green, because the FK still has its key (verified live (code-review round-1 re-test): `total=38 failed=1`, `plans/28-db-schema-test-report.md` re-test row 5). Note: dropping the PK and `attempts_lesson_progress_fk` together also turns I7 red, but I9 and I10 go red with it (verified live in round 1), so that variant does not isolate I7. |
| I8 | Pool survives a terminated idle connection: run a query, terminate the test DB's other backends from an admin connection, wait (max 5 s) until `onPoolError` was called, run another query successfully | Remove the `error` listener: `onPoolError` is never called (and vitest reports the unhandled error). |
| I8b | Default pool logger: the same setup without `onPoolError`, `console.error` spied: called once. **The logged text** is every argument of that call rendered the way `console` prints it: a string as is, any other value through `util.inspect(value, { depth: Infinity })`, joined (revision 4; a test that only read `String(arg)` would print `[object Object]` and miss a secret inside an object). The logged text contains `@academy/db: idle pool client error` and `57P01`; it contains neither `canary-s3cret-28` nor the connection string | The logger also prints `pool.options`: the canary assertion is red (verified red live by the coder). The logger prints the URL: red (verified red live). Remove the default: the spy is never called, red. |
| I9 | Delete user cascades: after the I6 fixture, `DELETE FROM users` leaves 0 rows in all five child tables | Set `enrollments.user_id` to `onDelete: "restrict"`: the delete fails with 23503. |
| I10 | FK chain: an attempt for a lesson without a progress row fails with `23503`, constraint name = the attempts -> lesson_progress FK | Remove that FK: the insert succeeds. |
| I11 | Row constraints. Every reject asserts SQLSTATE `23514` **and** the constraint name. Rejects: attempt status `done`; `check_kind` `essay`; `users.id` `''`; a `running` attempt with `finished_at`; `completed` progress without `completed_at`; score 1.5. Accepts: every value of each of the four status vocabularies and of `CHECK_KINDS` in its column (this also catches a SQL file whose CHECK list disagrees with the vocabulary). **Transcript cases, one test each**, created in a plain `for` loop with titles built by string concatenation (not `it.each` printf formatting, so the `%` in `%2e%2e/x` is never read as a format token). Reject titles are exactly `I11 transcript_path rejects <label>` for the labels `<empty>`, `.`, `..`, `../a`, `a/..`, `a/../b`, `/abs`, `a//b`, `a\b`, `a<LF>b` (value: `a`, a newline, `b`), `%2e%2e/x`. Accept titles are `I11 transcript_path accepts <label>` for `<uuid>/`, `<uuid>/agent.jsonl`, `a..b`, `<null>` | Transcript, M1-M3 (procedure in 7.1 B12). Each mutation turns red **exactly** the reject tests whose value it accepts, measured through Postgres 17.6 in ops-live r2; every accept test and every other test stays green. **M1** naive `transcript_path <> '' AND transcript_path NOT LIKE '../%' AND transcript_path NOT LIKE '/%'`: red = `.`, `..`, `a/..`, `a/../b`, `a//b`, `a\b`, `a<LF>b`, `%2e%2e/x` (8). **M2** drop `^`: red = `../a`, `a/../b`, `/abs`, `a//b`, `a\b`, `a<LF>b`, `%2e%2e/x` (7). **M3** drop `$`: red = `a/..`, `a/../b`, `a//b`, `a\b`, `a<LF>b` (5). Other constraints: drop one named CHECK (e.g. `users_id_check`): that case gets no error, and asserting the name stops another constraint from masking it. |
| I12 | Auth failure, with a canary: the test URL with its password replaced by `wrong-canary-28` rejects with `MigrationError`, `stage === "connect"`, cause SQLSTATE `28P01`; inspect contains neither `wrong-canary-28` nor `canary-s3cret-28` | Put the URL into the connect message: red. |

CI and tooling checks: table below, exact commands in 7.1 (block ids B1-B15).

| ID | Check | Negative run |
|---|---|---|
| T-lockfile | Step 0 only, before any other change, run by the step-0 coder in the worktree: same integrity multiset before and after `pnpm install --lockfile-only` (ops-live r1, r2: 131 = 131), only the lockfile changed, `--frozen-lockfile` passes (B1) | - (a lost or changed package shows up in the integrity diff) |
| T-lockfile-commit | Tester, read-only: `HEAD` is the one step-0 commit on top of `main`, it touches only `pnpm-lock.yaml`, carries `Refs #28`, and keeps the integrity multiset of `HEAD^` (B2) | - |
| T-lockfile-additions | Tester, read-only: `git diff --numstat --diff-algorithm=histogram HEAD -- pnpm-lock.yaml` is exactly one line with additions > 0 and 0 deletions (B3; ops-live r2: `2017 0`) | - (an empty numstat, i.e. an unchanged lockfile, is red too) |
| T-install | In a fresh clone (B4 `MODE=full`): `CI=true pnpm install --frozen-lockfile` prints no `Ignored build scripts` line, nothing matching `peer`, and no `WARN` other than the `lesson-validate` bin line and the `@esbuild-kit` deprecation line (B5) | A second fresh clone with the `allowBuilds` block filtered out (B4 `MODE=noallow`) prints `Ignored build scripts: cpu-features@0.0.10, ...` (B6) |
| T-sep | Positive: the unit suite, run uncached in the clone, executes only `test/unit/` files, none `int.test`, prints nothing from testcontainers, and the unit config has no `globalSetup` (B10). This proves the configs are disjoint, which is what keeps `pnpm test` Docker-free; it does not and cannot prove "runs with Docker stopped" on a machine where Docker runs | The image constant set to `postgres:0.0.0-nonexistent`: `test:integration` exits 1 and prints the F9 line naming that image (B10) |
| T-drift | In the clone: `check-drift.sh` exits 0 and prints `No schema changes, nothing to migrate` and then `migrations match the schema` (B11) | A add column, B vocabulary value, C rename, plus the guard mutation (B11) |
| T-append | `check-append-only.sh` passes on a merge whose PR only adds a migration | edit, delete, rename, snapshot edit, wrong `PR_HEAD_SHA`, non-merge HEAD (B13) |
| T-biome | In the clone: `pnpm lint` green, and the ignore line is present exactly once with a trailing comma (B7, B8) | The one line removed: `pnpm lint` exits 1, names `_journal.json`, and is not a Biome config parse error (B8) |
| T-env | In the clone, after waiting until no Ryuk container exists: `TESTCONTAINERS_RYUK_DISABLED=true pnpm test:integration` leaves none (B14) | Without the variable a Ryuk container is listed right after the run. This proves the variable crosses turbo (F12). |
| T-dist | In the clone: `pnpm build`, then `MIGRATIONS_FOLDER` imported from `dist/` equals `$(pwd -P)/packages/db/drizzle` (B9) | (U2 covers the mutation.) |

Also: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:integration`, all green in the
clone (B7). Before handover the tester uses the **Grep tool** (not a shell `rg`, which is not guaranteed
on PATH) with pattern `\p{Cyrillic}` on `packages/db` and `docs/adr/0007-progress-data-model.md`, and with
pattern `canary` on `packages/db/src` and `packages/db/scripts`, in the worktree; all four searches find
nothing (B15).

### 7.1 Exact tooling commands

#### 7.1.0 The starting state, and why the checks run in a clone

The state the pipeline leaves when the tester starts (each item checked against the reviews):
- `HEAD` is the step-0 commit, the only commit on top of `main` (section 10 step 0).
- The worktree holds the coder's uncommitted work: modified tracked files (`pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, `biome.json`, `turbo.json`, `.editorconfig`, `.gitattributes`, `ci.yml`,
  `docs/architecture.md`) and untracked ones (`packages/db/**`, the ADR), plus pipeline files
  (`.claude/feedback/*.md` modified, `plans/*` untracked) and git-ignored files
  (`.claude/pipeline_state.json`, `.claude/settings.pipeline-grant.json`).
- The worktree's `node_modules` is populated, and `node_modules/.modules.yaml` lists
  `ignoredBuilds: - esbuild@0.28.2` (read in this worktree; ops-live r2: it is reprinted on every install).
- A turbo cache under `.turbo/` from the coder's runs; Docker is running; a Ryuk container may still be up
  from the coder's last integration run.

Four checks give a wrong answer in that state: T-install (stale ignored build, ops-live r2),
`check-drift.sh` (untracked `packages/db/drizzle` makes `git status` non-empty, so it is red on correct
work: sweep S1), `pnpm lint` (Biome has no VCS integration in `biome.json`, so it also lints the git-ignored
`.claude/*.json` files: sweep S2, [verify-live]), and an uncached-run claim (turbo cache: sweep S3). And
every mutation would edit files of the pending diff. So the tester builds **clone C** once (B4): a `git
clone` of `HEAD`, the pending changes copied in, **one snapshot commit inside the clone**, then a frozen
install into a fresh `node_modules`. C has exactly the files CI checks out, committed, with no cache and
no stale install record. All mutations happen in C, never in the worktree.

Inside C, every file is committed in the snapshot commit, so `git status --porcelain` being empty is a
valid proof that C is back to the snapshot; restores still copy from a backup and prove it with
`cmp`/`diff -r` as well. (The #1 lesson against `git checkout`/`git status` as a restore proof is about
files of the pending diff in the worktree; in C those files are committed.)

#### 7.1.1 Conventions

- The tester's Bash tool starts a fresh zsh per call, so each block is one call of the form
  `VAR=value ... bash -o pipefail -c '...'`, with `SCRATCH=<abs>` (the session scratchpad, absolute) and,
  where needed, `WT=<abs>` (this worktree, absolute) typed as literals in front of `bash`. Paths that must
  survive between calls are written to files under `$SCRATCH` (`clone-full.path`, `clone-noallow.path`,
  `tdrift.path`, `tsep.path`) and read back with a `: "${X:?}"` guard.
- Every block is run from the worktree directory (the Bash tool's cwd); blocks that work in C `cd` into it
  themselves.
- Set the Bash tool timeout to 600000 ms for B4, B7, B10, B11 (positive), B12 and B14 (they install,
  build or start containers).
- No `rm` anywhere (the harness refuses `rm` inside a `bash -c` script; ops-live r2), no `git checkout`
  on worktree files, no interactive prompt (drizzle-kit generate always gets `</dev/null`; commits use
  `-m`; installs run on a fresh `node_modules`, so pnpm never asks to purge one).
- No literal inside a `'...'` script contains an apostrophe. Inside the scripts, `\"` and `\$` appear only
  within double-quoted strings, where bash turns them into `"` and `$`.
- Edits made with the Edit tool (T-drift A/B/C, the guard mutation, M1-M3) target the files in C, by the
  absolute path printed in `$SCRATCH/clone-full.path`, between a backup call and a check call.

Order: B2, B3, B4 full, B5, B4 noallow, B6, B7, B8, B9, B10, B11, B12, B13, B14, B15. B1 belongs to step 0
and was run by the step-0 coder.

#### B1. T-lockfile (step 0 only; the step-0 coder, in the worktree)

Besides the lockfile, the tree holds only pipeline files under `plans/` and `.claude/feedback/`.

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && S=$(mktemp -d "$SCRATCH/lock.XXXXXX") \
 && grep -oE "(sha512|sha1)-[A-Za-z0-9+/=]+" pnpm-lock.yaml | sort > "$S/integrity.before" \
 && pnpm install --lockfile-only \
 && grep -oE "(sha512|sha1)-[A-Za-z0-9+/=]+" pnpm-lock.yaml | sort > "$S/integrity.after" \
 && diff "$S/integrity.before" "$S/integrity.after" \
 && [ "$(git diff --name-only -- . ":(exclude)plans" ":(exclude).claude/feedback")" = "pnpm-lock.yaml" ] \
 && CI=true pnpm install --frozen-lockfile && echo T-lockfile OK'
```

Expected: last line `T-lockfile OK` (ops-live r2 in a fresh clone: 131 = 131 integrity lines, `git diff
--shortstat` `547 insertions(+), 937 deletions(-)`, `lockfileVersion: '9.0'`). The frozen install in the
worktree's populated `node_modules` may print `Ignored build scripts: esbuild@0.28.2.` (stale, 4.8); no
assertion reads the install output. **[verify-live]** that the frozen install does not stop with a
"modules directory will be removed" prompt in a `node_modules` populated by an earlier plain install (run
it in a scratch clone after a plain `pnpm install`, not in this worktree).

#### B2. T-lockfile-commit (tester, worktree, read-only)

```bash
bash -o pipefail -c '[ "$(git rev-list --count main..HEAD)" = 1 ] \
 && git log -1 --format=%s | grep -qF "chore(deps): rewrite lockfile in pnpm" \
 && git log -1 --format=%B | grep -qx "Refs #28" \
 && [ "$(git diff --name-only HEAD^ HEAD)" = "pnpm-lock.yaml" ] \
 && diff <(git show HEAD^:pnpm-lock.yaml | grep -oE "(sha512|sha1)-[A-Za-z0-9+/=]+" | sort) \
         <(git show HEAD:pnpm-lock.yaml | grep -oE "(sha512|sha1)-[A-Za-z0-9+/=]+" | sort) \
 && echo T-lockfile-commit OK'
```

Expected: `T-lockfile-commit OK`. The subject is matched without its apostrophe on purpose (7.1.1).
**[verify-live]** (new block; the integrity comparison is the B1 comparison applied to the two commits).

#### B3. T-lockfile-additions (tester, worktree, read-only)

```bash
bash -o pipefail -c 'git diff --numstat --diff-algorithm=histogram HEAD -- pnpm-lock.yaml | tee /dev/stderr \
 | awk "{ a = \$1; d = \$2 } END { exit !(NR == 1 && a > 0 && d == 0) }" && echo T-lockfile-additions OK'
```

Expected: one line `<added> 0 pnpm-lock.yaml` (tab-separated), then `T-lockfile-additions OK`. ops-live r2
measured `2017 0` for the dependency list in section 6 (Myers would show `2041 24`); `<added>` differs if
the coder's resolved versions differ, and only the `0` is asserted. The `END`/`NR == 1` form makes an
empty numstat (unchanged lockfile) red; revision 2's per-line awk passed it vacuously (sweep S5).

#### B4. Clone C (tester; `MODE=full`, and later `MODE=noallow` for B6)

```bash
MODE=full WT=<abs> SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" "${WT:?}" "${MODE:?}" && cd "$WT" \
 && S=$(mktemp -d "$SCRATCH/clone-$MODE.XXXXXX") && C="$S/repo" \
 && git clone -q --branch "$(git rev-parse --abbrev-ref HEAD)" "$WT" "$C" \
 && [ "$(git -C "$C" rev-parse HEAD)" = "$(git rev-parse HEAD)" ] \
 && git ls-files -z -m -o --exclude-standard | tar -c --null -T - -f - | tar -x -f - -C "$C" \
 && cmp pnpm-lock.yaml "$C/pnpm-lock.yaml" && cmp pnpm-workspace.yaml "$C/pnpm-workspace.yaml" \
 && cmp packages/db/src/schema.ts "$C/packages/db/src/schema.ts" \
 && cd "$C" \
 && if [ "$MODE" = noallow ]; then \
      awk "/^allowBuilds:/ { skip = 1; next } skip && /^ / { next } { skip = 0; print }" pnpm-workspace.yaml > "$S/ws.yaml" \
      && mv "$S/ws.yaml" pnpm-workspace.yaml && ! grep -q allowBuilds pnpm-workspace.yaml \
      && grep -q "^packages:" pnpm-workspace.yaml; \
    fi \
 && git add -A && git -c user.name=t -c user.email=t@example.invalid commit -qm "tester snapshot" \
 && [ -z "$(git status --porcelain)" ] && [ ! -e node_modules ] \
 && { CI=true pnpm install --frozen-lockfile > "$S/install.log" 2>&1 \
      || { cat "$S/install.log"; echo "frozen install failed"; exit 1; }; } \
 && cat "$S/install.log" && [ -z "$(git status --porcelain)" ] \
 && printf "%s\n" "$C" > "$SCRATCH/clone-$MODE.path" && echo "clone $MODE ready: $C"'
```

Expected: the install log (with the `lesson-validate` bin `WARN`), then `clone full ready: <path>`. What
each line does: `--branch` pins the clone to this branch, whatever the source repository's default `HEAD`
is, and the `rev-parse` comparison proves it; `git ls-files -m -o --exclude-standard` lists exactly the
modified tracked and the untracked, not ignored files (so no `node_modules`, `dist`, `.turbo`, pipeline
state); the `cmp`s prove the copy; the snapshot commit makes `check-drift.sh` and restore proofs work like
in CI; `[ ! -e node_modules ]` proves the install starts fresh; the second `git status` proves the frozen
install rewrote nothing. A file deleted in the worktree would make `tar` fail loudly (no deletion is
expected in this change). **[verify-live]**: the block as a whole, in particular bsdtar's `--null -T -`
and the noallow `awk` filter on the 4.8 block shape. Run it again with `MODE=noallow` before B6.

#### B5. T-install positive (tester)

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" \
 && L="$(dirname "$C")/install.log" \
 && ! grep -q "Ignored build scripts" "$L" \
 && ! grep -qi "peer" "$L" \
 && [ -z "$(grep WARN "$L" | grep -v "Failed to create bin at .*lesson-validate" \
      | grep -vF "deprecated subdependencies found: @esbuild-kit/core-utils@3.3.2, @esbuild-kit/esm-loader@2.6.5, glob@10.5.0")" ] \
 && echo T-install OK'
```

Expected: `T-install OK`. ops-live r1: a fresh install with the block has no Ignored line and
`ignoredBuilds: []`. A frozen install does not resolve, so the deprecation line is not expected here; it
is allowed anyway because it is harmless and its presence depends on who resolved first (ops-live r2).
**[verify-live]** for the frozen-install spelling (r1 and r2 measured plain installs on a fresh
`node_modules`).

#### B6. T-install negative (tester, after B4 `MODE=noallow`)

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-noallow.path") && : "${C:?}" \
 && grep -F "Ignored build scripts: cpu-features@0.0.10" "$(dirname "$C")/install.log" \
 && echo T-install negative OK'
```

Expected: the line `Ignored build scripts: cpu-features@0.0.10, esbuild@0.18.20, esbuild@0.25.12,
esbuild@0.28.2, protobufjs@7.6.6, ssh2@1.17.0.` (ops-live r1 with a plain install; r2 confirmed the
negative fires on a fresh `node_modules`), then `T-install negative OK`. The frozen install still passes
without the block, because the lockfile does not record `allowBuilds` (ops-live r1). **[verify-live]**
for the frozen spelling.

#### B7. Everything green in C (tester)

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" && cd "$C" \
 && pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm test:integration \
 && [ -z "$(git status --porcelain)" ] && echo GREEN OK'
```

Expected: `GREEN OK`. This is the `checks` job plus the `db` job's test step, on a clone with no turbo
cache. The final status check proves no command wrote an unignored file.

#### B8. T-biome (tester, in C)

Positive (also covered by `pnpm lint` in B7):

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" && cd "$C" \
 && [ "$(grep -cF "\"!packages/db/drizzle/meta/**\"," biome.json)" = 1 ] && echo T-biome line OK'
```

Negative (removes the one line with its own trailing comma, so the JSON stays valid; restores
unconditionally):

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" && cd "$C" \
 && S=$(mktemp -d "$SCRATCH/tbiome.XXXXXX") && LINE="\"!packages/db/drizzle/meta/**\"," \
 && cp biome.json "$S/biome.json.bak" \
 && grep -vF "$LINE" "$S/biome.json.bak" > biome.json \
 && { pnpm lint > "$S/lint.log" 2>&1; echo "lint exit=$?"; } \
 ; : "${S:?}" && cp "$S/biome.json.bak" biome.json && cmp "$S/biome.json.bak" biome.json \
 && [ -z "$(git status --porcelain)" ] && echo restore OK \
 && grep -q "_journal.json" "$S/lint.log" && ! grep -q "Expected an array" "$S/lint.log" \
 && echo T-biome negative OK'
```

Expected: `lint exit=1`, `restore OK`, `T-biome negative OK` (ops-live r1: without the line Biome fails on
`drizzle/meta/0000_snapshot.json` and `drizzle/meta/_journal.json`). The `: "${S:?}"` after the `;` stops
the script before any `cp` if the `cd` or `mktemp` failed, so the restore can never write into the
worktree. **[verify-live]** (new spelling; r2 hit the trailing-comma failure with the Edit tool).

#### B9. T-dist (tester, in C)

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" && cd "$C" \
 && pnpm build \
 && P=$(node --input-type=module -e "const m = await import(\"./packages/db/dist/index.js\"); console.log(m.MIGRATIONS_FOLDER)") \
 && printf "%s\n" "$P" && [ "$P" = "$(pwd -P)/packages/db/drizzle" ] && echo T-dist OK'
```

Expected: the absolute path, then `T-dist OK`. Node resolves modules by realpath, so the comparison uses
`pwd -P` (ops-live r2 note: on macOS the printed path is the realpath). Revision 2's single quotes inside
`import('...')` would have closed a single-quoted `bash -c` script (sweep S7).

#### B10. T-sep (tester, in C)

Positive:

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" && cd "$C" \
 && S=$(mktemp -d "$SCRATCH/tsep.XXXXXX") && printf "%s\n" "$S" > "$SCRATCH/tsep.path" \
 && pnpm --filter @academy/db run test > "$S/unit.log" 2>&1 && cat "$S/unit.log" \
 && grep -q "test/unit/" "$S/unit.log" && ! grep -q "int.test" "$S/unit.log" \
 && ! grep -qi "testcontainers" "$S/unit.log" && ! grep -q "globalSetup" packages/db/vitest.config.ts \
 && echo T-sep positive OK'
```

Expected: vitest's per-file lines for `test/unit/*.test.ts`, then `T-sep positive OK`. The run calls
vitest directly (no turbo, so no cache replay). **[verify-live]** that vitest 5.0.5's non-TTY default
reporter prints the `test/unit/...` file paths; fallback: add `--reporter=verbose` after `run test`.

Negative (the image tag is edited with `sed` into the clone's file from a backup, the run is captured, and
the restore runs unconditionally):

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" && cd "$C" \
 && S=$(cat "$SCRATCH/tsep.path") && : "${S:?}" && F=packages/db/test/integration/global-setup.ts \
 && [ "$(grep -c "postgres:17.6-alpine" "$F")" = 1 ] && cp "$F" "$S/global-setup.ts.bak" \
 && sed "s/postgres:17.6-alpine/postgres:0.0.0-nonexistent/" "$S/global-setup.ts.bak" > "$F" \
 && { pnpm --filter @academy/db run test:integration > "$S/int.log" 2>&1; echo "test:integration exit=$?"; } \
 ; : "${S:?}" "${F:?}" && cp "$S/global-setup.ts.bak" "$F" && cmp "$S/global-setup.ts.bak" "$F" \
 && [ -z "$(git status --porcelain)" ] && echo restore OK \
 && grep -F "@academy/db test:integration: could not start the Postgres test container (postgres:0.0.0-nonexistent)" "$S/int.log" \
 && echo T-sep negative OK'
```

Expected: `test:integration exit=1`, `restore OK`, the F9 line (followed by `Is Docker running? Cause:
...`), `T-sep negative OK`. ops-live r2: the nonexistent tag gives rc 1, and a `console.error` line before
the rethrow is visible although vitest prints `TypeError: code.charCodeAt is not a function` for the error
itself. **[verify-live]**: the exact line (new literal) and that `pnpm --filter ... run` propagates exit 1.

#### B11. T-drift (tester, in C)

Positive:

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" && cd "$C" \
 && pnpm exec turbo run build --filter="@academy/db^..." \
 && pnpm --filter @academy/db run db:check \
 && out=$(bash packages/db/scripts/check-drift.sh 2>&1) && printf "%s\n" "$out" \
 && grep -qF "No schema changes, nothing to migrate" <<< "$out" \
 && grep -qxF "migrations match the schema" <<< "$out" && echo T-drift positive OK'
```

Expected: `Everything's fine` from `db:check`, the drizzle-kit output containing `No schema changes,
nothing to migrate`, the line `migrations match the schema`, then `T-drift positive OK` (ops-live r2 ran
the positive with a script that prints its output on green, section 6).

Backup, once, before any T-drift or M mutation:

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" && cd "$C" \
 && S=$(mktemp -d "$SCRATCH/tdrift.XXXXXX") && printf "%s\n" "$S" > "$SCRATCH/tdrift.path" \
 && cp packages/db/src/schema.ts "$S/schema.ts.bak" && cp packages/db/src/vocabulary.ts "$S/vocabulary.ts.bak" \
 && cp packages/db/scripts/check-drift.sh "$S/check-drift.sh.bak" && cp -R packages/db/drizzle "$S/drizzle.bak" \
 && echo backup OK'
```

Restore, after every negative (also after each of M1-M3):

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" && cd "$C" \
 && S=$(cat "$SCRATCH/tdrift.path") && : "${S:?}" \
 && cp "$S/schema.ts.bak" packages/db/src/schema.ts && cp "$S/vocabulary.ts.bak" packages/db/src/vocabulary.ts \
 && cp "$S/check-drift.sh.bak" packages/db/scripts/check-drift.sh \
 && rsync -a --delete "$S/drizzle.bak/" packages/db/drizzle/ \
 && cmp "$S/schema.ts.bak" packages/db/src/schema.ts && cmp "$S/vocabulary.ts.bak" packages/db/src/vocabulary.ts \
 && cmp "$S/check-drift.sh.bak" packages/db/scripts/check-drift.sh && diff -r "$S/drizzle.bak" packages/db/drizzle \
 && [ -z "$(git status --porcelain)" ] && echo restore OK'
```

Expected: `restore OK` (ops-live r2: the same restore printed `restore OK` with a clean status).

Check call for a negative (the script is expected to exit 1):

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" && cd "$C" \
 && { bash packages/db/scripts/check-drift.sh; echo "drift exit=$?"; } \
 && git status --porcelain --untracked-files=all -- packages/db/drizzle'
```

- **A (add column):** Edit tool, in C: add a nullable `text` column to `attempts` in `schema.ts`. Check
  call. Expected: `drift exit=1`, and the status lists ` M packages/db/drizzle/meta/_journal.json`,
  `?? packages/db/drizzle/0001_<name>.sql` and `?? packages/db/drizzle/meta/0001_snapshot.json`
  (ops-live r2). Restore.
- **B (vocabulary value):** Edit tool, in C: append `"cancelled"` to `MENTOR_REVIEW_STATUSES`. Check
  call. Expected `drift exit=1`, then:

  ```bash
  SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" && cd "$C" \
   && grep -E "DROP CONSTRAINT .?mentor_reviews_status_check" packages/db/drizzle/0001_*.sql \
   && grep -E "ADD CONSTRAINT .?mentor_reviews_status_check.*cancelled" packages/db/drizzle/0001_*.sql && echo B OK'
  ```

  prints both lines and `B OK` (ops-live r2). Check kinds use the same helper. Restore.
- **C (rename):** Edit tool, in C: change the SQL name `"check_kind"` to `"kind_of_check"` in
  `schema.ts`. Check call. Expected: the output contains `Interactive prompts require a TTY`, then
  `drift exit=1`, and the status is empty, because nothing was written and only the output assertion
  catches it (ops-live r2).
- **Guard mutation:** keep C's edit, and with the Edit tool remove the output-literal condition from C's
  `check-drift.sh`. Check call. Expected: `migrations match the schema` and `drift exit=0`, which proves
  that assertion is the one catching C (ops-live r2). Restore.

#### B12. I11 M1-M3 (tester, in C; reuses the B11 backup and restore)

The **M check call** runs the integration suite with vitest's JSON reporter and prints the totals and the
title of every failed test, sorted:

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" && cd "$C" \
 && S=$(cat "$SCRATCH/tdrift.path") && : "${S:?}" \
 && { pnpm --filter @academy/db exec vitest run --config vitest.integration.config.ts --reporter=json --outputFile="$S/m.json" > "$S/m.log" 2>&1; echo "vitest exit=$?"; } \
 && node -e "const r = JSON.parse(require(\"fs\").readFileSync(process.argv[1], \"utf8\")); const all = r.testResults.flatMap((f) => f.assertionResults); const bad = all.filter((a) => a.status === \"failed\").map((a) => a.title).sort(); console.log(\"total=\" + all.length + \" failed=\" + bad.length); for (const t of bad) console.log(t);" "$S/m.json"'
```

1. **Control, before any mutation:** M check call. Expected `vitest exit=0` and `total=<N> failed=0`
   with `N > 0`. A parse failure or `total=0` means the reporter shape differs: stop and use the fallback
   below. This control is what makes an empty failure list in a mutated run meaningful.
2. For each of M1, M2, M3: Edit tool, in C: replace the regex expression of
   `attempts_transcript_path_check` in `schema.ts` with the mutated expression (7 I11). Then

   ```bash
   SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" && cd "$C" \
    && pnpm --filter @academy/db run db:generate </dev/null && ls packages/db/drizzle/0001_*.sql'
   ```

   (it writes `0001_*.sql` with `DROP`/`ADD CONSTRAINT`; a changed CHECK body causes no prompt, ops-live
   r2). Then the M check call. Expected: `vitest exit=1`, `total=<N> failed=<k>`, and the printed titles
   are, as a set, exactly the reject titles listed for that mutation in 7 I11 (M1: 8, M2: 7, M3: 5).
   Then the B11 restore.

**[verify-live]**: the JSON reporter shape (`testResults[].assertionResults[].title/status`) and
`--outputFile` in vitest 5.0.5. Fallback if the shape differs: the same run with `--reporter=verbose`
instead of the JSON options, and the tester lists the failed test titles from the output by hand; the
expected sets are unchanged.

#### B13. T-append (tester; a scratch repo, not a clone, so the parent order is fully controlled)

`MODE` is one of `none`, `edit`, `delete`, `rename`, `snapshot`, `wrongsha`, `nomerge`:

```bash
MODE=none WT=<abs> SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" "${WT:?}" "${MODE:?}" \
 && R=$(mktemp -d "$SCRATCH/tappend.XXXXXX") && cd "$R" \
 && g() { git -c user.name=t -c user.email=t@example.invalid "$@"; } \
 && g init -q -b main && mkdir -p packages/db/drizzle/meta \
 && printf "a\n" > packages/db/drizzle/0000_a.sql && printf "{}\n" > packages/db/drizzle/meta/0000_snapshot.json \
 && g add -A && g commit -qm base && g switch -qc pr && printf "b\n" > packages/db/drizzle/0001_b.sql \
 && case "$MODE" in
      edit) printf "x\n" >> packages/db/drizzle/0000_a.sql ;;
      delete) mv packages/db/drizzle/0000_a.sql "$R.moved-out.sql" ;;
      rename) g mv packages/db/drizzle/0000_a.sql packages/db/drizzle/0000_z.sql ;;
      snapshot) printf "{\"x\":1}\n" > packages/db/drizzle/meta/0000_snapshot.json ;;
    esac \
 && g add -A && g commit -qm change \
 && if [ "$MODE" != nomerge ]; then g switch -q main && g merge -q --no-ff pr -m merge; fi \
 && if [ "$MODE" = wrongsha ]; then SHA=$(g rev-parse HEAD^1); elif [ "$MODE" = nomerge ]; then SHA=$(g rev-parse HEAD); else SHA=$(g rev-parse HEAD^2); fi \
 && PR_HEAD_SHA="$SHA" bash "$WT/packages/db/scripts/check-append-only.sh"; echo "append-only exit=$?"'
```

`delete` moves the file out of the repository (to a sibling path in the scratchpad) and `g add -A`
records the deletion. **Because:** the harness refuses the whole block if it contains `rm` (revision 2's
`g rm -q`, ops-live r2), and `git update-index --force-remove` would leave the file on disk, so the
following `g add -A` would re-add it. The commit content is the same as with `git rm`.

| MODE | Expected |
|---|---|
| `none` | `append-only exit=0` |
| `edit` | exit 1, lists `M` `packages/db/drizzle/0000_a.sql` |
| `delete` | exit 1, lists `D` `packages/db/drizzle/0000_a.sql` |
| `rename` | exit 1, lists `R100` `packages/db/drizzle/0000_a.sql` -> `0000_z.sql` |
| `snapshot` | exit 1, lists `M` `packages/db/drizzle/meta/0000_snapshot.json` |
| `wrongsha` | exit 1, prints the parent-order message naming `fetch-depth` |
| `nomerge` | exit 1, the same message (no `HEAD^2`) |

(ops-live r2 for every mode except `delete`, which was ops-live in r1 with `git rm`; **[verify-live]** the
`mv` spelling.)

#### B14. T-env (tester, in C; last, because every integration run before it may leave a Ryuk container)

Positive (waits up to 60 s for a lingering Ryuk container to exit):

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" && cd "$C" \
 && n=0 && while [ -n "$(docker ps -a -q --filter label=org.testcontainers.ryuk=true)" ] && [ "$n" -lt 12 ]; do sleep 5; n=$((n + 1)); done \
 && [ -z "$(docker ps -a -q --filter label=org.testcontainers.ryuk=true)" ] \
 && TESTCONTAINERS_RYUK_DISABLED=true pnpm test:integration \
 && [ -z "$(docker ps -a -q --filter label=org.testcontainers.ryuk=true)" ] && echo T-env positive OK'
```

Negative, right after:

```bash
SCRATCH=<abs> bash -o pipefail -c ': "${SCRATCH:?}" && C=$(cat "$SCRATCH/clone-full.path") && : "${C:?}" && cd "$C" \
 && pnpm test:integration \
 && R=$(docker ps -a -q --filter label=org.testcontainers.ryuk=true) && printf "%s\n" "$R" \
 && [ -n "$R" ] && echo T-env negative OK'
```

Expected: `T-env positive OK`; then a container id and `T-env negative OK` (ops-live r2: the negative
prints a Ryuk id; r1: testcontainers reuses a running Ryuk, so the positive needs none at its start). Both
go through `pnpm test:integration`, i.e. through turbo, which is what F12 is about. If the positive's
precondition still fails after 60 s (another session keeps Ryuk alive), the tester reports it and may
remove the listed container with a separate, literal `docker rm -f <id>` call (not inside `bash -c`).
**[verify-live]** that a lingering Ryuk disappears within 60 s (r1 observed about 10 s).

#### B15. Language and canary searches (tester, worktree, Grep tool)

Grep tool, pattern `\p{Cyrillic}`, paths `packages/db` and `docs/adr/0007-progress-data-model.md`: no
matches. Grep tool, pattern `canary`, paths `packages/db/src` and `packages/db/scripts`: no matches
(canaries live only under `packages/db/test`).

---

## 8. CI job (new; no other job changes)

Job id `db`, name `db migrations and integration tests`, `runs-on: ubuntu-24.04`,
`timeout-minutes: 15`, job env `TESTCONTAINERS_RYUK_DISABLED: "true"` (F11). No path filter: the
workflow triggers on every `pull_request` and on `push` to main (ci.yml:3-6), so a lesson-schema-only PR
runs it too (F7). CI's state is a fresh checkout of committed files with a fresh `node_modules`, which is
what the tester clone reproduces (7.1.0). Steps:

1. `actions/checkout@v4` with `fetch-depth: 2` (the PR merge commit plus both parents) and
   `persist-credentials: false`. **Because:** the job runs PR code (drizzle-kit loads `schema.ts`, the
   tests run), and nothing after checkout needs the token (ops-live r2: both scripts use only local git).
2. `pnpm/action-setup@v4`, `actions/setup-node@v4` (`node-version-file: .nvmrc`, `cache: pnpm`),
   `pnpm install --frozen-lockfile` (as in `checks`).
3. **applied migrations are append-only**, `if: github.event_name == 'pull_request'`, step env
   `PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}` (passed via env, never interpolated into the
   script), `run: bash packages/db/scripts/check-append-only.sh`. The script:
   - `git rev-parse --verify --quiet HEAD^2` must succeed, and `git rev-parse HEAD^2` must equal
     `"$PR_HEAD_SHA"`. Otherwise it prints `expected the pull request merge commit with the PR head as
     second parent (is actions/checkout fetch-depth >= 2?)` and exits 1. **Because:** the step relies on
     `HEAD^1` being the base, and checking the second parent against the event's head sha proves the
     parent order instead of assuming it (ops-live on a simulated `refs/pull/1/merge` at depth 2;
     **[verify on this PR's first CI run]** against real GitHub; it fails closed, never as a false green).
   - `git diff --name-status --diff-filter=DMR HEAD^1 HEAD -- 'packages/db/drizzle/*.sql' 'packages/db/drizzle/meta/*_snapshot.json'`.
     Non-empty output: print it with `merged migrations must not be edited, deleted or renamed: add a
     new migration instead` and exit 1.
4. `pnpm exec turbo run build --filter='@academy/db^...'` (lesson-schema `dist/` for drizzle-kit).
5. `pnpm --filter @academy/db run db:check`.
6. **migrations match the schema**, `timeout-minutes: 3` (backstop only, F8),
   `run: bash packages/db/scripts/check-drift.sh` (section 6: stdin `/dev/null`; always prints the
   drizzle-kit output; green, with the line `migrations match the schema`, only on exit 0 AND the literal
   `No schema changes, nothing to migrate` AND a clean `packages/db/drizzle`; the checkout is committed
   files, so the folder is clean unless generate wrote something).
7. `pnpm test:integration`.

On `push` to `main` step 3 is skipped (no PR merge commit). Steps 5-7 still run.

---

## 9. ADR-0007 required contents (`docs/adr/0007-progress-data-model.md`, template 0000)

- Header: `Status: Proposed`, `Date: <commit date>`, `Issue: #28`.
- **Context:** lessons live in git (ADR-0001); ids are unique per course (validate.ts); Better Auth
  arrives in #30 (default text ids); Drizzle 0.45 migrator facts (single transaction, timestamp ordering,
  unchecked hash, no lock); drizzle-kit 0.31 in non-TTY (an ambiguous change exits 0 without writing);
  `pgEnum` limits; architecture.md (Postgres only under `apps/web`). Sources:
  `plans/28-db-schema-research.md`, this design, the round-1 and round-2 operations reviews.
- **Decision**, numbered so Stepan can accept or overturn each:
  1. Drizzle 0.45 / drizzle-kit 0.31, explicit column names, no casing/relations; upgrade trigger and
     path (4.1).
  2. `users` is Better Auth's user table; all user ids/FKs are `text`, non-empty, no DB default; what #30
     must check (adapter mapping, `generateId`, email case) (4.2).
  3. Lesson reference `(course_id, lesson_id)`; not validated by the DB; ids are permanent once used (4.3).
  4. Status vocabularies (the table in 4.4 with meanings), `text` + named CHECK, check kinds derived from
     lesson-schema, the attempt aggregation rule.
  5. Progress semantics, all of 4.9: attempt scope, atomic finish, the finish transaction at READ
     COMMITTED with `FOR NO KEY UPDATE` on the progress row and the completion query as a separate
     statement after the lock (and why a CTE or a higher isolation level loses results), row creation,
     the completion rule, theory lessons, stickiness, the single writer function, the dashboard derivation
     including the zero-lesson corner and the exact module status, no grader secrets in `details`.
  6. Tables, keys, the FK chain, cascade on user delete and **its scope**: Postgres rows only; account
     deletion collects transcript paths before the delete and removes the files (#30, backlog 12); #30's
     `session`/`account` FKs cascade (4.6).
  7. Transcript reference = store-relative path with the exact allowlist CHECK from 4.5; the reader
     (backlog 12) still confines `realpath(root + path)` under the root, and the DB check does not
     replace that; no length cap (additive later).
  8. Database clients: `apps/web` is the only DB client and writer; it migrates at startup and exits
     non-zero on failure; any route that takes an attempt id checks `attempts.user_id` against the
     session (4.6, 4.10). Requirement on the workspace API (backlog 05): it returns check results, mentor
     output, cost and the transcript path to `apps/web`, and the browser stream ends in or is relayed by
     `apps/web`; architecture.md does not show that relay yet, and this ADR is where it is required.
  9. Migration and package rules: migrations are only generated by drizzle-kit; merged files are never
     edited; the append-only, drift (with the positive-output assertion) and journal-order guards (CI
     step names, U1); advisory lock + validated lock timeout set via `set_config`; `MigrationError`
     stages and the 55P03-only lock hint; bundled consumers pass an absolute `migrationsFolder`
     (a relative one is `InvalidMigrationsFolderError`); no connection string in any error, `cause` or
     log, and option errors never serialize caller data (4.7, 4.11).
  10. Change procedure: any schema change is a dev task with a generated migration; changing items 2-9
      updates this ADR and needs Stepan's approval.
- **Alternatives considered:** the rows of section 2 relevant to each item.
- **Consequences:** writer order (upsert enrollment and progress first); lesson id renames need a data
  migration, and the dashboard ignores orphans (F14); removing a check kind needs a data decision (F15);
  `apps/web` marks an attempt `error` when the service stream ends without a result and sweeps stale
  `running` attempts at startup (backlog 08, single web process assumed, F16); bundled consumers pass
  `migrationsFolder` or list `@academy/db`, `drizzle-orm`, `pg` in `serverExternalPackages`, images ship
  `packages/db/drizzle`, and #1 tests migrate inside the built image (F17); the `drizzle-kit` dev advisory
  is accepted until 1.0 (F20); transcripts survive the DB cascade and are deleted by the account-deletion
  flow (F22); Drizzle's `DrizzleQueryError` message embeds query params, so #30 states its own rule for
  logging DB errors before credential tables exist (4.11); residual risks of the append-only guard: direct
  pushes to main, edited `when` values of existing `_journal.json` entries (U1 checks only that they
  increase), and Stepan resets his local DB after applying an unmerged migration (F6).

`docs/architecture.md`: replace "DB schema, workspace service API, authentication: their ADRs will come
with the corresponding tasks." with a "DB schema and progress data model: ADR-0007" bullet, and keep the
sentence for the workspace API and authentication.

---

## 10. Suggested implementation order (for the planner)

0. **Lockfile format commit, before anything else** (F24). A coder spawn whose only job is B1 (T-lockfile)
   and a report; it changes nothing else. The orchestrator then commits only that file, before the next
   coder spawn:
   `git add pnpm-lock.yaml && git commit -m "chore(deps): rewrite lockfile in pnpm's native format" -m "The committed lockfile was reformatted by an external tool, so pnpm would rewrite the whole file on the next dependency change. Same packages and integrity hashes; --frozen-lockfile passes." -m "Refs #28"`
   (typed directly in the shell, not inside a single-quoted `bash -c`, so the apostrophe is safe; ops-live
   r2: the command runs as written and the pr gate's `#28` requirement is met). Checked: no hook gates
   `git commit` by phase (ops-live r2: only the `pr` gate and the Stop gate check the tree). **Because:**
   the dependency change then reads as additions only, and B3 means something. Stepan squashes at merge,
   but the split still serves review and the tester. If the orchestrator decides it must not commit before
   the commit phase, it asks Stepan instead of letting both changes land in one commit; B2 and B3 then
   cannot pass, and the tester reports that instead of improvising.
1. Scaffold `packages/db` (package.json, tsconfigs, empty `src/index.ts`) and the `allowBuilds` block
   (shape in 4.8); `pnpm install` in the worktree; `pnpm typecheck`. In the worktree that install is
   expected to print `Ignored build scripts: esbuild@0.28.2.` (the stale record, 4.8) and, on the first
   resolving install, the `@esbuild-kit` deprecation `WARN` (6). Neither is a defect. The coder may
   self-check with B3, B4 (`MODE=full`) and B5; the tester runs them as the authority.
2. `vocabulary.ts`, `errors.ts`, `schema.ts`, `drizzle.config.ts`;
   `pnpm exec turbo run build --filter='@academy/db^...'`, then
   `pnpm --filter @academy/db run db:generate --name init`. Read `drizzle/0000_init.sql` and confirm that
   every CHECK has literal values, the transcript pattern is byte-identical to 4.5, and every
   constraint/index has its section-5 name. U3.
3. `biome.json` (line position per 4.8), `.editorconfig`, `.gitattributes` -> `pnpm lint`. In the
   worktree, Biome may also report the git-ignored `.claude/pipeline_state.json` and
   `.claude/settings.pipeline-grant.json` (Biome has no VCS integration in `biome.json`) **[verify-live]**;
   findings in files for which `git check-ignore -q <file>` exits 0 are worktree state, not this change.
   B7/B8 in the clone are the authority.
4. `connection-string.ts`, `client.ts`, `migrate.ts` -> `pnpm build`.
5. Unit tests U1-U7 -> `pnpm test`.
6. Integration setup and I1-I12 -> `pnpm test:integration`. Each mutation is run once in a B4 clone,
   never in the worktree (the coder's files there are the uncommitted pending diff); a fresh B4 clone
   picks up later fixes.
7. `scripts/check-drift.sh`, `scripts/check-append-only.sh`, `turbo.json`, the CI job. `check-drift.sh`
   is red in the worktree by design (uncommitted `packages/db/drizzle`, section 6), so T-drift, I11 M1-M3
   and T-env are run in a B4 clone (B11, B12, B14); T-append runs in its own scratch repo (B13).
8. ADR-0007, `docs/architecture.md`.

## 11. Follow-ups (not in this PR)

- Stepan: add `/packages/db/  @valmlord` to `.github/CODEOWNERS`.
- #1/#30: list `@academy/db`, `drizzle-orm`, `pg` in `serverExternalPackages` or pass an absolute
  `migrationsFolder`; ship `packages/db/drizzle` in the image; run `migrateDatabase` at startup and exit
  non-zero on failure; test migrate inside the built image (F17).
- #30: verify the Better Auth adapter field mapping against `users`, email lowercasing and the id
  generator (4.2); give `session`/`account` FKs `ON DELETE CASCADE`; implement account deletion as
  collect transcript paths -> delete user -> delete files (4.6); state a rule for logging DB errors
  that keeps `DrizzleQueryError` messages (which embed query params) out of logs (4.11).
- Backlog 05: the workspace API returns check results, mentor output, cost and the transcript path to
  `apps/web`, and the browser stream ends in or is relayed by `apps/web` (4.10, ADR-0007 item 8); a
  service that writes to the DB directly needs the workspace-API ADR and an ADR-0007 update first.
- Backlog 12: the transcript store's delete operation and orphan handling; the reader confines resolved
  paths under the root (4.5, 4.6).
- Backlog 08: the completion function in `apps/web` (4.9: READ COMMITTED, `FOR NO KEY UPDATE`, separate
  completion statement); in `apps/web`, marking an attempt `error` when the service stream ends without
  a result and the startup sweep of stale `running` attempts (F16).
- Backlog 09: the "mark as done" action for lessons with `checks: []` (unless an earlier issue adds it)
  and the dashboard derivation, including the zero-lesson corner and module status (4.9).
- Content contract: course id uniqueness in the validator; a note in ADR-0001 that lesson ids are
  permanent once learners have progress (F14). Both are Stepan-owned files.
- Drizzle 1.0 upgrade task when 1.0.0 is `latest` (4.1).

---

## 12. Command register (for the round-3 operations run and the tester)

Every command a role runs for this issue, where it runs, and the expected output. "Evidence" says what is
already measured; **[verify-live]** rows were new in revision 3 and were run live afterwards by the
round-3 operations judge (`plans/28-db-schema-design-review-3-operations.md`) and by the tester
(`plans/28-db-schema-test-report.md`). On a design-review run (no `packages/db` yet), the judge runs them
against a scratch implementation, as in rounds 1 and 2.

| Id | Who, where, starting state | Expected output | Evidence |
|---|---|---|---|
| B1 T-lockfile | step-0 coder; worktree at `main` tip, populated `node_modules`; tree dirty only under `plans/`, `.claude/feedback/` | `T-lockfile OK` | ops-live r1, r2 (fresh clone); **[verify-live]** no purge prompt over a populated `node_modules` |
| step-0 commit | orchestrator; worktree after B1 | commit with subject `chore(deps): rewrite lockfile in pnpm's native format`, body ends `Refs #28` | ops-live r2 |
| B2 T-lockfile-commit | tester; worktree, `HEAD` = step-0 commit | `T-lockfile-commit OK` | **[verify-live]** |
| B3 T-lockfile-additions | tester; worktree with the coder's lockfile | `<added> 0 pnpm-lock.yaml`, `T-lockfile-additions OK` | ops-live r2 (`2017 0` with histogram) |
| B4 `MODE=full` | tester; worktree as in 7.1.0 | install log, `clone full ready: <path>` | **[verify-live]** (bsdtar `--null -T -`, whole block) |
| B5 T-install | tester; clone full | `T-install OK` | ops-live r1 (plain install, fresh); **[verify-live]** frozen spelling |
| B4 `MODE=noallow` | tester | install log, `clone noallow ready: <path>` | **[verify-live]** (awk filter on the 4.8 block) |
| B6 T-install negative | tester; clone noallow | `Ignored build scripts: cpu-features@0.0.10, esbuild@0.18.20, ...`, `T-install negative OK` | ops-live r1, r2 (plain install, fresh); **[verify-live]** frozen spelling |
| B7 GREEN | tester; clone full | `GREEN OK` | **[verify-live]** as a block (each command ran in r1/r2 scratch clones) |
| B8 T-biome line / negative | tester; clone full | `T-biome line OK`; `lint exit=1`, `restore OK`, `T-biome negative OK` | ops-live r1 (red on `_journal.json`); **[verify-live]** the `grep -vF` spelling |
| B9 T-dist | tester; clone full | `<C realpath>/packages/db/drizzle`, `T-dist OK` | ops-live r1, r2 (path); **[verify-live]** the escaped spelling |
| B10 T-sep positive | tester; clone full | unit file lines, `T-sep positive OK` | **[verify-live]** (reporter prints `test/unit/` paths) |
| B10 T-sep negative | tester; clone full | `test:integration exit=1`, `restore OK`, the F9 line naming `postgres:0.0.0-nonexistent`, `T-sep negative OK` | ops-live r2 (rc 1, console.error visible); **[verify-live]** exact line, exit code via `pnpm --filter run` |
| B11 T-drift positive | tester; clone full | `Everything's fine`, `No schema changes, nothing to migrate`, `migrations match the schema`, `T-drift positive OK` | ops-live r2 |
| B11 backup / restore | tester; clone full | `backup OK` / `restore OK` | ops-live r2 (plus the new `git status` line in C) |
| B11 A | tester; clone full + Edit | `drift exit=1`; ` M .../meta/_journal.json`, `?? .../0001_<name>.sql`, `?? .../meta/0001_snapshot.json` | ops-live r2 |
| B11 B | tester; clone full + Edit | `drift exit=1`; the `DROP CONSTRAINT` and `ADD CONSTRAINT ... cancelled` lines, `B OK` | ops-live r1, r2 |
| B11 C | tester; clone full + Edit | `Interactive prompts require a TTY ...`, `drift exit=1`, empty status | ops-live r1, r2 |
| B11 guard | tester; clone full + C's edit + Edit | `migrations match the schema`, `drift exit=0` | ops-live r2 |
| B12 control | tester; clone full | `vitest exit=0`, `total=<N> failed=0`, `N > 0` | **[verify-live]** (JSON reporter shape) |
| B12 M1 / M2 / M3 | tester; clone full + Edit + generate | `vitest exit=1`, `failed=8` / `7` / `5`, titles exactly as in 7 I11 | sets ops-live r2 (Postgres 17.6); **[verify-live]** the test titles and reporter |
| I7 mutation a | tester; clone full + Edit + `0000` regenerated; B11 restore after | `failed=1`, only I7, at the other-course assertion, `23505` `lesson_progress_pkey` | live in judge_code round 1 (coder and tester: `total=38 failed=1`) |
| I7 mutation b | tester; clone full + Edit + `0000` regenerated; B11 restore after | `failed=1`, only I7, at the constraint-name assertion (`lesson_progress_i7_unique` instead of `lesson_progress_pkey`); I9, I10 green | verified live (code-review round-1 re-test): `total=38 failed=1`, I9 and I10 passed (`plans/28-db-schema-test-report.md`, re-test row 5). Note: the PK-and-FK-dropped variant, live in round 1, gives `failed=3` (I7, I9, I10) |
| B13 T-append (7 modes) | tester; scratch repo | per the B13 table | ops-live r2 (6 modes), r1 (`delete` via `git rm`); **[verify-live]** `delete` via `mv` |
| B14 T-env positive / negative | tester; clone full, Ryuk possibly lingering | `T-env positive OK`; a container id, `T-env negative OK` | ops-live r2 (negative), r1 (reuse); **[verify-live]** the 60 s poll |
| B15 searches | tester; worktree; Grep tool | no matches (four searches) | - |
| coder `pnpm lint` in the worktree | coder, step 3 | green, or findings only in git-ignored `.claude/*.json` | **[verify-live]** whether Biome lints those files |
| CI job `db` | GitHub Actions, fresh checkout | steps 3-7 green on this PR | step 3 parent order **[verify on this PR's first CI run]** |
