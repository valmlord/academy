# #30 judge_code round 1: architecture

Reviewer: judge-architecture. Diff `git diff origin/main...HEAD` (10 commits, `f3a5afd`..`341266a`, not pushed),
against design revision 4 (+ coder updates), ADR-0009, ADR-0006/0007/0008, the planner file, the mutation log and
the tester report. Verdict: **FAIL** (4 required fixes, all small; the architecture itself is sound).

## What I checked

- **Process.** `pipeline-advance.sh status`: every judge vote `source: hook`, 15 judge spawns recorded, design
  rounds 1-4 with FAILs then 3/3 PASS, coder phase 77 min, tester 21 min. No inline vote.
- **Module boundaries.** `rg @academy/lesson-schema apps/web packages/db/src`: runtime imports only
  `@academy/lesson-schema/schema` (`read.ts`, `view.ts` type, `copy.ts` type, `vocabulary.ts`);
  `packages/db/src/schema.ts:8` imports the index as `import type` (erased). `apps/web` imports nothing from
  `services/`. `packages/lesson-schema/package.json` adds only the `./schema` export; no format change, no
  `course/` or `design/` change in the diff.
- **Loader.** `apps/web/lib/course/` is marker-free with the fs injected (`CourseFs`); `node-fs.ts` is the only
  module with `node:fs` calls, each with `turbopackIgnore`; realpath equality refuses symlinks, `..` and absolute
  `rel` (walked by hand: `path.join(root,"/etc/x")` vs `${realRoot}//etc/x` differs); the name allowlist runs before
  any fs call; `fsFailureReason` matches 5.1 (ENOENT/ENOTDIR, ELOOP, EISDIR, other `E...`, non-errno rethrown).
  `yaml.ts` uses `parseDocument` + `LineCounter`, `prettyErrors: false`, `logLevel: "error"`, warnings fail closed,
  messages never used. `read.ts` maps `CourseFileError` -> `CourseReadError` with `courseId` once `course.yaml`
  parsed; schema reason is path + code only. `text.ts` maps to `LessonTextReadError`. `view.ts` builds every view
  field by field (no spread). `server.ts`: `import "server-only"` first, `cache()` per request, one log line per
  failure with relative file and closed reason. No process-wide state except the retry flag (client).
- **Typed errors, no `error.tsx`.** `find apps/web/app -name error.tsx -o -name loading.tsx -o -name global-error.tsx`:
  none. Every page goes through `loadOrError` (`instanceof CourseReadError`, else rethrow); `LessonText` renders the
  text error only for `instanceof LessonTextReadError`. Dedicated error classes for every domain failure
  (`CourseFileError`, `CourseReadError`, `LessonTextReadError`, `CourseExportError`, `InvalidRootEnvOptOutError`).
- **Not-found routing.** `(app)/not-found.tsx` + `(app)/[...missing]/page.tsx` (`requireSession` then `notFound()`);
  catalog and lesson `generateMetadata` return "Страница не найдена" on exactly the `notFound()` branches; the
  layout and `not-found.tsx` read the course only after a session exists (Sec N3).
- **Per-request cache.** Layout, page and `generateMetadata` share `getCourse` within a request; `getLessonText`
  keyed by `(dir, kind)`.
- **Code-style.** `rg '[а-яА-ЯёЁ]'` over every changed non-plan file except `lib/copy.ts`: 0 lines (tests and e2e
  included: they import the copy constants). `any`: 0 (only the English word in comments). `as`: only `as const`
  and `import * as` / named import aliases. Every exported function and component has an explicit return type
  (grep of `export (default )?(async )?function` over the diff). Comments read one by one; the Next 16.4.3
  `replaceState` comment checked against `node_modules/next/dist/client/components/app-router.js:302-313`
  (`if (data?.__NA || data?._N) return originalReplaceState(...)` skips `applyUrlFromHistoryPushReplace`): true.
- **Imports resolve.** Every new import in the diff points at a file that exists (`lib/routes.ts`,
  `components/lesson/lesson-panels.ts`, `lesson-text.tsx`, `ui/progress-styles.ts`, `ui/link-styles.ts`,
  `e2e/fixtures.ts#useOwnBucket`); the tester's typecheck, build and 54 e2e confirm the whole app loads.
- **Tests can fail.** Mutation log (40 rows) plus the tester's 8 re-runs; I re-read the guarded assertions of
  U-leak (recorder logs before delegating, `listDirs` exactly `[""]`), U-env-sites (needles built from parts,
  positive controls per required root), E-leak (`page.route` capture with `route.fallback()` so the earlier
  `useOwnBucket` route still applies; M-leak-rsc and M-leak-dash seen red), U-retry new `retryTargetId` case
  (mutation red at `retry-button.test.ts:84`). Two first-attempt-green mutations were caught and the tests fixed
  (E-les-1 clicked a prerequisite link; E-dash-1 took its expectation from the function under test): good.
