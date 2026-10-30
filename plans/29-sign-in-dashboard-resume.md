# Issue #29: pause and resume note (2026-10-30)

Paused on Stepan's request in phase `coder`, inside step 36 of commit 8. Nothing pushed.

## Committed on `feat/29-sign-in-dashboard`
1. 7ae73ee build(compose): parametrise the db port and the web image tag (step 1)
2. 1fd256c feat(db): add sessions, accounts and verifications tables for better auth (steps 2-4); `0001_auth` frozen
3. fa4a74d feat(web): add redaction helpers for database and auth errors (steps 5-6)
4. c30f782 feat(web): require the auth secret in compose, ci and at startup (steps 7-10)
5. a1cc532 feat(web): configure better auth with redacted logging and lazy initialisation (steps 11-17)
6. 130e49e feat(web): add the session data access layer and safe return paths (steps 18-22)
7. c5ed024 feat(web): add an idempotent seed for the local user (steps 23-27)

## Uncommitted (left in the working tree on purpose)
Steps 28-36 of commit 8: shadcn components, sign-in page, form and actions, e2e auth setup and fixtures, `proxy.ts`
and its test, plus edits to `.dockerignore`, `.gitignore`, `biome.json`, `turbo.json`, `pnpm-lock.yaml`,
`apps/web/package.json`, `app/globals.css`, `app/page.tsx`, `lib/copy.ts`, `playwright.config.ts`, `test/setup.ts`.
ADR-0007 and ADR-0008 edits belong to commit 10.

## Open findings before resuming
1. After step 36 the compose web container answers 500 `TypeError: Invalid URL`: `proxy.ts` returns a relative
   `Location`. Build the absolute URL from the request's own `Host` instead (keep 127.0.0.1 vs localhost intact),
   check with `curl -D -` against 127.0.0.1:3180, then `t29 up -d --build --wait`. The e2e "4 passed" from that run
   does not count.
2. Two `drizzle-orm` 0.45.4 store entries (with and without the `kysely` peer) contradict design 6.6. Runtime works;
   types do not mix across the copies. Decide: update the design statement or unify the copies.
3. Coder's small in-intent design changes are listed in the coder report (I1 table list, shadcn deps and focus
   styles, Alert `warning` variant, form a11y details, seed email check, `describeDbError` naming). Judges review them.
4. `next build` prints 3 Turbopack tracing warnings (lesson-schema fs use via @academy/db); tester checks the
   standalone output size.

## Unverified items status
I-origin confirmed (no `AUTH_ALLOWED_HOSTS` fallback needed); M23 confirmed; U-4 confirmed (I-redact is a real guard);
T-xff not yet run (step 40).

## Resume
1. `cd` to the main checkout on `feat/29-sign-in-dashboard`, `bash .claude/hooks/pipeline-advance.sh parked`, then
   `resume 29`.
2. Re-create the `t29` env file per design 13.5 if the previous session's scratchpad is gone (new secret and seed
   password; the `academy-t29` volume then needs `t29 down -v` and a fresh seed). The `academy-t29` volume and the
   `academy-web:t29` image were kept.
3. Re-spawn `dev/coder.md` with this note, the design, the planner file and the coder's previous report: fix
   finding 1, finish steps 37a-40, commit 8, then commits 9 and 10.
4. Lint with explicit paths while `.claude/worktrees/` holds the #42 worktree.

Isolation evidence at pause: `academy_db-data` CreatedAt 2026-10-29T04:32:08Z (unchanged), `academy-web:local`
absent, root `.env` absent. Final teardown after #29: `t29 down -v` and `docker image rm academy-web:t29`.
