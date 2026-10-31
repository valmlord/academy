# #30 judge_design round 2: operations

Reviewer: judge-operations. Design: `plans/30-catalog-lesson-page-design.md` revision 2, ADR-0009 (Proposed).
Round 1: `plans/30-catalog-lesson-page-design-review-1-operations.md` (O1-O6). No code exists; every check
below was read in the repository or rehearsed in my scratchpad
(`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/ops2/`).

Stepan's stack was not touched. Before and after: `academy-web-1` StartedAt `2026-10-30T13:10:31.210477338Z`, `academy-db-1`
StartedAt `2026-10-30T13:10:25.621489835Z` (`diff` empty), `academy-web:local` Id `sha256:a4a809b2...`, volume
`academy_db-data` CreatedAt `2026-10-29T04:32:08Z`, root `.env` checked with `stat -f '%i %z %m'` only, same
values before and after. I did not open, print or checksum it. I started one throwaway container from
`academy-web:local` (`docker run --rm --network none`, no env file) to look at the runner's filesystem
permissions. It did not touch his containers, volume or tags.

Verdict: **FAIL**, 2 new issues. O1-O6 are fixed and rehearsed. The two new issues come from revision 2's own
changes: M-env-turbo makes the coder's real build read the root `.env`, and the widened C2 fails as the
runner's user.

## Round-1 findings

| Round 1 | Status | What I checked |
|---|---|---|
| O1 T-err recipe | **Fixed** | I extracted `t30-env.sh` from design 13.6 with `awk`. It is byte-identical to the architect's `r2/t30-env.sh` (first 21 lines, `diff` empty). Rehearsed in **bash 3.2 and zsh** against a scratch compose file (`name: academy`) with a canary `.env` (`FROMFILE`, `BETTER_AUTH_SECRET=file-secret-canary`, `COMPOSE_PROJECT_NAME=academy`). `t30 run -d --rm --no-deps --name academy-t30-web-err --publish 127.0.0.1:3231:3000 -e COURSE_ROOT=... web` rc 0. `docker port`: `3000/tcp -> 127.0.0.1:3231`. `docker logs ... \| grep -c "web: course read failed:"` = 1, `t30 logs` = 0, so the design is right to use `docker logs`. Labels: `com.docker.compose.project=academy-t30`, `oneoff=True`. `docker stop` rc 0, and `--rm` then removed it. `t30 down -v` rc 0 with no "Resource is still in use". `docker ps -aq --filter label=...=academy-t30` and the network list are both empty. Port 3231 is in the `lsof` precheck. `docker stop` is the first teardown line. |
| Wrapper refusal without `COMPOSE_ENV_FILES` | **Holds** | Every case returns 97 in both shells: `COMPOSE_ENV_FILES` unset, empty, or `=.env`; `-p academy`; `--env-file=.env`. `--publish` is not caught by `-p*`. |
| O2 `.env.example` | **Fixed** | Step 1 adds `ACADEMY_SKIP_ROOT_ENV` and step 4 adds `COURSE_ROOT` (non-blocking N3 asks for both to be commented). |
| O3 turbo test inputs | **Fixed** | Rehearsed in a scratch turbo 2.11.10 workspace. With `$TURBO_ROOT$/course/**` added, `--dry=json` lists `../../course/m/l/theory.md` among `@academy/web#test` inputs. A content-only edit then gives `cache miss, executing`. Step 25's dry-run check is therefore valid. |
| O4 E-leak hygiene, race, runtime | **Fixed** | I re-ran `r2/frag2.mjs`: 6,111 fragments, 6,029 kept, `ACADEMY_CHECKS_DIR/verify_routing.py` kept. Scan of 164 files (4.9 MB): 310 ms. Only collision: `abcdefghijklmnopqrstuvwxyz0123456789`. Whole script: 0.80 s wall. Runtime estimate is under the budgets below. Residual race: N2. |
| O5 text read failures logged | **Fixed** | 4 "Caching" (design line 315-316) logs both lines. T-err part 3 asserts `web: lesson text read failed: <file>: missing` and checks the output has no content. |
| O6 compose and Node loaders read the root `.env` | **Fixed for the normal flow** (see O7 for the mutation) | Compose: with `COMPOSE_ENV_FILES=/dev/null`, bare `docker compose config` (the image-script path) resolves `academy-t30` and `LABEL=default`. With the variable and the exported secret removed, it fails with `required variable BETTER_AUTH_SECRET is missing`, which proves the file is not read. Unset, it interpolates `fromfile-canary` and `secret=FROM-FILE`. `check-image-migrations.sh` uses bare `docker compose exec/run`, so it is covered by the export. Node: see the turbo table. `shadcn add` (V9 left it open): `@shadcn/registry@0.2.1` `env-loader` reads only `.env.local`, `.env.development.local`, `.env.development` and `.env` from the **cwd** (`join(cwd, name)`, `overload: false`). Step 16 runs in `apps/web`, which has none, so it is not a reader. |