- **Vendored components vs 8.4, class by class.** Read `badge.tsx`, `item.tsx`, `tabs.tsx`, `breadcrumb.tsx`,
  `progress.tsx`, `progress-styles.ts`, `link-styles.ts` against the 8.4 tables and `proto.css:117-118,329-337,
  376-391,370-372`; and `alert.tsx`, whose `AlertTitle` now holds links for the first time. Compiled CSS
  (`apps/web/.next/static/chunks/0q2m7z_eu07iy.css`) checked for the two findings below.
- **ADR-0006.** catalog, lesson, dashboard are `Status: ready` on `origin/main`; `design/` untouched; tester report
  has the conformance section with every AC answered and the raw colour grep empty. #83 body and comment read.
- **Commits.** `git show --stat` per commit; subjects, bodies, `Refs #30`, no AI attribution.

## Rulings on the coder deviations

| Deviation | Ruling |
|---|---|
| `lib/routes.ts`, `components/lesson/lesson-panels.ts` | Accepted: a value exported from a `"use client"` file reaches a server component as a client reference; plain modules are the right boundary. Design 3.2 already updated. Note N2 on the routes comment. |
| `components/lesson/lesson-text.tsx` | Accepted: one panel's read, typed catch and content; keeps the page under the abstraction level rule. |
| E-leak `page.route` for RSC bodies | Accepted: the route fetches, records and fulfils the same response; non-RSC requests `fallback()` to `useOwnBucket`'s route. M-leak-rsc red proves it captures. |
| `FocusOnMount` `retryTargetId` | Accepted, with its unit case and mutation. |
| tabs `replaceState(null, ...)` | Accepted; the why-comment is verified against the Next source (above). |
| `useOwnBucket` in five specs | Accepted as a fix; **its placement is required fix R2**. |
| lesson h1 `id` / `tabindex=-1` | Accepted: the D2 retry success target, same pattern as the catalog h1. |
| "Открыть курс" omitted when the course id is unknown | Accepted (no catalog path exists to link). It extends D1/D2 and is not in #83's body: the PR body must list it (section "PR body"). |
| "Источники" kept in the text-error state | Accepted: design 6.2 says so. |
| prerequisite **note** links use `inlineLinkClassName` (catalog) | Accepted; but the lesson page's prerequisite **Alert** links do not: required fix R1. |
| dashboard progress section unlabelled | Accepted: the prototype's `section.progress-block` (dashboard prototype line 112) has no name either; the bar is named by `#progress-heading`. |
| two commit subjects reworded | Accepted: shorter, still Conventional Commits, under 72 characters. |

## Findings

FAIL - 4 issues found:

1. **[components/lesson/prerequisite-alert.tsx:30, components/ui/alert.tsx AlertTitle] Prerequisite links on the
   lesson page miss design 8.4 "Links"; the hover state differs from the prototype and is not listed.** 8.4 says
   `inlineLinkClassName` is "used by `.item-note` links, sources, toc links, prerequisite links and `.prose a`".
   `PrerequisiteAlert` renders a bare `<Link>`, so the link gets the vendored `AlertTitle` descendant utilities
   instead. Compiled CSS: `.\[\&_a\]\:underline-offset-3 a{text-underline-offset:3px}` and
   `.\[\&_a\]\:hover\:text-foreground a:hover{color:var(--foreground)}`, no thickness change. The prototype
   (`lesson/prototype.html:168`, `p.alert-title > a`) gets the global `a`/`a:hover` rules (`proto.css:117-118`):
   offset 0.2em, hover `text-decoration-thickness: 2px`. So on hover the app shows no 2px underline (and a 3px
   offset instead of 2.8px). Simply adding `inlineLinkClassName` is not enough: `[&_a]:underline-offset-3` has
   specificity (0,1,1) and beats `.underline-offset-[0.2em]` (0,1,0). The tester's 6.2 table has no Alert row and
   no `#state-prerequisite` screenshot, so the drift was not measured. Coder: this is the #29 lesson ("walk every
   class of a vendored component, every state") applied to `alert.tsx`, whose link utilities became reachable in
   this diff.
   Fix: delete the `[&_a]:*` utilities from `AlertTitle` and `AlertDescription` (no other Alert in the app holds a
   link; `rg -n "<Alert" apps/web` to confirm), give the prerequisite links `inlineLinkClassName`; the tester
   compares `#state-prerequisite` (a lesson with a prerequisite, e.g. the second lesson) default and hover at 375
   and 1280, light and dark.

