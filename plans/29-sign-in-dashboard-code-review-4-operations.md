# #29 judge_code round 4: operations

Branch `feat/29-sign-in-dashboard`, HEAD `2317f66`, compared with round-3 HEAD `320bde9`. Date 2026-10-30.

PASS: no operational issues found

## Checked

1. **Diff scope.** `git diff --stat 320bde9 HEAD`: 2 files, +7/-10, `apps/web/components/sign-in-form.test.tsx` and
   `apps/web/components/ui/button.tsx`. `git diff --name-only 320bde9 HEAD | grep -vE '^apps/web/components/'` prints
   nothing. `git diff --quiet 320bde9 HEAD --` over every `*compose*`, `Dockerfile*`, `.github`, `turbo.json`, every
   `package.json`, `pnpm-lock.yaml`, `.env.example`, `packages/`, `apps/web/e2e`, `apps/web/playwright.config.ts` and
   `drizzle/**`: exit 0, no operational file changed. No new dependency, env var, migration, healthcheck or CI step.
2. **Content of the change.** `button.tsx`: comment rewritten, and `aria-disabled:hover:bg-muted
   aria-disabled:hover:text-muted-foreground` removed from the base class string; nothing else in the cva. Test: the
   `toHaveClass` assertion drops the same two classes, comment reworded. Class strings only, no runtime, config or
   startup behaviour touched. The tester's built-CSS check (T2) shows the muted pair still wins on hover via variant
   order, and the e2e AC3 hover guard went red on the old `button.tsx` and green after restore (T3), so the removed
   classes were redundant and the remaining guard can fail.
3. **History.** `git range-diff main 320bde9 HEAD`: commits 1-7 identical SHAs, 9-10 `=` (rebased onto the new
   parent), only commit 8 (`3b18271` -> `72679fc`, "add the sign-in page and protect every route") changed: the fix sits
   in its natural commit. `320bde9` is not an ancestor of HEAD (rewrite), so comparison is tree to tree.
   `git rev-list main..HEAD`: 10 commits; each message checked individually, all 10 contain `#29`.
4. **Ran myself (no Docker).** `vitest run components/sign-in-form.test.tsx`: 13/13 passed. `tsc --noEmit -p apps/web`:
   exit 0. `biome check` on both changed files (the repo's `lint` is `biome check .`): exit 0, no fixes. The stack, the
   build without secrets and e2e 18/18 rely on the tester's re-test 3 (`academy-t29` project, image `062d0f7e0686`);
   with no operational file changed since round 3, which I passed, they cannot have regressed through this diff.
5. **Working tree.** `git status --porcelain`: only the three modified `.claude/feedback/*` files and untracked
   `plans/`; no stray product change.
6. **Isolation.** Root `.env` absent (`ls .env`: no such file). I ran no Docker command; the tester's T4 shows 0
   containers of project `academy`, `academy_db-data` CreatedAt unchanged, `academy-web:local` absent.
7. **Rollback.** Pure class-string and test change: `git revert` + image rebuild, no DB or config step.

Hard constraints respected: read-only git, file reads, local unit test/typecheck/lint only; Docker project `academy`
not touched; no `.env` created.

PASS
