# Lesson: acceptance notes

## Route

`/courses/[courseId]/lessons/[lessonId]`, left-pane tab in the query `?tab=theory|task|checks` (`ia.md`,
"Deep links"; a tab not shown in the current release falls back to Теория, or Задание without theory).
`<title>` and h1: the lesson title. `?tab=` is read and written:
- **Read on arrival:** the page opens the tab the query names (dashboard "Продолжить" and the sign-in `next`
  redirect both send `?tab=task`; "Войти снова" sends the tab the learner was on). The prototype maps it
  without a `#state-` hash: `?tab=task` opens `#state-task`, `?tab=checks` opens `#state-checks-before`,
  `?tab=theory` or any other value the default state; with a hash, the hash picks the state and the query
  then re-selects its tab when that state shows it. The same rule holds on Back and on a typed `#state-`, so
  Back after a simulated action returns with the tab the learner had. Only a click in the prototype's
  "States" index shows a state's documented tab instead (prototype chrome, no app equivalent).
- **Written on selection:** selecting a left-pane tab replaces `?tab=` (`theory|task|checks`) with
  `history.replaceState`, no new history entry; the rest of the URL (the prototype's `#state-` hash) stays.

While the course cannot be read, `<title>` and h1 are "Не удалось загрузить курс" (HTTP 200), whatever
course and lesson ids the URL names: without the course the page cannot tell a hidden lesson from a real
one (F7 error states). The not-found page (`design/pages/not-found/`, HTTP 404; `ia.md` page inventory,
not-found Route) is what a lesson URL whose course id is not the course's, or a lesson URL whose lesson id
names no `ready` lesson of the course, opens.

Dev issues: #30 (M0 lesson), #31 and #32 (environment, terminal), #34 (check bar and Проверки, v1 lesson).

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
hidden-task check "Агент решает скрытую задачу с вашим AGENTS.md", sample budgets and costs). The quiz
check `models-effort-quiz` is not listed anywhere (R6, A19), so the v1 count is "из 1".

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
| F13.2 | the check bar timer | `#state-check-running` (also `#state-budget-running`) |
| F13.3 | the check list while running | `#state-check-running` (Проверки tab); also `#state-mixed-running`, `#state-budget-running`, `#state-budget-running-one` |
| F13.4 | the check bar status (the end texts of `checks.md` "Check bar status line") | `#state-results`, `#state-lesson-passed`, `#state-results-limit-known`, `#state-limit-warning`, `#state-closed`, `#state-mixed`, `#state-passed-last-failed`, `#state-runner-error`, `#state-statuses-agent` |
| F13.5 | the open row: grader message and "Неудачных попыток: 3" | `#state-results` (limit unknown); "Неудачных попыток: 3 из 10" in `#state-results-limit-known` (limit known) |
| F14.1 | the last-attempt warning "Осталась 1 попытка" in the row meta | `#state-limit-warning` |
| F14.2 | that row's open panel (the run that spends the last attempt starts from its "Проверить") | `#state-limit-warning` |
| F14.3 | the closed row's open panel: closed note, closing message, "Неудачных попыток: 10 из 10" | `#state-closed` |
| F14.4 | the reason "Проверки завершены" of the `aria-disabled` "Проверить" (status "Урок завершён: не пройден. Пройдено: 0 из 1") | `#state-closed`, `#state-closed-limit-unknown`; mixed outcome in `#state-mixed` |

F13.6 (mentor, D3) is not drawn: no mentor, hint or quiz control in any state (R6).

## Status

Status: ready

## Purpose

