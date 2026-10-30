# #29 judge_code round 1: operations

Reviewer: judge-operations. Diff: `git diff main...HEAD` (10 commits, df0910b). Upstream read: design Revision 3
(6.2, 6.4, 11, 13.5), ADR-0008, amended ADR-0007, planner, test report, my design reviews 1-3.

## Verdict: FAIL, 1 issue (cheap fix), plus rulings on the tester's findings

### O1 [`.env.example:16-22`] `SEED_EMAIL` / `SEED_PASSWORD` (and `SEED_NAME`) missing

Design 6.2 gives the literal block for the web part of `.env.example`. The commit has every line of it except
the last four:

```
# The seed creates the only user (pnpm seed, see README); the e2e tests sign in with the same values.
# Put them here, never on a command line.
# SEED_EMAIL=learner@example.com
# SEED_PASSWORD=
```

`apps/web/lib/seed-cli.ts:47-49` reads `SEED_EMAIL`, `SEED_PASSWORD`, `SEED_NAME`, and `.env.example:1` says "Every
variable the code reads must be listed here". README step 3 covers it for Stepan, so nothing breaks today, but the
file a fresh checkout copies to `.env` does not name the variables `pnpm seed` and `pnpm test:e2e` need, and the
"never on a command line" advice lives only in the README. This is the operations checklist item "every new env
var is in `.env.example`, documented". Fix: add the design's four lines; also add a commented `# SEED_NAME=` (the
seed reads it, optional) or state in that comment that it is optional. CI is unaffected (CI writes `SEED_*` to
`$GITHUB_ENV`; the commented lines add nothing to `.env`). Owner: coder (lesson appended to
`.claude/feedback/coder_mistakes.md`).

## Rulings on the tester's findings

1. `.env.example` without `SEED_*`: **blocking**, O1 above. One-commit fix; no re-run of the stack needed, only
   `pnpm lint` and a look at the file.
2. Failed-run Playwright traces with the seed password in the CI `e2e-report` artifact: **accept as a residual,
   keep uploading**, same ruling as the security judge's C1. Operationally the traces are the main evidence of a
   failed e2e run; dropping `test-results` (or `trace: "off"` in CI) would cost every future e2e debugging
   session to protect a value that is dead when the job ends: the password is `openssl rand -hex 24` per run, the
   user and its sessions live only in the job's database, `docker compose down -v` runs under `if: always()` and
   the runner VM is discarded; the repo is private, the artifact is uploaded only on failure and kept 7 days.
   `BETTER_AUTH_SECRET` is not in a trace (server side only). I concur with security C1 that ADR-0008's residual
   (line 160) must be corrected to say a CI trace, and the HTML report in `playwright-report` that embeds it, hold
   the run's seed password too, not only a session cookie. That correction rides along with the O1 fix.

## What I checked (ran, not read)

- **CI stages**, main checkout, no root `.env` (as on the CI `test` job):
  - `pnpm lint`: `biome check .` fails locally on `.claude/worktrees/content-42-agentic-patterns-887a63/biome.json`
    ("nested root configuration"), an untracked worktree of another task, not this diff; CI has no worktrees.
    `biome check` over every tracked top-level path except `.claude`: 155 files, clean.
  - `pnpm typecheck` 5/5, `pnpm test` green (db 34, lesson-schema 12, web 105).
  - `pnpm build` with `BETTER_AUTH_SECRET` unset: green (lazy auth init, no secret needed at build), the same 3
    Turbopack warnings the tester traced to main; standalone 45 MB locally.
  - `pnpm --filter @academy/db run db:check`: fine. `check-drift.sh`: "No schema changes, nothing to migrate".
  - Append-only: `git diff --name-status --diff-filter=DMR main...HEAD` over `drizzle/*.sql` and snapshots is
    empty (0001 is added, nothing merged is edited).
  - `pnpm test:integration` (testcontainers, own throw-away containers, Ryuk cleaned up): db 41, web 25, green.
    This is what the CI `db` job now runs for web too (`turbo run test:integration`); its 15 min budget holds.
