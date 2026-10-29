# Journey: catalog and module

Page: catalog (`/courses/[courseId]`), with one section per module (`#[moduleId]`). Sources: #30 (catalog
of modules and lessons, `ready` only; e2e "open a module, open a lesson, see the theory"),
`course/ai-for-developers/course.yaml` and `*/module.yaml`, ADR-0001 item 4, research §3.

Module sections, not module pages, because the course has six modules of which five are `planned` with
no lessons (research §3): five module pages would be empty, and one page with six sections shows the
whole course at once (decision A6 in the design file). "Open a module" in #30's e2e means following the
module link to its section.

## F5: Find a lesson in the catalog

**Goal:** see what the course contains and open a chosen lesson. Source: #30; G1.

**Entry:** "Курс" in the top bar; "Открыть курс" on the dashboard; the module crumb on a lesson page
(lands on that module's section).

**Steps (4):**

1. F5.1 Learner sees the course title and description, and the module list in course order; each module
   shows its number and title, and a module status (`ia.md` set): "Доступен" (has `ready` lessons) or
   "Готовится" (`planned`, or no `ready` lesson yet).
2. F5.2 Learner opens a module section (a link in the module list, or scrolling): summary, "Чему
   научитесь" (the module outcomes), and the lessons.
3. F5.3 Learner scans the lessons: number, title, type, estimated time, lesson status (`ia.md` set: "Не
   начат", "В процессе", "Пройден", "Не пройден"; all four by rule R5, "Не пройден" only once checks can
   close, D1), and a prerequisites note when one is not passed (F6).
4. F5.4 Learner opens a lesson and lands on the lesson page, tab Теория (Задание when the lesson has no
   theory).

**Success:** the lesson page opens (#30 e2e).

**Error states:**
- Course data cannot be read: alert "Не удалось загрузить курс" with "Повторить".
- Unknown lesson or module in the URL, or a lesson that is not `ready`: the not-found state "Страница не
  найдена" with "Открыть курс". A non-`ready` lesson is never visible (#30 AC), so it is reported as not
  found rather than "not ready yet", because a "coming soon" page would show that it exists. Not-found is
  an app-shell state with the top bar; it is not prototyped in #50 (design file §3), this copy is its
  spec.
- Progress cannot be read: lessons show no learner status and no prerequisite note (whether a
  prerequisite is passed is progress data, F6 error states), and a muted line "Прогресс недоступен" once
  at the top; lessons stay openable.

**Empty states:**
- A `planned` module: its section shows summary and outcomes, then "Уроки модуля готовятся" instead of a
  lesson list. It is the common case today (five of six modules, research §3).
- A module that is `ready` but has no `ready` lesson: the same text, module status "Готовится".

**Exit:** F5.4; or the dashboard via the top bar.

**Keyboard path:** Tab through the module links (Enter moves focus to that module's section heading),
then through lesson links in order; each lesson row is one link, so one Tab per lesson.

**Time limits:** none.

## F6: Open a lesson whose prerequisites are not passed

**Goal:** know that a lesson builds on another one, and decide myself. Source: `prerequisites` in
`lesson.yaml` (e.g. `02-agent-loop` needs `intro-models-effort`), research §3 and open question 3.

**Entry:** a lesson row in the catalog (F5.3) or a lesson page whose `prerequisites` include a lesson that
is not passed.

**Steps (3):**

1. F6.1 Learner sees on the lesson row a muted note "Сначала пройдите: <lesson title>" (one link per
   missing lesson).
2. F6.2 Learner opens the lesson anyway; the lesson page shows the same note as a non-blocking alert above
   the theory, with links to the missing lessons.
3. F6.3 Learner either follows a link to the missing lesson or keeps reading.

**Success:** the learner knows the dependency and the lesson stays open. Prerequisites warn and never lock
(decision A5), because the only learner is a senior developer who may already know the topic, and a lock
needs reliable progress data that M0 does not have (#29 "progress empty for now").

**Error states:**
- A prerequisite id that is not a `ready` lesson: the note is not shown for it (the contract validator
  should already catch this; the UI does not surface a broken id).
- Progress cannot be read: no note in the catalog (F5 error states) and no alert on the lesson page,
  because the UI cannot tell whether the prerequisite is passed, and a warning shown for every
  prerequisite would be wrong for the passed ones. In the catalog the muted line "Прогресс недоступен"
  says why.

**Empty states:** no prerequisites, or all passed: no note.

**Exit:** F6.3.

**Keyboard path:** in the catalog the note's links are in the Tab order right after the lesson's own
link. On the lesson page they come after the breadcrumbs and the lesson header ("Показать все") and before
the left-pane tab list (R4), so they are the first controls after the lesson header, not the first of
`main`.

**Time limits:** none.
