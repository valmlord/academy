# #30 research: course catalog and lesson page from course/

Researcher, 2026-10-30. Branch `feat/30-catalog-lesson-page`, tier PROJECT. Sources are repository paths at
`7706f71` (main after #81) and the Next.js 16.4.3 docs shipped in `apps/web/node_modules/next/dist/docs`
(the installed version, `package.json` `"version": "16.4.3"`). Library versions from `npm view` on 2026-10-30.
No product code was written.

## 0. Issue #30, full acceptance list

Original (from `backlog/04-lesson-page.md`):
- I1 lessons not in status `ready` are not visible
- I2 the contents of `checks/` are never sent to the browser (with a test for it)
- I3 e2e: open a module, open a lesson, see the theory
- Body text: "Web reads the course through `@academy/lesson-schema` (no lesson types of its own) ... the lesson
  page: theory and the task on the left (markdown), a workspace stub on the right for now." (see Q4: the
  design's M0 lesson has no right pane)

Deferred from #29 (waiver of ADR-0006 item 5, `plans/29-sign-in-dashboard-design.md` 9.2):
- D-a top bar link "Курс" to `/courses/[courseId]`; tab order as in the dashboard acceptance notes
- D-b AC1 Card with the first `ready` lesson in catalog order (no progress filter until #35), AC2 "Начать" only (R5)
- D-c AC5 module rows: title, "Готовится" Badge, link to `/courses/[courseId]#[moduleId]` focusing the module heading
- D-d AC7 "В курсе пока нет готовых уроков" only when no lesson is `ready`
- D-e AC8 course read failure with "Повторить"; loading state (Skeleton)
- D-f AC13 and the "Design conformance" evidence for every dashboard state it adds

Not #30 (owned by #35): dashboard AC3, AC4, AC5 counts and bars, AC6, AC9, AC1 "not finished" filter,
"Продолжить". Not #30 (owned by #31/#32/#34): everything of the lesson page outside the M0 lesson.

## 1. Design acceptance items in scope (all three pages `Status: ready` on main)

### 1.1 Catalog, `design/pages/catalog/acceptance.md` (flows F2, F3, F5, F6)
Route `/courses/[courseId]`, title and h1 = course title; sections `#[moduleId]` (module.yaml `id`, e.g.
`#introduction`), decision A6.
- AC1 every module of `course.yaml`, in order, with number (directory prefix "00"), title, status "Доступен"
  (has `ready` lessons) or "Готовится" (`planned`, or `ready` without a `ready` lesson). F5.1
- AC2 module link focuses its section heading (`tabindex="-1"`) and sets the fragment; arrival with
  `#<moduleId>` focuses that heading. F5.2
- AC3 ready module section: summary, "Чему научитесь" + module outcomes, only `ready` lessons, each ONE link:
  number, title, "<type>, около N мин", lesson status by R5. F5.3
- AC4 planned module, or ready with no ready lesson: "Уроки модуля готовятся" (Empty), no list; planned
  modules have no outcomes, so "Чему научитесь" is omitted, not drawn empty.
- AC5 prerequisite not passed: "Сначала пройдите: " + one link per missing lesson right after its row in Tab
  order; a broken prerequisite id is not shown; passed ones not listed. F6.1
- AC6 lesson links open the lesson on Теория (Задание when no theory). F5.4
- AC7 "Не пройден" Badge only once checks can close (D1): not reachable in #30.
- AC8 course read failure: only "Не удалось загрузить курс" (Alert title is the h1) and "Повторить" in
  `main`; "Повторить" reloads and focuses the h1.
- AC9 progress read failure "Прогресс недоступен" (only if #30 reads progress, see Q2).
- AC10 session expiry fills the existing `role="alert"` container (exists from #29, `components/notifications.tsx`).
- AC11 user menu and F6 cycle as dashboard (F6: "Академия", "Уведомления" when non-empty, `main` first
  module link or "Повторить").
- AC12 no horizontal scroll at 375, 768, 1280, light and dark.
- States: default, failed-lesson (D1, not #30), ready-no-lessons, loading (Skeleton `aria-hidden`, h1
  arrives with data), course-error, progress-unavailable, session-expired, user-menu.
- Components: Badge (module and lesson status variants), Item (`a.item` rows), Separator, Empty, Alert,
  Button, DropdownMenu, Skeleton. Composition `.item-note` for the prerequisite note, `.icon-note` for
  "Прогресс недоступен". Layout: one column, `max-width: 48rem`, gap `space-8`.
- Copy: "Курс", "Не удалось загрузить курс", "Повторить", "Прогресс недоступен", "Доступен", "Готовится",
  "Чему научитесь", "Уроки модуля готовятся", "<type>, около N мин", "Не начат"/"В процессе"/"Пройден"/
  "Не пройден", "Сначала пройдите: <lesson title>". Lesson type labels from ia.md: теория, квиз, артефакт,
  оценка агента, поиск багов, проект (schema `type` values theory, quiz, artifact, agent-eval, bug-hunt, project).
- Open question in the notes: number format "00." (directory prefix) is data formatting only.

### 1.2 Lesson, `design/pages/lesson/acceptance.md`, M0 lesson only (flows F2, F3, F6, F7)
Route `/courses/[courseId]/lessons/[lessonId]`, `lessonId` = `lesson.yaml` `id` (prototype and sign-in
acceptance use `/courses/ai-for-developers/lessons/intro-models-effort`). `?tab=theory|task|checks` read on
arrival and written with `history.replaceState` on selection; a tab not shown in the release (Проверки in
M0) falls back to Теория (Задание without theory).
The M0 lesson (`design/flows/lesson-environment.md` "Lesson page by release", `#state-m0`): region "Урок"
only, full width at every width, no switch, no handle, no check bar, no Проверки/Квиз tab, no
"Окружение", no idle warning; muted line "Окружение и проверки появятся в следующей версии платформы" under
the header. Controls: skip link, top bar, "Войти снова", breadcrumbs, "Показать все"/"Свернуть",
prerequisite links, tab list, "Содержание" links, "Копировать", source links, "Повторить" (text load error).
Lesson status stays "Не начат" (R5).
Acceptance checks that apply to M0:
- AC2 M0: no "Окружение", switch, handle, check bar, Проверки tab; the M0 line under the header, at 1280 and 375.
- AC3 F6 landing row "M0 lesson": "Академия", "Уведомления" only when non-empty, "Урок" -> "Курс" (breadcrumb),
  no Проверка, no Окружение stop.
- AC4 `?tab=task` after sign-in opens Задание; `?tab=checks` in M0 falls back to Теория; "Войти снова"
  carries the selected tab.
- AC6 (part) the live containers that exist in M0 (the two in "Уведомления") exist empty on load.
- AC14 copy denial label "Не скопировано, выделите текст вручную" (VoiceOver/NVDA verification by the tester).
- AC15 every status from the closed sets; Copy table equals app strings.
- AC16 both themes, tokens only.
- AC17 select a tab: URL `?tab=`, `history.length` unchanged, `next` carries it, reload reopens it
  (Теория, Задание; Проверки does not exist in M0).
- AC18 (M0 subset) every control keeps the selected tab and `?tab=`.
- AC1 / AC13 (width) only in their M0 form: one region full width, `scrollWidth` = viewport at 320.
- Not M0: AC1 two panes, AC5, AC7-AC12, AC13 check bar, AC9.
States reachable in M0: theory, task, outcomes-collapsed/expanded (no real lesson has more than one
outcome today: all 13 have exactly 1, so "Показать все" never renders with real data), text-error,
copy-denied, no-theory, no-sources, prerequisite, session-expired, user-menu, m0.
Rendering rules: theory.md h1 equals the lesson title and is dropped; its `##` are h2, `###` h3. task.md h1
becomes h2, its `##` h3. "Содержание" (`.toc`) links move focus to the h2 (`tabindex="-1"`). Code blocks
`.code-block` with a header holding "Копировать". Tables in `.table-wrap`. "Источники" with "проверено
<checkedAt>" (ISO date as written, prototype line 301), source links same tab, no `target`.
Components: Breadcrumb ("Курс" / module / lesson, `aria-current="page"`), Tabs, Badge (type, outline),
Collapsible (outcomes), Alert (prerequisite warning, text load error), Button, DropdownMenu, Separator.
Top bar on the lesson: "Курс" link WITHOUT `aria-current` (prototype line 84-88); on the catalog "Курс" has
`aria-current="page"`; on the dashboard "Главная" has it.
Open questions recorded in the notes: accessible names "Навигация" (breadcrumb), "Разделы урока" (tab list)
are not in the ia.md register (deferred to the D1 follow-up, #69); loading Skeleton for the lesson text is
not a flow step ("if #30 loads tab text separately, a skeleton state should be added to F7").

### 1.3 Dashboard deferred items, `design/pages/dashboard/acceptance.md` (F4, F18)
- AC1 Card "Следующий урок": module title, lesson type Badge, "около N мин", one button (#30: first `ready`
  lesson in catalog order = `intro-models-effort`).
- AC2 "Начать" only (R5: nothing can be started before #31/#34); opens the lesson on Теория.
- AC5 (#30 part) "Готовится" Badge on planned rows; each row one link to `/courses/[courseId]#[moduleId]`,
  focus lands on the module heading. Ready rows' "N из M уроков" and bar are #35, so in #30 a ready row is
  title only (see Q3).
- AC7 Empty "В курсе пока нет готовых уроков" only when no lesson is `ready`; F6 to `main` focuses `main`.
- AC8 course read failure replaces the Card with Alert "Не удалось загрузить курс" + "Повторить"; no
  progress section; top bar works; "Повторить" focuses the Card heading "Следующий урок" (`tabindex="-1"`).
- Loading state: Skeletons for Card and progress section, `aria-hidden`.
- AC13 no horizontal scroll at 375/768/1280, light and dark; top bar one row at 375.
- Tab order: "К содержимому", "Академия", "Главная", "Курс", user menu, "Войти снова" (with alert), `main`:
  Card button (or "Повторить"), module rows.

### 1.4 #79 (DESIGN, running in parallel)
State today: `docs/79-top-bar-before-catalog` has no commits; its worktree holds only an uncommitted
`plans/79-top-bar-before-catalog-research.md`. Current acceptance notes list "Курс" unconditionally on
dashboard, catalog and lesson (tab order above), and the three prototypes draw it. #79 may change: the R6
wording (a release rule naming "Курс" hidden until #30), the dashboard tab order / F6 notes for a
"before #30" state, and possibly the top bar rule for a not-found page. None of that removes the link once
#30 ships, so #30's target state is the current notes; only the wording the PR quotes may move. Risk: if #79
merges first and edits `design/pages/dashboard/acceptance.md`, #30 must re-read it before judge_code.

## 2. Findings

### 2.1 The contract: `@academy/lesson-schema` exports
- Fact: exports zod schemas and types `Status`, `Source`, `Check`, `LessonType`, `Lesson`, `Module`,
  `Course`, constants `REQUIRED_LESSON_FILES`, `HIDDEN_DIR = "checks"`, and `validateCourses(root)`.
  Source: `packages/lesson-schema/src/{index,schema,validate}.ts`.
- Fact: there is NO loader of the parsed tree. `validateCourses` returns only `{courses, modules, lessons,
  issues}`; it parses yaml internally and discards the data. It also walks the whole lesson dir (symlink
  scan, starter scan, `realpathSync` of `checks/`) and reports `referenced file not found` for every quiz,
  rubric, hidden-task and bug-hunt file. Run on a tree without `checks/` it would report issues for 12 of
  13 lessons. Source: `validate.ts:85-180`.
- Implication: #30 needs a loader (course.yaml -> modules -> lessons -> markdown) that uses `Course`,
  `Module`, `Lesson` from the package. Where it lives is a decision: in `packages/lesson-schema` (contract
  package, CODEOWNERS @valmlord, ADR-0001 item 7 governs format changes; a loader is not a format change
  but it is that package) or in `apps/web` using only the exported schemas (ADR-0001 item 1 is satisfied:
  "imports its types from the same place"). Q1.
- Fact: `Module.lessons` defaults to `[]`; the four planned modules have no `lessons` and no `outcomes`.
  `Lesson.prerequisites` are lesson ids (`intro-models-effort`), unique per course (`validate.ts` duplicate
  check), not directory names. Course id `ai-for-developers`, module ids `introduction`,
  `spec-driven-development`, ...; directories `00-introduction`, `01-spec-driven-development`.
- Fact: the validator flags a `ready` module with a non-ready lesson, but allows a `draft`/`planned`
  module to contain `ready` lessons. The catalog's visibility rule (I1) is per lesson status; module status
  for display is derived ("Доступен" iff it has a ready lesson). Q6.
- Fact: `validateCourses` on the real course takes about 19 ms per call (20 runs, this machine), 1 course,
  6 modules, 13 lessons, 0 issues. A plain loader (no starter walk) reads 1 + 6 + 13 yaml and up to 26 md
  files, about 312 KB of markdown (`wc -c`).

### 2.2 Real content (course/ai-for-developers)
- Two ready modules: 00-introduction (6 lessons), 01-spec-driven-development (7 lessons); 02-05 `planned`.
  All 13 lessons `ready`. The catalog prototype's default state (only module 00 ready) is sample data.
- Every lesson has theory.md and task.md, `starter/`, `checks/` (277 files in total, up to 428 KB per lesson),
  and 10 of 13 a `quiz.yaml` at the lesson ROOT, not in `checks/`.
- `quiz.yaml` holds `correct: [b]` and `explanation` (e.g. `00-introduction/01-models-and-effort/quiz.yaml`).
  ADR-0001 item 5 says "Everything for the grader lives in checks/", but the validator enforces `checks/`
  only for hidden-task, bug-hunt and rubric (`validate.ts:131-145`); the quiz file is exempt. A denylist
  "everything except checks/" would therefore ship quiz answers. See risk R2.
- `lesson.yaml` `checks[]` carries `run: 'python3 -I "$ACADEMY_CHECKS_DIR/verify_routing.py"'`, file names
  and titles of grader material. M0 shows no check, so the DTO must not carry `checks` at all.
- Markdown features used (theory.md + task.md): GFM tables in 8 files (needs `remark-gfm`), fenced code
  with info strings json (5), markdown (4), text (3), python (1) plus plain fences, no images, no footnotes,
  no math, no task lists. One relative link target appears only inside inline code
  (`02-skills/task.md:120`).
- Raw-HTML-looking text outside code: `04-spec-adr-tasks/theory.md:51-52` ("As an <actor>, I want a
  <feature>, so that <benefit>") and `:66` ("The <system name> shall"). CommonMark parses these as inline
  HTML. With react-markdown's default they render as literal text (2.4); with `skipHtml` or a sanitiser
  that drops unknown tags, the words would disappear. A test should pin this file.
- Prerequisites: 12 of 13 lessons have them (one or two each), so with no progress every catalog row except
  the first shows a "Сначала пройдите" note.
- Check kinds used: command, quiz, rubric, bug-hunt. None is run in M0.

### 2.3 Next.js 16.4.3: reading files, tracing, the standalone image
- Fact: pages call `requireSession` (`headers()`), so every `(app)` page is dynamically rendered at request
  time; `cacheComponents` is not enabled (`apps/web/next.config.ts`). A server component that reads
  `course/` with `node:fs` therefore reads at request time. Source: `next.config.ts`, `lib/session.ts`;
  docs `02-guides/caching-without-cache-components.md` (`dynamic`, request-time APIs).
- Fact: standalone `server.js` does `process.chdir(__dirname)`, i.e. cwd = `/app/apps/web` in the image
  (`.next/standalone/apps/web/server.js:12`); `next dev` runs in `apps/web` via turbo. So
  `<cwd>/../../course` resolves to the repository's `course/` in dev and to `/app/course` in the image if
  the Dockerfile copies it there. Not verified at runtime in the image.
- Fact: `outputFileTracingIncludes` / `Excludes` take route globs as keys and globs resolved from the
  Next project root (`apps/web`) as values; with `outputFileTracingRoot` set (it is, repo root) a value may
  reach `../../...`. Docs: `03-api-reference/05-config/01-next-config-js/output.md:93-171`.
- Fact: the current build prints `Dynamic filesystem access causes tracing of the whole project` 3 times,
  all from `packages/lesson-schema/dist/validate.js:158` reached through `@academy/db` (`vocabulary.ts`
  imports `Check`) from the auth route, instrumentation and the `(app)` page (`apps/web/.turbo/turbo-build.log`).
  "Whole project" = `apps/web`: `.next/server/app/(app)/page.js.nft.json` lists 114 non-node_modules files,
  all under `apps/web` (sources, tests, `e2e/`, `Dockerfile`, `playwright.config.ts`), none under `course/`;
  the local standalone (43 MB) holds `apps/web` and `node_modules` only. The warning text offers
  `/*turbopackIgnore: true*/` on the fs call, a statically scoped path, or dev-only use.
- Implication (risk R1): today `course/` is in `.dockerignore` (comment "#30 removes course from this list and
  copies it into the runner"). Once it is in the build context, any fs path Turbopack can resolve statically
  into `course/` (e.g. `path.join(process.cwd(), "../../course", x)`) may make Next trace `course/**`,
  including `checks/` and `quiz.yaml`, into `.next/standalone`, which the Dockerfile copies wholesale. Could
  not verify Turbopack's exact behaviour for such a path without writing app code; the coder must check the
  nft files and the standalone tree after the first build. Guards: copy course content into the runner
  explicitly (not via tracing), mark loader fs calls `turbopackIgnore` or take the root from config, add
  `outputFileTracingExcludes` for `../../course/**`, and an image test (2.6).
- Fact: Docker `COPY --exclude` needs Dockerfile frontend 1.19 (docs.docker.com Dockerfile reference,
  options table); the Dockerfile already declares `# syntax=docker/dockerfile:1`. Whether `**/checks` is
  honoured recursively is not stated on that page (`--exclude` uses Go `filepath.Match` rules): could not
  verify. An allowlist copy (only `course.yaml`, `module.yaml`, `lesson.yaml`, `theory.md`, `task.md`)
  produced in the build stage by a script avoids both questions and also keeps `quiz.yaml` and `starter/`
  out of the web image.
- Fact: ADR-0002 puts `checks/` into the grader process of the workspace container only ("mounted
  read-only only into the grader process for the duration of the check"); `services/` is empty today. The
  web image never needs `checks/`, `starter/` (the workspace service copies it) or, before #36, `quiz.yaml`.

### 2.4 Markdown rendering (React 19.3.1, server components)
- `react-markdown` 10.1.0 (2025-03-07, remarkjs; peer react >=18). `Markdown` is synchronous and renders in
  a server component; `MarkdownAsync` exists for async plugins on the server. It never uses
  `dangerouslySetInnerHTML`. Defaults (Context7 `/remarkjs/react-markdown`, `_autodocs/configuration.md`):
  raw HTML is "kept as text content (not dropped, not dangerous)" (remark-rehype is run with
  `allowDangerousHtml: true` and `raw` nodes become `text`); `skipHtml` drops them instead; `urlTransform`
  defaults to `defaultUrlTransform`, which allows http, https, irc, ircs, mailto, xmpp and relative URLs and
  turns `javascript:`/`vbscript:` into `''`. `allowedElements`/`disallowedElements` filter tags.
- So "no raw HTML from lesson files" holds with the default and no `rehype-raw`; `rehype-sanitize` (6.0.0,
  2023) adds nothing unless raw HTML is enabled. Do not add `rehype-raw`.
- `remark-gfm` 4.0.1 (2025-02) for tables. Heading ids for "Содержание": `rehype-slug` 6.0.0 /
  `github-slugger` 2.0.0, or own ids; Cyrillic headings need a slugger that keeps Unicode.
- Rendered in server components only, react-markdown, remark and micromark stay out of the client bundle;
  the client needs only small islands (Copy button, tabs with `replaceState`, outcomes toggle, focus moves).
- Alternatives seen: `marked` 18.1.2 and `markdown-it` 15.0.3 produce HTML strings (needs
  `dangerouslySetInnerHTML` plus a sanitiser): worse fit for "no raw HTML".
- Code highlighting: the design system has no syntax colours (`design/system/README.md:74-80`,
  `proto.css:703-706`: `.code-block` on `muted`, mono `text-sm`, no token classes). ADR-0006 allows tokens
  only, so highlighting (shiki 4.5.0, rehype-pretty-code 0.14.5, sugar-high 2.6.4) would add raw colours not
  in `tokens.css`. Recommendation for the architect: no highlighter in #30.

### 2.5 Keeping `checks/` out of responses
- Next docs (`02-guides/data-security.md`): a `server-only` data access layer returning minimal DTOs; pass
  only what client components need. `import "server-only"` is already used (`lib/session.ts`).
- `@academy/lesson-schema`'s index re-exports `validate.js` (node:fs), so a client component may import it
  only with `import type`.
- React taint (`experimental.taint`) exists in 16.4.3 but is `version: experimental` and "also enables the
  React experimental channel for app directory" (`next-config-js/taint.md:4,14`): not worth that cost here.
- Layers that make I2 hold: (a) the web image holds no `checks/` (and no `quiz.yaml`) at all; (b) the loader
  reads only allowlisted files and never `checks`/`run`/`file` fields into DTOs; (c) tests.
- Test shapes that can fail (each must be seen red once):
  - unit: the loader on a fixture course whose `checks/` and `quiz.yaml` carry a canary string; serialise
    every DTO the pages receive and assert the canary is absent; mutation: make the loader read `checks/`.
  - e2e against the stack: visit the catalog and every ready lesson (each tab), collect every same-origin
    response body (HTML, RSC payloads `?_rsc=`/`RSC: 1`, JS chunks) and assert none contains distinctive text
    read from the real `checks/` files and `quiz.yaml` (e.g. a few long lines per file, or the `correct:`
    explanations). Both must hold for client navigations too, not only full loads.
  - image: `docker run --rm academy-web:<tag> find / -path /proc -prune -o -name checks -print` is empty
    and no `quiz.yaml` exists under `/app/course`; mutation: copy `course/` whole.
  - build: no `.nft.json` lists a path containing `/course/`.

### 2.6 Caching and content changes
- Per request: `React.cache` (already used for the session) dedups within one render; a module-level memo
  would hold the course for the process lifetime.
- In the image, content is baked at build time either way, so a content change needs `docker compose up
  --build` regardless of memoisation. In `pnpm dev`, per-request reads show edits immediately; a process
  memo would need a dev restart. Reading costs a few ms (2.1), so per-request reading with `React.cache` is
  enough. A build-time JSON snapshot bundled into server code is an alternative (Q1).

### 2.7 Error handling (AC8) and loading
- Next 16.4.3 `error.js` receives `{ error, retry }`; `retry()` "will try to re-fetch and re-render the error
  boundary's children"; `reset()` re-renders without re-fetching. In production the forwarded error has
  only a generic message and `digest`. Source: `03-file-conventions/error.md:100-160`.
- `loading.js` wraps the page in Suspense; "Streaming page responses begin with a 200 status"; `notFound()`
  after streaming started renders the not-found boundary with `<meta name="robots" content="noindex">` but
  keeps 200; "Calling `notFound()` before streaming starts returns a 404"
  (`03-file-conventions/loading.md:101-120`, `04-functions/not-found.md:167,195`). A `loading.tsx` on the
  lesson route therefore turns the unknown/non-ready lesson 404 into a 200.
- The error boundary catches every render error, including `SessionReadError` from the DAL; the design's
  course error copy must not appear for a DB failure. A typed `CourseReadError` handled in the page (or a
  boundary that narrows) keeps them apart.
- Not-found: no `not-found.tsx` exists in `apps/web` today; ia.md lists not-found ("Страница не найдена",
  "Открыть курс", top bar) as an app-shell state "prototyped with the app shell later" (`flows/ia.md:332`,
  `flows/catalog.md` F5 error states). Q5.

### 2.8 apps/web as built by #1 and #29
- Routes: `app/(app)/page.tsx` (dashboard, Empty unconditionally), `app/(app)/layout.tsx` (TopBar,
  Notifications, RegionCycle), `app/sign-in`, `app/api/auth/[...all]`. `proxy.ts` default-deny redirects
  anonymous requests (keeps `?tab=`), e2e `protection.spec.ts:19` already covers `/courses/x/lessons/y?tab=checks`.
- U-guard (`lib/entry-guard.ts`, `app/entry-points.test.ts`): every `page.tsx` must call `requireSession` or
  `getSession`; inline `"use server"` is rejected. `loading.tsx`, `error.tsx`, `not-found.tsx` are not
  scanned (regex `page|route` only).
- `components/top-bar.tsx`: nav has only "Главная" with `aria-current="page"` hard-coded; comment says the
  course link waits for #30. #30 must make `aria-current` depend on the route and add "Курс".
- `lib/copy.ts`: rule "each string is quoted from design/flows/ia.md, never invented". Present: brand,
  "Главная", skip link, sign-in set, "Повторить", "Выйти", "Войти снова", "Уведомления", session alert, "В
  курсе пока нет готовых уроков". All catalog/lesson/dashboard strings in 1.1-1.3 are new.
- shadcn components present: alert, button, card, dropdown-menu, empty, field, input, label, separator,
  spinner. Needed and missing: badge, item, skeleton, tabs, breadcrumb, collapsible (#29 9.4 named badge,
  item, skeleton for #30). The #29 lesson (orchestrator_mistakes 2026-10-30) applies: walk every class and
  state of each vendored component against `proto.css` and the README in round 1.
- `app/globals.css` holds `tokens.css` between markers (drift test U4); `.prose`, `.code-block`, `.toc`,
  `.item`, `.item-note`, `.icon-note`, `.badge` exist only in `design/system/proto.css` and must be expressed
  with token classes in the app.
- e2e: Playwright 1.64.1, no webServer, runs against the compose stack (`E2E_BASE_URL`, default
  `http://127.0.0.1:3080`), setup project signs in through the API. `dashboard.spec.ts` asserts the Empty
  state and `listitem` count 0: both break once real data shows (D-d).
- Compose healthcheck probes `/` (redirect to sign-in for an anonymous fetch); a course read failure must
  not crash the process (AC8 is a UI state), so the healthcheck is unaffected.
- Isolation (#29 design 13.5): `DB_PORT`, `WEB_IMAGE_TAG` exist in compose; #30 needs its own env file and
  wrapper with a distinct project, e.g. `academy-t30`, ports other than 3080/5432 (Stepan's `academy-web-1`
  and `academy-db-1` are running now on 127.0.0.1:3080 and :5432) and other than t29's 3180/55432 if both
  could coexist, image tag `t30`; same before/after checks of `academy_db-data`, `academy-web:local` and the
  root `.env` (absent in the main checkout).

### 2.9 Earlier decisions (#1, `plans/1-web-bootstrap-design.md`)
- `.dockerignore` excludes `course` with "#30 removes course from this list and copies it into the runner".
- Rejected in #1: a `./schema` subpath export of lesson-schema (would remove the fs-tracing warning; "a
  contract change, and #30 reads `course/` with fs anyway") and accepted the 3 warnings (item 7).
- The Dockerfile copies `packages/db/drizzle` explicitly because tracing does not include it; the same
  explicit-copy pattern fits course content, guarded like `check-image-migrations.sh`.

## 3. Constraints discovered
- Every new page calls `requireSession(<own path>)` (U-guard); `returnPath` must keep `?tab=` for the lesson.
- Copy only from ia.md / acceptance Copy tables, in `lib/copy.ts`; no Cyrillic elsewhere in the repo code.
- Design tokens only; no syntax-highlight colours.
- The M0 lesson renders no check, quiz, environment or progress control (R6).
- Lesson visible iff `lesson.status === "ready"`; unknown or non-ready lesson -> not-found, never "coming soon".
- Prerequisite ids that are not a ready lesson are not shown (F6 error state).
- No lesson can be started before #31/#34: every status "Не начат", dashboard button "Начать".
- `checks/`, `quiz.yaml`, `starter/` and `lesson.yaml` `checks[]` never in a DTO or the web image.
- Contract package, `course/`, `design/`, `docs/adr/` are CODEOWNERS @valmlord.

## 4. Open questions (Stepan or an ADR)
- Q1 How web gets the course (costly to change; touches ADR-0001 item 5 and the image): (A) runtime fs
  reads of an allowlisted copy at `/app/course` in the image, `<repo>/course` in dev; (B) a build-time
  snapshot (JSON of DTOs) bundled into the server; (C) a compose bind mount of `./course` (edits without
  rebuild, but puts `checks/` inside the web container: not recommended). With it: does the loader live in
  `packages/lesson-schema` (a new export, owner Stepan; could also add the `./schema` subpath that removes
  the 3 tracing warnings) or in `apps/web`? Recommend a short ADR (or an ADR-0001 amendment) recording
  "the web image ships only course.yaml, module.yaml, lesson.yaml, theory.md, task.md".
- Q2 Progress in #30: show "Не начат" for every lesson and every prerequisite as not passed without reading
  the database (consistent with R5 before #31/#34), leaving "Прогресс недоступен" (catalog AC9) to #35? Or
  read ADR-0007 tables now?
- Q3 Dashboard ready module row in #30: title link only (counts and bar are #35)? The prototype has no state
  showing a ready row without "N из M уроков".
- Q4 "Workspace stub on the right" in the issue body vs the design's M0 lesson (no right pane, the M0 line
  instead). Recommend: the design wins; the issue text is older.
- Q5 Not-found: build `not-found.tsx` with the copy-only spec ("Страница не найдена", "Открыть курс", top
  bar) although no prototype is `Status: ready` (ADR-0006 says dev implements only ready pages), or ship
  Next's default 404 and file a DESIGN issue?
- Q6 A `ready` lesson inside a `draft`/`planned` module (the validator allows it): visible or not?
- Q7 Missing register names "Навигация" (breadcrumb nav) and "Разделы урока" (tab list): use the acceptance
  Copy table values as a recorded deviation, or wait for #69?
- Q8 Partial content failure: one invalid lesson.yaml or a missing theory.md -> whole-course error (AC8) or
  skip that lesson / per-tab "Не удалось загрузить текст урока"? CI validates `course/`, so this mainly hits
  local editing.
- Q9 Top bar "Курс" target with more than one course: `course/` has one; which `courseId` does the link use
  (the only one, the first in directory order)?
- Q10 Lesson text loading Skeleton: the lesson notes say none in v1; if text loads with the route there is
  no lesson `loading.tsx` (also keeps the 404 status, 2.7).

## 5. Risks
- R1 Tracing pulls `course/**` (with `checks/` and `quiz.yaml`) into `.next/standalone` once `course` leaves
  `.dockerignore` (2.3). Guard with an explicit allowlisted copy, `turbopackIgnore` or config-rooted paths,
  `outputFileTracingExcludes`, and the image test.
- R2 `quiz.yaml` with answers sits outside `checks/` (contract gap vs ADR-0001 item 5). A denylist of
  `checks/` alone ships it into the image; #36 must strip `correct`/`explanation` before the browser.
- R3 Markdown sanitisation that drops unknown tags would delete "<actor>", "<feature>", "<benefit>",
  "<system name>" from `04-spec-adr-tasks/theory.md`; react-markdown's default keeps them as text.
- R4 A generic `error.tsx` shows "Не удалось загрузить курс" for session/DB errors too (2.7).
- R5 `loading.tsx` on the lesson route turns 404 into 200 + noindex (2.7).
- R6 Existing e2e (`dashboard.spec.ts` empty state, listitem 0) and the top bar `aria-current` hard-code break.
- R7 #79 may edit dashboard acceptance / ia.md R6 while #30 is in flight (1.4).
- R8 Vendored shadcn defaults (badge, tabs, breadcrumb, item, skeleton) drift from `proto.css` (#29 needed
  four review rounds for this class).
- R9 Running stacks: Stepan's `academy` project is up on 3080/5432; every run must go through an isolated
  `t30` project.
