# #30 judge_code round 1: security

Reviewer: judge-security. Diff: `git diff origin/main...HEAD` (10 commits, 341266a..f3a5afd) on
`feat/30-catalog-lesson-page`. Read: role file, `coder_mistakes.md`, `judge_mistakes.md`,
`agent_roles_mandatory.md`, ADR-0009, the tester report (F1-F3). Code was read file by file; the reports were
not taken on trust. Ran myself: `ACADEMY_SKIP_ROOT_ENV=1 pnpm exec vitest run lib/course components/markdown
lib/root-env.test.ts app/entry-points.test.ts` -> 12 files, 77 tests passed.

## What I checked

### Grader material cannot reach a response, the client bundle, logs or the image
- `lib/course/view.ts`: every view (`toCatalogView`, `toDashboardView`, `toLessonView`) is built field by field
  from `tree`; no spread of a parsed `Lesson`/`Module`. No `checks`, `workspace`, `dir` or file name in any view
  type. Sources filtered to `http:`/`https:` via `new URL(...).protocol`.
- Server/client boundary: the only course data handed to client components is view fields
  (`TopBarNav courseId`, `Outcomes outcomes`, `CopyButton text` = code text already rendered, `TableOfContents
  sections` = heading text). `LessonText` (server, no directive) receives `lessonDir`; it is rendered into the
  `LessonTabs` client component as an element, so its props are never serialised into the RSC payload.
  `lib/course/server.ts` imports `server-only`. Grep of `"use client"` hits in `lib/routes.ts` and
  `lesson-panels.ts` are comments only.
- `lib/course/leak.test.ts`: canary over `inspect(views, {depth: Infinity})` plus every read text, and asserts
  the recorded fs requests are a subset of `learnerFiles(tree)` and that only `""` is listed. Good (uses
  `inspect`, not `String()`, per the 2026-10-29 coder lesson).
- `e2e/leak.spec.ts`: scans every same-origin text body (HTML, JS, JSON, RSC) on catalog, every visible lesson
  on both tabs, a client navigation, not-found and the dashboard, with a positive control and a minimum fragment
  count. Deviation ruling below.
- Image: `Dockerfile` builds deps (`--filter=@academy/web^...`), exports with `export-course.ts`, `rm -rf
  /repo/course`, then `next build`; the runner copies only `.next/standalone`, `.next/static`, `public`,
  `packages/db/drizzle` and `/out/course`. The build-stage `COPY . .` layer still holds `course/`, but no
  build-stage layer is shipped. `check-image-course.sh` C1-C4 (listing equality, grader bytes anywhere in `/`
  hashed as root, `COURSE_ROOT`, no grader names) and `check-build-course.sh` N1/N2 (no `.nft.json` lists a
  `course/` file) are wired into CI (`.github/workflows/ci.yml`). `.dockerignore` change is the intended one.
- `lesson.yaml` `checks[]`/`workspace` in `/app/course`: present, but stated as an accepted residual in ADR-0009
  Consequences (needed to validate `Lesson`, never in a view, guarded by the canaries). Not a finding; Stepan
  accepts the ADR.

### Allowlist, symlink and traversal refusal (`lib/course/node-fs.ts`)
- `refuseNonLearnerPath`: last segment must be one of the five `LEARNER_FILES`, and no segment may be
  `checks`/`starter`; applied before any fs call in `readText` and `isRegularFile`.
- `verifiedPath`: `realpath(root)` and `realpath(join(root, rel))`; refused unless equal to
  `${realRoot}/${rel}`. A symlink at any component, a `..`, `.`, `//` or trailing slash changes the real or the
  expected string, so it fails closed. Then `stat().isFile()`. `listDirs` uses `Dirent.isDirectory()`, which is
  false for symlinks. Tests cover a symlinked file, a symlinked lesson directory, EACCES, ELOOP and that no
  absolute path enters a reason.
- `learnerFiles(tree)` derives the export list from the parsed tree only; module and lesson directory names are
  schema-validated (`^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$`), ids are slugs, so no path syntax can come from YAML.
- `export-course.ts` reads through the same `nodeCourseFs`, skips only a missing `.md`, writes under
  `path.join(dest, rel)` with `rel` from the tree.

### Route params never reach fs paths
- Catalog and lesson pages compare `courseId` to `tree.id` and look up `lessonId` by equality in
  `findLesson` over visible lessons; the fs is reached only with `found.node.dir` (from the tree). `?tab=` goes
  through the closed `lessonTabOf`. The catch-all only builds a return path.
