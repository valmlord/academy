# Journey: several courses

Pages: dashboard (`/`, F20), lesson (F22); the catalog and not-found changes are stated in `catalog.md`
F5 and in `ia.md`. Issue #218 (parent epic #217). Sources: #218 scope items 1-5; #217 (a stub second course
with one `ready` lesson must show in the web app and start an environment); #219 (the ADR-0009 amendment:
course id, failure scope, URL shape); `docs/learning-process.md` §4 and §6 item 1 ("you open the next lesson
on the dashboard"); `.claude/learner/profile.md` "Known weak spots" (freezing on "build the whole thing": the
dashboard names one next step); the #218 research (`plans/218-research.md`, a working note like the #50
ones), cited as "research §n".

The #218 rules are defined in `ia.md`; which rules, where each sits and how another file names one: the
opening paragraph of `ia.md` "Several courses (#218)". Besides the flows F20 and F22,
this file holds "Questions for #219", "Requirements for #220", a list of the decisions ("Decisions (#218)")
and "Not designed in #218".

Scope: #218 designs the normal states (readable courses with and without a `ready` lesson, one course and
several) and the root error (`ia.md` [Dashboard by course count](ia.md#dashboard-by-course-count) row 1).
The error and focus states with several courses (each place in `ia.md` and in this file that says "see #222",
among them `ia.md` "Dashboard by course count" row 6) and the flow F21: see #222.

The learner journal has no entry about courses. Today `course/` holds one course (`ai-for-developers`, "ИИ
для разработчиков"); the second course of #217 is a stub with one `ready` lesson, so the near-term setup is
"one real course plus one stub".

Release words: **#220** is the dev issue that builds this design (what it builds: "Requirements for #220"
below). Before #220 the app is the one-course app of #30 (the rules marked "until #220" in `ia.md`, for
example R6 "Course id unknown (#83, until #220)"). Every statement in this file is "from #220" unless it says otherwise.

Words: **course**, **course root**, **course list**, **course block**, **Card course**, **end Card**, **Card
heading**, **next-lesson link**, **root error**, **list order** and **other-courses list** are defined in their
`ia.md` vocabulary rows; this file uses them by name. "Finished" and "passed" are those of `dashboard.md` F4 "Rule for "next lesson"".

## F20: Choose a course on the dashboard

**Goal:** see every course, how far I am in each, and open the next lesson or the catalog of the one I
choose. Source: #218 scope items 1 and 3; #35 ("course percentage"); learning-process §4; research §0 G2, G3.

**Entry:** the dashboard: after sign-in when F1.4 lands on the dashboard; the top bar's links to the
dashboard (`ia.md` R6 "Top bar by release"). The
ways to each catalog: `ia.md` page inventory, [Multiple ways](ia.md#multiple-ways).

**Steps (4):**

1. F20.1 Learner sees the course blocks and their headings ([A218-1](ia.md#A218-1); order, forms and
   heading: [Dashboard structure](ia.md#dashboard-structure) item 4; the name: [A218-7](ia.md#A218-7))
   (element: the course block `section`).
2. F20.2 Learner reads a block in its form ([Dashboard structure](ia.md#dashboard-structure) item 4): in
   the readable form the course line (F18.1) and the module rows (F18.2), in the empty form the empty text
   (element: the block's course line).
3. F20.3 Learner opens the block's next-lesson link ([A218-4](ia.md#A218-4)); the lesson page opens on the
   tab F4.3 names (R5) (element: the next-lesson link).
4. F20.4 Or the learner opens the course name in the block heading (or a module row); that course's
   catalog opens (F5.1), or the module's section (F5.2) (element: the heading link).

**Success:** the lesson page (F20.3) or the catalog (F20.4) of the chosen course opens.

**Error states:**
- The root error: [Dashboard by course count](ia.md#dashboard-by-course-count) row 1 (Q3).
- The error states of [Dashboard by course count](ia.md#dashboard-by-course-count) row 6: see #222.
- Session expired during the read: F2.

**Empty states:**
- First run (no progress in any course): a block in the readable form
  ([Dashboard structure](ia.md#dashboard-structure) item 4) shows the first-run course line and module
  rows of `progress.md` F18 empty states, and its next-lesson link as [A218-4](ia.md#A218-4) says.
- A block in the empty form, with its empty text ([Dashboard structure](ia.md#dashboard-structure) item 4;
  Q6). The heading link opens its catalog (F5 empty states; its module status: `ia.md` set "module
  status"). #147 may change when this text shows (FU23).
- [Dashboard by course count](ia.md#dashboard-by-course-count) rows 3 and 5.

**Loading:** [Dashboard structure](ia.md#dashboard-structure), Loading.

**Exit:** F20.3 (lesson page), F20.4 (catalog), and every other dashboard row of `ia.md` R6
["Course scope (#218)"](ia.md#course-scope): the Card's button (F4.3), the end Card's "Открыть курс", and from
#35 the F18.3 and F18.4 row links (`progress.md` F18 Exit); the top bar (`ia.md` R6 "Top bar by release",
"Выйти" in its user menu: F3).

**Keyboard path:** [Dashboard structure](ia.md#dashboard-structure), "Tab order and `F6`". Enter follows a
link.

**Time limits:** none of its own; the session (F2) as on every page with the top bar.

## F22: Tell which course a lesson belongs to and go back to it

**Goal:** know from the page which course a lesson is in, and return to that course. Source: #218 scope item
4; #219 bullet 4 ("Lesson URLs include the course id in the path"); research §0 G4; NN/g breadcrumbs
(research §5: hierarchy, current page last and unlinked).

**Entry:** any lesson page whose course was read, opened by one of its ways (`ia.md`
[Multiple ways](ia.md#multiple-ways), item "lesson", for example F4.3, F5.4, F20.3) or by a direct link.
The URL is the lesson Route of `ia.md` page inventory.

**Steps (2):**

1. F22.1 Learner sees the breadcrumb and its course crumb ([A218-8](ia.md#A218-8); links:
   `ia.md` Navigation model, "Breadcrumbs") (element: the breadcrumb `nav` "Навигация").
2. F22.2 Learner opens the course crumb, which opens that course's catalog (F5.1), or the module crumb,
   which opens its section (F5.2) (element: the course crumb link).

**Success:** the catalog of the lesson's course opens.

**Error states:**
- The lesson course error: `lesson-environment.md` F7 error states (its breadcrumb: `ia.md` Navigation model,
  "Breadcrumbs"); with several courses: see #222.
- Not-found ways (3) and (4) (`ia.md` page inventory, not-found Route): the not-found page, its action by
  [A218-12](ia.md#A218-12).

**Empty states:** none: a lesson always has a course and a module.

**Exit:** F22.2 into F5; the top bar's links to the dashboard into F20 (`ia.md` R6 "Top bar by release").
The lesson page's other exits: the flows of its page inventory row (`ia.md`).

**Keyboard path:** `F6` to "Урок", the course crumb and the module crumb: per `ia.md` R3 (its "Урок" rows
and, after its table, the paragraph "In "Урок" the course crumb"). A long course name wraps inside the breadcrumb; at 320 px and at 200 % zoom on a 1280 px screen (640 CSS
px) the breadcrumb wraps and nothing scrolls sideways (WCAG 1.4.10).

**Time limits:** the lesson page's own (F10, F2), unchanged.

## Questions for #219

What the ADR-0009 amendment must decide. Each has this design's assumption, which the prototypes and #220
build on; if #219 decides otherwise, the named parts of this design change in a follow-up DESIGN task. The
error states of #222 build on these assumptions too (Q1, Q4 and Q9 name #222 below), so a #219 decision
against one of them also changes #222 wherever #222 uses it.

- **Q1. Course id.** Assumption: the course id is the course's directory name, and `course.yaml` `id` must
  equal it (the validator and both readers, web and workspace, enforce it; a mismatch is that course's read
  error). Because then every course of a readable root has an id and a URL, and duplicate ids cannot exist
  (Q4). Depends on it: in `ia.md` the vocabulary row "course", R6 "Course scope (#218)", FU24 and the
  not-found ways (2)-(4) (page inventory, not-found Route); here Q4, Q5 (and with it the `ia.md` vocabulary
  row "list order"), Q10 and "Requirements for #220" item 5; and the failure scope of #222. If #219 keeps `course.yaml` `id` with no tie to the directory, the failure cases change: see #222.
- **Q2. Failure scope.** Assumption: every ADR-0009 item 7 failure makes only its own course unavailable; only
  the course root is global: a root that ADR-0009 item 1 does not yield, a missing or unreadable root, a
  root with no course (Q3).
- **Q3. Zero courses.** Assumption: a readable root with no course directory is the root error (`ia.md`
  vocabulary row "root error"), not an empty state. Because the only learner runs the platform from the repository,
  which ships `course/`, an empty root is a misconfiguration, and an empty-state sentence would hide it.
- **Q4. Duplicate ids.** Assumption: impossible under Q1 (directory names in one directory are unique). If
  #219 keeps `course.yaml` `id`: every course that shares a duplicate id is unavailable and the rest stay
  readable, because none of them can be chosen safely (failure cases: see #222).
- **Q5. Ordering.** Assumption: the list order (`ia.md` vocabulary row "list order") is ascending course id
  (Q1), compared as plain strings, so a two-digit prefix such as `00-`, the convention
  of module and lesson directories (`packages/lesson-schema/src/schema.ts`, "NN-kebab-case directory name"),
  orders them; no format change. The
  learner activity of a course ([A218-2](ia.md#A218-2)) is the newer of its
  newest `attempts.started_at` and its `enrollments.enrolled_at` (ADR-0007 items 5 and 6, no schema change);
  #219 may name another field (for example a `lesson_progress` time) if it is a better "last active" signal.
- **Q6. A course with no `ready` lesson.** Assumption: listed, as a block in the empty form
  ([Dashboard structure](ia.md#dashboard-structure) item 4) and in "Другие курсы"
  ([A218-14](ia.md#A218-14)), as a module with no visible lesson is listed "Готовится" (ADR-0009 item 5);
  no course `status` field is added.
- **Q7. `<title>`.** Assumption: unchanged: the `<title>` of each page is the one of `ia.md` page inventory.
  Because the breadcrumb names the course on the page, and the two courses in view have no shared lesson title; revisit when two courses share one.
- **Q8. `/courses`.** Assumption: no route; `/courses` is not-found way (1). A course list page is not
  designed here ([A218-1](ia.md#A218-1)); if #219 keeps a `/courses` route, what it shows (a redirect to `/`, or a page) is a
  follow-up DESIGN task, because a page needs its own prototype.
- **Q9. Reads per request.** Assumption (ADR-0009 item 8, one read per request): the dashboard reads every
  course's tree (each block's contents: [A218-4](ia.md#A218-4), [A218-6](ia.md#A218-6)); a lesson page
  reads only the URL's course (not-found: `ia.md` page inventory, not-found Route); a
  catalog page reads the URL's course and the list read below, for its other-courses list
  ([A218-14](ia.md#A218-14)); the top
  bar reads no course. The list read returns, per course, its id and its title, which is what an
  other-courses link needs (failure cases: see #222).
- **Q10. Workspace service and validator.** Assumption: `services/workspace/src/course/lessons.ts` (today
  "expected exactly one course") and `content:validate` follow Q1 (course id) and Q2 (failure scope).

## Requirements for #220

What #220 builds from this design, with the flows and rules it builds from (FU20). The error and focus states of the
same pages with several courses come from #222's requirements, so #220 needs #222 for them: see #222.

1. The top bar of `ia.md` R6 "Top bar by release", from #220 ([A218-3](ia.md#A218-3));
   `apps/web/components/top-bar-nav.tsx` loses its `courseId` prop.
2. The dashboard of `ia.md` [Dashboard structure](ia.md#dashboard-structure),
   [Dashboard by course count](ia.md#dashboard-by-course-count) and
   [Cross-course sections](ia.md#cross-course-sections), with every rule they link (among them the
   decisions, the vocabulary rows "end Card" and "Card heading", the root error of Q3), and the course each dashboard
   control is built from: the dashboard rows of `ia.md` R6 ["Course scope (#218)"](ia.md#course-scope), its
   F18.3/F18.4 row included.
3. The error and focus states with several courses: see #222.
4. The lesson breadcrumb's first crumb ([A218-8](ia.md#A218-8), F22); `apps/web/lib/copy.ts` "Курс" is no
   longer used for it.
5. Per-course reads (Q1, Q2, Q9), and the course each control of `ia.md` R6
   ["Course scope (#218)"](ia.md#course-scope) is built from, in every row (the dashboard rows: item 2;
   the lesson row with the environment-rejected "Открыть курс"; the catalog rows); the failure scope: see #222.
6. Not-found: [A218-12](ia.md#A218-12).
7. e2e: two courses, a lesson opened in each (#217 done-test, with the stub); the `F6` landing on `main`
   per [Dashboard structure](ia.md#dashboard-structure), "Tab order and `F6`", in each of rows 2-5 of
   "Dashboard by course count"; the "Урок" landing and the course crumb per `ia.md` R3, in each layout its
   "Урок" rows name; the not-found page with and without "Открыть курс" ([A218-12](ia.md#A218-12)). The e2e of the error and focus states: see #222.
8. The catalog's other-courses list ([A218-14](ia.md#A218-14)). e2e: two courses, one without a `ready`
   lesson: its catalog opens from its dashboard block heading and from the other catalog's list. The list
   with a broken course: see #222.

## Decisions (#218)

The decisions are defined in `ia.md` "Several courses (#218)": [A218-1](ia.md#A218-1),
[A218-2](ia.md#A218-2), [A218-3](ia.md#A218-3), [A218-4](ia.md#A218-4), [A218-5](ia.md#A218-5),
[A218-6](ia.md#A218-6), [A218-7](ia.md#A218-7), [A218-8](ia.md#A218-8), [A218-12](ia.md#A218-12),
[A218-13](ia.md#A218-13), [A218-14](ia.md#A218-14); A218-9 to A218-11: see #222.

## Not designed in #218

- No course authoring UI, payments, per-course access control, enrollment action (issue #218 out of scope).
- Nothing that [A218-1](ia.md#A218-1) or [A218-3](ia.md#A218-3) leaves out; a `/courses` route is Q8.
- No search, filter or sort control for courses (two courses).
- No course `status`, `order` or short title in the lesson format (a format change, ADR-0001 item 7); Q5, Q6.
- No ADR text (#219), no code (#220), no per-course reference program layout (#221).
- No change to the lesson page regions, the `F6` cycle, the check, quiz, mentor, environment or history
  flows beyond [A218-3](ia.md#A218-3), [A218-8](ia.md#A218-8),
  the course the page reads (Q9) and the course its controls are built from (`ia.md` R6
  ["Course scope (#218)"](ia.md#course-scope), lesson row, the environment-rejected "Открыть курс" of F8
  among them).
- No error or focus state with several courses, and no flow F21: see #222.
- No new token and no new component; the system changes are the `design/system/README.md` "Top bar
  rules" sentence, the top bar and breadcrumb samples and a heading-link style (`plans/218-design.md`); the
  other-courses list ([A218-14](ia.md#A218-14)) is drawn with a list style the catalog already has.
- No second way to the lesson pages that have one way only (`ia.md` [Multiple ways](ia.md#multiple-ways),
  item "lesson"; FU26).
