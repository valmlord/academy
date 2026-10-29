# Issue #50 design: scope of this PR

ux-researcher, DESIGN tier, `architect` phase (fix round 4 after judge_design round 3; cross-cutting
rules R1-R6 live once in `ia.md`). Inputs:
`plans/50-learner-flows-design-system-research.md` (cited as "research §n"), issue #50, ADR-0006. Outputs
of this phase: `design/flows/ia.md` and eight journey files in `design/flows/` (F1-F19). This file names
what the next phases build in this PR and what they do not.

Notation (as in `ia.md`): `F6` in backticks is the key; F6 plain is the flow. "Environment" is the running
container in every English sentence; `workspace` is only the `lesson.yaml` field name.

## 1. Scope decision

Two candidate cuts (research §10):
- (a) flows + IA + system v1 + dashboard, lesson page, environment shell;
- (b) flows + IA + system v1 + sign-in, dashboard, catalog, lesson page with the environment deferred.

**Decision: flows + IA for every journey, design system v1, and four prototypes: sign-in, dashboard,
catalog, lesson (the lesson page including the environment shell and the v1 check states).** Detail of
the check panel (D1), the quiz, the mentor review, the progress sections and the editor tab is deferred.

Because:
- **Lesson page and environment shell are one route** (learning-process §1; research §10). Designing the
  page now and the shell later means a second PR rewrites the same prototype and its acceptance notes;
  one design for the route is cheaper than two.
- **#31, #32 and #34 are LEARN tasks**: Stepan writes that code himself and should start from a `ready`
  design, not from a stub he has to imagine around (CLAUDE.md section 5). The shell's lifecycle states
  (F8-F11) are exactly what #31 and #32 implement.
- **Sign-in is small (S) and #29 is M0** (research §10): without it #29 starts with one of its two pages
  undesigned. Its states are few (F1), so it adds little review surface.
- **The catalog is needed by #30 (M0)** and is the only page that carries the module view (decision A6);
  it is M, and leaving it out leaves #30 half designed.
- **What makes the cut fit one PR** is pushing the depth, not the pages: the dashboard covers F4 and
  only the course and module progress of F18; the lesson page covers the check bar and the v1 check
  statuses (§2), while attempt limits, closed checks, the budget confirmation and the attempt history go
  to follow-ups. Each deferred part has its own flow already, so the follow-up is a prototype, not new
  research.
- Rejected (a) as worded, because it drops sign-in and catalog, both M0 pages for #29 and #30 that would
  then wait for a second DESIGN PR while #1 and #29 resume.
- Rejected (b), because it designs the lesson route twice and leaves the LEARN tasks without a design.

**M0, before any of #31, #32 and #34 ships: one named state, the "M0 lesson"** (`lesson-environment.md`, "Lesson page
by release"). #30 renders region "Урок" only, full width, with tabs Теория and Задание, the muted line
"Окружение и проверки появятся в следующей версии платформы", no Проверки or Квиз tab, no check bar and
no "Окружение" region. It is its own state rather than two borrowed empty states, because an M0 lesson
does have a `workspace` field and checks: only the platform cannot run them yet, and the learner reading
Задание should know why there is no terminal. #31 and #32 add the region ("M0 lesson with environment",
which drops the line), #34 adds the check bar and the Проверки tab (the v1 lesson).

Order inside the PR (author phase): ui-designer first (tokens, scales, inventory, gallery), then the
product-designer: sign-in, dashboard, catalog, lesson. The lesson prototype is the largest; if
`judge_ux` FAILs only on it, the other three can still be judged on their own merits.

## 2. In scope for this PR

### Flows and IA (done in this phase)

`design/flows/ia.md` (vocabulary with closed status sets and action labels, sitemap, navigation model
including the only statement of the `F6` cycle, page inventory, registry F1-F19 with step counts) and
`auth.md`, `dashboard.md`, `catalog.md`, `lesson-environment.md`, `checks.md`, `quiz.md`, `mentor.md`,
`progress.md`. Every flow in the issue's list has a flow, including those whose prototypes are deferred.

