# #28 db schema v1: test report (tester)

Date: 2026-10-29. Worktree `.claude/worktrees/confident-ellis-4d58ed`, branch `feat/28-db-schema`,
HEAD `45396e75` (step-0 lockfile commit), implementation uncommitted. Spec: design revision 3, sections 7,
7.1, 12. Every command below was run by the tester in this session; every block was run verbatim from 7.1
with `SCRATCH`/`WT` typed as absolute literals, from the worktree directory, and Bash timeout 600000 for
the long blocks.

`SCRATCH` = `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-confident-ellis-4d58ed/59ed1263-0af4-4853-9f1c-20456a13f403/scratchpad`
Clone full C = `$SCRATCH/clone-full.qrqQbd/repo`; clone noallow = `$SCRATCH/clone-noallow.1WjcYR/repo`.

## Summary

| Step | Command (block) | Exit | Expected | Actual | Result |
|---|---|---|---|---|---|
| B2 | T-lockfile-commit (7.1 B2, verbatim) | 0 | `T-lockfile-commit OK` | `T-lockfile-commit OK` (131 integrity lines in `HEAD^` and `HEAD`) | PASS |
| B3 | T-lockfile-additions (verbatim) | 0 | `<added> 0 pnpm-lock.yaml`, OK | `2017	0	pnpm-lock.yaml`, `T-lockfile-additions OK` | PASS |
| B4 full | clone C, `MODE=full` (verbatim) | 0 | install log, `clone full ready` | install log with only the two `lesson-validate` bin WARNs, `clone full ready: .../clone-full.qrqQbd/repo` | PASS |
| B5 | T-install positive (verbatim) | 0 | `T-install OK` | `T-install OK`; `.modules.yaml` has `ignoredBuilds: []` | PASS |
| B4 noallow | clone, `MODE=noallow` (verbatim) | 0 | `clone noallow ready` | `clone noallow ready: .../clone-noallow.1WjcYR/repo`; the log shows the Ignored box | PASS |
| B6 | T-install negative (verbatim) | 0 | the Ignored line, OK | `│   Ignored build scripts: cpu-features@0.0.10, esbuild@0.18.20, │` (box wraps: `esbuild@0.25.12, esbuild@0.28.2, protobufjs@7.6.6, ssh2@1.17.0.`), `T-install negative OK` | PASS |
| B7 | lint, typecheck, build, test, test:integration in C (verbatim) | 0 | `GREEN OK` | lint `Checked 39 files`, no errors; db unit 33 passed, lesson-schema 12 passed; integration 3 files, 38 passed; `GREEN OK` | PASS |
| B8 line | T-biome positive (verbatim) | 0 | `T-biome line OK` | `T-biome line OK` | PASS |
| B8 negative | T-biome negative (verbatim) | 0 | `lint exit=1`, `restore OK`, OK | `lint exit=1`, `restore OK`, `T-biome negative OK`; lint log: `packages/db/drizzle/meta/0000_snapshot.json format`, `packages/db/drizzle/meta/_journal.json format`, `Found 2 errors.` | PASS |
| B9 | T-dist (verbatim) | 0 | `<C realpath>/packages/db/drizzle`, OK | `/private/tmp/.../clone-full.qrqQbd/repo/packages/db/drizzle`, `T-dist OK` | PASS |
| B10 positive | T-sep positive, `run test --reporter=verbose` form (plan note) | 0 | `test/unit/` lines, OK | 33 lines `✓ test/unit/...` (e.g. `✓ test/unit/migrations.test.ts > U1 migration journal order > accepts the generated drizzle folder`), no `int.test`, no testcontainers, `Tests 33 passed (33)`, `T-sep positive OK` | PASS |
| B10 negative | T-sep negative (verbatim) | 0 | `test:integration exit=1`, `restore OK`, F9 line, OK | `test:integration exit=1`, `restore OK`, `@academy/db test:integration: could not start the Postgres test container (postgres:0.0.0-nonexistent). Is Docker running? Cause: (HTTP code 404) ... not found`, `T-sep negative OK` | PASS |
| B11 positive | T-drift positive (verbatim) | 0 | `Everything's fine`, `No schema changes...`, `migrations match the schema`, OK | `Everything's fine 🐶🔥` (db:check), `No schema changes, nothing to migrate 😴`, `migrations match the schema`, `T-drift positive OK` | PASS |
| B11 backup | (verbatim) | 0 | `backup OK` | `backup OK` | PASS |
| B11 A | Edit: `driftProbe: text("drift_probe")` on `attempts`; check call | - | `drift exit=1`; M journal, ?? 0001 sql, ?? 0001 snapshot | `drift exit=1`; ` M packages/db/drizzle/meta/_journal.json`, `?? packages/db/drizzle/0001_yummy_jetstream.sql`, `?? packages/db/drizzle/meta/0001_snapshot.json`; then `restore OK` | PASS |
| B11 B | Edit: `"cancelled"` appended to `MENTOR_REVIEW_STATUSES`; check call; B grep | 0 | `drift exit=1`, both lines, `B OK` | `drift exit=1`; `ALTER TABLE "mentor_reviews" DROP CONSTRAINT "mentor_reviews_status_check";` and `... ADD CONSTRAINT "mentor_reviews_status_check" CHECK (... IN ('pending', 'completed', 'error', 'cancelled'));`, `B OK`; `restore OK` | PASS |
| B11 C | Edit: `text("check_kind")` -> `text("kind_of_check")`; check call | - | TTY error, `drift exit=1`, empty drizzle status | `Error: Interactive prompts require a TTY terminal ...`, `drift exit=1`, no status lines for `packages/db/drizzle` | PASS |
| B11 guard | C's edit kept, Edit removes the literal condition from `check-drift.sh`; check call | - | `migrations match the schema`, `drift exit=0` | `migrations match the schema`, `drift exit=0`; `restore OK` | PASS |
| B12 control | M check call, unmutated | 0 | `vitest exit=0`, `total=N failed=0`, N > 0 | `vitest exit=0`, `total=38 failed=0` (JSON reporter shape confirmed) | PASS |
| B12 M1 | naive `<> '' AND NOT LIKE '../%' AND NOT LIKE '/%'`, generate, M check | - | exit 1, the 8 M1 titles | `0001_clumsy_nomad.sql` (DROP/ADD); `vitest exit=1`, `total=38 failed=8`: rejects `%2e%2e/x`, `.`, `..`, `a/..`, `a/../b`, `a//b`, `a<LF>b`, `a\b`; `restore OK` | PASS |
| B12 M2 | `^` dropped | - | exit 1, the 7 M2 titles | `vitest exit=1`, `failed=7`: `%2e%2e/x`, `../a`, `/abs`, `a/../b`, `a//b`, `a<LF>b`, `a\b`; `restore OK` | PASS |
| B12 M3 | `$` dropped | - | exit 1, the 5 M3 titles | `vitest exit=1`, `failed=5`: `a/..`, `a/../b`, `a//b`, `a<LF>b`, `a\b`; `restore OK` | PASS |
| B13 none | T-append (verbatim, `MODE=none`) | 0 | `append-only exit=0` | `applied migrations are append-only`, `append-only exit=0` | PASS |
| B13 edit | `MODE=edit` | 1 | lists `M 0000_a.sql` | `M	packages/db/drizzle/0000_a.sql`, `append-only exit=1` | PASS |
| B13 delete | `MODE=delete` (`mv` spelling) | 1 | lists `D 0000_a.sql` | `D	packages/db/drizzle/0000_a.sql`, `append-only exit=1` | PASS |
| B13 rename | `MODE=rename` | 1 | `R100 a -> z` | `R100	packages/db/drizzle/0000_a.sql	packages/db/drizzle/0000_z.sql`, `append-only exit=1` | PASS |
| B13 snapshot | `MODE=snapshot` | 1 | `M meta/0000_snapshot.json` | `M	packages/db/drizzle/meta/0000_snapshot.json`, `append-only exit=1` | PASS |
| B13 wrongsha | `MODE=wrongsha` | 1 | message naming `fetch-depth` | `expected the pull request merge commit with the PR head as second parent (is actions/checkout fetch-depth >= 2?)`, `append-only exit=1` | PASS |
| B13 nomerge | `MODE=nomerge` | 1 | same message | same message, `append-only exit=1` | PASS |
| B14 positive | T-env positive (verbatim) | 0 | `T-env positive OK` | no Ryuk at start, `Tests 38 passed (38)`, no Ryuk after, `T-env positive OK` (`test:integration` has `cache: false`, so this was a real run) | PASS |
| B14 negative | T-env negative (verbatim) | 0 | container id, OK | `f2fc23c56699`, `T-env negative OK` | PASS |
| B15 | `\p{Cyrillic}` on `packages/db`, `docs/adr/0007-progress-data-model.md`; `canary` on `packages/db/src`, `packages/db/scripts` | rg 1 x4 | no matches | no matches in all four (rg exit 1 each); control: `canary` matches in `packages/db/test` (pattern works); also no match with `--no-ignore` incl. `packages/db/dist` | PASS (see deviation 1) |
| Worktree | `pnpm typecheck` / `pnpm test` / `pnpm build` | 0 / 0 / 0 | green | green; first run was a full turbo cache replay, so all three were re-run with `--force`: `Cached: 0 cached`, typecheck 3/3 tasks, test db 33 + lesson-schema 12 passed, build 2/2 | PASS |
| Worktree | `pnpm test:integration` | 0 | green | `Test Files 3 passed (3)`, `Tests 38 passed (38)` (task not cacheable) | PASS |
| Worktree | `pnpm lint` | 1 | findings only on git-ignored files | exactly 3 findings: `.claude/pipeline_state.json`, `.claude/pipeline_state.parked/1-1793114285.json`, `.claude/settings.pipeline-grant.json` (`Found 3 errors.`); `git status --porcelain --ignored --untracked-files=all .claude` lists all three as `!!` (ignored) | PASS (see deviation 2) |
| Role step | `pnpm content:validate` | 0 | ok | `content: 1 course(s), 6 module(s), 6 lesson(s), 0 issue(s)` | PASS |
| Role step | `docker compose up -d --build --wait` / `down` | 0 / 0 | healthy | `Container academy-db-1 Healthy`, `db Up 5 seconds (healthy)`; down removed container and network (pre-existing `academy_db-data` volume kept, not migrated) | PASS |
| Role step | e2e / design conformance | - | - | n/a: no `apps/` exists, no page touched, no Playwright config | n/a |

