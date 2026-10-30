# #30 judge_design round 1: operations

Reviewer: judge-operations. Design: `plans/30-catalog-lesson-page-design.md` revision 1, ADR-0009 (Proposed),
research `plans/30-catalog-lesson-page-research.md`. No code exists yet; every check below was either read in
the repository or rehearsed in my scratchpad. Stepan's stack was never touched: `academy-web-1` StartedAt
`2026-10-30T13:10:31Z` and `academy-db-1` `2026-10-30T13:10:25Z` were the same before and after my scratch runs.
I did not open, print or checksum the root `.env`.

Verdict: **FAIL**, 6 issues. The Docker build stage, the after-merge path, the CI placement and rollback are
sound; the failures are in the tester recipe (T-err cannot run as written, rehearsed), in config docs, in
turbo inputs, in the e2e leak scan's determinism and runtime budget, in one logging gap, and in the
isolation recipe's "nothing reads the root `.env`" claim.

## What I checked, and what holds

| Area | Checked | Result |
|---|---|---|
| Build stage order (step 12) | `apps/web/Dockerfile`, `turbo.json`, `pnpm-workspace.yaml`, lockfile | Holds. `turbo run build --filter=@academy/web^...` builds `lesson-schema` and `db` (so `./schema` `dist` exists for the export); `tsx` is a devDependency and the build stage installs dev deps; `@esbuild/linux-arm64@0.28.2` and `@esbuild/linux-x64@0.28.2` are in the lockfile (static binaries, fine on musl), but `tsx` has never run in the alpine stage, so step 12's [S] is the first proof; `/out/course` is outside `outputFileTracingRoot` (`/repo`), so tracing cannot pick the export up; the second turbo run hits the in-layer local cache for the deps. |
| `rm -rf /repo/course` before `next build` | design 4.Q1, step 12 | Holds: the build stage keeps `course/` only in earlier layers of a stage that is never shipped; the runner copies only `/out/course`, standalone, static, public, drizzle. |
| `COURSE_ROOT=/app/course` and the fallback | `apps/web/.next/standalone/apps/web/server.js` | `process.chdir(__dirname)` is present, so cwd in the image is `/app/apps/web` and the fallback would also resolve to `/app/course`. `next dev` runs in `apps/web` under turbo, so `pnpm dev` with `COURSE_ROOT` unset reads `<repo>/course`. `turbo.json` `dev.passThroughEnv` += `COURSE_ROOT` is needed and planned. |
| Stepan's `docker compose up -d --build --wait` after merge | `.dockerignore`, `docker-compose.yml` | Picks up `course/` correctly: `course` leaves `.dockerignore`, `COPY . .` hashes it, so every content edit invalidates the copy layer and `--build` rebuilds. The remaining ignore patterns (`**/.env*`, `**/dist`, `**/coverage`, ...) match no allowlisted name; `find course -type l` is empty and no `package.json` exists under `course/`. Nothing new in `.env`, no migration. |
| Content change needs rebuild/restart | ADR-0009 item 8, step 44, compose header comment | Documented for the image (`up -d --build`); `pnpm dev` needs neither restart nor generator (per-request `cache()`). |
| Rollback | sections 11, 2.2 | `git revert` + `up -d --build`: no schema, no data, no volume change. Holds. |
| Healthcheck | compose `web.healthcheck` | Unchanged: `/` unauthenticated still redirects to sign-in, no course read before the session check. |
| CI placement and time | `.github/workflows/ci.yml`; last `main` run 41058329760 | `checks` 1:09 of 15 min, `e2e` 2:28 of 20 min. N1/N2 after `pnpm build` (CI has no turbo cache, so the build is fresh and course is on the host); C1-C3 after "seed the e2e user" (pnpm install and `lesson-schema` `dist` already present). `e2e` has no path filter, so content PRs also run C1/C2 and E-leak. Ample headroom. |
| N1 has input | `find apps/web/.next -name '*.nft.json'` | 16 nft files in today's local build; the "count above 0" rule can pass. |
| `t30` wrapper | rehearsed in bash 3.2 and zsh against a scratch compose file (`name: academy`) | `t30 config` resolves `academy-t30` and `academy-web:t30`; `-p`, `--env-file=.env`, `COMPOSE_PROJECT_NAME=academy` and a missing compose file all return 97 with `t30 REFUSED`. |
| Before/after record | 13.6 step 2 | Covers volume CreatedAt, `academy-web:local` image Id, both StartedAt and the `.env` checksum; teardown removes only `academy-t30` resources. Gap: see O1 (one-off container). |

