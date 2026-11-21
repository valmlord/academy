# Journey: several courses

Pages: dashboard (F20, F21), lesson (F22). Issue #218 (parent epic #217); F21 and the error and focus
states: #222. Sources: #218 scope items 1-5; #217 (a
stub second course with one `ready` lesson); #219 (the ADR-0009 amendment); `docs/learning-process.md` §4 and
§6 item 1; `.claude/learner/profile.md` "Known weak spots"; "research §n" cites the #218 research
(`plans/218-research.md`, a working note). The learner journal has no entry about courses.

Scope: the normal states with several courses and the root error, from #220. The decisions A218-1 to
A218-8 and A218-12 to A218-14 and the rules are in `ia.md` "Several courses (#218)". The error and focus
states (#222): `ia.md` [Error and focus states (#222)](ia.md#errors-222), and F21 below.

## F20: Choose a course on the dashboard

**Goal:** see every course, how far I am in each, and open the next lesson or the catalog of the one I
choose. Source: #218 scope items 1 and 3; #35 ("course percentage"); learning-process §4; research §0 G2, G3.

**Entry:** the dashboard (F4 Entry).

**Steps (4):**

1. F20.1 Learner sees the course blocks, each headed by its course name (A218-1, A218-7).
2. F20.2 Learner reads a block: the course line and module rows (F18.1, F18.2), or the empty text.
3. F20.3 Learner opens the block's next-lesson link (A218-4); the lesson page opens on the tab F4.3 names.
4. F20.4 Or the learner opens the block heading link (or a module row); that course's catalog opens (F5.1,
   or F5.2 at the module's section).

**Success:** the lesson page (F20.3) or the catalog (F20.4) of the chosen course opens.

**Error states:** the root error (`ia.md` "Rules (#218)"; Q3; [ES2](ia.md#ES2)); session expired: F2;
`ia.md` [ES1](ia.md#ES1) (F21), [ES3](ia.md#ES3), [ES4](ia.md#ES4), [ES10](ia.md#ES10),
[ES11](ia.md#ES11).

**Empty states:** first run: each readable block shows the F18 first-run course line; a course with no
`ready` lesson: a block in the empty form (Q6).

**Exit:** F20.3, F20.4, the Card (F4.3, or the end Card's "Открыть курс"), from #35 the F18.3 and F18.4
rows, the top bar.

**Keyboard path:** `ia.md` "Rules (#218)", row "Tab order in `main`, `F6`". Enter follows a link.

**Time limits:** none of its own; the session (F2).

## F21: Retry a course that cannot be read

**Goal:** when one course cannot be read, keep studying the others and retry it. Source: #218 scope
item 5; #219 bullet 3 (ADR-0009 item 7 failures scoped per course); #220 test "two courses, one of them
broken"; #222.

**Entry:** the dashboard (F4 Entry) with a block in the error form (`ia.md` [ES1](ia.md#ES1)).

**Steps (3):**

1. F21.1 Learner sees the block in the error form ([ES1](ia.md#ES1)).
2. F21.2 Learner presses the block's "Повторить".
3. F21.3 The dashboard is read again ([RR1](ia.md#RR1)); focus and announcement: [RO1](ia.md#RO1),
   [RO2](ia.md#RO2).

**Success:** the course loads ([RO1](ia.md#RO1)).

**Error states:** [RO2](ia.md#RO2); [RG1](ia.md#RG1), [RG2](ia.md#RG2); [FB1](ia.md#FB1) to
[FB7](ia.md#FB7); [AN1](ia.md#AN1); session expired: F2.

**Empty states:** none.

**Exit:** F21.3 into F20; another block (F20); the top bar.

**Keyboard path:** [ES12](ia.md#ES12) and `ia.md` "Rules (#218)" row "Tab order in `main`, `F6`"; Enter
or Space presses "Повторить" (R2).

**Time limits:** none of its own; the session (F2).

## F22: Tell which course a lesson belongs to and go back to it

**Goal:** know from the page which course a lesson is in, and return to that course. Source: #218 scope item
4; #219 ("Lesson URLs include the course id in the path"); research §0 G4; NN/g breadcrumbs (research §5).

**Entry:** any lesson page whose course was read.

**Steps (2):**

1. F22.1 Learner sees the breadcrumb, its first crumb the course name (A218-8).
2. F22.2 Learner opens the course crumb, which opens that course's catalog (F5.1), or the module crumb
   (F5.2).

**Success:** the catalog of the lesson's course opens.

**Error states:** the lesson course error (`lesson-environment.md` F7; `ia.md` [ES8](ia.md#ES8),
[ES9](ia.md#ES9));
not-found ways (3) and (4) (`ia.md` page inventory), with the action of A218-12.

**Empty states:** none: a lesson always has a course and a module.

**Exit:** F22.2 into F5; the top bar ("Академия", "Главная") into F20.

**Keyboard path:** `ia.md` "Rules (#218)", row "course crumb landing". A long course name wraps; at 320 px
and at 200 % zoom on a 1280 px screen nothing scrolls sideways (WCAG 1.4.10).

**Time limits:** the lesson page's own (F10, F2).

## Questions for #219

What the ADR-0009 amendment decides. Each has this design's assumption; a #219 decision against one goes to
a follow-up DESIGN task, which also checks `ia.md` [Error and focus states (#222)](ia.md#errors-222).

- **Q1. Course id.** The course's directory name; `course.yaml` `id` must equal it, or that course fails to
  read. Then every course has an id and a URL, and ids cannot repeat.
- **Q2. Failure scope.** An ADR-0009 item 7 failure makes only its own course unavailable; only the course
  root fails globally.
- **Q3. Zero courses.** A readable root with no course is the root error, not an empty state, because the
  repository ships `course/`, so an empty root is a misconfiguration.
- **Q4. Duplicate ids.** Impossible under Q1; without Q1: `ia.md` [ES11](ia.md#ES11).
- **Q5. Ordering.** List order is ascending course id (Q1) as plain strings, so a `00-` prefix orders
  courses. A course's learner activity (A218-2) is the newer of its newest `attempts.started_at` and its
  `enrollments.enrolled_at`; no schema change.
- **Q6. A course with no `ready` lesson.** Listed (an empty-form block, a "Другие курсы" link); no course
  `status` field.
- **Q7. `<title>`.** Unchanged (`ia.md` page inventory), because the breadcrumb names the course.
- **Q8. `/courses`.** No route; it is not-found way (1). A route would need its own design task.
- **Q9. Reads per request.** The dashboard reads every course; a lesson page reads the URL's course; a
  catalog reads the URL's course and the course list (ids and titles, for "Другие курсы"); the top bar reads
  none.
- **Q10. Workspace service and validator.** `services/workspace/src/course/lessons.ts` ("expected exactly
  one course") and `content:validate` follow Q1 and Q2.

## Requirements for #220

1. The top bar: A218-3 (`apps/web/components/top-bar-nav.tsx` loses its `courseId` prop).
2. The dashboard: A218-1, A218-2, A218-4 to A218-7, A218-13 and `ia.md` "Rules (#218)".
3. The course crumb: A218-8 (`apps/web/lib/copy.ts` "Курс" no longer used for it).
4. Per-course reads (Q1, Q2, Q9) and the course of each control (`ia.md` "Rules (#218)").
5. Not-found: A218-12 and the page inventory's from-#220 ways.
6. "Другие курсы": A218-14.
7. e2e: two courses (one the #217 stub), a lesson opened in each; the dashboard `F6` landing with and without
   a Card; the course crumb landing in each layout; not-found with and without "Открыть курс"; a catalog
   without a `ready` lesson opened from its block and from "Другие курсы".
8. The error and focus states: `ia.md` [Error and focus states (#222)](ia.md#errors-222) and F21. e2e: one
   test for each id of that section that the #220 pages render.
9. The quiz answer key in `sessionStorage` (`quiz.md` F15 error states, "Session expired while answering")
   also holds the course id.

## Not designed in #218

- Course authoring, payments, access control, enrollment (issue #218 out of scope); search, filter or sort
  of courses; a course list page or `/courses` route (A218-1, Q8); a course switcher (A218-3).
- A course `status`, `order` or short title in the lesson format (ADR-0001 item 7).
- ADR text (#219), code (#220), the per-course reference program (#221, FU24).
- Changes to the lesson regions, the `F6` cycle, checks, quiz, mentor, environment or history beyond the
  top bar and the course crumb.
- New tokens or components; the system changes are the `design/system/README.md` "Top bar rules" sentence,
  the top bar and breadcrumb samples and a heading-link style.
- A second way to every lesson page (FU26).
- Error and focus states, and F21: designed in #222 (`ia.md` [Error and focus states (#222)](ia.md#errors-222)).

## Not designed in #222

- A busy state of a dashboard re-read beyond R2.
- Drawn states of `ia.md` [ES11](ia.md#ES11).
- The #35 parts of [ES5](ia.md#ES5), [FB3](ia.md#FB3) and [FB4](ia.md#FB4): FU21.
- Changes to the lesson text load, history and quiz retries.