One route for reading and practising a lesson: theory and task on the left (F7), the environment with its
terminal on the right (F8-F11), the check bar under the left pane (F13 v1, `command` checks) with attempt
limits and closed checks (F14, `checks.md`). Two release states: the M0 lesson (#30 alone) and the v1
lesson (#31, #32, #34 shipped, with the ADR-0007 amendment the #69 design asks for). Limit known needs #68
reported by the server; checks that spend tokens and the budget confirmation are drawn for #37 / #39.

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

## Components

| shadcn | Usage |
|--------|-------|
| Button | course error "Повторить" (secondary, sm); "Проверить" (default; `aria-disabled` variants), "К окружению" (outline), the check bar's "Переподключиться" (outline, in the place of "К окружению"), "Открыть результаты" (ghost), status actions (default sm), "Подробности" (ghost sm, in the status bar and in a check row panel), "Действия" (outline sm), "Копировать" (ghost sm), "Сбросить" (destructive), "Запустить" (default, budget confirmation), "Отмена" (outline), "Показать все" (link) |
| Alert | session expired (destructive) and idle warning (default) in "Уведомления"; prerequisite (warning); text load error (destructive); course load error (destructive, static, its title is the h1, as on the catalog) |
| DropdownMenu | user menu; "Действия" with two items, their `aria-disabled` variants with a reason line, and the checkbox item "Режим для экранного диктора" |
| Breadcrumb | "Курс" / module / lesson (`aria-current="page"`); not shown when the course cannot be read |
| Tabs | left pane (Теория, Задание, Проверки), environment (Терминал), one-pane switch (`.pane-switch`) |
| Badge | lesson type "артефакт" (outline) |
| Collapsible | outcomes, check rows, "Подробности" (status bar F8 and runner-error check row F13: the same ghost sm trigger controlling one `pre.error-details`, collapsed by default) |
| Resizable | the split handle |
| ScrollArea | each pane |
| AlertDialog | "Сбросить рабочую папку?" (destructive action "Сбросить"); the budget confirmation "Потратить до $N с вашего ключа API?" (from #37 / #39; default action "Запустить", the checks in `.alert-dialog-list` after the description, both named by `aria-describedby`) |
| Spinner | creating / starting, running check |
| Kbd | the key hint |
| Tooltip | the split handle |
| Separator | menu separators |

Compositions: top bar, "Уведомления", environment status bar, check bar, check row, prose (`.prose`,
`.table-wrap`, `.code-block`, `.toc`), terminal frame. Status icons (`.status-icon`) carry shape plus word;
a closed check is `data-status="closed"` (the lock, drawn by CSS on the empty `aria-hidden` span; the app
uses lucide `Lock`). Check row (`design/system/README.md`, "Check row"): the meta holds the in-row running
time `span.check-row-time` (no role), "лимит M:SS" and the last-attempt warning `[data-tone="warning"]`;
the panel holds the notes, the grader message, "Подробности", the cost and the counter, in that order.
Skeleton is in the inventory for the lesson but no v1 state of this page draws a loading skeleton: the text
loads with the route (Open questions).

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
| `#state-results-limit-known` | F13.5 limit known (from #68): as `#state-results`, the counter "Неудачных попыток: 3 из 10" |
| `#state-limit-warning` | F14.1 limit known: row "Не пройдено" with the meta warning "Осталась 1 попытка" (warning icon, `foreground` words); open: "2 из 6 карточек неверны.", "Неудачных попыток: 9 из 10"; status "Пройдено: 0 из 1. Осталась 1 попытка" with "Открыть результаты" |
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
- **Tab order (R4):** with the course read: "К содержимому"; top bar; "Уведомления" when non-empty; "Урок"
  ([switch] "Курс", module crumb, "Показать все", prerequisite link, the tab list (one stop), the tab panel,
  in Проверки each row button and, inside an open runner-error row, its "Подробности");
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
- **Only two things choose the left-pane tab:** the learner selecting a tab, and "Открыть результаты"
  (Проверки). Every other control keeps the selected tab and `?tab=`: "Проверить", status actions,
  "Продолжить работу", "Действия" and its items, the reset dialog, "Показать все", "Содержание", check rows,
  the one-pane switch, the split handle (A17). The prototype marks the one exception with `data-select-tab`.
- **Left-pane tab selection writes `?tab=`:** selecting Теория, Задание or Проверки (click, arrow key, Home,
  End, "Открыть результаты") replaces `?tab=` with `theory`, `task` or `checks` through
  `history.replaceState`: no new history entry, Back leaves the lesson as before. A reload reopens that tab;
  "Войти снова" carries it in `next`. The one-pane switch "Урок / Окружение" does not touch the URL.
- **"Содержание":** Enter on a link moves focus to that h2 (`tabindex="-1"`) and scrolls it into view.
- **"Копировать":** copies the block's text; on denial the label changes (see Accessibility notes).
- **"Проверить":** starts a run over the checks of `checks.md` "Run composition" (S1, S2, S11); focus stays
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
- **"Продолжить работу":** clears the warning, focus returns to where it was before entering "Уведомления",
  else the first focusable element of "Урок": "Курс" with two panes, the switch tab "Урок" in one-pane mode
  (R2). The prototype always takes the fallback.
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
- **Background changes and focus (`checks.md` B1-B25, `ia.md` R2).** A change the learner did not activate
  on the focused control moves focus only when it removes that control or closes the dialog holding it:
  to "Проверить" in the check bar (never removed), to the row's own button inside an open row, to
  "Проверить" when the budget confirmation closes. Focus never falls back to `body`. The prototype stands
  for a change with `window.proto.setState(<state>)`, which treats an equal text of another state as the B9
  re-set; a background change that keeps an equal text silent (B20, B22 after a run) is shown with a typed
  `#state-` hash instead, which repairs focus the same way and sets nothing. The check bar and every
  `.check-row-panel` carry `data-focus-fallback`. Each row, with the prototype pair that shows it:

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

- **Back in the prototype (prototype only, the app pushes no history entry per action):** Back after a
  simulated action returns to the previous state with the same tab and `?tab=`, and focuses the control
  that was activated while it is rendered, else the background fallback above. Into a state whose dialog
  opens with the state (`#state-reset-dialog`, `#state-budget-dialog`, `#state-budget-dialog-one`) focus
  starts on "Отмена" as on every opening (F11.3, F13.1), never on the button activated from that entry.
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
| left tabs | Теория / Задание / Проверки |
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

"Подробности" content is the raw error from Docker, the runner or the server, shown as is (English in the
prototype). Grader messages are shown verbatim ("2 из 6 карточек неверны."). Check titles in the rows and
in the budget list are `lesson.yaml` data. Amounts: "$" and two decimals with a dot, costs rounded up to the
cent (`checks.md` "Money"). "Осталась 1 попытка" is a fixed string, never built through plural rules.
Every string above is in the `ia.md` register (closed sets, page copy "lesson, accessible names (#69)" and
"lesson, checks (#69)", action labels).

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
  `role="status"` (F10.1); the environment status text (`role="status"`, changes only on a status change,
  notes appended inside it); the check bar status line (`role="status"`). All four are empty on load,
  except the check status line in the nothing-to-run states (`#state-closed`, `#state-closed-limit-unknown`,
  `#state-passed-paid-only`): there its text is part of the page markup, so it is not announced on load,
  and it is still never inserted together with the container. Standalone timers (check bar, environment
  status bar) are `role="timer"`, siblings of their status container and outside it; the running time
  inside a check row is `.check-row-time`, no role, part of the row button's name (a button's children are
  presentational). Nothing else is live: not the rows, not the terminal, not the copy button, not the
  reasons, not the tab name. The status line is the only announcement of the last-attempt warning, a closed
  check and a runner error (summaries 4 and 6, the notes of summary 7), once, at the end of the run.
  "Уведомления" is a `region` with its hidden h2 only while a container has text. While the course cannot
  be read only the two "Уведомления" containers exist.
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
  "Подробности", the cost, the counter (always last). While a check is queued or running its panel shows
  only the counter. The kind is not shown (hidden in v1; labels registered in `ia.md` for later).
- **R5:** the page shows no lesson status; opening it, reading and the automatic start do not start the lesson.
  The check bar's "Урок пройден" and "Урок завершён: не пройден. Пройдено: N из M" come only from the lesson
  status the server reports.
- **R6:** no Квиз tab, quiz row, "Пройти квиз", mentor, hint, attempt history or Редактор control in any
  state; the quiz check is not counted ("Пройдено: 0 из 1"). No budget control in any v1 state: the budget
  confirmation and the token-spending checks appear only in the states marked "from #37 / #39".
- **Closed check (F14.3).** Lock icon in `destructive` plus the words "Закрыта: не пройдено"; the shape tells
  it from the failed cross (colour is shared). Nothing reopens it: no control in any state, and the reset
  dialog says "Счётчики попыток не обнулятся."
- **Budget confirmation:** `role="alertdialog"`, named by its title, described by the paragraph and the
  list; modal, so the page behind is inert and the idle warning in "Уведомления" is behind it (design note,
  residuals); the dialog does not count as activity.
- **Evidence (headless over http, kept out of the ACs because the counts change with every state).** #69
  run (`plans/69-lesson-check.mjs`, 61 states): 37158 checks, 0 findings. 4317 control activations at 1280
  px and 3105 at 375 px (click and Enter, from each left-pane tab the state shows; 12 clicks skipped where an
  open menu lies over the control), 282 and 270 Backs (Back into a dialog state lands on "Отмена"), 0 tab or
  query changes outside "Открыть результаты"; 6524 UI strings matched against the `ia.md` register; 116
  `F6` cycles; 500 AC13 checks; 30 cross-page round trips; 24 status transitions and 26 background focus
  pairs. Nine guard breaks each turn it red: closed icon, "Переподключиться" removed, a status text
  changed, "лимит 0:30" under "Пройдено", no check bar fallback, `role="timer"` on a row time, a zero text
  gap, Back focus on the remembered dialog button (36 findings) and a non-wrapping check bar status at 320
  px (1). The #50 run recorded 1748 activations at 1280 px and 2120 at
  375 px (269 Backs each) and "Войти снова" `next` matching the selected tab in all 33 / 42 checks.
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
  `?tab=checks` in the M0 lesson falls back to Теория. The tab "Войти снова" sends back is the one selected
  when the session expired (AC17).
- AC5: Every disabled control of R1 has `aria-disabled="true"`, no `disabled` attribute, is reachable by Tab,
  does nothing on Enter, Space or click, and its reason is read as its description.
- AC6: The four live containers (the two "Уведомления" ones while the course cannot be read) exist on load;
  they are empty on load, except the check status line in the nothing-to-run state, whose text is part of
  the page and not announced; their text changes only in the cases R2 and `checks.md` "Live regions" list
  (announced exactly when the page learns of a change in the lesson's run, B1-B25); two consecutive status
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
  вышло" word; the running time only with "Идёт". No mentor or hint control; quiz checks are neither listed
  nor counted. No row shows a check kind.
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
  for Теория (`?tab=theory`) and Задание (`?tab=task`).
- AC18: From each of Теория, Задание and Проверки, every control of every state keeps the selected tab and
  `?tab=`, at 1280 and 375 px, and so does Back after it; the only exception is "Открыть результаты", which
  selects Проверки and writes `?tab=checks`. "Войти снова" `next` carries the selected tab. (Run counts:
  Accessibility notes, "Evidence".)
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
  named target, never to `body`, and sets the status text it names; controls of the new state are there at
  once and only the status text waits for the gap; a waiting text equal to the one shown is dropped, except
  the B9 re-set, which empties the line and sets the same text one gap later.
- AC28, row time: no `role="timer"` inside any `.check-row-trigger`; every in-row running time is a
  `.check-row-time`, part of the row button's name; the check bar and environment timers are `role="timer"`
  siblings of their status containers.
- AC29, headless control run: `plans/69-lesson-check.mjs` (design note §7) passes with its expected counts:
  every state at 1280 and 375 px, every control by click and by Enter from each left-pane tab, Back after
  each, the cross-page round trips, the register closure, R1 to R3, AC1 and AC13, the status text per
  transition and B8-B23 (last run: 37158 checks, 0 findings); each guard break of §7 item 10 turns it red,
  and so do the two added with the system fixes: Back focus into a dialog state on the remembered button
  instead of "Отмена", and a check bar status that does not wrap at 320 px.

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