### Flag through turbo, rehearsed at run time (not only `--dry`)
Setup: scratch workspace, the repository's `turbo.json` plus `globalPassThroughEnv: ["ACADEMY_SKIP_ROOT_ENV"]`, a
package `@academy/web` whose scripts print the flag and whether `BETTER_AUTH_SECRET` is set, turbo 2.11.10 from
the repository, `--force`.

| Task | With the entry | Entry removed (M-env-turbo) |
|---|---|---|
| build | `flag=1` | `flag=UNSET` |
| typecheck | `flag=1` | - |
| dev (has its own `passThroughEnv`) | `flag=1`, secret passed | - |
| seed (own `passThroughEnv`) | `flag=1` | `flag=UNSET` |
| test:e2e (own `passThroughEnv`) | `flag=1` | - |
| test | `flag=1` | - |

The global entry merges with task-level `passThroughEnv`, so the flag reaches build, seed, typecheck and e2e. The turbo cache does not see the flag (see N1).

### Stepan's own flow after merge
- `pnpm dev`, `pnpm seed`, `pnpm test:e2e`: his shell does not set the flag, so turbo passes nothing and `loadRootEnv` sees it unset. The file exists, so it calls `process.loadEnvFile` and returns `"loaded"` with no log line. This is today's behaviour. `dev.passThroughEnv` gains `COURSE_ROOT`.
- `docker compose up -d --build --wait`: `COMPOSE_ENV_FILES` is unset in his shell, so compose reads `.env` as before. The image build has no `.env` (`.dockerignore` `**/.env*`), so `loadRootEnv` returns `"absent"` during `next build` in the build stage.
- CI: `checks` has no `.env` (`absent`). `e2e` runs `cp .env.example .env`, so the new entries must be comments (N3).
- README already says `pnpm dev ... reads DATABASE_URL from the root .env` (line 56). Step 47 adds the opt-out but does not say that unset means "unchanged". See N3.

### E-leak runtime against timeouts and CI
- Fragment build plus a 4.9 MB scan: under 1 s (measured). The app does no polling (`rg setInterval|EventSource|WebSocket|setTimeout` over `app components lib` is empty, and `notifications.tsx` makes one `get-session` read), so `networkidle` settles. Each visit costs about 0.5 s of idle wait.
- About 17 tests (catalog, 13 lessons, client navigation, not-found, `/`) of roughly 2-4 s each, serial in one file (no `fullyParallel`): about 1 min. Each test's `setTimeout(60_000)` is about 15x the expected time, and the 30 s default is also not at risk.
- CI `e2e` last took 2:28 against a 20 min limit. Adding C1-C4 (seconds; the full-filesystem hash of 4,036 files took under 1 s in the image) and the new specs leaves wide headroom.

## Issues