## Acceptance criterion: migrations apply to an empty database and do not break when applied again

1. I1/I2 (worktree, `pnpm exec vitest run --config vitest.integration.config.ts --reporter=verbose test/integration/migrate.int.test.ts` in `packages/db`, exit 0):
   ```
   ✓ ... migrateDatabase > I1 creates all six tables on an empty database and records every journal entry 116ms
   ✓ ... migrateDatabase > I2 leaves the journal untouched when run again 73ms
   Tests  6 passed (6)
   ```
   I1: fresh database per test (`freshDatabase()`), `migrateDatabase(url)`, asserts the six public tables and
   journal row count = `journalEntryCount()`. I2: fresh database, migrate, read `(id, hash, created_at)`,
   migrate again, `toEqual(before)`.
2. Independent run (tester's own script `$SCRATCH/twice/migrate-twice.mjs`, importing the clone's built
   `packages/db/dist/index.js` `migrateDatabase`): `docker run -d --name academy-tester-28-twice ... -p 127.0.0.1::5432 postgres:17.6-alpine`,
   `pg_isready` -> `accepting connections`, then node exit 0:
   ```
   before: {"absent":true,"public_tables":0}
   run 1: journal rows=1 public tables=6 [{"id":1,"hash":"32db9001...61c3","created_at":"1793281564975"}]
   run 2: journal rows=1 public tables=6 [{"id":1,"hash":"32db9001...61c3","created_at":"1793281564975"}]
   journal identical after second run: true
   ```
   `docker rm -f academy-tester-28-twice` -> removed; `docker ps -a --filter name=...` -> 0.

