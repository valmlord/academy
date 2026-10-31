# #30 judge_design round 4: operations

Reviewer: judge-operations. Design: `plans/30-catalog-lesson-page-design.md` revision 4, ADR-0009 (Proposed).
Scope (Stepan): only the Revision 4 delta; block only on regressions it introduces. No code exists.
Rehearsal in my scratchpad:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/ops4/`.

Stepan's stack and root `.env` were not touched: `academy-web-1` and `academy-db-1` still "Up 6 hours (healthy)"
afterwards; nothing was run in the main checkout except read-only `git`, `find`, `grep`. The rehearsal ran in a
scratch turbo workspace (copy of my round-3 `ops3/tw`, no `.env`), port 3299, and left no process or listener
(`ps` and `lsof -tiTCP:3299 -sTCP:LISTEN` empty at the end).

Verdict: **PASS**. No operational regression in the delta.

## What I checked

| Delta item | Result | Evidence |
|---|---|---|
| 13.4 `pgrep -f 'turbo run dev\|next dev'` still catches a leftover dev server | **Yes** | Scratch workspace with root `dev: turbo run dev` (as `package.json:10`) and web `dev: next dev -p 3299` (as `apps/web/package.json:6`), Next 16.4.3 and turbo 2.11.10 from the repository. Running tree: `node .../.bin/turbo run dev`, native `@turbo/darwin-arm64/bin/turbo run dev`, `node .../next/dist/bin/next dev -p 3299`, and the listener child `next-server (v16.4.3)`. The narrowed pattern's `comm -13` listed the first three; the wide one also listed `next-server`. The `next-server` child is the 3232/3299 listener, so 13.4's `lsof -tiTCP:<port> -sTCP:LISTEN` step covers it; the narrowed check plus the `lsof` check together still cover every process of the tree. The old wide pattern also matched unrelated processes on this machine (my `ps \| grep next` hit Microsoft Teams helpers), so the narrowing removes a real false-red source. Stopping the top `pnpm dev` with SIGTERM left nothing (narrow `comm` empty, no listener). |
| U-env-sites roots, CI determinism | **Deterministic** | `git ls-files services \| wc -l` = 0; locally `services/` is an empty directory (`find services` prints only itself), so the local walk visits no file there and CI (no directory) and local see the same file set under the optional root. `apps/` and `packages/` exist and both positive controls are tracked (`git ls-files apps/web/next.config.ts packages/db/src/vocabulary.ts` prints both). Required roots failing when missing is fail-closed. A scan of the three roots with the design's extensions and skip list finds the needle only in `next.config.ts`, `playwright.config.ts`, `scripts/seed.ts`, the three sites step 1 rewires, so no local-only file can make the test falsely red. CI jobs run on `ubuntu-24.04` with no container, as the non-root `runner` user, so the mode-`000` cases behave the same there. |
| mode-`000` restore in `afterEach` | **No regression** | Restoring `0o644` on recorded paths only adds cleanup; it makes later cases on a shared fixture independent of an earlier failure. Temp-dir removal was never blocked by the mode (directory write permission governs unlink), as the table says. |
| ADR-0009 item 7 / 4.Q12 `LOG_TOKENS` | **No operational impact** | Wording only (`docs/adr/0009-course-content-in-the-web-app.md:64-68`, design lines 337-341). Its claim that the variable cannot reach the web matches what I saw in round 3: compose `web.environment` is an explicit list and turbo runs in strict env mode (`turbo.json` declares only the listed passthroughs). |

## Non-blocking

- 13.4 could say in one clause that the `next-server` child is not matched by the `pgrep` pattern and is covered by
  the `lsof` listener step, so a tester does not widen the pattern back. Not required.
- I could not rehearse a SIGKILL of the top `pnpm` process (orphaned children); the auto-mode classifier refused
  the kill. The design's stop sequence (stop the background task, then kill the listener, then both checks)
  would show any orphaned `turbo run dev` / `next dev` red, and an orphaned `next-server` holds the port, so it
  is killed by the `lsof` step.

## Attribution

None (PASS).

PASS
