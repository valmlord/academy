# #28 design review, round 3 (final): operations judge

Reviewed: `plans/28-db-schema-design.md` (revision 3, all 1478 lines), my round-1 and round-2 reports, the
round-2 security and architecture reports, `.claude/feedback/judge_mistakes.md`, `agent_roles_mandatory.md`,
`orchestrator_mistakes.md`, `.claude/agents/dev/tester.md` (tool list).

## How it was run

Everything ran in the session scratchpad
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-confident-ellis-4d58ed/59ed1263-0af4-4853-9f1c-20456a13f403/scratchpad`
(below: `$SP`). The only repo file written is this report. The main checkout was not touched. Tools: pnpm
10.28.0, Node 22.23.1, Docker 29.7.2, Biome 2.6.3, vitest 5.0.5, drizzle-kit 0.31.11, bsdtar 3.5.3.

I rebuilt the state the pipeline leaves (7.1.0) instead of starting from a clean clone:

1. `$SP/origin`: a clone of this worktree's `main` (8d47a4a), and a **linked worktree** `W` at
   `$SP/origin/.claude/worktrees/wt` on a new `feat/28-db-schema` branch. This is the real layout.
2. In W: the review files copied into `plans/`, a line appended to `.claude/feedback/architect_mistakes.md`,
   then a plain `pnpm install` on the old-format lockfile. `node_modules/.modules.yaml` then lists
   `ignoredBuilds: - esbuild@0.28.2`, the same as in this worktree.
3. B1 verbatim (step-0 coder), then the step-0 commit typed exactly as in section 10.
4. The coder's uncommitted work:
   - A scratch `packages/db` shaped per sections 4-7: six tables with every section-5 constraint name, the
     4.5 regex, the guarded `inList`, five error classes, staged `migrateDatabase` with `set_config`,
     `check-drift.sh` written to the section 6 row, `check-append-only.sh` written to section 8 step 3,
     `global-setup.ts` with the `POSTGRES_TEST_IMAGE` constant and the F9 `console.error`.
   - Tests: U2/U3/U4 subsets; integration I1, I5 and I11 (four non-transcript cases, plus the 11 reject and
     4 accept transcript tests built in a `for` loop with exactly the 7 I11 titles).
   - The 4.8 edits to `biome.json`, `turbo.json`, `.editorconfig`, `.gitattributes`, `pnpm-workspace.yaml`,
     a `db` job stub in `ci.yml`, `docs/architecture.md` and an ADR stub.
   - Then the resolving `pnpm install`, `db:generate --name init`, and every root command, so W also has a
     turbo cache and a live Ryuk container.
5. A badly formatted git-ignored JSON (`coverage/x.json`). The hook blocks any shell command that names the
   pipeline state or grant file, even a scratch copy, so for those two files I measured the real worktree
   directly (read-only `pnpm lint`, below).

Then I ran every tester block B2-B15, verbatim, from W with `WT=W` and `SCRATCH=$SP/s`, in the 7.1.1 order.
B1 ran as the step-0 coder.

## Command results

| Block | Exit | Output excerpt | Matches the design |
|---|---|---|---|
| Coder step 1 resolving install (W) | 0 | `WARN 3 deprecated subdependencies found: @esbuild-kit/core-utils@3.3.2, ...`, two `Failed to create bin ... lesson-validate` lines, `Ignored build scripts: esbuild@0.28.2.`; Myers numstat `2041 24` | yes (4.8, 10 step 1, F24) |
| Coder step 2 generate | 0 | `6 tables`, `0000_init.sql`; `grep -cF` of the 4.5 pattern = 1; all 26 constraint names as in section 5 (the FKs I did not name got drizzle defaults) | yes |
| Coder `pnpm lint` in W | 1 | `coverage/x.json format`, `Found 1 error.` (only the ignored file) | yes (S2) |
| `check-drift.sh` in W | 1 | `?? packages/db/drizzle/0000_init.sql` ..., `schema.ts changed without a migration ...` | yes, red by design (S1) |
| **B1** T-lockfile over a populated `node_modules` | 0 | 131 = 131 integrity lines; frozen install: `Lockfile is up to date, resolution step is skipped`, `Already up to date`, stale `Ignored build scripts: esbuild@0.28.2.`; `T-lockfile OK` | yes. [verify-live] settled: **no purge prompt** |
| step-0 commit (section 10 command) | 0 | `1 file changed, 547 insertions(+), 937 deletions(-)`; body ends `Refs #28` | yes |
| **B2** | 0 | `T-lockfile-commit OK` | yes. Negative: on `main` (0 commits ahead) exit 1 |
| **B3** | 0 | `2017	0	pnpm-lock.yaml`, `T-lockfile-additions OK` | yes. The awk exits 1 on an empty numstat and on `2041 24` |
| **B4** `MODE=full` | 0 | install log with the `lesson-validate` WARN, `clone full ready: .../s/clone-full.4dImCR/repo` | yes. bsdtar `--null -T -` works; `--branch` pins the clone of a *linked* worktree; `.modules.yaml` `ignoredBuilds: []`; `coverage/x.json` not copied |
| **B5** | 0 | `T-install OK` | yes ([verify-live] frozen spelling settled) |
| **B4** `MODE=noallow` | 0 | `clone noallow ready: ...`; `pnpm-workspace.yaml` keeps exactly the `packages:` block | yes, the awk filter removes exactly the 4.8 block |
| **B6** | 0 | `│   Ignored build scripts: cpu-features@0.0.10, esbuild@0.18.20,  │`, `T-install negative OK` | yes. pnpm's box wraps the list over two lines; the grep only needs the first fragment. B5's assertion is red on this log, so the pair distinguishes |
| **B7** | 0 | `Checked 34 files`, the first turbo run `Cached: 0 cached`, db unit 13 passed, integration 21 passed, `GREEN OK` | yes |
| **B8** line | 0 | `T-biome line OK` | yes |
| **B8** negative | 0 | `lint exit=1`, `restore OK`, `T-biome negative OK`; the log names `drizzle/meta/0000_snapshot.json` and `drizzle/meta/_journal.json`, `Found 2 errors.` | yes (no config parse error) |
| **B9** | 0 | `<clone>/packages/db/drizzle`, `T-dist OK` | yes |
| **B10** positive, as written | **1** | vitest 5.0.5 non-TTY default reporter prints only `Test Files 2 passed (2)` / `Tests 13 passed (13)`, no file paths, so `grep -q "test/unit/"` fails | **no**: red on correct work. The design's own [verify-live] fallback covers exactly this case, see note 1 |
| **B10** positive, design fallback (`run test --reporter=verbose`) | 0 | `✓ test/unit/vocabulary.test.ts > inList > ...`, `T-sep positive OK` | yes |
| **B10** negative | 0 (inner `test:integration exit=1`) | `restore OK`; `@academy/db test:integration: could not start the Postgres test container (postgres:0.0.0-nonexistent). Is Docker running? Cause: (HTTP code 404) unexpected - failed to resolve reference "docker.io/library/postgres:0.0.0-nonexistent": ... not found`; `T-sep negative OK`; the log also has `TypeError: code.charCodeAt is not a function` | yes. The F9 line is exact, and `pnpm --filter ... run` propagates exit 1 |
| **B11** positive | 0 | `Everything's fine`, `No schema changes, nothing to migrate`, `migrations match the schema`, `T-drift positive OK` | yes, both literals on green |
| **B11** backup / restore (x6) | 0 | `backup OK`; `restore OK` after A, B, guard, M1, M2, M3 | yes |
| **B11** A (nullable column) | 1 | ` M .../meta/_journal.json`, `?? .../0001_mighty_ulik.sql`, `?? .../meta/0001_snapshot.json`, `drift exit=1` | yes |
| **B11** B (`cancelled`) | 1, then 0 | `drift exit=1`; `DROP CONSTRAINT "mentor_reviews_status_check"`, `ADD CONSTRAINT ... IN ('pending', 'completed', 'error', 'cancelled')`, `B OK` | yes (a changed CHECK is red) |
| **B11** C (rename) | 1 | `Error: Interactive prompts require a TTY terminal ...`, `drift exit=1`, empty status | yes (a rename is red) |
| **B11** guard mutation | 0 | `migrations match the schema`, `drift exit=0` | yes: the literal is what catches C |
| **B12** control | 0 | `vitest exit=0`, `total=21 failed=0`; titles in the JSON keep `%2e%2e/x`, `a\b`, `a<LF>b` literally | yes ([verify-live] settled: the `testResults[].assertionResults[].title/status` shape and `--outputFile` work in vitest 5.0.5) |
| **B12** M1 | gen 0, vitest 1 | `failed=8`: `%2e%2e/x`, `.`, `..`, `a/..`, `a/../b`, `a//b`, `a<LF>b`, `a\b` | exactly the design set |
| **B12** M2 | gen 0, vitest 1 | `failed=7`: `%2e%2e/x`, `../a`, `/abs`, `a/../b`, `a//b`, `a<LF>b`, `a\b` | exactly the design set |
| **B12** M3 | gen 0, vitest 1 | `failed=5`: `a/..`, `a/../b`, `a//b`, `a<LF>b`, `a\b` | exactly the design set |
| **B13** none / edit / delete / rename / snapshot / wrongsha / nomerge | 0 / 1 / 1 / 1 / 1 / 1 / 1 | `applied migrations are append-only`; `M 0000_a.sql`; `D 0000_a.sql`; `R100 0000_a.sql 0000_z.sql`; `M meta/0000_snapshot.json`; the fetch-depth message twice | yes. The harness accepted the block, so the `mv` spelling of `delete` works |
| **B14** positive (no Ryuk present) | 0 | `T-env positive OK` | yes |
| **B14** negative | 0 | `0efce9bdb4d0`, `T-env negative OK` | yes |
| **B14** positive right after the negative | 0 | Ryuk gone within about 10 s (18:38:41 to 18:38:53 including the test run), `T-env positive OK` | yes ([verify-live] 60 s poll settled) |
| **B14** positive with `passThroughEnv` removed from the clone's `turbo.json` | 1 | tests pass, a Ryuk container is left, so the last check is red | the positive can fail (F12). Restored with `cmp` and a clean status |
| **B15** | rg exit 1 x4 | no Cyrillic in `packages/db` and the ADR; no `canary` in `src/` or `scripts/` (only `test/integration/global-setup.ts`) | yes. I ran `rg` because this session has no Grep tool; the tester role has Grep (`tester.md` tools) |
| Real worktree, read-only `git clone --branch feat/28-db-schema <this worktree>` | 0 | HEAD equal, branch `feat/28-db-schema` | yes, B4 works against the real linked worktree |
| B4 claim "a deleted file makes tar fail loudly" | 1 | `tar: README.md: Cannot stat`, pipeline exit 1 | yes |

