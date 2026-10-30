# #28 code review round 1: operations

Verdict: PASS (no operational issues found)

All live checks ran in a fresh B4-style clone, outside the repo. The clone was built with the design's
verbatim B4 recipe (MODE=full): HEAD 45396e7 plus the pending files, committed once, with a fresh
`CI=true pnpm install --frozen-lockfile`. Path:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-confident-ellis-4d58ed/59ed1263-0af4-4853-9f1c-20456a13f403/scratchpad/clone-full.iPDLJY/repo`.
I edited no repo files except this report.

## 1. CI job `db` (text vs design section 8)
- `git diff main -- .github/workflows/ci.yml`: one hunk, +35 lines, the new `db` job inserted between
  `content` and `pipeline`. `checks`, `content` and `pipeline` are unchanged, and so are the triggers,
  concurrency and permissions.
- The job matches section 8 item by item:
  - `runs-on: ubuntu-24.04`, `timeout-minutes: 15`, and job env `TESTCONTAINERS_RYUK_DISABLED: "true"`.
  - checkout@v4 uses `fetch-depth: 2` and `persist-credentials: false`.
  - The setup steps are pnpm/action-setup@v4 and setup-node@v4 (`.nvmrc`, `cache: pnpm`), then
    `pnpm install --frozen-lockfile`.
  - The append-only step has `if: github.event_name == 'pull_request'`, and `PR_HEAD_SHA` is passed
    through step env, never interpolated into the script.
  - Then the steps run in order: the build of `@academy/db^...`, `db:check`, the drift step (with
    `timeout-minutes: 3` and no condition, so it always runs), then `pnpm test:integration`.
- The job has no path filter, as F7 requires.

## 2. Live runs in the clone (CI=true, Ryuk disabled)
- `turbo run build --filter='@academy/db^...'`: 1 successful, rc=0.
- `db:check`: "Everything's fine", rc=0.
- `bash packages/db/scripts/check-drift.sh`: "No schema changes, nothing to migrate" and then
  "migrations match the schema", rc=0. `git status` stayed clean afterwards.
- `pnpm test:integration`: Test Files 3 passed (3), Tests 38 passed (38), rc=0, 4.6 s wall time. Run
  with Ryuk disabled (as in CI), it left no `org.testcontainers` containers behind
  (`docker ps -a --filter label=org.testcontainers=true` was empty).
- The other CI jobs on the same clone were all rc=0:
  - `pnpm lint`: "Checked 39 files", no errors.
  - `pnpm typecheck`, `pnpm test` and `pnpm build`.
  - `pnpm content:validate`: 6 lessons, 0 issues.
- Append-only, simulated as GitHub's PR merge commit. I checked out `origin/main` (094f573) and ran
  `merge --no-ff` of the snapshot. The merge was clean.
  - Positive: `PR_HEAD_SHA=<snapshot>` printed "applied migrations are append-only", rc=0. Drift on the
      merge commit was also green.
  - Negative: a second "PR" appended a line to `drizzle/0000_init.sql` and was merged the same way. The
    step printed `M packages/db/drizzle/0000_init.sql` and "merged migrations must not be edited...",
    rc=1. So the guard can fail.

## 3. Package shape
- `packages/db/package.json`:
  - `private: true`, `type: module`.
  - exports `.` -> `dist/index.{d.ts,js}`.
  - `engines.node >=22.22`.
  - Scripts: build, typecheck, test (unit), test:integration (separate config with globalSetup),
    db:generate and db:check.
- The package has no `files` field. It is private and consumed through the workspace symlink, so
  `drizzle/` sits beside `dist/`, and `MIGRATIONS_FOLDER` (`new URL("../drizzle", import.meta.url)`)
  resolves from both `src/` and `dist/`. Shipping the folder to bundled consumers is F17, which is
  deferred to #1/#30 by design.
- `turbo.json`: `test:integration.passThroughEnv: ["DOCKER_*", "TESTCONTAINERS_*"]`. No other task
  changed.
- The change adds no environment variables. `drizzle.config.ts` uses no env and no credentials. The test
  image is pinned (`postgres:17.6-alpine`).
- The migration is `0000_init` only, forward-only, on an empty database. Rollback is `git revert`: no
  consumer runs `migrateDatabase` yet, so no database exists to repair.

## 4. Ignored artifacts
- `git check-ignore -v` showed that `.gitignore` covers all three:
  - `.gitignore:17:dist/` covers `packages/db/dist/index.js`.
  - `.gitignore:19:.turbo/` covers `packages/db/.turbo/turbo-build.log`.
  - `.gitignore:16:node_modules/` covers `packages/db/node_modules`.
- The clone's snapshot commit (built from `git ls-files -m -o --exclude-standard`) contains no
  `dist/`, `.turbo`, `node_modules` or `settings.*` paths (grep count 0).

## 5. Git-ignored `.claude` files and lint
- In the worktree, `pnpm lint` is red with 3 format errors. All three are git-ignored files:
  - `.claude/pipeline_state.json`
  - `.claude/pipeline_state.parked/1-1793114285.json` (the parked #1 state)
  - `.claude/settings.pipeline-grant.json`
- Biome is not VCS-aware here. This was the same before this change (the biome.json diff only adds the
  drizzle/meta exclusion).
- A fresh checkout has none of these files, and the clone's lint is green (39 files). CI lint is
  therefore green.
- The parked #1 file is not committed and not modified, because lint is check-only with no `--write`.
- Follow-up suggestion, outside #28: enable `vcs.useIgnoreFile` in Biome so local lint matches CI.

## 6. The `pr` gate
- The last commit today is 45396e7 `chore(deps): rewrite lockfile...`, which has no `#28`. The coder's
  commit(s) must reference `#28`, and the last one must.
- These files must be committed for a clean tree:
  - Modified: `.claude/feedback/architect_mistakes.md`, `.editorconfig`, `.gitattributes`,
    `.github/workflows/ci.yml`, `biome.json`, `docs/architecture.md`, `pnpm-lock.yaml`,
    `pnpm-workspace.yaml`, `turbo.json`.
  - Untracked: `docs/adr/0007-progress-data-model.md` and `packages/db/**` (30 files, with `dist`,
    `.turbo` and `node_modules` ignored).
  - Untracked plans: `plans/28-db-schema.md`, `plans/28-db-schema-research.md`,
    `plans/28-db-schema-design.md`, `plans/28-db-schema-test-report.md`, and
    `plans/28-db-schema-design-review-{1,2,3}-{architecture,operations,security}.md` (9 files).
  - Also the code-review files of this round, `plans/28-db-schema-code-review-1-*.md` (this file
    included), and any `.claude/feedback/*_mistakes.md` the judges append.
- `docs/architecture.md` is modified but was not in the review brief's file list. It is the +1 line
  required by design section 6 ("DB schema and progress data model: ADR-0007"), so it must be committed
  too.
- Main has moved to 094f573 (#58, which touches only CLAUDE.md and orchestrator_mistakes.md).
  `git merge-base --is-ancestor main HEAD` gives 1. The bring-up procedure (step 2, `git merge main`)
  should run before the PR. The merge was clean in the clone.

## Notes (non-blocking)
- `plans/28-db-schema-design-review-2-architecture.md` has 3 lines with trailing whitespace
  (`git diff --check`). It is a pipeline file and not linted.
- Two things stay **[verify on this PR's first CI run]**, as the design says: the real
  `refs/pull/N/merge` parent order at depth 2, and testcontainers on the GitHub runner.
