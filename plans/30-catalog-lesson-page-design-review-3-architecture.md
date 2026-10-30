# #30 judge_design round 3: architecture

Judge: judge-architecture, 2026-10-30. Limits (Stepan): block only on regressions from the round-2 fixes and on my
own round-2 items left undone. Reviewed: `plans/30-catalog-lesson-page-design.md` revision 3 (Revision 3 table,
0 V9/V11/V12/V15/V19/V20, 4.Q11-Q12, 5.1, 5.4, 6.1, 6.2, 7.1, 10, 13.1, 13.5-13.7, 14 all steps, 15),
`docs/adr/0009-course-content-in-the-web-app.md` item 7, my round-2 review. Checked against the repository:
`git status` (only `plans/`, `docs/adr/0009-*` and `.claude/feedback/architect_mistakes.md` changed or new; no
product file touched), `turbo.json`, root `package.json` scripts (`typecheck`, `test`, `seed`, `test:e2e` all go
through turbo, so the global passthrough reaches them), `apps/web/vitest.config.ts` (root `apps/web`, loads no
`next.config.ts`, so the M-env-flag/M-env-site runs under `vitest run lib/root-env.test.ts` cannot read the root
`.env`), `.github/workflows/ci.yml` (every job `ubuntu-24.04`, no `container:`, so the mode-`000` cases run as a
non-root user), `rg 'loadEnvFile|dotenv' apps packages services` (only the three known call sites), and a dry run
`turbo run build --filter=@academy/web --dry=json` in this checkout with the flag exported (executes no task):
`globalCacheInputs.environmentVariables.passthrough` is `null` with today's `turbo.json`, which is the field path
and the "entry removed" value V12 and [D] rely on. Pipeline status: PROJECT, `judge_design`.

## Verdict: FAIL, 1 regression (all three round-2 items and A1-A5 fixed)

### 1. [design 13.1 U-env-sites, Revision 3 row S N7] The widened walk includes `services/`, which does not exist in a CI checkout
Revision 3 widened U-env-sites from `apps/web` to "walking `apps/`, `packages/`, `services/` from the repository
root". `services/` is an empty directory in this checkout (`ls -la services`: no entries) and has no tracked file
(`git ls-files services` prints 0 lines; `git ls-tree main` has no `services`). Git does not store empty
directories, so CI's `actions/checkout` has no `services/`. The direct implementation of the walk (`readdirSync` /
`readdir` per root) throws `ENOENT` there: U-env-sites is green on the coder's machine and red in CI's `checks` job
on correct code, at commit 1, against 13.5's "every commit leaves all of them green". Nothing in the design says a
missing root is tolerated, and silently tolerating every missing root would let a typo'd root pass vacuously
(the `vocabulary.ts` control covers only `packages/`).
Fix (one sentence in 13.1): walk `apps/` and `packages/` (both tracked; `next.config.ts` and `vocabulary.ts` are the
positive controls for each), and `services/` only if it exists, stated as such ("a root that does not exist is
skipped only for `services/`, which has no tracked file until the first service lands"); or drive the walk from
`git ls-files apps packages services`, which also drops the skip list.

## Round-2 items: verified

1. **Arch-1 M-env-turbo reads the root `.env`: fixed.** 13.6 now has the rule (no mutation that can disable the
   opt-out while a real entry point can run here; `turbo.json` here is never mutated). M-env-turbo moved to a scratch
   turbo workspace without `.env` (V19, 13.7), with both the static negative (`passthrough` `null`) and a run-time
   negative (`flag=UNSET` per task). M-env-flag/M-env-echo/M-env-site/M-env-walk run only through
   `pnpm --filter @academy/web exec vitest run lib/root-env.test.ts`, restored with `cmp` before the next command
   (step 1 (b), 13.7); Vitest's config confirms that command loads no `next.config.ts`. [D] is a dry run (executes
   nothing), placed before the first real build/typecheck/seed/e2e and first in every [U], [B], [S]; step 1's order
   (a)-(e) puts [D] before (e). [B] gained `--force`, so the skip line cannot be a cached replay. I confirmed the
   [D] field path and the `null` value in this checkout.
2. **Arch-2 no `unreadable` reason: fixed.** 5.1 adds `unreadable (<code>)` and a single `fsFailureReason` applied
   to every rejection of `realpath`, `lstat`, `stat`, `readdir`, `readFile`, with a complete mapping (`ENOENT`/
   `ENOTDIR` missing, `ELOOP` symlink, `EISDIR` not a regular file, other `E...` code -> `unreadable (<code>)`,
   never the message; a code-less error rethrown and, via `loadOrError`, a 500). 5.4 lists it in the closed set;
   ADR-0009 item 7 says the same. Tests: U-fs (mode `000` -> `unreadable (EACCES)` with a fail-not-skip root guard;
   synthetic `EIO`, `ENOTDIR`, `ELOOP`, `TypeError`; no temp path in a reason), U-read (`module.yaml` mode `000`,
   `courseId` set: correct, since `course.yaml` is parsed first), U-text (`LessonTextReadError`); M-fs-unreadable
   reddens both U-fs cases. 10 has the failure-mode row.
3. **Arch-3 `LEARNER_FILES` before its step: fixed.** Step 6 creates `files.ts` with `LEARNER_FILES` only and says
   "Supplies: `LEARNER_FILES`"; step 9 adds `learnerFiles(tree)` + U-files; the first users of `learnerFiles` are
   U-files (9), U-leak (13) and the export (14). Step 7's `read.ts` uses only `CourseFs`. 3.2 still lists both
   exports in `files.ts`, which is the end state.

Advisories: A1 needles built from parts, and the call sites' comments no longer name the loader (4.Q11); A2 header
comment on erasable syntax (4.Q11); A3 the recorder logs `readText`/`isRegularFile`, `listDirs` asserted once with
`rel` `""` (7.1); A4 `instanceof LessonTextReadError` with rethrow (6.2); A5 `ul aria-labelledby` (6.1) and
E-cat-1 asserts it. All done.

## Changed steps re-walked for green commits

- Step 1: (a) and (b) need only `root-env.ts` and its test; (c) is outside the checkout; (d) needs the new
  `turbo.json` entry, written in this step; (e) runs the full sets. Commit 1 green, except issue 1 in CI.
- Step 4: the `.env.example` grep belongs with [D]; `COURSE_ROOT` as comment lines cannot reach `pnpm dev` or CI's
  copied `.env`. Fine.
- Steps 6, 9: supply order above. Step 8: M-yaml-level is a `yaml.ts` option, supplied at step 7. Fine.
- Step 47: docs only, `[lint]`. Fine.
- Commits stay 10, steps 47, ranges in 15 unchanged; the supply walk still holds.

## Advisory (not blocking)
- A6 U-fs mode-`000` case: also restore the mode in an `afterEach` (or rely on the temp dir's own permissions for
  removal, and say so), so a failed assertion does not leave an unreadable file in a reused temp dir.

FAIL
