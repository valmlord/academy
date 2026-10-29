# #28 db schema v1: design review round 3, architecture

Judge: judge-architecture. Input: `plans/28-db-schema-design.md` (revision 3, all 1479 lines), my round-2
report, the round-2 operations and security reports, `.claude/feedback/judge_mistakes.md`,
`.claude/feedback/design_review_genuine.md`, `.claude/pipeline_state.json`.

## Process

`pipeline_state.json`: PROJECT / `judge_design`. Six votes so far, all `source: "hook"`, none inline. Nine
judge spawns are registered (three per round, including this round). Round 2 took 2-10 min per judge. No
orchestrator issue.

## Round-2 conditions

### C1 READ COMMITTED + separate completion statement: folded in

4.9 "Isolation and statement order" (lines 523-534) fixes the order: (1) results + attempt final,
(2) `SELECT ... FOR NO KEY UPDATE` on the progress row, (3) the completion query as a separate statement
after (2) returns, (4) the update. It names READ COMMITTED and rules out REPEATABLE READ, SERIALIZABLE and
a lock-and-aggregate CTE, with the reason. F23 (192), ADR item 5 (1337-1341) and section 11 backlog 08
(1433-1435) say the same. "Atomic finish" (520-522) and the completion rule (538-543) now point at step (3).

### C2 `FOR NO KEY UPDATE`: correct. I walked the lock table

Postgres row-lock conflicts: `FOR KEY SHARE` conflicts only with `FOR UPDATE`. `FOR NO KEY UPDATE`
conflicts with `FOR SHARE`, `FOR NO KEY UPDATE` and `FOR UPDATE`.

- **Two finishers of one lesson (attempts A1, A2).** Both take `FOR NO KEY UPDATE` on the same
  `lesson_progress` row. That lock conflicts with itself, so the second one waits until the first
  commits. I checked three orderings:
  - T2 waits in (2). After T1 commits, the locking SELECT re-reads the latest row version (EvalPlanQual).
    T2's step (3) takes a new snapshot that contains T1's results and T1's final attempt status.
  - T1 runs (1)-(4) and commits before T2 reaches (2). T2 does not wait, and its (3) snapshot already
    contains T1's commit.
  - T1 completed the row. T2 sees `completed` in (2), and stickiness makes (4) a no-op.

  In every case the last finisher to commit evaluates the union of both result sets. F23 holds.
- **Deadlock.** Step (1) locks only the finisher's own rows:
  - The UPDATE of its own `attempts` row changes no key column. Postgres runs no RI check on the
    referencing side when the FK columns are unchanged, so nothing on `lesson_progress` is locked.
  - The `check_results` inserts take `FOR KEY SHARE` on that same, own attempt row.

  Two finishers therefore hold disjoint rows before (2). After (2) they need nothing else, because (3) is
  a plain SELECT and (4) updates the row they already hold. There is no cycle.
- **FK checks from inserts.**
  - A new `attempts` insert takes `FOR KEY SHARE` on the parent `lesson_progress` row. That does not
    conflict with `FOR NO KEY UPDATE`, so starting an attempt never waits for a finisher, as 4.9 says.
    With the round-1 `FOR UPDATE` it would wait.
  - `check_results` and `mentor_reviews` inserts reference `attempts`, not `lesson_progress`. They take
    `FOR KEY SHARE` on an attempt row. That conflicts with nothing a finisher of another attempt holds.
    On the finisher's own attempt it waits only until that finisher's short transaction ends.
  - The step (4) UPDATE changes `status`, `completed_at` and `updated_at`. None of them is in a unique
    index, so Postgres takes `FOR NO KEY UPDATE` for it too, which matches the explicit lock.
- **"Mark as done"** (theory lessons) also updates the progress row non-key, so it serializes with
  finishers. It is refused for lessons with checks anyway.

### C3 workspace API requirement: folded in

4.10 (582-587) states the requirement on backlog 05: return per-check results, mentor output with its
cost, and the transcript path to `apps/web`. It says explicitly that architecture.md does not draw the
relay today. ADR item 8 (1348-1352) and section 11 (1428-1430, a separate backlog 05 bullet) match it.

