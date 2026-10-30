# #29 judge_design round 2: operations

Reviewer: judge-operations. Inputs read: `plans/29-sign-in-dashboard-design.md` (Revision 2, sections 0-4.5,
6, 10, 11, 13.4, 13.5, 14, 15, 16), `docs/adr/0008-authentication.md` (seed, residuals), the diff of
`docs/adr/0007-progress-data-model.md`, my round-1 review, the round-1 lessons in
`.claude/feedback/architect_mistakes.md`, `.claude/feedback/judge_mistakes.md`. Context re-read: `docker-compose.yml`,
`turbo.json`, root and `apps/web` `package.json`, `packages/{db,lesson-schema}/package.json` (exports, build),
`.github/workflows/ci.yml` (`e2e` job), `apps/web/scripts/check-image-migrations.sh`, `.env.example`.

No code exists yet; nothing new to lint, typecheck, test or build. Every Docker command below ran in a scratch
directory (`<scratchpad>/ops2/`) or as read-only `config` / `--dry-run`; none ran against project `academy`.

## Commands run

| Check | Result |
|---|---|
| Owner state before and after my checks: `docker volume inspect -f '{{.CreatedAt}}' academy_db-data`; `docker image inspect academy-web:local`; `ls .env` | `2026-10-29T04:32:08Z` both times; image absent; no root `.env`. No `academy-t29` volume, network or image left behind |
| Scratch compose = real `docker-compose.yml` + the step-1 edits (`${DB_PORT:-5432}`, `academy-web:${WEB_IMAGE_TAG:-local}`) + the step-8 `BETTER_AUTH_SECRET: ${...:?...}`; `t29-env.sh` written byte-for-byte from 13.5 plus the generated secrets; run in **bash 3.2.57 and zsh** | `t29 config` resolves `name academy-t29`, db port `55432`, web image `academy-web:t29`, web port `3180`, volume `academy-t29_db-data` |
| Same, refusals | `t29 -p academy down -v`, `t29 --project-name=academy ps`, `t29 -f x.yml ps`, `COMPOSE_PROJECT_NAME=academy t29 ps` each print `t29 REFUSED ...`, rc 97, compose never runs |
| Same, `unset BETTER_AUTH_SECRET; t29 ps` | compose prints `required variable BETTER_AUTH_SECRET is missing a value: set BETTER_AUTH_SECRET in .env, see .env.example`, wrapper rc 97 (a node `SyntaxError` trace follows on stderr; cosmetic) |
| `t29 --dry-run up -d`; `t29 --dry-run down -v` | creates only `academy-t29_default`, `academy-t29_db-data`, `academy-t29-db-1`, `academy-t29-web-1`, names `academy-web:t29`; `down -v` touches only project `academy-t29` |
| Path (a): with `t29-env.sh` sourced, the script's bare forms `docker compose --dry-run exec -T db true` and `docker compose --dry-run run --rm --no-deps -e ... web` | exec: `service "db" is not running` (i.e. it looked in `academy-t29`, where nothing runs, not in `academy`); run: container `academy-t29-web-run-...`. `COMPOSE_PROJECT_NAME=academy-t29 docker compose config` in the real repo root (where the script `cd`s) resolves `name: academy-t29` |
| New first commit vs Stepan's flow: `docker compose config --hash 'db,web'` of the current file and of the step-1 file, no env, in scratch dirs | identical hashes (`db e13e4af6...`, `web c8625885...`); full `config` output differs only in the scratch build context path. `up` after commit 1 does not recreate his containers; the port stays 5432 and the tag `academy-web:local` |
| `pnpm turbo run test --filter=@academy/web --dry=json` (a task with the same `dependsOn: ["^build"]` the `seed` task gets) | graph `@academy/db#build @academy/lesson-schema#build @academy/web#test`: `--filter=@academy/web` + `^build` builds both packages the seed imports |
| `.github/workflows/ci.yml` e2e job | no host `pnpm build` / `turbo build` before the image check; `pnpm install` has no `prepare`/`postinstall` that builds `dist/` (both `package.json` read). The seed step (6.4.4) is therefore the first host build, so a green step proves `^build` |
| `grep -rn 'setInterval\|setTimeout'` in the unpacked `better-auth@1.7.14` / `@better-auth/core@1.7.14` dist (architect's scratchpad) | server-side hits only inside awaited promises or client/plugin code; nothing on the seed's path keeps the event loop alive once `close()` ends the pool (telemetry is disabled in 6.1) |

## Round-1 findings

1. **Seed cannot build its imports: FIXED.** Root `seed` = `turbo run seed --filter=@academy/web`; task
   `{ dependsOn: ["^build"], cache: false, passThroughEnv: ["DATABASE_URL", "BETTER_AUTH_SECRET", "SEED_*"] }`
   (4.5, 6.7; wildcards already work in `DOCKER_*`). The graph is verified above. CI 6.4.4 runs on a runner
   without `dist/`, uses `127.0.0.1` and exported values (shell beats the loaded `.env`, verified in round 1),
   greps `seed: created` (a substring, so turbo's task prefix or group lines do not break it), and has
   `timeout-minutes: 3`. A stale local `dist/` is rebuilt because turbo hashes the sources (README step 5
   says so).
2. **Isolation: FIXED for all four paths, for coder and tester.**
   - (a) `COMPOSE_PROJECT_NAME=academy-t29` is exported by the sourced file, so the script's bare
     `docker compose exec/run` target `academy-t29` (verified above); 13.4 documents it in the script header.
   - (b) `web.image: academy-web:${WEB_IMAGE_TAG:-local}` with `WEB_IMAGE_TAG=t29`: every `t29 up --build`
     and the mutated `t29 build web` images get `academy-web:t29`; teardown removes only that tag; no
     `image prune`. The before/after image id of `academy-web:local` would expose a retag.
   - (c) 13.5 applies to coder and tester; nobody creates the root `.env` (checksum before/after); `pnpm dev`,
     `pnpm seed`, `pnpm test:e2e` get `DATABASE_URL` (55432) and `E2E_BASE_URL` (3180) through the existing
     `dev` / `test:e2e` `passThroughEnv` and the new `seed` one; testcontainers are their own containers.
   - (d) the `t29` wrapper hard-codes `-p academy-t29`, refuses `-p`/`-f`/a foreign `COMPOSE_PROJECT_NAME`
     (verified in bash and zsh); the volume `CreatedAt` is recorded before and diffed after; a difference is
     an incident reported to Stepan, never "fixed".
3. **Seed restart safety and pool: FIXED.** Five branches with a converging rerun (4.5): a crash after
   `createUser` -> rerun links the account (`repaired`), after the write but before `deleteUserSessions` ->
   rerun takes `updated` and deletes. I-seed 7 starts from exactly the half-written state and goes red under
   M-link (V16: `updatePassword` updates 0 rows). `close()` in `finally` with U-seedcli (M-close), plus the CI
   step timeout as a backstop.
4. **Env and run docs: FIXED.** `.env.example` gains `DB_PORT` with "DATABASE_URL must use the same port",
   `WEB_IMAGE_TAG`, the secret block saying every compose command including `up -d --wait db` needs it, and
   the seed block (6.2). The 6.3 fallback now names compose, `.env.example`, `dev.passThroughEnv` (checked
   through root `pnpm dev`) and the tester's env file. Section 11 / step 50 give the post-merge order
   (`.env`, secret, seed values, `up --build`, `pnpm seed`, sign in) and re-keying.

Cheap items: `::add-mask::` before the secret reaches `.env` and before the password reaches `$GITHUB_ENV`
(6.4.1, 6.4.4); connect hint only on the connect class (U-seedcli 2-4, M-hint); rollback note on re-landing
the identical `0001` (11). All adopted.

## New problems from Revision 2

- Commit 1 (`DB_PORT`, `WEB_IMAGE_TAG`): no change to Stepan's flow. Defaults resolve to the current values
  and the service config hashes are identical, so no recreate; no `.env` needed for them (both commented).
- None blocking found.

## Non-blocking recommendations

- Steps 1 and 8 check with bare `docker compose config`, while 13.5 says "nobody runs a compose command
  outside the `t29` wrapper". `config` is read-only and safe, but say so explicitly ("read-only `config` is
  the one exception"), so a strict coder does not stall or improvise; for step 1's "without env" check it
  must run without the sourced file (or with `env -u DB_PORT -u WEB_IMAGE_TAG`).
- The wrapper's node `SyntaxError` trace on a failed `config` is noise after the real compose message;
  optional `2>/dev/null` on the node side or a clearer `t29 REFUSED: compose config failed` line.
- Stepan's own path: the main checkout is on `feat/29-sign-in-dashboard`, so his own
  `docker compose up -d --build` there during the task would apply the unmerged `0001_auth` to
  `academy_db-data`, and a later regenerated `0001` then fails with 42P07 after merge (section 11). ADR-0007
  already lists this residual, but its remedy ("Stepan resets") conflicts with keeping his volume. Add one
  line to section 16: until #29 merges, do not `up --build` the `academy` project from this checkout, or
  freeze `0001_auth.sql` and its journal `when` after step 3 (regenerate only with Stepan's agreement).

## Attribution

No blocking finding; nothing appended to `architect_mistakes.md`.

PASS
