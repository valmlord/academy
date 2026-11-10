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
  hash) stays.

While the course cannot be read, `<title>` and h1 are "Не удалось загрузить курс" (HTTP 200), whatever
course and lesson ids the URL names: without the course the page cannot tell a hidden lesson from a real
one (F7 error states). The not-found page (`design/pages/not-found/`, HTTP 404; `ia.md` page inventory,
not-found Route) is what a lesson URL whose course id is not the course's, or a lesson URL whose lesson id
names no `ready` lesson of the course, opens.

Dev issues: #30 (M0 lesson), #31 and #32 (environment, terminal), #34 (check bar and Проверки, v1 lesson),
#36 (the Квиз tab, F15; blocked by #34, `quiz.md` P4).

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
without the `quiz-` prefix draws this release.

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
4. Drawn nowhere, tested in the app only: a mouse-only send in Safari and in Firefox on macOS (focus on
   `body` before the press, then the busy button, then the result block or send error, no notice); an away
   answer with a menu or a dialog open (the prototype's native `dialog.showModal()` makes the page inert,
   which no attribute exempts, `quiz.md` "Away"); a second away answer replacing the notice text; the
   transition from `#state-quiz-loading` to the loaded quiz (AC35, AC51, AC50, AC44).
5. `quiz.md` outcomes not drawn, each specified by its AC: the refusal that finds the quiz passed (AC43;
   `#state-quiz-refused-closed` draws the closed one); a refusal or a send that changes the lesson status
   (its lesson line, AC39, AC43); a pass with no lesson line (the lesson status unchanged, AC39); a pass that
   finishes the lesson not passed (S3, AC39, AC40); the close with the limit unknown (AC38); the check bar
   rows of "Check bar after a quiz send" other than empty, P7 and P8 (a run going, summary 4, summary 7 left
   true, the line at 5 or 6 with a refusal: AC40, AC43); a 401 on load (AC54); "Повторить" failing again
   (AC44).

