# Journey: dashboard, "what next"

Page: dashboard (`/`). Sources: `docs/learning-process.md` §4 and §6 ("you open the next lesson on the
dashboard"), #29 (dashboard "with courses and progress (empty for now)"), the learner profile, "Known
weak spots" (freezing on "build the whole thing": the dashboard names one next step), research §1 G1, G7.
Progress sections of the dashboard are F18 in `progress.md`. From #220 the course list:
[A218-1](ia.md#A218-1) (flow F20 in `courses.md`); the dashboard's states and order: `ia.md`
[Dashboard by course count](ia.md#dashboard-by-course-count), [Dashboard structure](ia.md#dashboard-structure);
the Card's course: [A218-2](ia.md#A218-2).

## F4: Pick the next lesson on the dashboard

**Goal:** know in one look what to study next and open it. Source: learning-process §6 item 1; profile
"Known weak spots"; G1, G7.

**Entry:** after sign-in when F1.4 lands on the dashboard; "Главная" or "Академия" in the top bar.

**Steps (3):**

1. F4.1 Learner sees the "Следующий урок" card: from #220 the course name ([A218-7](ia.md#A218-7)), lesson
   title, module title, lesson type, estimated time ("около 60 мин"), and one button: "Продолжить" when the lesson is started, "Начать" otherwise (rule R5
   in `ia.md`: an attempt exists or terminal input was recorded; opening the lesson or the automatic
   environment start does not count).
2. F4.2 Learner presses the button.
3. F4.3 Learner lands on the lesson page: "Начать" opens tab Теория (Задание when the lesson has no
   theory), "Продолжить" opens tab Задание.

**Rule for "next lesson":** the first `ready` lesson of the course in catalog order that is not finished;
from #220 which course the Card shows: [A218-2](ia.md#A218-2); a course block's: [A218-4](ia.md#A218-4). A lesson is
passed when every one of its checks is passed, and finished when every check is passed or closed (F14);
a closed lesson does not block the queue (assumption A9 in the #50 design notes). Prerequisites do not
change the order, because the catalog order already respects them in module 00
(`course/ai-for-developers/00-introduction/*/lesson.yaml`).

Why Задание for "Продолжить" (assumption A18 in the #50 design notes): the button reads "Продолжить" only for
a started lesson (R5: an attempt or terminal input), so the learner has practised, not only opened the
page; the last open tab lives only in the lesson URL's query and the dashboard cannot know it. Until #31
or #34 ships no lesson can be started, so the card always reads "Начать" (R5).

**Success:** the lesson page opens.

**Error states:**
- From #220: the root error, [Dashboard by course count](ia.md#dashboard-by-course-count) row 1. The bullets below describe the
  one-course app from #30 until #220. Error states with several courses, from #220: see #222.
- Course data cannot be read (course files invalid or missing in the container): the card is replaced by
  an alert "Не удалось загрузить курс" with "Повторить"; the top bar stays usable (without "Курс" while
  the course id is unknown, `ia.md` R6 "Course id unknown"). The alert's title is an h2 (`tabindex="-1"`)
  in the Card's place, under the h1 "Главная", because it is what a retry that fails again focuses.
  "Повторить" reloads the course; its outcomes, focus and `<title>`: `ia.md` R2, page-level retry table,
  row "dashboard course error (until #220)", under the R2 [retry focus guard](ia.md#retry-focus-guard).
- Progress cannot be read (database down) but the course can: the card shows the course's first `ready`
  lesson in catalog order with "Начать" and a muted line "Прогресс недоступен, показан первый урок",
  because the learner can still study.

**Empty states:**
- First run (no progress, #29 "empty for now"): the card shows the course's first `ready` lesson in
  catalog order with "Начать" (from #220 of the Card course, [A218-2](ia.md#A218-2)); the progress section
  shows "Пока нет пройденных уроков" (F18; from #220 where: [Dashboard structure](ia.md#dashboard-structure) item 4).
- Every `ready` lesson finished (from #220 when [A218-2](ia.md#A218-2) picks the end Card): the
  **end Card** (`ia.md` vocabulary row "end Card", its heading by that row) with "Новые модули появятся в
  каталоге" and a link "Открыть курс" (from #220 its target: `ia.md` R6 "Course scope (#218)").
  Five of six modules are `planned` today (research §3), so this state is reachable early. #220 builds the
  end-Card headings (`ia.md` vocabulary row "end Card"; `courses.md` "Requirements for #220" item 2); the
  app's copy module `apps/web/lib/copy.ts` has no end-Card heading yet.
- No `ready` lesson at all: "В курсе пока нет готовых уроков" with no button (before #220). From #220:
  [Dashboard by course count](ia.md#dashboard-by-course-count).

**Exit:** F4.3, or the end Card's "Открыть курс" into F5; the top bar (`ia.md` R6 "Top bar by release";
from #30 until #220 its "Курс" into F5, [the label "Курс"](ia.md#course-label)); the progress section's
exits: `progress.md` F18 Exit. From #220 every exit of the page: `courses.md` F20 Exit.

**Keyboard path:** from #30 until #220, the skip link and the next Tab: per `ia.md` R4; `F6` to `main` and the
Tab order in `main`: per R3 (the bullet on pages other than the lesson page). From #220 the Tab order and
the `F6` landing: [Dashboard structure](ia.md#dashboard-structure), "Tab order and `F6`". Enter on the
Card's button opens the lesson.
Before #30 (see "Dashboard by release"), the skip link and `F6` to `main` focus `main` itself
(`tabindex="-1"`); `main` holds nothing focusable, so the next Tab leaves the page content.

**Time limits:** none.

## Dashboard by release

Each release state is one named state (rule R6 in `ia.md`, "Before the catalog ships").

- **Before #30** (#29 shipped, the catalog and lesson routes not yet): h1 "Главная" and the empty state
  "В курсе пока нет готовых уроков", whatever the course holds, because the Card button and the module
  rows open `/courses/...` routes that do not exist yet. With module 00 `ready` the sentence is not literally
  true; this is an accepted, temporary inaccuracy, because the string is already shipped by #29 and in the
  copy register, new copy would need an app change for a state that #30 removes, and the learner loses no
  action (no lesson can be opened before #30 either way). #29 reads neither the course nor progress, so the
  loading, course error and progress unavailable states do not occur before #30 either. Top bar
  "Академия", "Главная", user menu, no "Курс". Tab order: "К содержимому", "Академия", "Главная", user
  menu, "Войти снова" (only with the F2.1 alert); nothing focusable in `main`. `F6`: "Верхняя панель" ("Академия"), "Уведомления" ("Войти снова", only with the
  alert), `main` itself (`tabindex="-1"`). The session alert (F2.1) and the user menu (F3) work as in every
  release. No exit to the catalog; F4.1-F4.3 and F18 are not shown. Prototype state
  `#state-before-catalog`.
- **From #30**: F4 and F18.1-F18.2 as designed above, with "Курс" in the top bar ([the label
  "Курс"](ia.md#course-label)). No element of F18.3-F18.5: no section, no
  heading, no placeholder, no cost.
- **From #35**: as from #30, plus F18.3 "Последние попытки" and F18.4 "Где трудно" (`progress.md`), with
  their empty texts, and no cost element anywhere: no attempt cost in the rows and no total, because before
  #37 nothing writes a cost (Stepan, #72 architect brief, O3). The Tab order and the `F6` landing: until
  #220 per `ia.md` R3 (the bullet on pages other than the lesson page); from #220 per
  [Dashboard structure](ia.md#dashboard-structure), "Tab order and `F6`" (which page #35 is built on: `ia.md` FU21).
- **From #37**: as from #35, plus the attempt cost in each "Последние попытки" row that can spend and the
  total F18.5 "Потрачено на проверки и разборы: $N" with its note (ADR-0007 item 11, Proposed). Every
  member each release renders: `ia.md` R6, "Progress by release (#72)".
- **From #220** (#218 design): the top bar of `ia.md` R6 "Top bar by release" ([A218-3](ia.md#A218-3)) and
  the page of [Dashboard structure](ia.md#dashboard-structure) and
  [Dashboard by course count](ia.md#dashboard-by-course-count). What the #35 and #37 rows above add renders on
  this page too, where and as [Dashboard structure](ia.md#dashboard-structure) item 5,
  [Cross-course sections](ia.md#cross-course-sections) and [A218-13](ia.md#A218-13) say (which page #35 is
  built on: `ia.md` FU21).
