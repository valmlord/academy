# Journey: catalog and module

Page: catalog (`/courses/[courseId]`), with one section per module (`#[moduleId]`). Sources: #30 (catalog
of modules and lessons, `ready` only; e2e "open a module, open a lesson, see the theory"),
`course/ai-for-developers/course.yaml` and `*/module.yaml`, ADR-0001 item 4, research §3.

Module sections, not module pages, because the course has six modules of which five are `planned` with
no lessons (research §3): five module pages would be empty, and one page with six sections shows the
whole course at once (decision A6 in the #50 design notes). "Open a module" in #30's e2e means following the
module link to its section.

## F5: Find a lesson in the catalog

**Goal:** see what the course contains and open a chosen lesson. Source: #30; G1.

**Entry:** "Курс" in the top bar; "Открыть курс" on the dashboard or on the not-found page (the top-bar
"Курс" and the not-found "Открыть курс" only while the course id is known, `ia.md` R6 "Course id
unknown"); the module crumb on a lesson page (lands on that module's section).

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
- Course data cannot be read: alert "Не удалось загрузить курс" with "Повторить", whatever course id the
  URL names, because without the course the page cannot tell a wrong id from the right one. The top bar
  keeps "Курс" unless `course.yaml` itself is unreadable (`ia.md` R6, "Course id unknown"). `<title>`
  "Не удалось загрузить курс". "Повторить" focuses the course h1 when the course loads (`<title>` the
  course title), the error h1 when it fails again, and the not-found h1 when the course loads but its id
  is not the URL's (`<title>` "Страница не найдена"; `ia.md` R2, page-level retry table). The course h1
  and error h1 moves happen only while focus is still on "Повторить", on `body` or in `main` (R2, retry
  focus guard).
- A URL that is a way into the not-found page (`ia.md` page inventory, not-found Route): the not-found page
  (`design/pages/not-found/`, #83): h1 "Страница не найдена", the sentence "Возможно, в адресе опечатка
  или ссылка устарела." and "Открыть курс" (only while the course id is known, see below); no breadcrumb, no "404", no destructive colour, because the
  learner followed a stale link or mistyped, nothing failed (GOV.UK page-not-found pattern, #83 research
  §5). A non-`ready` lesson is never visible (#30 AC), so it is reported as not found rather than "not
  ready yet", because a "coming soon" page would show that it exists; the sentence holds for both causes
  and names neither. The not-found page has the "from #30" top bar (`ia.md` R6, "Before the catalog
  ships"), `aria-current` on neither link; its `F6` stop `main` lands on "Открыть курс". While the course
  id is unknown (`course.yaml` unreadable, so only an unmatched path can reach it) it has no "Открыть
  курс" and no "Курс": `main` holds the h1 and the sentence, `F6` lands on `main` itself, and the way on
  is "Главная" in the top bar, because every course page would show the course error.
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