### C4 error marking + startup sweep: folded in

F16 (185):
- (a) When the service stream ends without a result (closed, errored or timed out), `apps/web` marks the
  attempt `error` with `finished_at`. This satisfies `attempts_finished_check`.
- (b) A startup sweep marks every `running` attempt `error`.
- The one-web-process assumption is stated, with "owner/heartbeat column first (additive)" for multiple
  instances.
- The owner is backlog 08, in `apps/web`. The consequences (1364-1365) and section 11 (1433-1435) match.
- The round-2 remnant ("The sweep belongs to backlog 08", written as if the runner wrote to the DB) is
  gone.

### C5 zero-lesson display and module status: folded in

The 4.9 dashboard text (554-565) now defines the zero case and module status.

Zero case:
- A course with 0 counted lessons shows no percentage. It never shows `0/0`, `NaN` or `0%`.
- The same holds for a module.

Module status:
- `completed`: at least one counted lesson, and all counted lessons are completed.
- `in-progress`: any counted lesson has a row, and the module is not completed.
- `not started`: otherwise.

I walked the corners:
- 0 lessons: no status.
- All completed: `completed`.
- One row, `in-progress`: `in-progress`.
- No rows: `not started`.
- Only orphan rows (lessons removed from the course tree): `not started`, because orphans are not counted
  lessons.

Two checks against the rest of the design:
- The numerator and the denominator use the same counted set, so the percentage stays at or below 100%.
- ADR item 5 mentions both the zero corner and the module status.

### N1-N3: folded in

- **N1.** 4.7 (446-449) uses the "another migrateDatabase may hold it" message only for 55P03. Every other
  lock failure gets `failed while waiting for the migration lock (<code>)`. The new I5 mutation (d)
  distinguishes the two.
- **N2.** See the next section.
- **N3.** U4 (798) passes `"500"` and `10n` with `// @ts-expect-error` and a stated reason. Both values
  are not `number`, so the directive is valid; an unused one would itself fail typecheck.

## Revision-3 additions, checked for new defects

**`InvalidMigrationsFolderError` / U7.**
- Placement:
  - It is the third validator in step 1 of 4.7, before any I/O.
  - It is a pure function exported from `src/migrate.ts`, not from `index.ts`. The package `exports` map
    has only `.`, so it does not become public API.
- What it rejects:
  - `path.isAbsolute` is false for `""`, `drizzle` and `./drizzle`, so all three are rejected.
  - A non-string prints only its `typeof`.
- The default needs no validation:
  - When the option is omitted, `MIGRATIONS_FOLDER` is used without the check.
  - U2 asserts that the default is absolute.
  - I1's mutation (`new URL("./drizzle", ...)`) still produces an absolute path, so it still reaches stage
    `apply` as the design says.
- U7 tests:
  - The "remove the check" mutation turns red, because port 1 refuses and the error becomes
    `MigrationError` stage `connect`.
  - U7 lives in `options.test.ts` (row 742) and is Docker-free.
- Consistent everywhere else:
  - `errors.ts` "five error classes": the four `Invalid*` errors plus `MigrationError`, so five.
  - Also mentioned in 4.11 (603), F17 (186) and ADR item 9 (1356-1357).

**The `POSTGRES_TEST_IMAGE` constant.**
- Section 6 row 743: it is the only occurrence of the literal in `global-setup.ts`.
- The F9 line interpolates `<image>` from the constant, so B10's `sed` changes both what is pulled and what
  is printed.
- B10 asserts `grep -c ... = 1` before editing.
- Section 2 (162) explains, with a reason, why there is no env knob. It is a test-only literal, not
  configuration that ships.

**One test per I11 case.**
- Titles are built by concatenation, so `%2e%2e/x` is never read as a printf token.
- The exact red sets for M1, M2 and M3 match the round-2 operations measurements, case by case.
- M2 and M3 accept every value the real pattern accepts (they only drop anchors). For M1, NULL and the
  accept values all pass `<> ''`/`NOT LIKE`. So no accept test can turn red, and "every other test stays
  green" holds.