### O7. M-env-turbo makes the coder's real `next build` read Stepan's root `.env` [design 13.7, 14 step 1, 10]
M-env-turbo removes `ACADEMY_SKIP_ROOT_ENV` from `globalPassThroughEnv` and expects the skip line count in [B] to be 0. The rehearsal above shows what that build process sees: `flag=UNSET`. Under 4.Q11, unset plus an existing file means `load(file)`. Because `turbo.json` changed, the global hash changes, so it is a cache miss and `next.config.ts` really runs. The mutation therefore loads the main checkout's root `.env`, including `BETTER_AUTH_SECRET` and `DATABASE_URL`, into the coder's build. That is the exact read revision 2 exists to remove ("Real isolation, no accept reads"). The same applies to any `pnpm seed` or `test:e2e` run under the mutation.
Fix: prove M-env-turbo outside this checkout. Use a scratch turbo workspace like the one above: a copy of the step-1 `turbo.json`, scripts that echo the flag, turbo from the repository. Record `flag=1` with the entry and `flag=UNSET` without it, for build, typecheck, dev, seed and test:e2e. Keep the skip line in [B]/[S] as the positive proof on the real entry points. Add a rule to 13.6: no mutation may disable the opt-out (the turbo entry, `loadRootEnv`'s flag check, or a call site) while a real entry point can run in a checkout that holds a root `.env`. M-env-flag (injected `load`, temp file) and M-env-site (text scan) are safe as designed.

### O8. C2 as written fails on correct code: the runner's user cannot read the whole filesystem [design 7.3]
Revision 2 widened C2 to `find / -xdev -type f -exec sha256sum {} +` inside `docker compose run --rm --no-deps --entrypoint sh web`, and the runner image is `USER node`. In today's runner image (`academy-web:local`, same Dockerfile stages, run as `uid=1000(node)`):
- `find: /root: Permission denied`, plus `sha256sum: can't open '/lib/apk/db/lock'` and `'/etc/crontabs/root'`: 5 error lines, `find` rc **1**.
- With `--user 0`: rc 0, no errors, 4,036 files.

So under `set -euo pipefail` (the style of `check-image-migrations.sh`), C2 is red in CI on correct code. If the errors are suppressed instead, C2 silently skips `/root` and every unreadable file, and its "every regular file" claim is false. My round-1 suggestion said "hash `/`" without naming the user. This is the fix:
Run C2 as `docker compose run --rm --no-deps --user root --entrypoint sh web -c ...`. Require `find`/`sha256sum` rc 0 and empty stderr. Print and compare the number of hashed files with `find / -xdev -type f | wc -l` (same user), so a partial scan is red.

## Non-blocking

- **N1 [B] and the turbo cache.** Pass-through variables are not hashed. Rehearsed: an unflagged `build` followed by a flagged one gives `cache hit, replaying logs` with `flag=UNSET` in the log. Nothing reads the file on a hit, so this is not a leak. But if Stepan ever runs `pnpm build` on the same tree, the coder's skip-line grep goes falsely red. Use `pnpm exec turbo run build --force` in [B] (CI has no cache, so nothing changes there).
- **N2 Late prefetch.** A response can be pushed after `Promise.allSettled` and before `page.goto`, for example a viewport prefetch fired right after `networkidle`. Navigation then evicts its body and the read rejects, which fails the test on correct code. Coverage does not depend on prefetch, so rejected reads of requests carrying `next-router-prefetch: 1` that started after the last settle can be reported and ignored. Alternatively, snapshot and stop collecting before each `goto`.
- **N3 Docs.** Step 47 README: say that with `ACADEMY_SKIP_ROOT_ENV` unset the root `.env` loads exactly as before, that `1` skips it (with the stderr line), that any other value stops startup naming the variable, and that `COMPOSE_ENV_FILES=/dev/null` is the compose counterpart. In `.env.example`, write both new entries as comments: CI `cp .env.example .env`, and a live `COURSE_ROOT=` placeholder would reach `pnpm dev`.
- **N4 T-err part 2 stop.** `lsof -tiTCP:3232 | xargs kill` kills the listener. Also check that no `next dev` or `turbo run dev` process of the run is left (`pgrep -f`), or stop the background task itself.

## Attribution

O7 and O8 are architect issues (mutation recipe and check command as written). O8 also traces to my round-1
wording.

FAIL
