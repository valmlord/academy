# #29 judge_code round 3: operations

Scope: `git diff b8fa8ab..HEAD` (HEAD 320bde9), vendored ui components and their tests only. Settled points from
round 2 (`plans/29-sign-in-dashboard-code-review-2-operations.md`) are not re-opened.

## Checked

1. **Diff scope.** `git diff --name-only b8fa8ab..HEAD` lists 12 files, all under `apps/web/components/` (10) and
   `apps/web/e2e/sign-in.spec.ts`; filtering out those two prefixes leaves nothing. No compose, `.github/workflows`,
   `turbo.json`, Dockerfile/`.dockerignore`, `package.json`, `pnpm-lock.yaml`, seed, drizzle migration,
   `playwright.config.ts` or startup file changed in round 3. (The branch-wide diff against `main` does include those
   files; they are rounds 1-2 work, already passed, and identical between `b8fa8ab` and HEAD.)
2. **No new dependency.** The e2e change only adds the `Locator` type import from `@playwright/test`, already a
   dependency; the ui changes are class strings and markup. Lockfile untouched.
3. **Determinism of `expectMutedPaint`.** AC3 holds `SIGN_IN_ENDPOINT` behind a `released` promise that only the
   test resolves, after the paint and cursor assertions, so the button cannot leave the busy state while it is
   polled: the only moving part is the 150ms `transition-[background-color]` in `ui/button.tsx`. `expect.poll` uses
   the default expect timeout (5s) with 100/250/500ms intervals, so it settles within the first two or three probes,
   about 30x headroom over the transition. The expected colours come from a probe element resolving
   `var(--muted)` / `var(--muted-foreground)` in the live theme, so no colour literal or theme assumption; the probe
   is removed in the same `evaluate`. `busy.hover()` checks visibility/stability, not enabled state, so it does not
   hang on `aria-disabled`. `toHaveCSS("cursor", "progress")` is a static computed property with no transition.
   `retries: 0` in `playwright.config.ts` is unchanged, so a flake would surface rather than hide.
4. **CI e2e duration.** Added cost is at most a few hundred ms in one test. Tester re-test: full e2e 18/18 in
   5.3 s and 4.5 s on two runs; the e2e job's `timeout-minutes: 20` is unaffected.
5. **Guards can fail.** Tester mutations M1 (old `button.tsx`) and M2 (no `cursor-progress`) turned AC3 red at the
   paint poll and the cursor assertion respectively (test report, round 2 re-test table). The jsdom unit test's class
   check is a cheap static check, no timing.
6. **History.** `git rev-list main..HEAD`: 10 commits, every message contains `#29` (checked per commit).
   `b8fa8ab` is not an ancestor of HEAD (history was rewritten), which is fine: the comparison is tree to tree.
7. **Rollback.** Pure frontend markup/class and test change; `git revert` + image rebuild, no DB or config step.

Hard constraints respected: read-only git and file reads only; no Docker command, no `.env` created.

PASS
