# ADR-0009: Course content in the web app

- Status: Proposed
- Date: 2026-10-30
- Issue: #30

## Context
#30 builds the catalog and the M0 lesson page, the first pages that show `course/`. ADR-0001 fixes the lesson
format (item 1: the platform imports its types from `@academy/lesson-schema`; item 4: the learner sees only
`ready`; item 5: grader material never reaches the browser). ADR-0002 mounts `checks/` only into the grader
process of the workspace container. Facts, with sources: the #30 research notes and
section 0 of the #30 design (PR #85), working notes that are not published.

- A lesson directory holds more than the learner may see: `checks/` (277 files in the course today, grader
  scripts and answer keys), `starter/` (copied by the workspace service, #31), and in 10 of 13 lessons a
  `quiz.yaml` at the lesson root with `correct:` answers and explanations. The validator enforces `checks/`
  only for hidden-task, bug-hunt and rubric files, so `quiz.yaml` is outside `checks/` (research 2.2).
- `lesson.yaml` itself carries grader data: `checks[].run` (commands), file names under `checks/`.
- `apps/web` runs as a Next.js 16.4.3 standalone server in an image built from the repository root. Next
  traces files reached by `fs` calls whose path it can resolve statically and copies them into
  `.next/standalone`, which the Dockerfile ships whole. Today `course` is in `.dockerignore`.
- `@academy/lesson-schema`'s only entry point re-exports `validate.js` (directory walks with `node:fs`); it
  reaches the web through `@academy/db` and causes the build's three "Dynamic filesystem access causes
  tracing of the whole project" warnings (`apps/web/.turbo/turbo-build.log`).
- There is one course (`course/ai-for-developers`); the designs name one "Курс" link and one dashboard.

## Decision
1. **Runtime reads of an allowlisted copy.** The web server reads the course at request time from the
   directory in `COURSE_ROOT` (absolute; the image sets `/app/course`; when unset, `pnpm dev` uses the
   repository's `course/`). The image holds only the files listed in item 2: the Docker build stage exports
   them with `apps/web/scripts/export-course.ts`, then deletes `course/` before `next build`, so tracing
   cannot ship anything from it; the runner copies the export to `/app/course`.
2. **The allowlist, by structure.** Exactly `course.yaml` of the course, `module.yaml` of every module listed
   in it, and `lesson.yaml`, `theory.md`, `task.md` of every lesson listed in those, at those paths only. A
   path whose real path differs from its logical path (a symlink anywhere on it) is refused. Never
   `checks/`, `quiz.yaml`, `starter/`, or any unlisted file or directory. The listing is a pure function of
   the course tree the loader parsed (`learnerFiles(tree)`): the export copies exactly that list, and the
   server opens only files on it (the YAML files to build the tree, the two Markdown files of a visible
   lesson), so the image holds exactly what the server can read. The file-system layer refuses on its own
   any other file name and any path through `checks` or `starter`, so a later caller cannot widen the set by
   accident.
3. **What leaves the server.** View models are built field by field (no spreading of parsed YAML); they
   never carry `checks`, `workspace`, file names or directory paths. Markdown is rendered on the server.
4. **Where the code lives.** The loader and the view models live in `apps/web/lib/course/` (web-specific:
   the learner-visible subset and the shapes the pages need); they use `Course`, `Module`, `Lesson` from
   `@academy/lesson-schema` and define no lesson types of their own (ADR-0001 item 1). The package gains a
   second entry point `@academy/lesson-schema/schema` (schemas and constants, no `node:fs`); the web and
   `@academy/db` import from it. This adds an import path and changes no format (ADR-0001 item 7 does not
   apply).
5. **Visibility.** A lesson is visible iff its own status is `ready` and its module's status is `ready`
   (ADR-0001 item 4; Stepan, 2026-10-30). A module is shown "Доступен" iff it has a visible lesson, else
   "Готовится". A lesson that is not visible does not exist for the learner: its URL is "not found".
6. **One course.** The course root holds exactly one course; zero or several is a course read error until a
   design covers several courses.
7. **Failures.** An unreadable or invalid `course.yaml`, `module.yaml` or `lesson.yaml`, or a duplicate
   lesson id, makes the whole course unavailable (the designed "Не удалось загрузить курс" state); an
   unreadable `theory.md` or `task.md` affects only that tab ("Не удалось загрузить текст урока"). One
   internal file error is mapped to a separate type per caller (course read, lesson text, export). Error
   messages and log lines name the relative file and a closed reason (the schema issue path and code, a YAML
   line number, or for a file that exists but cannot be read, `unreadable (<errno code>)` such as `EACCES` or
   `EIO`), never file contents and never the system error's message. YAML is parsed with `parseDocument`
   and pretty errors off, so no parser message or warning quotes a source line; a YAML warning counts as an
   error (fail closed). `logLevel` is `"error"` because at the library's default, converting the document
   (`toJS()`) writes a collection key's text to the process warnings, and `"silent"` would also drop the
   error for a second YAML document; a unit test pins each of the two. One parser output is not gated by
   `logLevel`: yaml prints every lexical token, so the whole file, when the debug variable `LOG_TOKENS` is
   set in the process environment. It is never set by the project, and it cannot reach the web: compose passes
   the web an explicit variable list and turbo's strict mode drops undeclared variables.
8. **No process-wide cache.** Each request reads the course once (React `cache()`); the image's content is
   immutable, so a content change needs `docker compose up -d --build`.
9. **Markdown.** `react-markdown` 10.1.0 with `remark-gfm` 4.0.1 in server components, defaults kept: raw
   HTML in lesson files renders as literal text, `javascript:` URLs are dropped. No `rehype-raw`, no
   sanitiser that drops unknown tags (it would delete "<actor>" in lesson text), no syntax highlighter (the
   design system has no syntax colours). Images are not rendered until a design covers them, so a lesson
   cannot make the learner's browser fetch a third-party URL.
10. **Guards, each seen red once:** a unit canary over every view model and every file the loader requests;
    an e2e scan of every response body (HTML, RSC, JS) of the dashboard, the catalog, every lesson and the
    not-found page against fragments of the real grader files; an image check that `/app/course` equals the
    allowlist, holds no file or directory named `checks`, `starter` or `quiz.yaml`, and no grader file's bytes
    exist anywhere in the image's filesystem; a build check that no `.nft.json` lists a file under `course/`.

## Alternatives considered
- **A build-time snapshot** (JSON of the views bundled into server code): no course files in the image and
  no runtime reads, but the designed course-error state becomes unreachable, `pnpm dev` needs a generator
  or watcher to show content edits, and a generated file joins the repository or the build graph. Rejected:
  item 1 keeps the same leak guarantee with less machinery.
- **A compose bind mount of `./course`**: edits without rebuild, but `checks/` and `quiz.yaml` would sit in
  the web container (against ADR-0002 and ADR-0001 item 5). Rejected.
- **A denylist** (copy `course/` minus `checks/`): ships `quiz.yaml` answers and `starter/`, and every new
  grader file name outside `checks/` leaks by default. Rejected.
- **The loader in `@academy/lesson-schema`**: one structure walk for validator and loader, but the package
  would own web view concerns (visible subset, view shapes) and every web change would be a contract-package
  change. Rejected; only the fs-free entry point goes there.
- **A process-wide memo**: saves a few milliseconds per request, but "Повторить" could never recover from a
  memoised failure and `pnpm dev` would need a restart after each content edit. Rejected.

## Consequences
- The web image changes with every content change; `docker compose up -d --build` is the documented path.
- `quiz.yaml` answers stay outside `checks/` (a gap against ADR-0001 item 5 in the content contract). #36
  (quiz) must either move them under `checks/` (a format change under ADR-0001 item 7) or add `quiz.yaml`
  to the allowlist with the answers stripped server-side; until then the allowlist keeps them out.
- **Accepted residual: grader metadata in the image.** `/app/course` holds every listed `lesson.yaml` whole,
  including `checks[]` (commands such as `python3 -I "$ACADEMY_CHECKS_DIR/verify_routing.py"`, check titles,
  grader file names) and `workspace`. These are not answer keys. Stripping them would break parsing: the
  loader validates the whole `Lesson`, whose refinement requires `checks` for every ready practice lesson
  and a `workspace` for command checks. They stay on the server: views never carry them (item 3), and the
  unit canary and the e2e response scan of item 10 are built from exactly these values. Anyone with a shell
  in the web container can read them, as they can read the repository.
- `content:validate` (the package's `parse`) tolerates a YAML warning that the web treats as an error (item
  7). A content edit with such a warning passes `content:validate`, but the web shows "Не удалось загрузить
  курс", so the CI `e2e` job (no path filter) fails on the catalog; all course files have no warning today.
  Aligning the validator is a contract-package change for a later issue.
- The workspace service (#31) and the grader read their own subsets (`starter/`, `checks/`) through their
  own allowlists; this ADR covers only the web image.
- A second course needs a design (navigation, dashboard) and an amendment of item 6.
- The three Turbopack "whole project" warnings disappear (no web import reaches `validate.js`), so the
  standalone output no longer copies `apps/web` sources and tests.
