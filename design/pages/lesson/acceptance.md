# Lesson: acceptance notes

## Route

`/courses/[courseId]/lessons/[lessonId]`, left-pane tab in the query `?tab=theory|task|checks` before #36,
`?tab=theory|task|checks|quiz` from #36 (`ia.md`, "Deep links"; a tab not shown in the current release, or
not on this lesson, `?tab=quiz` on a lesson without a quiz check, falls back to Теория, or Задание without
theory). `<title>` and h1: the lesson title. `?tab=` is read and written:
- **Read on arrival:** the page opens the tab the query names (dashboard "Продолжить" and the sign-in `next`
  redirect both send `?tab=task`; "Войти снова" sends the tab the learner was on, from #36 also `?tab=quiz`).
  The prototype maps it without a `#state-` hash: `?tab=task` opens `#state-task`, `?tab=checks` opens
  `#state-checks-before`, `?tab=quiz` opens `#state-quiz-restored` (from #36; the F2 return with the answers
  restored, `quiz.md` "Error states"), `?tab=theory` or any other value the default state; with a hash, the
  hash picks the state and the query then re-selects its tab when that state shows it. The same rule holds
  on Back and on a typed `#state-`, so Back after a simulated action returns with the tab the learner had.
  Only a click in the prototype's "States" index shows a state's documented tab instead (prototype chrome,
  no app equivalent).
- **Written on selection:** selecting a left-pane tab replaces `?tab=` (`theory|task|checks`, from #36 also
  `quiz`) with `history.replaceState`, no new history entry; the rest of the URL (the prototype's `#state-`
  hash, and `attempt` below) stays.
- **Attempt deep link (from #35, #72):** `?tab=checks&attempt=<attemptId>` (`ia.md` Navigation model,
  "Attempt deep link"; every "Последние попытки" row of the dashboard links it). `attempt` is read only with
  `tab=checks` and only when the Проверки tab is shown; before #35 it is ignored. It moves focus once, on
  load, as the table in Interactions and keyboard ("Attempt deep link") says, and is never applied again
  (not by a background re-read, not by "Повторить"). F2 keeps it in `next`. The prototype ignores the value:
  the `#state-` hash picks the arrival case (the dashboard prototype links each row to its own state).

While the course cannot be read, `<title>` and h1 are "Не удалось загрузить курс" (HTTP 200), whatever
course and lesson ids the URL names: without the course the page cannot tell a hidden lesson from a real
one (F7 error states). The not-found page (`design/pages/not-found/`, HTTP 404; `ia.md` page inventory,
not-found Route) is what a lesson URL whose course id is not the course's, or a lesson URL whose lesson id
names no `ready` lesson of the course, opens.

Dev issues: #30 (M0 lesson), #31 and #32 (environment, terminal), #34 (check bar and Проверки, v1 lesson),
#35 ("История попыток" and the attempt deep link), #36 (the Квиз tab, F15; blocked by #34, `quiz.md` P4),
#37 and #39 (its cost elements), #220 (several courses: the top bar of `ia.md` A218-3 and the course crumb of
A218-8; design #233).

## Prototype

`design/pages/lesson/prototype.html`. States by `#state-<name>`; the strip at the top ("Dark theme" and
"States") is prototype chrome, not product UI: it is the last element in the DOM so the product Tab order
starts with "К содержимому", and it is only drawn first. Buttons that change state in the app (for example
"Проверить", "Запустить снова", "Сбросить") move the prototype to the matching state and put focus where
R2 / R3 say.

Content is real: course `ai-for-developers`, module `00-introduction`, lesson `01-models-and-effort`
(theory.md, task.md, `lesson.yaml` sources, check `model-routing` with `timeoutSec: 30`, grader messages of
`checks/verify_routing.py`; `attempts.limit: 10` from #68, so "из 10" in the limit-known states). **Sample
data**, because this lesson does not have it: three outcomes
(`#state-outcomes-collapsed`, `-expanded`; extra items are module 00 outcomes), a prerequisite
(`#state-prerequisite`), a lesson without `workspace` (`#state-no-workspace`), a lesson with no check the
platform runs (`#state-no-checks`), the ten-row status list (`#state-statuses`, titles of the module 00
`command` checks; one row per check status of `checks.md` except the from-#39 budget variant, not a
combination the runner produces), the four-check lesson of `#state-mixed` and `#state-mixed-running`
(module 00 `command` checks; `cost-estimate` with its real limit 10, `plan-structure` with a sample limit
of 3, it has none in `lesson.yaml`), and the token-spending lessons from #37 / #39 (`#state-budget-*`,
`#state-statuses-agent`, `#state-passed-paid-only`: lesson 05 with its `agents-md-rubric` and a sample
hidden-task check "Агент решает скрытую задачу с вашим AGENTS.md", sample budgets and costs). Before #36 the
quiz check `models-effort-quiz` is not listed anywhere (R6, A19), so the v1 count is "из 1": every state
but `#state-quiz`, the `#state-quiz-*` states, `#state-history-quiz` and `#state-history-quiz-open` draws this
release.

**Several courses (from #220, #218).** Every state except `#state-m0` draws #220 (its States label starts
"#220, "; its release words stay): the top bar is `ia.md` A218-3 ("Академия", "Главная", the user menu; no
"Курс", `aria-current` on neither link), and the breadcrumb is A218-8, its first crumb the course name
(A218-7): "ИИ для разработчиков" / "Введение в разработку с ИИ" / "Модель, уровень ризонинга и локальные
модели". The course crumb is `#crumb-course`, on one element only. `#state-m0` is the M0 lesson
(`lesson-environment.md` "Lesson page by release"), a release before #220, so it keeps that release's top
bar ("Академия", "Главная", "Курс"; `ia.md` R6 "Top bar by release") and the crumb "Курс": both are
`data-state="m0"` variants, the crumb one in the same `li` as `#crumb-course`, with no id. No
`data-goto-state` targets `#state-m0` or shows in it. With several courses the page draws no new state: the
lesson course error is still the catalog's `#state-course-error` (a state kept until #220; its #220 form
with several courses: see #222), a pointer here, not a link.

**From #36, the 30 `#state-quiz-*` states** (`quiz.md`, F15) draw the Квиз tab with the real quiz of this
lesson: `models-effort-quiz` "Квиз: effort, поверхности и локальные модели", 6 questions in file order (2
`multiple`), K = 5 (`passScore` 0.8, task.md "нужно 5 верных"), the limit 3 drawn as known (task.md "Квиз: не
больше 3 попыток"; the server reports it from #68), and the quiz check counted, so the counts are "из 2".
**Sample data** in the quiz states: the answers chosen in each state (page script `QUIZ_ANSWERS`), the lesson
05 question with a directory tree (`#state-quiz-code`, `05-memory-agents-md/quiz.yaml`, "Нужно 6 из 8"), the
check bar after a run on this page view (`#state-quiz-passed-after-run`), the closed `command` check that
lets a quiz close finish the lesson (`#state-quiz-closed-finished`, `#state-quiz-notice-env`), the away
answers (`#state-quiz-answered-away`, `-notice-env`, `-notice-send-error`, `-notice-two-pane`) and the
refusals (`#state-quiz-refused`, `#state-quiz-refused-closed`). A send keeps everything the state it starts
from shows except the button and the lock (`quiz.md` "Sending"), so each attempt has its own sending state:
`#state-quiz-sending` (attempt 1), `-sending-failed` (attempt 2, from `#state-quiz-failed` and
`-answered-away`), `-sending-last` (attempt 3, from `-last-attempt` and `-notice-two-pane`), `-sending-refused`
(from `-refused`) and `-sending-limit-unknown` (from `-limit-unknown`). The other notice texts of `quiz.md`
"Quiz notice (P9)" differ only in the title text and are listed in Copy, not drawn.

**Prototype limitations (prototype only, not app behaviour; the app behaviour is in the ACs named):**
1. "Проверить", "Перезапустить окружение" and "Сбросить" pressed in a quiz state go to the v1 states they
   always went to (`#state-check-running`, `#state-env-starting`, `#state-reset-done`), which have no Квиз
   tab, so the selected Квиз tab falls back to Теория and `?tab=` is rewritten. In the app the tab and
   `?tab=quiz` stay (AC17, AC18; A17). The headless run lists these as "tab drop (v1 target)".
2. Back after a control inside the Квиз panel in `#state-quiz-answered-away`, `-notice-env`,
   `-notice-send-error` and `-notice-two-pane` does not bring the quiz notice back: the focus or press in
   the panel removed it, and proto.js re-renders a notice only on a state change. "Открыть квиз" and "Пройти
   квиз" are separate history entries, so Back after them does show the notice again (`quiz.md`, "Prototype
   and history requirements").
3. Forward after Back shows the state again, and focus follows proto.js's background focus repair
   (`data-focus-fallback`), not the control's `data-focus`.
4. Drawn nowhere, tested in the app only: a mouse-only send in Safari (focus on
   `body` before the press, then the busy button, then the result block or send error, no notice); an away
   answer with a menu or a dialog open (the prototype's native `dialog.showModal()` makes the page inert,
   which no attribute exempts, `quiz.md` "Away"); a second away answer replacing the notice text; the
   transition from `#state-quiz-loading` to the loaded quiz (AC35, AC51, AC50, AC44); a quiz load failure with
   a menu or dialog open (AC44, AC51).
5. `quiz.md` outcomes not drawn, each specified by its AC: the refusal that finds the quiz passed (AC43;
   `#state-quiz-refused-closed` draws the closed one); a refusal or a send that changes the lesson status
   (its lesson line, AC39, AC43); a pass with no lesson line (the lesson status unchanged, AC39); a pass that
   finishes the lesson not passed (S3, AC39, AC40); the close with the limit unknown (AC38); the check bar
   rows of "Check bar after a quiz send" other than empty, P7 and P8 (a run going, summary 4, summary 7 left
   true, the line at 5 or 6 with a refusal: AC40, AC43); a 401 on load (AC54).
6. Other sample progress (design #233 rule L4): the prototype draws one lesson, so these links open a state
   with the same courses and release but other sample progress. From #220: "Академия" and "Главная" open
   `../dashboard/prototype.html#state-courses-two` (app route `/`, focus on arrival: none, page load); the
   course crumb opens `../catalog/prototype.html`, the catalog's default state (route
   `/courses/ai-for-developers`, focus: none); the prerequisite link (F6.3) opens `prototype.html`, this
   lesson's default state (route `/courses/ai-for-developers/lessons/intro-agent-loop`, focus: none). In
   `#state-m0`: "Академия" and "Главная" open `../dashboard/prototype.html#state-first-run-until-220` (route
   `/`, focus: none); the top-bar and crumb "Курс" open `../catalog/prototype.html#state-default-until-220`
   (route `/courses/ai-for-developers`, focus: none).
7. Module crumb of `#state-m0` (design #233 rule L1): `../catalog/prototype.html#introduction` opens the
   catalog's default state, drawn from #220, because proto.js joins no state and anchor; the app opens the
   M0 release's catalog (route `/courses/ai-for-developers#introduction`, focus target on arrival: the
   `#introduction` module section).

Limit known and limit unknown are both drawn (Stepan's decision B0, `ia.md` R7): the states marked "limit
known (from #68)" show "из M" and the last-attempt warning; every other state shows the counter without
"из M", as the app does while the server reports no limit.

Prose is course data, not UI copy: it is rendered from markdown and is not in the Copy table. theory.md's
leading h1 equals the lesson title and is dropped (the page has one h1); any other `#` and its `##` are h2,
its `###` h3 and its `####`-`######` h4. task.md's h1 becomes an h2, its `##` h3 and its `###`-`######` h4.
The h4 is set as `.prose h4` in `design/system/proto.css` (AC20), as in the app's heading map.

**Attempt history (#72, from #35; cost from #37, budget word from #39).** The states named `history-*` and
`checks-weak` draw F19 below the check list; every other state is the v1 (#34) lesson, before #35, so it
has no history section (R6). From #35 the section is under the check list in every state of the Проверки
tab; the prototype draws it only in the #72 states. Their sample data is one learner and one timeline
(design note `plans/72-progress-prototypes-design.md` §5.0), so every element of a state can occur with
every other one and with the dashboard state that links to it: attempts №1-№8 of this lesson (L), its
check `model-routing` (A, real) and the sample checks D `cost-estimate` (in L from E1 to E2), B
`plan-structure`, C `agents-md-structure`, R1 `plan-rubric` and R2 `agents-md-rubric` (from E2; R1 and R2
run from #37), titles of module 00 checks, as `#state-statuses` does; in the #39 sample
`#state-history-cost-budget` R2 is a `hidden-task` check. Grader messages of B, C and the checks of lesson P
are sample data. `#state-checks-weak` draws the three checks of lesson P (`02-agent-loop`): X1
`harness-behaviour` (closed, limit 3), X2 `permissions-policy` (no limit, 3 counted failures), X3
`hook-blocks-generated` (limit 10, 9 counted failures); prototype limit: they are drawn on this page (h1 L,
L's history), as the dashboard Card's "Продолжить" opens this one page for any lesson. Each state names its
moment in the States table; its check rows and check bar are that moment's (§5.0, "L's check rows and the
check bar, by moment"). The two quiz states of the history (from #36, `#state-history-quiz`, `-open`) add
one event after §5.0's last: at 5 ноября, 15:22, while №8 still runs, the learner sends L's quiz
`models-effort-quiz` (the #70 sample: 6 questions, K 5, limit 3) for the first time, with the answers of
`#state-quiz-failed` ("Верно 4 из 6. Нужно 5."); #36 records it as №9, a quiz attempt record (`progress.md`
A72-17). The dashboard reads of §5.0 (the latest at 15:21) come before it, so no dashboard state changes.

The course error (the course cannot be read) is not drawn in this prototype: it is the catalog's
`#state-course-error` inside `main` (States, the row for `../catalog/prototype.html#state-course-error`).

## Flows

| Step | Element (`data-step`) | Shown in |
|------|-----------------------|----------|
| F2.1 | the session Alert inside the `role="alert"` container of "Уведомления" | `#state-session-expired` |
| F2.4 | the left-pane tab list (the restored tab comes from `?tab=`, which each selection rewrites) | every state |
| F3.1 | the user menu button (shows the email) | every state; open in `#state-user-menu` |
| F3.2 | the menu item "Выйти" (link to sign-in, which shows "Вы вышли", F3.3) | `#state-user-menu` |
| F6.2 | the prerequisite Alert above the tabs | `#state-prerequisite` |
| F6.3 | the lesson link inside it | `#state-prerequisite` |
| F7.1 | the lesson header: h1, type Badge, "около N мин", "Чему научитесь" | every state |
| F7.2 | the Теория tab panel | `#state-theory` |
| F7.3 | the "Содержание" nav | `#state-theory` |
| F7.4 | the Задание tab panel | `#state-task` |
| F7.5 | "Копировать" of the code block in "Локальные модели" | `#state-theory` |
| F8.1 | the environment status (icon or spinner, status text, timer) | `#state-env-creating`, `#state-env-starting` |
| F8.2 | the Терминал tab panel | every running state |
| F8.3 | the warning icon of the API key note | `#state-api-key` |
| F8.4 | the status bar ("Действия", the key hint) | every state with "Окружение" |
| F9.1 | the terminal frame | `#state-terminal-focused` |
| F9.2 | the terminal output | running states |
| F9.3 | the split handle | `#state-split-focused`, `#state-split-cycled` |
| F9.4 | the key hint | running states |
| F9.5 | the Терминал tab | every state with "Окружение" |
| F10.1 | the idle Alert inside the `role="status"` container of "Уведомления" | `#state-idle-warning` |
| F10.2 | "Продолжить работу" | `#state-idle-warning` |
| F10.3 | the terminal area while stopped (status text in the status bar) | `#state-stopped` |
| F10.4 | "Запустить снова" | `#state-stopped`, `#state-limits` |
| F11.1 | "Действия" | open in `#state-actions-open` |
| F11.2 | the item "Перезапустить окружение" | `#state-actions-open` |
| F11.3 | the AlertDialog "Сбросить рабочую папку?" | `#state-reset-dialog` |
| F11.4 | "Сбросить" in the dialog | `#state-reset-dialog`; result `#state-reset-done` |
| F13.1 | "Проверить" (enabled) | `#state-theory`; the budget confirmation it opens in `#state-budget-dialog` and `#state-budget-dialog-one` (from #37 / #39); nothing to run in `#state-passed-paid-only` (and `#state-closed`, F14.4) |
| F13.2 | the check bar timer | `#state-check-running` (also `#state-budget-running`, `#state-limit-known-running`, `#state-limit-warning-running`) |
| F13.3 | the check list while running | `#state-check-running` (Проверки tab); also `#state-limit-known-running`, `#state-limit-warning-running`, `#state-mixed-running`, `#state-budget-running`, `#state-budget-running-one` |
| F13.4 | the check bar status (the end texts of `checks.md` "Check bar status line") | `#state-results`, `#state-lesson-passed`, `#state-results-limit-known`, `#state-limit-warning`, `#state-closed`, `#state-mixed`, `#state-passed-last-failed`, `#state-runner-error`, `#state-statuses-agent` |
| F13.5 | the open row: grader message and "Неудачных попыток: 3" | `#state-results` (limit unknown); "Неудачных попыток: 3 из 10" in `#state-results-limit-known` (limit known) |
| F14.1 | the last-attempt warning "Осталась 1 попытка" in the row meta | `#state-limit-warning` |
| F14.2 | "Проверить" pressed on the last attempt (its own variant in the prototype); the run it starts keeps the row's "Осталась 1 попытка" and "Неудачных попыток: 9 из 10" | `#state-limit-warning`; the run `#state-limit-warning-running` |
| F14.3 | the closed row's open panel: closed note, closing message, "Неудачных попыток: 10 из 10" | `#state-closed` |
| F14.4 | the reason "Проверки завершены" of the `aria-disabled` "Проверить" (status "Урок завершён: не пройден. Пройдено: 0 из 1") | `#state-closed`, `#state-closed-limit-unknown`; mixed outcome in `#state-mixed` |
| F15.1 | the quiz header ("Нужно 5 из 6", the attempt line, the last-attempt warning) | `#state-quiz` and every `#state-quiz-*` state with questions; the warning in `#state-quiz-last-attempt`, `-notice-two-pane`, `-refused`, `-sending-last`, `-sending-refused` (from #36) |
| F15.2 | the radio group of question 1 | `#state-quiz`, `#state-quiz-partial` and every state with inputs (from #36) |
| F15.3 | "Отправить ответы" | `#state-quiz`; blocked in `#state-quiz-blocked`; busy in `#state-quiz-sending`, `-sending-failed`, `-sending-last`, `-sending-refused`, `-sending-limit-unknown` (from #36) |
| F15.4 | the failed result block "Верно 4 из 6. Нужно 5." | `#state-quiz-failed`; also `#state-quiz-last-attempt`, `-limit-unknown` (from #36) |
| F15.5 | the passed result block "Квиз пройден" (the review follows it) | `#state-quiz-passed`; closed review in `#state-quiz-closed` (from #36) |
| F15.6 | the quiz check row "Закрыта: не пройдено" | `#state-quiz-row-closed`, `#state-quiz-closed`, `#state-quiz-refused-closed` (from #36) |

| F19.1 | the attempt list (`ul` labelled by the h3 "История попыток") | `#state-history` (also every `history-*` state with attempts, `#state-checks-weak`); with a quiz attempt record "№ 9" in `#state-history-quiz` (from #36) |
| F19.2 | the open panel of "№ 3": A "Пройдено" with its message, the removed check `cost-estimate` with "Этой проверки больше нет в уроке", "Сбой проверки, попытка не засчитана" and "Подробности" | `#state-history-open`; a quiz result ("Не пройдено", "Верно 4 из 6.") in `#state-history-quiz-open` (from #36) |
| F19.3 | the expanded disclosure button of "№ 3" (collapses it, focus stays) | `#state-history-open` |
| F22.1 | the breadcrumb `nav` "Навигация", its first crumb the course name (A218-8) | `#state-theory` (from #220: every state but `#state-m0`) |
| F22.2 | the course crumb `#crumb-course` "ИИ для разработчиков" (opens the catalog, F5.1); the module crumb opens F5.2 | `#state-theory` (from #220: every state but `#state-m0`) |

F13.6 (mentor, D3) is not drawn: no mentor or hint control in any state (R6). Before #36 no quiz control
either; from #36 the quiz controls of F15 are drawn only in `#state-quiz`, the `#state-quiz-*` states and the two quiz
states of the attempt history (`#state-history-quiz`, `#state-history-quiz-open`), and "Разобрать с
ментором" in the closed quiz block is not drawn until #37 (R6, `quiz.md` "Release scope"). The mentor review
in an attempt panel (F19.2, from #37) is D3's block and is not drawn either; hints are not shown in F19.2
until a release stores them (`progress.md` A72-16).

## Status

Status: ready

## Purpose

One route for reading and practising a lesson: theory and task on the left (F7), the environment with its
terminal on the right (F8-F11), the check bar under the left pane (F13 v1, `command` checks) with attempt
limits and closed checks (F14, `checks.md`), and from #36 the quiz in the Квиз tab (F15, `quiz.md`). Three
release states: the M0 lesson (#30 alone), the v1 lesson (#31, #32, #34 shipped, with the ADR-0007 amendment
the #69 design asks for), and from #36 the lesson with its quiz (no "quiz before checks" release, `quiz.md`
P4). Limit known needs #68 reported by the server; checks that spend tokens and the budget confirmation are
drawn for #37 / #39. From #35 the Проверки tab also holds the attempt history of the lesson (F19,
`progress.md`), reached from the tab or from a dashboard "Последние попытки" row by the attempt deep link;
its cost elements come with #37 and the budget word with #39 (`ia.md` R6, "Progress by release (#72)"). `#state-quiz`
and the `#state-quiz-*` states draw #36 without #35 (no history section); `#state-history-quiz` and
`#state-history-quiz-open` draw #36 with #35, where every answered quiz send is a quiz attempt record in the
history (`progress.md` A72-17, `quiz.md` "Requirements for #36" item 11).

## Layout and breakpoints

Decision A8, `lesson-environment.md` "Layout by width". With the course read, `main.lesson-layout`
holds, in DOM order, region "Урок" (left pane), region "Проверка" (check bar), the split handle, region
"Окружение" (right pane).

- **Course cannot be read:** no panes, no switch, no handle and no check bar at any width; `main` holds only
  the course error, in the catalog's column (`../catalog/prototype.html#state-course-error`).

- **1280 (from 1024 px): two panes.** Grid columns: left `var(--split-left)` (presets 50 / 35 / 65 %, min
  25 %, max 75 %, each pane at least `20rem`), handle `0.75rem` with a 24 px hit area, right pane the rest.
  The check bar is the second row under the left pane only. The page is `100vh`; each pane scrolls on its
  own (ScrollArea); the terminal fills the right pane.
- **768, 375 and 320 (below 1024 px): one pane.** "Урок" and "Окружение" share the area; the switch "Урок /
  Окружение" (two tabs, full width) is the first element of the shown pane; the check bar is a full-width
  row under the area at every width. The terminal reflows to the area width; nothing scrolls sideways
  except wide tables and code blocks inside their own wrappers (checked 2026-11-18 headless at 800 px high,
  all 124 states at 320 and 375 px, in Chromium with classic scrollbars and in WebKit with overlay
  scrollbars: the root's `scrollWidth` equals its `clientWidth` in every state. That is the viewport width,
  320 or 375, except in Chromium with classic scrollbars for the 30 states taller than the viewport (the
  Проверки history states, `#state-checks-weak`, `#state-quiz-session-expired`), where the page's vertical
  scrollbar takes 15 px: 305 / 305 and 360 / 360).
- **400 % zoom (1280x800 at 400 % = 320x200 CSS px):** below `30rem` of height the page scrolls as one
  document (`proto.css`), so the check bar is a block after the left pane, not pinned (see Accessibility
  notes, 2.4.11).
- **M0 lesson and a lesson without `workspace`:** region "Урок" alone, full width at every width, no switch,
  no handle (`data-environment="none"`).
- Top bar below 480 px: as in `proto.css` (the email truncates at `6rem`; at 320 px the user menu moves
  to a second row, right-aligned). The page adds no top bar override.
- **Квиз panel (from #36; `quiz.md` "Narrow widths and zoom"):** in "Урок" at every width; in one-pane mode
  (below 1024 px, down to 320 px, and 1280 px at 200 % zoom) at the pane's full width. Options wrap under
  their control (`.choice-text` wraps anywhere, so long inline code never widens the page); only a code
  block (a prompt's, or in the review an explanation's) scrolls sideways, inside itself; every option
  label is at least 24 px high (WCAG 2.5.8).

## Components

| shadcn | Usage |
|--------|-------|
| Button | course error "Повторить" (secondary, sm); the history's "Повторить" (secondary, sm, from #35); "Проверить" (default; `aria-disabled` variants), "К окружению" (outline), the check bar's "Переподключиться" (outline, in the place of "К окружению"), "Открыть результаты" (ghost), status actions (default sm), "Подробности" (ghost sm, in the status bar and in a check row panel), "Действия" (outline sm), "Копировать" (ghost sm), "Сбросить" (destructive), "Запустить" (default, budget confirmation), "Отмена" (outline), "Показать все" (link). From #36: "Отправить ответы" (default; busy variant `aria-busy` plus `aria-disabled`, Spinner, "Отправляем..."), "Пройти квиз" (outline sm, after the counter in the quiz check row panel), "Открыть квиз" (default sm, in the quiz notice), the quiz load error's "Повторить" (secondary sm) |
| Alert | session expired (destructive) and idle warning (default) in "Уведомления"; prerequisite (warning); text load error (destructive, its title an h2, `tabindex="-1"`); course load error (destructive, static, its title is the h1, as on the catalog). From #36: the quiz notice in "Уведомления" (default, info icon, sm "Открыть квиз", the idle warning's composition, no role of its own); the quiz load error (destructive, plain: no role, no `tabindex` on the Alert; its title an h3, `tabindex="-1"`; the quiz load status container beside it); the result block, the error summary (destructive, with `ul.alert-links`) and the send error (destructive) as focusable messages (`role="group" tabindex="-1" aria-labelledby` the title, `aria-describedby` the lines), never `role="alert"`: the app's `Alert` renders `role="alert"` by default (`ui/alert.tsx:36`) and is overridden as sign-in and `notifications.tsx:57-58` do |
| DropdownMenu | user menu; "Действия" with two items, their `aria-disabled` variants with a reason line, and the checkbox item "Режим для экранного диктора". **"Действия" is built modal**, as the user menu is: from `apps/web/components/ui/dropdown-menu.tsx` without `modal={false}` (Radix `DropdownMenu` defaults to `modal = true`: focus trap and `hideOthers`). The quiz "Away" rule rests on it (`quiz.md` "Away"); a non-modal "Действия" needs that table re-read in a DESIGN task |
| RadioGroup, Checkbox (from #36) | the quiz groups: `role="radiogroup"` for `single`, `role="group"` of checkboxes for `multiple`, each named by its question `h3` and described by the prompt, the note and the error (`.choice-group`, `label.choice`); boundaries on `--input`, never `--border` (`design/system/README.md`); the locked look while sending |
| Breadcrumb | from #220: course name / module / lesson (`aria-current="page"`; `ia.md` A218-8, A218-7), a long course name wraps inside the crumb; until #220 (`#state-m0`): "Курс" / module / lesson (replaced by A218-8); not shown when the course cannot be read |
| Tabs | left pane (Теория, Задание, Проверки; Квиз from #36), environment (Терминал), one-pane switch (`.pane-switch`) |
| Badge | lesson type "артефакт" (outline) |
| Collapsible | outcomes, check rows, "Подробности" (status bar F8, runner-error check row F13 and runner-error result in an attempt panel F19.2: the same ghost sm trigger controlling one `pre.error-details`, collapsed by default), attempt rows of "История попыток" (F19.1, from #35) |
| Item | the content of an attempt row (F19.1, from #35): `.item-content` with `.item-title` "№ N", `.item-description` the date and time, `.item-description` the summary (and from #37 the cost), the same content as a dashboard "Последние попытки" row with "№ N" in place of the lesson title |
| Resizable | the split handle |
| ScrollArea | each pane |
| AlertDialog | "Сбросить рабочую папку?" (destructive action "Сбросить"); the budget confirmation "Потратить до $N с вашего ключа API?" (from #37 / #39; default action "Запустить", the checks in `.alert-dialog-list` after the description, both named by `aria-describedby`) |
| Spinner | creating / starting, running check; the busy "Отправляем..." (from #36) |
| Skeleton | the quiz loading state (from #36): the blocks after the panel heading and the quiz load status container, `aria-hidden="true"` (`quiz.md:257-260`, items 3-8) |
| Kbd | the key hint |
| Tooltip | the split handle |
| Separator | menu separators |

Compositions: top bar, "Уведомления", environment status bar, check bar, check row, prose (`.prose`,
`.table-wrap`, `.code-block`, `.toc`), terminal frame. Status icons (`.status-icon`) carry shape plus word;
a closed check is `data-status="closed"` (the lock, drawn by CSS on the empty `aria-hidden` span; the app
uses lucide `Lock`). Check row (`design/system/README.md`, "Check row"): the meta holds the in-row running
time `span.check-row-time` (no role), "лимит M:SS" and the last-attempt warning `[data-tone="warning"]`;
the panel holds the notes, the grader message, "Подробности", the cost and the counter, in that order.
Attempt history (F19, from #35): `section.history` (no accessible name) holds the h3 `#history-heading`
(`tabindex="-1"`; in the error state its text is the `.icon-note` "История попыток недоступна" with the
`info` icon, the dashboard's "Прогресс недоступен" pattern, in the same element), the visually hidden
history status container `div.sr-only[role="status"][aria-live="polite"]#history-status` (explicit
`aria-live`, `ia.md` R2), "Повторить" in the error state, the empty text (`p.text-sm.muted`) in place of the
list, and the list `ul.check-list` labelled by the h3. An attempt row is `li > button.check-row-trigger`
(status icon, then the Item content above) with its `.check-row-panel`, which holds `ul.history-results`:
one `li` per result with the check title (`p.history-result-title`) or the check id in `code` and the note
"Этой проверки больше нет в уроке", the status icon and word (`span.check-row-status` in a `p`), the grader
message (`pre.check-row-message`; for a quiz result, from #36, "Верно C из Q." in a `p.text-sm` in its
place, never `details`, `progress.md` A72-17), "Подробности" and the cost (`p.text-sm.muted`). A plain item
(no check result) is `li.history-plain` with `tabindex="-1"`, the same icon and Item content and no button.
The attempt row, the plain item and the result list are the system composition "Attempt row and attempt
panel" (`design/system/proto.css`). The section is `.stack[data-gap="2"]`, the same heading-to-list gap as
the dashboard parts; only `.history` (`space-4` above the section) is page layout.
No v1 state of this page draws a loading skeleton: the text loads with the route (Open questions); from #36
the quiz loading state does, only when #36 loads the quiz on the client. Quiz compositions (from #36,
`design/system/README.md` "Quiz panel"): `.quiz` (`.quiz-intro` with the panel `h2` (and, in
`#state-quiz-code`, `#quiz-code-heading`), the quiz load status
container `div.sr-only[role="status"][aria-live="polite"]#quiz-load-status` and `.quiz-header`, in that order:
the
container after `#quiz-code-heading`, before `.quiz-header`, explicit `aria-live`, `ia.md` R2), the
question block `.question` (`h3`, `.prose` prompt, `.field-description` note for `multiple`, `.field-error`
message, the group), the verdict `.verdict` inside the `h3`, the review list `ul.review-options` with
`.choice-indicator` and `.review-marks`, the explanation `.explanation` (`h4` "Пояснение", `.prose`), and the
quiz check row (#69's check row with "Ответы не отправлялись" and "Пройти квиз"). The last-attempt warning
in the quiz header is #69's `[data-tone="warning"]` element, the same markup as in the row meta.

## States

Every state is reachable by `#state-<name>`, except the course error, which is drawn on the catalog
prototype (first row). Unless stated, the environment is running and no run has happened ("Проверить"
enabled, status line empty), tab Теория.

| Anchor | What it shows |
|--------|---------------|
| `../catalog/prototype.html#state-course-error` (the course cannot be read; F7 error states) | that composition inside `main`: only the destructive static Alert "Не удалось загрузить курс" (its title is the h1, `tabindex="-1"`) with "Повторить". It differs from the drawn catalog prototype state in three things only: `<title>` "Не удалось загрузить курс" (the catalog app sets the same `<title>`; the static catalog prototype keeps the course title); no `aria-current` on "Курс" or "Главная" (the catalog marks "Курс"); "Повторить" targets as in Interactions and keyboard (the course error retry bullet). "Курс" is left out while the course id is unknown, only when `course.yaml` itself cannot be read (ia.md R6, "Course id unknown"). A catalog state kept until #220; its #220 form with several courses: see #222 |
| `#state-theory` | default v1 lesson; running environment with the key hint. The "Локальные модели" code block (`#code-ollama`, longest line `export ANTHROPIC_BASE_URL=http://localhost:11434`, 48 characters) overflows at 320 and 375 px (`pre` `scrollWidth` / `clientWidth`: Chromium with classic scrollbars 437 / 271 and 437 / 326, WebKit with overlay scrollbars 447 / 286 and 447 / 341) and so is a Tab stop "Блок кода" after its "Копировать"; at 1280 px two-pane it fits (591 / 591 Chromium, 606 / 606 WebKit) and is no stop (README "Scrollable code", AC75) |
| `#state-task` | Задание tab |
| `#state-outcomes-collapsed` / `#state-outcomes-expanded` | three outcomes: first one plus "Показать все" / all three plus "Свернуть". The list collapses only with **more than two** outcomes (`lesson-environment.md` F7.1): one outcome, as in this lesson, or two show in full with no button |
| `#state-text-error` | Теория panel: "Не удалось загрузить текст урока" (its title the h2 `#text-error-title`, `tabindex="-1"`) with "Повторить"; Задание and the environment stay usable |
| `#state-text-error-fails-again` | the same panel as `#state-text-error`; its "Повторить" stands for a second failure: it opens `#state-text-error` with focus on the h2 "Не удалось загрузить текст урока" (`ia.md` R2, page-level retry table) |
| `#state-copy-denied` | the code block button reads "Не скопировано, выделите текст вручную" |
| `#state-no-theory` | no Теория tab; opens on Задание |
| `#state-no-sources` | no "Источники" block |
| `#state-prerequisite` | F6.2 warning Alert above the tabs |
| `#state-session-expired` | F2.1 in "Уведомления" |
| `#state-user-menu` | F3.1 menu open |
| `#state-m0` | M0 lesson: "Урок" only, full width, Теория and Задание, the M0 line; no check bar, no Проверки, no "Окружение"; a release before #220, so the top bar "Академия", "Главная", "Курс" and the crumb "Курс" (until #220; replaced by `ia.md` A218-3 and A218-8) |
| `#state-env-creating` / `#state-env-starting` | "Создаём окружение" / "Запускаем окружение", spinner, timer; "Проверить" `aria-disabled` "Окружение запускается, проверка станет доступна после запуска"; "Действия" items `aria-disabled` "Доступно, когда окружение работает" |
| `#state-env-slow` | starting plus "Запуск идёт дольше обычного" |
| `#state-api-key` | running plus the API key warning note |
| `#state-docker-down` / `#state-image-missing` | error text, "Повторить", "Подробности"; "Проверить" `aria-disabled` "Сначала запустите окружение" plus "К окружению"; switch tab "Окружение" marked "ошибка" |
| `#state-limits` | "Окружение остановлено: превышен лимит памяти. Файлы сохранены." with "Запустить снова", "Подробности"; switch marked "остановлено" |
| `#state-rejected` | "Нет доступа к этому окружению." with "Открыть курс", "Подробности"; switch marked "ошибка" |
| `#state-no-workspace` | lesson without the `workspace` field: no "Окружение", check bar kept |
| `#state-terminal-focused` | focus in the terminal; hint tied by `aria-describedby` |
| `#state-reconnecting` | dashed `warning` frame, cursor hidden, "Соединение с терминалом потеряно. Переподключаемся..." |
| `#state-reconnect-failed` | "Не удалось переподключиться" with "Переподключиться" |
| `#state-shell-exited` | "Сеанс терминала завершён" with "Открыть новый сеанс" |
| `#state-idle-warning` | F10.1 in "Уведомления" |
| `#state-stopped` | F10.3 text with "Запустить снова"; check bar as in the Docker row; switch marked "остановлено" |
| `#state-volume-recreated` | running plus "Рабочая папка не найдена, создано новое окружение из исходных файлов урока." |
| `#state-actions-open` | "Действия" open, items enabled |
| `#state-actions-check-running` | items `aria-disabled` "Дождитесь окончания проверки" (a run is going) |
| `#state-actions-not-running` | items `aria-disabled` "Доступно, когда окружение работает" (starting) |
| `#state-reset-dialog` | AlertDialog, focus on "Отмена" |
| `#state-reset-done` | new session, note "Рабочая папка сброшена" |
| `#state-checks-before` | Проверки: the row "Не запускалась" and "Попыток пока нет. Нажмите "Проверить", когда будете готовы." (before #35 the tab's own empty state; from #35 the same text is the history's first empty form under the h3 "История попыток", `#state-history-empty`) |
| `#state-check-running` | check bar: spinner, "Идёт проверка", timer "0:12", "Проверить" `aria-disabled` "Дождитесь окончания проверки"; tab badge "Проверки, идёт проверка"; the selected tab stays (A17, opened from the States index: Теория); Проверки row "Идёт" "0:12 из 0:30". It is also the attached state (a run found on load, after a refused "Проверить", "Запустить" or "Действия" item, B3, B5-B7): the same UI by design (`checks.md` F13 error states, S8) |
| `#state-results` | "Пройдено: 0 из 1" with "Открыть результаты"; row "Не пройдено" open: "2 из 6 карточек неверны." and "Неудачных попыток: 3" (limit unknown) |
| `#state-statuses` | sample rows, one per check status of `checks.md` (the from-#39 budget variant is in `#state-statuses-agent`): the seven v1 rows, then "Время вышло, попытка не засчитана" with "лимит 0:30", "Сбой проверки, попытка не засчитана" (open: "Подробности" collapsed, then the counter), "Закрыта: не пройдено" (lock, no meta; open: the closed note and the counter); check bar as `#state-check-running` |
| `#state-results-limit-known` | F13.5 limit known (from #68): as `#state-results`, the counter "Неудачных попыток: 3 из 10"; "Проверить" starts `#state-limit-known-running` |
| `#state-limit-known-running` | the run from `#state-results-limit-known` (from #68): check bar as `#state-check-running`; the same row, still open, "Идёт" "0:12 из 0:30", panel "Неудачных попыток: 3 из 10" |
| `#state-limit-warning` | F14.1 limit known: row "Не пройдено" with the meta warning "Осталась 1 попытка" (warning icon, `foreground` words); open: "2 из 6 карточек неверны.", "Неудачных попыток: 9 из 10"; status "Пройдено: 0 из 1. Осталась 1 попытка" with "Открыть результаты"; "Проверить" (F14.2) starts `#state-limit-warning-running` |
| `#state-limit-warning-running` | F14.2, the run on the last attempt (from #68): check bar as `#state-check-running`; the same row, still open, "Идёт" "0:12 из 0:30" and "Осталась 1 попытка", panel "Неудачных попыток: 9 из 10" |
| `#state-closed` | F14.3-F14.4 limit known: row lock icon, "Закрыта: не пройдено", no meta; open: "Проверка закрыта: попытки исчерпаны. Сброс рабочей папки и перезапуск окружения её не откроют.", "2 из 6 карточек неверны.", "Неудачных попыток: 10 из 10". Check bar: "Проверить" `aria-disabled` "Проверки завершены", no "К окружению", "Открыть результаты", status "Урок завершён: не пройден. Пройдено: 0 из 1" rendered with the page (in the markup of the container, not announced) |
| `#state-closed-limit-unknown` | as `#state-closed` on a later visit (index tab Теория), the counter "Неудачных попыток: 10" |
| `#state-mixed` | F14.4 sample data, four checks: (a) "Пройдено", no meta, open: "Проверка уже засчитана. Последний результат: сбой проверки", "Подробности" (collapsed), "Неудачных попыток: 0"; (b) lock, "Закрыта: не пройдено", "Неудачных попыток: 10 из 10"; (c) "Не пройдено", "Осталась 1 попытка", "Неудачных попыток: 9 из 10"; (d) "Время вышло", "лимит 0:30", "Осталась 1 попытка", "Неудачных попыток: 2 из 3" (sample limit). Status "Пройдено: 1 из 4. Закрытых проверок: 1. Проверок на последней попытке: 2. Проверок со сбоем: 1"; "Проверить" enabled, "Открыть результаты" |
| `#state-mixed-running` | the run of `#state-mixed`: (b) stays "Закрыта: не пройдено", no time; (a) and (c) "Идёт" "0:12 из 0:30", (c) also "Осталась 1 попытка"; (d) "В очереди" with "Осталась 1 попытка"; open panels show only the counter. Check bar as `#state-check-running` |
| `#state-passed-last-failed` | S1: row "Пройдено", no meta; open: "Проверка уже засчитана. Последний результат: не пройдено", "2 из 6 карточек неверны.", "Неудачных попыток: 3"; status "Урок пройден" with "Открыть результаты"; "Проверить" enabled |
| `#state-runner-error` | row warning icon "Сбой проверки, попытка не засчитана"; open: "Подробности" (collapsed; the raw error in English), "Неудачных попыток: 3"; status "Сбой проверки, попытка не засчитана" with "Открыть результаты"; "Проверить" enabled; no "Повторить" anywhere |
| `#state-stream-lost` | the result stream dropped (also the cycle "Переподключиться" starts): spinner, "Соединение с проверкой потеряно. Переподключаемся...", timer "0:18", "Проверить" `aria-disabled` "Дождитесь окончания проверки", tab badge, "Действия" items `aria-disabled` "Дождитесь окончания проверки"; row "Идёт" "0:18 из 0:30"; index tab Теория |
| `#state-stream-failed` | reconnecting failed: "Не удалось получить результат проверки"; "Проверить" `aria-disabled` "Результат проверки ещё не получен", then "Переподключиться"; no spinner, timer or badge; "Действия" items enabled; row "Идёт" with its time stopped "0:24 из 0:30"; index tab Теория |
| `#state-budget-lesson` | sample data, from #37 / #39: three rows "Не запускалась" (command, rubric, hidden-task), "Попыток пока нет. Нажмите "Проверить", когда будете готовы."; status empty; "Проверить" enabled, it opens the budget confirmation |
| `#state-budget-dialog` | the budget confirmation over `#state-budget-lesson`: "Потратить до $2.50 с вашего ключа API?", "Эти проверки расходуют токены:", "Качество AGENTS.md (оценка ментора по рубрике): до $0.50", "Агент решает скрытую задачу с вашим AGENTS.md: до $2.00"; "Отмена" (focus), "Запустить" |
| `#state-budget-dialog-one` | the budget confirmation over `#state-statuses-agent`, one check (the passed rubric check is not listed, S11): "Потратить до $2.00 с вашего ключа API?", "Эта проверка расходует токены:", "Агент решает скрытую задачу с вашим AGENTS.md: до $2.00" |
| `#state-budget-running` | the run of `#state-budget-dialog`: command "Идёт" "0:12 из 0:30", rubric "Идёт" with no time (no `timeoutSec`), hidden-task "В очереди"; check bar as `#state-check-running` |
| `#state-budget-running-one` | the run of `#state-budget-dialog-one`: command "Идёт" "0:12 из 0:30" (S1), rubric stays "Пройдено" (not run, S11), hidden-task "В очереди" |
| `#state-statuses-agent` | sample data, from #37 / #39: command "Пройдено"; rubric "Пройдено", open: "Стоимость попытки: $0.04", "Неудачных попыток: 0"; hidden-task "Не пройдено: исчерпан бюджет $2.00", open: "Стоимость попытки: $2.00", "Неудачных попыток: 1"; status "Пройдено: 2 из 3" with "Открыть результаты"; "Проверить" opens `#state-budget-dialog-one` |
| `#state-passed-paid-only` | S12, sample data from #37: one passed rubric check, open: "Стоимость попытки: $0.04", "Неудачных попыток: 0"; "Проверить" `aria-disabled` "Проверки завершены", "Открыть результаты", status "Урок пройден" rendered with the page |
| `#state-lesson-passed` | "Урок пройден" with "Открыть результаты"; row "Пройдено" |
| `#state-after-run-stopped` | in order: "Проверить" `aria-disabled` "Сначала запустите окружение", "К окружению", "Открыть результаты"; status "Пройдено: 0 из 1" |
| `#state-after-run-starting` | environment restarting after a run: "Проверить" `aria-disabled` (starting reason), "Открыть результаты" kept, status "Пройдено: 0 из 1" |
| `#state-no-checks` | no check bar, no Проверки tab; environment kept |
| `#state-one-pane-env` | environment running with a new terminal session (the result of "Открыть новый сеанс"): a fresh prompt, none of the old session's output; below 1024 px the area is switched to "Окружение" |
| `#state-split-focused` | handle focused, tooltip open |
| `#state-split-cycled` | handle after one click: left pane 35 % |

States of the attempt history (#72; F19, from #35 unless marked). Each names its moment of the sample
timeline (Prototype). Tab Проверки in all of them. "Check bar as before a run": "Проверить" enabled, status
line empty. "Check bar of №8's run": as `#state-check-running` (spinner, "Идёт проверка", timer,
"Проверить" `aria-disabled` "Дождитесь окончания проверки", tab name as in `#state-check-running` (#69;
its stray space before the comma is follow-up valmlord/academy#139), "Действия"
items `aria-disabled`). "The seven attempts": "№ 7. 5 ноября, 15:05. Пройдено проверок: 1 из 3. Проверок с
незасчитанной попыткой: 2" (`warning`), "№ 6. 5 ноября, 14:50. Пройдено проверок: 0 из 3. Проверок с
незасчитанной попыткой: 2" (`destructive`), "№ 5. 5 ноября, 14:35. Пройдено проверок: 0 из 3. Проверок с
незасчитанной попыткой: 3" (`warning`), "№ 4. 5 ноября, 14:20. Пройдено проверок: 0 из 3" (`destructive`),
"№ 3. 4 ноября, 14:05. Пройдено проверок: 1 из 2. Проверок с незасчитанной попыткой: 1" (`warning`), "№ 2. 4
ноября, 13:50. Сбой проверки, попытка не засчитана" (`warning`, plain item), "№ 1. 28 октября 2025, 13:30.
Пройдено проверок: 1 из 1" (`success`), each button named as quoted and the plain item's text as quoted (the
". " joins of A72-19; the plain item has that name only while it has focus).

| Anchor | Moment | What it shows | Focus on load |
|--------|--------|---------------|---------------|
| `#state-history-empty` | before №1 | check rows as `#state-checks-before`; h3 "История попыток" and "Попыток пока нет. Нажмите "Проверить", когда будете готовы." in place of the list; "Проверить" starts `#state-history-empty-running` | not moved |
| `#state-history-empty-running` | №1 running | A "Идёт" "0:12 из 0:30", panel "Неудачных попыток: 0"; check bar as `#state-check-running`; h3 and "Попыток пока нет" alone | not moved |
| `#state-history-first` | №1 ended | A "Пройдено" (panel: "Пройдено: не меньше 5 из 6 карточек верны.", "Неудачных попыток: 0"), status "Урок пройден" with "Открыть результаты"; one attempt "№ 1. 28 октября, 13:30. Пройдено проверок: 1 из 1" (`success`; read that day, so no year) | not moved |
| `#state-history-error-after-run` | №1 ended, the re-read failed | rows and bar of `#state-history-first`; the h3 reads "История попыток недоступна" with "Повторить" (-> `#state-history-first`, focus on the h3 "История попыток", the container emptied); the history status container holds "История попыток недоступна", set at least the text gap (150 ms in the prototype) after "Урок пройден" | not moved |
| `#state-history` | 5 ноября after №7, no run | A "Пройдено" (counter 0), B "Время вышло, попытка не засчитана" with "лимит 0:30" (counter 1), C "Сбой проверки, попытка не засчитана" (counter 1, "Подробности"); check bar as before a run; the seven attempts, collapsed; "Проверить" starts `#state-history-deep-link-running` (the screen of №8's run) | not moved |
| `#state-history-open` | as `#state-history` | "№ 3" expanded: A "Пройдено" with its message; then `cost-estimate` in `code`, "Этой проверки больше нет в уроке", "Сбой проверки, попытка не засчитана", "Подробности" collapsed | not moved |
| `#state-history-deep-link` | 4 ноября, 14:10, no run; deep link row 1 from dashboard `#state-attempts-mixed` row 1 | rows A "Пройдено" (counter 0) and D "Сбой проверки, попытка не засчитана" (counter 0, "Подробности"); check bar as before a run; list "№ 3", "№ 2", "№ 1" (as in the seven attempts); "№ 3" expanded: A "Пройдено" with its message, D by its title (still a check of the lesson), "Сбой проверки, попытка не засчитана", "Подробности" | "№ 3" button |
| `#state-history-deep-link-1` | as above; row 1 from `#state-attempts-mixed` row 3 | as above, "№ 1" expanded (A "Пройдено" with its message) | "№ 1" button |
| `#state-history-deep-link-plain` | as above; row 2 from `#state-attempts-mixed` row 2 | as above, nothing expanded | the plain item "№ 2" |
| `#state-history-deep-link-4` .. `-7` | 5 ноября, 15:21, №8 running; row 1 from `#state-attempts` rows 5, 4, 3, 2 | rows of №8's run: A "Идёт" "0:12 из 0:30", B and C "В очереди" (counters 0, 1, 1); check bar of №8's run; the seven attempts (no "№ 8": it is running); "№ 4", "№ 5", "№ 6" or "№ 7" expanded with its three results (Interactions, "Attempt panels") | that button |
| `#state-history-deep-link-running` | as above; row 3 from `#state-attempts` row 1 | as above, nothing expanded | the h3 "История попыток" |
| `#state-history-deep-link-running-empty` | №1 running; row 3 from `#state-attempts-running-first` | as `#state-history-empty-running` | the h3; the text after it is "Попыток пока нет" alone |
| `#state-history-deep-link-error` | 5 ноября after №7, the read failed; row 4 (from the state index, not a kind of dashboard row) | rows and bar of `#state-history`; h3 "История попыток недоступна" and "Повторить"; the history status container empty; "Повторить" here stands for a second failure: -> `#state-history-error`, focus on the error h3 | the error h3 |
| `#state-history-error` | as above, plain load | as `#state-history-deep-link-error`; "Повторить" loads: -> `#state-history`, focus on the h3 "История попыток" | not moved |
| `#state-checks-weak` | arrival from any "Где трудно" row (`?tab=checks`, no `attempt`) | three rows of lesson P (sample, Prototype): X1 "Закрыта: не пройдено" (lock; open: the closed note, its last message, "Неудачных попыток: 3 из 3"), X2 "Не пройдено" (open: message, "Неудачных попыток: 3"), X3 "Не пройдено" with "Осталась 1 попытка" (open: message, "Неудачных попыток: 9 из 10"); check bar as before a run; history as `#state-history`; nothing expanded | not moved |
| `#state-history-cost` (from #37) | as `#state-history` | rows A, B, C, then R1 and R2 "Пройдено" (open: "Стоимость попытки: $0.04", "Неудачных попыток: 0"); the seven attempts, "№ 4" as #37 runs it: "№ 4. 5 ноября, 14:20. Пройдено проверок: 2 из 5. Потрачено: $0.08" (`destructive`); no cost on the others (free checks only); "Проверить" starts `#state-history-cost-deep-link-running` | not moved |
| `#state-history-cost-deep-link-4` (from #37) | as `#state-history-deep-link-4`; from dashboard `#state-cost` row 5 | rows of №8's run plus R1, R2 "Пройдено" (not in the run, S11; "Стоимость попытки: $0.04" each); list of `#state-history-cost`; "№ 4" expanded: A, B, C "Не пройдено", R1 and R2 "Пройдено" each with "Стоимость попытки: $0.04" | "№ 4" button |
| `#state-history-cost-deep-link-5` .. `-7` (from #37) | from `#state-cost` rows 4, 3, 2 | as above, "№ 5", "№ 6" or "№ 7" expanded with its three results, no cost line; "№ 4" collapsed | that button |
| `#state-history-cost-deep-link-running` (from #37) | from `#state-cost` row 1 | as above, nothing expanded | the h3 "История попыток" |
| `#state-history-cost-at-least-deep-link-4` (from #37) | from `#state-cost-at-least` row 5; R2 reported no cost | as `#state-history-cost-deep-link-4`, but "№ 4. 5 ноября, 14:20. Пройдено проверок: 2 из 5. Потрачено: не меньше $0.04" and no cost line in R2's item or check row panel | "№ 4" button |
| `#state-history-cost-no-data-deep-link-4` (from #37) | from `#state-cost-no-data` row 5; no cost reported | as above, "... Потрачено: нет данных", no cost line in R1's or R2's item or panel | "№ 4" button |
| `#state-history-cost-budget` (from #39; sample) | as `#state-history-cost`, R2 a `hidden-task` check | R2's check row "Пройдено" (open: "Стоимость попытки: $1.20", "Неудачных попыток: 1"); "№ 5. 5 ноября, 14:35. Пройдено проверок: 1 из 4. Проверок с незасчитанной попыткой: 3. Потрачено: $1.20" (`warning`); "№ 4. 5 ноября, 14:20. Пройдено проверок: 1 из 5. Потрачено: $2.04" (`destructive`) expanded: A, B, C "Не пройдено", R1 "Пройдено" "Стоимость попытки: $0.04", R2 "Не пройдено: исчерпан бюджет $2.00" "Стоимость попытки: $2.00"; no dashboard state stands next to it | not moved |
| `#state-history-quiz` (from #36) | 5 ноября, 15:22, №8 still running; the learner sent the quiz in Квиз (attempt 1 of 3, "Верно 4 из 6. Нужно 5."), then selected Проверки | rows of №8's run (A "Идёт" "0:12 из 0:30", B and C "В очереди", counters 0, 1, 1), then the quiz check row "Не пройдено", open: "Неудачных попыток: 1 из 3" and "Пройти квиз" (open as in every quiz state); check bar of №8's run (a quiz send sets no text, `quiz.md` P6); the tab list reads Теория, Задание, Проверки, Квиз; the list: "№ 9. 5 ноября, 15:22. Пройдено проверок: 0 из 1" (`destructive`; the quiz attempt record, `progress.md` A72-17, numbered after the running №8, which joins below it by `started_at` when the run ends, A72-9) above the seven attempts, all collapsed; the row has no quiz line ("Попытка 1 из 3" stays in Квиз, A72-17); the Квиз panel, when shown, holds the `#state-quiz-failed` content (header "Попытка 2 из 3", the result block not focused) | not moved |
| `#state-history-quiz-open` (from #36) | as `#state-history-quiz` | "№ 9" expanded: "Квиз: effort, поверхности и локальные модели", "Не пройдено" (`destructive` icon), then "Верно 4 из 6." in place of a grader message; no "Нужно 5.", no answers, no verdicts, no cost line (A72-17) | not moved |

Prototype limit: "Проверить" in the #72 states with no drawn next moment (`#state-history-deep-link`,
`-1`, `-plain`, `#state-history-error`, `#state-history-deep-link-error`, `#state-history-first`,
`#state-history-error-after-run`, `#state-checks-weak`, `#state-history-cost-budget`) opens #69's
`#state-check-running`, which draws the v1 release without the history; the app keeps the section, its
list and its error state through a run (Interactions, "Run end and the history"). In `#state-history-quiz` and
`#state-history-quiz-open` "Отправить ответы" (Квиз tab) opens #70's `#state-quiz-sending-failed` and "Пройти квиз"
shows the Квиз panel of the same state; `#state-quiz-sending-failed` draws #36 without #35 and no run, so the
check bar there is not №8's; the app keeps the run, the history and the quiz record through the send.

**From #36: the quiz states** (`quiz.md` F15; the design note's state list). Unless stated: tab Квиз selected
(the tab list then reads Теория, Задание, Проверки, Квиз), one-pane mode shows "Урок", the environment runs,
the check bar is before any run (status line empty, "Проверить" enabled), Проверки lists the `command` check
"Не запускалась" and the quiz check row, "Уведомления" is empty, and the limit is known (3). Under the rows
Проверки shows "Попыток пока нет. Нажмите "Проверить", когда будете готовы." only in the states whose quiz
row reads "Ответы не отправлялись" (`#state-quiz`, `#state-quiz-loading`, `-partial`, `-blocked`, `-blocked-one`,
`-sending`, `-row`, `-send-error`, `-load-error`, `-load-error-fails-again`, `-session-expired`, `-restored`,
`-code`,
`-notice-send-error`); every other quiz state shows no text there (`quiz.md` "Empty states", AC41). These
states draw #36 without #35. With #35 shipped, Проверки in each of them also holds F19 below the rows: the
empty text of F19 while no record exists (every `command` row "Не запускалась", the quiz row "Ответы не
отправлялись"), and after an answered send its quiz attempt record, which the re-read after the send lists in
the same render as the changed quiz row (`progress.md` A72-17; drawn in `#state-history-quiz`).

| Anchor | What it shows |
|--------|---------------|
| `#state-quiz-loading` | the panel heading (the check `title`) and the quiz load status container (present and empty) stay; the header and everything after it (`quiz.md` "Quiz panel, in DOM order" items 3-8) are six Skeleton blocks (`aria-hidden`); the panel has `aria-busy="true"`; no focus move. Only when #36 loads the quiz on the client |
| `#state-quiz` | F15.1-F15.3 before the first attempt: header "Нужно 5 из 6", "Попытка 1 из 3"; six questions "Вопрос 1 из 6" to "Вопрос 6 из 6", nothing selected; the note "Засчитывается только точный набор ответов" under questions 5 and 6 (`multiple`); "Отправить ответы" last |
| `#state-quiz-partial` | questions 1-3 answered, question 5 with two boxes checked, questions 4 and 6 unanswered |
| `#state-quiz-blocked` | "Отправить ответы" pressed with questions 4 and 6 unanswered: the error summary "Ответьте на все вопросы: осталось 2" above the questions, focused, with the links "Вопрос 4 из 6: выберите ответ" and "Вопрос 6 из 6: выберите хотя бы один вариант"; "Выберите ответ" under question 4, "Выберите хотя бы один вариант" under question 6 |
| `#state-quiz-blocked-one` | after the blocked send, question 4 answered: "Ответьте на все вопросы: осталось 1" with the one link for question 6; the message only under question 6; focus on question 4's checked radio |
| `#state-quiz-sending` | attempt 1, every question answered: "Отправляем..." busy (Spinner, `aria-busy`, `aria-disabled`), focused; every option and every group `aria-disabled="true"`, a click, Space or an arrow key changes nothing; the rest as the state it starts from: header "Попытка 1 из 3", quiz row "Ответы не отправлялись", "Неудачных попыток: 0 из 3", no result block |
| `#state-quiz-sending-failed` | the send of attempt 2 from `#state-quiz-failed` or `-answered-away`: busy and locked as `#state-quiz-sending`; header "Попытка 2 из 3"; the result block "Верно 4 из 6. Нужно 5." of attempt 1 stays, not focused; quiz row "Не пройдено", "Неудачных попыток: 1 из 3" |
| `#state-quiz-sending-last` | the send of attempt 3 from `#state-quiz-last-attempt` or `-notice-two-pane`: busy and locked; header "Попытка 3 из 3" and "Осталась 1 попытка"; the result block "Верно 3 из 6. Нужно 5." stays, not focused; quiz row "Не пройдено" with the meta "Осталась 1 попытка", "Неудачных попыток: 2 из 3" |
| `#state-quiz-sending-refused` | the send from `#state-quiz-refused`: busy and locked; header "Попытка 3 из 3" and "Осталась 1 попытка"; the refusal block stays, not focused; quiz row as `#state-quiz-sending-last` |
| `#state-quiz-sending-limit-unknown` | the send from `#state-quiz-limit-unknown`: busy and locked; header "Попытка 2", no warning; its result block stays, not focused; quiz row "Не пройдено", "Неудачных попыток: 1" |
| `#state-quiz-failed` | F15.4: result block focused, "Верно 4 из 6. Нужно 5." with "Ответы остались выбранными. Какие из них неверны, квиз покажет после прохождения или после последней попытки."; header "Попытка 2 из 3"; the answers kept and editable; quiz row "Не пройдено", "Неудачных попыток: 1 из 3". Also the return visit after a failed attempt (same markup; on a load focus does not move) |
| `#state-quiz-last-attempt` | after the 2nd failure: "Верно 3 из 6. Нужно 5."; header "Попытка 3 из 3" and "Осталась 1 попытка" (warning icon); quiz row "Не пройдено" with the meta "Осталась 1 попытка", "Неудачных попыток: 2 из 3" |
| `#state-quiz-passed` | F15.5 review: result block focused, "Квиз пройден", "Верно 5 из 6.", "Ниже верные ответы и пояснения.", "Урок пройден" (the lesson line: the `command` check had passed, so the pass made the lesson passed); header "Нужно 5 из 6" only; every `h3` with "Верно" or "Неверно" (5 and 1), each option a static row with "Ваш ответ" / "Верный ответ" where they apply, "Пояснение" under each question; no "Отправить ответы"; check bar status line empty, as before the send (P6). Also the return visit after a pass |
| `#state-quiz-closed` | F15.5-F15.6 review after the 3rd failure: result block focused, "Квиз не пройден: попытки исчерпаны", "Верно 4 из 6. Нужно 5.", "Ниже верные ответы и пояснения." (no lesson line: the lesson is not finished); verdicts 4 and 2; quiz row lock "Закрыта: не пройдено", "Неудачных попыток: 3 из 3"; no mentor control (R6). Also the return visit after the close |
| `#state-quiz-row` | entry from Проверки (tab Проверки): quiz row open, muted dotted ring, "Ответы не отправлялись", "Неудачных попыток: 0 из 3", then "Пройти квиз" |
| `#state-quiz-row-closed` | F15.6 in Проверки (tab Проверки): quiz row open, lock, "Закрыта: не пройдено", "Неудачных попыток: 3 из 3", no closed note, no action, no "Попыток пока нет" text under the rows; the Квиз tab holds the review of `#state-quiz-closed` |
| `#state-quiz-send-error` | the send error "Ответы не отправлены. Попробуйте снова." focused, right before "Отправить ответы"; answers kept and unlocked; header "Попытка 1 из 3"; no "Повторить" |
| `#state-quiz-load-error` | under the heading only the plain destructive Alert "Не удалось загрузить квиз" (its title the h3 `#quiz-load-error-title`, `tabindex="-1"`) with "Повторить" (described by the Alert title); no focus move; the quiz load status container holds "Не удалось загрузить квиз" after the `setState` pair from `#state-quiz-loading` (`window.proto.setState("quiz-load-error")`), empty on arrival by URL |
| `#state-quiz-load-error-fails-again` | the same panel as `#state-quiz-load-error`; its "Повторить" stands for a second failure: it opens `#state-quiz-load-error` with focus on the h3 "Не удалось загрузить квиз", the quiz load status container empty. Prototype limit: this button draws the outcome directly and skips `#state-quiz-loading` |
| `#state-quiz-session-expired` | F2.1 "Сессия закончилась. Файлы в рабочей папке сохранены." in "Уведомления" over `#state-quiz-partial`; "Войти снова" `next` carries `?tab=quiz`; no send error |
| `#state-quiz-restored` | after sign-in, arrival with `?tab=quiz`: the answers of `#state-quiz-partial` back, no alert, no message, no focus move |
| `#state-quiz-limit-unknown` | after one failure with no limit reported (R7): header "Попытка 2", no warning; "Ответы остались выбранными. Какие из них неверны, квиз покажет после прохождения."; quiz row "Неудачных попыток: 1" (no "из M") |
| `#state-quiz-code` | sample data, lesson 05 (header "Нужно 6 из 8", "Попытка 1 из 3"), one question "Вопрос 2 из 8" whose prompt holds a directory tree (`/srv/app`): its lines overflow at 320 and 375 px and fit at 1280 px two-pane, in both setups (`pre` `scrollWidth` / `clientWidth`: Chromium with classic scrollbars 403 / 271, 403 / 326, 591 / 591; WebKit with overlay scrollbars 413 / 286, 413 / 341, 606 / 606). Where they overflow the `pre` takes `tabindex="0"`, `role="group"`, `aria-label="Код к вопросу"` and scrolls inside itself; where they fit it has none of them (decided by script on load and resize) |
| `#state-quiz-passed-after-run` | sample data, P7: as `#state-quiz-passed`, after a run on this page view had shown "Пройдено: 1 из 2"; the status line is empty (emptied silently, nothing set), "Открыть результаты" still after "Проверить", "Проверить" enabled |
| `#state-quiz-closed-finished` | sample data, P8 (S3): as `#state-quiz-closed`, on a lesson whose `command` check is closed; the result block's last line "Урок завершён: не пройден. Пройдено: 0 из 2"; status line empty; "Проверить" `aria-disabled` "Проверки завершены"; "Открыть результаты" after it |
| `#state-quiz-answered-away` | sample data, P9: the learner pressed "Отправить ответы", then selected Проверки; the failed result arrived there: tab Проверки, focus on the Проверки tab (unchanged); quiz row "Не пройдено", "Неудачных попыток: 1 из 3"; check bar unchanged; "Уведомления" a region with "Ответы квиза проверены. Верно 4 из 6. Нужно 5." and "Открыть квиз"; the Квиз panel, when shown, holds the `#state-quiz-failed` content, result block not focused |
| `#state-quiz-notice-env` | sample data: one-pane mode with "Окружение" shown (the learner switched there during the send), focus on the switch tab "Окружение" ("Действия" with two panes); the closing failure reached S3: notice "Квиз не пройден: попытки исчерпаны. Урок завершён: не пройден. Пройдено: 0 из 2." with "Открыть квиз"; check bar per P8 (as `#state-quiz-closed-finished`) |
| `#state-quiz-notice-send-error` | sample data: tab Теория (the learner went back to read), focus on the Теория tab; the send failed: notice "Ответы квиза не отправлены. Попробуйте снова." with "Открыть квиз"; the Квиз panel, when shown, holds the send error before the button, answers kept and unlocked |
| `#state-quiz-notice-two-pane` | sample data: two panes, Квиз selected and shown; the learner pressed "Отправить ответы" and clicked into the terminal; the failed result with one attempt left arrived: focus in the terminal (unchanged), the panel shows the `#state-quiz-last-attempt` content with the result block not focused, notice "Ответы квиза проверены. Верно 3 из 6. Нужно 5. Осталась 1 попытка." with "Открыть квиз". Tab, Shift+Tab, `F6` or a press back into the panel empties the notice. In one-pane mode "Окружение" is shown |
| `#state-quiz-refused` | sample data: the send was refused, another browser tab had sent attempt 2: result block focused, "Ответы не приняты: квиз изменился в другой вкладке." then "Последний результат: Верно 3 из 6. Нужно 5."; header "Попытка 3 из 3" and "Осталась 1 попытка"; the learner's unsent selection kept and unlocked; no "Ответы остались выбранными" line |
| `#state-quiz-refused-closed` | sample data: the send of attempt 3 was refused, another browser tab had sent the last attempt and it failed: result block focused, warning icon, title "Ответы не приняты: квиз изменился в другой вкладке.", then "Квиз не пройден: попытки исчерпаны" and "Ниже верные ответы и пояснения." (no score line; no lesson line, because the `command` check has not run and the lesson status did not change); the review of `#state-quiz-closed` (verdicts 4 and 2); header "Нужно 5 из 6" only; quiz row lock "Закрыта: не пройдено", "Неудачных попыток: 3 из 3"; check bar unchanged (refused row, quiz now closed, line empty) |

## Interactions and keyboard

- **`F6` cycle (R3).** `F6` / Shift+`F6` and Ctrl+Shift+. / Ctrl+Shift+, (by `KeyboardEvent.code`
  `Period` / `Comma`), captured before the terminal. Landing per state, verified in the prototype at 1280
  and 375 px by dispatching the keys in every state:

  | State | Верхняя панель | Уведомления | Урок | Проверка | Окружение |
  |-------|----------------|-------------|------|----------|-----------|
  | two panes, running, starting, slow, API key, reconnecting, reset done, after a run | "Академия" | no stop | course crumb | "Проверить" | "Действия" |
  | two panes, every #69 state without a dialog: limit known, last attempt, closed (both), mixed, runs (own, attached, with a closed check, spending tokens), sticky pass, runner error, stream lost, stream failed, tokens before a run and after it, nothing to run; every #72 state (`history-*`, `checks-weak`): the history is inside "Урок" and adds no stop | "Академия" | no stop | course crumb | "Проверить" (enabled, or `aria-disabled` with its reason) | "Действия" |
  | budget confirmation open (either) | the cycle is off: `F6` and Shift+`F6` leave focus where it is in the dialog | | | | |
  | session expired | "Академия" | "Войти снова" | course crumb | "Проверить" | "Действия" |
  | idle warning | "Академия" | "Продолжить работу" | course crumb | "Проверить" | "Действия" |
  | from #36: quiz notice only (`#state-quiz-answered-away`, `-notice-env`, `-notice-send-error`, `-notice-two-pane`); with the session alert or the idle warning beside it, the two rows above | "Академия" | "Открыть квиз" | course crumb | "Проверить" | "Действия" |
  | from #36: every other quiz state | "Академия" | no stop ("Войти снова" in `#state-quiz-session-expired`) | course crumb | "Проверить" (enabled, or `aria-disabled` "Проверки завершены" in `#state-quiz-closed-finished`, `-notice-env`) | "Действия" |
  | Docker not running, image missing | "Академия" | no stop | course crumb | "Проверить" | "Повторить" |
  | stopped, limits, after a run with the environment stopped | "Академия" | no stop | course crumb | "Проверить" | "Запустить снова" |
  | rejected | "Академия" | no stop | course crumb | "Проверить" | "Открыть курс" |
  | reconnect failed / shell exited | "Академия" | no stop | course crumb | "Проверить" | "Переподключиться" / "Открыть новый сеанс" |
  | M0 lesson | "Академия" | no stop | breadcrumb "Курс" (until #220) | no stop | no stop |
  | no `workspace` | "Академия" | no stop | course crumb | "Проверить" | no stop |
  | no check the platform runs | "Академия" | no stop | course crumb | no stop | "Действия" |
  | course cannot be read (from #220 with several courses: see #222) | "Академия" | "Войти снова" with the session alert, else no stop | no stop | no stop | no stop |
  | one-pane mode, any state | "Академия" | as above | switch tab "Урок" (pane shown); the course crumb is the next Tab | "Проверить" | switch tab "Окружение" (pane shown) |

  "Course crumb" in the Урок column is `#crumb-course`, the course name (from #220, `ia.md` "Rules (#218)"
  row "course crumb landing", which replaces R3's "the breadcrumb "Курс""); in one-pane mode `F6` lands on
  the switch tab "Урок" and the course crumb is the next Tab (the same row). Until #220 (`#state-m0`) the
  landing is the breadcrumb "Курс", not the top-bar link. With the course unreadable,
  `main` is the `F6` stop and lands on "Повторить". That row is the catalog's `#state-course-error` cycle,
  checked there, not in this prototype (kept until #220; from #220 with several courses: see #222). The cycle is off while either AlertDialog is open. From the split
  handle (no region) `F6` goes to the next region in DOM order ("Окружение").
- **Tab order (R4):** with the course read: "К содержимому"; top bar; "Уведомления" when non-empty
  ("Войти снова", "Продолжить работу", from #36 "Открыть квиз", in container order); "Урок"
  ([switch] course crumb (until #220 "Курс", `#state-m0`; row "course crumb landing"), module crumb, "Показать все", prerequisite link, the tab list (one stop), the tab panel
  (in Теория and Задание each code block is "Копировать", then its `pre` only while it overflows),
  in Проверки each row button and, inside an open runner-error row, its "Подробности", inside the open quiz
  check row "Пройти квиз"; from #35 then the history: "Повторить" in its error state, else each attempt's
  disclosure button, newest first, and inside an open attempt panel each "Подробности", before the next
  attempt's button; a plain item is skipped; in Квиз the order of "Квиз (from #36)" below);
  "Проверка" ("Проверить", then "К окружению" or "Переподключиться", then "Открыть результаты"; the two in
  the middle never show together, `checks.md` F13 keyboard path); the split handle (two panes); "Окружение"
  ([switch] status action, "Подробности", "Действия", tab "Терминал", terminal). Course cannot be read:
  "К содержимому"; top bar; "Уведомления" when non-empty; "Повторить".
- **Course error "Повторить":** reloads the page (`ia.md` R2, page-level retry table): focus on the lesson
  h1 with `<title>` the lesson title on success; the error h1 with `<title>` "Не удалось загрузить курс" on
  a second failure; the not-found h1 with `<title>` "Страница не найдена" when the course loads but the URL
  is a way into the not-found page (`ia.md` page inventory, not-found Route). A pointer press on "Повторить"
  that did not focus it (Safari) puts focus on it before the retry ends, so a failure always moves focus from
  "Повторить" to the error heading (`ia.md:323-353`).
  The closing focus move happens only while focus is still on "Повторить", on `body` or inside `main`, and its
  target is shown; otherwise focus stays where the learner put it and nothing is announced, because the error
  is unchanged on screen and a load that succeeds is page content (`ia.md:338-353`, retry focus guard). The
  guard covers the lesson h1 and error h1 moves; the not-found move keeps its
  statement (#95).
- **Tabs:** arrow keys, Home, End, automatic activation; the one-pane switch the same. The ring on the first
  mouse click on a tab is accepted (ia.md R4): Radix focuses the trigger on `mousedown`, so the global
  `:focus-visible` ring shows once; tab triggers get no special focus rule.
- **Only these choose the left-pane tab:** the learner selecting a tab, "Открыть результаты" (Проверки),
  and from #36 "Пройти квиз" and "Открыть квиз" (Квиз). Every other control keeps the selected tab and
  `?tab=`: "Проверить", status actions, "Продолжить работу", "Действия" and its items, the reset dialog,
  "Показать все", "Содержание", check rows, the one-pane switch, the split handle (A17), and from #36
  "Отправить ответы", the options, the summary links, the quiz "Повторить". The prototype marks the
  exceptions with `data-select-tab`.
- **Left-pane tab selection writes `?tab=`:** selecting Теория, Задание or Проверки (click, arrow key, Home,
  End, "Открыть результаты"), and from #36 Квиз (also "Пройти квиз", "Открыть квиз"), replaces `?tab=` with
  `theory`, `task`, `checks` or `quiz` through `history.replaceState`: no new history entry, Back leaves the
  lesson as before. A reload reopens that tab; "Войти снова" carries it in `next`. The one-pane switch "Урок /
  Окружение" does not touch the URL.
- **"Содержание":** Enter on a link moves focus to that h2 (`tabindex="-1"`) and scrolls it into view.
- **"Копировать":** copies the block's text; on denial the label changes (see Accessibility notes).
- **Code block:** a `pre` whose lines overflow is a Tab stop right after its "Копировать" (README "Scrollable
  code"); on it Left and Right scroll the code sideways, Tab and Shift+Tab leave it. A block that fits is no
  stop.
- **"Проверить":** starts a run over the checks of `checks.md` "Run composition" (S1, S2, S11); the rows of
  the run continue the rows it started from: the same checks, the same counter and limit form ("из M"),
  open rows stay open, "Осталась 1 попытка" stays under "Идёт" and "В очереди", a closed check keeps its
  word (`#state-limit-known-running`, `#state-limit-warning-running`, `#state-mixed-running`,
  `#state-budget-running`, `#state-budget-running-one`); focus stays
  on the same button, now `aria-disabled` (one element in the app; several in the prototype only because a
  static file swaps markup, each marked `data-check-run`). No tab switch (A17). When the run includes a
  check that spends tokens and is not passed (from #37 / #39), it opens the budget confirmation first, on
  every such run; otherwise it starts the run at once. With nothing to run (`#state-closed`,
  `#state-closed-limit-unknown`, `#state-passed-paid-only`) it is `aria-disabled` "Проверки завершены" on
  every visit and does nothing; "К окружению" is not offered with that reason, even with the environment
  stopped (R1 order).
- **Budget confirmation (F13.1, from #37 / #39):** focus starts on "Отмена"; Tab and Shift+Tab cycle inside
  the dialog; `F6` does nothing while it is open. Esc or "Отмена" close it, nothing runs, focus returns to
  "Проверить" (B24; the dialog's own `data-focus-fallback`, because a dialog opened by a state has no
  opener). "Запустить" closes it and starts the run, focus on the `aria-disabled` "Проверить" (B6). A change
  the learner did not make that alters its list, its sum or the state of "Проверить" closes it, nothing
  runs, focus on "Проверить" (B23). The title's sum equals the sum of the items; a passed token-spending
  check is never listed (S11); the description is "Эта проверка расходует токены:" with one item and "Эти
  проверки расходуют токены:" with two or more.
- **Check bar "Переподключиться" (F13 error states, B16, B17):** shown right after the `aria-disabled`
  "Проверить" ("Результат проверки ещё не получен") once reconnecting failed. Pressing it starts a new
  reconnect cycle: the button goes, focus moves to "Проверить" (now "Дождитесь окончания проверки"), the
  status reads "Соединение с проверкой потеряно. Переподключаемся..." for the whole cycle, with the tab
  badge. The cycle ends with "Идёт проверка", the run's end text, or "Не удалось получить результат
  проверки" again with "Переподключиться" back after "Проверить"; focus stays on "Проверить". A dropped
  stream never turns a row into "Не пройдено".
- **"Подробности" in a check row:** inside the open panel of a runner-error row (or a passed row whose
  latest result was a runner error, sticky-pass note "...: сбой проверки"), a disclosure button, collapsed
  by default, controlling the raw error block; Enter or Space toggles it. The runner error is retried with
  "Проверить" itself: no "Повторить" in the check bar or the rows (S7). The one "Повторить" of the
  Проверки tab, from #35, belongs to the history's error state and re-reads the history only, never runs
  a check.
- **"Открыть результаты":** one-pane: area to "Урок" first; selects Проверки; focus on its h2 "Проверки".
- **"К окружению":** one-pane: area to "Окружение" first; focus on the status action of the state
  ("Повторить", "Запустить снова" or "Открыть курс").
- **Status actions (R2):** "Повторить", "Запустить снова", "Переподключиться", "Открыть новый сеанс" remove
  themselves; focus moves to "Действия" (R3 for the new state). "Открыть курс" navigates.
- **Check row:** a disclosure button; Enter / Space toggles the open panel (notes, message, "Подробности",
  cost, counter, in that order).
- **"Действия":** Enter opens, arrows, Home, End, Esc closes to the trigger; `aria-disabled` items stay
  focusable and do nothing. "Сбросить рабочую папку" opens the dialog; focus on "Отмена"; Tab stays in the
  dialog; Esc or "Отмена" closes with focus on "Действия"; "Сбросить" closes, recreates, focus on "Действия".
- **Split handle (F9.3), two panes only:** a press with less than 4 px of movement cycles 50 -> 35 -> 65 ->
  50 %; a longer press drags; Left / Right 5 %; Home / End 25 % / 75 %; Enter cycles like a click; no
  double-click reset. **After a free drag** the value matches no preset, so the next click or Enter goes to
  the first preset, 50 % (verified: drag to 47 %, click gives 50 %; Right to 55 %, Enter gives 50 %).
- **"Продолжить работу" (every release; `ia.md` R2, "Focus when a focused alert disappears"):** clears the
  warning; focus returns to the element that had it before focus entered "Уведомления". If there was none,
  focus goes to the R3 landing of the shown pane's region: the course crumb with two panes (from #220,
  `ia.md` "Rules (#218)" row "course crumb landing"; until #220 the breadcrumb "Курс"), the switch
  tab "Урок" in one-pane mode with "Урок" shown, the switch tab "Окружение" in one-pane mode with "Окружение"
  shown. The shown pane does not change. If the return target is gone or no longer focusable when the
  warning closes, focus goes where R2 "Focus after a background change" sends it for the place that element
  was in: in the Квиз panel the result block, or the send error after a failed send (from #36: an answer
  replaced the busy button or the options with the review); in an open check row panel that row's own
  button; in "Проверка" "Проверить" (P8 removed "К окружению" or "Переподключиться"); in "Окружение" its R3
  landing for the new state; anywhere else the R3 landing of the shown pane. Never `body`; an
  `aria-disabled` target keeps focus. The prototype always takes the "there was none" branch: the button
  carries `data-keep-pane` (the theory state it goes to keeps the pane the learner had) and focuses the
  switch tab of the shown pane, or the course crumb `#crumb-course` with two panes.
- **Text load "Повторить":** focus moves to the reloaded tab panel (R2); when the text fails again, focus
  moves to the h2 "Не удалось загрузить текст урока" (`#text-error-title`, `tabindex="-1"`, the Alert title),
  on every later failure too; `<title>` unchanged (`ia.md` R2, page-level retry table). A pointer press on
  "Повторить" that did not focus it (Safari) puts focus on it before the retry ends, so a failure always moves
  focus from "Повторить" to the error heading (`ia.md:323-353`).
  The closing focus move happens only while focus is still on "Повторить", on `body` or inside the tab panel,
  and its target is shown; otherwise focus stays where the learner put it and nothing is announced, because
  the error is unchanged on screen and a load that succeeds is page content (`ia.md:338-353`, retry focus
  guard). Two panes, a click into the terminal before the retry ends: focus stays there;
  a retry that ends with its tab panel hidden moves no focus. Prototype: `#state-text-error-fails-again`
  draws the second failure; proto.js draws neither the press focus nor the guard.
- **Status line text (R2, `checks.md` "Live regions").** The line changes, and so is announced, only when
  the page learns of a change in the lesson's run; everything else (rows, running times, reasons, the tab
  name, "К окружению" coming or going) is silent. Rules for the app, each shown in the prototype:
  - **Text gap.** Two consecutive texts, the empty one of an equal-string re-set included, are at least
    `CHECK_STATUS_TEXT_GAP_MS` apart (#34 sets it, 100-150 ms, at least one rendered frame; the prototype
    uses 150, `PROTO_STATUS_TEXT_GAP_MS`). A text due sooner waits for the gap; only the newest waiting text
    is set.
  - **Controls follow the state at once; only the status text waits for the gap** (usability n2): the
    check bar buttons, reasons, rows, spinner, timer and tab name of the new state are there immediately,
    the status text lands up to one gap later.
  - **A waiting text equal to the text already shown is dropped**, nothing is set (a11y n2, usability n1),
    with one exception: the B9 re-set, where a re-read finds a newer finished run whose end text equals the
    one shown; then the line is emptied and the same text set again one gap later, so it is announced.
  - **After a dialog closes** (B6 "Запустить", B23 a background change): the dialog closes and focus moves
    to "Проверить" first; the status text is set at least one gap after the close, never in the same task
    (a11y c3), because the page behind an open modal is inert.
  - **Baseline of a re-read (B9-B11):** the page keeps the id of the latest finished attempt record it has
    read (set on load, replaced by every run whose end it shows); a re-read compares the server's
    `latestFinishedAttempt.attemptId` with it, never with the line. Every tab without a live result stream
    re-reads when it becomes visible (never attached, its run ended, or stuck in "Не удалось получить
    результат проверки"); a tab holding a stream does not.
  - **Rendered with the page:** only in the nothing-to-run states the line has text on load, as part of the
    page markup (not announced); everywhere else it is empty on load.
  - **A quiz send never sets a text in the line (from #36, `quiz.md` P6-P8, B26).** It empties the line
    silently when the send makes its text untrue (P7: a summary 7 whose count or note a pass or close
    changes; "Открыть результаты" stays) or leaves nothing to run (P8, S3: the line empty, "Проверить"
    `aria-disabled` "Проверки завершены", "Открыть результаты" shown, "К окружению" and "Переподключиться"
    removed); otherwise the line and the controls are unchanged. Nothing from the check bar is announced:
    the quiz result block or the quiz notice says the outcome. The re-read baseline is unchanged (no run
    ended). The notes "Осталась 1 попытка", "Проверок на последней попытке: N" and "Проверок со сбоем: N" of a
    later run never count the quiz; "Закрытых проверок: N" counts a closed quiz.
- **Background changes and focus (`checks.md` B1-B26, `ia.md` R2).** A change the learner did not activate
  on the focused control moves focus only when it removes that control or closes the dialog holding it:
  to "Проверить" in the check bar (never removed), to the row's own button inside an open row, to
  "Проверить" when the budget confirmation closes, and from #36 to the quiz result block or send error inside
  the Квиз panel and by the quiz notice's own rule in "Уведомления" (`ia.md` R2 "Focus after a background
  change", items 1-6; the quiz rows in "Квиз (from #36)" below). Focus never falls back to `body`. The prototype stands
  for a change with `window.proto.setState(<state>)`, which treats an equal text of another state as the B9
  re-set; a background change that keeps an equal text silent (B20, B22 after a run) is shown with a typed
  `#state-` hash instead, which repairs focus the same way and sets nothing. The check bar, every check row
  (`li`) and every `.check-row-panel` carry `data-focus-fallback`; a row names its own check
  (`[data-check-row='<check id>']`), so a focused row button stays on that check's row button in the new
  state. Each row, with the prototype pair that shows it:

  | # | Change | Status text | Focus when it removed the focused control | Prototype |
  |---|--------|-------------|-------------------------------------------|-----------|
  | B1 | load, no run | empty | page start | `#state-theory` |
  | B2 | load, nothing to run | summary 6 or 5 in the markup, not announced | page start | `#state-closed`, `#state-passed-paid-only` |
  | B3 | load, a run is going (attach) | "Идёт проверка" when the read returns | page start | `#state-check-running` |
  | B4 | "Проверить" starts the run | "Идёт проверка" | stays on "Проверить" | `#state-results-limit-known` -> "Проверить" |
  | B5 | "Проверить" refused (409), attach | "Идёт проверка" | stays on "Проверить" | as B4 (same UI, S8) |
  | B6 | "Запустить" (or its 409, attach) | "Идёт проверка", one gap after the dialog closed | "Проверить" (`aria-disabled`) | `#state-budget-dialog` -> "Запустить" |
  | B7 | a "Действия" item refused (409), attach | "Идёт проверка" | stays on "Действия" | `#state-actions-check-running` |
  | B8 | visible again, a run is going | "Идёт проверка" | "Проверить"; the row's button in an open row | `#state-results-limit-known`, `#state-stream-failed`, `#state-after-run-stopped`, `#state-runner-error` -> `setState("check-running")` |
  | B9 | visible again, a newer run ended | its end text (an equal one re-set after the gap) | "Проверить"; the row's button | `#state-stream-failed`, `#state-runner-error` -> `setState("results-limit-known")`; `#state-checks-before` -> `setState("results-limit-known")`; equal text `#state-results-limit-known` -> `setState("results")` |
  | B10 | as B9, nothing left to run | summary 6 or 5 | "Проверить" (`aria-disabled` "Проверки завершены"); the row's button | `#state-after-run-stopped`, `#state-runner-error` -> `setState("closed")` |
  | B11 | visible again, same attempt id | nothing set | - | `#state-checks-before` -> `setState("checks-before")` |
  | B12-B14 | stream drops, reconnects, run ended meanwhile | summary 2, then 1 or the end text | the row's button in an open row (B14) | `#state-check-running` -> `setState("stream-lost")` -> `setState("check-running")` |
  | B15 | reconnecting failed | "Не удалось получить результат проверки" | - | `#state-stream-lost` -> `setState("stream-failed")` |
  | B16 | "Переподключиться" pressed | summary 2 for the cycle | "Проверить" | `#state-stream-failed` -> "Переподключиться" |
  | B17 | the manual cycle ends | summary 1, the end text or summary 3, at least one gap after summary 2 | stays on "Проверить" | `#state-stream-lost` -> `setState("stream-failed")` |
  | B18 | a check's result arrives | unchanged | - | rows only |
  | B19 | the run ends | its end text | - ("Открыть результаты" added) | `#state-check-running` -> `setState("results")` |
  | B20 | the environment stops, no run | unchanged (the environment status announces it) | - ("К окружению" added) | `#state-results` -> typed `#state-after-run-stopped` |
  | B21 | the environment stops during a run | the end text with "Проверок со сбоем: N" or summary 4 | - | `#state-check-running` -> `setState("runner-error")` |
  | B22 | the environment starts | unchanged | "Проверить" (from "К окружению") | `#state-stopped` -> `setState("env-starting")`; `#state-after-run-stopped` -> typed `#state-after-run-starting` |
  | B23 | a change while the budget confirmation is open | as that change, one gap after the close | "Проверить" | `#state-budget-dialog`, `#state-budget-dialog-one` -> `setState("check-running")` |
  | B24 | "Отмена" or Esc in the budget confirmation | unchanged | "Проверить" | `#state-budget-dialog` -> "Отмена" |
  | B25 | "Открыть результаты" | unchanged | the Проверки heading | `#state-closed` -> "Открыть результаты" |
  | B26 | a quiz send is answered (from #36) | emptied silently by P7 or P8, otherwise unchanged; nothing set | "Проверить" (from "К окружению" or "Переподключиться", P8); the quiz row's own button (from "Пройти квиз" after a pass or close) | drawn as end states: `#state-quiz-passed-after-run` (P7), `#state-quiz-closed-finished`, `#state-quiz-notice-env` (P8); the transition is tested in the app (AC40) |

- **Квиз (from #36; `quiz.md` F15).** Before #36 none of this exists (R6).
  - **Keyboard path in the panel:** the result block, the error summary and the send error are not Tab
    stops (they take focus only by script, `tabindex="-1"`, ring drawn inset); the summary's links; then per
    question the prompt's code block when it overflows, then the group: a radio group is one stop (focus on
    the checked radio, or the first; Space checks; arrow keys move focus and check, WAI-ARIA APG Radio Group,
    Radix RadioGroup), each checkbox is its own stop (Space toggles); "Отправить ответы" last. Enter on an
    option sends nothing (no implicit submission): only the button sends. In the review the questions hold
    no Tab stop except overflowing code blocks. `F6` and the region order are R3's: the quiz is inside
    "Урок".
  - **"Отправить ответы" with an unanswered question:** nothing is sent; the error summary "Ответьте на все
    вопросы: осталось U" appears above the questions and takes focus; each unanswered question shows "Выберите
    ответ" (`single`) or "Выберите хотя бы один вариант" (`multiple`) and its group's `aria-describedby` gains
    the message. Then, silently (the summary is no live container): answering removes the message and the
    link and lowers U; unchecking the last box of a `multiple` question adds them back in question order and
    raises U; with none left the summary goes and stays gone until the next blocked send; a new blocked send
    renders it afresh and focuses it. A summary link focuses the first option of its question, scrolled into
    view with the question heading, and selects nothing.
  - **"Отправить ответы" with every question answered: the send lock.** The summary and every message go;
    the button becomes busy: `aria-busy="true"`, `aria-disabled="true"`, Spinner, "Отправляем...", and holds
    focus (a key press leaves it there; a pointer press focuses it by script where the browser does not,
    Safari). Every option control and every group gets `aria-disabled="true"`, never
    `disabled`, so the options stay in the Tab order and keep their contrast; the change is cancelled: a
    click, Space and the arrow keys check or toggle nothing (the app's controlled groups ignore value changes
    while sending and cancel the arrow keys before Radix handles them; the prototype cancels the click in
    proto.js's R1 capture and Space and the arrow keys in its keydown capture). No reason is tied to the
    groups: the busy label on the focused button is the reason. Nothing else changes while sending: the
    header (attempt line, warning), the result block of the previous answer, the quiz check row and the
    check bar stay as the state the press was made in showed them (`quiz.md` "Sending" changes only the
    button and the options). When the server answers, the lock and the
    busy state end together, before focus moves. Leaving the panel is not locked (the tab list, the one-pane
    switch, `F6`, "К окружению" stay live).
  - **Focus targets (`quiz.md` "Focus targets"):**

    | Event | Focus moves to |
    |-------|----------------|
    | send blocked | the error summary |
    | a summary link | the first option of that question, not selected, scrolled into view with its heading |
    | answering removes the summary or the link that holds focus | the option just changed |
    | send with every question answered | the busy button (by script after a pointer press the browser did not focus) |
    | result (failed, passed, closed, refused), learner not away | the result block, scrolled into view (nearest edge, no `preventScroll`, WCAG 2.4.7) |
    | send failed, learner not away | the send error, scrolled into view; the next Tab reaches "Отправить ответы" |
    | any answer to a send while the learner is away | none; the notice announces it, unless the answer removes the focused element (next row); a quiz load follows the load rows |
    | a background change removes the focused element or the "Продолжить работу" return target | `ia.md` R2 "Focus after a background change": in the Квиз panel the result block or send error; in an open check row panel that row's button; in "Проверка" "Проверить"; in "Окружение" its R3 landing; in "Уведомления" the idle stop's "Запустить снова" (or the switch tab "Окружение" in one-pane mode with "Урок" shown), the quiz notice by its own rule; else the R3 landing of the shown pane |
    | "Открыть квиз" | the result block, or the send error after a failed send |
    | the notice removed while focus is in it (read at `pointerdown`), by a press on a focusable element of the panel (an option, a summary link, "Отправить ответы", an overflowing code block, or a `tabindex="-1"` heading, result block, send error, summary) | that element, by script ("Отправить ответы": the busy button) |
    | the notice removed while focus is in it, any other trigger (the panel shown without a focus move, a press on text) | the result block or the send error ("Открыть квиз"'s target) |
    | focus enters the shown panel while the notice is shown | where the learner moved it; the notice goes |
    | "Пройти квиз" | the panel heading `h2` |
    | load error "Повторить" pressed | the panel heading `h2`, at once (the loading state replaced the error); the quiz load status container is emptied |
    | load error "Повторить" loads | stays on the panel heading `h2`, or where the learner moved it during the load (retry focus guard); nothing said |
    | load error "Повторить" fails again, the Квиз panel shown and focus still on the panel heading, elsewhere in the panel or on `body` | the h3 "Не удалось загрузить квиз" (`tabindex="-1"`, the Alert title); the quiz load status container stays empty |
    | load error "Повторить" fails again, the Квиз panel shown and focus elsewhere (the Квиз tab, the check bar, the top bar, "Уведомления", "Окружение", the split handle, an open menu or modal dialog) | none: focus stays; the quiz load status container says "Не удалось загрузить квиз" once |
    | the first quiz load fails, the Квиз panel shown (focus on the Квиз tab, on `body`, or on the panel heading after "Пройти квиз") | none: focus stays; the quiz load status container says "Не удалось загрузить квиз" once |
    | a quiz load or its "Повторить" fails, the Квиз panel not shown | none; nothing said |
    | page load, any state | none: the page start |

  - **Away (`quiz.md` "Away", Stepan's P10, P11; the one definition, word for word).** At the moment the
    server answers, the learner is away when: the Квиз panel is not shown, or focus is in the region
    "Окружение" (R3), in a menu or dialog opened from it, on the split handle, in the region "Уведомления", or
    in an open menu or modal dialog anywhere on the page. Everything else is "not away". Per place:

    | Place of focus | Квиз panel shown | Квиз panel not shown |
    |----------------|------------------|----------------------|
    | skip link, "Верхняя панель" with no menu open | not away | away |
    | the open user menu and "Выйти" | away (modal menu) | away |
    | "Уведомления" ("Войти снова", "Продолжить работу") | away | away |
    | "Урок" with Квиз selected (switch tab "Урок", breadcrumbs, lesson header, prerequisite links, the tab list, the panel) | not away | cannot occur |
    | "Урок" with Теория, Задание or Проверки selected | cannot occur | away |
    | "Проверка" ("Проверить", "К окружению", "Открыть результаты", "Переподключиться") | not away | away |
    | the budget confirmation (from #37 / #39) | away (modal dialog) | away |
    | the split handle | away | away |
    | "Окружение", two panes: status action, "Подробности", "Действия", the Терминал / Редактор tab list, terminal, editor | away | away |
    | the "Действия" menu and its items, the reset dialog "Сбросить рабочую папку?" | away | away |
    | "Окружение" shown in one-pane mode | cannot occur | away |
    | `body` (a Safari mouse learner, a click on page background) | not away | away |

    An answer while away is applied in full (the quiz state takes the outcome, the quiz check row is
    re-read silently, the check bar follows P6-P8, the lock and busy state end); focus does not move, except
    when the answer removes the focused element ("К окружению" or "Переподключиться" in S3 to "Проверить";
    "Пройти квиз" after a pass or close to the quiz row's own button). The next showing of the panel (the Квиз
    tab, the switch back to "Урок", `?tab=quiz`, "Пройти квиз") shows the outcome as a return visit does and
    moves no focus beyond what that control does. A quiz load or its "Повторить" is not decided by away: it
    moves no focus while the learner is away; a failure with the Квиз panel shown is announced by the quiz
    load status container, one with the panel not shown by nothing. An outcome found on a later page load
    gets no notice.
  - **Quiz notice (P9).** Set once when the server answers a send (result, send error, or refusal) while the
    learner is away; never when not away, for a 401 (the F2.1 alert instead) or for a load. It is inserted
    into the third container of "Уведомления" (`role="status" aria-live="polite"`, after the F2.1 and F10.1
    containers, present and empty from load on a lesson with a quiz check): an Alert, default variant,
    leading info icon, the title is the notice text, "Открыть квиз" in its actions, **no role of its own**
    (the app passes `role={undefined}` to `Alert`). While it is shown the wrapper is a `region` landmark. Its
    text, by outcome (exact; no other text exists):

    | # | Outcome while away | Notice text |
    |---|--------------------|-------------|
    | 1 | failed, quiz open, more than one attempt left or limit unknown | Ответы квиза проверены. Верно C из Q. Нужно K. |
    | 2 | failed, quiz open, exactly one attempt left (limit known) | Ответы квиза проверены. Верно C из Q. Нужно K. Осталась 1 попытка. |
    | 3 | passed, lesson status unchanged | Квиз пройден. |
    | 4 | passed, the lesson becomes passed | Квиз пройден. Урок пройден. |
    | 5 | passed, the lesson becomes finished and not passed (S3) | Квиз пройден. Урок завершён: не пройден. Пройдено: N из M. |
    | 6 | failed, closing the quiz, lesson status unchanged | Квиз не пройден: попытки исчерпаны. |
    | 7 | failed, closing the quiz, the lesson becomes finished and not passed (S3) | Квиз не пройден: попытки исчерпаны. Урок завершён: не пройден. Пройдено: N из M. |
    | 8 | send failed (network, server, timeout) | Ответы квиза не отправлены. Попробуйте снова. |
    | 9 | refused, the quiz changed elsewhere and is still open | Ответы квиза не приняты: квиз изменился в другой вкладке. |
    | 10 | refused, the quiz is now passed | the text of row 3, 4 or 5, by the lesson status the page now reads (row 3 when unchanged since the page last read it) |
    | 11 | refused, the quiz is now closed | the text of row 6 or 7, by the same rule (row 6 when unchanged) |

    Drawn: row 1 (`#state-quiz-answered-away`), row 2 (`-notice-two-pane`), row 7 (`-notice-env`), row 8
    (`-notice-send-error`); the others differ only in the title text. **Removal**, silent (the container is
    emptied), by the first of: the Квиз panel becomes shown (the Квиз tab, the switch back to "Урок" with Квиз
    selected, `?tab=quiz`, "Пройти квиз", "Открыть квиз", a widening to two panes); focus or a pointer press
    moves into the shown panel (Tab, Shift+Tab, `F6`, a press on a control, a `tabindex="-1"` target or
    text); "Отправить ответы" starts a send; the learner leaves the page. Focus moving from "Окружение" to the
    check bar or the top bar keeps it. No close button. A second away answer while a notice is shown replaces
    only the title text in the same container, never a second notice; an equal text is emptied and set again
    at least one rendered frame later; focus on "Открыть квиз" stays. **"Открыть квиз"** shows "Урок" in
    one-pane mode, selects Квиз, sets `?tab=quiz`, removes the notice and focuses the result block or the
    send error. `F6` to "Уведомления" lands on "Войти снова", else "Продолжить работу", else "Открыть квиз".
  - **Quiz check row in Проверки:** status words "Ответы не отправлялись" (muted, dotted ring), "Не
    пройдено" (cross), "Пройдено" (check mark), "Закрыта: не пройдено" (lock); never "Не запускалась", "В
    очереди", "Идёт" or the timeout and error words (a quiz is never in a run). Meta: only "Осталась 1
    попытка" with the warning icon, with a known limit and exactly one attempt left. Open panel: the counter
    ("Неудачных попыток: N" or "Неудачных попыток: N из M"), then "Пройти квиз" while an attempt can be made;
    no closed note; no action after a pass or close; no kind word. "Пройти квиз" selects Квиз, sets
    `?tab=quiz` and focuses the panel heading; if a pass or close removes it while focused, focus moves to the
    quiz row's own button.
  - **Load error "Повторить":** removes itself; the loading state replaces the error and focus moves to the
    panel heading at once and stays there when the quiz loads; a second failure moves focus to the h3 "Не
    удалось загрузить квиз" while focus is still on the panel heading, in the panel or on `body`.
    The closing focus move happens only while focus is still on "Повторить", on `body` or inside the Квиз tab
    panel, and its target is shown; otherwise focus stays, and a failure with the Квиз panel shown is
    announced by the quiz load status container. A first load that fails with the panel shown moves no focus
    and the container says it, no
    sooner than `QUIZ_LOAD_STATUS_MIN_AGE_MS` after the panel was shown; with the panel not shown nothing is
    said. "Повторить" keeps its description: it reads "Повторить, Не удалось загрузить квиз"
    (`aria-describedby` the Alert title). "Inside the block" for the quiz includes the Квиз tab panel element
    `#panel-quiz` itself, not only its descendants: it has `tabindex="0"` (Radix `TabsContent` likewise), so
    a Chrome click on the panel background focuses it; the guard and its tests use an inclusive
    `panel.contains(document.activeElement)`.
  - **Session expired while answering (F2):** a 401 on send or load shows the F2.1 alert, never the send
    error. Selected answers are kept in `sessionStorage` under the lesson id, the check id and the attempt
    number on every change, so the return through sign-in to `?tab=quiz` restores them with no message; they
    are dropped when the server's attempt number differs or the quiz is passed or closed, and cleared after
    a successful send. Leaving the Квиз tab and coming back keeps unsent answers.
  - **Refused send (the quiz changed in another browser tab):** counts nothing; the page shows the quiz as
    the server has it, focus on the result block (unless away: notice rows 9-11), titled "Ответы не приняты:
    квиз изменился в другой вкладке."; quiz open: "Последний результат: Верно C из Q. Нужно K.", the new
    attempt line, the unsent selection kept, no "Ответы остались выбранными" line; quiz now passed or closed:
    the review with "Квиз пройден" or "Квиз не пройден: попытки исчерпаны", the lesson line by the rule of
    AC39, and "Ниже верные ответы и пояснения.". The check bar follows P7 or P8 by that current state; with
    the line already at summary 5 or 6 it is unchanged and no lesson line is said anywhere.
- **Back in the prototype (prototype only, the app pushes no history entry per action):** Back after a
  simulated action returns to the previous state with the same tab and `?tab=`, and focuses the control
  that was activated while it is rendered, else the background fallback above. Into a state whose dialog
  opens with the state (`#state-reset-dialog`, `#state-budget-dialog`, `#state-budget-dialog-one`) focus
  starts on "Отмена" as on every opening (F11.3, F13.1), never on the button activated from that entry.
  From #36: Back after "Пройти квиз" and after "Открыть квиз" returns to the previous state as it was: the
  same tab and shown pane, the same panel content, the quiz notice shown again where that state showed it,
  focus on the activated control (a re-rendered "Открыть квиз" is found again by its `id`). A reload of any
  quiz state shows that state with its tab. Limits of this simulation: Prototype, "Prototype limitations".
  In the app Back after either control leaves the lesson page, as from any tab, and a notice removed by
  "Открыть квиз" is not restored (`quiz.md`, "Prototype and history requirements").
- **Attempt history (F19, from #35; `progress.md` F19, A72-5 to A72-19).**
  - **List (F19.1):** every finished attempt record of this lesson and user (runs and, from #36, quiz
    attempt records, `progress.md` A72-17), newest first by `started_at`, no paging; a running attempt is not
    listed (it is in the check rows). Each row is a disclosure button
    whose accessible name is its visible text in DOM order with the fields joined by ". " (A72-19): "№ N"
    (oldest = 1, every attempt numbered, runner errors and quiz attempt records included), the date and time (`<time datetime>`
    with the ISO value, the learner's local time, "4 ноября, 14:05", the year only when it is not the
    current one: "28 октября 2025, 13:30"), the summary (set "attempt summary", first match: "Сбой
    проверки, попытка не засчитана" for no result or only runner errors, else "Пройдено проверок: N из M"
    with the note "Проверок с незасчитанной попыткой: N" when at least one result's word contains
    "попытка не засчитана"), and from #37 the cost ("Потрачено: $N", "Потрачено: не меньше $N",
    "Потрачено: нет данных") only on an attempt that holds anything that spends. The ". " is a visually
    hidden `.sr-only-inline` span where the layout shows no punctuation; after a field ending in ".", "!", "?",
    "…" or ":" only " ". The icon (`aria-hidden`) repeats the words (A72-8): "Сбой проверки, ..." `warning`;
    every result passed `success`; some result neither passed nor "... попытка не засчитана" `destructive`;
    every result that did not pass says "попытка не засчитана" `warning`.
  - **Plain item (A72-14):** an attempt with no check result is an `li` with `tabindex="-1"`, not a button
    and not in the Tab order, with the same fields, joins and order and the summary "Сбой проверки, попытка
    не засчитана" (`warning`); a screen reader reads its text when a deep link focuses it.
  - **Attempt panels (F19.2):** Enter or Space on the button expands and collapses it; focus stays on the
    button (F19.3). The panel lists that attempt's results, one per result, in `lesson.yaml` order, then
    the results of checks no longer in the lesson (A72-15); each: the check title, or the check id in
    `code` with "Этой проверки больше нет в уроке"; the status icon and the result's own word (set "check
    status", result words only: never the check row's sticky "Пройдено", so a failure after the check's
    first pass reads "Не пройдено", as A in "№ 6"); the grader message verbatim, when the result has one;
    "Подробности" (collapsed) with the raw error, for a runner error; from #37 / #39 "Стоимость попытки:
    $N" when the result spends. A quiz result (from #36, A72-17): the quiz check's title, "Пройдено" or "Не
    пройдено" (never "Закрыта: не пройдено"), and in place of the grader message "Верно C из Q." with C and Q
    of that send as #36 stored them; never `details` (the sent answers), verdicts or "Нужно K."; no cost
    line and no "Подробности"; the row has no quiz line ("Попытка A" stays in the Квиз header). Samples: "№ 7" A "Пройдено", B "Время вышло, попытка не засчитана", C "Сбой
    проверки, попытка не засчитана"; "№ 6" A "Не пройдено", B "Ошибка формата, попытка не засчитана", C
    "Время вышло, попытка не засчитана"; "№ 5" A and B "Ошибка формата, попытка не засчитана", C "Сбой
    проверки, попытка не засчитана"; "№ 4" A, B, C "Не пройдено" (from #37 also R1, R2 "Пройдено" with
    their cost); "№ 9" (from #36) the quiz "Не пройдено", "Верно 4 из 6.". The panel's list has no name of
    its own; no mentor review or hint is drawn (D3, A72-16).
  - **Empty forms:** "Попыток пока нет. Нажмите "Проверить", когда будете готовы." in place of the list
    while no finished attempt and no run is known; "Попыток пока нет" alone from the moment the first run
    makes "Проверить" `aria-disabled` ("Дождитесь окончания проверки", "Результат проверки ещё не
    получен") until the history re-read after that run returns. While "Проверить" is `aria-disabled` for
    an environment reason, and after a start the service refuses, the first form stays. Neither change is
    announced and neither moves focus. On a lesson whose check bar shows "Пройти квиз" in place of
    "Проверить" (quiz only, from #36; none exists, not drawn) the first form is "Попыток пока нет" alone,
    because the long text names a button that is not there (A72-17).
  - **Error state and "Повторить" (R2, row "lesson attempt history"):** the history cannot be read while
    the check state was: the h3 reads "История попыток недоступна" (the same element, `tabindex="-1"`) and
    "Повторить" follows it; the check rows, the check bar and runs are unaffected. "Повторить" re-reads the
    history only: loads, focus on the h3 "История попыток"; fails again, focus on the h3 "История попыток
    недоступна". It never applies `attempt` again. In the error state a run's end does not re-read the
    history. A pointer press on "Повторить" that did not focus it (Safari) puts focus on it before the retry
    ends, so a failure always moves focus from "Повторить" to the error heading (`ia.md:323-353`). The closing
    focus move happens only while focus is still on "Повторить", on `body` or inside the history section, and
    its target is shown; otherwise focus stays where the learner put it and nothing is announced, because the
    error is unchanged on screen and a load that succeeds is page content (`ia.md:338-353`, retry focus
    guard).
  - **Run end and the history (F19 loading, A72-9):** when the page learns that a run ended (#69 replaces
    its baseline: B19, B14, B17, B9, B10; not B11) the history is re-read in the background, outside the
    error state: a loaded re-read inserts the new attempt at the top silently, every shown row keeps its
    expanded state and focus stays; a failed re-read keeps the list as it was, unannounced; when the
    history was empty (the first run) a failed re-read shows the error state in the same h3 element (focus
    on it stays) and writes the history status container once (Accessibility notes). A run that ends while
    a "Повторить" request is pending: that request, when it loads, is followed by one more background
    re-read; when it fails, the error state stays. From #36 the check-state re-read after an answered or
    refused quiz send, and every visibility re-read, carry the history in the same server read (`quiz.md`
    "Requirements for #36" item 11): a quiz attempt record appears at the top silently, in the same render
    as the changed quiz check row, by the same rules as a run's row; a quiz send never ends a run and never
    makes a re-read B8, B9 or B10. The check state cannot be read: no history section at
    all, `attempt` has no effect (`ia.md` FU13 Q1 for #69).
  - Prototype pairs (`window.proto.setState`, a change the learner did not make): `#state-history-empty-running`
    -> `setState("history-first")` (re-read loads, nothing announced by the history);
    `#state-history-empty-running` or `#state-history-deep-link-running-empty` (focus on the h3) ->
    `setState("history-error-after-run")` (re-read fails: the h3 text changes, focus stays, the container
    gets its text one gap after "Урок пройден"; once per page view).
- **Attempt deep link (`ia.md` Navigation model, rows 1-10; the order 10, 9, 8, 7, 6, 4 wins, then the
  disjoint 1, 2, 3, 5).** In one-pane mode the area shows "Урок" on load in rows 1-6.

  | # | `attempt` names, and the page's state | Shown | Focus on load | Prototype |
  |---|----------------------------------------|-------|---------------|-----------|
  | 1 | a finished attempt with a check result; history read | its disclosure expanded, scrolled into view | its button | `#state-history-deep-link`, `-1`, `-4` .. `-7`; from #37 `#state-history-cost-deep-link-4` .. `-7`, `-at-least-deep-link-4`, `-no-data-deep-link-4` |
  | 2 | a finished attempt with no check result | its plain item scrolled into view | the plain item (`tabindex="-1"`) | `#state-history-deep-link-plain` |
  | 3 | an attempt still running; history with earlier attempts or empty | nothing expanded; the run in the check rows and bar; an empty history reads "Попыток пока нет" alone | the h3 "История попыток" | `#state-history-deep-link-running`, `-running-empty`; from #37 `#state-history-cost-deep-link-running` |
  | 4 | any value; the history cannot be read | h3 "История попыток недоступна", "Повторить" | the error h3 | `#state-history-deep-link-error` |
  | 5 | an id the dashboard does not emit for this lesson (malformed, unknown, another user's, another lesson's); history read | nothing expanded | not moved | `#state-history` loaded with any `attempt` |
  | 6 | any value; the check state cannot be read | no history section; the tab's state is #69's (FU13 Q1) | not moved until #69 answers Q1 | not drawn |
  | 7 | any value; the Проверки tab is not shown (before #35, or no check the platform runs) | the `tab` fallback: Теория, or Задание | not moved | `#state-no-checks`, `#state-m0` |
  | 8 | any value; the lesson is not `ready` | the not-found page | not moved | `../not-found/prototype.html` |
  | 9 | any value; the course cannot be read | the lesson course error (F7) | its rules | `../catalog/prototype.html#state-course-error` |
  | 10 | any value; the session expired | F2; `next` keeps `tab` and `attempt` | after sign-in, rows 1-9 | `#state-session-expired` |

  The focus move happens once, on load; a background re-read never moves focus. Arriving from a "Где
  трудно" row (`?tab=checks`, no `attempt`) selects Проверки and moves no focus (`#state-checks-weak`).
- **Cross-page destinations (design "Controls and their v1 destinations"):**

  | Control | App destination | Prototype link |
  |---------|-----------------|----------------|
  | "Войти снова" (F2.1) | `/sign-in?next=<current path with the current ?tab=, URL-encoded>` | `../sign-in/prototype.html?next=<encoded app path with the current ?tab=>#state-with-next`, rewritten on every tab selection |
  | "Выйти" (F3.2) | sign out, then `/sign-in`, which shows "Вы вышли" (F3.3) | `../sign-in/prototype.html#state-signed-out` |
  | course crumb `#crumb-course` (from #220, F22.2), "Открыть курс" (environment rejected) | `/courses/[courseId]`, the URL's course (`ia.md` "Rules (#218)" row "course of each control"); neither is rendered while the course cannot be read | `../catalog/prototype.html` (course crumb: Prototype limitations item 6) |
  | until #220 (`#state-m0`): breadcrumb "Курс", top bar "Курс" | `/courses/[courseId]`; top bar "Курс" not while the course id is unknown (ia.md R6, "Course id unknown"); replaced from #220 by the course crumb (A218-8) and no top-bar "Курс" (A218-3) | `../catalog/prototype.html#state-default-until-220` (item 6) |
  | breadcrumb module | `/courses/[courseId]#<moduleId>` (`ia.md`, A6; module 00 is `introduction`) | `../catalog/prototype.html#introduction` (`#state-m0`: item 7) |
  | "Академия", "Главная" | `/` | from #220 `../dashboard/prototype.html#state-courses-two`; `#state-m0` `../dashboard/prototype.html#state-first-run-until-220` (item 6) |
  | prerequisite lesson link (F6.3) | `/courses/[courseId]/lessons/[lessonId]` of that lesson | `prototype.html` (item 6) |
  | source links | the source URL, same tab | the source URL |

## Copy

| Key | Russian text |
|-----|--------------|
| skip link | К содержимому |
| brand | Академия |
| nav | Главная |
| nav | Курс: until #220 only (`#state-m0`; not while the course id is unknown, ia.md R6 "Course id unknown"); from #220 no "Курс" (A218-3) |
| user menu item | Выйти |
| notifications heading (hidden) | Уведомления |
| session alert | Сессия закончилась. Файлы в рабочей папке сохранены. |
| session action | Войти снова |
| idle alert (N from `ENVIRONMENT_IDLE_WARNING_MINUTES`, 5 in the prototype) | Окружение остановится через N мин без активности. Файлы сохранятся. |
| idle action | Продолжить работу |
| region headings (hidden) | Урок / Проверка / Окружение |
| one-pane switch label | Область |
| one-pane switch tabs | Урок / Окружение |
| switch suffix (hidden) | остановлено / ошибка |
| breadcrumb label | Навигация |
| breadcrumb | from #220: <course name> / <module title> / <lesson title>, the course name `course.yaml` `title` (A218-8, A218-7; sample "ИИ для разработчиков"); until #220 (`#state-m0`): Курс / <module title> / <lesson title> (not shown when the course cannot be read) |
| lesson type | артефакт (one of "теория", "квиз", "артефакт", "оценка агента", "поиск багов", "проект") |
| duration | около N мин |
| outcomes heading | Чему научитесь |
| outcomes toggle | Показать все / Свернуть |
| M0 line | Окружение и проверки появятся в следующей версии платформы |
| prerequisite alert | Сначала пройдите: <lesson title> |
| left tab list label (the gallery uses the same name) | Разделы урока |
| left tabs | Теория / Задание / Проверки; Квиз (from #36, no state suffix) |
| running tab name (hidden part) | , идёт проверка |
| table of contents | Содержание |
| copy | Копировать |
| copy denied | Не скопировано, выделите текст вручную |
| code block name: Теория, Задание and quiz explanation, only when it overflows (#136) | Блок кода |
| sources heading | Источники |
| source date | проверено <date> |
| course error | Не удалось загрузить курс |
| text load error | Не удалось загрузить текст урока |
| retry | Повторить |
| checks heading | Проверки |
| check statuses | Не запускалась / В очереди / Идёт / Пройдено / Не пройдено / Время вышло / Ошибка формата, попытка не засчитана / Сбой проверки, попытка не засчитана / Закрыта: не пройдено; variants: Время вышло, попытка не засчитана / Не пройдено: исчерпан бюджет $N (from #39) |
| row meta | M:SS из M:SS (running time) / лимит M:SS / Осталась 1 попытка (limit known, from #68) |
| row notes (open panel, in this order) | Проверка закрыта: попытки исчерпаны. Сброс рабочей папки и перезапуск окружения её не откроют. / Проверка уже засчитана. Последний результат: не пройдено / Проверка уже засчитана. Последний результат: сбой проверки / Стоимость попытки: $N (from #37 / #39) / Неудачных попыток: N / Неудачных попыток: N из M (from #68) |
| row raw error | Подробности |
| checks empty (before #35 the tab's own empty state; from #35 the history's first empty form) | Попыток пока нет. Нажмите "Проверить", когда будете готовы. |
| history heading (from #35; also the name of its list) | История попыток |
| history error heading (from #35) | История попыток недоступна |
| history status container (hidden, from #35; one case only) | История попыток недоступна |
| history retry (from #35) | Повторить |
| history empty while the first run disables "Проверить" (from #35) | Попыток пока нет |
| attempt number (from #35) | № N |
| attempt date and time (from #35; data, format fixed) | D месяца, ЧЧ:ММ ("4 ноября, 14:05") / D месяца ГГГГ, ЧЧ:ММ when not the current year ("28 октября 2025, 13:30") |
| attempt summary (from #35, first match) | Сбой проверки, попытка не засчитана / Пройдено проверок: N из M; note after "Пройдено проверок: N из M" only, joined with ". ": Проверок с незасчитанной попыткой: N |
| attempt cost (from #37, joined with ". ") | Потрачено: $N / Потрачено: не меньше $N / Потрачено: нет данных |
| field joint (hidden where no visible punctuation) | ". " |
| removed check (from #35) | Этой проверки больше нет в уроке |
| quiz result in an attempt panel (from #36, in place of a grader message) | Верно C из Q. |
| result words in an attempt panel (from #35; the budget variant from #39) | Пройдено / Не пройдено / Время вышло / Время вышло, попытка не засчитана / Ошибка формата, попытка не засчитана / Сбой проверки, попытка не засчитана / Не пройдено: исчерпан бюджет $N |
| check bar | Проверить / К окружению / Переподключиться / Открыть результаты |
| check bar status (summaries) | Идёт проверка / Соединение с проверкой потеряно. Переподключаемся... / Не удалось получить результат проверки / Сбой проверки, попытка не засчитана / Урок пройден / Урок завершён: не пройден. Пройдено: N из M / Пройдено: N из M |
| check bar status (notes after "Пройдено: N из M" only, joined with ". ") | Закрытых проверок: N / Осталась 1 попытка / Проверок на последней попытке: N / Проверок со сбоем: N |
| disabled reasons | Окружение запускается, проверка станет доступна после запуска / Сначала запустите окружение / Дождитесь окончания проверки / Результат проверки ещё не получен / Проверки завершены / Доступно, когда окружение работает |
| budget confirmation (from #37 / #39) | Потратить до $N с вашего ключа API? / Эта проверка расходует токены: (one listed check) / Эти проверки расходуют токены: (two or more) / <check title>: до $N / Отмена / Запустить |
| split handle name | Граница панелей |
| split handle tooltip | Перетащите или щёлкните, чтобы сменить ширину |
| environment status | Создаём окружение / Запускаем окружение / Окружение работает / Окружение остановлено. Файлы в рабочей папке сохранены. Запущенные процессы завершены. |
| environment errors | Docker не запущен. Запустите Docker Desktop и нажмите "Повторить". / Нет образа окружения academy-workspace. Соберите его (см. README) и нажмите "Повторить". / Окружение остановлено: превышен лимит <памяти \| процессов \| CPU>. Файлы сохранены. / Нет доступа к этому окружению. |
| environment notes | Запуск идёт дольше обычного / Рабочая папка сброшена / Рабочая папка не найдена, создано новое окружение из исходных файлов урока. / Ключ API для агента не задан: агент в терминале не запустится. Добавьте ключ в .env и перезапустите платформу. |
| terminal connection | Соединение с терминалом потеряно. Переподключаемся... / Не удалось переподключиться / Сеанс терминала завершён |
| status actions | Повторить / Запустить снова / Открыть курс / Переподключиться / Открыть новый сеанс / Подробности |
| actions menu | Действия / Перезапустить окружение / Сбросить рабочую папку / Режим для экранного диктора |
| key hint | F6 или Ctrl+Shift+. (клавиша Ю): следующая область |
| key hint, macOS | F6 (Fn+F6) или Ctrl+Shift+. (клавиша Ю): следующая область |
| environment tab list label | Окружение |
| environment tab | Терминал |
| terminal name | Терминал |
| reset dialog | Сбросить рабочую папку? / Файлы урока вернутся к исходным, ваши изменения пропадут. Счётчики попыток не обнулятся. / Отмена / Сбросить |
| quiz panel heading (from #36) | <quiz check title> (data, `lesson.yaml`; begins with "Квиз:") |
| quiz header (from #36) | Нужно K из Q / Попытка A из M (limit known) / Попытка A (limit unknown) / Осталась 1 попытка (limit known, exactly one attempt left) |
| question heading, also the group's accessible name (from #36) | Вопрос I из Q |
| question note, `multiple` only (from #36) | Засчитывается только точный набор ответов |
| question code block name, only when it overflows (from #36) | Код к вопросу |
| per-question error (from #36) | Выберите ответ (`single`) / Выберите хотя бы один вариант (`multiple`) |
| error summary (from #36) | Ответьте на все вопросы: осталось U / Вопрос I из Q: выберите ответ / Вопрос I из Q: выберите хотя бы один вариант |
| send button (from #36) | Отправить ответы / Отправляем... (busy) |
| send error (from #36) | Ответы не отправлены. Попробуйте снова. |
| quiz load error (from #36) | Не удалось загрузить квиз / Повторить (the title is also the quiz load status container's text) |
| result block, failed (from #36) | Верно C из Q. Нужно K. / Ответы остались выбранными. Какие из них неверны, квиз покажет после прохождения или после последней попытки. (limit known) / Ответы остались выбранными. Какие из них неверны, квиз покажет после прохождения. (limit unknown) |
| result block, passed or closed (from #36) | Квиз пройден / Верно C из Q. / Квиз не пройден: попытки исчерпаны / Верно C из Q. Нужно K. / Ниже верные ответы и пояснения. |
| result block, refused (from #36) | Ответы не приняты: квиз изменился в другой вкладке. / Последний результат: Верно C из Q. Нужно K. (quiz still open) / Квиз пройден / Квиз не пройден: попытки исчерпаны / Ниже верные ответы и пояснения. (quiz now passed or closed) |
| result block, lesson line (from #36; the check bar's strings) | Урок пройден / Урок завершён: не пройден. Пройдено: N из M |
| review (from #36) | Верно / Неверно (verdict in the question heading) / Ваш ответ / Верный ответ (option marks) / Пояснение |
| quiz check row (from #36) | Ответы не отправлялись / Не пройдено / Пройдено / Закрыта: не пройдено; meta Осталась 1 попытка; Неудачных попыток: N / Неудачных попыток: N из M; Пройти квиз |
| quiz notice (from #36; "Уведомления") | Ответы квиза проверены. Верно C из Q. Нужно K. / Ответы квиза проверены. Верно C из Q. Нужно K. Осталась 1 попытка. / Квиз пройден. / Квиз пройден. Урок пройден. / Квиз пройден. Урок завершён: не пройден. Пройдено: N из M. / Квиз не пройден: попытки исчерпаны. / Квиз не пройден: попытки исчерпаны. Урок завершён: не пройден. Пройдено: N из M. / Ответы квиза не отправлены. Попробуйте снова. / Ответы квиза не приняты: квиз изменился в другой вкладке. |
| quiz notice action (from #36) | Открыть квиз |

"Подробности" content is the raw error from Docker, the runner or the server, shown as is (English in the
prototype). Grader messages are shown verbatim ("2 из 6 карточек неверны."). Check titles in the rows and
in the budget list are `lesson.yaml` data. Amounts: "$" and two decimals with a dot, costs rounded up to the
cent (`checks.md` "Money"). "Осталась 1 попытка" is a fixed string, never built through plural rules.
Every string above is in the `ia.md` register (closed sets, page copy "lesson, accessible names (#69)",
"lesson, checks (#69)" and "lesson, attempt history (F19; #72)", action labels); the quiz strings in the
closed sets "quiz (D2; designed in #70)", "check status", "check row meta", "check row note" and "page alert"
(the quiz notice), the page copy row "lesson, quiz (F15; #70, from #36)" and the action labels "take the
quiz" and "open the quiz outcome from the quiz notice". "Верно C из Q." in an open quiz attempt record
(F19.2, from #36) is the quiz set's, and its "Пройдено" / "Не пройдено" the check status set's (`ia.md`,
their Where columns). "Идёт проверка" of the set "attempt summary" is the dashboard's only: the history
lists finished attempts. The letters A, C, I, K, Q, U have one meaning each (`quiz.md` "Placeholders"), and
every number comes from the server; the page never computes K. Check titles, check ids, grader messages,
raw errors and dates are data; prompts, options and explanations (including "Выберите все верные.") are
quiz content, data, not copy.

## Accessibility notes

- **R1, disabled controls.** "Проверить" and the "Действия" items use `aria-disabled="true"`, never
  `disabled`; they stay in the Tab order, do nothing, and carry their reason as visible `muted-foreground`
  text tied with `aria-describedby` (a second line inside the menu item, `aria-hidden="true"` so the reason is
  the item's description only and not repeated in its name). One reason at a time: during a run
  "Дождитесь окончания проверки" wins. "К окружению" follows a "Сначала запустите окружение" button; then
  "Открыть результаты" when a run ended on this page. Order of the check reasons: "Дождитесь окончания
  проверки", "Результат проверки ещё не получен", "Проверки завершены", then the environment reasons;
  "Переподключиться" follows "Результат проверки ещё не получен"; "Проверки завершены" is offered with
  "Открыть результаты" only, never with "К окружению". "Проверки завершены" is the one reason that never
  acts later (S3, S12): the control stays in place so the bar, `F6` and the Tab order are the same in
  every state.
- **R2, live containers, all present from load (the history and quiz load status containers from the render
  of their section or panel, `ia.md:188-189`):** in "Уведомления" one `role="alert"` (F2.1) and one
  `role="status"` (F10.1), and from #36, on a lesson with a quiz check, a second `role="status"` after them,
  the quiz notice container (F15, P9); the environment status text (`role="status"`, changes only on a
  status change, notes appended inside it); the check bar status line (`role="status"`). **Every live
  container carries an explicit `aria-live` matching its role** (`aria-live="assertive"` with
  `role="alert"`, `aria-live="polite"` with `role="status"`; the prototype: `page-alert`, `page-status`,
  `quiz-notice`, `check-status`, `env-status`, and from #36 the id `quiz-load-status`), because an open modal
  menu or dialog (Radix `hideOthers`,
  `aria-hidden` 1.2.6) sets `aria-hidden` on the rest of the page and spares only `[aria-live]` nodes and
  their ancestors; without it the quiz notice, the idle warning and the F2.1 alert set while "Действия", the
  user menu or the reset dialog is open would be announced nowhere (`quiz.md` "Away"; FU11 for the app's
  `notifications.tsx`). **The container is the only live element:** nothing inside one carries
  `role="alert"` or `role="status"` (the F2.1, F10.1 and quiz notice Alerts render with no role; the app
  passes `role={undefined}` to `Alert`), so nothing is announced twice or with another politeness. The Квиз
  panel holds one live container, the quiz load status container (below); every message after a send takes
  focus unless the learner is away. The four v1 containers (five from #36 on a lesson with a quiz, and the
  quiz load status container, empty from the start of each load) are empty on load,
  except the check status line in the nothing-to-run states (`#state-closed`, `#state-closed-limit-unknown`,
  `#state-passed-paid-only`): there its text is part of the page markup, so it is not announced on load,
  and it is still never inserted together with the container. Standalone timers (check bar, environment
  status bar) are `role="timer"`, siblings of their status container and outside it; the running time
  inside a check row is `.check-row-time`, no role, part of the row button's name (a button's children are
  presentational). Nothing else is live: not the rows, not the terminal, not the copy button, not the
  reasons, not the tab name. For the checks a run includes, the status line is the only announcement of
  the last-attempt warning, a closed check and a runner error (summaries 4 and 6, the notes of summary 7),
  once, at the end of the run; the quiz says its own outcome by the result block taking focus or, while the
  learner is away, by the quiz notice (from #36, P6-P9). "Уведомления" is a `region` with its hidden h2
  only while a container has text. While the course cannot be read only the two "Уведомления" containers
  exist (no quiz notice container: the page cannot know of a quiz check). From #35 the page has one more
  live container, the history status container (below), never while the course cannot be read; from #36,
  on a lesson with a quiz check, the quiz load status container (below), never while the course cannot be
  read.
- **R2, the history status container (from #35; `ia.md` R2, `progress.md` F19 error states).** A visually
  hidden `role="status"` element with an explicit `aria-live="polite"` (R2, every live container), inside
  the history section, present and empty whenever the section is rendered, before any text is set; never
  inserted with its text. One case only writes it, once per page view, with "История попыток
  недоступна": a history re-read after a new record fails while the history was empty (a run's end; from
  #36 also an answered quiz send or a visibility re-read that finds a record), and the Проверки tab panel
  is shown (one-pane: area "Урок"); otherwise nothing is written and the learner meets the error h3 on
  opening the tab. The text is set no sooner than `CHECK_STATUS_TEXT_GAP_MS` after the check bar's end
  text is set, or from #36 after the quiz notice text when one was set (after that text when it still
  waits for its own gap), so the run's or the quiz's outcome is read first. The prototype draws the run
  case only (`#state-history-error-after-run`). "Повторить" loading the history empties it without a
  word. It stays empty on a load in the error state (`#state-history-error`, `#state-history-deep-link-error`): the error was there
  on load. Every other change in F19 is not announced.
- **R2, the quiz load status container (from #36; `ia.md` R2, `quiz.md` "The quiz load status container").**
  A visually hidden `role="status"` element with an explicit `aria-live="polite"` (R2, every live container),
  inside the Квиз tab panel right after its heading (`.quiz-intro`, after `#quiz-code-heading` in the
  prototype, before `.quiz-header`), outside the Skeletons and the load error, present and empty whenever
  the panel is rendered, from the start of each load, before any text is set; never inserted with its text;
  it holds no `[role="alert"]` or `[role="status"]` descendant. One case writes it, once per failed load,
  with "Не удалось загрузить квиз", the h3's own text: a quiz load (the first, or "Повторить") fails while
  the Квиз panel is shown (one-pane: area "Урок") and no focus move announces it (the first load always; a
  "Повторить" after which focus left the panel and is not on `body`). The text is set after the panel's
  `aria-busy` is removed, at least one rendered frame later; no sooner than `CHECK_STATUS_TEXT_GAP_MS`
  after the check bar status line's last text when that text is younger than the gap (after that text when
  it still waits for its own gap); and no sooner than `QUIZ_LOAD_STATUS_MIN_AGE_MS` (100 ms, React Aria's
  live announcer delay for Safari, `LiveAnnouncer.tsx:32-34`) after the container entered the
  accessibility tree, that is, after the Квиз panel was last shown and mounted (Radix may unmount an
  inactive panel, so opening the Квиз tab mounts the container as the first load starts). The write waits
  for the latest of the three. A "Повторить" is not affected in practice: its container has been in the
  tree since the panel was shown; the same measure still applies to it and to a load still running when the
  panel is shown again. It is emptied, silently, when a load starts, which also drops a write still waiting
  (`ia.md:241`, `quiz.md:325`), so every failure is announced again; a write still waiting is dropped too
  when the Квиз panel is hidden first ("never written with the panel not shown", `ia.md:240`), and the error
  then waits in the panel like any failure with the panel not shown. A "Повторить" whose failure moves
  focus to the h3 leaves it empty, so nothing is said twice. It never meets the history status container:
  each is written only while its own left-pane tab panel is shown. The prototype draws one pair only:
  `#state-quiz-loading` -> `window.proto.setState("quiz-load-error")` writes it (page script,
  `QUIZ_LOAD_STATUS_MIN_AGE_MS` counted from the later of `#panel-quiz` and its pane being shown, checked
  at the write: the panel shown and focus not on `#quiz-load-error-title`); every other state change empties
  it, and an arrival by URL at any state leaves it empty (page content). No check bar text changes in that
  pair, so the prototype does not draw the gap.
- **F19 structure (from #35).** The history `section` has no accessible name (no `region` inside "Урок",
  R3); heading navigation reaches its h3. The attempt list is a `ul` labelled by the h3; an empty history
  renders its text in place of the `ul` (no empty named list). An attempt panel's list has no name; it
  follows the expanded button that names the attempt. The status icon of a row is `aria-hidden` and
  repeats the words. The `F6` cycle is unchanged: the history is inside "Урок".
- **Runtime checks for the testers of #35 / #37 (design note §9, not provable in a static prototype; each
  item from #35 unless tagged):**
  1. (#37) a money amount ("$0.08", "не меньше $0.04") is read as an amount by NVDA and VoiceOver;
  2. the plain item's text is read when a deep link focuses it on load; if not, the item is named with
     `aria-labelledby` on its own field spans (a design follow-up);
  3. (from #35; the "from #37" states of deep-link rows 1 and 3 by the #37 tester, as AC63) the inset
     `:focus-visible` ring shows on the programmatic focus on load for deep-link rows 1-4, also after a
     mouse click on the dashboard row;
  4. the dashboard's "Идёт проверка" ring does not move, with and without reduced motion (2.2.2);
  5. the failed re-read of an empty history is read once, "История попыток недоступна", by NVDA and
     VoiceOver, with focus on the h3 "История попыток" (row 3 arrival during the first run, then the run
     ends and the re-read fails) and with focus off it (on "Проверить", or in the terminal); it is not read
     when the Проверки tab panel is not shown at that moment, and opening the tab later announces nothing;
     the check bar's end text is still read in full, before the history text; "Повторить" then loading
     the history empties the container without speech (4.1.3).
- **R2, focus after a background change:** never `body`; the targets of the "Background changes and focus"
  table above. The budget confirmation closes before the status text is set (B6, B23).
- **R3, regions:** the `banner` (R3 calls it "Верхняя панель"; the `header` carries no `aria-label`, as in
  `design/system/components.html`), "Уведомления", and inside `main` the `region`s "Урок",
  "Проверка", "Окружение", each named by a visually hidden h2. The lesson h1 is the first visible heading.
  While the course cannot be read, `main` holds only the course error and none of the three regions exists.
  The h1 is then the Alert title "Не удалось загрузить курс".
- **R4:** one `main` (`tabindex="-1"`), skip link first.
- **Names of the top bar parts.** The nav carries no label (the only `navigation` landmark in the banner);
  the user menu is named by its trigger (`aria-labelledby="user-menu-trigger"`, the email); its email label
  is `p.dropdown-label` with `role="presentation"` and an `id` naming a `role="group"` around the
  separator and "Выйти", as in `design/system/components.html`.
- **Check row (F13.3, F14) without the kind.** Collapsed, in order: the status icon, the title, the status
  word, then the meta when `checks.md` "Row meta by status word" allows it: the running time "M:SS из M:SS"
  only with "Идёт" (and only for a check with `timeoutSec`; a rubric check shows none), "лимит M:SS" only
  with the two "Время вышло" words, "Осталась 1 попытка" with a warning icon only with a known limit and
  exactly one counted attempt left, never with "Пройдено" or "Закрыта: не пройдено". Open, in order, per
  "Open panel by status word": the closed note, the sticky-pass note, the latest result's grader message,
  "Подробности", the cost, the counter (always last of the notes; from #36 the quiz check row adds "Пройти
  квиз" after it while an attempt can be made). While a check is queued or running its panel shows only the
  counter. The kind is not shown (hidden in v1; labels registered in `ia.md` for later).
- **R5:** the page shows no lesson status; opening it, reading and the automatic start do not start the lesson.
  The check bar's "Урок пройден" and "Урок завершён: не пройден. Пройдено: N из M", and from #36 the same
  strings as the quiz result block's lesson line and in the quiz notice, come only from the lesson status
  the server reports (FU7 decides that status when a quiz closes).
- **R6:** before #36, no Квиз tab, quiz row, "Пройти квиз", quiz notice container or other quiz control in
  any state, and the quiz check is not counted ("Пройдено: 0 из 1"); `?tab=quiz` falls back. From #36 they
  appear on a lesson with a quiz check, the quiz check is counted ("из 2" in this lesson), and only
  `#state-quiz`, the `#state-quiz-*` states and the two quiz states of the history (`#state-history-quiz`,
  `#state-history-quiz-open`) draw them (`quiz.md` "Release scope"). The attempt history only from #35 (the
  `history-*` and `checks-weak` states; no #69 or #70 state draws it, and `attempt` is ignored before #35);
  a quiz attempt record in it only from #36 with #35. In every release: no mentor, hint or Редактор control,
  and no "Разобрать с ментором" in the closed quiz block (#37). No budget control in any v1 state: the
  budget confirmation and the token-spending checks appear only in the states marked "from #37 / #39". No
  cost element before #37: "Потрачено: ..." appears only in the `history-cost*` states, "Стоимость попытки:
  $N" only in states marked "from #37 / #39" or "from #37", and "Не пройдено: исчерпан бюджет $N" in a
  history panel only in `#state-history-cost-budget` (#39) (`ia.md` R6, "Progress by release (#72)").
- **Closed check (F14.3).** Lock icon in `destructive` plus the words "Закрыта: не пройдено"; the shape tells
  it from the failed cross (colour is shared). Nothing reopens it: no control in any state, and the reset
  dialog says "Счётчики попыток не обнулятся."
- **Budget confirmation:** `role="alertdialog"`, named by its title, described by the paragraph and the
  list; modal, so the page behind is inert and the idle warning in "Уведомления" is behind it (design note,
  residuals); the dialog does not count as activity.
- **Quiz (from #36).**
  - **WCAG 3.3.4 (Error Prevention: Legal, Financial, Data).** A send spends an attempt, so it is treated
    as a submission that must be checked and reversible before it is final. It meets 3.3.4 by "Checked": the
    page checks the answers for completeness before anything is sent (the blocked send, the error summary
    and the per-question messages), and by WCAG technique G98 (the learner can review and correct every
    answer before the send): every question and its answer stay on one page, editable until "Отправить
    ответы" is pressed, and only that button sends (Enter on an option does not). After a failed attempt the
    answers stay selected for the next one.
  - **Question block.** The group is `role="radiogroup"` or `role="group"`, named by `aria-labelledby` the
    `h3` "Вопрос I из Q" and described by `aria-describedby` the prompt, then the note, then the message when
    shown (only ids of elements that are shown). No `<fieldset>`: a `<legend>` cannot hold a prompt with a
    code block, and a prompt as the name would make a name of hundreds of characters. Each option is a label
    wrapping its control and text, the whole label the target, at least 24 px high. No letter prefixes.
  - **Review.** A static list, not inputs (`readonly` does not apply to radios and checkboxes, `disabled`
    drops them from the Tab order and the contrast requirement, `aria-readonly` still lets arrow keys change
    a native radio). The drawn indicator is `aria-hidden`; the words "Ваш ответ" and "Верный ответ" carry the
    facts, each with an icon of its own shape. The verdict "Верно" or "Неверно" is part of the `h3` (icon
    plus word), so heading navigation lists the verdicts. Colour is never alone (WCAG 1.4.1).
  - **Contrast (WCAG 1.4.11).** Radio and checkbox boundaries use `--input`, never `--border`; checked and
    focused states meet 3:1 with the ring; the locked state while sending keeps these contrasts and turns
    nothing translucent (`design/system/README.md` RadioGroup).
  - **Targets (WCAG 2.5.8).** Every error-summary link is at least 24 px tall (`.alert-links a`
    `min-height: var(--hit-min)` in `proto.css`), so no spacing exception is needed; every option label is at
    least 24 px tall.
  - **Reflow (WCAG 1.4.10).** Option text with long inline code wraps at 320 px (`.choice-text` wraps
    anywhere); only a code block (a prompt's, or in the review an explanation's) scrolls sideways, inside
    itself.
  - **Prompt code block (WCAG 2.1.1).** Only when its lines overflow does the `pre` take `tabindex="0"`,
    `role="group"` and `aria-label="Код к вопросу"`, with the focus ring inset on the `pre` (page-level
    bullet "Code blocks (WCAG 2.1.1)"); the rule, keep-until-blur included, is README "Scrollable code". A
    fenced block in an explanation (the review) is the same header-less `pre` under the same rule, named
    "Блок кода" (`quiz.md` "Question block").
  - **Focus visible (WCAG 2.4.7).** The result block and the send error are scrolled into view as they take
    focus (no `preventScroll`), because after a press on "Отправить ответы" far down the questions they are
    above the viewport.
  - **Status messages (WCAG 4.1.3).** Every quiz message after a send, and a failed "Повторить" with focus
    still on the panel heading, in the panel or on `body`, takes focus (a focus move needs no live region);
    the quiz's live containers are the quiz notice (a send answered while away), because a result block
    focused behind an open modal menu or dialog would be announced nowhere, and the quiz load status
    container (a load failure no focus move announces).
  - **Timing.** The quiz has no time limit; the idle warning (F10) and the session (F2) are unchanged, and
    answering is not terminal input.
- **Evidence (headless over http, kept out of the ACs because the counts change with every state).** These
  are the runs of #69 and #50 on their own branches, not re-run on the merge; the merge parity run below
  covers their states (all are states of both prototypes it compares). #69
  run (`plans/69-lesson-check.mjs`, 63 states): 38672 checks, 0 findings. 4461 control activations at 1280
  px and 3213 at 375 px (click and Enter, from each left-pane tab the state shows; 12 clicks skipped where an
  open menu lies over the control), 282 and 270 Backs (Back into a dialog state lands on "Отмена"), 0 tab or
  query changes outside "Открыть результаты"; 6750 UI strings matched against the `ia.md` register; 120
  `F6` cycles; 518 AC13 checks; 30 cross-page round trips; 24 status transitions; 56 background focus pairs
  (30 of them with focus on a row button); 24 rows checked for run continuity. Eleven guard breaks each turn
  it red: closed icon, "Переподключиться" removed, a status text changed, "лимит 0:30" under "Пройдено", no
  check bar fallback, `role="timer"` on a row time, a zero text gap, Back focus on the remembered dialog
  button, a non-wrapping check bar status at 320 px, no row fallback, and the last-attempt warning dropped
  from the run on the last attempt. The #50 run recorded 1748 activations at 1280 px and 2120 at 375 px (269
  Backs each) and "Войти снова" `next` matching the selected tab in all 33 / 42 checks.
- **Evidence, #72 (headless, `plans/72-lesson-check.mjs`, Playwright 1.64.1 Chromium; re-run on the merge
  with #70).** The scripts named here are local design scripts in the git-ignored `plans/` and are not in
  the repository; the dev testers of #35, #36, #37 and #39 do not run them and re-check the behaviour AC71
  and AC72 list instead, each in the states of its release. The 29 #72 states (the two quiz states of the
  history added) loaded at 1280x800, 375x667 and 320x500 (87 loads): selected tab, Квиз tab shown only in
  the two quiz states, heading, empty text, list names and icons, plain item, expanded rows, open panel
  words, costs and the quiz line "Верно 4 из 6." (no `pre`), check rows and check bar of the moment, focus
  on load, history status container, `scrollWidth`; 1099 Cyrillic strings matched against the register;
  58 `F6` cycles; 29 AC13 checks at 375x667 with "Урок" shown; 4 history status transitions (written once,
  150 ms or more after "Урок пройден", focus kept on the h3, emptied by "Повторить", not written again in
  the same page view). Every control of every #72 state by click and by Enter: 2682 activations at 1280 px
  (from Проверки, Теория and Задание, and Квиз in the two quiz states) and 950 at 375 px, 92 and 40 Backs
  after each simulated action, 1606 cross-page links checked by `href`, 68 activations skipped because the
  control was covered; 0 tab or query changes outside a tab, "Открыть результаты" and "Пройти квиз",
  `attempt` kept in the URL. 19911 checks; 8 findings, all one script limit ("Пройти квиз" focuses the
  compound selector `#panel-quiz h2:not([hidden])`, which the script compared as an id); with the selector
  resolved, the two quiz states re-run: 1814 checks, 0 findings. The six guard breaks of the first pass (a
  deep-link focus target removed, a zero history text gap, a wrong row icon, the plain item without
  `tabindex="-1"`, "Повторить" focusing "Проверить", the container written twice) were not re-broken on
  the merge.
  Merge parity (a separate local script): in each of the 90 states of the #72 prototype (4bb4729) and the
  93 states of the #70 prototype (main), the merged page renders the same visible elements, texts, roles,
  states and focus (only the `aria-live` that R2 adds differs), every control clicked at 1280 px gives the
  same state, tab, `?tab=`, focus and Back (1415 and 1320 activations, 0 differences), and the accessible
  names of every state, each loaded fresh in a new browser context (CDP `Accessibility.getFullAXTree`, 122
  states, 7013 names), equal those of the side it comes from (183 states compared, 0 differences).
  Accessible names of the history rows (a local script, CDP `Accessibility.getFullAXTree`, every one of the
  122 states loaded fresh in a new browser context, light and dark by `prefers-color-scheme`): 23 states
  render history rows, 290 rows over both themes, 0 mismatches: 246 disclosure button names, each with the
  ". " joins, among them "№ 9. 5 ноября, 15:22. Пройдено проверок: 0 из 1" in `#state-history-quiz` and
  `#state-history-quiz-open`, and 44 plain items. The plain item `li` has no `aria-label` or
  `aria-labelledby`. Chromium computes its name from its contents only while it has focus: "№ 2. 4 ноября,
  13:50. Сбой проверки, попытка не засчитана", on the fresh load of `#state-history-deep-link-plain`, where
  the deep link focuses it (2 of the 44, one per theme); in the other 42 it is unfocused and has no name.
  Its markup breaks into separate blocks ("№ 2.", the date and ".", the summary), so whether a screen
  reader voices that name when the item takes focus stays runtime check 2; `aria-labelledby` is added only
  if that check fails. The same fresh-context run over the whole page found 7013 names in the 122 states.
- **Evidence for the quiz (#70, headless over http, Chromium and WebKit; #70's run on `main`, not re-run on
  the merge, whose parity run above covers its 93 states).** The quiz run: 35648 checks, 0
  failures over the 30 `#state-quiz-*` states (1052 to 1306 per state), 786 controls clicked at 1280 px and
  698 at 375 px per engine, each with Back and Forward; every transition between quiz states asserted to
  keep the header, the quiz row, the result block, the empty history text and the check bar, and each
  "Отправить ответы" its sending state (these assertions turn 14 checks red on the round 1 prototype, where
  every send went to the attempt 1 state); 96 "tab drop (v1 target)" lines, all "Проверить"
  into `#state-check-running` (the sweep clicks no item inside the closed "Действия" menu or the reset
  dialog, whose "Перезапустить окружение" and "Сбросить" drop the tab the same way: Prototype, "Prototype
  limitations" item 1). The
  "Продолжить работу" fallback: 96 checks, 0 failures (1280 and 375 px, click and Enter, from Теория and
  Задание, with "Урок" and with "Окружение" shown); removing `data-keep-pane` turns 16 of them red. The
  error-summary links measure at least 24 px tall at 1280, 375 and 320 px, and the result block is focused
  and inside the viewport after the send from the bottom of the panel (12 checks). 63 quiz UI strings of
  the prototype match the Copy rows, and every quiz Copy row is in the `ia.md` register.
- **Handle hit area (2.5.8).** The visible handle is `0.75rem`, its hit box `min-width: var(--hit-min)`
  (24 px; measured 24 px wide at 1280, re-measured on the merge) across the full pane height.
- **Handle tooltip (1.4.13).** Opens on hover and on focus, stays while the pointer is over it, and Esc hides
  it without moving focus. The pointer can move from the handle onto the tip across the gap without closing
  it (a transparent bridge in `proto.css`; verified at 1024 px with a real pointer: handle, gap, tip, the tip
  stays). It reopens on the next hover or focus.
- **Copy button name change.** On denial the button's text, and so its accessible name, becomes "Не
  скопировано, выделите текст вручную"; focus stays on it. No live region is added (R2 lists the only live
  containers), so the echo relies on the screen reader announcing a name change of the focused element.
  The dev tester verifies it with VoiceOver (Safari) and NVDA (Chrome); if one of them stays silent, that is a
  DESIGN follow-up, not a dev fix (Open questions).
- **Code blocks (WCAG 2.1.1).** A Теория or Задание code block whose lines overflow is a Tab stop after its
  "Копировать", `role="group"` named "Блок кода" (a quiz explanation block the same, without "Копировать";
  the quiz prompt "Код к вопросу"). The rule is README "Scrollable code" and is not restated here. The focus
  ring is inset on the `pre`, square under the header; the gap of its bottom edge over a classic scrollbar
  in the dark theme is recorded there (#211). `tabindex="0"` is there for Safari, which does not make a
  scroller a Tab stop by itself, and the role and name for every browser (`lesson-environment.md` "Code
  blocks that scroll"): do not drop them as redundant. Prototype: `#state-theory`, the "Локальные модели"
  block (AC75).
- **Check bar never obscures focus (2.4.11).** The check bar is a grid row, never `position: sticky` or
  `fixed`. Each pane scrolls inside its own area above it; the environment pane scrolls as a whole, so its
  terminal minimum height never paints over the check bar row. Below `30rem` of height (400 % zoom) the
  page becomes one scrolling document and the check bar is a block after the pane. Verified over http with
  `elementFromPoint` at the centre of every rendered "Проверить" after focusing it, in every state without a
  dialog, at 375x667, 320x500 and 320x200 with "Урок" and with "Окружение" shown, and at 1280x800 with both
  panes: 0 covered, 0 outside the viewport (the #69 run: 500 checks over the 61 states, not re-run on the
  merge; the #72 run on the merge adds 29 AC13 checks at 375x667, 0 covered). In #50, with the environment
  pane's overflow forced to `visible`, 27 of 83 were covered at 375x667, so the check can fail.
- **"Открыть результаты" while the environment restarts.** It stays from the end of a run until the next run
  starts or the learner leaves the page, through a restart (`#state-after-run-starting`) and a stop
  (`#state-after-run-stopped`). The status line keeps "Пройдено: N из M".
- **Colour is never alone:** every status has an icon shape and a word; the switch suffix is words in the
  accessible name plus an icon; a lost connection is a dashed frame plus text, never opacity.
- **Terminal:** dark in both themes; focus ring outside the frame (`ring` on `background` and on `terminal`
  measured in `design/system/README.md`); the hint is tied to xterm's helper textarea with
  `aria-describedby` (the prototype ties it to the frame); "Режим для экранного диктора" toggles xterm
  `screenReaderMode`.
- **Source links** open in the same tab (no `target`): the copy sets have no "opens in a new tab" text, and
  the browser's own new-tab gesture still works.

## Acceptance checks

- AC1: At 1280 px the page shows two panes with the check bar under the left one; at 1023, 768, 375 and 320
  px one pane with the switch "Урок / Окружение" and the check bar under the area; `scrollWidth` equals the
  viewport width at 320 px in every state.
- AC2: In the M0 lesson there is no "Окружение", no switch, no handle, no check bar and no Проверки tab, and
  the line "Окружение и проверки появятся в следующей версии платформы" is under the header, at 1280 and
  375 px.
- AC3: `F6`, Shift+`F6`, Ctrl+Shift+. and Ctrl+Shift+, from inside the terminal land as in the landing table
  above in every state of the States table (two-pane and one-pane), including from the split handle.
- AC4: A lesson opened with `?tab=task` after sign-in (F2.4) shows Задание; `?tab=checks` opens Проверки;
  `?tab=checks` in the M0 lesson falls back to Теория. Before #36 `?tab=quiz` falls back to Теория; from #36
  it opens Квиз on a lesson with a quiz check (the restored state, never Теория, `?tab=quiz` kept) and falls
  back to Теория (Задание without theory) on a lesson without one. The tab "Войти снова" sends back is the
  one selected when the session expired (AC17).
- AC5: Every disabled control of R1 has `aria-disabled="true"`, no `disabled` attribute, is reachable by Tab,
  does nothing on Enter, Space or click, and its reason is read as its description.
- AC6: The four live containers (from #36 five on a lesson with a quiz check, the quiz notice container
  after the F10.1 one, and, inside the Квиз panel, the quiz load status container from the start of each
  load; the two "Уведомления" ones while the course cannot be read) exist on load;
  they are empty on load, except the check status line in the nothing-to-run state, whose text is part of
  the page and not announced; their text changes only in the cases R2 and `checks.md` "Live regions" list
  (announced exactly when the page learns of a change in the lesson's run, B1-B26); two consecutive status
  texts are at least `CHECK_STATUS_TEXT_GAP_MS` apart; the Проверки tab's accessible name is "Проверки,
  идёт проверка" only while a run is known to be going (summaries 1 and 2).
- AC7: A run does not switch the tab; after it the status line reads the end text of `checks.md` "Check bar
  status line" (summary, then its notes; "Урок пройден" never while a counted check is closed) and
  "Открыть результаты" moves focus to the Проверки heading, switching the area first in one-pane mode; it
  stays through an environment restart and stop until the next run, and in the nothing-to-run state it is
  there from page load.
- AC8: "К окружению" switches the area in one-pane mode and focuses the status action of the state.
- AC9: An open row shows the latest result's grader message verbatim (never an older result's) and ends
  with the counter: "Неудачных попыток: N" when the server reports no limit for the check, "Неудачных
  попыток: N из M" when it reports one. "Осталась 1 попытка" shows only with a known limit and exactly one
  counted attempt left, never with "Пройдено" or "Закрыта: не пройдено"; "лимит M:SS" only with a "Время
  вышло" word; the running time only with "Идёт". No mentor or hint control. Before #36 quiz checks are
  neither listed nor counted; from #36 the quiz check is a row of its own (AC41) and is counted in "Пройдено:
  N из M". No row shows a check kind.
- AC10: The split handle has a hit box at least 24 px wide; a click cycles 50 / 35 / 65 %; arrows move 5 %;
  Home / End go to the limits; Enter cycles; a double click does not reset; after a free drag the next click
  goes to 50 %; its tooltip opens on hover and focus and closes with Esc.
- AC11: "Сбросить рабочую папку" opens the dialog with focus on "Отмена"; Esc returns focus to "Действия";
  "Сбросить" ends with "Окружение работает" plus "Рабочая папка сброшена" and focus on "Действия"; counters
  unchanged.
- AC12: Each status action that removes itself moves focus to "Действия", never to `body`.
- AC13: At 375x667, 320x500, 320x200 (400 % zoom) and 1280x800, in every state and with each pane shown in
  one-pane mode, a focused "Проверить" is the element at its own centre (`elementFromPoint`) and inside the
  viewport: no pane, the check bar or another element covers it.
- AC14: Copy denial changes the label to "Не скопировано, выделите текст вручную"; VoiceOver and NVDA
  announce the new name with focus on the button.
- AC15: Every status, note, reason, label and accessible name in the UI is from the `ia.md` register
  (closed sets, page copy, action labels), including every #69 string (check statuses, row meta, row notes,
  status line summaries and notes, disabled reasons, budget confirmation, "Переподключиться",
  "Подробности"); the Copy table equals the app strings.
- AC16: Both themes: tokens only (no raw colour), terminal dark in both, contrast as measured in the system
  README.
- AC17: Select Проверки: the URL reads `?tab=checks` and `history.length` is unchanged; "Войти снова" carries
  it in `next` (`next=` decodes to the lesson path with `?tab=checks`); a reload reopens Проверки. The same
  for Теория (`?tab=theory`) and Задание (`?tab=task`), and from #36 for Квиз (`?tab=quiz`, also after "Пройти
  квиз" and "Открыть квиз").
- AC18: From each of Теория, Задание and Проверки (from #36 also Квиз), every control of every state keeps
  the selected tab and `?tab=`, at 1280 and 375 px, and so does Back after it; the only exceptions are
  "Открыть результаты", which selects Проверки and writes `?tab=checks`, and from #36 "Пройти квиз" and
  "Открыть квиз", which select Квиз and write `?tab=quiz`. "Войти снова" `next` carries the selected tab.
  (Run counts: Accessibility notes, "Evidence"; the prototype's quiz-state exceptions: Prototype,
  "Prototype limitations" item 1.)
- AC19: When the course cannot be read, `main` holds only "Не удалось загрузить курс" (the h1, `tabindex="-1"`)
  and "Повторить"; `<title>` "Не удалось загрузить курс" (the app; the catalog prototype that draws this
  composition keeps the course title); HTTP 200; `F6` to `main` lands on "Повторить"; no
  `aria-current` on either top-bar link; until #220 "Курс" is left out while the course id is unknown (only
  when `course.yaml` itself cannot be read; from #220 the bar has no "Курс", `ia.md` A218-3, and the course
  error with several courses: see #222). "Повторить"
  puts focus on the lesson h1 with `<title>` the lesson title on success; the error h1 with `<title>` "Не
  удалось загрузить курс" on a second failure; the not-found h1 with `<title>` "Страница не найдена" when
  the course loads but the URL is a way into the not-found page. A pointer press on "Повторить" that did not
  focus it (Safari) puts focus on it before the retry ends, so a failure always moves focus from "Повторить"
  to the error heading (`ia.md:323-353`). The closing focus move happens only while focus is still on
  "Повторить", on `body` or inside `main`, and its target is shown; otherwise focus stays where the learner
  put it and nothing is announced, because the error is unchanged on screen and a load that succeeds is page
  content (`ia.md:338-353`, retry focus guard). The guard
  covers the lesson h1 and error h1 moves; the not-found move keeps its statement (#95).
- AC20: task.md `###` renders as h4 at `text-lg`, weight 600, `space-6` above; theory.md `####` the same.
  No h4 is a "Содержание" target (no `tabindex`).
- AC21, nothing to run: when every counted check is passed or closed and at least one is closed (S3), or a
  passed lesson has only token-spending checks (S12), "Проверить" is `aria-disabled` with "Проверки
  завершены", there is no "К окружению" even with the environment stopped, "Открыть результаты" is there
  from page load, the status line holds "Урок завершён: не пройден. Пройдено: N из M" or "Урок пройден"
  from page load without an announcement, and `F6` to "Проверка" lands on "Проверить" (`#state-closed`,
  `#state-closed-limit-unknown`, `#state-passed-paid-only`).
- AC22, closed row: lock icon, "Закрыта: не пройдено" and no meta; the open panel starts with "Проверка
  закрыта: попытки исчерпаны. Сброс рабочей папки и перезапуск окружения её не откроют." and keeps the
  closing message; "Проверить" never runs it again: in `#state-mixed-running` the closed row keeps its word
  and has no time; nothing reopens it (no control, not a reset, not a restart).
- AC23, budget confirmation: opens only for a run that includes a token-spending check that is not passed;
  the singular description with one item and the plural with two or more; focus on "Отмена"; Esc and
  "Отмена" return focus to "Проверить"; "Запустить" starts the run with focus on the `aria-disabled`
  "Проверить"; the title's sum equals the items' sum; a passed token-spending check is never listed; `F6`
  does nothing while it is open; a background change closes it with focus on "Проверить", and only then is
  the status text set, at least one text gap after the close.
- AC24, result stream: the lost and failed texts as in `checks.md`; "Переподключиться" right after the
  `aria-disabled` "Проверить" ("Результат проверки ещё не получен"); pressing it shows the reconnecting
  text with focus on "Проверить"; a cycle that fails at once still gives two texts at least the text gap
  apart, the failed text and the button back, focus still on "Проверить"; no row reads "Не пройдено"
  because of a drop.
- AC25, runner error: the row word "Сбой проверки, попытка не засчитана" with the `warning` icon,
  "Подробности" collapsed by default with the raw error, the counter unchanged, the bar summary "Сбой
  проверки, попытка не засчитана" (every check errored) or the note "Проверок со сбоем: N"; "Проверить"
  enabled; no "Повторить" anywhere in the check bar or the rows.
- AC26, sticky pass: a passed row whose latest result is not a pass still reads "Пройдено", with no meta,
  and its panel starts with "Проверка уже засчитана. Последний результат: не пройдено" (or "...: сбой
  проверки"); its later failures do not change the counter.
- AC27, background changes: every row of the "Background changes and focus" table above moves focus to the
  named target, never to `body`, and sets the status text it names; a focused row button stays on the same
  check's row button in B8-B14 and B19; controls of the new state are there at
  once and only the status text waits for the gap; a waiting text equal to the one shown is dropped, except
  the B9 re-set, which empties the line and sets the same text one gap later.
- AC28, row time: no `role="timer"` inside any `.check-row-trigger`; every in-row running time is a
  `.check-row-time`, part of the row button's name; the check bar and environment timers are `role="timer"`
  siblings of their status containers.
- AC29, headless control run: `plans/69-lesson-check.mjs` (design note §7) passes with its expected counts:
  every state at 1280 and 375 px, every control by click and by Enter from each left-pane tab, Back after
  each, the cross-page round trips, the register closure, R1 to R3, AC1 and AC13, the status text per
  transition, B8-B23 including a focused row button, and the run continuity of every run transition (last
  run: 38672 checks, 0 findings); each guard break of §7 item 10 turns it red, and so do the four added
  since: Back focus into a dialog state on the remembered button instead of "Отмена", a check bar status
  that does not wrap at 320 px, the row fallback removed, and the warning dropped from the last-attempt
  run.
- AC30, "Продолжить работу" (every release): it clears the idle warning and returns focus to the element
  that had it before focus entered "Уведомления"; with none, to the course crumb with two panes (until
  #220 "Курс"; row "course crumb landing"), to the switch tab
  "Урок" in one-pane mode with "Урок" shown, to the switch tab "Окружение" in one-pane mode with "Окружение"
  shown, and the shown pane does not change; when the return target is gone (from #36: an answer replaced
  the busy button or the options with the review), focus goes to the R2 target of its place (the result
  block or send error; "Отправить ответы" after a failed attempt or a refusal that finds the quiz open,
  which also empties the notice container), never `body`.

From #36, the quiz (`quiz.md`; each AC names its source):

- AC31, release scope (`quiz.md` "Release scope", "Empty states"): before #36 no state shows the Квиз tab,
  the quiz check row, "Пройти квиз", the quiz notice container or "Открыть квиз", and the quiz check is not
  counted; from #36 a lesson with a quiz check shows the Квиз tab last in the tab list and the quiz check
  row in Проверки and counts the quiz; a lesson without one shows neither; "Разобрать с ментором" shows in
  no state until #37.
- AC32, header (F15.1, "Limit known and limit unknown", "Quiz panel, in DOM order"): the panel heading
  `h2` (`tabindex="-1"`) is the check `title`; the header reads "Нужно K из Q", then "Попытка A из M" with a
  known limit or "Попытка A" without; "Осталась 1 попытка" with the warning icon follows only with a known
  limit and exactly one attempt left, with the markup of the row meta warning; Q, K, A and M come from the
  server (K equals task.md's "нужно K верных"); there is no separate question count.
- AC33, question block (F15.2, "Question block"): questions and options in file order on every attempt and
  in the review; each `h3` "Вопрос I из Q" names its group (`role="radiogroup"` for `single`, `role="group"`
  for `multiple`) through `aria-labelledby`; `aria-describedby` lists the prompt, then for `multiple` the
  note "Засчитывается только точный набор ответов", then the message, only while each is shown; nothing is
  preselected; no `<fieldset>`; no letter prefix; every option label is at least 24 px high and wraps at 320
  px (`scrollWidth` 320).
- AC34, blocked send (F15.3, "Error summary and per-question messages", "Focus targets" rows 1-3): with an
  unanswered question "Отправить ответы" sends nothing; the error summary "Ответьте на все вопросы: осталось
  U" above the questions takes focus, with one link per unanswered question in question order ("Вопрос I из
  Q: выберите ответ" or "...: выберите хотя бы один вариант"), each at least 24 px tall; each unanswered
  question shows "Выберите ответ" or "Выберите хотя бы один вариант" as plain text with no role; a link
  focuses the first option of its question without selecting it, with the heading in view; answering
  removes the message and the link and lowers U, unchecking the last box of a `multiple` question adds them
  back and raises U; with none left the summary goes and does not come back before the next blocked send;
  when the summary or a link being removed held focus, focus moves to the option just changed (also after a
  mouse press in Safari with focus on a link), never `body`.
- AC35, send lock (F15.3, "Sending: busy button and locked answers"): with every question answered the
  summary and messages go and "Отправить ответы" becomes "Отправляем..." with a Spinner, `aria-busy="true"`
  and `aria-disabled="true"`, focused after a key press and after a mouse press (in Safari too, by script);
  every option control and every group has `aria-disabled="true"` and no `disabled`;
  a click, Space and an arrow key on an option change no answer; every option stays in the Tab order; the
  lock and the busy state end together when the server answers, before focus moves; the tab list, the
  one-pane switch, `F6` and "К окружению" stay live during the send; the header (attempt line and warning),
  the result block of the previous answer, the quiz check row and the check bar keep what they showed before
  the press (a send of attempt 3 still reads "Попытка 3 из 3" and "Осталась 1 попытка").
- AC36, Enter and implicit submission (F15 "Keyboard path"; Requirements for #36, item 9): Enter on a radio or
  a checkbox sends nothing; a radio group is one Tab stop, each checkbox its own; arrow keys in a radio group
  move and check; in the review no question holds a Tab stop except an overflowing code block.
- AC37, failed attempt (F15.4, "Focus targets" row 5): with the learner not away the result block
  (`role="group" tabindex="-1"`, named by its title, described by its lines) takes focus and is inside the
  viewport after a press on "Отправить ответы" scrolled to the bottom; it reads "Верно C из Q. Нужно K." and
  the description of the limit form ("... после прохождения или после последней попытки." known, "... после
  прохождения." unknown); the answers stay selected and editable; the header shows the next attempt; nothing
  says which question is wrong and the response carries no `correct` or `explanation` (Requirements for #36,
  item 1); the result block has no `role="alert"`.
- AC38, review (F15.5, "Question block" review bullets): after a pass, or after the failure that closes the
  quiz (with a limit unknown only when the server reports the quiz closed), the questions become static
  lists (no input), each `h3` holds "Верно" or "Неверно" with its icon, each option shows "Ваш ответ" and
  "Верный ответ" where they apply, each with its own icon shape, and "Пояснение" (`h4`) with the explanation
  follows; the result block reads "Квиз пройден" with "Верно C из Q." or "Квиз не пройден: попытки исчерпаны"
  with "Верно C из Q. Нужно K.", then "Ниже верные ответы и пояснения."; "Отправить ответы", the attempt
  line, the summary and the send error are gone; a passed quiz takes no further attempt (P5); a `multiple`
  question answered with part of the set reads "Неверно".
- AC39, lesson line ("Lesson outcome after a send"): the result block adds "Урок пройден" or "Урок завершён:
  не пройден. Пройдено: N из M" as its last line only when the lesson status the server reports with the
  answer differs from the latest one this page view read (load, an earlier send, a run end, #69's re-read);
  when the check bar already shows summary 5 or 6 for it, no lesson line appears; a closing failure never
  reads "Урок пройден".
- AC40, check bar after a quiz send ("Check bar after a quiz send", P6-P8; `checks.md` B26): no quiz send
  sets a text in the check bar status line, in any row of that table; a pass or close after a summary 7 it
  makes untrue empties the line silently and keeps "Открыть результаты" (P7); a pass or close that reaches
  S3 leaves the line empty, gives "Проверить" `aria-disabled` "Проверки завершены", shows "Открыть
  результаты" and removes "К окружению" and "Переподключиться", with nothing announced from the check bar
  (P8); with focus on "К окружению" (Задание selected) such a send moves focus to "Проверить", never
  `body`; a failed attempt that does not close the quiz leaves the line and controls unchanged; the re-read
  baseline is unchanged.
- AC41, quiz check row ("Quiz check row in Проверки"): the status word is "Ответы не отправлялись" (muted,
  dotted ring), "Не пройдено", "Пройдено" or "Закрыта: не пройдено" (lock), never "Не запускалась", "В
  очереди", "Идёт" or a timeout or error word; the meta is only "Осталась 1 попытка" (limit known, one
  attempt left); the open panel holds the counter ("Неудачных попыток: N" or "... из M"), then "Пройти квиз"
  while an attempt can be made, no closed note and no action after a pass or close; "Пройти квиз" selects
  Квиз, writes `?tab=quiz` and focuses the panel heading; with Проверки selected, the row open and focus on
  "Пройти квиз", a pass removes it and focus moves to the quiz row's own button, never `body`. "Попыток пока
  нет. Нажмите "Проверить", когда будете готовы." shows under the rows only while every `command` check row
  reads "Не запускалась" and the quiz check row "Ответы не отправлялись" (`quiz.md` "Empty states"); after
  the first quiz send the server counts (failed, passed or closed) it is gone, so it never stands under
  "Неудачных попыток: N"; a send error, which counts nothing, leaves it as it was. From #35 that text is
  F19's first empty form under the h3 "История попыток" (AC62), and after the first answered send the
  history lists its record in its place (AC72).
- AC42, send error ("Error states", first bullet; "Focus targets" row 6): a failed send (network, server,
  timeout) with the learner not away focuses "Ответы не отправлены. Попробуйте снова.", right before
  "Отправить ответы", scrolled into view; the answers stay selected and editable; there is no "Повторить";
  a retry after a timeout the server recorded returns that result and counts no second attempt (client
  attempt id, Requirements for #36, item 6).
- AC43, refused send ("Error states", second bullet; "Check bar after a quiz send" refused rows): a send with
  a stale attempt number counts nothing and focuses a result block titled "Ответы не приняты: квиз
  изменился в другой вкладке."; with the quiz still open it follows with "Последний результат: Верно C из Q.
  Нужно K.", the new attempt line and the unsent selection kept, with no "Ответы остались выбранными" line;
  with the quiz now passed or closed the block keeps the refusal title and its warning icon, then the lines
  "Квиз пройден" or "Квиз не пройден: попытки исчерпаны", "Ниже верные ответы и пояснения." and last the
  lesson line by AC39, with no score line, and the review follows (closed drawn in
  `#state-quiz-refused-closed`; passed not drawn: the same block with "Квиз пройден" and the review of
  `#state-quiz-passed`); the check bar follows P7 or P8 by the current state and keeps its text
  and controls when it already showed summary 5 or 6; away, notice row 9, 10 or 11 instead.
- AC44, loading and load error ("Loading", "The load error", "Focus targets" rows 14-19): while the quiz is
  read the heading and the quiz load status container (empty) stay, the rest is Skeleton (`aria-hidden`), the
  panel has `aria-busy="true"`, nothing is announced and focus does not move; the load error is a
  destructive Alert "Не удалось загрузить квиз" with no role and no `tabindex`, its title an h3,
  `tabindex="-1"`, its "Повторить" `aria-describedby` the title; "Повторить" moves focus to the panel
  heading at once, focus stays there when the quiz loads, and moves to the h3 "Не удалось загрузить квиз" on
  a second failure while focus is still on the panel heading, in the panel or on `body`, the container left
  empty; otherwise focus stays and the quiz load status container gets "Не удалось загрузить квиз" once; a
  first load that fails with the panel shown (focus on the Квиз tab by click and by arrow key, on `body`,
  on the h2 after "Пройти квиз") moves no focus, the arrow keys on the tab keep working, and the container
  gets the text once after `aria-busy` is gone and no sooner than `QUIZ_LOAD_STATUS_MIN_AGE_MS` after the
  Квиз panel was shown (a first load that fails at once included); a failure with the panel not shown sets
  nothing; no notice is set for a load.
- AC45, prompt code block ("Question block", second bullet; design note N2, N8): a prompt `pre` has no
  "Копировать"; it has `tabindex="0"`, `role="group"` and `aria-label="Код к вопросу"` only while its lines
  overflow (at 320 and 375 px in `#state-quiz-code`, in Chromium with classic scrollbars and in WebKit with
  overlay scrollbars; none of them at 1280 px two-pane, where it fits in both), the focus ring inset on the `pre`; a
  resize that makes a focused block fit leaves focus on it until blur; the page never scrolls sideways.
- AC46, away ("Answer while the learner is away from the Квиз panel", the "Away" table): for each place of
  the Away table (another tab selected, one-pane "Окружение", the terminal, "Действия" after `F6`, the open
  "Действия" menu, the open user menu, "Продолжить работу", the open reset dialog, the split handle, the
  budget confirmation from #37 / #39, and with the panel not shown the check bar, the top bar and `body`) an
  answered send leaves focus where it was, applies the outcome (quiz state, quiz row, check bar), ends the
  lock, and the next showing of the panel shows the outcome (result block or send error, answers kept) with
  no further focus move; with the panel shown, a send answered while focus is in the panel, on the Квиз tab,
  a breadcrumb, the check bar, the top bar with no menu open or `body` focuses the outcome and sets no
  notice; for each outcome (failed, passed, closed, send error, refusal, the S3 corner).
- AC47, quiz notice (P9, "Quiz notice (P9)" "When", "Text, per outcome", "Markup and live region"): the
  container `role="status" aria-live="polite"` exists and is empty from load, after the F2.1 and F10.1
  containers; each away answer sets exactly one notice whose title equals one row of the notice table in
  Interactions; none for a not-away answer, a 401 or a load; the notice Alert has no role, and the
  container holds no `[role="alert"]` or `[role="status"]` descendant; while it is shown "Уведомления" is a
  `region` with its hidden heading; the check bar status line gets no text.
- AC48, notice removal ("Removal", "Removed while focused"; design note N10, N12): the notice is emptied
  silently when the Квиз panel becomes shown (the tab, the switch, `?tab=quiz`, "Пройти квиз", "Открыть
  квиз", a widening to two panes), when focus or a pointer press moves into the shown panel (Tab,
  Shift+Tab, `F6`, a press on a control, a `tabindex="-1"` target or text), and at the latest when
  "Отправить ответы" starts a send, so no notice stands beside a newer result; moving focus from the
  terminal to the check bar keeps it; with focus on "Открыть квиз", a mouse press on an option or on
  "Отправить ответы" moves focus to that control (the busy button), and a press on text or a widening moves
  it to the result block or send error, checked in Chromium (focuses clicked buttons) and in Safari (does
  not); never `body`.
- AC49, "Открыть квиз" and the notice keyboard path ("Открыть квиз", "Keyboard path" of the notice): it shows
  "Урок" in one-pane mode, selects Квиз, writes `?tab=quiz`, empties the container and focuses the result
  block, or the send error after a failed send; opening Квиз by its tab empties the container and moves no
  focus; Tab reaches "Открыть квиз" after "Войти снова" and "Продолжить работу"; `F6` to "Уведомления"
  lands on "Открыть квиз" when it is the region's only control.
- AC50, a second away answer ("Announced once, never twice"): it replaces the title text in the same
  container, never adds a second notice; an equal text is emptied and set again at least one rendered frame
  later; focus on "Открыть квиз" stays there.
- AC51, live containers and modals ("The notice stays audible while a menu or dialog is open", `ia.md` R2;
  design note N13): every live container of the page has an explicit `aria-live` matching its role; with
  the user menu open, and with "Сбросить рабочую папку?" open, when an away answer arrives, the quiz notice
  container and every ancestor carry no `aria-hidden` and a screen reader announces the notice; the F2.1 and
  F10.1 containers likewise keep no `aria-hidden`; the Квиз panel holds no live container but the quiz
  load status container; with the user menu open, and with "Сбросить рабочую папку?" open, a quiz load
  failure with the panel shown sets its text and it and every ancestor carry no `aria-hidden`.
- AC52, "Действия" modal ("Open menu or modal dialog"): "Действия" is built from `ui/dropdown-menu.tsx`
  without `modal={false}`; while it is open, Tab stays inside the menu and the rest of the page is
  `aria-hidden` except the live containers, as with the user menu.
- AC53, 3.3.4 (design note N5; F15.3): no send leaves the page while a question is unanswered; every answer
  can be reviewed and changed on the page until "Отправить ответы" is pressed; nothing but that button
  sends.
- AC54, session and restore ("Error states", session bullet; "Prototype and history requirements"): a 401
  on send or load shows the F2.1 alert and never the send error; "Войти снова" `next` carries `?tab=quiz`;
  the return opens Квиз with the answers chosen before (`sessionStorage`, keyed by lesson id, check id and
  attempt number), no message, no focus move; they are dropped when the attempt number differs or the quiz
  is passed or closed, and cleared after a successful send; switching tabs keeps unsent answers.
- AC55, history and load ("Prototype and history requirements", "Focus targets" last row): selecting Квиз,
  "Пройти квиз" and "Открыть квиз" replace `?tab=` with no history entry, so Back leaves the lesson page; a
  page load in any quiz state (first visit, return after a failed attempt, a pass or a close, restore after
  sign-in) moves no focus and sets no notice (a client load that fails after page load is announced by
  the quiz load status container, AC44).
- AC56, headless quiz run (design note §4, author item W2): the #70 quiz run (Chromium and WebKit) passes:
  every `#state-quiz-*` state at 1280x800, 375x667 and 320x640 in both themes (tab, panel content, header,
  result, quiz row, check bar, notice, live container attributes (`#quiz-load-status` included), focus, no
  sideways scroll, option labels
  at least 24 px), every rendered control clicked at 1280 and 375 px with Back and Forward after it, reload,
  `?tab=quiz` arrival and the F2 round trip, the send lock under Space and the arrow keys, the notice removal
  and "Открыть квиз" with Back; its only listed exceptions are Prototype, "Prototype limitations" items 1
  (the tab drop of "Проверить", "Перезапустить окружение", "Сбросить"), 2 (no notice after Back from a
  control inside the panel in the four notice states: the sweep expects the notice empty there) and 3
  (focus after Forward is the `data-focus-fallback` repair: the sweep asserts state and tab only).
  Every quiz UI string of the prototype matches a Copy row, and every Copy row is in the `ia.md` register.

Attempt history (#72). Each check names its release; "from #35" holds in every later release too.

- AC57, release (`ia.md` R6, "Progress by release (#72)"): before #35 the Проверки tab has no "История
  попыток" section, no history status container and no history "Повторить", `attempt` in the URL is
  ignored, and "Попыток пока нет. Нажмите "Проверить", когда будете готовы." is the tab's own empty state
  (`#state-checks-before`). From #35 the section is below the check list in every state of the Проверки
  tab, and no element of it shows a cost. From #37 the cost elements appear (AC67); from #39 the budget
  word (AC68).
- AC58, list (from #35, F19.1): the history lists every finished attempt of this lesson and user, newest
  first, no paging and no running attempt; `#state-history` shows exactly the seven attempts of the States
  table, in that order: the six disclosure buttons' accessible names ("№ 7" to "№ 3" and "№ 1", ". " joins,
  A72-19) and the plain item's text ("№ 2", AC60; unfocused it has no accessible name), with the
  icons `warning`, `destructive`, `warning`, `destructive`, `warning`, `warning`, `success`; the `ul` is
  labelled by the h3 "История попыток"; the `section` has no accessible name; the year shows only for a
  date of another year ("28 октября 2025, 13:30", but "28 октября, 13:30" in `#state-history-first`); each
  date is a `<time>` with the ISO value. From #36 the list holds quiz attempt records too (AC72).
- AC59, summary and icon (from #35, A72-6, A72-8): every row's summary counts its panel: M the results, N
  those reading "Пройдено", the note's N the results whose word contains "попытка не засчитана"; no
  result or only runner errors read "Сбой проверки, попытка не засчитана" (`warning`); all passed
  `success`; any result that neither passed nor says "попытка не засчитана" `destructive`; otherwise
  `warning`. Checked on "№ 1" to "№ 7" against their panels, and from #37 / #39 on the cost and budget
  forms of "№ 4" and "№ 5". "Проверок со сбоем: N" never appears on an attempt row.
- AC60, plain item (from #35, A72-14): "№ 2" is an `li` with `tabindex="-1"`, no button, not reached by Tab,
  its text "№ 2. 4 ноября, 13:50. Сбой проверки, попытка не засчитана" with the `warning` icon.
- AC61, panel (from #35, F19.2, F19.3): Enter, Space or a click toggles an attempt's panel and leaves focus
  on its button; the panel lists the results in `lesson.yaml` order, then removed checks by id in `code`
  with "Этой проверки больше нет в уроке" (`#state-history-open`: "№ 3", `cost-estimate`), each with its own
  word and #69's icon, its grader message verbatim, and for a runner error "Подробности" collapsed; a
  failure after a pass shows its own word ("№ 6": A "Не пройдено" while A's check row reads "Пройдено");
  no mentor review, no hint; a quiz result (from #36) as AC72.
- AC62, empty forms (from #35): with no finished attempt the h3 is followed by "Попыток пока нет. Нажмите
  "Проверить", когда будете готовы." (`#state-history-empty`) and no `ul`; once the first run makes
  "Проверить" `aria-disabled` ("Дождитесь окончания проверки" or "Результат проверки ещё не получен") by
  "Попыток пока нет" alone (`#state-history-empty-running`) until the re-read after that run returns; the
  first form stays while "Проверить" is disabled for an environment reason or after a refused start;
  neither change is announced or moves focus.
- AC63, attempt deep link (from #35): each row 1-10 of the "Attempt deep link" table in Interactions shows
  what it says and moves focus once, on load, to the target it names, at 1280 and 375 px (one-pane: area
  "Урок" in rows 1-6), each prototype state by the tester of its release (the "from #37" states of rows 1
  and 3 by the #37 tester, the others by the #35 tester); in rows 5-10 nothing is expanded and focus is
  not moved (row 9 and 10 by their own rules); a background re-read and "Повторить" never apply `attempt` again; `?tab=checks` with no `attempt`
  (a "Где трудно" row, `#state-checks-weak`) selects Проверки, expands nothing and moves no focus.
- AC64, error state (from #35, R2 row "lesson attempt history"): when the history cannot be read and the
  check state can, the h3 reads "История попыток недоступна" with "Повторить", the check rows and the check
  bar work as without it; "Повторить" that loads moves focus to the h3 "История попыток"
  (`#state-history-error` -> `#state-history`), one that fails again to the h3 "История попыток
  недоступна" (`#state-history-deep-link-error` -> `#state-history-error`); a run's end in the error state
  does not re-read the history; when the check state cannot be read there is no history section.
  A pointer press on "Повторить" that did not focus it (Safari) puts focus on it before the retry ends, so a
  failure always moves focus from "Повторить" to the error heading (`ia.md:323-353`). The closing focus move
  happens only while focus is still on "Повторить", on `body` or inside the history section, and its target is
  shown; otherwise focus stays where the learner put it and nothing is announced, because the error is
  unchanged on screen and a load that succeeds is page content (`ia.md:338-353`, retry focus guard).
- AC65, history status container (from #35): present and empty in every state that renders the section,
  never inserted with its text, `role="status"` with an explicit `aria-live="polite"` (`ia.md` R2); written
  exactly once per page view, with "История попыток недоступна", only when a re-read after a new record
  (a run's end; from #36 also an answered quiz send or a visibility re-read that finds a record) fails
  while the history was empty and the Проверки panel is shown, at least `CHECK_STATUS_TEXT_GAP_MS` after
  the check bar's end text (from #36: or after the quiz notice text, when one was set); focus on the h3 stays (the same
  element); "Повторить" that loads empties it silently; it stays empty on a load in the error state.
- AC66, run end (from #35): a run's end (B19, B14, B17, B9, B10) re-reads the history in the background
  outside the error state; the new attempt appears at the top, rows keep their expanded state, focus stays,
  nothing is announced by the history; a failed re-read of a list changes nothing; B11 does not re-read; a
  run that ends while "Повторить" is pending gets one more re-read after that request loads. From #36 the
  same holds for the re-read after an answered quiz send (AC72).
- AC67, cost (from #37): an attempt row shows "Потрачено: $N" (or "не меньше $N", "нет данных", ADR-0007
  item 11) only when the attempt holds anything that spends; an attempt of free checks only shows no cost;
  a panel item shows "Стоимость попытки: $N" only for a result that spends and reports one
  (`#state-history-cost-deep-link-4`: "Потрачено: $0.08", R1 and R2 "$0.04" each;
  `#state-history-cost-at-least-deep-link-4`: "не меньше $0.04", no line on R2;
  `#state-history-cost-no-data-deep-link-4`: "нет данных", no line on either); amounts with two decimals and
  a dot, rounded up once per figure.
- AC68, budget (from #39): a budget-spent result reads "Не пройдено: исчерпан бюджет $N" (`destructive`)
  with "Стоимость попытки: $N" in its panel, and its attempt row counts it in M and not in the note
  (`#state-history-cost-budget`: "№ 4. ... Пройдено проверок: 1 из 5. Потрачено: $2.04").
- AC69, keyboard (from #35): Tab reaches, after the last check row (or its open panel), "Повторить" in the
  error state, else each attempt's button newest first and inside an open panel its "Подробности", before
  the next attempt; Shift+Tab goes back; the plain item is skipped; `F6` lands as in the landing table in
  every #72 state of the release under test (the untagged rows of "States of the attempt history" from #35,
  the rows tagged "(from #37)" from #37, the one tagged "(from #39)" from #39, the two tagged "(from #36)"
  from #36 with #35); the deep-link focus target shows the inset `:focus-visible` ring.
- AC70, history copy (from #35): every string of the section and its panels is from the `ia.md` row
  "lesson, attempt history (F19; #72)", the sets "attempt summary", "cost", "check status" and, for a quiz
  result from #36, "Верно C из Q." of the set "quiz", or data
  (titles, ids, grader messages, raw errors, dates); the Copy table rows of the release under test equal
  the app strings (a row tagged "from #37" or "from #39", or that part of a row, is checked from that
  release; before it the string does not appear).
- AC71, history behaviour across states (from #35; each state from the release its row is tagged with):
  the design scripts of Accessibility notes, "Evidence", are local and not in the repository; the dev
  tester of each release asserts the same behaviour in the app, at 1280, 375 and 320 px, in the states of
  "States of the attempt history" that release ships: the #35 tester in the untagged rows
  (`history-empty` to `history-error` and `checks-weak`), the #37 tester also in the six rows tagged
  "(from #37)" (`history-cost`, `-cost-deep-link-4` .. `-7`, `-cost-deep-link-running`,
  `-cost-at-least-deep-link-4`, `-cost-no-data-deep-link-4`), the #39 tester also in
  `history-cost-budget`, the #36 tester (with #35 shipped) also in the two rows tagged "(from #36)"
  (`history-quiz`, `history-quiz-open`). In each: the selected tab, the h3 text, the empty text, the
  buttons' names, the plain item's text and the icons (AC58, AC59, AC60), the expanded row and its panel,
  focus on load (deep-link table), the history status container (Accessibility notes, F19), the `F6` cycle
  and AC13 with "Урок" shown, no horizontal scroll, and that no control changes the tab or the query except
  a tab, "Открыть результаты" and from #36 "Пройти квиз", `attempt` kept. Each of these breaks fails the app test: a deep-link focus target removed,
  a zero history text gap, a wrong row icon, the plain item without `tabindex="-1"`, "Повторить" focusing
  "Проверить", and the container written twice.
- AC72, quiz attempt record (from #36 with #35; `progress.md` A72-17, `quiz.md` "Requirements for #36"
  item 11): every answered quiz send (failed, passed or closing) adds exactly one record to the history,
  numbered "№ N" among the lesson's records by `started_at` (a running run keeps its number, so the list may
  skip it until it ends); a refused send and a repeated client attempt id add none. Its row reads "№ N", the
  date and time and "Пройдено проверок: 1 из 1" (`success`) or "... 0 из 1" (`destructive`), with no quiz
  line, no "Попытка A" and no cost (`#state-history-quiz`: "№ 9. 5 ноября, 15:22. Пройдено проверок: 0 из
  1" above "№ 7", while №8 runs). Its open panel lists one result: the quiz check's title, "Пройдено" or
  "Не пройдено" (never "Закрыта: не пройдено"), then "Верно C из Q." with C and Q of that send, never the
  sent answers, a verdict, "Нужно K.", a cost line or "Подробности" (`#state-history-quiz-open`: "Не
  пройдено", "Верно 4 из 6."). The record appears in the same render as the changed quiz check row, after
  the re-read that follows the answer, and never sets a check bar text or a run's end.

Retry feedback (#99). Each check names its release: the text load retry is FU14's (`ia.md:787-808`), the
quiz load status container #36's (`quiz.md` "Requirements for #36", item 9).

- AC73, text load "Повторить" (FU14; R2 row "lesson text load error"): "Повторить" that loads focuses the
  reloaded tab panel; one that fails again moves focus to the h2 "Не удалось загрузить текст урока"
  (`tabindex="-1"`, the Alert title), on the second and on every later failure; `<title>` unchanged in both
  outcomes (`#state-text-error-fails-again` -> `#state-text-error`). A retry that ends with its tab panel
  hidden (another tab selected, or one-pane mode showing "Окружение"), or with focus moved out of it (two
  panes, a click into the terminal; a Shift+Tab to the tab list), moves no focus. A pointer press on
  "Повторить" that did not focus it (Safari) puts focus on it before the retry ends, so a failure always moves
  focus from "Повторить" to the error heading (`ia.md:323-353`).
  The closing focus move happens only while focus is still on "Повторить", on `body` or inside the tab panel,
  and its target is shown; otherwise focus stays where the learner put it and nothing is announced, because
  the error is unchanged on screen and a load that succeeds is page content (`ia.md:338-353`, retry focus
  guard).
- AC74, quiz load status container (from #36; `ia.md` R2, `quiz.md` "The quiz load status container"):
  present and empty in every state that renders the Квиз panel, from the start of each load, inside
  `.quiz-intro` after the panel heading and before `.quiz-header`, never inserted with its text,
  `role="status"` with an explicit `aria-live="polite"` (`ia.md` R2), no `[role="alert"]` or
  `[role="status"]` descendant; written once per failed load, with "Не удалось загрузить квиз", only when a
  load fails with the Квиз panel shown and no focus move announces it, after `aria-busy` is gone, at least
  `CHECK_STATUS_TEXT_GAP_MS` after a check bar text set less than the gap before, and no sooner than
  `QUIZ_LOAD_STATUS_MIN_AGE_MS` (100 ms) after the Квиз panel and the container were mounted; a first load
  that fails at once (a stubbed response that fails without delay), started by activating the Квиз tab from
  another tab, sets the text no sooner than that age after the mount, and exactly once; the test fails if
  the delay is removed. A write still waiting is dropped when "Повторить" starts a new load or the Квиз
  panel is hidden before it, so no text arrives then. A press on "Повторить" empties it silently; a
  "Повторить" whose failure moves focus to the h3 leaves it empty; no load sets the quiz notice. The
  guard treats focus on `#panel-quiz` itself as inside the panel (`panel.contains(document.activeElement)`).
  Prototype: `#state-quiz-loading`, then `window.proto.setState("quiz-load-error")` right after the panel
  was shown, sets the text about 100 ms after the showing (measured headless at 1280 and 375 px, both from
  the Квиз tab and from the one-pane switch); the Квиз panel hidden before the write leaves it empty, and an
  arrival by URL at `#state-quiz-load-error` leaves it empty.
- AC75, Теория and Задание code blocks (#136, app side FU17; README "Scrollable code", `lesson-environment.md`
  "Code blocks that scroll"): in `#state-theory` the "Локальные модели" `pre` has `tabindex="0"`,
  `role="group"` and `aria-label="Блок кода"` at 320 and 375 px, where its lines overflow, and none of the
  three at 1280 px two-pane, where they fit; Tab from its "Копировать" reaches the `pre` at 320 px and goes
  past it at 1280 px; ArrowRight on the focused `pre` changes its `scrollLeft` (the arrow key scrolls
  smoothly: `scrollLeft` read at once is still 0, so the check waits for the scroll to settle, in the
  prototype 40 after about 800 ms); Shift+Tab returns to "Копировать"; a resize to 1280 px with focus on
  the `pre` leaves focus and the attributes on it until Tab, then all three are gone; its focus ring is
  inset (`outline-offset` -2px), corners `0 0 7px 7px`; the page never scrolls sideways (`scrollWidth`
  equals the viewport width). A Задание block takes the same rule through the same renderer; the
  prototype's Задание has no code block, so the app test checks it. Prototype: measured headless in
  Chromium with classic scrollbars (Playwright's default `--hide-scrollbars` dropped and
  `--disable-features=OverlayScrollbar,OverlayScrollbars` on macOS) and in WebKit (overlay scrollbars) at 320, 375 and
  1280 px, numbers per engine in States (`#state-theory`); headless WebKit does not scroll a focused `pre`
  with arrow keys and leaves buttons out of the Tab order by default, so the `scrollLeft` and Shift+Tab
  checks are Chromium's.
- AC76, several courses (from #220; `ia.md` A218-3, A218-7, A218-8, "Rules (#218)" rows "course crumb landing"
  and "course of each control"; `courses.md` F22): the top bar is "Академия", "Главная" and the user menu, no
  "Курс", `aria-current` on neither link; the breadcrumb reads course name / module title / lesson title,
  the lesson crumb `aria-current="page"`; the course crumb opens `/courses/<courseId>` and the module crumb
  `/courses/<courseId>#<moduleId>`, both of the URL's course; `F6` to "Урок" lands on the course crumb in
  two panes and full width, and on the switch tab "Урок" in one-pane mode, with the course crumb the next
  Tab; a 120-character course name wraps inside the crumb and the root's `scrollWidth` equals its
  `clientWidth` at 320 px and at 1280 px with 200 % zoom. Prototype, measured 2026-11-24 headless in
  Chromium (Playwright 1.64.1, a fresh context per state): all 124 states, 123 with the A218-3 bar and
  `#crumb-course` "ИИ для разработчиков" (`a#crumb-course` the only element with that id in each state, no
  duplicate id in any state), `#state-m0` with "Курс" in the bar and the crumb; `F6` landings in
  `#state-theory` at 1280, 375 and 320 px, `#state-no-workspace` at 1280 and 375 px, `#state-one-pane-env`
  at 375 and 320 px; the long name in `#state-theory`, `#state-no-workspace` and `#state-one-pane-env`
  (Урок shown) at 320x800 and 640x400 at device scale 2, light and dark: 4 lines at 320 px, 2 at 640 px,
  `nav.breadcrumb` `scrollWidth` equal to its `clientWidth`.

## Open questions

1. **Check kind in the check row:** answered (#69): hidden in v1 by Stepan's decision; the label set
   "команда", "квиз", "оценка ментора", "скрытая задача", "поиск багов" is registered in `ia.md` for the
   release that lists a second kind, whose DESIGN task decides how the row shows it.
2. **Copy denial echo** (AC14) is unverified in a real screen reader; if it fails, the options are a
   change to R2 (one more live container) or moving focus to the code block. Design decision, not dev.
   The second option is FU19's (`ia.md` "Open follow-ups"), and it must also name a block that fits,
   which under README "Scrollable code" has no name.
3. **Accessible names "Навигация", "Область" and "Разделы урока":** closed (#69): registered in `ia.md`,
   page copy "lesson, accessible names (#69)".
4. **Loading state** of the lesson text (Skeleton) is not a flow step; if #30 loads tab text separately, a
   skeleton state should be added to F7.
5. **Back focus into a dialog state:** closed (#69). proto.js now focuses the dialog's `[autofocus]`
   "Отмена" on Back to `#state-reset-dialog`, `#state-budget-dialog` and `#state-budget-dialog-one`.
6. **Check bar status at 320 px:** closed (#69). `.check-bar-status` keeps its content width, so the status
   wraps onto its own line in `#state-stream-lost`; `scrollWidth` 320 in every state (AC1).
7. **Prototype notes, no action needed for dev:** `window.proto.setState` treats an equal status text of
   another state as the B9 re-set, so the silent equal-text changes B20 and B22 after a run are shown with
   a typed `#state-` hash; Back to `#state-idle-warning` cannot refocus "Продолжить работу", because the
   live container clones it anew, so focus stays where "Продолжить работу" had put it.
8. **System pieces the attempt history composes (#72):** closed. The attempt row, the plain item and the
   attempt panel's result list are system compositions (`proto.css` "Composition: attempt row and attempt
   panel"), and the field joint is `.sr-only-inline`, which adds no space to a name from content. The
   history status container's timing (one text gap after the check bar's end text) stays page script; it
   reads the gap from `window.proto.statusTextGapMs`. A quiz result's "Верно C из Q." is a `p.text-sm` in
   the result `li` (from #36), drawn with the composition's existing spacing.
9. **Questions handed to other tasks (`ia.md` FU13, numbered FU9 before the merge with #70), still open on
   `main`:** Q1 (#69, what the Проверки tab shows when the check state cannot be read; deep link row 6 waits
   for it), Q4 (#69, #39, the word of a budget-spent result reported not counted; until then it is left out
   of the summary note), Q5 (#69, the tab's own empty text during the first run before #35, open for a
   lesson without a quiz; #70 answered it for a lesson with one), Q6 (#36's tester, the accepted double
   announcement of a quiz send answered during a run). Q2 and Q3 were answered at the merge with #70
   (`progress.md` A72-17) and are drawn in `#state-history-quiz` and `#state-history-quiz-open`. The
   meantime rules of `progress.md` apply; none blocks this page.
10. **Quiz follow-ups (#70, `ia.md` "Open follow-ups"), none blocking these notes:** FU7 (the lesson status
    when a quiz closes, an ADR decision that blocks #36; the page shows what the server reports, AC39); FU8
    ("Проверить" when every `command` check is closed and the quiz is open: not drawn, the reason is the
    checks design's); FU11 (explicit `aria-live` and no live role inside a container in the app's
    `notifications.tsx`, AC51).
11. **Code block follow-ups (#136, `ia.md` "Open follow-ups"), none blocking these notes:** FU17 (the app side
    of "Scrollable code", AC75 and AC45); FU18 (keyboard scrolling of wide prose tables, `.prose .table-wrap`);
    FU19 (the keyboard way to take the text after a copy denial, Open question 2).