- Return paths: `lessonPath(courseId, lessonId)` / catch-all `encodeURIComponent` segments feed
  `requireSession` -> `signInPath` -> `encodeURIComponent`; the sign-in side keeps `safeNextPath` (rejects
  `//`, `/\`, backslashes, control characters). No open redirect.

### Error messages and logs never echo content
- `yaml.ts`: `prettyErrors: false`, `logLevel: "error"`, reason is `invalid YAML at line <n>` only; library
  messages are discarded. Tests for warning, second document, collection key.
- `read.ts`: schema failure reason is `issue.path` + `issue.code`; schema has no `z.record`, so a path holds
  only fixed keys and indices. `duplicate lesson id <slug>` echoes a slug that is public in URLs anyway.
- `fsFailureReason`: only `error.code` matching `^E[A-Z0-9]+$`; anything else is rethrown (Next's production
  error page hides it).
- `server.ts` logs `file: reason` only. F1 (`web: course read failed: : missing` for a missing root) leaks
  nothing; it is an operations/context issue, not security. Non-blocking here; if fixed, name a placeholder
  such as `<course root>`, never the absolute `COURSE_ROOT` value (the reason set must stay closed).
- `export-course.ts` prints `CourseExportError` with the same relative file and closed reason.

### Markdown (`components/markdown/lesson-markdown.tsx`)
- `react-markdown` 10.1.0 + `remark-gfm` 4.0.1, no `rehype-raw`, default `urlTransform` kept (custom `a` only
  restyles the already transformed `href`, same tab, no `target`), `disallowedElements: ["img"]`. Heading ids
  are generated (`sec-<n>`), never from content. Tests: raw HTML is literal text, no `<script>`, `javascript:`
  dropped, no `<img>`, and every raw HTML node of every real lesson text stays literal.
- `fragment-focus.tsx`: hash is decoded in try/catch and used only with `getElementById`, never as a selector.

### DAL and entry guard
- New pages `courses/[courseId]/page.tsx`, `lessons/[lessonId]/page.tsx`, `[...missing]/page.tsx` call
  `requireSession` before any course read, in both `generateMetadata` and the page. Dashboard keeps
  `requireSession("/")`. The `(app)` layout and `not-found.tsx` read the course only when `getSession()` is
  non-null. `app/entry-points.test.ts` passes with no new allowlist entry (#30 adds none).
- Catch-all not-found: requires a session, then `notFound()`; the proxy redirects cookie-less requests first.

### Root-env opt-out (`lib/root-env.ts`)
- `ACADEMY_SKIP_ROOT_ENV=1` skips before `existsSync`, so the file is not even probed; any other non-empty
  value throws, echoing it only up to 8 characters (longer values shown as a length). Three call sites
  (`next.config.ts`, `playwright.config.ts`, `scripts/seed.ts`) use it; `root-env.test.ts` asserts no other
  file calls `process.loadEnvFile` or imports dotenv. Unit tests use `mkdtemp` canary files, not the real
  `.env`. Vitest's own env loading reads `apps/web/.env*` only (none exist) and exposes only `VITE_*`. `turbo.json`
  passes the variable through globally; `.env.example` keeps it out of the copied file. compose passes the web
  an explicit `environment:` list, never `env_file`.

## Rulings on the coder deviations
- E-leak via `page.route` for RSC bodies: acceptable and stronger than the response event for streamed bodies;
  it fulfils with the same response, records prefetches, fails on an unreadable body (except a late prefetch),
  and asserts `rscResponses > 0`. Approved.
- `lib/routes.ts`, `lesson-panels.ts`, `lesson-text.tsx`: plain modules / a server component; `lessonDir` stays
  server-side. Approved.
- `CopyButton` takes the code text as a prop: that text is lesson Markdown already rendered into the page, so
  the RSC payload holds nothing new. Approved.
- Tabs `replaceState(null, ...)`: no security impact.
- `useOwnBucket` in five e2e specs: test-only `X-Forwarded-For` on `/api/auth/**`, the ADR-0008 residual
  already accepted for the request fixtures; no production code change. Approved.
- `FocusOnMount retryTargetId`: DOM ids only, no data. Approved.

## Non-blocking notes
- F1 above (route to operations).
- `learnerFiles` also exports `theory.md`/`task.md` of listed lessons that are not `ready`; the server never
  serves them (visibility check before any Markdown read). Not grader material; consistent with ADR-0009 item 2.

PASS - no security issues found