### Design system v1 (ui-designer)

- `design/system/tokens.css`: the shadcn default token set in light and dark (research §7), every token
  the validator requires, the radius steps.
- **Every colour token** is declared in both `:root` and `.dark` and mapped in `@theme inline` as
  `--color-<name>: var(--<name>)` (the validator requires both, `scripts/design_tokens.py`).
- **Every new status token and `terminal`** is a `<name>` / `<name>-foreground` pair, with
  `--color-<name>-foreground: var(--<name>-foreground)` as well. The validator then checks
  `<name>-foreground` on `<name>` at 4.5:1 in both themes by itself (research §6). The terminal palette
  tokens below are the one exception: single colour tokens with no `-foreground`. New pairs:

  | Token pair | Serves | Check statuses (`checks.md`) |
  |------------|--------|------------------------------|
  | `success` / `success-foreground` | pass | "Пройдено" |
  | `warning` / `warning-foreground` | timeout, format error | "Время вышло", "Ошибка формата, попытка не засчитана" |
  | `info` / `info-foreground` | queued, running | "В очереди", "Идёт" |
  | `terminal` / `terminal-foreground` | the terminal surface | - |

  Existing pairs: fail ("Не пройдено"; in D1 also runner error and closed) uses `destructive`; not run
  ("Не запускалась") uses `muted` / `muted-foreground`.
- **Status colours are also used on page surfaces, not only as filled badges**: the status icon in a
  check row and in the check bar is drawn in `success`, `warning`, `info` or `destructive` on `background`
  and on `card`. The words stay in `foreground` or in the badge's own `<name>-foreground`, so status
  colour as text appears only if the ui-designer chooses it. The validator does not check these
  combinations, so the ui-designer reports `python3 -I scripts/design_tokens.py pair <fg> <bg>` runs, with
  the token values, for each of `success`, `warning`, `info`, `destructive` on `background` and on `card`,
  in light and in dark: icon at least 3:1 (WCAG 1.4.11), and text at least 4.5:1 for any of them used as
  text. (`destructive` on `background` is already checked by the validator; on `card` it is not.)