- Mutating the CHECK makes generate write `0001_*.sql`. I1 compares the row count with the journal entry
  count rather than a fixed 1, so I1 stays green with two migrations. No other integration test counts
  migrations.
- The B12 control run (`failed=0`, `N > 0`) is what gives an empty failure list meaning.

**Clone C: does it still test what ships?** Yes.
- What the clone contains:
  - C is `HEAD` (the step-0 commit, i.e. `main` plus the lockfile) plus every modified and untracked,
    non-ignored worktree file (`git ls-files -m -o --exclude-standard`), committed once.
  - That is exactly the file set the PR will commit.
  - Git-ignored files (`node_modules`, `dist`, `.turbo`, pipeline state) are excluded. CI does not see them
    either.
- The PR merge commit in CI is the same tree, because `main` is `HEAD^`.
- The `cmp` checks prove the copy.
- A deleted tracked file would make `tar` fail loudly instead of silently diverging, and none is expected.
- Pipeline files (`plans/*`, `.claude/feedback/*`) are also in C. The PR commits them too, so C matches
  CI and does not widen what is checked.
- Every mutation and restore happens in C. The coder's uncommitted diff is never touched.
- B7 builds lesson-schema `dist/` before B9-B14 need it.
- Remaining gap: a coder edit made after the tester's clone is not tested. That is ordinary pipeline order
  (re-test after any fix), and section 10 step 6 says a fresh clone picks up later fixes.

**Stale-text sweep.**
- I searched for `FOR UPDATE`, `FOR KEY SHARE`, `REPEATABLE`, `DOCKER_HOST`, `check runner crashes`,
  `charCodeAt` and `T-sep`.
- No bare `FOR UPDATE` is left. `DOCKER_HOST` appears only in the changelog and in section 2's rejected
  alternative.
- F9, the T-sep row, B10 and the register agree on the image-tag negative.
- F16, the consequences and section 11 agree on `apps/web` as the sweeper.
- The I11 sets match between section 7, B12 and the register.

## Files and LOC

The handwritten total from section 6 is about 1,560 lines:
- 40 + 12 + 12 + 5 + 15 config.
- 438 src.
- 50 scripts.
- 220 unit tests.
- 525 integration tests and fixtures.
- 49 for root config and CI.
- 191 ADR and architecture.md.

That is up about 80 from round 2: `migrate.ts` 95, `errors.ts` 55, `options.test.ts` 90, the ADR 190.
PROJECT tier fits. `migrate.ts` at 95 lines (three validators, three stages, cause-chain code walk, two
lock messages, constants) is plausible. Every module named in 4.7 has a file row.

## Non-blocking notes for backlog 08 (carry into ADR-0007 wording if cheap)

- **R3-N1 (F16 vs F2).** F2 admits overlapping web processes during a dev restart. F16(b) assumes one. In
  the overlap, the new process's sweep marks the old process's in-flight attempt `error`, and the old
  process then finishes it. Backlog 08 should decide whether the finish UPDATE overwrites `error` (the
  more accurate outcome) or is guarded by `status = 'running'`. Either way the result rows still count
  toward completion, because the rule counts `passed` results of any finished attempt. Not a defect in
  this PR: no writer exists in v1.
- **R3-N2 (4.9 step 4).** Write the update as `... WHERE status = 'in-progress'`, or skip it when the row
  read in (2) is already `completed`, so stickiness and the first `completed_at` follow from the
  statement itself and do not depend on the caller remembering.
- **R3-N3 (C1).** Backlog 08 may pass `isolationLevel: "read committed"` to `db.transaction` explicitly,
  so a changed `default_transaction_isolation` on the server cannot silently break F23.

## Verdict

PASS - no architecture issues found. C1-C5 and N1-N3 are folded in correctly. `FOR NO KEY UPDATE`
still serializes finishers and does not conflict with the FK checks of attempt, check-result or
mentor-review inserts. The revision-3 additions introduce no new defect, and no stale statement remains.

PASS
