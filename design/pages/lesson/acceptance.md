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
`checks/verify_routing.py`). **Sample data**, because this lesson does not have it: three outcomes
(`#state-outcomes-collapsed`, `-expanded`; extra items are module 00 outcomes), a prerequisite
(`#state-prerequisite`), a lesson without `workspace` (`#state-no-workspace`), a lesson with no check the
platform runs (`#state-no-checks`), and the seven-row status list (`#state-statuses`, titles of the module
00 `command` checks; one row per v1 status, not a combination the runner produces). The quiz check
`models-effort-quiz` is not listed anywhere (R6, A19), so the v1 count is "из 1".

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
| F13.1 | "Проверить" (enabled) | `#state-theory` |
| F13.2 | the check bar timer | `#state-check-running` |
| F13.3 | the check list while running | `#state-check-running` (Проверки tab) |
| F13.4 | the check bar status ("Пройдено: N из M", "Урок пройден") | `#state-results`, `#state-lesson-passed` |
| F13.5 | the open row: grader message and "Неудачных попыток: 3" | `#state-results` |

F13.6 (mentor, D3) is not drawn: no mentor, hint or quiz control in any state (R6).

## Status

Status: ready

## Purpose

One route for reading and practising a lesson: theory and task on the left (F7), the environment with its
terminal on the right (F8-F11), the check bar under the left pane (F13 v1, `command` checks). Two release
states: the M0 lesson (#30 alone) and the v1 lesson (#31, #32, #34 shipped).

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
| Button | course error "Повторить" (secondary, sm); "Проверить" (default; `aria-disabled` variants), "К окружению" (outline), "Открыть результаты" (ghost), status actions (default sm), "Подробности" (ghost sm), "Действия" (outline sm), "Копировать" (ghost sm), "Сбросить" (destructive), "Отмена" (outline), "Показать все" (link) |
| Alert | session expired (destructive) and idle warning (default) in "Уведомления"; prerequisite (warning); text load error (destructive); course load error (destructive, static, its title is the h1, as on the catalog) |
| DropdownMenu | user menu; "Действия" with two items, their `aria-disabled` variants with a reason line, and the checkbox item "Режим для экранного диктора" |
| Breadcrumb | "Курс" / module / lesson (`aria-current="page"`); not shown when the course cannot be read |
| Tabs | left pane (Теория, Задание, Проверки), environment (Терминал), one-pane switch (`.pane-switch`) |
| Badge | lesson type "артефакт" (outline) |
| Collapsible | outcomes, check rows, "Подробности" |
| Resizable | the split handle |
| ScrollArea | each pane |
| AlertDialog | "Сбросить рабочую папку?" |
| Spinner | creating / starting, running check |
| Kbd | the key hint |
| Tooltip | the split handle |
| Separator | menu separators |

Compositions: top bar, "Уведомления", environment status bar, check bar, check row, prose (`.prose`,
`.table-wrap`, `.code-block`, `.toc`), terminal frame. Status icons (`.status-icon`) carry shape plus word.
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
| `#state-check-running` | check bar: spinner, "Идёт проверка", timer "0:12", "Проверить" `aria-disabled` "Дождитесь окончания проверки"; tab badge "Проверки, идёт проверка"; the selected tab stays (A17, opened from the States index: Теория); Проверки row "Идёт" "0:12 из 0:30" |
| `#state-results` | "Пройдено: 0 из 1" with "Открыть результаты"; row "Не пройдено" open: "2 из 6 карточек неверны." and "Неудачных попыток: 3" |
| `#state-statuses` | sample rows, one per v1 status, including "лимит 0:30" and the format message |
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
  checked there, not in this prototype. The cycle is off while the AlertDialog is open. From the split
  handle (no region) `F6` goes to the next region in DOM order ("Окружение").
- **Tab order (R4):** with the course read: "К содержимому"; top bar; "Уведомления" when non-empty; "Урок"
  ([switch] "Курс", module crumb, "Показать все", prerequisite link, the tab list (one stop), the tab panel);
  "Проверка" ("Проверить", "К окружению", "Открыть результаты"); the split handle (two panes); "Окружение"
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
- **"Проверить":** starts a run; focus stays on the same button, now `aria-disabled` (one element in the app;
  two in the prototype only because a static file swaps markup). No tab switch (A17).
- **"Открыть результаты":** one-pane: area to "Урок" first; selects Проверки; focus on its h2 "Проверки".
- **"К окружению":** one-pane: area to "Окружение" first; focus on the status action of the state
  ("Повторить", "Запустить снова" or "Открыть курс").
- **Status actions (R2):** "Повторить", "Запустить снова", "Переподключиться", "Открыть новый сеанс" remove
  themselves; focus moves to "Действия" (R3 for the new state). "Открыть курс" navigates.
- **Check row:** a disclosure button; Enter / Space toggles the message and counter.
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
| one-pane switch label (not yet in the `ia.md` register, Open questions) | Область |
| one-pane switch tabs | Урок / Окружение |
| switch suffix (hidden) | остановлено / ошибка |
| breadcrumb label (not yet in the `ia.md` register, Open questions) | Навигация |
| breadcrumb | Курс / <module title> / <lesson title> (not shown when the course cannot be read) |
| lesson type | артефакт (one of "теория", "квиз", "артефакт", "оценка агента", "поиск багов", "проект") |
| duration | около N мин |
| outcomes heading | Чему научитесь |
| outcomes toggle | Показать все / Свернуть |
| M0 line | Окружение и проверки появятся в следующей версии платформы |
| prerequisite alert | Сначала пройдите: <lesson title> |
| left tab list label (not yet in the `ia.md` register, Open questions; the gallery uses the same name) | Разделы урока |
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
| check statuses | Не запускалась / В очереди / Идёт / Пройдено / Не пройдено / Время вышло / Ошибка формата, попытка не засчитана |
| running timer | M:SS из M:SS |
| timeout note | лимит M:SS |
| row counter | Неудачных попыток: N |
| checks empty | Попыток пока нет. Нажмите "Проверить", когда будете готовы. |
| check bar | Проверить / К окружению / Открыть результаты |
| check bar status | Идёт проверка / Пройдено: N из M / Урок пройден |
| disabled reasons | Окружение запускается, проверка станет доступна после запуска / Сначала запустите окружение / Дождитесь окончания проверки / Доступно, когда окружение работает |
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

"Подробности" content is the raw error from Docker or the server, shown as is (English in the prototype).
Grader messages are shown verbatim ("2 из 6 карточек неверны.").

## Accessibility notes

- **R1, disabled controls.** "Проверить" and the "Действия" items use `aria-disabled="true"`, never
  `disabled`; they stay in the Tab order, do nothing, and carry their reason as visible `muted-foreground`
  text tied with `aria-describedby` (a second line inside the menu item, `aria-hidden="true"` so the reason is
  the item's description only and not repeated in its name). One reason at a time: during a run
  "Дождитесь окончания проверки" wins. "К окружению" follows a "Сначала запустите окружение" button; then
  "Открыть результаты" when a run ended on this page.
- **R2, live containers, all present and empty from load:** in "Уведомления" one `role="alert"` (F2.1) and
  one `role="status"` (F10.1); the environment status text (`role="status"`, changes only on a status change,
  notes appended inside it); the check bar status line (`role="status"`, empty before the first run). Timers
  are `role="timer"` outside them. Nothing else is live: not the rows, not the terminal, not the copy
  button, not the reasons. "Уведомления" is a `region` with its hidden h2 only while a container has text.
  While the course cannot be read only the two "Уведомления" containers exist.
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
- **Check row (F13.3) without the kind.** A row shows the status icon, the title, the status word and,
  only when it applies, the timer ("M:SS из M:SS") or the limit ("лимит M:SS"). v1 runs `command` checks
  only, so the row omits the kind.
- **R5:** the page shows no lesson status; opening it, reading and the automatic start do not start the lesson.
- **R6:** no Квиз tab, quiz row, "Пройти квиз", mentor, hint, budget, attempt history or Редактор control in
  any state; the quiz check is not counted ("Пройдено: 0 из 1").
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
  `elementFromPoint` at the centre of every rendered "Проверить" after focusing it, in all 44 states: at
  375x667, 320x500 and 320x200 with "Урок" and with "Окружение" shown (83 checks each), and at 1280x800
  with both panes (42 checks): 0 covered, 0 outside the viewport. With the environment pane's overflow
  forced to `visible`, 27 of 83 are covered at 375x667, so the check can fail.
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
- AC6: The four live containers (the two "Уведомления" ones while the course cannot be read) exist and are
  empty on load; their text changes only in the cases R2 and
  `checks.md` "Live regions" list; the Проверки tab's accessible name is "Проверки, идёт проверка" only
  during a run.
- AC7: A run does not switch the tab; after it the status line reads "Пройдено: N из M" (or "Урок
  пройден") and "Открыть результаты" moves focus to the Проверки heading, switching the area first in
  one-pane mode; it stays through an environment restart and stop until the next run.
- AC8: "К окружению" switches the area in one-pane mode and focuses the status action of the state.
- AC9: An open row shows the grader message verbatim and "Неудачных попыток: N"; no "из M", no mentor or
  hint control; quiz checks are neither listed nor counted. No row shows a check kind.
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
- AC15: Every status in the UI is from the closed sets of `ia.md`; the Copy table equals the app strings.
- AC16: Both themes: tokens only (no raw colour), terminal dark in both, contrast as measured in the system
  README.
- AC17: Select Проверки: the URL reads `?tab=checks` and `history.length` is unchanged; "Войти снова" carries
  it in `next` (`next=` decodes to the lesson path with `?tab=checks`); a reload reopens Проверки. The same
  for Теория (`?tab=theory`) and Задание (`?tab=task`).
- AC18: From each of Теория, Задание and Проверки, every control of every state keeps the selected tab and
  `?tab=`, at 1280 and 375 px, and so does Back after it; the only exception is "Открыть результаты", which
  selects Проверки and writes `?tab=checks`. Verified headless over http: 1748 control activations at 1280 px
  and 2120 at 375 px (269 Backs each), 0 tab or query changes; "Войти снова" `next` matched the selected tab
  in all 33 / 42 checks.
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

## Open questions

1. **Check kind in the check row:** the label set is decided by the ux-researcher in D1 (check panel
   detail); v1 runs `command` checks only, so the row omits the kind.
2. **Copy denial echo** (AC14) is unverified in a real screen reader; if it fails, the options are a
   change to R2 (a sixth live container) or moving focus to the code block. Design decision, not dev.
3. **Accessible names "Навигация", "Область" and "Разделы урока"** to be added to the ia.md page-copy
   register by the ux-researcher in the D1 follow-up.
4. **Loading state** of the lesson text (Skeleton) is not a flow step; if #30 loads tab text separately, a
   skeleton state should be added to F7.
