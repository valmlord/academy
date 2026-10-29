# #28 design review, round 1: operations judge

Reviewed: `plans/28-db-schema-design.md` (full), `plans/28-db-schema-research.md`, and the current
`.github/workflows/ci.yml`, `turbo.json`, `biome.json`, `pnpm-workspace.yaml`, `.editorconfig`,
`.gitattributes`, `package.json`, `.nvmrc`, `packages/lesson-schema/*`, `tsconfig.base.json`.
Feedback loaded: `judge_mistakes.md`, `agent_roles_mandatory.md`, `orchestrator_mistakes.md` (#26 lesson).

Every live check ran in a scratch directory outside the repo
(`$TMPDIR/op28.EJO9vE`: a scratch pnpm workspace, a `git clone` of this worktree with a minimal
`packages/db`, and throwaway `postgres:17.6-alpine` containers, since stopped). No repo file except this
report and `.claude/feedback/architect_mistakes.md` was touched. Tools: pnpm 10.28.0, Node 22.23.1,
turbo 2.11.10, Docker 29.7.2, drizzle-orm 0.45.4, drizzle-kit 0.31.11, testcontainers 12.2.1.

## Verdict summary

Two blocking issues:
1. The drift step can report green when the schema has drifted. Section 3 also gets the failure
   mechanism wrong (F8).
2. One prescribed tester check (T-install) can never succeed on correct work.

Everything else the brief asked about held up when run live. Details follow.

## Blocking

### B1. [design 3 F7/F8, 7 T-drift, 8 step 6] A rename drifts the schema and the drift step still reports green

The design says (F8) that a rename prompt in non-TTY CI "hangs" and that `timeout-minutes: 3` turns it
red. That is not what drizzle-kit 0.31.11 does. It prints an error, writes nothing and **exits 0**.
`git status` is then empty, so step 6 reports success on a schema that has no migration. `db:check` does
not catch it either, because it validates the migration folder, not schema against migrations.

Ran (scratch clone; `check_kind` renamed to `kind_of_check` in `schema.ts`, no migration, stdin `/dev/null`):

```
Error: Interactive prompts require a TTY terminal (process.stdin.isTTY or process.stdout.isTTY is false). ...
    at promptColumnsConflicts (.../drizzle-kit@0.31.11/.../bin.cjs:32711:65)
exit=0                                   # pnpm run db:generate
direct drizzle-kit exit=0                # node_modules/.bin/drizzle-kit generate
--- status after rename generate:
[end]                                    # git status --porcelain: empty
Everything's fine                        # drizzle-kit check, exit=0
```

Scope: any change that drizzle-kit treats as ambiguous falls through. That covers a column or table
rename, and a drop plus an add in the same table. The integration tests catch it only when they happen
to touch the renamed column.

Required fix. The step must assert the positive outcome, not only the exit code and a clean tree. I ran
this version both ways:

```bash
set -uo pipefail
out=$(pnpm --filter @academy/db run db:generate </dev/null 2>&1); code=$?
status=$(git status --porcelain --untracked-files=all -- packages/db/drizzle)
if [ $code -ne 0 ] || ! printf '%s' "$out" | grep -qF "No schema changes, nothing to migrate" || [ -n "$status" ]; then
  printf '%s\n' "$out" "$status"; echo "schema.ts changed without a migration: run db:generate and commit the result"; exit 1
fi
```

Results: rename case `exit=1` with the message. Unchanged schema `drift OK`, `exit=0`. Also rewrite
F8: no hang, an error with exit 0. Keep the step timeout as a backstop. T-drift must add this rename case
as a second negative run, next to "add a nullable column".

### B2. [design 7 T-install] "git diff --stat pnpm-lock.yaml shows only additions" cannot succeed

The committed `pnpm-lock.yaml` is not in pnpm's native format. It uses double quotes, flow mappings and
multi-line `resolution: {}` blocks, so it was reformatted by an external tool at some point. pnpm leaves
it alone while nothing changes. A plain `pnpm install` in a fresh clone of this worktree rewrote nothing.
As soon as dependencies change, pnpm rewrites the **whole file** in its own style:

```
# scratch clone + packages/db deps + allowBuilds, plain `pnpm install`
 pnpm-lock.yaml | 3597 ++++++++++++++++++++++++++++++++++++++++----------------
 1 file changed, 2612 insertions(+), 985 deletions(-)
-lockfileVersion: "9.0"          (new file: lockfileVersion: '9.0')
```

So the tester gets a red result on correct work. The coder may also be pushed to "fix" the lockfile by
hand or with a formatter, and the code-style rules forbid both. Required fix:
- Split the lockfile change into two commits. The first commit is a format-only rewrite, made before any
  dependency changes, with the message `chore(deps): rewrite lockfile in pnpm's native format`. Running
  `pnpm install --lockfile-only` with no dependency change does produce it. Verified in a fresh clone of
  this worktree:
  - The diff is `547 insertions(+), 937 deletions(-)`.
  - The set of package keys is identical (135 = 135, `diff` empty).
  - The 131 `integrity` values are identical.
  - `CI=true pnpm install --frozen-lockfile` reports "Done" afterwards.
- With that commit in place, the dependency commit's lockfile diff really is additions only, and
  T-install's existing criterion becomes valid against the format commit. T-install should also require
  that `pnpm install --frozen-lockfile` succeeds in a fresh `git clone` of the branch.

Also expect this new warning on every fresh install, CI included. It is not a peer warning and is
harmless; T-install should name it so the tester does not report it:
`WARN Failed to create bin at .../packages/db/node_modules/.bin/lesson-validate ... lesson-schema/dist/cli.js`
(the lesson-schema bin points into `dist/`, which does not exist before the build).

## The [verify] items, run live

### (a) pnpm 10.28 `allowBuilds` as written: confirmed

The `pnpm-workspace.yaml` block `allowBuilds: { cpu-features: false, esbuild: false, protobufjs: false,
ssh2: false }`, with the full stack (drizzle-orm, pg, drizzle-kit, @testcontainers/postgresql, vitest,
tsx):
- As designed: no "Ignored build scripts" line. `.modules.yaml` `ignoredBuilds: []`.
  `pnpm config get allowBuilds` echoes the map.
- Negative run without the block: `Ignored build scripts: cpu-features@0.0.10, esbuild@0.18.20,
  esbuild@0.25.12, esbuild@0.28.2, protobufjs@7.6.6, ssh2@1.17.0.`
- Partial block (`esbuild: false` only): the warning drops all three esbuild versions and still lists
  `cpu-features@0.0.10, protobufjs@7.6.6, ssh2@1.17.0`. So a bare name covers every version.
- The lockfile does not record `allowBuilds` (its `settings:` block has only `autoInstallPeers` and
  `excludeLinksFromLockfile`). `CI=true pnpm install --frozen-lockfile` afterwards: "Already up to date".

### (b) turbo 2.11 `passThroughEnv` with wildcards: confirmed

The probe task printed env inside `turbo run test:integration` (strict mode):
```
with    ["DOCKER_*","TESTCONTAINERS_*"]: {"r":"true","d":"unix:///x","h":"h","db":null}
without:                                 {"r":null,"d":"unix:///x","h":null,"db":null}
```
`TESTCONTAINERS_RYUK_DISABLED` and `TESTCONTAINERS_HOST_OVERRIDE` pass only with the wildcard.
`DOCKER_HOST` passes either way (turbo's built-in list). `DATABASE_URL` is filtered, which is correct
because the package reads no env.

### (c) Postgres 17.6 `lock_timeout` vs `pg_advisory_lock`: applies (F3 holds, I5 is sound)

Two sessions on `postgres:17.6-alpine`. Session A held `pg_advisory_lock(28280001)`:
```
B: set lock_timeout = 500; select pg_advisory_lock(28280001)
ERROR:  55P03: canceling statement due to lock timeout        (0.56 s, exit 1)
control B: set statement_timeout = 3000 (no lock_timeout)
ERROR:  canceling statement due to statement timeout           (3.09 s)
```
I also ran the exact `migrateDatabase` shape with drizzle-orm 0.45.4: one `pg.Client` with
`application_name=academy-migrate`, `SET lock_timeout`, `pg_advisory_lock`,
`migrate(drizzle(client), ...)` and `client.end()` in `finally`.
- First run migrated. Second run no-op, `__drizzle_migrations` has 1 row (I1/I2).
- Concurrent: while A held the lock, `pg_locks JOIN pg_stat_activity` showed `academy-migrate|t`. B with a
  2 s timeout got `DatabaseError 55P03`, and A finished `migrated` (I3/I5 observable as designed).
- Broken fixture (`CREATE TABLE broken_probe; SELECT 1/0`) on a fresh DB: `DrizzleQueryError` whose
  `cause` is `DatabaseError` with code `22012`. Afterwards `to_regclass('broken_probe') is null` = t and
  the journal has 0 rows (F1/I4 confirmed). This also settles the 4.7 [verify]: Drizzle 0.45 wraps driver
  errors, so `sqlState()` must walk `cause`.

### (d) PR append-only guard: logic correct

I built a scratch origin with `refs/pull/1/merge`: a `git commit-tree -p main -p pr` merge commit, so
parent 1 is the base tip and parent 2 is the PR head. Main had moved on after the branch was cut. I then
fetched it the way `actions/checkout@v4` does
(`git fetch --depth=2 +refs/pull/1/merge:refs/remotes/pull/1/merge`, shallow, 3 commits present) and ran
the step script as the design describes it:
```
add (new 0001_b.sql + snapshot)  -> append-only OK, exit=0
edit 0000_a.sql                  -> M  packages/db/drizzle/0000_a.sql, exit=1
delete 0000_a.sql                -> D  ..., exit=1
rename 0000_a.sql                -> R100 ..., exit=1
edit meta/0000_snapshot.json     -> M  ..., exit=1
wrong PR_HEAD_SHA                -> "expected the pull request merge commit ...", exit=1
```
`fetch-depth: 2` is enough: both parents are present. On this PR's first run the folder is new, so it
shows up as additions only and the step passes.

### (e) Drift step: works for the cases it was written for, but see B1

In the scratch clone with a minimal `packages/db` (one table, two named CHECKs built through a
`sql.raw` IN-list helper):
- `pnpm exec turbo run build --filter='@academy/db^...'`: 1 task, lesson-schema `dist/` built.
- `pnpm --filter @academy/db run db:generate --name init`: wrote `drizzle/0000_init.sql`. The SQL contains
  literal named CHECKs:
  `CONSTRAINT "attempts_check_kind_check" CHECK ("attempts"."check_kind" IN ('quiz', 'command', 'rubric', 'hidden-task', 'bug-hunt'))`.
  drizzle-kit (tsx) resolved `@academy/lesson-schema` to `dist/`.
- After commit: `db:check` gives "Everything's fine" (exit 0). `db:generate` gives "No schema changes,
  nothing to migrate". `git status --porcelain --untracked-files=all -- packages/db/drizzle` is empty.
- Negative, nullable column added: `M meta/_journal.json`, `?? 0001_*.sql`, `?? meta/0001_snapshot.json`.
- Negative, CHECK value list changed (`ATTEMPT_STATUSES` plus one value): drizzle-kit 0.31.11 emits
  `ALTER TABLE "attempts" DROP CONSTRAINT "attempts_status_check"; ... ADD CONSTRAINT ... IN (..., 'cancelled')`
  and the step goes red. This answers the architecture judge's open point: a changed CHECK body is
  detected, so a new lesson-schema kind does turn the step red.
- Negative, rename: false green (B1).

### Other items confirmed along the way

- 4.4 [verify]: `Check.options.map((o) => o.shape.kind.value)` typechecks with `tsc` 7.0.2 under the
  repo's `tsconfig.base.json` without `as`. `typecheck exit=0`, and the built `CHECK_KINDS` is
  `[ 'quiz', 'command', 'rubric', 'hidden-task', 'bug-hunt' ]`. The fallback into Stepan's file is not
  needed.
- T-dist: after `pnpm build`, the exact command
  `node --input-type=module -e "const m = await import('./packages/db/dist/index.js'); ..."` from the
  root prints `<clone>/packages/db/drizzle`.
- T-biome: with the design's `"!packages/db/drizzle/meta/**"` line, `biome check .` reports "Checked 22
  files ... No fixes applied", exit 0. Without the line, it fails on `drizzle/meta/0000_snapshot.json` and
  `drizzle/meta/_journal.json`, exit 1.

## Static review (not blocking unless noted)

- **CI job (section 8).** ubuntu-24.04 has Docker (the `compose` job already uses it). Job timeout 15
  min, and the test run takes about 13 s locally plus the image pull. `cache: pnpm`,
  `--frozen-lockfile`, `PR_HEAD_SHA` passed through env (no script injection), and top-level
  `permissions: contents: read` is inherited. On `push` to main step 3 is skipped correctly. Ryuk disabled
  only in CI is right: the VM is discarded.
- **Turbo.** `test:integration` keeps `cache: false` and `^build`. The new `passThroughEnv` is verified
  in (b).
- **.editorconfig / .gitattributes.** `unset` is a valid EditorConfig value, and the `linguist-generated`
  line does not interfere with `* text=auto eol=lf`. drizzle-kit writes tab-indented SQL and a journal
  without a final newline. Both stay untouched under these rules, and the append-only step backs this up.
- **Failure modes.**
  - Mid-run failure, concurrent migrate and lock timeout: verified live, (c).
  - Process killed: the session-level lock drops when the session ends (Postgres semantics, F4).
  - Docker missing: F9's message plus T-sep.
  - Container startup timeout: testcontainers' 120 s default inside the job timeout. No retry is fine.
- **N1 (minor, 4.7).** Section 4.7 still says `MigrationError` "says the transaction was rolled back" for
  every error. A lock timeout (55P03 from `pg_advisory_lock`, before any transaction) and a connect
  failure are different stages. Name the stage in the message. The architecture judge raised the same
  point.
- **N2 (minor, 8 step 3).** If someone sets `fetch-depth` back to 1, `HEAD^2` is missing and the guard
  prints "expected the pull request merge commit with the PR head as second parent", which misleads.
  Add "(is actions/checkout fetch-depth >= 2?)" to the message.
- **N3 (minor, T-env).** "With Ryuk images cleared first" is the wrong precondition. `docker ps` lists
  containers, not images, and testcontainers 12.2.1 *reuses* any running Ryuk container
  (`findReaperContainers` in `reaper.js`), so a Ryuk container left from an earlier local run makes the
  positive check print an id. Correct precondition:
  `docker ps -a -q --filter label=org.testcontainers.ryuk=true` prints nothing (wait about 10 s after the
  last local run, or remove that container). Use the same label filter in the assertions.
- **N4 (minor, F6).** `meta/_journal.json` is excluded from the append-only diff, which is necessary
  because every migration appends to it. Editing an *existing* entry's `when` is therefore unguarded, and
  U1 only checks that the values increase. The residual risk is low; mention it in ADR-0007 next to the
  direct-push residual.
- **Rollback.** Reverting the PR leaves nothing behind, because no persistent DB is migrated. With B2,
  the revert also restores the old-format lockfile, which is fine.

## Attribution

Both blocking issues are in the design: the architect had no shell, and the [verify] markers did not
cover these two claims. The lesson is appended to `.claude/feedback/architect_mistakes.md`.

FAIL
