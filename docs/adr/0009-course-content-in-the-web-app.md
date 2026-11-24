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
   apply). A third entry point, `@academy/lesson-schema/yaml` (#118), holds item 7's YAML parse rules and the
   reasons a failed parse gives, importing only `yaml` (no `node:fs`). The web loader, the workspace service and
   the validator parse every `course.yaml`, `module.yaml` and `lesson.yaml` through it and map its result to
   their own errors or issues. It is the parse step, not the loader, so the alternative "the loader in
   `@academy/lesson-schema`" stays rejected; it too changes no format.
5. **Visibility.** A lesson is visible iff its own status is `ready` and its module's status is `ready`
   (ADR-0001 item 4; Stepan, 2026-10-30). A module is shown "Доступен" iff it has a visible lesson, else
   "Готовится". A lesson that is not visible does not exist for the learner: its URL is "not found".
6. **One course.** The course root holds exactly one course; zero or several is a course read error until a
   design covers several courses.
7. **Failures.** An unreadable or invalid `course.yaml`, `module.yaml` or `lesson.yaml`, or a duplicate
   lesson id, makes the whole course unavailable (the designed "Не удалось загрузить курс" state); an
   unreadable `theory.md` or `task.md` affects only that tab ("Не удалось загрузить текст урока"). One
   internal file error is mapped to a separate type per caller (course read, lesson text, export). Error
   messages and log lines name the relative file and a closed reason (the schema issue path and code; a YAML
   line number; for a document that parses but cannot be converted, an alias that cannot be resolved or any
   other conversion failure, a fixed reason without a line, since the parser gives no position; or for a file
   that exists but cannot be read, `unreadable (<errno code>)` such as `EACCES` or `EIO`), never file
   contents and never the system error's message. YAML is parsed with `parseDocument`
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
  change. Rejected; only fs-free entry points for the web go there (`./schema`, and `./yaml` since #118).
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
- `content:validate` parses `course.yaml`, `module.yaml` and `lesson.yaml` with item 7's rules (#103): an
  error or a warning fails the file, and the issue gives the line and the parser's error code (for example
  `invalid YAML at line 5 (TAG_RESOLVE_FAILED)`), never the parser's message. content:validate, the web
  loader and the workspace service report an alias that cannot be resolved (unknown anchor, or alias
  expansion past the parser's default limit of 100, for example 100 aliases to one scalar anchor) as
  `invalid YAML: alias cannot be resolved (unknown anchor or too many aliases)`. The exception is an
  unresolved alias used as a `%YAML 1.1` merge source (`<<: *nope`): with yaml 2.9.1 the parser throws a plain
  error there, not the alias error, so it is a conversion failure. content:validate, the web loader and the
  workspace service give every conversion failure the fixed reason
  `invalid YAML: document cannot be converted to a value` without a line, and content:validate reports it as an
  issue on the file (#188); none of them reads the parser's message. Examples measured with yaml 2.9.1:
  `<<: *nope`, a `%YAML 1.1` merge key whose source is not a map (`<<: 5`), and an `!!omap` whose alias key
  repeats a later key. The rules exist once, in `@academy/lesson-schema/yaml` (#118, item 4); the web loader,
  the workspace service and content:validate map its result to their own errors or issues.
- The workspace service (#31) and the grader read their own subsets (`starter/`, `checks/`) through their
  own allowlists; this ADR covers only the web image.
- A second course needs a design (navigation, dashboard) and an amendment of item 6.
- The three Turbopack "whole project" warnings disappear (no web import reaches `validate.js`), so the
  standalone output no longer copies `apps/web` sources and tests.

## Amendments
- #101 (Proposed), 2026-11-09. Check titles and result messages may reach the browser. Proposed until Stepan accepts
  it in the #101 PR; the original text above stays, and the text here wins once accepted.
  - Item 3 gains: "Exception: the check-state views (`apps/web/lib/progress/check-state.ts`, built field by field)
    carry per check exactly `id`, `kind`, `title`, `timeoutSec` (command, hidden-task), `attempts.limit`,
    `attempts.mentorAfter`, `spendsTokens` and `maxSpendUsd` (hidden-task `budgetUsd`), plus progress data and result
    messages. Never `run`, `file`, `rubric`, `artifacts`, `task`, `verify`, `answers`, `passScore`, `minFound`,
    `weight`, `workspace`, file names, paths or scores. Check titles are learner text (`design/flows/checks.md` F13.3
    shows them); the grader's message of a result is learner output whose content ADR-0001 item 8 and ADR-0007 rules
    2 and 3 govern." Item 3 also gains: "The dashboard view carries lesson counts computed from checks, never a
    check."
  - Item 10, guards: "The e2e scan forbids fragments of the check fields `run`, `file`, `rubric`, `task`, `verify`,
    `answers` and of every grader file; check titles join the allowed corpus. The unit canary fixture gives its
    command check a visible title marker; a unit test over the check-state views asserts no `CANARY-` string and the
    title marker present. A page that renders results (from #34) adds exactly the messages of the results its test
    produced to that test's allowed corpus, never a pattern."
  - Consequences, the bullet "Accepted residual: grader metadata in the image.": "check titles" leave the parenthesis
    (they are learner text), and its scan sentence reads "the unit canary and the e2e response scan of item 10 are
    built from exactly these values, check titles excepted (#101)", because the e2e scan no longer forbids titles.
- #148 (Proposed), 2026-11-17. Consequences gain a residual of item 10's e2e scan. Check titles are learner text that
  reaches the browser (#101, item 3), so a title must never quote grader material: text of a grader file, of the check
  fields `run`, `file`, `rubric`, `task`, `verify`, `answers`, or of `workspace`. Titles join the scan's allowed
  corpus, so a forbidden fragment that a check title contains, from any lesson's grader material, leaves the fragment
  list, and no served body is reported for that fragment: not a page showing the title, not a response carrying the
  grader file or check field it came from. Such a body is still reported for any other listed fragment it contains
  whole; a grader file of at least 64 bytes whose fragments all sit in check titles adds no fragment, and a response
  carrying it whole is reported for whole listed fragments of other sources or not at all. This is one of the scan's
  limits. Nothing enforces the rule, it rests on authoring discipline: the lesson schema accepts any non-empty title,
  `pnpm content:validate` has no title rule, and the unit canary marks its title visible on purpose.
- #219 (Proposed), 2026-11-21. Several courses, as designed in #218 (`design/flows/courses.md` Q1-Q10,
  `design/flows/ia.md` "Several courses (#218)"). Proposed until Stepan accepts it in the #219 PR; the original text
  above stays, and the text here wins once accepted. Replaced text is quoted as it stands above; text an item or
  entry "gains" is added at its end. The code is #220; every error and focus state with several courses is #222;
  the per-course reference program is #221. Context keeps "There is one course" as the fact of 2026-10-30.
  - Item 6, "**One course.** The course root holds exactly one course; zero or several is a course read error until
    a design covers several courses.", reads: "**Several courses.** The course root holds one or more courses.
    Every real directory directly under the root is a course, and its name is the course id; the `id` in its
    `course.yaml` must equal that name, or that course fails to read (item 7). So two courses never share an id, and
    a course has an id even while it fails. A directory without a regular `course.yaml` is a course that fails, not
    a skipped directory, so the web, the workspace service and `content:validate` agree on what a course is. Files
    and symlinks directly under the root are not courses. A root with no real directory is a root failure (item 7),
    because the repository ships `course/` and an empty root is a misconfiguration. Courses are listed in ascending
    order of their ids compared as plain strings; the lesson format has no course `order` or `status` field. A
    course id is permanent once a learner has progress in it, as a lesson id is (ADR-0007 item 3), because every
    progress row and every workspace key carries it."
  - In item 7, the sentence "An unreadable or invalid `course.yaml`, `module.yaml` or `lesson.yaml`, or a duplicate
    lesson id, makes the whole course unavailable (the designed "Не удалось загрузить курс" state); an unreadable
    `theory.md` or `task.md` affects only that tab ("Не удалось загрузить текст урока")." reads: "An unreadable or
    invalid `course.yaml`, `module.yaml` or `lesson.yaml`, a `course.yaml` whose `id` is not its directory's name,
    or a lesson id that repeats within the course makes that course unavailable (the designed "Не удалось загрузить
    курс" state) and no other course; an unreadable `theory.md` or `task.md` affects only that tab ("Не удалось
    загрузить текст урока"). Lesson ids are unique per course; two courses may use the same lesson id. A root
    failure makes every course unavailable (the designed "Не удалось загрузить курсы"): `COURSE_ROOT` not absolute,
    a root that is missing or cannot be listed, or a root with no course (item 6). The course read error tells a
    root failure from a course failure; a course failure carries its course id, known from the directory name
    before any file is parsed." The rest of item 7 is unchanged.
  - In item 1, the sentence "The web server reads the course at request time from the directory in `COURSE_ROOT`
    (absolute; the image sets `/app/course`; when unset, `pnpm dev` uses the repository's `course/`)." reads: "The
    web server reads the courses at request time from the course root, the directory in `COURSE_ROOT` (absolute;
    the image sets `/app/course`; when unset, `pnpm dev` uses the repository's `course/`)." Item 1 gains: "The
    export copies every course of the root. Any root or course failure fails the export (exit 1) and so the web
    image build, as with one course: an export that skipped a failing course would ship an image without it, whose
    URLs would answer "not found" instead of the course error. In CI such a course turns the `e2e` job red at its
    `docker compose up -d --build --wait` step, which builds the image and so runs the export, and turns the
    `content` job (`pnpm content:validate`) red for every failure the validator also reports. GitHub enforces
    neither: main has no branch protection, so a failing course stays off main by the project's rule that a pull
    request merges only on green CI. On a host, a failed build stops `docker compose up -d --build` before it
    recreates the web container, so the running web keeps serving its previous image until the course is fixed;
    this is compose's order (build, then recreate), reproduced in the #219 design review with Docker 29.9.2 and
    Compose v5.6.1."
  - In item 2, the sentence "Exactly `course.yaml` of the course, `module.yaml` of every module listed in it, and
    `lesson.yaml`, `theory.md`, `task.md` of every lesson listed in those, at those paths only." reads: "For every
    course of the root: exactly its `course.yaml`, `module.yaml` of every module listed in it, and `lesson.yaml`,
    `theory.md`, `task.md` of every lesson listed in those, at those paths only." In item 2, the sentence "The
    listing is a pure function of the course tree the loader parsed (`learnerFiles(tree)`): the export copies
    exactly that list, and the server opens only files on it (the YAML files to build the tree, the two Markdown
    files of a visible lesson), so the image holds exactly what the server can read." reads: "The listing is a pure
    function of the course trees the loader parsed (`learnerFiles(tree)` of each course, joined): the export copies
    exactly that list, and the server opens only files on it (the YAML files to build a tree, the two Markdown files
    of a visible lesson), so the image holds exactly what the server can read."
  - Item 3 gains: "The course id leaves the server (URLs, views, the workspace key). It is an id, not a directory
    path in this item's sense, although it equals the course directory's name (item 6)."
  - Item 5 gains: "Routes keep their shape, with the course id of item 6: a catalog is `/courses/<courseId>`, a
    module its catalog's `#<moduleId>` section, a lesson `/courses/<courseId>/lessons/<lessonId>`. Today's URLs stay
    valid, because the one course's directory name equals its id. There is no `/courses` route: it is a path no
    route matches. A catalog or lesson URL whose course id names no course of the root is not found."
  - In item 8, the sentence "Each request reads the course once (React `cache()`); the image's content is immutable,
    so a content change needs `docker compose up -d --build`." reads: "A request reads each course its page shows at
    most once (React `cache()` per course id) and no other course: the dashboard every course; a catalog its URL's
    course and, for "Другие курсы", the `course.yaml` of each other course; a lesson page, its `generateMetadata`
    and its server actions the course their course id names; the `(app)` layout with the top bar none; the
    not-found page at most the course its "Открыть курс" opens (#218 A218-12; the page gets no route parameters,
    so #220 decides how it learns that id). Every course id that arrives with a request is untrusted, whatever
    carries it: a route parameter of a page or of its `generateMetadata`, a server action argument (the lesson
    actions take `courseId` from the browser, independent of the page URL), the value the not-found page uses, and
    any later entry point. It reaches a course only through the one per-course read function, which checks it
    against the lesson schema's id form, then looks it up among the directory names the root lists, and builds
    every path from the listed name, never from the id it was given, so no caller can skip the check. An id that
    fails either step opens no file and names no course: a page or its metadata is not found (item 5), a server
    action returns its failed result, and the not-found page reads no course. The startup outcome recompute
    (ADR-0007 rule 7(b)) reads every course and leaves the rows of a failing course alone, as it leaves the rows of
    an unknown course. The image's content is immutable, so a content change needs `docker compose up -d --build`."
  - Item 10 gains: "Per course: the unit canary runs over a fixture root of two courses, each directory named by its
    id, one of them failing (item 7), and covers every view model and every requested file of both; the e2e scan
    visits the dashboard, every catalog, every lesson of every course and the not-found page, and both its allowed
    corpus and its fragments come from every course; the image check compares `/app/course` with the export's list,
    which covers every course. The e2e course-unreadable spec breaks `course.yaml` of every course at once
    (`/app/course/*/course.yaml`), so it tests every course failing, not a root failure; a spec with one course
    failing beside a readable one comes with #222's states."
  - In the #148 entry, the words "from any lesson's grader material" read "from any lesson's grader material in any
    course", and the entry gains: "The corpus joins the check titles of every course, so a title in one course also
    removes a fragment of another course's grader file."
  - In Consequences, the bullet "A second course needs a design (navigation, dashboard) and an amendment of item 6."
    reads: "Several courses are designed in #218 and decided in the #219 amendment. A course `order`, `status` or
    short title would be a format change (ADR-0001 item 7). A renamed course directory orphans its learners'
    progress (item 6): its pages and progress no longer show, and reconcile removes the old id's stopped containers
    as `lesson-gone` and keeps their volumes (ADR-0002 item 8). Renaming the directory back restores it: no code
    deletes a progress row of an unknown course (rows go only with their user), no volume is removed (ADR-0002 item
    8), and `ensure` creates a new container on the kept volume and skips the starter copy, because the volume holds
    the starter marker (ADR-0002 item 7), so the learner's files return. Progress made under the new id in the
    meantime stays under the new id. CI does not detect the rename, because it has no database."
  - Operator signals (obligation of #220). #220 decides and documents what is logged so that an operator can tell a
    failing course, a root failure, and progress rows of a course id that has no directory, and pins each such line
    with a test. These lines carry no user id and no file contents.
  - Other ADRs. Each assumed one course; none is edited by #219, and #220 updates each sentence named here together
    with the code that makes it true.
    - ADR-0001 item 2: the course directory's name equals the `id` in its `course.yaml`, the root holds one or more
      courses, and a course id is permanent once a learner has progress. This is a format change under item 7,
      because a course valid today (an `id` other than its directory's name) becomes invalid; #220 makes it in the
      PR that adds the validator rule, and its migration is empty, because the one course complies. Item 6's "id
      uniqueness" reads: lesson ids per course, course ids by item 6 here. `content:validate` reports, from #220: an
      `id` that is not its directory's name, a root with no course, and a symlink directly under the root; it
      already reports a directory without `course.yaml`.
    - ADR-0007: no change. Item 3 keys every row by `(course_id, lesson_id)`, so course id permanence (item 6 here)
      follows from it; rule 7(b)'s "every progress row whose lesson is visible" already leaves a failing course's
      rows alone; #218's course ordering by activity needs no schema change (`enrollments.enrolled_at`,
      `attempts.started_at`).
    - ADR-0002 item 8: "removes nothing in a pass when the course is unreadable" reads per course. A pass in which
      the root fails removes nothing; otherwise it keeps every stopped container of a failing course and treats a
      container whose course id names no course of the root as `lesson-gone`. The workspace service reads each
      course all or nothing, for the reason it reads one course that way: a reader that skipped a bad lesson would
      let reconcile treat that lesson's workspaces as orphans.
    - ADR-0010 item 6: `PUT` reads the root and its own course only, so another course failing does not affect it.
      Its course id is a route path parameter, untrusted like the web's (item 8 here): item 3's key rule answers a
      non-slug id with `400 invalid-workspace-key` before any read, and the service's per-course read function looks
      the id up among the directory names the root lists and builds paths only from the listed name, so an unlisted
      id is `404 lesson-not-found` and opens no file. The other routes of item 3 read no course file. `500
      course-unreadable` is the root or that course failing ("the whole course" is that course).