Result: PASS.

## Coder's I7 deviation, verified in clone C (each run followed by the B11 restore -> `restore OK`)

- Design's literal mutation (PK without `course_id`, nothing else), `0000` regenerated
  (`0000_same_wong.sql`): `vitest exit=1`; I1-I4 fail with `MigrationError: applying migrations from ... failed (42830); no migration from this run was applied`; `schema.int.test.ts` has 30 skipped (beforeAll). Confirms the coder: red for the wrong reason.
- Variant (a): `primaryKey(user_id, lesson_id)` + `unique("lesson_progress_i7a_unique").on(user_id, course_id, lesson_id)`, `0000` regenerated (`0000_bent_leo.sql`, shows both constraints): `total=38 failed=1`, only I7, at `schema.int.test.ts:155` (`.resolves.toBeDefined()` for the other course), cause `code: '23505'`, `constraint: 'lesson_progress_pkey'`, `Key (user_id, lesson_id)=(u-i7, intro-models-effort) already exists.` Isolates I7. PASS.
- Variant (b): PK dropped + `attempts_lesson_progress_fk` dropped, `0000` regenerated (`0000_sour_callisto.sql`, 0 matches for either constraint name): `total=38 failed=3`: I7 `Error: expected the statement to fail` (the right assertion), plus I9 (`expected [ +0, +0, 1, 2, 1 ] to deeply equal [ +0, +0, +0, +0, +0 ]`) and I10 (`expected the statement to fail`). I7 is red for the right reason, but (b) does **not** isolate I7: I9 and I10 are red too, which is the expected consequence of dropping the FK they test. The coder's report states only the I7 red line; it does not claim isolation for (b).

