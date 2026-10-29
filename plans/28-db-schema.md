# #28 db schema v1: plan

Tier PROJECT. Design: `plans/28-db-schema-design.md` (revision 3, judge_design round 3: 3/3 PASS).
Research: `plans/28-db-schema-research.md`. Reviews: `plans/28-db-schema-design-review-{1,2,3}-*.md`.

The design is the source of truth. This plan only orders the work and carries the judges' non-blocking
notes that the design does not already contain.

## Work items

0. **Lockfile format commit** (design 10 step 0, F24, B1). Coder spawn A: run B1 only, report. Orchestrator
   commits `pnpm-lock.yaml` alone with the message given in design 10 step 0.
1. **Coder spawn B: design 10 steps 1-8**, in that order, with the self-checks named there. Files per
   design 6. ADR-0007 per design 9 (Status Proposed), one-line reference in `docs/architecture.md`.
2. **Tester:** design 12 command register B2-B15 in a B4 clone, plus `pnpm lint`, `pnpm typecheck`,
   `pnpm test`, `pnpm build`, `pnpm test:integration` (migrations applied twice: I1) in the worktree.

## Judge notes carried into the coder brief

- B10 positive: use only the `run test --reporter=verbose` form (ops r3 note 1; vitest 5.0.5's non-TTY
  default reporter prints no `test/unit/` paths).
- U4: put the bad value in a typed variable directly under `// @ts-expect-error`, so a Biome reflow cannot
  move the directive away from the error line (ops r3 note 2).
- B6 expected text: pnpm's box wraps the Ignored list over two lines; match the first line (ops r3 note 3).
- `pnpm lint` in the worktree exits 1 on git-ignored `.claude/pipeline_state.json`,
  `.claude/settings.pipeline-grant.json` and `.claude/pipeline_state.parked/*.json`: worktree state, not this
  change (design 10 step 3, `git check-ignore`). The clone run (B7/B8) is the authority.

## Follow-ups (design 11), handed to Stepan in the PR body

- `.github/CODEOWNERS`: `/packages/db/  @valmlord` (Stepan's file).
- #1/#30: ship `packages/db/drizzle` in the image; `serverExternalPackages` or explicit `migrationsFolder`.
- #30: Better Auth adapter mapping onto `users`, email normalisation, cascading `session`/`account` FKs,
  own DB-error logging rule.
- Backlog 08: arch r3 notes R3-N1..N3 (sweep vs finish race, `WHERE status = 'in-progress'`, explicit
  isolation level).
- Content contract: course id uniqueness in the validator; lesson ids permanent once a learner has
  progress (ADR-0001 note).