Limit known and limit unknown are both drawn (Stepan's decision B0, `ia.md` R7): the states marked "limit
known (from #68)" show "из M" and the last-attempt warning; every other state shows the counter without
"из M", as the app does while the server reports no limit.

Prose is course data, not UI copy: it is rendered from markdown and is not in the Copy table. theory.md's
leading h1 equals the lesson title and is dropped (the page has one h1); any other `#` and its `##` are h2,
its `###` h3 and its `####`-`######` h4. task.md's h1 becomes an h2, its `##` h3 and its `###`-`######` h4.
The h4 is set as `.prose h4` in `design/system/proto.css` (AC20), as in the app's heading map.

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
| F15.1 | the quiz header ("Нужно 5 из 6", the attempt line, the last-attempt warning) | every `#state-quiz-*` state with questions; the warning in `#state-quiz-last-attempt`, `-notice-two-pane`, `-refused`, `-sending-last`, `-sending-refused` (from #36) |
| F15.2 | the radio group of question 1 | `#state-quiz`, `#state-quiz-partial` and every state with inputs (from #36) |
| F15.3 | "Отправить ответы" | `#state-quiz`; blocked in `#state-quiz-blocked`; busy in `#state-quiz-sending`, `-sending-failed`, `-sending-last`, `-sending-refused`, `-sending-limit-unknown` (from #36) |
| F15.4 | the failed result block "Верно 4 из 6. Нужно 5." | `#state-quiz-failed`; also `#state-quiz-last-attempt`, `-limit-unknown` (from #36) |
| F15.5 | the passed result block "Квиз пройден" (the review follows it) | `#state-quiz-passed`; closed review in `#state-quiz-closed` (from #36) |
| F15.6 | the quiz check row "Закрыта: не пройдено" | `#state-quiz-row-closed`, `#state-quiz-closed`, `#state-quiz-refused-closed` (from #36) |

F13.6 (mentor, D3) is not drawn: no mentor or hint control in any state (R6). Before #36 no quiz control
either; from #36 the quiz controls of F15 are drawn only in the `#state-quiz-*` states, and "Разобрать с
ментором" in the closed quiz block is not drawn until #37 (R6, `quiz.md` "Release scope").

## Status

Status: ready

## Purpose

One route for reading and practising a lesson: theory and task on the left (F7), the environment with its
terminal on the right (F8-F11), the check bar under the left pane (F13 v1, `command` checks) with attempt
limits and closed checks (F14, `checks.md`), and from #36 the quiz in the Квиз tab (F15, `quiz.md`). Three
release states: the M0 lesson (#30 alone), the v1 lesson (#31, #32, #34 shipped, with the ADR-0007 amendment
the #69 design asks for), and from #36 the lesson with its quiz (no "quiz before checks" release, `quiz.md`
P4). Limit known needs #68 reported by the server; checks that spend tokens and the budget confirmation are
drawn for #37 / #39.

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
  except wide tables and code blocks inside their own wrappers (checked: `scrollWidth` 320 at 320 px in
  every state checked, and 375 at 375 px).
- **400 % zoom (1280x800 at 400 % = 320x200 CSS px):** below `30rem` of height the page scrolls as one
  document (`proto.css`), so the check bar is a block after the left pane, not pinned (see Accessibility
  notes, 2.4.11).
- **M0 lesson and a lesson without `workspace`:** region "Урок" alone, full width at every width, no switch,
  no handle (`data-environment="none"`).
- Top bar below 480 px: as in `proto.css` (the email truncates at `6rem`; at 320 px the user menu moves
  to a second row, right-aligned). The page adds no top bar override.
- **Квиз panel (from #36; `quiz.md` "Narrow widths and zoom"):** in "Урок" at every width; in one-pane mode
  (below 1024 px, down to 320 px, and 1280 px at 200 % zoom) at the pane's full width. Options wrap under
  their control (`.choice-text` wraps anywhere, so long inline code never widens the page); only a prompt's
  code block scrolls sideways, inside itself; every option label is at least 24 px high (WCAG 2.5.8).

## Components

| shadcn | Usage |
|--------|-------|
| Button | course error "Повторить" (secondary, sm); "Проверить" (default; `aria-disabled` variants), "К окружению" (outline), the check bar's "Переподключиться" (outline, in the place of "К окружению"), "Открыть результаты" (ghost), status actions (default sm), "Подробности" (ghost sm, in the status bar and in a check row panel), "Действия" (outline sm), "Копировать" (ghost sm), "Сбросить" (destructive), "Запустить" (default, budget confirmation), "Отмена" (outline), "Показать все" (link). From #36: "Отправить ответы" (default; busy variant `aria-busy` plus `aria-disabled`, Spinner, "Отправляем..."), "Пройти квиз" (outline sm, after the counter in the quiz check row panel), "Открыть квиз" (default sm, in the quiz notice), the quiz load error's "Повторить" (secondary sm) |
| Alert | session expired (destructive) and idle warning (default) in "Уведомления"; prerequisite (warning); text load error (destructive); course load error (destructive, static, its title is the h1, as on the catalog). From #36: the quiz notice in "Уведомления" (default, info icon, sm "Открыть квиз", the idle warning's composition, no role of its own); the quiz load error (destructive, plain: no role, no `tabindex`); the result block, the error summary (destructive, with `ul.alert-links`) and the send error (destructive) as focusable messages (`role="group" tabindex="-1" aria-labelledby` the title, `aria-describedby` the lines), never `role="alert"`: the app's `Alert` renders `role="alert"` by default (`ui/alert.tsx:36`) and is overridden as sign-in and `notifications.tsx:57-58` do |
| DropdownMenu | user menu; "Действия" with two items, their `aria-disabled` variants with a reason line, and the checkbox item "Режим для экранного диктора". **"Действия" is built modal**, as the user menu is: from `apps/web/components/ui/dropdown-menu.tsx` without `modal={false}` (Radix `DropdownMenu` defaults to `modal = true`: focus trap and `hideOthers`). The quiz "Away" rule rests on it (`quiz.md` "Away"); a non-modal "Действия" needs that table re-read in a DESIGN task |
| RadioGroup, Checkbox (from #36) | the quiz groups: `role="radiogroup"` for `single`, `role="group"` of checkboxes for `multiple`, each named by its question `h3` and described by the prompt, the note and the error (`.choice-group`, `label.choice`); boundaries on `--input`, never `--border` (`design/system/README.md`); the locked look while sending |
| Breadcrumb | "Курс" / module / lesson (`aria-current="page"`); not shown when the course cannot be read |
| Tabs | left pane (Теория, Задание, Проверки; Квиз from #36), environment (Терминал), one-pane switch (`.pane-switch`) |
| Badge | lesson type "артефакт" (outline) |
| Collapsible | outcomes, check rows, "Подробности" (status bar F8 and runner-error check row F13: the same ghost sm trigger controlling one `pre.error-details`, collapsed by default) |
| Resizable | the split handle |
| ScrollArea | each pane |
| AlertDialog | "Сбросить рабочую папку?" (destructive action "Сбросить"); the budget confirmation "Потратить до $N с вашего ключа API?" (from #37 / #39; default action "Запустить", the checks in `.alert-dialog-list` after the description, both named by `aria-describedby`) |
| Spinner | creating / starting, running check; the busy "Отправляем..." (from #36) |
| Skeleton | the quiz loading state (from #36): the blocks after the panel heading, `aria-hidden="true"` |
| Kbd | the key hint |
| Tooltip | the split handle |
| Separator | menu separators |

Compositions: top bar, "Уведомления", environment status bar, check bar, check row, prose (`.prose`,
`.table-wrap`, `.code-block`, `.toc`), terminal frame. Status icons (`.status-icon`) carry shape plus word;
a closed check is `data-status="closed"` (the lock, drawn by CSS on the empty `aria-hidden` span; the app
uses lucide `Lock`). Check row (`design/system/README.md`, "Check row"): the meta holds the in-row running
time `span.check-row-time` (no role), "лимит M:SS" and the last-attempt warning `[data-tone="warning"]`;
the panel holds the notes, the grader message, "Подробности", the cost and the counter, in that order.
No v1 state of this page draws a loading skeleton: the text loads with the route (Open questions); from #36
the quiz loading state does, only when #36 loads the quiz on the client. Quiz compositions (from #36,
`design/system/README.md` "Quiz panel"): `.quiz` (`.quiz-intro` with the `h2` and `.quiz-header`), the
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
| `../catalog/prototype.html#state-course-error` (the course cannot be read; F7 error states) | that composition inside `main`: only the destructive static Alert "Не удалось загрузить курс" (its title is the h1, `tabindex="-1"`) with "Повторить". It differs from the drawn catalog prototype state in three things only: `<title>` "Не удалось загрузить курс" (the catalog app sets the same `<title>`; the static catalog prototype keeps the course title); no `aria-current` on "Курс" or "Главная" (the catalog marks "Курс"); "Повторить" targets as in Interactions and keyboard (the course error retry bullet). "Курс" is left out while the course id is unknown, only when `course.yaml` itself cannot be read (ia.md R6, "Course id unknown") |
| `#state-theory` | default v1 lesson; running environment with the key hint |
| `#state-task` | Задание tab |
| `#state-outcomes-collapsed` / `#state-outcomes-expanded` | three outcomes: first one plus "Показать все" / all three plus "Свернуть". The list collapses only with **more than two** outcomes (`lesson-environment.md` F7.1): one outcome, as in this lesson, or two show in full with no button |
| `#state-text-error` | Теория panel: "Не удалось загрузить текст урока" with "Повторить"; Задание and the environment stay usable |
| `#state-copy-denied` | the code block button reads "Не скопировано, выделите текст вручную" |
| `#state-no-theory` | no Теория tab; opens on Задание |
| `#state-no-sources` | no "Источники" block |
| `#state-prerequisite` | F6.2 warning Alert above the tabs |
| `#state-session-expired` | F2.1 in "Уведомления" |
| `#state-user-menu` | F3.1 menu open |
| `#state-m0` | M0 lesson: "Урок" only, full width, Теория and Задание, the M0 line; no check bar, no Проверки, no "Окружение" |
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
| `#state-checks-before` | Проверки: the row "Не запускалась" and "Попыток пока нет. Нажмите "Проверить", когда будете готовы." |
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

**From #36: the quiz states** (`quiz.md` F15; the design note's state list). Unless stated: tab Квиз selected
(the tab list then reads Теория, Задание, Проверки, Квиз), one-pane mode shows "Урок", the environment runs,
the check bar is before any run (status line empty, "Проверить" enabled), Проверки lists the `command` check
"Не запускалась" and the quiz check row, "Уведомления" is empty, and the limit is known (3). Under the rows
Проверки shows "Попыток пока нет. Нажмите "Проверить", когда будете готовы." only in the states whose quiz
row reads "Ответы не отправлялись" (`#state-quiz`, `#state-quiz-loading`, `-partial`, `-blocked`, `-blocked-one`,
`-sending`, `-row`, `-send-error`, `-load-error`, `-session-expired`, `-restored`, `-code`,
`-notice-send-error`); every other quiz state shows no text there (`quiz.md` "Empty states", AC41).

| Anchor | What it shows |
|--------|---------------|
| `#state-quiz-loading` | the panel heading (the check `title`) stays; everything after it is six Skeleton blocks (`aria-hidden`); the panel has `aria-busy="true"`; no focus move. Only when #36 loads the quiz on the client |
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
| `#state-quiz-load-error` | under the heading only the plain destructive Alert "Не удалось загрузить квиз" with "Повторить" (described by the Alert title); no focus move |
| `#state-quiz-session-expired` | F2.1 "Сессия закончилась. Файлы в рабочей папке сохранены." in "Уведомления" over `#state-quiz-partial`; "Войти снова" `next` carries `?tab=quiz`; no send error |
| `#state-quiz-restored` | after sign-in, arrival with `?tab=quiz`: the answers of `#state-quiz-partial` back, no alert, no message, no focus move |
| `#state-quiz-limit-unknown` | after one failure with no limit reported (R7): header "Попытка 2", no warning; "Ответы остались выбранными. Какие из них неверны, квиз покажет после прохождения."; quiz row "Неудачных попыток: 1" (no "из M") |
| `#state-quiz-code` | sample data, lesson 05 (header "Нужно 6 из 8", "Попытка 1 из 3"), one question "Вопрос 2 из 8" whose prompt holds a directory tree: where its lines overflow (320 px) the `pre` takes `tabindex="0"`, `role="group"`, `aria-label="Код к вопросу"` and scrolls inside itself; where they fit it has none of them (decided by script on load and resize) |
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
  | two panes, running, starting, slow, API key, reconnecting, reset done, after a run | "Академия" | no stop | "Курс" | "Проверить" | "Действия" |
  | two panes, every #69 state without a dialog: limit known, last attempt, closed (both), mixed, runs (own, attached, with a closed check, spending tokens), sticky pass, runner error, stream lost, stream failed, tokens before a run and after it, nothing to run | "Академия" | no stop | "Курс" | "Проверить" (enabled, or `aria-disabled` with its reason) | "Действия" |
  | budget confirmation open (either) | the cycle is off: `F6` and Shift+`F6` leave focus where it is in the dialog | | | | |
  | session expired | "Академия" | "Войти снова" | "Курс" | "Проверить" | "Действия" |
  | idle warning | "Академия" | "Продолжить работу" | "Курс" | "Проверить" | "Действия" |
  | from #36: quiz notice only (`#state-quiz-answered-away`, `-notice-env`, `-notice-send-error`, `-notice-two-pane`); with the session alert or the idle warning beside it, the two rows above | "Академия" | "Открыть квиз" | "Курс" | "Проверить" | "Действия" |
  | from #36: every other quiz state | "Академия" | no stop ("Войти снова" in `#state-quiz-session-expired`) | "Курс" | "Проверить" (enabled, or `aria-disabled` "Проверки завершены" in `#state-quiz-closed-finished`, `-notice-env`) | "Действия" |
  | Docker not running, image missing | "Академия" | no stop | "Курс" | "Проверить" | "Повторить" |
  | stopped, limits, after a run with the environment stopped | "Академия" | no stop | "Курс" | "Проверить" | "Запустить снова" |
  | rejected | "Академия" | no stop | "Курс" | "Проверить" | "Открыть курс" |
  | reconnect failed / shell exited | "Академия" | no stop | "Курс" | "Проверить" | "Переподключиться" / "Открыть новый сеанс" |
  | M0 lesson | "Академия" | no stop | "Курс" | no stop | no stop |
  | no `workspace` | "Академия" | no stop | "Курс" | "Проверить" | no stop |
  | no check the platform runs | "Академия" | no stop | "Курс" | no stop | "Действия" |
  | course cannot be read | "Академия" | "Войти снова" with the session alert, else no stop | no stop | no stop | no stop |
  | one-pane mode, any state | "Академия" | as above | switch tab "Урок" (pane shown) | "Проверить" | switch tab "Окружение" (pane shown) |

  "Курс" in the Урок column is the breadcrumb "Курс", not the top-bar link. With the course unreadable,
  `main` is the `F6` stop and lands on "Повторить". That row is the catalog's `#state-course-error` cycle,
  checked there, not in this prototype. The cycle is off while either AlertDialog is open. From the split
  handle (no region) `F6` goes to the next region in DOM order ("Окружение").
- **Tab order (R4):** with the course read: "К содержимому"; top bar; "Уведомления" when non-empty
  ("Войти снова", "Продолжить работу", from #36 "Открыть квиз", in container order); "Урок"
  ([switch] "Курс", module crumb, "Показать все", prerequisite link, the tab list (one stop), the tab panel,
  in Проверки each row button and, inside an open runner-error row, its "Подробности", inside the open quiz
  check row "Пройти квиз"; in Квиз the order of "Квиз (from #36)" below);
  "Проверка" ("Проверить", then "К окружению" or "Переподключиться", then "Открыть результаты"; the two in
  the middle never show together, `checks.md` F13 keyboard path); the split handle (two panes); "Окружение"
  ([switch] status action, "Подробности", "Действия", tab "Терминал", terminal). Course cannot be read:
  "К содержимому"; top bar; "Уведомления" when non-empty; "Повторить".
- **Course error "Повторить":** reloads the page (`ia.md` R2, page-level retry table): focus on the lesson
  h1 with `<title>` the lesson title on success; the error h1 with `<title>` "Не удалось загрузить курс" on
  a second failure; the not-found h1 with `<title>` "Страница не найдена" when the course loads but the URL
  is a way into the not-found page (`ia.md` page inventory, not-found Route).
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
  "Проверить" itself: no "Повторить" in the check bar or the rows (S7).
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
  focus goes to the R3 landing of the shown pane's region: the breadcrumb "Курс" with two panes, the switch
  tab "Урок" in one-pane mode with "Урок" shown, the switch tab "Окружение" in one-pane mode with "Окружение"
  shown. The shown pane does not change. If the return target is gone or no longer focusable when the
  warning closes, focus goes where R2 "Focus after a background change" sends it for the place that element
  was in: in the Квиз panel the result block, or the send error after a failed send (from #36: an answer
  replaced the busy button or the options with the review); in an open check row panel that row's own
  button; in "Проверка" "Проверить" (P8 removed "К окружению" or "Переподключиться"); in "Окружение" its R3
  landing for the new state; anywhere else the R3 landing of the shown pane. Never `body`; an
  `aria-disabled` target keeps focus. The prototype always takes the "there was none" branch: the button
  carries `data-keep-pane` (the theory state it goes to keeps the pane the learner had) and focuses the
  switch tab of the shown pane, or "Курс" with two panes.
- **Text load "Повторить":** focus moves to the reloaded tab panel (R2).
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
    Safari and Firefox on macOS). Every option control and every group gets `aria-disabled="true"`, never
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
    | any answer or retry while the learner is away | none; the notice announces a send's outcome, unless the answer removes the focused element (next row) |
    | a background change removes the focused element or the "Продолжить работу" return target | `ia.md` R2 "Focus after a background change": in the Квиз panel the result block or send error; in an open check row panel that row's button; in "Проверка" "Проверить"; in "Окружение" its R3 landing; in "Уведомления" the idle stop's "Запустить снова" (or the switch tab "Окружение" in one-pane mode with "Урок" shown), the quiz notice by its own rule; else the R3 landing of the shown pane |
    | "Открыть квиз" | the result block, or the send error after a failed send |
    | the notice removed while focus is in it (read at `pointerdown`), by a press on a focusable element of the panel (an option, a summary link, "Отправить ответы", an overflowing code block, or a `tabindex="-1"` heading, result block, send error, summary) | that element, by script ("Отправить ответы": the busy button) |
    | the notice removed while focus is in it, any other trigger (the panel shown without a focus move, a press on text) | the result block or the send error ("Открыть квиз"'s target) |
    | focus enters the shown panel while the notice is shown | where the learner moved it; the notice goes |
    | "Пройти квиз" | the panel heading `h2` |
    | load error "Повторить" | the panel heading, at once (the loading state replaced the error); it stays there when the quiz loads; "Повторить" itself when it fails again and the learner is not away |
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
    | `body` (a Safari or Firefox mouse learner, a click on page background) | not away | away |

    An answer while away is applied in full (the quiz state takes the outcome, the quiz check row is
    re-read silently, the check bar follows P6-P8, the lock and busy state end); focus does not move, except
    when the answer removes the focused element ("К окружению" or "Переподключиться" in S3 to "Проверить";
    "Пройти квиз" after a pass or close to the quiz row's own button). The next showing of the panel (the Квиз
    tab, the switch back to "Урок", `?tab=quiz`, "Пройти квиз") shows the outcome as a return visit does and
    moves no focus beyond what that control does. A load or retry answered while away announces nothing, and
    an outcome found on a later page load gets no notice.
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
    panel heading at once and stays there when the quiz loads; on a second failure the error returns and
    focus moves to its "Повторить", which reads "Повторить, Не удалось загрузить квиз" (`aria-describedby`
    the Alert title), unless the learner is away. That the second failure happened is not announced (FU6).
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
- **Cross-page destinations (design "Controls and their v1 destinations"):**

  | Control | App destination | Prototype link |
  |---------|-----------------|----------------|
  | "Войти снова" (F2.1) | `/sign-in?next=<current path with the current ?tab=, URL-encoded>` | `../sign-in/prototype.html?next=<encoded app path with the current ?tab=>#state-with-next`, rewritten on every tab selection |
  | "Выйти" (F3.2) | sign out, then `/sign-in`, which shows "Вы вышли" (F3.3) | `../sign-in/prototype.html#state-signed-out` |
  | breadcrumb "Курс", top bar "Курс", "Открыть курс" | `/courses/[courseId]`; top bar "Курс" not while the course id is unknown (ia.md R6, "Course id unknown"); the breadcrumb and "Открыть курс" are not rendered while the course cannot be read | `../catalog/prototype.html` |
  | breadcrumb module | `/courses/[courseId]#<moduleId>` (`ia.md`, A6; module 00 is `introduction`) | `../catalog/prototype.html#introduction` |
  | "Академия", "Главная" | `/` | `../dashboard/prototype.html` |
  | prerequisite lesson link (F6.3) | `/courses/[courseId]/lessons/[lessonId]` of that lesson | `prototype.html` |
  | source links | the source URL, same tab | the source URL |

## Copy

| Key | Russian text |
|-----|--------------|
| skip link | К содержимому |
| brand | Академия |
| nav | Главная |
| nav | Курс (not while the course id is unknown, ia.md R6 "Course id unknown") |
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
| breadcrumb | Курс / <module title> / <lesson title> (not shown when the course cannot be read) |
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
| checks empty | Попыток пока нет. Нажмите "Проверить", когда будете готовы. |
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
| quiz load error (from #36) | Не удалось загрузить квиз / Повторить |
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
Every string above is in the `ia.md` register (closed sets, page copy "lesson, accessible names (#69)" and
"lesson, checks (#69)", action labels); the quiz strings in the closed sets "quiz (D2; designed in #70)",
"check status", "check row meta", "check row note" and "page alert" (the quiz notice), the page copy row
"lesson, quiz (F15; #70, from #36)" and the action labels "take the quiz" and "open the quiz outcome from the
quiz notice". The letters A, C, I, K, Q, U have one meaning each (`quiz.md` "Placeholders"), and every
number comes from the server; the page never computes K. Prompts, options and explanations (including
"Выберите все верные.") are quiz content, data, not copy.

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
- **R2, live containers, all present from load:** in "Уведомления" one `role="alert"` (F2.1) and one
  `role="status"` (F10.1), and from #36, on a lesson with a quiz check, a second `role="status"` after them,
  the quiz notice container (F15, P9); the environment status text (`role="status"`, changes only on a
  status change, notes appended inside it); the check bar status line (`role="status"`). **Every live
  container carries an explicit `aria-live` matching its role** (`aria-live="assertive"` with
  `role="alert"`, `aria-live="polite"` with `role="status"`; the prototype: `page-alert`, `page-status`,
  `quiz-notice`, `check-status`, `env-status`), because an open modal menu or dialog (Radix `hideOthers`,
  `aria-hidden` 1.2.6) sets `aria-hidden` on the rest of the page and spares only `[aria-live]` nodes and
  their ancestors; without it the quiz notice, the idle warning and the F2.1 alert set while "Действия", the
  user menu or the reset dialog is open would be announced nowhere (`quiz.md` "Away"; FU11 for the app's
  `notifications.tsx`). **The container is the only live element:** nothing inside one carries
  `role="alert"` or `role="status"` (the F2.1, F10.1 and quiz notice Alerts render with no role; the app
  passes `role={undefined}` to `Alert`), so nothing is announced twice or with another politeness. The Квиз
  panel holds no live container: every message after an action there takes focus unless the learner is
  away. The four v1 containers (five from #36 on a lesson with a quiz) are empty on load,
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
  exist (no quiz notice container: the page cannot know of a quiz check).
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
  appear on a lesson with a quiz check, the quiz check is counted ("из 2" in this lesson), and only the
  `#state-quiz-*` states draw them (`quiz.md` "Release scope"). In every release: no mentor, hint, attempt
  history or Редактор control, and no "Разобрать с ментором" in the closed quiz block (#37). No budget
  control in any v1 state: the budget confirmation and the token-spending checks appear only in the states
  marked "from #37 / #39".
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
    anywhere); only a prompt's code block scrolls sideways, inside itself.
  - **Prompt code block (WCAG 2.1.1).** Only when its lines overflow does the `pre` take `tabindex="0"`,
    `role="group"` and `aria-label="Код к вопросу"`, with the focus ring on the `pre` (decided on load and
    on resize, by script in the prototype and in the app). When a resize makes a focused block fit it keeps
    `tabindex="0"` until it loses focus, so focus never falls to `body`.
  - **Focus visible (WCAG 2.4.7).** The result block and the send error are scrolled into view as they take
    focus (no `preventScroll`), because after a press on "Отправить ответы" far down the questions they are
    above the viewport.
  - **Status messages (WCAG 4.1.3).** Every quiz message after the learner's action takes focus (a focus
    move needs no live region); the one live quiz container is the quiz notice, used only while the learner
    is away, because a result block focused behind an open modal menu or dialog would be announced nowhere.
  - **Timing.** The quiz has no time limit; the idle warning (F10) and the session (F2) are unchanged, and
    answering is not terminal input.
- **Evidence (headless over http, kept out of the ACs because the counts change with every state).** #69
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
- **Evidence for the quiz (#70, headless over http, Chromium and WebKit).** The quiz run: 35648 checks, 0
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
  (24 px; measured 24 px wide at 1280) across the full pane height.
- **Handle tooltip (1.4.13).** Opens on hover and on focus, stays while the pointer is over it, and Esc hides
  it without moving focus. The pointer can move from the handle onto the tip across the gap without closing
  it (a transparent bridge in `proto.css`; verified at 1024 px with a real pointer: handle, gap, tip, the tip
  stays). It reopens on the next hover or focus.
- **Copy button name change.** On denial the button's text, and so its accessible name, becomes "Не
  скопировано, выделите текст вручную"; focus stays on it. No live region is added (R2 lists the only live
  containers), so the echo relies on the screen reader announcing a name change of the focused element.
  The dev tester verifies it with VoiceOver (Safari) and NVDA (Chrome); if one of them stays silent, that is a
  DESIGN follow-up, not a dev fix (Open questions).
- **Check bar never obscures focus (2.4.11).** The check bar is a grid row, never `position: sticky` or
  `fixed`. Each pane scrolls inside its own area above it; the environment pane scrolls as a whole, so its
  terminal minimum height never paints over the check bar row. Below `30rem` of height (400 % zoom) the
  page becomes one scrolling document and the check bar is a block after the pane. Verified over http with
  `elementFromPoint` at the centre of every rendered "Проверить" after focusing it, in every state without a
  dialog, at 375x667, 320x500 and 320x200 with "Урок" and with "Окружение" shown, and at 1280x800 with both
  panes: 0 covered, 0 outside the viewport (the #69 run: 500 checks over the 61 states). In #50, with the
  environment pane's overflow forced to `visible`, 27 of 83 were covered at 375x667, so the check can fail.
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
  after the F10.1 one; the two "Уведомления" ones while the course cannot be read) exist on load;
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
  `aria-current` on either top-bar link, and "Курс" is left out while the course id is unknown (only when
  `course.yaml` itself cannot be read). "Повторить"
  puts focus on the lesson h1 with `<title>` the lesson title on success; the error h1 with `<title>` "Не
  удалось загрузить курс" on a second failure; the not-found h1 with `<title>` "Страница не найдена" when
  the course loads but the URL is a way into the not-found page.
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
  that had it before focus entered "Уведомления"; with none, to "Курс" with two panes, to the switch tab
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
  and `aria-disabled="true"`, focused after a key press and after a mouse press (in Safari and Firefox on
  macOS too, by script); every option control and every group has `aria-disabled="true"` and no `disabled`;
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
  "Неудачных попыток: N"; a send error, which counts nothing, leaves it as it was.
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
- AC44, loading and load error ("Loading", "The load error", "Focus targets" rows 10-12): while the quiz is
  read the heading stays, the rest is Skeleton (`aria-hidden`), the panel has `aria-busy="true"`, nothing is
  announced and focus does not move; the load error is a destructive Alert "Не удалось загрузить квиз" with
  no role and no `tabindex`, its "Повторить" `aria-describedby` the title; "Повторить" moves focus to the
  panel heading at once, focus stays there when the quiz loads, and returns to "Повторить" on a second
  failure unless the learner is away; no notice is set for a load.
- AC45, prompt code block ("Question block", second bullet; design note N2, N8): a prompt `pre` has no
  "Копировать"; it has `tabindex="0"`, `role="group"` and `aria-label="Код к вопросу"` only while its lines
  overflow (at 320 px in `#state-quiz-code`; none of them where it fits), the focus ring on the `pre`; a
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
  F10.1 containers likewise keep no `aria-hidden`; the Квиз panel holds no live container.
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
  sign-in) moves no focus and sets no notice.
- AC56, headless quiz run (design note §4, author item W2): the #70 quiz run (Chromium and WebKit) passes:
  every `#state-quiz-*` state at 1280x800, 375x667 and 320x640 in both themes (tab, panel content, header,
  result, quiz row, check bar, notice, live container attributes, focus, no sideways scroll, option labels
  at least 24 px), every rendered control clicked at 1280 and 375 px with Back and Forward after it, reload,
  `?tab=quiz` arrival and the F2 round trip, the send lock under Space and the arrow keys, the notice removal
  and "Открыть квиз" with Back; its only listed exceptions are Prototype, "Prototype limitations" items 1
  (the tab drop of "Проверить", "Перезапустить окружение", "Сбросить"), 2 (no notice after Back from a
  control inside the panel in the four notice states: the sweep expects the notice empty there) and 3
  (focus after Forward is the `data-focus-fallback` repair: the sweep asserts state and tab only).
  Every quiz UI string of the prototype matches a Copy row, and every Copy row is in the `ia.md` register.

## Open questions

1. **Check kind in the check row:** answered (#69): hidden in v1 by Stepan's decision; the label set
   "команда", "квиз", "оценка ментора", "скрытая задача", "поиск багов" is registered in `ia.md` for the
   release that lists a second kind, whose DESIGN task decides how the row shows it.
2. **Copy denial echo** (AC14) is unverified in a real screen reader; if it fails, the options are a
   change to R2 (a sixth live container) or moving focus to the code block. Design decision, not dev.
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
8. **Quiz follow-ups (#70, `ia.md` "Open follow-ups"), none blocking these notes:** FU7 (the lesson status
   when a quiz closes, an ADR decision that blocks #36; the page shows what the server reports, AC39); FU8
   ("Проверить" when every `command` check is closed and the quiz is open: not drawn, the reason is the
   checks design's); FU10 (keyboard scrolling of Теория code blocks, the quiz prompt rule applied to prose);
   FU11 (explicit `aria-live` and no live role inside a container in the app's `notifications.tsx`, AC51).
