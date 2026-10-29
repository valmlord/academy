# Journey: dashboard, "what next"

Page: dashboard (`/`). Sources: `docs/learning-process.md` §4 and §6 ("you open the next lesson on the
dashboard"), #29 (dashboard "with courses and progress (empty for now)"), `learner/profile.md` "Known
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
a closed lesson does not block the queue (assumption A9 in the design file). Prerequisites do not
change the order, because the catalog order already respects them in module 00
(`course/ai-for-developers/00-introduction/*/lesson.yaml`).

Why Задание for "Продолжить" (assumption A18 in the design file): the button reads "Продолжить" only for
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

**Exit:** F4.3; or the catalog via the top bar (F5).

**Keyboard path:** the skip link moves focus to `main` (R4); the next Tab, or `F6` to `main` (R3), reaches
the card's button (or "Повторить" / "Открыть курс" in those states); Enter opens the lesson.

**Time limits:** none.