- **Migration `0001_auth` rollout/rollback**, on a scratch container `opsjudge29-pg` (postgres:17.6-alpine, port
  55499, removed afterwards) through `packages/db/dist` `migrateDatabase`:
  1. applied a copy of the folder holding only `0000` (main's state), inserted a `users` row;
  2. full folder: 3 new tables, the existing row intact, `__drizzle_migrations` has 2 rows (`when` 1793342340930);
  3. "rollback": the 0000-only folder again (what reverted code runs): no-op, no error;
  4. "re-land" with the identical files: no-op, still 2 rows. Matches design 11 (re-landing must reuse the
     identical `0001` and `when`). Only `CREATE TABLE` / `ADD CONSTRAINT` on empty new tables / `CREATE INDEX`:
     safe on a non-empty DB, no expand/contract needed.
- **Seed, on a runner without dist**: deleted `packages/db/dist` and `packages/lesson-schema/dist`, then
  `pnpm seed` (turbo strict env, values only from the shell, no root `.env`): `--dry=json` shows `@academy/web#seed`
  depends on both builds; it rebuilt them and printed `seed: created` (mixed-case email stored lowercase), exit 0;
  rerun `seed: updated`; new password `seed: updated`; `BETTER_AUTH_SECRET` unset -> `seed: InvalidAuthSecretError:
  BETTER_AUTH_SECRET is missing`, exit 1; unreachable DB -> connect hint, exit 1, no password in output; a second
  email with another user present -> `SeedConflictError`, exit 1. Neither the password nor the secret appears in
  any seed log. So `SEED_*`, `DATABASE_URL`, `BETTER_AUTH_SECRET` all pass turbo's `seed.passThroughEnv`.
- **Startup ordering and exit codes**, on the built standalone server (`node server.js`, port 3199):
  no secret -> `web: InvalidAuthSecretError: BETTER_AUTH_SECRET is missing`, rc 1; 5-char secret -> "must be at
  least 32 characters, got 5", rc 1, before any DB contact; valid secret + unreachable DB -> `MigrationError stage
  connect` with hint, rc 1, no password; valid secret + scratch DB (drizzle folder placed as the Dockerfile's
  `COPY` does) -> "database migrations applied", `/` 307 to `/sign-in?next=%2F`, `/sign-in` 200,
  `/api/auth/get-session` 200, secret absent from the log. Order DATABASE_URL -> secret -> migrate matches ADR-0008
  item 9; `check-image-migrations.sh` I3/I3b/I3c assert the same in the image (no `MigrationError` = checked first).
- **Compose** (read-only `config` only, scratch project `opsjudge29`, `--env-file` in my scratchpad, root `.env`
  never created): without the secret both `config --quiet` and `config --quiet db` exit 1 with "required variable
  BETTER_AUTH_SECRET is missing a value: set BETTER_AUTH_SECRET in .env, see .env.example"; with it, defaults give
  `published: "5432"`, `academy-web:local`, `published: "3080"`, so Stepan's stack resolves exactly as before.
  `SEED_*` are not in web's environment; `BETTER_AUTH_SECRETS` is never passed. `.env.example` ends with `\n`
  (od), so the CI `>>` append lands on its own line.
- **CI `e2e` job** (read): the secret is masked before it is written, `config` runs with `--quiet` (the only
  command that would print it); the seed step masks the password before writing `$GITHUB_ENV`, uses 127.0.0.1,
  `timeout-minutes: 3` (locally the cold rebuild + seed took well under a minute); `pnpm seed | tee` runs under
  the default `bash -e` without pipefail, but `grep -qF 'seed: created'` fails the step on any other outcome, and
  turbo's `@academy/web:seed:` prefix does not break the fixed-string match. `test:e2e.passThroughEnv` has `SEED_*`;
  the failure artifact list does not include `playwright/.auth` (also in `.gitignore`, `.dockerignore`, biome
  ignore). The job timeout of 20 min is unchanged and holds.
- **Images**: Dockerfile unchanged; the secret is runtime env only, never a build arg; `.env*` excluded by
  `.dockerignore`; the tester's `docker history` / `image inspect` of `academy-web:t29` showed 0 hits. I did not
  build an image (constraint: read-only preferred, and the standalone run above exercises the same server).
- **Isolation**: `docker ps -a` showed no `academy` project containers before or after my runs; I touched no
  `academy` project, `academy_db-data` or `academy-web:local`; no root `.env` exists. The `t29` wrapper appears only
  in `plans/` (untracked), nowhere in the diff: not committed product code, as design 13.5 intends.
- **turbo**: `dev.passThroughEnv` gains `BETTER_AUTH_SECRET` (next.config already loads the root `.env`, so both the
  file and a shell export work); `BETTER_AUTH_SECRETS` is deliberately not passed (refused anyway).

## Stepan after merge (README "Web app" / design 11): order is right and complete

1. `ls .env` / `cp .env.example .env`; 2. append the secret, `grep -c` prints 1; 3. `SEED_EMAIL` /
`SEED_PASSWORD` in `.env` via an editor; 4. `docker compose up -d --build --wait` (applies `0001_auth` to his
existing volume, verified above as safe); 5. `pnpm seed` -> `seed: created`; 6. sign in at 127.0.0.1:3080.
Skipping step 2 fails every compose command with the variable's name, including `down` and `up -d --wait db`
before `pnpm dev`; the README says so. One note for Stepan, not a defect: if his DB ever got a `users` row by
another path, `pnpm seed` refuses with `SeedConflictError` (one-user rule, by design).

## Non-blocking

- N1: rerunning `pnpm seed` with an unchanged password also prints `seed: updated` (repair path); the README only
  describes it for a changed password. Fine as is.
- N2: `if: always()` `docker compose down -v` fails interpolation if the secret step itself failed; harmless on an
  ephemeral runner.

FAIL
