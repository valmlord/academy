# #30 judge_code round 1: operations

Reviewer: judge-operations. Diff `git diff origin/main...HEAD` (10 commits, `f3a5afd`..`341266a`), design
revision 4 (sections 10, 11, 13.3-13.6, 16), ADR-0009, tester report.

Stepan's stack and root `.env` were not touched: `academy-web-1` / `academy-db-1` "Up 8 hours (healthy)" before
and after; `stat -f '%i %z %m' .env` = `56603218 184 1793365932` before and after (stat only). No compose command
ran in this checkout. Every pnpm/turbo command ran with `ACADEMY_SKIP_ROOT_ENV=1` and `COMPOSE_ENV_FILES=/dev/null`
exported, after [D] was green. Scratch files:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/ops30c/`.

Verdict: **FAIL**, one issue (observability of the most likely course misconfiguration).

## What I ran

| Check | Command | Result |
|---|---|---|
| [D] | `turbo run build --filter=@academy/web --dry=json` passthrough | `["ACADEMY_SKIP_ROOT_ENV=6b86b273...b4b"]` |
| `.env.example` live lines | `grep -cE '^(ACADEMY_SKIP_ROOT_ENV\|COURSE_ROOT)=' .env.example` | `0` (both entries comment-only) |
| lint | `biome check apps packages turbo.json package.json biome.json` | rc 0, 184 files (plain `pnpm lint` trips only on git-ignored local pipeline files, as the tester said) |
| typecheck | `pnpm typecheck` | rc 0, 5/5 |
| unit | `pnpm test`; `turbo run test --filter=@academy/web --force` | rc 0; web 30 files / 199 tests |
| build | `env -u BETTER_AUTH_SECRET -u DATABASE_URL turbo run build --force` | rc 0; skip line 1; "Dynamic filesystem access" 0 |
| N1/N2 | `bash apps/web/scripts/check-build-course.sh` | `N1 OK nft-files=22 course-files=0`, `N2 OK` |
| tree after build | `git status --porcelain` | only the pre-existing feedback edit and the test report (CI's "build changed tracked files" step stays green) |
| image | `docker build -f apps/web/Dockerfile -t academy-web:ops30j .` (plain build, not compose; removed afterwards) | rc 0; `Config.Env` has `COURSE_ROOT=/app/course`, user `node`; `/app/course` 46 files = host `export-course.ts list` 46; no `checks`/`starter`/`quiz.yaml` anywhere on the root fs outside node_modules; no `/repo`; files `root 644`, readable by `node` |
| missing root error | scratch `f1.mts`: `readCourse(nodeCourseFs, "/app/course-missing")` | `CourseReadError "" "missing"` (see issue 1) |
| CI budget | `gh run view 41115895705` (last main run) | e2e job 2m27s of 20, checks 1m00s of 15; the new C1-C4 step (one `find`+`sha256sum` over ~4,000 files in a throwaway container) and 54 e2e tests (17 s locally) leave a wide margin |

## Focus items

- **Dockerfile build stage.** `turbo run build --filter=@academy/web^...` builds lesson-schema and db first (the
  export imports `@academy/lesson-schema/schema` from `dist/`); `tsx` is a web devDependency, present in the build
  stage's full install; export and `rm -rf /repo/course` are one `RUN`, so no later layer of the build stage sees
  `course/`; `next build` then traces nothing from it. The runner gets only `/out/course` (root-owned) and
  `ENV COURSE_ROOT=/app/course`. Earlier build-stage layers do hold the full `course/`, but the build stage is
  never shipped. `.env` stays excluded by `**/.env`; the export reads no env file.
- **Compose.** Unchanged; `web.environment` stays an explicit list, so neither `COURSE_ROOT` nor
  `ACADEMY_SKIP_ROOT_ENV` from a `.env` can reach the container; the image's `ENV` is the only source.
- **CI.** `check-build-course.sh` after `pnpm build` and before the tracked-files check (it writes only a
  `mktemp` file); `check-image-course.sh` after the seed and before the e2e, against the CI compose project,
  with `--rm --no-deps -T` throwaway containers. No new step-level timeout is needed; the job timeouts hold.
- **turbo.** `globalPassThroughEnv: ["ACADEMY_SKIP_ROOT_ENV"]` is unset in CI and in Stepan's shell, so every
  task loads the root `.env` exactly as before (`loadRootEnv`: unset or `""` -> load; `1` -> skip; else throw,
  value echoed only up to 8 characters). `COURSE_ROOT` is passed to `dev` only, correct: `build` must not
  depend on it (request-time read), and e2e deliberately computes expectations from the repository `course/`.
  `course/**` in `@academy/web#test` inputs makes content edits re-run the web tests; the web `build` hash
  correctly ignores `course/`.
- **After merge (Stepan).** `.dockerignore` no longer excludes `course`, so his `docker compose up -d --build
  --wait` sends `course/` and the image gets `/app/course`; no migration (no `packages/db/drizzle` change;
  `vocabulary.ts` only switches to the schema-only import). His `.env` needs nothing new. Design 11 also says
  `pnpm install` first (new dependencies for `pnpm dev`/`pnpm test`).
- **Content changes.** README states that the compose stack shows a content change only after
  `up -d --build`; a stale image is also caught by C1 and by the e2e, which reads the repository course.
- **Rollback.** `git revert` + `pnpm install` + rebuild: the old image has no `/app/course` and the old code does
  not read it; nothing persistent changes.

## Issues

1. **[apps/web/lib/course/node-fs.ts:91-93, read.ts:62 and :112, server.ts:18, scripts/export-course.ts:62]
   The most likely course failure logs an empty file field.** When the course root does not exist (a wrong
   `COURSE_ROOT`, an image without `/app/course`, or `course` put back into `.dockerignore`), `listDirs(root, "")`
   throws `CourseFileError("", "missing")`, mapped to `CourseReadError("", "missing")`. Reproduced: the server
   logs `web: course read failed: : missing` (tester T-err part 1 saw the same line, F1), and the image build
   would stop with `export-course: CourseExportError: : missing`. Neither says that the course root is what is
   missing, nor that `COURSE_ROOT` is the knob, which is exactly what an operator needs at that moment. The
   empty-course case already uses `"."` (`read.ts:67`), so the two root-level failures are also inconsistent.
   Fix: name the root when `rel` is `""` (for example `"."`, as `findCourseDir` does, or `"<course root>"`),
   so the line reads `web: course read failed: .: missing`; add a unit case "a missing course root is reported
   as the root, not an empty name" in `node-fs.test.ts` or `read.test.ts`, watched red by reverting the change.
   README's "Course content" can add one sentence: `.: missing` means `COURSE_ROOT` points nowhere.

## Non-blocking

- `allowedDevOrigins`: README already sends `pnpm dev` users to `http://localhost:3000`; only `127.0.0.1` hits
  the cross-origin block (tester note). Worth one line in the next issue's 13.4 (tester and T-err runs use
  `localhost`), not in this diff.
- Docker layer cache: with `course/` in the context, every content edit invalidates `COPY . .` and reruns the
  install and the full build. Required by ADR-0009 (the image must carry the course) and no worse than any code
  edit; a separate course-only stage could make content rebuilds cheap later.
- PR body: 9.4 has no rollout block; the orchestrator should add design 11 verbatim (`pnpm install`,
  `docker compose up -d --build --wait`, `bash apps/web/scripts/check-image-course.sh`, revert procedure).
- `check-image-course.sh` on Stepan's machine runs `docker compose run --rm` against project `academy` (his
  `.env` is read by compose for interpolation, as for any compose call there); it only adds throwaway
  containers and never touches the running ones.

## Attribution

Coder (implementation of the file layer and its log line). Appended to `.claude/feedback/coder_mistakes.md`.

FAIL
