# #30 judge_design round 1: architecture

Judge: judge-architecture, 2026-10-30. Reviewed: `plans/30-catalog-lesson-page-design.md` (revision 1),
`plans/30-catalog-lesson-page-research.md`, `docs/adr/0009-course-content-in-the-web-app.md` (Proposed),
ADR-0001, ADR-0006, ADR-0007, ADR-0008 (by reference through `lib/session.ts`), `packages/lesson-schema`
(`package.json`, `src/index.ts`, `src/schema.ts`, `dist/`), `packages/db/src/{vocabulary,schema}.ts`, `apps/web`
at `7706f71` (layout, dashboard page, top bar, notifications, region cycle, entry guard, session, Dockerfile,
`.dockerignore`, `next.config.ts`, `turbo.json`, `ci.yml`, `e2e/dashboard.spec.ts`), `design/pages/{catalog,
lesson,dashboard}/acceptance.md` and the lesson and dashboard prototypes, `design/system/proto.css` and README,
and PR #82 (`gh pr diff 82`, head `2ae6a7b`, all checks green, open).

## Verdict: FAIL, 8 issues

### 1. [design 14 steps 20-22 vs 31] Commit 5 uses copy strings that arrive in commit 7
`components/markdown/copy-button.tsx` (step 20, commit 5) renders "Копировать" and the denial label "Не
скопировано, выделите текст вручную"; U-copy (step 20) and U-md part 1 (step 21, "a fenced block inside
`.code-block` with "Копировать"") assert them. 9.3 files both under "Lesson", and step 31 (commit 7) is where
the lesson strings are added to `lib/copy.ts`. [R] forbids Cyrillic outside `lib/copy.ts`, so the coder cannot
inline them: commit 5 fails typecheck (missing exports) and its tests. Fix: move "Копировать" and the denial
label into step 18 or 20 (or into step 23's shared set and move commit 5 after it), and say so in 9.3.

### 2. [design 13.2 E-cat-2, 14 step 29] A commit-6 e2e clicks dashboard rows that arrive in commit 8
E-cat-2 (step 29, commit 6) includes "dashboard row click lands with the heading focused (AC2, dashboard
AC5)". Until step 42 the dashboard renders the unconditional Empty state (`app/(app)/page.tsx` today), so
there is no row to click and [S] is red for commits 6 and 7. E-dash-1 (step 43) already covers "row ->
catalog heading". Fix: drop the dashboard part from E-cat-2 (keep it in E-dash-1), or move it to step 43.

### 3. [design 4 "Lesson tab state", 13.2 E-les-2, step 36] The `next` test cannot fail on today's code
`components/notifications.tsx` does not capture the URL on mount: it reads `window.location` when the
`get-session` promise resolves. E-les-2 fulfils `get-session` with `null` "after the tab change", which is
exactly the order in which today's code already yields `?tab=task`. So the assertion passes before and after
step 36, and the named mutation "Notifications from mount-time URL" describes code that never existed. The
behaviour step 36 adds (the link follows a tab change made while the alert is shown, AC17/AC18) is unguarded.
Fix: release `get-session` first, wait for the alert, then select Задание and assert `next` decodes to
`?tab=task`; the negative run is today's `notifications.tsx` unchanged (seen red).

### 4. [design 13.2 E-les-3] The `data-region` mutation leaves the F6 assertion green
`components/region-cycle.tsx` `focusInto` focuses a region's first focusable element. Moving `data-region`
from the "Урок" section to `main#main` makes `main` the region, whose first focusable element is still the
breadcrumb "Курс", so "F6 -> Академия -> Курс -> Академия" passes under the mutation as written. Only
`data-region` on both elements goes red (third press lands on "Курс" again). Fix: state the mutation as "both
`main` and the section carry `data-region`" (red at the third press), and assert the landmark itself
(`getByRole("region", { name: "Урок" })` exists and contains the breadcrumb), which goes red when the section
loses it.

### 5. [design 5.4, 13.1 U-read M-msg] The schema half of M-msg cannot turn the canary assertion red
Run here against `packages/lesson-schema/dist/schema.js` (zod ^4.6.7) with `CANARY-YAML` in `id`, `type`,
`status`, `estimatedMinutes` and `sources[0].url`: no `issue.message` contains the input ("lowercase-kebab-case",
"Invalid option: expected one of ...", "Invalid input: expected number, received string", "Invalid URL").
The only message that echoes input is the custom `duplicate check id: <id>`. So "use `issue.message`" keeps
U-read's "no `CANARY-YAML`" green for the schema case; only the YAML-syntax half goes red (`yaml` puts the
source line with a caret in its message: verified, `linePos` `[{line:2,col:6},...]`). Fix: give the schema
case an input whose message would echo it (two checks with id `canary-dup`, asserting `canary-dup` absent
from the error), or name the mutation "include `issue.input` / the raw value", and state which half each
mutation reddens.

