# #30 judge_code round 2: operations

Reviewer: judge-operations. Branch `feat/30-catalog-lesson-page` at `c86ff9e` (10 commits on `6871f93`); round 1
reviewed `341266a`. Inputs: round-1 review, tester re-test section, `git diff 341266a c86ff9e` (19 files, +87/-31).

Stepan's stack and root `.env` untouched: `stat -f '%i %z %m' .env` = `56603218 184 1793365932` at start and end
(same as round 1); `academy-web-1` / `academy-db-1` "Up (healthy)" at start and end. No compose command ran. Every
pnpm/turbo command ran with `ACADEMY_SKIP_ROOT_ENV=1` and `COMPOSE_ENV_FILES=/dev/null`. Scratch:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/ops30r2/`.

Verdict: **PASS**.

## Round-1 issue 1 (missing course root logged with an empty name): fixed

- Code: `lib/course/errors.ts` adds `COURSE_ROOT_FILE = "."`; `node-fs.ts:54` `withReason` maps `rel === ""` to it,
  which covers every fs call on the root (`listDirs`, `readText`, `isRegularFile` all go through `withReason`);
  `read.ts:67` uses the same constant for "expected exactly one course", so both root-level failures name `.`.
  `server.ts:18` logs `${error.file}: ${error.reason}`; `export-course.ts` builds `CourseExportError` from the same
  `file`/`reason`, so the image build would stop with `CourseExportError: .: missing`.
- Reproduced with my round-1 script (`ops30c/f1.mts`) on the current code: `/app/course-missing` ->
  `CourseReadError "." "missing"` (round 1: `""`); `/tmp` -> `CourseReadError "." "expected exactly one course, found 0"`.
- Unit cases: `node-fs.test.ts` "reports a missing root as the root itself" and `read.test.ts` "names a missing
  course root as the root, not as an empty file name" (asserts `message` `.: missing`). The tester watched both
  go red with the mapping reverted (`expected '' to be '.'`). I did not repeat the mutation (no product writes).
- Design 5.4 (`### 5.4 Errors`, line ~459) now lists `missing` for the course root (file `.`, `COURSE_ROOT_FILE`) and
  both resulting lines.
- README "Course content": one sentence, `.: missing` means `COURSE_ROOT` points nowhere or the image lacks
  `/app/course`.
- Tester T-err part 1: three `web: course read failed: .: missing` lines, no content.

## Round-1 delta is not operational

`git diff --name-only 341266a c86ff9e -- 'docker-compose*.yml' .github turbo.json apps/web/Dockerfile .dockerignore
package.json pnpm-lock.yaml apps/web/package.json apps/web/scripts apps/web/next.config.ts .env.example`: empty.
The delta is the error naming above, `LessonTextKind` dedup (type-only), Alert/Item/Breadcrumb class strings, an
e2e assertion, comments, README and design text. My round-1 build, image, N1/N2 and C1-C4 results therefore still
hold; the tester also re-ran build, image, N1/N2, C1-C4 and e2e 54/54 twice on `c86ff9e`.

## Commands I ran on `c86ff9e`

| Check | Result |
|---|---|
| `biome check apps packages turbo.json package.json biome.json` | rc 0, 184 files |
| `pnpm typecheck` | rc 0 |
| `turbo run test --filter=@academy/web --force` | rc 0, 30 files / 201 tests (round 1: 199, +2 new cases) |

## Merge into current `origin/main` (`159fe90`, #84)

- `git merge-tree --write-tree --name-only origin/main HEAD`: rc 0, tree `4f37bf9`, no conflicts.
- #84 touches only `course/`, `plans/42-*` and `.claude/feedback/*`; none of this branch's operational files.
- The merged course changes what this branch ships: `02-agentic-patterns` goes from `planned` to `ready` with 5
  lessons. Checked on the merged tree (`git archive 4f37bf9` into scratch, node_modules symlinked):
  - `export-course.ts list <merged>/course`: rc 0, 61 files (46 on HEAD; the 15 new are exactly the 5 lessons'
    `lesson.yaml`/`theory.md`/`task.md`); 0 paths under `checks/`, `starter/` or `quiz.yaml`, so the image
    allowlist holds for the new module.
  - `readCourse` on the merged course: 6 modules, no error.
  - lesson-schema `validate ../../course`: 1 course, 6 modules, 18 lessons, 0 issues.
  - web `vitest run` (includes "LessonMarkdown on the real course"): 30 files / 201 tests passed.
  - Not run: e2e and C1-C4 against the merged tree (would need a stack). Both compute expectations from the
    repository `course/` and C2 hashes every `checks/` file, so they adapt to the new module; the PR's CI run on the
    merge ref is the authority for that.

## Non-blocking (carried over)

- PR body: add design 11's rollout block (`pnpm install`, `docker compose up -d --build --wait`,
  `bash apps/web/scripts/check-image-course.sh`, revert procedure). After merge with #84, C1 expects 61 files, not 46.
- `allowedDevOrigins` note for the next issue's 13.4.
- Tester G1 (ring transition not guarded by a test) is an architecture/test item, not operational.

PASS