- **`destructive-foreground`** (absent from shadcn's current default theme, research §7): the ui-designer
  decides and records it. If it is added, it follows the pair rule above. If it is not, a fail badge is
  never filled `destructive`: it is the outline Badge with the `destructive` icon and word on `background`
  / `card`, covered by the `pair` runs above.
- **Terminal surface**: dark in both themes. `terminal` and `terminal-foreground` carry the same dark
  values in `:root` and `.dark`, because xterm's default ANSI palette is tuned for a dark background
  (measured 1.26-2.80:1 on a light one, judge report) and the agent's output uses it.
- **Terminal palette tokens** (19 single colour tokens, no `-foreground`; each declared in `:root` and in
  `.dark` with the same value, and mapped `--color-<name>: var(--<name>)`; passed to xterm's `theme` option
  by #32):
  - ANSI: `terminal-ansi-<color>` and `terminal-ansi-bright-<color>` for black, red, green, yellow, blue,
    magenta, cyan, white (16 tokens; xterm `black` ... `brightWhite`).
  - `terminal-cursor` (xterm `cursor`), `terminal-cursor-accent` (xterm `cursorAccent`, the character
    under a block cursor), `terminal-selection` (xterm `selectionBackground`, opaque, because the
    validator gives a translucent surface no contrast).
  - The validator's `check_pairs` pairs only names ending in `-foreground`, so it ignores these; the
    ui-designer reports manual `pair` runs instead, in both themes: every ANSI colour except `black` at
    least 4.5:1 on `terminal`; `terminal-foreground` on `terminal-ansi-black` at least 4.5:1 (`black` is
    a background colour in practice); `terminal-cursor` on `terminal` at least 3:1 (WCAG 1.4.11);
    `terminal-cursor-accent` on `terminal-cursor` at least 4.5:1; `terminal-foreground` on
    `terminal-selection` at least 4.5:1. Focus ring of the terminal frame: drawn
  outside the frame with an offset; `ring` on `background` (validator) and `ring` on `terminal` (`pair`
  run) at least 3:1 in both themes.
- `design/system/README.md`: type scale including a prose style for long markdown (readable line length,
  tables, code blocks; theory.md is 107-163 lines, research §3), spacing, radius, motion (reduced motion
  honoured), focus ring, dark-mode rules, and the `pair` runs above with their output.
- `design/system/components.html`: every component below, both themes.

**Component inventory** used by the four in-scope pages (shadcn names; all confirmed in current shadcn
docs at ui.shadcn.com/docs/components/radix/<name>, consistency judge, round 1):

| Component | Used on | For |
|-----------|---------|-----|
| Button | all | primary and secondary actions, "Повторить" |
| Card | sign-in, dashboard | sign-in form, "Следующий урок" |
| Field, Label, Input | sign-in | email and password |
| Alert | all | errors; in the "Уведомления" region session expired (F2.1) and idle warning (F10.1); prerequisite alert in "Урок" (F6.2) |
| DropdownMenu | top bar, lesson | user menu (F3), "Действия" (F11) with the checkbox item "Режим для экранного диктора"; disabled items `aria-disabled` with a reason line (R1) |
| Breadcrumb | lesson | "Курс" / module / lesson |
| Tabs | lesson | Теория / Задание / Проверки; Терминал (Редактор later); the one-pane switch "Урок / Окружение" (first focusable element of the shown pane's region, `ia.md` R3) |
| Badge | dashboard, catalog, lesson | lesson type; lesson status (`ia.md` set: "Не начат" `outline` with `muted-foreground`, "В процессе" `secondary`, "Пройден" filled `success` / `success-foreground`, "Не пройден" `outline` with the `destructive` icon and word, as the fail badge below; the last is D1 data); module status (`ia.md` set: "Доступен" as the `secondary` variant, "Готовится" as `outline` with `muted-foreground`); check status (filled `<name>` / `<name>-foreground`, or outline for fail, see above) |
| Progress | dashboard | course and module progress (F18.1-F18.2) |
| Item (or a list row composition) | catalog, dashboard | lesson rows, module rows |
| Collapsible | lesson | outcomes "Показать все" / "Свернуть", check row message, "Подробности" |
| Resizable | lesson | split between the panes from 1024 px: drag, a click (or Enter) on the handle cycles the preset splits 50 / 35 / 65 % (WCAG 2.5.7, `disableDoubleClick`), arrow keys 5 %, Home / End; name "Граница панелей" (`lesson-environment.md` F9, "Split handle") |
| ScrollArea | lesson | each pane scrolls on its own |
| AlertDialog | lesson | "Сбросить рабочую папку?" (F11.3); in D1 the budget confirmation of F13.1 reuses it, no new component |
| Spinner | lesson, sign-in | creating / starting environment, running check, "Входим..." |
| Kbd | lesson | the key hint "`F6` или Ctrl+Shift+. (клавиша Ю): следующая область" |
| Tooltip | lesson | icon-only buttons and the split handle ("Перетащите или щёлкните, чтобы сменить ширину") only |
| Skeleton | dashboard, catalog, lesson | loading |
| Empty | dashboard, catalog | first run, planned module |
| Separator | catalog, lesson | sections |

Compositions the product-designer builds from these (no new primitives): top bar, "Уведомления" region,
environment status bar, check bar, check row, prose (markdown), terminal frame. **No toasts**: a message
that disappears on a timer is missed while focus is in the terminal; every confirmation is an inline
status.

### Prototypes and acceptance notes (product-designer)

**Every error and empty state of the listed flow steps is required**, plus the states named in the
table. Each listed step id gets a `data-step` on its element; F3.1-F3.2 (user menu) and F2.1 (the alert
in "Уведомления") appear on every page that has the top bar.

| Slug | `data-step` targets | Required states (explicit list) | Dev issue |
|------|---------------------|-------------------------------|-----------|
| sign-in | F1.1, F1.2, F1.3, F1.4, F2.2, F2.3, F3.3 | default; arrived with `next` (F2.2); empty field "Введите почту" / "Введите пароль"; submitting "Входим..."; wrong credentials; server unreachable; too many attempts (neutral copy); no user, seed hint (F1 empty state); signed out "Вы вышли" | #29 |
| dashboard | F2.1, F3.1, F3.2, F4.1, F4.2, F4.3, F18.1, F18.2 | first run (card "Начать", "Пока нет пройденных уроков"); in progress ("Продолжить"); all ready lessons passed; no ready lessons; course load error; progress unavailable (F4 and F18 error states); session expired alert; user menu open. Recent attempts, weak topics and cost (F18.3-F18.4) are not drawn in any state, not even as a slot (R6, D4) | #29, #1 home |
| catalog | F2.1, F3.1, F3.2, F5.1, F5.2, F5.3, F5.4, F6.1 | ready module with lessons; planned module ("Уроки модуля готовятся"); ready module without ready lessons; both module statuses; the lesson statuses "Не начат", "В процессе", "Пройден", and "Не пройден" as a D1-data state (shown only once checks can close; drawn with sample data so its Badge is reviewed); prerequisite note; course load error; progress unavailable; session expired alert; user menu open. Not-found is not a catalog state (§3) | #30 |
| lesson | F2.1, F2.4, F3.1, F3.2, F6.2, F6.3, F7.1-F7.5, F8.1-F8.4, F9.1-F9.5, F10.1-F10.4, F11.1-F11.4, F13.1-F13.5 (v1 parts; F13.6 is D3) | see the list below | #30, #31, #32, #34 (v1) |

Lesson, required states (each is a flow step or an error or empty state of one):
- M0 lesson (`lesson-environment.md`, "Lesson page by release"): "Урок" only, full width, tabs Теория
  and Задание, the M0 line, no check bar, no "Окружение", at 1280 and 375 px.
- F7: theory; task; outcomes collapsed ("Показать все") and expanded ("Свернуть"); "Содержание" jump;
  text load error "Не удалось загрузить текст урока"; copy denied; no theory (opens on Задание); no
  sources.
- F6.2: prerequisite alert above the theory. F2.1: session expired alert in "Уведомления".
- F8: creating; starting; slow start "Запуск идёт дольше обычного"; running with the key hint; Docker not
  running; image missing; limits hit; environment rejected; API key missing (warning); lesson without the
  `workspace` field (no "Окружение" region).
- F9: terminal focused with the hint; reconnecting; reconnect failed; shell exited.
- F10: idle warning in "Уведомления"; stopped; volume recreated note.
- F11: "Действия" open; items `aria-disabled` with "Дождитесь окончания проверки" and with "Доступно,
  когда окружение работает" (R1); reset dialog; "Рабочая папка сброшена".
- F13 (v1, `command` checks only, R6): before any run (Проверки tab with every check "Не запускалась"
  and the empty text, status line empty); check running (check bar, timer, tab badge, "Проверить"
  `aria-disabled` with "Дождитесь окончания проверки"); results with every v1 check status of the
  `checks.md` table ("Не запускалась", "В очереди", "Идёт", "Пройдено", "Не пройдено", "Время вышло",
  "Ошибка формата, попытка не засчитана"); an open row with the grader message and "Неудачных попыток:
  3" (no mentor or hint offer); "Урок пройден"; "Проверить" `aria-disabled` with "Окружение запускается,
  проверка станет доступна после запуска"; "Проверить" `aria-disabled` with "Сначала запустите
  окружение" and "К окружению"; lesson with no check the platform runs (no check bar, no Проверки tab).
  No quiz row, no "Пройти квиз", no mentor or hint control.
- Layout: two panes at 1280 px; one-pane mode with the switch "Урок / Окружение" and the check bar at 768
  and at 375 px (and 320 px reflow), each pane shown; the switch tab marked when the hidden environment
  is stopped or failed; "Открыть результаты" and "К окружению" switching the area (R3); after a run
  with the environment stopped, "Проверить" `aria-disabled`, "К окружению", "Открыть результаты" in that
  order (F13.4); the split handle with its tooltip, focused, and after a click cycled to the next preset
  (F9.3).

Check statuses: **v1** (lesson prototype) "Не запускалась", "В очереди", "Идёт", "Пройдено", "Не
пройдено", "Время вышло", "Ошибка формата, попытка не засчитана". **D1**: "Не удалось запустить проверку"
(runner error), "Закрыта: не пройдено" (closed), the variant "Не пройдено: исчерпан бюджет $N"; row notes
"Осталась 1 попытка" and "Неудачных попыток: N из M". Every set is in `ia.md`, "Closed status sets".

Acceptance notes state the breakpoints of decision A8 for 375, 768 and 1280 (ADR-0006) and rules R1-R6 of
`ia.md`: the disabled controls of R1, the live containers of R2, the `F6` landing table of R3 for every
state drawn, the landmarks and Tab order of R4.

### Controls and their v1 destinations

Every button and link of the in-scope pages (sign-in, dashboard, catalog, lesson with environment and
checks). A control with no v1 destination is not shown (R6) and is listed at the end.

| Page / area | Control | v1 destination |
|-------------|---------|----------------|
| every page | "К содержимому" | focus on `main` (R4) |
| top bar | "Академия", "Главная" | dashboard |
| top bar | "Курс" | catalog |
| top bar | user menu button | opens the menu (F3.1) |
| top bar | "Выйти" | sign-in with "Вы вышли" (F3.3) |
| Уведомления | "Войти снова" | `/sign-in?next=<current path with tab>` (F2.2) |
| Уведомления | "Продолжить работу" | warning cleared, idle timer reset, focus back (R2) |
| sign-in | "Войти" | `next` or dashboard (F1.4); errors stay on sign-in |
| sign-in | "Повторить" (server unreachable) | sends the form again (F1.3) |
| dashboard | "Начать" | lesson, tab Теория (Задание without theory) |
| dashboard | "Продолжить" | lesson, tab Задание |
| dashboard | "Открыть курс" (all passed) | catalog |
| dashboard | "Повторить" (course load error) | reloads the card |
| dashboard | "Повторить" (progress section) | reloads the progress section (F18) |
| dashboard | module row (F18.2) | catalog, that module's section heading (F5.2) |
| catalog | module link (F5.1) | that module's section heading, focus moved |
| catalog | lesson row | lesson, tab Теория (Задание without theory) |
| catalog | prerequisite link (F6.1) | that lesson |
| catalog | "Повторить" | reloads the course |
| lesson, Урок | breadcrumb "Курс" | catalog |
| lesson, Урок | module crumb | catalog, that module's section |
| lesson, Урок | lesson crumb | none: current page, not a link |
| lesson, Урок | "Показать все" / "Свернуть" | expands / collapses the outcomes |
| lesson, Урок | prerequisite link (F6.2) | that lesson |
| lesson, Урок | tabs Теория, Задание, Проверки | that tab panel; `?tab=` updated |
| lesson, Урок | "Содержание" link | that heading, focus moved (F7.3) |
| lesson, Урок | "Копировать" | clipboard; on denial the button reads "Не скопировано, выделите текст вручную" |
| lesson, Урок | source link in "Источники" | the external page in a new browser tab |
| lesson, Урок | "Повторить" (text load error) | reloads the tab's text |
| lesson, Проверки | check row (disclosure) | expands the grader message and counter (F13.5) |
| lesson | one-pane switch "Урок" / "Окружение" | shows that pane (A8) |
| lesson | split handle | drag resizes; a click or Enter cycles the presets 50 / 35 / 65 %; arrows, Home, End (F9.3) |
| lesson, Проверка | "Проверить" | runs the `command` checks (F13.2); `aria-disabled` states do nothing (R1) |
| lesson, Проверка | "К окружению" | "Окружение" status action, area switched in one-pane mode |
| lesson, Проверка | "Открыть результаты" | tab Проверки heading, area switched to "Урок" in one-pane mode |
| lesson, Окружение | "Повторить" (Docker, image) | starts again (F8.1) |
| lesson, Окружение | "Запустить снова" | starts the stopped environment (F8.1 "Запускаем окружение") |
| lesson, Окружение | "Открыть курс" (rejected) | catalog |
| lesson, Окружение | "Подробности" | expands the raw error |
| lesson, Окружение | "Действия" | opens the menu (F11.1) |
| lesson, Окружение | "Перезапустить окружение" | F11.2, status "Запускаем окружение" |
| lesson, Окружение | "Сбросить рабочую папку" | the dialog (F11.3) |
| lesson, Окружение | "Сбросить" / "Отмена" | F11.4 / dialog closed, focus on "Действия" |
| lesson, Окружение | "Режим для экранного диктора" | toggles xterm `screenReaderMode` |
| lesson, Окружение | "Переподключиться" | reconnects (F9 errors, "Соединение с терминалом потеряно. Переподключаемся...") |
| lesson, Окружение | "Открыть новый сеанс" | a new shell in the same environment |
| lesson, Окружение | tab Терминал | the terminal (F9) |

Not shown in v1, because they have no destination yet (R6): Квиз tab, quiz check rows, "Пройти квиз",
"Отправить ответы" (#36, D2); "Разобрать с ментором", "Ответить", "Попросить подсказку", "Следующая
подсказка" (#37, D3); "Запустить" / "Отмена" of the budget confirmation and "Подробности" / "Повторить" of
a runner error (#39 and D1); recent attempt links, "История попыток" (#35, D4); Редактор tab, "Перезагрузить
редактор" (#40, D5); Agent tab (D6). Not-found's "Открыть курс" leads to the catalog but is prototyped
with the app shell later (§3).

## 3. Not designed in this PR

### Deferred to follow-up DESIGN issues

| Id | Proposed issue title | Covers | Dev issue waiting |
|----|----------------------|--------|-------------------|
| D1 | docs(design): check panel detail: attempts, limits and closed checks | F13.1 budget confirmation (AlertDialog), F13.5 counters "N из M", F14 all, the D1 statuses of §2, stream drop, a run in another tab, hidden-task budget states | #34 (LEARN, M1; must be `ready` before Stepan starts), #39 |
| D2 | docs(design): quiz prototype | F15 all, the Квиз tab | #36 |
| D3 | docs(design): mentor review and hint ladder prototypes | F16, F17; the review block in Проверки | #37, #38 |
| D4 | docs(design): progress, attempt history, weak topics and cost | F18.3-F18.4 on the dashboard, F19 on the lesson page (its empty text is in the v1 lesson prototype) | #35 |
| D5 | docs(design): editor tab | F12, including the key that leaves the code-server iframe (research §8, not verified) | #40 |
| D6 | docs(design): agent transcript panel | the "Agent" tab of learning-process §1 ("later a separate panel with the transcript") | none yet (#38 stores transcripts, names no UI) |

Order by need: D1 before #34 starts; D2-D4 before M2; D5 before M4; D6 when a dev issue exists.

### Out of scope entirely

Sign-up, password reset, account settings, admin and multi-user features, marketing pages, a home page
with several courses beyond #1's stub (the dashboard lists the one course), the not-found state as a
prototype (an app-shell state with the top bar; its copy is in `catalog.md` F5 and it is prototyped with
the app shell later; no in-scope prototype shows it), any app code, the lesson contract.

### Proposed dev follow-ups (not design work)

- **P1, lesson contract gap**: attempt limits ("не больше 10 неудачных проверок", "Квиз: не больше 3
  попыток", bug-hunt 3 graded submissions) and the mentor threshold ("после 5 неудачных") exist only in
  task.md prose (research §4, open question 1), so neither the UI nor the server can read them. Proposed
  issue: "feat(lesson-schema): attempt limits and mentor threshold per check" (ADR-0001 update, Stepan
  approves, migrates the six module 00 lessons). This PR does not change the contract; the flows show "из
  N" only when the limit is known (A13). Waiting on it: D1, #34, #36.
- **P2, parameters and acceptance tests for #31 and #32** (comments on those issues, no new issue):
  - #31: `ENVIRONMENT_IDLE_STOP_MINUTES`, `ENVIRONMENT_IDLE_WARNING_MINUTES` (proposed 5),
    `ENVIRONMENT_START_SLOW_SECONDS`; count a running foreground process or recent terminal output as
    activity, because otherwise an agent working alone is stopped mid-run (F10 time limits); keep a
    durable per-lesson flag "terminal input recorded" (set on the first input, never cleared, not even by
    "Сбросить рабочую папку"), because R5 reads it after the environment is stopped or deleted.
  - #32: `TERMINAL_RECONNECT_ATTEMPTS`; intercept `F6` / Shift+`F6` and Ctrl+Shift+. / Ctrl+Shift+, in a
    capture-phase listener before xterm.js; the ANSI palette tokens in xterm's `theme`; the hint tied to
    xterm's textarea with `aria-describedby`. **Acceptance test**: from the focused terminal each of the
    four keys moves focus to the expected region (`ia.md` R3) in the latest stable Chrome,
    Firefox and Safari on macOS and in Chrome and Firefox on Linux or Windows; the fallback chord must
    pass in all of them, and a browser where `F6` fails drops `F6` from the hint. The matrix runs each key
    twice more: with the Russian layout active, and with a Ctrl+Shift layout switch turned on (Linux,
    Windows); and once in Firefox with Multi-Account Containers, which may reserve Ctrl+Shift+. It also
    runs `F6` with the split handle focused: focus goes to the next region, not to another separator
    (react-resizable-panels binds `F6` on a focused separator, F9 "Split handle").
- **P3, no issue runs `bug-hunt` checks**: #34 runs `command`, #36 `quiz`, #37 `rubric`, #39
  `hidden-task`; nothing in `backlog/` covers `bug-hunt` (L4 `04-context-and-planning`). Until an issue
  does, its rows stay hidden (R6) and L4 can pass on its other checks only. Proposed issue: "feat(checks):
  run bug-hunt checks against the answer key".

## 4. Assumptions for Stepan to confirm

None blocks the next phase; each is the default the flows use.

| Id | Question (research §11) | Default | Because |
|----|-------------------------|---------|---------|
| A1 | Russian term for the environment | "окружение" (English "environment") for the running container, "рабочая папка" for its files; actions "Перезапустить окружение", "Сбросить рабочую папку"; `workspace` only as the `lesson.yaml` field name | "окружение" already appears in course prose (research §2); two different words keep the two resets distinguishable, where "рабочее окружение" next to "рабочая папка" would blur them; one English word stops docs drifting between "workspace" and "environment" |
| A2 | Key that leaves the terminal | `F6` / Shift+`F6`, with the fallback Ctrl+Shift+. / Ctrl+Shift+,; one cycle Верхняя панель, Уведомления, Урок, Проверка, Окружение (`ia.md` R3); hint visible in the status bar, naming the physical key "(клавиша Ю)" for the Russian layout, and tied to the terminal with `aria-describedby`; "`F6` (Fn+`F6`)" on macOS | Esc, Tab, Ctrl+B and the Ctrl+X chords belong to Claude Code, Ctrl+M is Enter (code.claude.com/docs/en/keybindings, research §8); VS Code uses `F6` for the same job; browsers may keep `F6`, so a chord Claude Code does not bind backs it up, verified by the #32 acceptance test (P2) |
| A3 | Sidebar Ctrl+B clash | no sidebar on any page; a top bar instead | four pages do not need a sidebar, the lesson page needs the width, and the clash disappears instead of being managed |
| A4 | Idle / TTL warning without a value | parameters `ENVIRONMENT_IDLE_STOP_MINUTES` (#31 sets it) and `ENVIRONMENT_IDLE_WARNING_MINUTES` (proposed 5); non-modal alert in "Уведомления" with "Продолжить работу"; no alert if no limit exists; no session countdown | research §5 found no value; the design must not invent one; WCAG 2.2.1 asks for a warning with a simple way to extend, visible whichever pane is shown; the 7-day rolling session rarely ends mid-use |
| A5 | Do prerequisites lock lessons | warn, never lock | one adult learner who may know the topic; a lock needs reliable progress, which M0 lacks |
| A6 | Module page as own route | no: a section of the catalog with an anchor | five of six modules are `planned` and would be empty pages; one page shows the whole course |
| A7 | Progress as own page | no: dashboard section (F18) plus lesson attempt history (F19) | learning-process §4 puts progress on the dashboard; a lesson's history belongs where its next attempt happens |
| A8 | Behaviour by width | lesson page: from 1024 px two resizable panes; below 1024 px down to 320 px one pane at a time with the switch "Урок / Окружение", the terminal reflowing and the check bar always present. Other pages: one column at every width | a 1280 px laptop at 200 % zoom is 640 CSS px, so removing the environment or "Проверить" at narrow widths would remove the task's core function under zoom (WCAG 1.4.4, 1.4.10); one pane keeps every function at the cost of switching |
| A9 | Course percentage and "passed" | a lesson is passed when all its checks are passed, finished when all are passed or closed; percentage counts passed `ready` lessons; check `weight` is not used for it | no source says how weight aggregates (open question 10); lesson counts are what the learner reads |
| A10 | When the environment starts | automatically when a lesson with the `workspace` field opens | the learner opened the lesson to practise; #31 create is idempotent; the start hides behind reading |
| A11 | "Сброс урока" vs "сброс рабочей папки" in task.md | one UI action, "Сбросить рабочую папку"; counters are never reset | the course text names two resets but describes one effect; a LESSON-tier wording fix can align task.md later |
| A12 | When the mentor review runs | on request ("Разобрать с ментором"), plus automatically once a check closes | each review costs money (#37); task.md promises a review after a closed check |
| A13 | Attempt limits | shown as "N из M" only when the server supplies M; otherwise the count alone | the limits are not in the contract (P1) |
| A14 | Show a check's `run` command | no | it is a grader path into `$ACADEMY_CHECKS_DIR`, meaningless to the learner (open question 7) |
| A15 | Agent tab in v1 | not shown; the agent runs in the terminal | learning-process §1 says the Agent tab is the terminal at first; a tab that does nothing is a dead end (D6) |
| A16 | Where the quiz and the review live | the lesson's left pane (Квиз tab; review in Проверки) | both are checks of the lesson, and learning-process §1 puts results and review on the left |
| A17 | Switch to Проверки when a run starts | no; the check bar shows progress and "Открыть результаты" at the end | runs last 30 s to an hour; pulling the learner off the theory or terminal interrupts work |
| A18 | Dashboard "Продолжить" target tab | "Начать" opens Теория, "Продолжить" opens Задание; both buttons and the lesson status "В процессе" follow one rule, R5 in `ia.md`: a lesson is started when an attempt exists or terminal input was recorded | the last open tab lives only in the lesson URL; the automatic environment start (A10) happens on any open, so it cannot mean the learner is practising, while an attempt or typed input does |
| A19 | Check kinds whose runner has not shipped | not listed, not run, not counted in "Пройдено: N из M" or the lesson status (R6); a lesson with none left renders as a lesson with no checks | a row the learner cannot act on is a dead end (A15); counting it would keep every module 00 lesson from passing in v1, since five of six have a quiz. When a runner ships, its checks join, and a lesson passed earlier shows "В процессе" until they pass |
