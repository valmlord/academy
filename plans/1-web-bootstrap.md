# Issue #1 plan: apps/web scaffold (planner phase)

Design: `plans/1-web-bootstrap-design.md` Revision 3 (judge_design round 2: 3/3 PASS).
Research: `plans/1-web-bootstrap-research.md`. This file adds nothing to the design; it orders the work and
collects the judges' non-blocking notes so the coder does not miss them.

## Rules for this issue
- Follow the design's section 14 steps 1-12 in order; each step leaves the repo green (lint, typecheck, test,
  build as the step names).
- Commits as listed at the end of section 14, Conventional Commits, body ends `Refs #1`, no AI attribution.
  The `packages/db` fix is its own commit (`fix(db): ...`). Formatting never rides along with logic.
- Every new test (U1-U5, U1b, U1c, E1-E3, I1-I2) is watched going red under its mutation from section 15
  before the step is called done; report the observed red for each. A red run counts only if it fails at its
  named assertion, not on a parse or syntax error.
- Never run `docker compose down -v`, `docker volume rm` or `docker image prune` against project `academy`:
  Stepan's local database lives in volume `academy_db-data`. Use the design's `stack_down` logic only.
- Versions exactly as section 0 and 3 pin them (Next 16.4.3, shadcn 4.23.0, node:22.23.4-alpine, Playwright
  1.64.1). Never `--force` or `--legacy-peer-deps`.
- When a fix contradicts a design or ADR statement, update that statement in the same step.

## Stepan's decisions (2026-10-29, design section 16)
1. The stale-attempt sweep is not in #1; it moved to #34 (recorded on #1 and #34).
2. shadcn on Radix; ADR-0003 amendment in step 12.
3. `/` is a scaffold placeholder ("Главная" + stub course titles). PR body says: "`/` is a scaffold placeholder,
   not an implementation of design/pages/dashboard; #29 implements it".
4. `packages/db` MIGRATIONS_FOLDER fix and the ADR-0007 Consequences amendment (section 13) are approved.

## Non-blocking notes to apply (cheap, recommended by the round-2 judges)
1. Architecture, step 7 / tester Call 5-6: widen the import-guard quote class to include backticks
   (`["'\`]`) so a template-literal `import(\`../../design/x.js\`)` is caught; add it to the positive control.
2. Architecture, step 7: U4's failure message names the re-copy procedure ("re-copy design/system/tokens.css
   via a dev HOTFIX branch cut from the DESIGN branch; plans/1-web-bootstrap-design.md section 5"), so a red
   CI on a future DESIGN PR explains itself.
3. Architecture, step 12 (docs): in the re-copy procedure text, add: the HOTFIX PR uses
   `gh pr create --base <design-branch>`; its issue is closed by hand after the DESIGN PR merges (GitHub does
   not auto-close on a non-default base); a re-copy that changes more than 5 lines runs as TASK, not HOTFIX.
4. Security, step 7: add mutation 8b (vii), print `name` without the identifier check; U1b case (c) goes red.
5. Operations, tester section: on the containerd image store a rebuild leaves no dangling image, so the
   sentence that a pre-existing `academy-web:local` old id "is left in place" is not universally true; the
   tester reports what it observes rather than asserting it.

## Out of scope (design section 2.2)
Dashboard, sign-in, catalog, lesson and not-found pages; top bar and notifications region; any shadcn component
beyond `init`; reading `course/`; auth; the DB pool; the stale-attempt sweep; a theme toggle; i18n; a health
route; a `./schema` export; CI action upgrades.

## Notes for the tester (after the coder, 2026-10-29)
- Local `pnpm lint` (biome check .) refuses to run while `.claude/worktrees/keen-blackwell-7013a8` and
  `.claude/worktrees/zealous-bhaskara-22c06a` exist: biome finds their nested `biome.json`. CI is not affected.
  Lint explicit paths instead (`biome check apps packages scripts tests biome.json package.json turbo.json`) and
  report it; do not touch those worktrees (the #41 session works in one of them).
- Call 5-6 import guard: use the quote class widened with a backtick (judge note 1); the positive control adds a
  template-literal `import()`.
- The token re-copy procedure (judge note 3) is in the README "Web app" section; U4's message points at design
  section 5, which describes the same procedure.