## Extra spot checks (unit guards can fail), clone C, restored with `cmp` + clean `git status` -> `restore OK`

- U2: `MIGRATIONS_FOLDER = "./drizzle"`: `× is absolute and holds the journal`, `Tests 1 failed | 32 passed`.
- U3(a): `$` dropped from `VOCABULARY_VALUE`: `× rejects "a'b"`, `× rejects "a b"`, `× rejects "a-b'); DROP TABLE users; --"`, `Tests 3 failed | 30 passed`.
- U1, U3(b,c), U4-U7, I1-I6, I8-I10, I12 mutations were not re-run by the tester (not in the brief).

## Deviations and observations

1. B15 names the Grep tool; the tester's toolset has none, so the same searches ran with `rg` (on PATH at
   `/opt/homebrew/bin/rg`, the engine behind the Grep tool), with a positive control.
2. The worktree-only `git check-ignore -v <state files>` was blocked by `bash-code-guard.sh` ("the pipeline
   state file is managed only by pipeline-advance.sh"), even read-only. Proved the ignore status with
   `git status --porcelain --ignored --untracked-files=all .claude` instead (`!!` for all three).
3. Not a defect, a note for judges: I2 does not itself assert that `before` is non-empty; I1 asserts the row
   count on the same code path, and the independent run shows 1 row before and after.
4. Not a defect: in the B12 JSON summary a beforeAll failure shows as `skipped`, not `failed`; in M1-M3 the
   listed reject titles failed individually and `total=38`, so the sets above are real.
5. `.claude/feedback/architect_mistakes.md` contains Cyrillic, but none on lines added by this diff
   (`git diff ... | rg '^\+.*\p{Cyrillic}'` -> no match). Outside B15 scope.

## Cleanup

- `docker ps -a` after the run: empty (Ryuk from B14 negative exited); `--filter label=academy.workspace`: 0.
- `git status --porcelain` in the worktree before vs after: identical (diff empty), HEAD unchanged
  `45396e75`, except this report file, which the brief asked for.
- Clones and logs remain under `$SCRATCH` (session scratchpad, outside the repo).

Missing tests: none. Every U1-U7 and I1-I12 test named in design 7 exists and passed.

OVERALL: PASS (all B2-B15 blocks, worktree checks, the acceptance criterion and the I7 variant check pass; variant (b) is red for the right reason but also turns I9/I10 red, so it does not isolate I7).

## Re-test after code review round 1

Date: 2026-10-29. Same worktree, HEAD `45396e75`, coder's round-1 fixes uncommitted. Scope: the security FAIL
(`plans/28-db-schema-code-review-1-security.md`, I8b blind to object arguments), its non-blocking note
(`pg.Client` constructed outside the try), and the I7 mutation (b) of design revision 4. Changed files checked:
`packages/db/test/integration/client.int.test.ts` (I8b: `consoleError.mock.calls.flat().map(loggedArgument)`,
`loggedArgument` = a string as is, anything else `inspected`), `packages/db/src/migrate.ts`
(`let client: pg.Client | undefined`, constructed inside the connect-stage try, `await client?.end()` in finally),
`packages/db/test/unit/options.test.ts` (new U5 case, `?sslrootcert=/nonexistent-academy-28/root.crt`). The design
file was read, not edited.

`SCRATCH2` = `$SCRATCH/r2`; new clone C2 = `$SCRATCH2/clone-full.RBjd49/repo` (snapshot commit `16f3ec4`).

### Worktree (authority runs)

| Command | Exit | Key output | Result |
|---|---|---|---|
| `pnpm typecheck --force` | 0 | `Tasks: 3 successful, 3 total`, `Cached: 0 cached, 3 total` | PASS |
| `pnpm test --force` | 0 | lesson-schema `Tests 12 passed (12)`; db `options.test.ts (21 tests)`, `Tests 34 passed (34)` (33 + the new U5 case); `Cached: 0 cached, 3 total` | PASS |
| `pnpm build --force` | 0 | `Tasks: 2 successful, 2 total`, `Cached: 0 cached, 2 total` | PASS |
| `pnpm test:integration --force` | 0 | `Test Files 3 passed (3)`, `Tests 38 passed (38)`, `Cached: 0 cached, 2 total` | PASS |
| `pnpm lint` | 1 | exactly three `format` errors: the pipeline state json, the parked state `1-1793114285.json`, `settings.pipeline-grant.json` (all under `.claude/`); `Checked 42 files`, `Found 3 errors.` All three are `!!` in `git status --porcelain --ignored --untracked-files=all .claude` | PASS (only the three ignored files, as 7.1.0 / S2 predicts) |

### Clone C2

| Step | Command | Exit | Expected | Actual | Result |
|---|---|---|---|---|---|
| B4 full | 7.1 B4 verbatim, `MODE=full`, `SCRATCH=$SCRATCH2` | 0 | install log, `clone full ready` | 230 packages, only the two `lesson-validate` bin WARNs, `clone full ready: .../clone-full.RBjd49/repo`; `cmp` of migrate.ts, client.ts, client.int.test.ts, options.test.ts vs the worktree: identical | PASS |
| B7 | verbatim | 0 | `GREEN OK` | `Checked 39 files ... No fixes applied.`; db unit `Tests 34 passed (34)`; integration `Tests 38 passed (38)`; `GREEN OK`. Turbo: every db task `cache miss` (`test:integration`: `cache bypass, force executing`); the only hits are `lesson-schema:build` replayed from earlier in the same run | PASS |
| B11 positive | verbatim | 0 | `No schema changes...`, `migrations match the schema`, OK | `No schema changes, nothing to migrate 😴`, `migrations match the schema`, `T-drift positive OK` | PASS |
| backup | B11 backup plus copies of `client.ts`, `migrate.ts`, `client.int.test.ts` | 0 | `backup OK` | `backup OK` | - |

Restore after every mutation: the B11 restore extended with `cp` + `cmp` of the three extra files
(`$SCRATCH2/restore.sh`), ending with `[ -z "$(git status --porcelain)" ] && echo restore OK`; every run printed
`restore OK`. I8 file runs: `pnpm --filter @academy/db exec vitest run --config vitest.integration.config.ts --reporter=verbose test/integration/client.int.test.ts`
in C2 (`$SCRATCH2/i8b.sh`). Control (unmutated): `vitest exit=0`, `✓ ... I8 ...`,
`✓ ... I8b logs one line with the code and no connection string by default`, `Tests 2 passed (2)`.

| # | Mutation (Edit tool, in C2) | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | `client.ts`: default listener `(error) => logIdlePoolError(error, pool.options)`; logger `console.error(<same line>, poolOptions)` (one call, so `toHaveBeenCalledTimes(1)` still holds) | I8b red on the canary assertion | `vitest exit=1`; `× ... I8b ...`; `AssertionError: expected '@academy/db: idle pool client error (…' not to contain 'canary-s3cret-28'` at `client.int.test.ts:81:24` (`expect(logged).not.toContain(testPassword())`); the received text includes `connectionString: 'postgres://test:canary-s3cret-28@localhost:55083/t_3101795d405d'`; I8 green | PASS |
| 2 | mutation 1 kept + I8b line 78 `.map(loggedArgument)` -> `.map(String)` (the round-1 rendering) | I8b green (old test blind) | `vitest exit=0`; `✓ ... I8b ...`, `Tests 2 passed (2)` although the log leaks the password | PASS (confirms the security finding: the old test could not fail); `restore OK` |
| 3 | `client.ts`: logger message `... ${error.message} on ${url}`, `connectionString` passed in | I8b red | `vitest exit=1`; `× ... I8b ...`; `Received: "@academy/db: idle pool client error (57P01): terminating connection due to administrator command on postgres://test:canary-s3cret-28@localhost:55087/t_aa3fee84b593"` at `:81:24` | PASS; `restore OK` |
| 4 | `migrate.ts`: `const client = new pg.Client(...)` before `let stage` and the try (comment removed), `await client.end()` in finally | new U5 sslrootcert case red | `pnpm --filter @academy/db exec vitest run --reporter=verbose test/unit/options.test.ts`: `vitest exit=1`; `× ... U5 connect stage > rejects a missing sslrootcert file as stage connect without the password`, `→ expected MigrationError, got Error: ENOENT: no such file or directory, open '/nonexistent-academy-28/root.crt'` at `options.test.ts:79:19`; the refused-connection U5 case and U4 green; `Tests 1 failed | 20 passed (21)` | PASS; `restore OK` |
| 5 | I7 (b): `schema.ts:90` `primaryKey({ name: "lesson_progress_pkey", ... })` -> `unique("lesson_progress_i7_unique").on(t.userId, t.courseId, t.lessonId)`; `0000_init.sql` and `meta/` moved out to `$SCRATCH2/i7b-moved.*`, `pnpm --filter @academy/db run db:generate </dev/null` (exit 0) -> `0000_majestic_blacklash.sql` with `CONSTRAINT "lesson_progress_i7_unique" UNIQUE("user_id","course_id","lesson_id")`, no `lesson_progress_pkey`, three key columns still `NOT NULL`, `attempts_lesson_progress_fk` still referencing them | only I7 red, at the constraint-name check; I9/I10 green | B12 M check call (JSON reporter): `vitest exit=1`, `total=38 failed=1`, failed: `I7 keeps progress unique per user and lesson, but not across courses`; `passed=37 skipped=0`; `passed: I9 deleting a user removes its rows from all five child tables`, `passed: I10 refuses an attempt for a lesson without a progress row`. Failure at `schema.int.test.ts:145:40` (`toEqual({ code: "23505", constraint: "lesson_progress_pkey" })`); a default-reporter rerun of I7 alone shows `-   "constraint": "lesson_progress_pkey",` / `+   "constraint": "lesson_progress_i7_unique",` | PASS: the design's **[unverified]** mutation (b) is now verified live and isolates I7; `restore OK` |

### Cleanup

- C2 after the last restore: `git status --porcelain --untracked-files=all` 0 lines, HEAD `16f3ec4 tester snapshot`.
- Worktree: `git status --porcelain` identical to the snapshot taken before the run; HEAD `45396e75`; `shasum` of every
  `packages/db` file (excluding node_modules, dist, .turbo) identical before and after. Only this report changed.
- `docker ps -a`: empty; `--filter label=academy.workspace`: 0.

Missing tests: none. Not re-run this round (unaffected by the fixes): B2, B3, B5, B6, B8-B10, B11 A/B/C/guard,
B12 M1-M3, B13-B15.

RE-TEST RESULT: PASS (the security FAIL is fixed: I8b goes red on an object leak and on a URL leak, and the old
rendering is proven blind; the U5 sslrootcert case guards the client-construction fix; I7 mutation (b) isolates I7).
