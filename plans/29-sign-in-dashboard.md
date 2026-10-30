# Issue #29 plan: sign-in and dashboard (planner phase)

Design: `plans/29-sign-in-dashboard-design.md` Revision 3 (judge_design round 3: 3/3 PASS; round 3 approved by
Stepan). Research: `plans/29-sign-in-dashboard-research.md`. ADRs: `docs/adr/0008-authentication.md` (Proposed),
`docs/adr/0007-progress-data-model.md` (amended in place). This file adds nothing to the design; it orders the work
and collects the judges' non-blocking notes so the coder does not miss them.

## Rules for this issue
- Follow the design's section 14 steps (53) in order and the section 15 commits. Every commit leaves lint,
  typecheck, test, build and the CI e2e job green; steps inside a commit may be red.
- Conventional Commits, body ends `Refs #29`, no AI attribution. Formatting never rides along with logic.
- Every new test is watched going red under its named mutation (design section 13) before its step is called done;
  report the observed red per test. A red run counts only if it fails at its named assertion, not on a parse,
  import or syntax error.
- Isolation (design 13.5) applies to the coder and the tester alike: source the `t29` env file, run compose only
  through the `t29` wrapper (the one exception: read-only `docker compose config` in steps 1 and 8), never create
  the root `.env`, point `pnpm dev` and `pnpm seed` at the isolated DB. Run `docker info` before the "before" record.
- Never touch Docker project `academy`, volume `academy_db-data` or image `academy-web:local`: no `down -v`,
  `volume rm`, `image prune`, no rebuild or retag. Stepan's DB and user must survive untouched.
- `0001_auth` (SQL, snapshot, journal `when`) is frozen after step 3; regenerating it needs Stepan's agreement.
- Versions exactly as the design pins them (better-auth 1.7.14, `server-only@0.0.1`, drizzle-orm `^0.45.4` declared
  in `apps/web`). Never `--force` or `--legacy-peer-deps`.
- When a fix contradicts a design or ADR statement, update that statement in the same step.

## Stepan's decisions (2026-10-30)
1. The dashboard ships the shell and the designed empty state; real courses go to #30, progress to #35 (texts
   appended to both issues; #35 blocked by #30). ADR-0006 item 5 waiver as in design 9.2; Stepan confirms it at merge.
2. Account deletion moved to #78; the DB cascade stays in #29.
3. The "Курс" top-bar link is omitted; DESIGN follow-up #79. The PR body's "Design deviations" section repeats the
   9.2 table and the waiver sentence and names #79.
4. #29 relabelled `tier:project`.
5. Judge round 3 approved.

## Conditions from round 3 (apply them)
1. Security S3-1, steps 37a/37c: `allowJs` is on and Next accepts js/jsx pages, so the walker also reads `.js`,
   `.jsx`, `.mjs`, `.cjs`; add a case where `app/x/page.jsx` without a DAL call is listed.
2. Security S3-2, steps 37a/37c: anchor the `e2e` and `test` exclusions at `apps/web/`; add a case where
   `app/test/page.tsx` is listed.
3. Architecture N3-1: the scanner's error messages never contain the quoted directive.
4. Architecture N3-2: `needsSeedHint` and `signOutAction` are written in a recognised function form even though
   they are allowlisted.
5. Architecture N3-3: design section 16.3 still says "before judge round 2"; fix the wording when touching it.
6. Operations, step 49: E-out-1 uses an empty storage state (`test.use({ storageState: { cookies: [], origins: [] } })`
   or an explicit empty `newContext`), because the Playwright 1.64.1 `request` fixture inherits the project's state.
7. Operations, step 37c: clean up the temp dir after the test.

## Notes for the tester
- Local `pnpm lint` may trip on nested `biome.json` files only if worktrees exist under `.claude/worktrees/`; today
  there are none in this checkout. If one appears (the #42 session), lint explicit paths and report it.
- Unverified items with named checks (design): T-xff (Chromium keeps a Playwright-set `X-Forwarded-For`; fallback
  `workers: 1` plus a wait), I-origin (wildcard origin matching; fallback `AUTH_ALLOWED_HOSTS`), M23 (module-level
  `betterAuth()` breaks `next build`), U-4 (I-redact under M10: evidence, not a guard, if it stays green). Report
  each outcome.
- Before and after the run, report `academy_db-data` CreatedAt, the `academy-web:local` image id (or absence) and
  the root `.env` checksum (or absence).