2. **[commits 7 `eaef068`, 8 `ec41009`, 9 `07b15b2`] The rate-limit fix rides in the dashboard commit.** The
   `useOwnBucket` `beforeEach` blocks of `catalog.spec.ts`, `not-found.spec.ts` (added in commit 7) and
   `lesson.spec.ts`, `leak.spec.ts` (added in commit 8) were added in commit 9. The mutation log's last row shows
   why: back-to-back runs went red with 429 because these specs load many pages; that load exists from commit 8
   (13 lessons x 2 visits in E-leak alone), so commits 7 and 8 leave a suite that fails on a rerun. The author's
   rule: "atomic: one logical change each, the project builds and tests pass after every one". The commit 9 body
   also says "every page load **now** reads the session endpoint"; `Notifications` has read `get-session` on mount
   since #29 (`notifications.tsx` on `origin/main`), what is new is the number of page loads.
   Fix (history is not pushed, so no force-push is involved): move each `useOwnBucket` hunk into the commit that
   adds its spec (catalog and not-found -> commit 7; lesson and leak -> commit 8), reword the sentence in commit 9's
   body (or drop it: commit 9 then only adds the dashboard test's own `beforeEach` if `dashboard.spec.ts` needs it),
   and rerun the suite twice back to back at commit 8 to show the fix belongs there. The commit text is the author's
   to approve before it is rewritten (git-workflow rule), so the orchestrator asks Stepan.

3. **[lib/course/node-fs.ts listDirs / lib/course/server.ts:18] A missing course root logs an empty file field
   (tester F1).** `listDirs(root, "")` throws `CourseFileError("", "missing")`, mapped to `CourseReadError("",
   ...)`, so the log line and the error message read `web: course read failed: : missing`. The author's rule 5:
   "Error messages carry context: which entity, which value". The design's own convention names the course root
   `.` (`expected exactly one course`, file `.`). Fix: name the root `.` when `rel` is `""` (in `withReason`'s file
   or in `listDirs`), and add one U-fs / U-read case asserting the reason and file for a missing root, seen red
   without the fix. Design 5.4 gains the row ("the course root itself, file `.`").

4. **[components/ui/item.tsx Item, components/ui/breadcrumb.tsx BreadcrumbLink] `transition-colors` animates the
   focus ring (tester F2).** Tailwind 4's `transition-colors` compiles to `transition-property: color,
   background-color, border-color, outline-color, text-decoration-color, ...` (compiled CSS line above). The global
   ring therefore fades from `currentColor` to `ring` over 150 ms on keyboard focus of every catalog row, dashboard
   row and breadcrumb link. `proto.css` has no transition on `.item` (376-382) or `.breadcrumb a` (334-335), and the
   README's `duration-fast` is for hover only; `button.tsx` already uses `transition-[background-color]` for this
   reason. This is the design's prescription (8.4 Item "App" column `transition-colors`, Breadcrumb `transition-colors`),
   followed faithfully, so it is an **architect** mistake. Fix: `transition-[background-color,color]` on both
   (keeps the hover fade, leaves `outline-color` alone), update the two 8.4 cells, and the tester re-measures the
   ring at t0 on a row link (E-ring could assert `outline-color` equals the `ring` token right after focus to make
   this guarded).

## Non-blocking notes

- N1 `"theory" | "task"` is declared three times (`LessonTab` in `lesson-panels.ts`, `LessonTextKind` in
  `lib/course/text.ts` and in `components/markdown/headings.ts`). One vocabulary per domain: let two of them import
  the third. Not required for this round.
- N2 `lib/routes.ts` comment "Ids are slugs (lesson-schema), so they need no encoding" holds for ids from the
  parsed tree, but `catalogPath(courseId)` and `returnPath` also build `requireSession` return paths from route
  params, which are not validated slugs. `safeNextPath` makes this harmless for security; whether a `%3F` in a
  param survives depends on how Next decodes params, which I did not run. Either encode there as the catch-all does
  or narrow the comment.
- N3 `e2e/fixtures.ts` `useOwnBucket` docstring still says "sign-in rate-limit bucket (3 attempts per 10 s)"; it now
  also keeps `get-session` reads apart. One sentence.
- N4 ADR-0009 lands in the docs commit (10) while its decisions take effect in commits 3-4. Acceptable (the PR
  carries it), noted for the next PROJECT plan.
- N5 F3 (Radix Tabs focuses on `mousedown`, so the first mouse click shows the ring): upstream behaviour, no WCAG
  issue; goes to #83 as an observation, no code change.

## PR body must carry

- `Closes #30`; the three texts of design 9.4; the unreachable-states table of 6.5.
- "Design deviations" with follow-up #83: D1 (not-found from the copy spec), D2 (lesson course-error composition;
  top bar without "Курс" when `course.yaml` is unreadable), D3 (task `###` as h4), **plus** "not-found omits
  'Открыть курс' when the course id cannot be read, so `F6` `main` lands on `main` itself" (not in #83 yet: the
  orchestrator appends it), and the `.prose h2` inset ring (already a #83 comment).
- Named exceptions from the tester (X3 tab trigger line height: README type scale wins over `proto.css:350`, for
  #80/#83; X1, X2, X4-X6 no rendered difference), F3 for #83, and F2/R1 only if they are not fixed in round 2.
- "Needs Stepan": accept ADR-0009 (Proposed), approve `@academy/lesson-schema/schema` (CODEOWNERS), the 13.4 T-sr
  gap (VoiceOver/NVDA and WebKit list semantics checked by hand), and the tester's dev-server note (`localhost`,
  not `127.0.0.1`, for `pnpm dev` checks).

## Attribution

- R1, R2: coder (appended to `.claude/feedback/coder_mistakes.md`). R3: coder; the same lesson was already
  appended by another judge of this round ("A missing course root is logged with an empty file name"), so it is
  not duplicated.
- R4: architect (design 8.4 prescribed `transition-colors`; appended to `.claude/feedback/architect_mistakes.md`).

FAIL
