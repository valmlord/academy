# Issue #30 plan: course catalog and lesson page (planner phase)

Design: `plans/30-catalog-lesson-page-design.md` Revision 4 (judge_design round 4: 3/3 PASS; rounds 3 and 4
approved by Stepan). Research: `plans/30-catalog-lesson-page-research.md`. ADR: `docs/adr/0009-course-content-in-the-web-app.md`
(Proposed). This file adds nothing to the design; it orders the work and collects what the coder must not miss.

## Before the first step
1. The branch contains #79 (PR #82, merged 2026-10-31): `git merge-base --is-ancestor origin/main HEAD` exits 0.
   Stepan brings `origin/main` into this branch; the coder never merges or rebases by itself.
2. Run the design's section 9.5 re-check against the merged `design/ia.md` and dashboard acceptance notes; record
   the result in the coder report. If a statement no longer holds, stop and report.
3. Isolation per design 13.5 and 13.6: source `t30-env.sh` (project `academy-t30`, ports 3230/55430, dev 3232, image
   tag `t30`, `COMPOSE_ENV_FILES=/dev/null`, `ACADEMY_SKIP_ROOT_ENV=1`), compose only through the `t30` wrapper,
   the before/after record (Stepan's containers' StartedAt, image id, volume CreatedAt, `stat` of the root `.env`).
   Stepan's own stack runs on 3080/5432 and must stay untouched; the root `.env` is never read, printed or hashed.
4. Check [D] (turbo dry-run passthrough) before the first real build, typecheck, seed or e2e, and first in every
   check set. M-env-turbo runs only in a scratch turbo workspace without a `.env`; no mutation that disables the
   opt-out ever runs in this checkout, and this checkout's `turbo.json` is never mutated.

## Rules for this issue
- Follow section 14 (47 steps) and section 15 (10 commits) in order; every commit leaves lint, typecheck, test,
  build and the CI e2e job green. Conventional Commits, body ends `Refs #30`, no AI attribution.
- Every new test is watched red under its named mutation (section 13.7) at the named assertion, restored with a
  `cmp` proof; a parse, import or build error does not count as red. Keep a mutation log in
  `plans/30-catalog-lesson-page-mutation-log.md` (no scratch files committed).
- Vendored shadcn components follow the section 8.4 state tables class by class; README wins over proto.css (#80, #83).
- Exact versions as pinned (react-markdown 10.1.0, remark-gfm 4.0.1, yaml 2.9.1); never `--force` or
  `--legacy-peer-deps`.
- When a fix contradicts a design or ADR statement, update that statement in the same step and list it.

## Stepan's decisions (2026-10-30)
1. Progress: "Не начат" everywhere without a DB read; the dashboard renders the first-run state from constants.
2. Lesson page per the M0 design, no workspace stub (the issue criterion is superseded; say so in the PR).
3. A `ready` lesson in a non-ready module is hidden; the module shows the "Готовится" badge.
4. Loading Skeletons move to #35 (issue texts updated).
5. Deviations D1-D3 accepted; DESIGN follow-up #83 (also holds the `.prose h2` focus-ring note).

## Non-blocking notes from round 4
- Security N11: ADR-0009 item 7 may say "never set by the project" instead of "never set for the web".
- Operations: 13.4 may add that `next-server` is covered by the `lsof` listener step, so nobody widens the
  `pgrep` pattern back.