## Issues

### O1. T-err cannot run as written, and its leftovers break teardown [design 13.4 T-err, 13.6]
Rehearsed in the scratchpad with the design's own `t30-env.sh` (extracted verbatim) and a scratch service:
1. `t30 run -d --rm --no-deps -p 127.0.0.1:3231:3000 ...` prints `t30 REFUSED: -p is fixed by the wrapper`,
   rc 97: the wrapper's `-p|-p*` case cannot tell `run -p` (publish) from the global `-p` (project).
2. "`docker compose logs` shows `web: course read failed:`": `docker compose logs` does not include one-off
   `run` containers (a detached `run` that echoed `marker-oneoff-log` showed nothing in `compose logs`, the
   line only in `docker logs <id>`). The tester would see the service container's clean log and report a
   failure on correct code, or skip the log assertion.
3. Nothing stops the detached `--rm` container. `docker compose down -v` left it `Up` and printed
   `Network ..._default Resource is still in use`; then `docker image rm academy-web:t30` fails on an image in
   use, and port 3231 stays bound.
Fix: `t30 run -d --rm --no-deps --name academy-t30-web-err --publish 127.0.0.1:3231:3000 -e
COURSE_ROOT=/app/course-missing web`; read logs with `docker logs academy-t30-web-err`; `docker stop
academy-t30-web-err` before teardown; add port 3231 to the "free ports" precheck; teardown asserts
`docker ps -aq --filter label=com.docker.compose.project=academy-t30` prints nothing before `image rm`.

### O2. `COURSE_ROOT` missing from `.env.example` [design 3.3]
`.env.example` line 1: "Every variable the code reads must be listed here." `courseRoot(env, cwd)` reads
`COURSE_ROOT`, and `next.config.ts` loads the root `.env` into `pnpm dev`, so a value there takes effect.
3.3 lists `.dockerignore`, `turbo.json`, `ci.yml`, `README.md`, not `.env.example`. Fix: a commented entry
(absolute path; unset = the repository's `course/`; the image sets `/app/course`; a relative value is
refused) in the step that adds `root.ts`.

### O3. Turbo test cache ignores `course/` although U-md reads it [`turbo.json`, 13.1 U-md]
U-md's real-course case reads every `course/**/theory.md` and `task.md`. `@academy/web#test` has
`inputs: ["$TURBO_DEFAULT$", "$TURBO_ROOT$/design/system/tokens.css"]`; `course/` is outside the package, so a
content-only edit replays the cached `pnpm test` result without running the case. CI has no turbo cache
today, so this bites locally (content authors, [U] after a content rebase), not in CI. Fix: add
`"$TURBO_ROOT$/course/**"` to that `inputs` list in step 22 (where the case lands), with the reason in the PR.

### O4. E-leak: fragment hygiene, body capture race and runtime are unspecified [design 7.2, RK6]
Measured with a script that applies 7.2's rule to today's `course/` (500 grader files of at least 64 bytes,
1.46 MB): 6,888 fragments, 6,794 after the allowed-corpus filter.
- *False red on correct code.* Fragments are not trimmed, so whitespace-led runs such as 20 spaces +
  `return` are fragments, and so is `abcdefghijklmnopqrstuvwxyz0123456789`
  (`00-introduction/02-agent-loop/checks/test_harness.py`). Both already occur in today's
  `apps/web/.next/server` output (a generic id alphabet and indented code from libraries); today's
  `.next/static` (14 files) has no hit, but #30 adds react-markdown, remark and Radix chunks to the client.
  RK6 turns any such hit into a stop-and-report on correct code. Fix: trim each fragment, require a minimum
  of non-space characters after trimming, and have the coder run the fragment set once against the t30
  image's served `/_next/static/**` and record collisions; any exclusion is an explicit list keyed by the
  exact fragment with a reason, printed with its count.