### 6. [design 4 "shadcn components", 8.4, steps 16-17] Vendored drift listed by example again
8.4 names a few differences and delegates the full table to the coder, which is the #29 pattern (three
rounds). I fetched the `radix-nova` registry items (`https://ui.shadcn.com/r/styles/radix-nova/<name>.json`,
the style in `apps/web/components.json`) and read every class string against `proto.css` and the README.
Missing from 8.4, each a defect if copied:
- **Focus overrides the global ring.** `app/globals.css` draws `:focus-visible` (2px `ring`, offset 2px) in a
  base rule; utilities win over it. Item: `outline-none focus-visible:border-ring focus-visible:ring-[3px]
  focus-visible:ring-ring/50` (every catalog and dashboard row link, one Tab stop each). TabsTrigger:
  `focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:ring-ring/50`.
  TabsContent: `outline-none`, while the panel is a Tab stop (`tabindex="0"` in the prototype, Radix default),
  so the focused panel shows no ring at all (WCAG 2.4.7). #29 removed these classes from Button; 8.4 must say
  "remove every `focus-visible:*`, `outline-none` and `ring-*` class from the six components" and list them.
- **Tabs, more than the selected border.** `dark:data-active:border-input dark:data-active:bg-input/30` stays
  in dark and wins over an added light border class (the exact pair `proto.css` rejects: 2.757:1 on muted);
  inactive `text-foreground/60` (translucent, proto `muted-foreground`); list `h-8 p-[3px]` (proto
  `space-1` padding, `gap-1`, `flex-wrap`); trigger `h-[calc(100%-1px)] flex-1 px-1.5 py-0.5` (proto
  `min-height: control-height-sm`, `space-1`/`space-3`); TabsContent `text-sm` (prose is `text-base`).
- **Item.** ItemGroup is `div role="list"` with `gap-4`; the design uses `ul.item-group` with no gap and a
  top border between rows. Item: `rounded-lg`, `flex-wrap`, `text-sm` on the whole row (proto title is body
  size), `[a]:hover:bg-muted` (proto `accent`), `transition-colors duration-100`.
- **Breadcrumb.** `BreadcrumbPage` is `span role="link" aria-disabled="true"`: the current crumb is announced
  as a disabled link, against `ia.md` ("not a link") and lesson AC5 (every `aria-disabled` control has a
  reason). `Breadcrumb` defaults `aria-label="breadcrumb"` (6.2 overrides it; say the default is removed).
- **Badge.** `h-5` fixed height, `rounded-4xl`, `overflow-hidden`, `[&>svg]:size-3!`; no `data-tone="muted"`
  outline variant, which "Готовится" and "Не начат" use (6.1, 6.3).
- **Collapsible.** No styles at all: the `.collapsible-trigger` chevron (`::after`, rotate on
  `aria-expanded`, `duration-fast`) and the link-variant Button are app work; 8.4 lists nothing for it.
Fix: put the per-component table (class -> proto rule -> keep/replace) in the design, from the registry
source, every state (default, hover, focus-visible, selected/expanded, dark), and a tester assertion for the
focus ring on a row link, a tab trigger and the tab panel.

### 7. [design 3.2, 5.1, 5.4, 13.1 U-files/U-text; ADR-0009 item 2] The error-class contract is contradictory
U-files expects `listLearnerFiles` to throw `CourseExportError` on a symlinked `theory.md`. ADR-0009 item 2
says "the loader that serves pages and the export use the same listing". If `readCourse` calls
`listLearnerFiles`, a symlink yields `CourseExportError`, which `loadOrError` rethrows: a 500 instead of the
designed course-error state, and a `theory.md` symlink should be a per-tab `LessonTextReadError` (Q8). If it
does not call it, the ADR sentence is false and only U-leak's subset check ties them. 5.1 also says
`CourseFs.readText` "refuses" paths without saying what it throws, so a missing `lesson.yaml` versus a missing
`theory.md` cannot be told apart by class at the page. Fix: `CourseFs` throws one internal error
`{ file, reason }`; `readCourse` maps it to `CourseReadError`, `readLessonText` to `LessonTextReadError`, the
export to `CourseExportError`; `listLearnerFiles` either takes the error constructor or throws the internal
error; state whether `readCourse` uses the listing and correct ADR-0009 item 2 to match; U-files asserts the
internal error, U-read and U-text assert the mapped classes for a symlink and a missing file each.

### 8. [design 6.2, 6.5, 13.4] The lesson text-error state is reachable and nothing renders it
`#state-text-error` (Alert "Не удалось загрузить текст урока", "Повторить", success target the panel, failure
target the button, "Источники" still shown) is reachable by content (delete or symlink `theory.md` in a
`COURSE_ROOT` copy). 6.5 does not list it as unreachable, 8.2 maps no check to it, T-err covers only the course
error (missing root, broken `lesson.yaml`), and U-text/U-retry test the loader and the button in isolation,
not the page composition. Fix: add it to T-err (scratch copy without `theory.md`: the Теория panel shows the
Alert, Задание still renders, "Повторить" after restoring the file focuses the panel; the design-conformance
screenshots include it), or an e2e against a `t30` container with `COURSE_ROOT` pointing at such a copy.