## Biome and git-ignored `.claude/*.json` in the worktree (S2, 10 step 3)

`pnpm lint` in this real worktree (read-only, no `--write`) gives exit 1, `Checked 18 files`, `Found 3 errors`,
all format findings in git-ignored files:
- `.claude/pipeline_state.json`
- `.claude/settings.pipeline-grant.json`
- `.claude/pipeline_state.parked/1-1793114285.json`

The design's claim holds. Two refinements, both non-blocking:
- The design names two files, but a third, the parked state, is also flagged. The rule in section 10 step 3
  ("findings in files for which `git check-ignore -q <file>` exits 0 are worktree state") already covers
  it, because `.gitignore`'s `.claude/pipeline_state*` ignores that directory.
- The worktree `pnpm lint` is red today, before any change. B7 in the clone is the authority, as the design
  says.

## Non-blocking notes (for the planner and the coder)

1. **B10 positive: write the fallback into the plan as the only form.** As written, the block exits 1 on
   correct work. The design marked exactly this as [verify-live] and gave the fallback ("add
   `--reporter=verbose` after `run test`"). The fallback runs green and still distinguishes. The tester
   would reach the right answer by following the design, so this is not blocking. The plan should carry
   only `pnpm --filter @academy/db run test --reporter=verbose > "$S/unit.log" 2>&1`, so nobody reports a
   false red first. Section 12's B10 row can lose its [verify-live] mark.
2. **U4 `@ts-expect-error` and Biome.** In my scratch, `biome check --write` reflowed
   `migrateDatabase(..., { lockTimeoutMs: 10n })` over three lines. The directive then sat above a line with
   no error, and `tsc` reported both TS2578 (unused directive) and TS2322. The coder should put the bad
   value in a typed variable directly under the directive (for example
   `const options: { lockTimeoutMs: number } = { lockTimeoutMs: 10n };`), so the error line is stable under
   formatting.
3. B6: pnpm's warning box wraps the Ignored list over two lines. The prescribed grep matches the first
   line, so the full list in the "Expected" text never appears on one line. This is cosmetic.
4. B7: later turbo commands inside the same block report `1 cached`. Those are hits from earlier commands
   in that block, not from the worktree; the first command reports `0 cached`.

## Checklist (judge-operations)

- CI would pass: B7 ran lint, typecheck, build, test and test:integration green in a fresh, committed clone.
  The `db` job's guard scripts ran both ways (B11, B13). The parent order on real GitHub stays
  [verify on this PR's first CI run], and it fails closed.
- Migrations: generated, forward-only, guarded by append-only and drift (both directions measured). There
  is no destructive change, and nothing migrates a persistent DB.
- Docker: tests use a pinned `postgres:17.6-alpine`. A wrong tag fails loudly with the F9 line. Ryuk
  behaviour and turbo pass-through are measured. No compose change.
- Config: no new env var. The package reads no env.
- Restart safety: F1-F4 unchanged from round 2 (single-transaction apply, advisory lock released on
  disconnect, `lock_timeout` measured).
- Resource hygiene: no testcontainers container was left after my runs (`docker ps -a --filter
  label=org.testcontainers=true` empty). The scratch clones live in the session scratchpad.
- Observability: `MigrationError` stages and the F9 line are visible. The F9 line was measured live.
- Rollback: `git revert` of the PR. Nothing persistent was migrated.

## Verdict

Every B1-B15 command matches the design's expectation, except the B10 positive. That block's primary
spelling is red on correct work, and the design's own stated fallback for that exact case is green (note
1). I found no command that passes on broken work. Each guard I could break went red: B2, B3, B5 on the
noallow log, B8, B10, B11 A/B/C plus the guard mutation, B12 M1-M3, the B13 modes, and B14 without
pass-through. Revision 3 resolves all four round-2 blockers.

PASS