- *Race.* `response.text()` on a prefetch still in flight when the spec navigates throws (body evicted).
  Ignoring that leaves a hole in coverage; failing on it makes the spec flaky. Also, "Next prefetches every
  lesson link" holds only for links in the viewport, so the prefetch set depends on scroll. Fix: before each
  navigation, wait for `networkidle`, then await every pending body read (`Promise.allSettled`); a failed
  read of a same-origin text response fails the test naming the URL; do not rely on prefetch for coverage
  (each lesson is visited directly).
- *Runtime.* Naive `body.includes(fragment)` over 6,794 fragments costs about 180 ms per 236 KB body here.
  About 14 full page loads plus JS chunks (several hundred KB each, mostly identical across loads) can exceed
  Playwright's default 30 s test timeout (`playwright.config.ts` sets none). Fix: dedupe bodies by content
  hash before scanning, one test per lesson or an explicit `test.setTimeout`, and print the scanned byte
  count and duration in the report.

### O5. Text read failures are not logged [design 4 "Caching", 6.2]
The wiring logs `CourseReadError` once per request; `LessonTextReadError` only turns into the tab's error
state. A missing `theory.md` in the image would show "Не удалось загрузить текст урока" with nothing in
`docker compose logs`. Fix: log it the same way (`web: lesson text read failed: <file>: <reason>`, no
content), and assert that line in T-err.

### O6. The isolation recipe says compose never reads the root `.env`; the image scripts do [design 13.6]
13.6 says "compose never reads it (`--env-file /dev/null`)", but `check-image-migrations.sh` and the new
`check-image-course.sh` call bare `docker compose`, which loads `.env`. In a scratch directory, bare compose
interpolated `FROMFILE=fromfile` from `.env`; exported values win (the reason today's four keys have no
effect), but the file is read. `COMPOSE_ENV_FILES=/dev/null` stops it: with it, compose v5.4.0 resolved the
default instead. Fix: `export COMPOSE_ENV_FILES=/dev/null` in `t30-env.sh`, and a line in the rehearsal
proving it. Also record the Node loaders as an accepted residual: `next.config.ts`, `playwright.config.ts`
and `scripts/seed.ts` call `process.loadEnvFile` on the root `.env`; Node keeps already-set variables
(checked: an empty value is kept, an unset one is filled). For `dev`, `seed` and `test:e2e` every relevant
key is exported and passed through. For [B], turbo's `build` task passes nothing and `env -u` removes the
exported values, so `next.config.ts` fills `BETTER_AUTH_SECRET` and `DATABASE_URL` from Stepan's file into
the coder's `next build`. It opens no connection, so this has no effect, but it is a read, and the local [B]
no longer proves "the build needs no secret" (CI's `checks` job, which has no `.env`, still proves it).

## Non-blocking

- C2 hashes only `/app`. A later Dockerfile line that copies `course` elsewhere passes C1 and C2. Research
  2.6 proposed `find /`. Hashing `/` with `-xdev` and `/proc` and `/sys` pruned adds seconds.
- In C2, the host-side hash must not depend on `sha256sum` vs `shasum`. Node `crypto` keeps one code path
  for macOS and CI.
- Section 11: add `pnpm install` for host use after merge (new dependencies for `pnpm dev`/`pnpm test`).
  The rollout check can be `bash apps/web/scripts/check-image-course.sh` rather than the fixed count 46,
  which #42 will change.
- `e2e/course.ts` should read the repository's `course/` explicitly, not through `COURSE_ROOT`.
  `test:e2e` does not pass the variable through anyway, so make the intent visible.

## Attribution

All six are architect issues (design and recipe as written); none involves code yet.

FAIL