## Advisory (not blocking)
- A1 U-2: Next documents `metadata` for the root `not-found.js` and `global-not-found.js` only
  (`03-file-conventions/not-found.md:185-187`); a nested `(app)/not-found.tsx` export is undocumented. Name
  the fallback now: catalog and lesson `generateMetadata` return "Страница не найдена" when they are about to
  call `notFound()`; the catch-all exports it itself.
- A2 Q9: `(app)/layout.tsx` returns bare children when the session is null; say the course is read only after
  that branch, so an anonymous render never touches the course.
- A3 `@academy/web#test` inputs are `$TURBO_DEFAULT$` plus `tokens.css`; U-md's real-course case reads
  `course/`, so a local turbo cache hit skips it after a content edit. Add `$TURBO_ROOT$/course/**` to the
  inputs (CI starts cold, so CI is unaffected).
- A4 8.2 cites "AC1/AC13 width part": lesson AC13 is the "Проверить" visibility check, not width; list lesson
  AC5 and AC7-AC13 explicitly as not M0 so the tester marks them N/A rather than missing.
- A5 7.2 "Next prefetches every lesson link" is unverified (no `loading.tsx`, dynamic routes); not load-bearing,
  since E-leak visits every lesson; drop the claim or say which links are `next/link`.
- A6 Radix Progress sets `aria-valuetext` from `getValueLabel` (default a percentage); 6.3 should name
  `getValueLabel={() => "0 из M"}` so the attribute is not overwritten.

## What I checked and found sound
- **Loader location and the `./schema` entry point.** `dist/schema.js`/`.d.ts` exist; `schema.ts` imports only
  zod; `@academy/db`'s only value import of the package is `vocabulary.ts:5` (`schema.ts:8` is `import type`,
  erased); `apps/web` imports the package nowhere today and already depends on it; the current build log has
  3 "Dynamic filesystem access" lines. drizzle-kit resolves the subpath the same way it resolves `.` today
  (`default` condition). Additive export, no format change: ADR-0001 item 7 does not apply. Placing the loader
  in `apps/web/lib/course/` keeps view concerns out of the contract package; ADR-0001 item 1 holds (types from
  the package, `Lesson["type"]`, exhaustive `Record` for labels).
- **ADR-0009 instead of an ADR-0001 amendment.** The decisions are about the web's consumption and the image;
  S3 visibility is stricter than ADR-0001 item 4 and changes no content-team obligation; the `quiz.yaml` gap is
  recorded for #36. Sound, apart from item 2's sentence (issue 7).
- **Module boundaries.** No `services/*` import; the workspace and grader keep their own allowlists; client
  components receive views only; `server.ts` carries `server-only` and [G] keeps it out of tests, scripts and
  e2e (the glob form `apps/web/e2e/**` was run from the root and matches).
- **Image.** `.dockerignore` anchors `scripts` at the context root, so `apps/web/scripts` reaches the build;
  the order (deps build, export with `tsx`, `rm -rf /repo/course`, web build) keeps `course/` out of tracing by
  construction; `/out` is outside the Turbopack root; the 46-file count matches 1 + 6 + 13 x 3.
- **Typed errors and no `error.tsx`**: the `instanceof CourseReadError` split with rethrow, U-page-error and
  M-catch-all are right (issue 7 is about what is thrown, not the split).
- **`cache()` per request**: React `cache` memoises thrown errors too, so the log line is once per request;
  `router.refresh()` is a new request, so "Повторить" re-reads; no process memo.
- **Not-found catch-all**: a required catch-all at `(app)` does not match `/`; static `sign-in`, `api/auth` and
  `favicon.ico` win; it calls `requireSession`, so U-guard covers it; no `loading.tsx` keeps the 404 status.
- **Heading rules and the remark plugin**: one plugin for render and `sectionsOf`, ordinal ids, V7 counts;
  raw HTML as text via react-markdown defaults; M-skiphtml and M-raw both reach their assertions.
- **Dashboard first-run from constants** matches the prototype's `#state-first-run` and PR #82's "From #30:
  F4 and F18.1-F18.2 as designed".
- **9.5 against PR #82**: `1e51f71..2ae6a7b` changes only `.claude/feedback/`, so the design's reading of
  `design/` is current; items 1-5 match the diff (ia.md "Top bar by release", `catalog.md` not-found F6 on
  "Открыть курс", dashboard AC applicability line, tab orders, AC14 before #30 only). #82 also edits
  `design/system/README.md` (top bar note) and `flows/progress.md`, consistent with the design.
- **Mutations walked against code**: U-topnav `startsWith`, U-outcomes `> 1`, U-files M-list-all/M-link,
  U-leak M-leak-view/M-leak-read, U-view, U-tabs M-push, E-cat-1, E-les-1, E-dash-1, E-nf-1 `loading.tsx`
  each reach their assertion; issues 3-5 are the ones that do not.
- **Step order, other commits**: commits 1-4 and 8-9 supply before they require; the lesson route's absence in
  commit 6 is covered by the catch-all (E-nf-1's unknown-lesson row passes through it until commit 7).
- **Process**: state shows PROJECT, `judge_design` entered after architect; no inline votes seen.

FAIL
