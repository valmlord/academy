# Journey: dashboard, "what next"

Page: dashboard (`/`). Sources: `docs/learning-process.md` §4 and §6 ("you open the next lesson on the
dashboard"), #29 (dashboard "with courses and progress (empty for now)"), the learner profile, "Known
weak spots" (freezing on "build the whole thing": the dashboard names one next step), research §1 G1, G7.
Progress sections of the dashboard are F18 in `progress.md`.

## F4: Pick the next lesson on the dashboard

**Goal:** know in one look what to study next and open it. Source: learning-process §6 item 1; profile
"Known weak spots"; G1, G7.

**Entry:** after sign-in (F1.4) with no `next`; "Главная" or "Академия" in the top bar.

**Steps (3):**

1. F4.1 Learner sees the "Следующий урок" card: lesson title, module title, lesson type, estimated time
   ("около 60 мин"), and one button: "Продолжить" when the lesson is started, "Начать" otherwise (rule R5
   in `ia.md`: an attempt exists or terminal input was recorded; opening the lesson or the automatic
   environment start does not count).
2. F4.2 Learner presses the button.
3. F4.3 Learner lands on the lesson page: "Начать" opens tab Теория (Задание when the lesson has no
   theory), "Продолжить" opens tab Задание.

**Rule for "next lesson":** the first `ready` lesson in catalog order that is not finished. A lesson is
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
- Course data cannot be read (course files invalid or missing in the container): the card is replaced by
  an alert "Не удалось загрузить курс" with "Повторить"; the top bar stays usable.
- Progress cannot be read (database down) but the course can: the card shows the first lesson with
  "Начать" and a muted line "Прогресс недоступен, показан первый урок", because the learner can still
  study.

**Empty states:**
- First run (no progress, #29 "empty for now"): the card shows the first lesson of the first module with
  "Начать"; the progress section shows "Пока нет пройденных уроков" (F18).
- Every `ready` lesson passed: the card reads "Все доступные уроки пройдены" and "Новые модули появятся в
  каталоге" with a link "Открыть курс". Five of six modules are `planned` today (research §3), so this
  state is reachable early.
- No `ready` lesson at all: "В курсе пока нет готовых уроков" with no button.

**Exit:** F4.3; or the catalog via the top bar (F5, from #30).

**Keyboard path:** from #30, the skip link moves focus to `main` (R4); the next Tab, or `F6` to `main`
(R3), reaches the card's button (or "Повторить" / "Открыть курс" in those states); Enter opens the lesson.
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
- **From #30**: F4 and F18.1-F18.2 as designed above, with "Курс" in the top bar.
