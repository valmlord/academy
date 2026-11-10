# Journey: lesson page and environment

Page: lesson (`/courses/[courseId]/lessons/[lessonId]`). Regions, their order and where `F6` lands: rule
R3 in `ia.md` (Верхняя панель, Уведомления, Урок, Проверка, Окружение). Left pane "Урок": tabs Теория,
Задание, Проверки (Квиз from #36, rule R6). Under it the check bar, region "Проверка". Right pane
"Окружение": a status bar with the environment status, "Действия" and the key hint, then the tab
Терминал (Редактор from #40). Disabled actions follow R1, live regions R2, landmarks and Tab order R4.
While the course cannot be read none of these parts exists: `main` holds only the course error (F7 error
states; "Lesson page by release").
Sources: `docs/learning-process.md` §1, #30 (theory and task on the left, the environment on the right), #31 (create, start, stop, delete; GC; recovery), #32 (terminal over WebSocket,
reconnect), #33 (missing API key), #40 (editor), ADR-0002 (files in a named volume, Docker Desktop
required), research §3, §5, §8. Checks are in `checks.md`, the quiz in `quiz.md`, the mentor in
`mentor.md`.

"Окружение" (English: environment) is the running container, "рабочая папка" is its files (decision A1 in
the #50 design notes). A lesson without the `workspace` field in `lesson.yaml` has no environment and no
"Окружение" region; the left pane takes the full width.

## Layout by width (decision A8)

For the lesson page whose course was read. While the course cannot be read there are no panes, no switch
and no check bar at any width: `main` holds only the course error, in the catalog's column (F7 error states).

- From 1024 px: two resizable panes side by side, the check bar under the left pane.
- Below 1024 px, down to 320 px: one pane at a time in one area, with the switch "Урок / Окружение" (a
  tab list of two tabs) at the top of the area, the first focusable element of the shown pane's region
  (R3); the check bar stays under the area, full width, at every
  width. The terminal reflows to the area's width (xterm fit, #32 resize), so nothing scrolls sideways
  except long lines inside the terminal's own buffer. This keeps every function, "Проверить" and the
  terminal included, at 375 px and on a 1280 px screen at 200 % or 400 % zoom (WCAG 1.4.4, 1.4.10).
- While the hidden pane needs attention, its switch tab says so in words: "Окружение" gets "остановлено" or
  "ошибка" appended to its accessible name and a status icon; page-level alerts are never inside a pane
  (region "Уведомления", `ia.md`).
- The `F6` cycle is the same in both modes; in one-pane mode reaching the hidden pane switches to it
  (R3).

## Lesson page by release

The parts of the page arrive with their dev issues; each release state is one named state with a fixed
set of tabs and controls (rule R6 in `ia.md`).

- **Course cannot be read** (every release, #83): `main` holds only the course error, the catalog's
  composition (F7 error states); none of the regions "Урок", "Проверка", "Окружение" exists, so none of
  the controls listed below does.
- **M0 lesson** (#30 shipped; #31, #32 and #34 not yet): region "Урок" only, full width at every width,
  so no one-pane switch. Tabs Теория and Задание (Задание only when the lesson has no theory); no
  Проверки tab, no Квиз tab, no check bar (no "Проверка" region), no "Окружение" region, no idle warning.
  Under the lesson header a muted line "Окружение и проверки появятся в следующей версии платформы",
  because the Задание tab describes a terminal and checks the learner cannot reach yet. Controls: skip
  link, top bar, "Войти снова" (F2.1), breadcrumbs, "Показать все" / "Свернуть", prerequisite links
  (F6.2), the tab list, "Содержание" links, "Копировать", source links, "Повторить" (text load error).
  Lesson status stays "Не начат" (R5).
- **M0 lesson with environment** (#31 and #32 shipped, #34 not yet): the M0 lesson plus the "Окружение"
  region, the one-pane switch and F8-F11; still no check bar and no Проверки tab. The M0 line is
  dropped, because the environment explains itself and the page then reads like a lesson with no checks.
- **v1 lesson** (#34 shipped): the page as designed in this PR. Tabs Теория, Задание, Проверки; the check
  bar; "Окружение" for a lesson with the `workspace` field. Only `command` checks are listed and run; no
  quiz, mentor or hint control (R6). The lesson prototype of #50 draws this state and the M0 lesson.

## Live regions on this page

Rule R2 in `ia.md` names every live container on this page and how it is inserted; this page adds only:

- The environment status text changes only when the status changes (creating, starting, running, stopped,
  an error, terminal connection lost or restored, an appended note).
- The terminal itself is not a live region; xterm.js `screenReaderMode` handles terminal output (F9).

## F7: Read the theory and the task

**Goal:** understand the problem and what "done" means before practising. Source: learning-process §1
("theory ... starts from a concrete problem"; "task ... what to do and how to tell that it is done");
#30 e2e "see the theory"; G2.

**Entry:** F4.3, F5.4, or a direct link to the lesson.

**Steps (5):**

1. F7.1 Learner sees the lesson header: breadcrumbs, title, type ("теория", "квиз", "артефакт", "оценка
   агента", "поиск багов", "проект"), "около N мин", and "Чему научитесь" (the lesson outcomes, collapsed
   to the first one with "Показать все" when there are more than two; expanded, the button reads
   "Свернуть").
2. F7.2 Learner reads the Теория tab: a "Содержание" list of the H2 sections at the top, then the
   markdown (tables, code blocks with "Копировать"), then "Источники" (title, link, "проверено <date>").
3. F7.3 Learner jumps to a section from "Содержание"; focus moves to that heading.
4. F7.4 Learner switches to the Задание tab: "Что в рабочей папке", "Что сделать", "Что значит
   "готово"", "Как проверяется", "Попытки и подсказки" (the task.md sections, rendered as written).
5. F7.5 Learner copies a command from a code block and pastes it in the terminal (F9).

**Success:** the learner has read the task and knows how it is checked.

**Error states:**
- The course cannot be read when the page opens (any course file; the direct-link entry makes this the
  first thing a learner can meet): the page is the catalog's course error, not a lesson with a gap.
  `<title>` and h1 "Не удалось загрузить курс" (the h1 is the Alert title, `tabindex="-1"`), "Повторить";
  nothing else in `main`: no breadcrumb, lesson header, M0 line, prerequisite alert or tabs, because each
  of them is course data. The URL's course and lesson ids are not checked: without the course the page
  cannot tell a hidden lesson from a real one, and saying "not found" could be wrong. Regions: `ia.md` R3
  (`main` is the `F6` stop and lands on "Повторить"); top bar: R6, with `aria-current` on neither link and
  "Курс" kept unless the course id is unknown. "Повторить" reloads: the lesson opens with focus on its h1
  (`<title>` the lesson title); a second failure focuses the error h1 (`<title>` unchanged); a course that
  loads while the URL is a way into the not-found page (`ia.md` page inventory, not-found Route) shows the
  not-found page with focus on its h1 (`<title>` "Страница не найдена"; R2, page-level retry table).
- A direct link that is a way into the not-found page (`ia.md` page inventory, not-found Route, ways (3)
  and (4)): the not-found page (`catalog.md` F5 error states).
- theory.md or task.md cannot be read: the tab shows "Не удалось загрузить текст урока" with
  "Повторить"; the other tab and the environment stay usable.
- A broken link in "Источники" is not detected by the UI; the dated `checkedAt` tells the learner how old
  it is.
- Copy to clipboard denied by the browser: the button reads "Не скопировано, выделите текст вручную".

**Empty states:** a lesson with no theory.md (a pure quiz lesson): the Теория tab is not shown and the
page opens on Задание. A lesson with no sources: the "Источники" block is not shown.

**Exit:** F7.5 into F9; F13 via "Проверить"; breadcrumbs to the catalog. From the course error:
"Повторить", or "Главная" / "Курс" in the top bar (R6).

**Keyboard path:** the tab list is one Tab stop, arrow keys switch tabs (WAI-ARIA tabs), Tab moves into
the tab panel. "Содержание" links are in order; Enter moves focus to the heading. While the course cannot
be read: Tab order and `F6` as `ia.md` R4 and R3 state for that case ("Повторить" is the only control in
`main`).

**Time limits:** none for reading.

## F8: Start the environment

**Goal:** have a ready environment with the task's working folder when practice begins. Source:
learning-process §1 ("a Docker container created for the lesson from `starter/`"); #31 (idempotent
create, start); ADR-0002; G2.

**Entry:** the lesson page opens (F7.1) for a lesson with the `workspace` field. The environment starts
automatically, because the learner opened the lesson to practise, #31 create is idempotent, and starting
while the learner reads hides the wait (decision A10).

**Steps (4):**

1. F8.1 The status bar shows "Создаём окружение" (first visit: container and volume from `starter/`) or
   "Запускаем окружение" (container exists, stopped), with a spinner and elapsed seconds (`role="timer"`).
   Meanwhile "Проверить", when the lesson has a check bar, is `aria-disabled` with the reason "Окружение запускается, проверка станет
   доступна после запуска" (R1).
2. F8.2 The status bar shows "Окружение работает" and the Терминал tab connects (F9).
3. F8.3 If the agent API key is missing, the status bar adds a warning (see error states); the terminal
   still works.
4. F8.4 Learner sees in the status bar the actions menu "Действия" (F11) and the key hint "`F6` или
   Ctrl+Shift+. (клавиша Ю): следующая область" (on macOS "`F6` (Fn+`F6`) или Ctrl+Shift+. (клавиша Ю):
   следующая область"). The words клавиша Ю name the physical key, because under the Russian layout the key
   labelled `.` on the learner's screen is Ю.

**Success:** "Окружение работает", the terminal prompt is in the working folder.

**Error states:** each names what broke and what to do, in plain words first, raw details behind
"Подробности" (research §1: the learner has little Linux and container experience).
- Docker not running: "Docker не запущен. Запустите Docker Desktop и нажмите "Повторить"."
- Image missing: "Нет образа окружения academy-workspace. Соберите его (см. README) и нажмите
  "Повторить"." The image name is data from `lesson.yaml` `workspace.image`, shown as is.
- Container limits hit (CPU, memory, pids; ADR-0002): "Окружение остановлено: превышен лимит <памяти |
  процессов | CPU>. Файлы сохранены." with "Запустить снова".
- Environment rejected (it belongs to another user, #32): "Нет доступа к этому окружению." with "Открыть
  курс". Only reachable by a bug or a hand-edited URL; it still needs a state.
- Agent API key missing (#33), a warning, not an error: "Ключ API для агента не задан: агент в терминале
  не запустится. Добавьте ключ в .env и перезапустите платформу." Bash keeps working.
- Start takes longer than a threshold (parameter `ENVIRONMENT_START_SLOW_SECONDS`, set by #31): the text
  adds "Запуск идёт дольше обычного", with no cancel, because a half-created container is worse than a
  slow one.

**Empty states:** lesson without the `workspace` field: no "Окружение" region, no F8; the check bar
still shows for checks that need no environment.

**Exit:** F8.2 into F9.

**Keyboard path:** no input needed. "Повторить", "Запустить снова", "Открыть курс" and "Подробности"
are buttons in the status bar: `F6` to "Окружение" lands on the status action of the state (R3 table),
then "Подробности", then "Действия".

**Time limits:** start has no timeout of its own in the UI; the slow threshold only changes the text.

## F9: Work in the terminal and leave it by keyboard

**Goal:** run bash and the agent in the environment and get back to the theory without the mouse. Source:
learning-process §1 (Terminal tab, the agent runs here); #32 (xterm.js, resize, reconnect to the same
session); research §8 (keys the agent needs); G2, G6.

**Entry:** F8.2; `F6` or a click into the "Окружение" region.

**Steps (5):**

1. F9.1 Learner moves focus into the terminal: a click, or `F6` to "Окружение" (focus lands as in R3:
   "Действия" while running, or the switch tab "Окружение" in one-pane mode), then Tab to the tab list and
   Tab again to the terminal (one more Tab first in one-pane mode).
2. F9.2 Learner types commands and runs the agent; every key goes to the terminal, including Tab, Esc,
   Esc Esc, Shift+Tab, Ctrl+B, Ctrl+C, Ctrl+D, Ctrl+R, Ctrl+X chords (Claude Code keys, research §8), except
   the four region keys below.
3. F9.3 Learner resizes the split between the panes: drag the handle, click it, or focus it and use the
   keys (Split handle below); the terminal reflows (#32 resize). In one-pane mode there is no split; the
   terminal fits the area.
4. F9.4 Learner presses `F6` or Ctrl+Shift+. (previous: Shift+`F6` or Ctrl+Shift+,) to leave the terminal:
   focus moves to the next (previous) region of the `F6` cycle, the shell session keeps running.
5. F9.5 Learner comes back with the same keys (then Tab to the terminal, as in F9.1) or a click; the
   terminal shows the same session with its scrollback.

**Split handle (two-pane mode only):**
- Single pointer, without dragging (WCAG 2.2 SC 2.5.7): a click on the handle (press and release with
  less than 4 px of movement) cycles the preset splits of the left pane, 50 %, 35 %, 65 %, then 50 %
  again. A press that moves further is a drag. The library's double-click reset is turned off
  (`disableDoubleClick` on the shadcn Resizable handle, react-resizable-panels `Separator`), because two
  clicks of the cycle would otherwise also reset the split.
- Keyboard (react-resizable-panels `Separator`, docs fetched 2026-10-29): the handle is a focusable
  `separator` with `aria-valuenow`; Left / Right arrow move the split by 5 %, Home / End to the left
  pane's smallest / largest size; Enter cycles the same presets as a click (the library's Enter collapse
  toggle does nothing here, because neither pane is `collapsible`). The library's own `F6` (next
  separator) never fires: the page's capture-phase `F6` listener handles the key first (R3; verified by
  the #32 acceptance test, #50 design notes P2).
- Name and hint: accessible name "Граница панелей"; on hover and on focus a Tooltip "Перетащите или
  щёлкните, чтобы сменить ширину", tied with `aria-describedby`. Tab order: R4.

**Leave key decision (decision A2):**
- `F6` / Shift+`F6`, because Esc, Tab and Ctrl+B belong to the agent (research §8), Ctrl+M is Enter in a
  terminal, and VS Code uses `F6` for the same job (research §8). The page intercepts it in a capture-phase
  `keydown` listener before xterm.js handles it, and calls `preventDefault`.
- `F6` alone is not safe: browsers may keep it (Firefox and Chrome use `F6` to move focus to the address
  bar), and on Mac laptops it needs Fn. So a fallback chord does the same: Ctrl+Shift+. / Ctrl+Shift+,
  (matched by `KeyboardEvent.code`). Checked against Claude Code's documented default keybindings
  (code.claude.com/docs/en/keybindings, fetched 2026-10-29): no context binds a Ctrl+Shift+punctuation
  key except Ctrl+Shift+- ("`chat:undo` | Ctrl+\_, Ctrl+Shift+-"), and the reserved list ("Ctrl+M |
  Claude Code always receives it as Enter", Ctrl+[ as Escape, Ctrl+I as Tab, Ctrl+C, Ctrl+D, Ctrl+H)
  does not include it. Ctrl+X is excluded because Claude Code binds chords on that prefix ("Claude Code
  binds these default chords on the `ctrl+x` prefix"). Function keys appear nowhere in that page.
- The hint is visible in the status bar ("Окружение") at all times while the environment runs, and it is
  tied to the terminal's input: xterm's helper textarea gets `aria-describedby` pointing to the hint
  element, so a screen reader reads the way out when focus enters the terminal (WCAG 2.2 SC 2.1.2 No
  Keyboard Trap).
- Not verified: whether `F6` reaches the page's listener before the browser in Chrome, Firefox and Safari.
  This is an acceptance test of #32 (#50 design notes, P2): from the focused terminal, `F6`, Shift+`F6`,
  Ctrl+Shift+. and Ctrl+Shift+, each move focus to the expected region in the latest stable Chrome,
  Firefox and Safari on macOS and in Chrome and Firefox on Linux or Windows. A key that fails in a
  browser is dropped from the hint in that browser, and the fallback chord must pass everywhere. The
  matrix also runs every key with the Russian layout active and with a Ctrl+Shift layout switch turned on
  (Linux, Windows), and in Firefox with Multi-Account Containers installed, because those may take
  Ctrl+Shift+. or the Ctrl+Shift press (#50 design notes, P2).

**Terminal surface:** dark in both themes (tokens `terminal` / `terminal-foreground`, the ANSI palette
and the cursor and selection tokens, #50 design notes §2), because xterm's default ANSI colours are tuned for a dark background and the
learner's agent output uses them. The focus ring of the terminal frame is checked at 3:1 against both the
page background and `terminal`.

**Success:** commands run in the working folder; the learner can switch between reading and the terminal
by keyboard.

**Error states:**
- WebSocket drops: the terminal frame turns dashed in `warning` and hides the cursor, never dimmed or
  made transparent (`design/system/README.md`, dark-mode rules), status "Соединение с терминалом потеряно.
  Переподключаемся...", and
  reconnects to the same session (#32). After a number of failed retries (parameter
  `TERMINAL_RECONNECT_ATTEMPTS`, set by #32): "Не удалось переподключиться" with "Переподключиться".
  "Переподключиться" starts a new reconnect cycle: the status reads "Соединение с терминалом потеряно.
  Переподключаемся..." again (a text change, so it is announced), the button goes and focus moves to
  "Действия" (R2, R3 row "reconnecting"); the cycle ends connected or with "Не удалось переподключиться"
  and "Переподключиться" again. The check bar's "Переподключиться" works the same way (`checks.md` F13
  error states). Typed input during the drop is not sent and not buffered, because replaying keys into an
  unknown shell state is unsafe.
- The environment stopped underneath (idle stop, limits, platform restart): F10.
- Session expired: F2.
- The shell process exits (`exit`, Ctrl+D): "Сеанс терминала завершён" with "Открыть новый сеанс"; the
  environment keeps running.

**Empty states:** before F8.2 the terminal area shows the F8 status, not an empty black box.

**Exit:** F9.4; leaving the page (the session keeps running in the environment until the idle stop).

**Keyboard path:** as in the steps. Screen readers: xterm.js `screenReaderMode` is on when the OS reports
a screen reader or the learner turns on "Режим для экранного диктора" in "Действия" (research §8).
"Переподключиться" and "Открыть новый сеанс" are the status bar's status action, so `F6` to
"Окружение" lands on them (R3).

**Time limits:** idle stop of the environment, see F10.

## F10: Come back to a stopped environment

**Goal:** close the browser and return later to the same files. Source: learning-process §1 ("Files are
kept in a volume, so you can close the browser and come back later"); ADR-0002; #31 (GC of abandoned
containers, recovery after restart); research §5, §9 (Codespaces separates "stopped, files kept" from
"deleted"); G3.

**Entry:** the learner opens a lesson whose environment was stopped (idle stop, platform restart); or the
environment is stopped by the idle stop while the page is open; or the idle warning appears.

**Steps (4):**

1. F10.1 Idle warning, only when the server reports an idle limit: a non-modal alert in the region
   "Уведомления" (under the top bar, outside both panes, so it is visible whichever pane is shown),
   "Окружение остановится через N мин без активности. Файлы сохранятся." with "Продолжить работу".
2. F10.2 Learner presses "Продолжить работу" (counts as activity) or ignores it.
3. F10.3 After the stop the status bar reads "Окружение остановлено. Файлы в рабочей папке сохранены.
   Запущенные процессы завершены." with "Запустить снова"; the idle warning's text is cleared from
   "Уведомления" (R2; focus moves as R2 says when it was inside).
4. F10.4 Learner presses "Запустить снова" (or opens the lesson again, which starts it automatically,
   F8.1); the terminal opens a new session in the same working folder.

**Success:** the files are as the learner left them; only processes and terminal scrollback are gone, and
the stopped state says so.

**Error states:** restart fails: F8 error states. The volume is gone (GC deleted it, or Docker data was
wiped): "Рабочая папка не найдена, создано новое окружение из исходных файлов урока." appended to
"Окружение работает" in the status text after F8.2 until the next status change, because silently giving the learner starter files would look like lost work with no explanation.

**Empty states:** none.

**Exit:** F10.4 into F9.

**Keyboard path:** `F6` reaches "Уведомления" (R3); focus lands on "Продолжить работу". The warning
is text inserted into the always-present `role="status"` container (R2), announced once, and it does not
steal focus from the terminal. After "Продолжить работу" focus returns where it was (R2).

**Time limits:** the idle limit is a parameter, `ENVIRONMENT_IDLE_STOP_MINUTES`, owned by #31; the design
does not set a number (research §5: none is defined). The warning appears
`ENVIRONMENT_IDLE_WARNING_MINUTES` before the stop (proposed default 5, at least 1; WCAG 2.2 SC 2.2.1 asks
for a warning and at least 20 seconds to extend with a simple action). When #31 defines no idle limit, no
alert is shown and F10 starts at F10.3. Activity means terminal input, a check run or "Продолжить работу"
(#31 decides the server-side signal). Terminal output is not activity in this definition, so an agent
working alone for longer than the limit can be stopped mid-run; #31 should count a running foreground
process or recent output as activity (#50 design notes, P2). A countdown of the session lifetime is not shown
(F2).

## F11: Reset the working folder or restart the environment

**Goal:** start the task over from clean files, or recover a stuck environment without losing files.
Source: task.md "Сброс урока или рабочей папки счётчик не обнуляет" (L1, L3; research §4); #31 (stop,
delete, recovery).

**Entry:** "Действия" menu in the "Окружение" status bar.

**Steps (4):**

1. F11.1 Learner opens "Действия": "Перезапустить окружение", "Сбросить рабочую папку", and the
   checkbox item "Режим для экранного диктора".
2. F11.2 Learner chooses "Перезапустить окружение": no confirmation, because files are kept; the status
   bar goes through "Запускаем окружение" (F8.1) and the terminal opens a new session. The flow ends here
   for a restart.
3. F11.3 Learner chooses "Сбросить рабочую папку": a confirmation dialog (AlertDialog) "Сбросить рабочую
   папку?" with "Файлы урока вернутся к исходным, ваши изменения пропадут. Счётчики попыток не
   обнулятся.", "Сбросить" (destructive) and "Отмена" (default focus).
4. F11.4 After "Сбросить", the environment is recreated from `starter/` (F8.1) and the status text
   reads "Окружение работает" with the appended note "Рабочая папка сброшена" (announced once, until the
   next status change).

**Success:** a running environment with the expected files; attempt counters unchanged.

**Error states:** a check is running: both actions are `aria-disabled` with the reason "Дождитесь
окончания проверки" (R1), because a reset under a running check would grade half-deleted files. The
environment is not running (creating, starting, stopped, an F8 error): both are `aria-disabled` with
"Доступно, когда окружение работает" (R1), because the status bar's own action already starts it.
A run this page does not know of is going (started in another tab, #34 lock): the server refuses the
action, the dialog (if open) closes, nothing is restarted or reset, and the page attaches to the run as in
`checks.md` F13 error states: the check bar announces "Идёт проверка", both items become `aria-disabled`
with "Дождитесь окончания проверки", and focus returns to "Действия". No new text is needed, because the
status line already says why. Recreate fails: F8 error states.

**Empty states:** none.

**Exit:** F11.2 or F11.4 into F9; "Отмена" or Esc returns focus to "Действия".

**Keyboard path:** `F6` to "Окружение" lands on "Действия" (from inside the terminal: Shift+`F6`, then
`F6`), Enter, arrow keys, Enter. In the dialog focus starts on "Отмена"; Tab cycles inside the dialog; Esc
cancels.

**Time limits:** none. The course text's "сброс урока" and "сброс рабочей папки" are one UI action,
"Сбросить рабочую папку" (assumption A11 in the #50 design notes).

## F12: Edit files in the editor (M4)

**Goal:** edit the working folder in a full editor next to the terminal. Source: learning-process §1
("Editor: code-server (arrives in M4)"); #40.

**Entry:** the Редактор tab in the "Окружение" region. The tab exists only once #40 ships; before that
only Терминал is shown, because a tab that does nothing is a dead end.

**Steps (3):**

1. F12.1 Learner switches to the Редактор tab; "Загружаем редактор" while code-server loads.
2. F12.2 Learner edits files of the working folder; the terminal session keeps running in its tab.
3. F12.3 Learner leaves the editor back to the page regions.

**Success:** changes are in the working folder and visible in the terminal.

**Error states:** code-server does not respond: "Редактор не отвечает" with "Перезагрузить редактор";
the environment is stopped: F10.

**Empty states:** none.

**Exit:** F12.3.

**Keyboard path:** not settled: code-server in an iframe keeps its own key handling (research §8, not
verified), so neither `F6` nor the fallback chord may reach the page from inside it. The follow-up DESIGN
issue for the editor tab resolves the leave key before #40 starts (#50 design notes, deferred D5).

**Time limits:** the environment idle stop (F10) applies; editor activity should count as activity (#40).
