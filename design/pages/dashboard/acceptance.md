# Dashboard: acceptance notes

## Route

`/` (title and h1 "Главная").

## Prototype

`design/pages/dashboard/prototype.html`. States by `#state-<name>`; the "Prototype states" bar at the
bottom and its "Dark theme" button are prototype chrome, not product UI.

## Flows

| Step | Element (`data-step`) |
|------|-----------------------|
| F2.1 | the session Alert inside the `role="alert"` container of "Уведомления" |
| F3.1 | the user menu button in the top bar (shows the email) |
| F3.2 | the menu item "Выйти" |
| F4.1 | the "Следующий урок" Card (from #220 with the Card course's name under its heading, `ia.md` A218-7) |
| F4.2 | the Card footer holding the one button |
| F4.3 | the button link: "Начать" opens the lesson on Теория (Задание when it has no theory), "Продолжить" on Задание (`?tab=task`) |
| F18.1 | from #220: the course line of a course block (a `p`, "Пройдено уроков: N из M" or "Пока нет пройденных уроков") and its Progress, `data-step` in the first block; until #220 (kept states): the h2 `#progress-heading` and its Progress, which carry no `data-step` (one element per step) |
| F18.2 | the module rows list of a course block (`data-step` in the first block; until #220 the one list of the kept states) |
| F20.1 | from #220: the course blocks together (`.course-blocks`) |
| F20.2 | from #220: one course block, the `section` of the first course |
| F20.3 | from #220: the first block's next-lesson link "Следующий урок: <lesson title>" (`courses-two`, `attempts-two-courses`) |
| F20.4 | from #220: the first block's heading h2 (its link opens the course's catalog; a module row opens a module section) |
| F21.1 | from #220: block 2's Alert in the error form ([ES1](../../flows/ia.md#ES1)), `courses-one-broken` and the states drawn on its data (States) |
| F21.2 | from #220: block 2's "Повторить" in `courses-one-broken` (one element; the other states draw the same button for their outcome) |
| F21.3 | from #220: block 2's h2 `#course-zz-stub-course-heading`, the [RO1](../../flows/ia.md#RO1) focus target of the re-read ([RR1](../../flows/ia.md#RR1)); [RO2](../../flows/ia.md#RO2) and [AN1](../../flows/ia.md#AN1): Interactions and keyboard |
| F18.3 | the `section` "Последние попытки" (from #35) |
| F18.4 | the `section` "Где трудно" (from #35) |
| F18.5 | the `section` of the total "Потрачено на проверки и разборы: ..." (from #37) |

F4.1-F4.3 and F18.1-F18.2: from #30. Before #30 the page has elements only for F2.1, F3.1 and F3.2 (`ia.md` R6,
"Before the catalog ships").

By release (`ia.md` R6, "Progress by release (#72)"; `dashboard.md` "Dashboard by release"): from #30 no
element of F18.3-F18.5 is drawn, not even as an empty slot (states `courses-two`, `courses-one-empty`,
`courses-all-passed`, `all-finished`, `first-run`, `in-progress`, `all-passed`, `no-ready-lessons`, `loading`,
`session-expired`, `user-menu`); from #35 F18.3 and F18.4 are drawn with their empty texts and no cost element
anywhere (the states labelled "#220, #35 ..."); from #37 also the attempt cost in the rows that spend and the
total F18.5, "$0.00" included (the states labelled "#220, #37 ...").

From #220 (`dashboard.md` "Dashboard by release", item "From #220"; `courses.md` F20, F21): the page of `ia.md`
"Several courses (#218)" with the states of `ia.md` [Error and focus states (#222)](../../flows/ia.md#errors-222),
and #35 and #37 add F18.3-F18.5 to it. The prototype draws every #30, #35 and #37 state in that form (label
"#220, ..."), and the error states of #222 at one course and at two (label "#220, ..." with the rule ids); the
five kept states (label "..., until #220") keep today's form; `before-catalog` is drawn as before. Classes and
labels: States.

## Status

Status: ready

## Purpose

Say in one look what to study next and open it (F4); show course and module progress (F18.1-F18.2); from
#35, the five newest attempts and the checks where the learner stumbles, each one link into the lesson's
Проверки tab (F18.3, F18.4); from #37, what checks and mentor reviews have cost (F18.5). From #220, every
course of the root with its progress and its way to the next lesson and to its catalog (F20), and the retry
of a block in the error form (F21).

## Layout and breakpoints

One column at every width (decision A8): top bar, "Уведомления" (only with an alert), then `main`. Content
column `max-width: 48rem` inside the page container (`72rem`, gutter `space-4`), gap `space-8`.

From #220, `main` follows `ia.md` "Rules (#218)" row "dashboard order": h1, the Card or the end Card (A218-2),
the course blocks (row "course block"), then from #35 "Последние попытки" and "Где трудно" and from #37 the
total. The blocks are `space-8` apart, and the first #35 part is `space-8` below the last block. Inside a
block, `space-2` apart: the heading (h2 at `text-lg`, the page rule `.progress-course > h2`, with the system
heading link `.heading-link`), the next-lesson link (a `p` holding one `a`), the course line (a `p`) with its
Progress, the module rows; in the empty form the heading and the Empty text. Part headings of #35 and #37
("Последние попытки", "Где трудно", the total) are h2 at `text-lg`, `space-2` above what follows them
(`.stack[data-gap="2"]`, as the lesson history).

From #220, the error states (`ia.md` [Error and focus states (#222)](../../flows/ia.md#errors-222)): the root error's Alert
stands in the Card's place ([ES2](../../flows/ia.md#ES2)); the progress error ([ES3](../../flows/ia.md#ES3)) is a `.stack[data-gap="2"]`
(its h2, then "Повторить") between the Card and the first block, `space-8` from each; a block in the error form
([ES1](../../flows/ia.md#ES1)) holds its h2 and then its Alert, `space-2` apart, like the other block forms; the dashboard
status container ([ES6](../../flows/ia.md#ES6)) takes no space (`.sr-only`).

Until #220 (the kept states, and today's app; replaced by the rows above from #220): h1, the Card, the
progress section (before #30 h1 and the Empty "В курсе пока нет готовых уроков", `ia.md` R6). Inside the
progress section, in this order: the course line (an h2), the module rows, from #35 "Последние попытки" and
"Где трудно", from #37 the total; the parts are `space-4` apart and each part from #35 on has `space-4` more
above it (`space-8` in all).
- 1280 and 768: the column sits at the left of the page container; module rows (from #30) show title, "N из
  M уроков" and a bar, or the "Готовится" Badge at the right (no sample module is planned: every module of
  the basis is `ready`, so the prototype draws no Badge). An attempt row (from #35) shows the status icon
  at the left, then three lines: the lesson title (`font-weight` 500), the date and time, the summary (from #37
  with ". Потрачено: ..." on the same line), both muted `text-sm`. A "Где трудно" row shows three lines: the
  check title (500), the lesson title, then "Закрыта: не пройдено" or the counter (muted `text-sm`), no icon.
  From #220 with two or more course blocks each row has one more muted line, the course name, after the
  lesson title (A218-13; `attempts-two-courses`).
- 375: the same column at full width; titles wrap; the top bar stays one row (the system rule: the email
  is cut at 6rem below a 480px viewport, the button's accessible name stays the full email; at 320 the
  user button wraps to a second row). No horizontal scroll at
  320, 375, 768, 1280 in any state (checked headless in every state, light and dark, including the long check
  titles of "Где трудно", which wrap). A long course name wraps inside its heading link, the Card and the
  F18 rows: with a 120-character name, no horizontal scroll at 320 px and at 640 px (1280 px at 200 % zoom),
  light and dark (AC70).

## Components

| shadcn | Usage |
|--------|-------|
| Card | "Следующий урок"; the end Card "Все доступные уроки пройдены", from #220 also "Все доступные уроки завершены". From #220 both name the Card course in `.card-description` under the title (A218-7), in every state with a Card; not focusable |
| Button | "Начать" / "Продолжить" (default, as a link), "Открыть курс" (outline, link), "Повторить" (secondary, sm) |
| Badge | lesson type (`outline`, e.g. "артефакт"); module status "Готовится" (`outline`, `data-tone="muted"`) |
| Progress | course bar (`role="progressbar"`, labelled by the course line, `aria-valuetext` "N из M"): from #220 one per readable block that shows its course line (not under [ES3](../../flows/ia.md#ES3)), labelled by that block's `p` (`#course-<courseId>-line`); until #220 labelled by the h2 `#progress-heading`. Module bars inside the row links are `aria-hidden` (the row text already says "N из M уроков") |
| Item | module rows, each one link to the catalog section (from #220 in each readable block, not under [ES3](../../flows/ia.md#ES3)); from #35 the "Последние попытки" rows and the "Где трудно" rows, each one link (`a.item`) in an `ul.item-group` |
| Alert | until #220 the course load error (destructive, static; its title is an h2, `tabindex="-1"`); from #220 the block error form ([ES1](../../flows/ia.md#ES1): destructive, static, its title an h3 `.alert-title.text-sm`) and the root error ([ES2](../../flows/ia.md#ES2): the same Alert, its title an h2); session expired in "Уведомления" (destructive). No Alert in `main` carries a live role |
| DropdownMenu | user menu: label with the email and "Выйти" (link item) inside one `role="group"` named by the label (`aria-labelledby`, label `role="presentation"`), as in `components.html` |
| Empty | "В курсе пока нет готовых уроков": from #220 inside a block in the empty form (`.empty-description` only), before #30 in `main` (`.empty-title`); from #35 the empty texts "Попыток пока нет" and "Пока нет проверок, которые не удаются" (`.empty-description` only, no title), each in place of its `ul` |
| Skeleton | loading; from #35 also over F18.3-F18.5 |

Card, Badge, Progress, Item, Skeleton and the Button uses in the table above ("Начать" / "Продолжить",
"Открыть курс", "Повторить") appear from #30. Before #30 the page uses Empty, the session Alert with its
action "Войти снова" (a Button) and the DropdownMenu of the user menu with its ghost Button trigger.

Heading link (`design/system/README.md` "Links", `.heading-link` in `proto.css`), from #220: the block h2,
whose whole text is one link to its course's catalog; it keeps the h2 size of the page rule (`text-lg`) and
weight, the heading's colour, the underline of every link, and is an `inline-block`, so a long name wraps
inside it (measured in AC71).

Custom pieces (`design/system/README.md`): `.status-icon` at the left of each attempt row (from #35,
`aria-hidden`), with the `data-status` its summary maps to (A72-8): `running-still` for "Идёт проверка",
`warning` for "Сбой проверки, попытка не засчитана" and for "Пройдено проверок: N из M" whose note count equals
M - N, `success` for "Пройдено проверок: M из M", `destructive` for "Пройдено проверок: N из M" whose note count
is below M - N (no note counts 0). In the app `running-still` is lucide `LoaderCircle` without the spin class.
From #220 the dashboard status container ([ES6](../../flows/ia.md#ES6)) is a `div.sr-only` with `role="status"` and
`aria-live="polite"` (`#dashboard-status` in the prototype). In the block error form the h2 keeps `.heading-link` but
holds the course name as plain text, no link ([ES1](../../flows/ia.md#ES1)).
`.sr-only-inline` holds the ". " joins of the row names (the inline visually hidden piece, so the computed name has no space before the full stop; never `.sr-only`, whose absolute positioning makes Chromium add one). `<time datetime>` holds each date.

Compositions: top bar, "Уведомления" (R2), and the "Прогресс недоступен" line (see Accessibility notes).

## States

Every state belongs to one release class, shown in its label in the "Prototype states" bar: **from #220**
(label "#220, ..."; the #220 top bar, A218-3, and the page of "Several courses (#218)"), **kept until
#220** (label "..., until #220": today's form, with "Курс" in the top bar, ia.md R6 "Top bar by release",
and the course line h2 `#progress-heading`; their from-#220 forms are the error states of #222 below), and
**past** (`before-catalog`).

Sample data, every class: course 1 `ai-for-developers` "ИИ для разработчиков" as `course/` holds it: six
modules, all `ready`, with 6, 7, 5, 6, 8 and 5 `ready` lessons (37). Course 2 is the #217 stub
`zz-stub-course` "Пробный курс" (sorts after course 1, `courses.md` Q5): one module "Пробный модуль", one
lesson "Пробный урок" (артефакт, около 15 мин), one check "Пробная проверка", no attempt limit; "stub
empty" is the same course with that lesson not `ready`.

| State | Anchor | Class | What shows |
|-------|--------|-------|------------|
| two courses | `#state-courses-two` | from #220 | Card (A218-2: course 2, enrolled after course 1's newest attempt): "Пробный курс", "Пробный урок", "Пробный модуль", "около 15 мин", "Начать". Block "ИИ для разработчиков": "Следующий урок: Устройство агента: цикл, харнесс, инструменты, MCP" (A218-4), "Пройдено уроков: 1 из 37", module rows ("1 из 6 уроков", then "0 из N уроков"). Block "Пробный курс": no next-lesson link (A218-5), "Пока нет пройденных уроков", row "Пробный модуль" "0 из 1 уроков". F20.1-F20.4 |
| two courses, course 2 without ready lessons | `#state-courses-one-empty` | from #220 | Card: course 1 "ИИ для разработчиков", lesson 02 "Устройство агента: цикл, харнесс, инструменты, MCP", "около 60 мин", "Продолжить". Block 1 without a next-lesson link (A218-5), "Пройдено уроков: 1 из 37", module rows. Block "Пробный курс" in the empty form: its heading and "В курсе пока нет готовых уроков" |
| two courses, all passed | `#state-courses-all-passed` | from #220 | end Card "Все доступные уроки пройдены" of course 1 (A218-2), "ИИ для разработчиков", "Открыть курс". Block 1 "Пройдено уроков: 37 из 37", every row "N из N уроков"; block 2 "Пройдено уроков: 1 из 1", "1 из 1 уроков"; no next-lesson link |
| #35 two courses | `#state-attempts-two-courses` | from #220, from #35 | Card: course 2, "Пробный урок", "Продолжить" (R5). Block 1 with "Следующий урок: Устройство агента: цикл, харнесс, инструменты, MCP", "Пройдено уроков: 1 из 37"; block 2 "Пока нет пройденных уроков". "Последние попытки": "Пробный урок. Пробный курс. 5 ноября, 15:45. Пройдено проверок: 0 из 1" and the same at 15:30 (both `destructive`), then rows 1-3 of `attempts`, each with "ИИ для разработчиков" after the lesson title (A218-13). "Где трудно": "Пробная проверка. Пробный урок. Пробный курс. Неудачных попыток: 2" first, then the three rows of `attempts`, each with "ИИ для разработчиков" after the lesson title. No cost |
| all finished, one not passed | `#state-all-finished` | from #220 | end Card "Все доступные уроки завершены" (A218-2), "ИИ для разработчиков", "Открыть курс". One block: "Пройдено уроков: 36 из 37"; "Работа с legacy-кодом" "4 из 5 уроков" (sample: its one closed lesson not passed), every other row "N из N уроков" |
| first run (default) | `#state-first-run` | from #220 | Card: first lesson of the first module, "ИИ для разработчиков", "Начать". One block: heading, no next-lesson link (A218-5), "Пока нет пройденных уроков", bar 0, rows "0 из N уроков" |
| in progress | `#state-in-progress` | from #220 | Card: the started next lesson (sample: 02 "Устройство агента: цикл, харнесс, инструменты, MCP", около 60 мин; 01 passed, the story of the catalog default), "Продолжить"; block "Пройдено уроков: 1 из 37", module 00 "1 из 6 уроков" |
| all ready lessons passed | `#state-all-passed` | from #220 | end Card "Все доступные уроки пройдены", "ИИ для разработчиков", "Открыть курс"; block "Пройдено уроков: 37 из 37" |
| no ready lessons | `#state-no-ready-lessons` | from #220 | no Card (A218-2); one block in the empty form: heading link "ИИ для разработчиков" and "В курсе пока нет готовых уроков" (sample variant: the course has no `ready` lesson) |
| loading | `#state-loading` | from #220 | Skeletons for the Card and one block (`aria-hidden`; "Rules (#218)" row "loading") |
| session expired (F2.1) | `#state-session-expired` | from #220 | in-progress content plus the Alert in "Уведомления" with "Войти снова" |
| user menu open (F3.1) | `#state-user-menu` | from #220 | in-progress content with the user menu open |
| #35 first run | `#state-attempts-first-run` | from #220, from #35 | as first run, plus "Последние попытки" with "Попыток пока нет" and "Где трудно" with "Пока нет проверок, которые не удаются"; no cost |
| #35 first attempt running | `#state-attempts-running-first` | from #220, from #35 | as first run, but the Card's button "Продолжить" (R5: an attempt of the lesson exists); "Последние попытки" one row: "28 октября, 13:30. Идёт проверка" (`running-still`; read in that year, so no year); "Где трудно" empty text |
| #35 three attempts | `#state-attempts-mixed` | from #220, from #35 | as in progress; "Последние попытки" three rows (only three attempts exist): "4 ноября, 14:05. Пройдено проверок: 1 из 2. Проверок с незасчитанной попыткой: 1" (`warning`), "4 ноября, 13:50. Сбой проверки, попытка не засчитана" (`warning`), "28 октября 2025, 13:30. Пройдено проверок: 1 из 1" (`success`, with the year); "Где трудно" empty text |
| #35 recent attempts and "Где трудно" | `#state-attempts` | from #220, from #35 | as in progress; "Последние попытки" five rows, newest first: "5 ноября, 15:20. Идёт проверка" (`running-still`), "5 ноября, 15:05. Пройдено проверок: 1 из 3. Проверок с незасчитанной попыткой: 2" (`warning`), "5 ноября, 14:50. Пройдено проверок: 0 из 3. Проверок с незасчитанной попыткой: 2" (`destructive`), "5 ноября, 14:35. Пройдено проверок: 0 из 3. Проверок с незасчитанной попыткой: 3" (`warning`), "5 ноября, 14:20. Пройдено проверок: 0 из 3" (`destructive`); "Где трудно" three rows of lesson 02: "Неудачных попыток: 9 из 10", "Неудачных попыток: 3", "Закрыта: не пройдено"; no cost |
| #35 attempts, "Где трудно" empty | `#state-attempts-weak-none` | from #220, from #35 | the rows and links of `attempts`; "Где трудно" empty text |
| #35 loading | `#state-attempts-loading` | from #220, from #35 | the Skeleton of `loading` extended over F18.3-F18.4 (`aria-hidden`) |
| #37 first run | `#state-cost-first-run` | from #220, from #37 | as `attempts-first-run`, plus "Потрачено на проверки и разборы: $0.00" and "Расход агента в терминале сюда не входит" |
| #37 cost | `#state-cost` | from #220, from #37 | as `attempts`, but the fifth row reads "5 ноября, 14:20. Пройдено проверок: 2 из 5. Потрачено: $0.08" (`destructive`); no cost on rows 1-4; total "Потрачено на проверки и разборы: $1.24" and the note |
| #37 cost at least | `#state-cost-at-least` | from #220, from #37 | as `cost`, but row 5 "... Пройдено проверок: 2 из 5. Потрачено: не меньше $0.04", total "Потрачено на проверки и разборы: не меньше $1.20" |
| #37 cost no data | `#state-cost-no-data` | from #220, from #37 | as `cost`, but row 5 "... Пройдено проверок: 2 из 5. Потрачено: нет данных", total "Потрачено на проверки и разборы: нет данных" |
| one course cannot be read | `#state-one-course-error` | from #220 | [ES1](../../flows/ia.md#ES1) at one course: no Card; the block "ИИ для разработчиков" in the error form (h2 plain text, Alert h3 "Не удалось загрузить курс", "Повторить"). "Повторить": [RO1](../../flows/ia.md#RO1), to `first-run`, focus on the block h2 |
| one course cannot be read, "Повторить" fails again | `#state-one-course-error-fails-again` | from #220 | as `one-course-error`; "Повторить": [RO2](../../flows/ia.md#RO2), to `one-course-error`, focus on the block's h3 "Не удалось загрузить курс" |
| one course, progress cannot be read | `#state-one-course-progress-unavailable` | from #220 | [ES3](../../flows/ia.md#ES3) at one course: Card "ИИ для разработчиков", "Модель, уровень ризонинга и локальные модели", "около 40 мин", "Начать", "Прогресс недоступен, показан первый урок"; the progress error h2 "Прогресс недоступен" and "Повторить"; the block's heading link only. "Повторить": [RO6](../../flows/ia.md#RO6), to `in-progress`, focus on the Card heading |
| two courses, course 2 cannot be read (F21) | `#state-courses-one-broken` | from #220 | the sample "course 2 broken" (below): Card of course 1, lesson 02, "около 60 мин", "Продолжить"; block 1 as in `courses-one-empty`; block 2 in the error form of [ES1](../../flows/ia.md#ES1), h2 "Пробный курс". F21.1, F21.2. "Повторить": [RO1](../../flows/ia.md#RO1), to `courses-two`, focus on block 2's h2 |
| course 2 cannot be read, "Повторить" fails again | `#state-courses-block-error-fails-again` | from #220 | as `courses-one-broken`; "Повторить": [RO2](../../flows/ia.md#RO2), to `courses-one-broken`, focus on block 2's h3 |
| course 2's title cannot be read | `#state-courses-broken-no-title` | from #220 | as `courses-one-broken`, block 2's h2 and the description of its "Повторить" read `zz-stub-course` ([ES10](../../flows/ia.md#ES10)). "Повторить": [RO1](../../flows/ia.md#RO1), to `courses-two`, focus on block 2's h2 |
| course 1 cannot be read, course 2 without ready lessons | `#state-courses-no-card` | from #220 | no Card ([ES1](../../flows/ia.md#ES1), A218-2); block 1 in the error form, block 2 in the empty form; Tab order and `F6` by [ES12](../../flows/ia.md#ES12) (AC79). "Повторить": [RO1](../../flows/ia.md#RO1), to `courses-one-empty`, focus on block 1's h2 |
| two courses, progress cannot be read | `#state-courses-progress-unavailable` | from #220 | the courses of `courses-one-empty`, [ES3](../../flows/ia.md#ES3): Card as in `one-course-progress-unavailable`; the progress error; block 1 heading link only; block 2 in the empty form; status container empty (page load). "Повторить": [RO6](../../flows/ia.md#RO6), to `courses-one-empty`, focus on the Card heading |
| progress cannot be read, "Повторить" fails again | `#state-progress-error-fails-again` | from #220 | as `courses-progress-unavailable`; "Повторить": [RO7](../../flows/ia.md#RO7), to `courses-progress-unavailable`, focus on the h2 "Прогресс недоступен" |
| course 2 retry, progress lost | `#state-courses-progress-lost-at-retry` | from #220 | as `courses-one-broken`; "Повторить" stands for a re-read that loads course 2 and cannot read progress: [RO1](../../flows/ia.md#RO1) with [AN1](../../flows/ia.md#AN1), to `courses-progress-lost`, focus on block 2's h2 |
| course 2 retry fails again, progress lost | `#state-courses-progress-lost-fails-again` | from #220 | as `courses-one-broken`; "Повторить" stands for a re-read in which course 2 fails again and progress cannot be read: [RO2](../../flows/ia.md#RO2) with [AN1](../../flows/ia.md#AN1), to `courses-progress-lost-block-broken`, focus on block 2's h3 |
| course 2 retry, focus moved away, progress lost | `#state-courses-progress-lost-focus-away` | from #220 | as `courses-one-broken`; "Повторить" stands for the re-read of `courses-progress-lost-at-retry` with focus moved by Shift+Tab until "Главная" before its answer: [RG1](../../flows/ia.md#RG1) with [AN1](../../flows/ia.md#AN1), to `courses-progress-lost`, focus on "Главная" (drawn by `data-focus`, L7) |
| after a course 2 retry: progress lost | `#state-courses-progress-lost` | from #220 | [ES3](../../flows/ia.md#ES3) with both courses readable: Card as in `one-course-progress-unavailable`; the progress error; both blocks heading link only; status container "Прогресс недоступен" ([AN1](../../flows/ia.md#AN1)). The progress error's "Повторить": [RO6](../../flows/ia.md#RO6), to `courses-two`, focus on the Card heading |
| after a course 2 retry that failed again: progress lost | `#state-courses-progress-lost-block-broken` | from #220 | [ES3](../../flows/ia.md#ES3) with block 2 in the error form: Card as in `one-course-progress-unavailable`; the progress error; block 1 heading link only; block 2 as in `courses-one-broken`; status container "Прогресс недоступен" ([AN1](../../flows/ia.md#AN1)). The progress error's "Повторить": [RO6](../../flows/ia.md#RO6), to `courses-one-broken`, focus on the Card heading; block 2's "Повторить": [RO1](../../flows/ia.md#RO1), to `courses-two`, focus on block 2's h2, status container empty |
| course 2 retry, course 1 broke meanwhile | `#state-courses-other-broke-at-retry` | from #220 | as `courses-one-broken`; "Повторить" stands for a re-read that loads course 2 and cannot read course 1 (sample: a lesson file of course 1 fails to read; its title is known, not the case of [ES10](../../flows/ia.md#ES10)): [RO1](../../flows/ia.md#RO1) with [AN1](../../flows/ia.md#AN1), to `courses-other-broke`, focus on block 2's h2 |
| after a course 2 retry: course 1 cannot be read | `#state-courses-other-broke` | from #220 | Card of course 2 as in `courses-two`; block 1 in the error form; block 2 readable, no next-lesson link (A218-5), "Пока нет пройденных уроков", "Пробный модуль" "0 из 1 уроков"; status container "Не удалось загрузить курс: ИИ для разработчиков" ([AN1](../../flows/ia.md#AN1)). Block 1's "Повторить": [RO1](../../flows/ia.md#RO1), to `courses-two`, focus on block 1's h2 |
| course 2 retry, course 2 renamed | `#state-courses-block-renamed` | from #220 | as `courses-one-broken`; "Повторить" stands for a re-read after course 2 was fixed and its directory renamed to `zz-stub-course-2`, which still sorts second: [FB2](../../flows/ia.md#FB2), to `courses-two` (L8), focus on the second block's h2; status container empty |
| course 2 retry, course 2 removed | `#state-courses-block-removed` | from #220 | as `courses-one-broken`; "Повторить" stands for a re-read after course 2's directory was removed: [FB2](../../flows/ia.md#FB2), to `in-progress` (one block), focus on its h2 "ИИ для разработчиков" |
| root error | `#state-root-error` | from #220 | [ES2](../../flows/ia.md#ES2): the Alert in the Card's place, h2 "Не удалось загрузить курсы", "Повторить"; no Card, no blocks. "Повторить": [RO3](../../flows/ia.md#RO3), to `courses-two`, focus on the Card heading |
| root error, "Повторить" fails again | `#state-root-error-fails-again` | from #220 | as `root-error`; "Повторить": [RO5](../../flows/ia.md#RO5), to `root-error`, focus on the h2 "Не удалось загрузить курсы" |
| root error retry, progress cannot be read | `#state-root-error-loads-progress-down` | from #220 | as `root-error`; "Повторить" stands for a re-read that loads the courses of `courses-one-empty` and cannot read progress: [RO3](../../flows/ia.md#RO3) with [AN1](../../flows/ia.md#AN1), to `courses-progress-unavailable-announced`, focus on the Card heading |
| after the root retry: progress cannot be read | `#state-courses-progress-unavailable-announced` | from #220 | as `courses-progress-unavailable`, with the status container "Прогресс недоступен" ([AN1](../../flows/ia.md#AN1)); its "Повторить" as in `courses-progress-unavailable` |
| course load error, until #220 | `#state-course-error` | until #220 | Alert "Не удалось загрузить курс" (its title the h2 `#course-error-title`, `tabindex="-1"`, under the h1 "Главная") with "Повторить" instead of the Card; no progress section; the top bar works, with "Курс" left out while the course id is unknown, only when `course.yaml` itself cannot be read (ia.md R6, "Course id unknown"; the prototype draws the id-known bar, "Курс" to the catalog's `#state-course-error`). "Повторить" opens `first-run-until-220` with focus on the Card heading "Следующий урок". From #220: `one-course-error` |
| course load error, "Повторить" fails again, until #220 | `#state-course-error-fails-again` | until #220 | the same Alert and top bar as `#state-course-error`; its "Повторить" stands for a second failure: it opens `#state-course-error` with focus on the h2 "Не удалось загрузить курс" (`ia.md` R2, page-level retry table). From #220: `one-course-error-fails-again` |
| progress unavailable (F4 and F18 errors), until #220 | `#state-progress-unavailable` | until #220 | Card: first lesson, "Начать", line "Прогресс недоступен, показан первый урок"; progress section: line "Прогресс недоступен" and "Повторить", which opens `in-progress-until-220` with focus on its course line h2 `#progress-heading`; "Курс" to the catalog's `#state-progress-unavailable`. From #35 no F18.3-F18.5 element is rendered (A72-4). From #220: `one-course-progress-unavailable` |
| first run, until #220 | `#state-first-run-until-220` | until #220 | today's first run: Card without a course name, "Начать"; course line h2 "Пока нет пройденных уроков", bar 0, rows "0 из N уроков"; "Курс" to the catalog's `#state-default-until-220`. The state a course error "Повторить" opens |
| in progress, until #220 | `#state-in-progress-until-220` | until #220 | today's in progress: Card lesson 02, "Продолжить"; course line h2 "Пройдено уроков: 1 из 37", module 00 "1 из 6 уроков"; "Курс" to the catalog's `#state-default-until-220`. The state the progress "Повторить" opens |
| before #30 (no catalog) | `#state-before-catalog` | past | top bar "Академия", "Главная", user menu, no "Курс" (ia.md R6, "Before the catalog ships"); main as "no ready lessons" before #30: h1 and Empty "В курсе пока нет готовых уроков", nothing focusable |

In every state "Академия" and "Главная" open that state's own `#state-<name>` (`session-expired` and
`user-menu`: `#state-in-progress`, their data); "Главная" carries `aria-current="page"` in each.

Sample "course 2 broken" (the #222 states drawn on it, each saying so with "as `courses-one-broken`"): the
courses of `courses-two` with course 2 in the error form of [ES1](../../flows/ia.md#ES1), its title known except in
`courses-broken-no-title` ([ES10](../../flows/ia.md#ES10)), and progress readable; so course 1 is the Card course
(A218-2) with the Card and block of `courses-one-empty`. Every state of #222 is one moment; a state named
"after ..." is what the re-read of the state that leads to it renders, so its status container text is set as
the walk from that state sets it (L6).

The dates in the table are row text after the lesson title (and after the course name in
`attempts-two-courses`); every course-1 attempt row starts with the lesson title "Модель, уровень ризонинга и
локальные модели" (sample data, see Copy).

R5: until #31 or #34 ships no lesson can be started, so the shipped app shows only "Начать"; the
in-progress state is drawn for when it can.

Release states per `design/flows/dashboard.md` "Dashboard by release": before #30 only `before-catalog`
ships; from #30 until #220 the page of the kept states (`first-run-until-220`, `in-progress-until-220` and
the three error states `course-error`, `course-error-fails-again`,
`progress-unavailable`; the other #30 states of that release are today's drawing of the same content, not
drawn again); the states labelled "#220, #35 ..." are #35 and those labelled "#220, #37 ..." #37, drawn in the #220 form, because
#35 waits for #220 (`ia.md` "Open follow-ups", FU21). A state of an earlier release that is not redrawn in a
later one (all passed, no ready lessons, session expired, user menu) gains in the later release exactly what
that release adds after the course blocks, when it has a Card. Before #30 the F2.1 alert and the user menu
work on top of `before-catalog` (the bar of `before-catalog`, the alert of `session-expired`, the menu of
`user-menu`); they are not drawn as separate states.

Prototype limits (design rules LT and L1-L4 of #233, L5-L8 of #222). Every link and `data-goto-state` of a state
opens a state of the same course, the same release class and the same sample progress (a #222 "Повторить": the
state of the same release class that its outcome renders, States), except:
- **L1.** The module rows of `first-run-until-220` and `in-progress-until-220` link
  `../catalog/prototype.html#<moduleId>` with no `#state-`, so the catalog opens its default state, drawn
  from #220 (proto.js joins no state and anchor). App route `/courses/ai-for-developers#<moduleId>`; focus
  lands on that module's section heading (the prototype focuses `#<moduleId>-heading`, measured).
- **L2.** Course 2 has no lesson prototype. Its Card button links `../lesson/prototype.html` ("Начать",
  `courses-two`, `courses-other-broke`) or `../lesson/prototype.html?tab=task` ("Продолжить", `attempts-two-courses`, F4.3); route
  `/courses/zz-stub-course/lessons/stub-lesson` (with `?tab=task` for "Продолжить"), no focus move on load.
  Its two "Последние попытки" rows link `?tab=checks&attempt=<id>#state-history-deep-link-4`, the target of
  `attempts` row 5 (a finished attempt with no note); route
  `/courses/zz-stub-course/lessons/stub-lesson?tab=checks&attempt=<attemptId>`, focus on that attempt's
  expanded disclosure button (deep-link row 1; the prototype focuses "№ 4"). Its "Где трудно" row links
  `?tab=checks#state-checks-weak`; route `/courses/zz-stub-course/lessons/stub-lesson?tab=checks`, no focus
  move.
- **L3.** The block-2 module row links `../catalog/prototype.html#state-stub-course` (proto.js joins no state
  and anchor); route `/courses/zz-stub-course#stub-module`, focus on that module's section (`#stub-module`,
  present in `stub-course`; the prototype opens the state with no focus move).
- **L4.** A target with the same courses and release but other sample progress: the lesson prototype draws
  one lesson (module 00 lesson 01), so every course-1 Card button and every next-lesson link of a from-#220
  state opens it (on Задание for "Продолжить"), and the kept Cards open its `#state-m0`; catalog `default` is
  lesson 01 passed and 02 started, which the heading links, module rows and end Card "Открыть курс" of
  `first-run`, `all-passed`, `all-finished`, `no-ready-lessons`, `attempts-first-run`,
  `attempts-running-first`, `attempts-mixed`, `attempts`, `attempts-weak-none`, `cost-first-run`, `cost`,
  `cost-at-least` and `cost-no-data` open, and the six block-1 module rows of `courses-all-passed` and
  `attempts-two-courses` too; the block headings of `courses-all-passed` and `attempts-two-courses`, the end
  Card of `courses-all-passed` and the block-2 row of both open the catalog's `courses-two` and `stub-course`
  drawn with the progress of `courses-two`; `first-run-until-220` opens `#state-default-until-220` through
  "Курс". The six block-1 module rows of every two-course state that draws them (`courses-two`,
  `courses-one-empty`, `courses-all-passed`, `attempts-two-courses`, `courses-broken-no-title` and `courses-one-broken`, `courses-block-error-fails-again`, `courses-progress-lost-at-retry`, `courses-progress-lost-fails-again`, `courses-progress-lost-focus-away`, `courses-other-broke-at-retry`, `courses-block-renamed`, `courses-block-removed`)
  link `#<moduleId>` with no `#state-`, so they open catalog `default`, drawn with one course and no "Другие
  курсы" (proto.js joins no state and anchor); in all of them but `courses-all-passed` and
  `attempts-two-courses` with the same progress. Route as drawn, focus as drawn: a page load
  moves no focus, a `#<moduleId>` row focuses that module's section heading.
- **L5.** Block heading links of the #222 states whose catalog target shows other data; route
  `/courses/[courseId]` of the block's course, focus: none (page load).
  (a) The catalog draws no from-#220 progress error state, so these open a catalog state with progress shown:
  `one-course-progress-unavailable` (block 1: `../catalog/prototype.html`); `courses-progress-unavailable`,
  `courses-progress-unavailable-announced`, `progress-error-fails-again` (block 1: `#state-courses-one-empty`,
  block 2: `#state-stub-course-empty`); `courses-progress-lost` (block 1: `#state-courses-two`, block 2:
  `#state-stub-course`); `courses-progress-lost-block-broken` (block 1: `#state-courses-two`, whose "Пробный
  курс" opens the readable `stub-course`, as in (b)).
  (b) A course that cannot be read is drawn on the catalog only as `#state-courses-course-error` (catalog AC15),
  so a catalog state reached from a state where one course is broken shows the URL's course as that state has
  it, while its own "Другие курсы" link and top bar are those of the sample where every course reads: block 1
  of `courses-one-broken`, `courses-block-error-fails-again`, `courses-progress-lost-at-retry`, `courses-progress-lost-fails-again`, `courses-progress-lost-focus-away`, `courses-other-broke-at-retry`, `courses-block-renamed`, `courses-block-removed` opens `#state-courses-two`, whose "Пробный курс" opens the readable `stub-course`; block 2 of
  `courses-other-broke` (heading and module row, L3) opens `#state-stub-course`, whose "ИИ для разработчиков"
  opens the readable `courses-two`; block 2 of `courses-no-card` opens `#state-stub-course-empty`, whose "ИИ для
  разработчиков" opens the readable `courses-one-empty`. `courses-broken-no-title` is not in this list: its
  block 1 opens the catalog's `#state-courses-other-no-title`, drawn for the same sample (catalog limit 8).
- **L6.** One "Повторить" per outcome. The app renders one "Повторить" per error; the prototype draws one state
  per outcome it simulates, each with its own "Повторить" variant (`data-goto-state` + `data-focus`), on the
  same data. The status container text of an "after ..." state is set by the page script one task after the
  state change, so after the `data-focus` move ([AN1](../../flows/ia.md#AN1) order); opening such a state by
  its anchor or by "Академия" / "Главная" sets it too, where the app's page load leaves it empty (R2).
- **L7.** proto.js draws neither the press focus of R2 nor the guard: `courses-progress-lost-focus-away`
  draws the guard's result by its `data-focus` on "Главная".
- **L8.** `courses-block-renamed` lands in `courses-two`, drawn with course 2's id (`zz-stub-course`); the app
  renders the renamed course's id in that block's `id`s and routes (`/courses/zz-stub-course-2`). Its name
  and place are the same, so the focus target is the same element in the drawing.

Prototype limit: the progress "Повторить" in `progress-unavailable` opens `in-progress-until-220`, the #30
drawing; from #35 the reload renders F18.1-F18.5 together (AC9, AC31), which the prototype does not draw as a
separate target.

## Interactions and keyboard

- Tab order from #220: "К содержимому", the top bar of `ia.md` R6 "Top bar by release" (A218-3), "Войти
  снова" (only with the alert), then `main` by `ia.md` "Rules (#218)" row "Tab order in `main`, `F6`"; the
  total (#37) holds nothing focusable; in the error states [ES12](../../flows/ia.md#ES12). Measured per state in AC66 and AC79.
- Tab order until #220 (the kept states; from #220 replaced by the line above): "К содержимому", "Академия",
  "Главная", "Курс" (left out while the course id is unknown, ia.md R6, "Course id unknown"), user menu,
  "Войти снова" (only with the alert), then `main`: Card button (or "Повторить", or "Открыть курс"),
  "Повторить" of the progress section when shown, module rows in order; from #35 then the "Последние
  попытки" rows, newest first, then the "Где трудно" rows in their order. Before #30:
  "К содержимому", "Академия", "Главная", user menu, "Войти снова" (only with the alert); nothing focusable
  in `main`.
- `F6` / Shift+`F6` and Ctrl+Shift+. / Ctrl+Shift+, cycle "Верхняя панель" ("Академия"), "Уведомления"
  ("Войти снова", only while it holds the alert), `main` (R3). From #220 `main` lands as `ia.md` "Rules
  (#218)" row "Tab order in `main`, `F6`" says (error states: [ES12](../../flows/ia.md#ES12)); a course block is no `F6` stop; landings
  per state: AC66, AC79.
  Until #220 (the kept states; from #220 replaced by that row): `main` lands on its first focusable element:
  the Card button, "Повторить" or "Открыть курс"; in "no ready lessons" `main` itself, `tabindex="-1"`. Before #30
  the same cycle; `main` lands on `main` itself, as in "no ready lessons". Unchanged in #35 and #37: the
  regions "Последние попытки" and "Где трудно" are landmarks, not `F6` stops.
- From #30: "Начать" / "Продолжить": navigation (`a href`); target tab per F4.3. From #220 the lesson is the
  Card course's (`ia.md` "Rules (#218)" row "course of each control"): `/courses/[courseId]/lessons/[lessonId]`.
- From #220: block heading link: `/courses/[courseId]` of the block's course, the catalog (F20.4, F5.1);
  page load, no focus move. The error form's h2: [ES1](../../flows/ia.md#ES1). In the two-course states the
  prototype links the catalog's `#state-courses-two`, `#state-courses-one-empty`, `#state-stub-course` or
  `#state-stub-course-empty`, and in `courses-broken-no-title` its `#state-courses-other-no-title` (L4 and L5
  for the states they name); with one course `../catalog/prototype.html` (L4 or L5 for the states they name;
  same data in `in-progress`, `session-expired` and `user-menu`).
- From #220: next-lesson link "Следующий урок: <lesson title>" (A218-4): `/courses/[courseId]/lessons/[lessonId]`,
  with `?tab=task` when the lesson is started (F4.3 tabs, R5); prototype `../lesson/prototype.html?tab=task`
  (L4).
- From #220: end Card "Открыть курс": `/courses/[courseId]` of the Card course (`ia.md` "Rules (#218)" row
  "course of each control"); prototype `../catalog/prototype.html` (one course) or
  `../catalog/prototype.html#state-courses-two` (`courses-all-passed`), L4.
- Top bar: "Академия" and "Главная" open `/`; prototype: the state's own `#state-<name>` (States). Until
  #220 "Курс" opens `/courses/[courseId]` (prototype: the catalog state named in the States row).
- Until #220 (from #220: [F21](../../flows/courses.md#f21-retry-a-course-that-cannot-be-read) and the block "Повторить" below): course error "Повторить" (prototype: proto.js `data-goto-state` + `data-focus`, to `first-run-until-220`): reloads the Card; focus moves to the Card heading "Следующий урок"
  (`tabindex="-1"`, R2) and the `<title>` stays "Главная". If the course fails again, focus moves to the
  h2 "Не удалось загрузить курс" (`#course-error-title`, `tabindex="-1"`, the Alert title in the Card's
  place), on every later failure too, and the `<title>` stays "Главная" (`ia.md` R2, page-level retry
  table). A pointer press on "Повторить" that did not focus it (Safari) puts focus on it before the retry
  ends, so a failure always moves focus from "Повторить" to the error heading (`ia.md:323-353`). The closing
  focus move happens only while focus is still on "Повторить", on `body` or inside the Alert, and its target
  is shown; otherwise focus stays where the learner put it and nothing is announced, because the error is
  unchanged on screen and a load that succeeds is page content (`ia.md:338-353`, retry focus guard). A
  Shift+Tab to the top bar before the retry ends keeps focus there,
  in both outcomes. Prototype limit: proto.js draws neither the press focus nor the guard;
  `#state-course-error-fails-again` draws the second failure.
- Until #220 (from #220: the progress error "Повторить" below): **progress "Повторить" (round-4 advisory, prototype: to `in-progress-until-220`):** reloads the progress section **and** the Card, because the
  next lesson and "Начать" / "Продолжить" are progress data; focus moves to the progress section heading
  (the course line, `tabindex="-1"`, R2). The Card updates in place without taking focus. From #35 the
  same one read loads F18.3 and F18.4 too (from #37 F18.5), rendered together with F18.1-F18.2; nothing
  else moves focus. Fails again: focus to "Прогресс недоступен" (R2 row "dashboard progress section").
  A pointer press on "Повторить" that did not focus it (Safari) puts focus on it before the retry ends, so a
  failure always moves focus from "Повторить" to the error heading (`ia.md:323-353`). The closing focus move
  happens only while focus is still on "Повторить", on `body` or inside the progress section, and its target
  is shown; otherwise focus stays where the learner put it and nothing is announced, because the error is
  unchanged on screen and a load that succeeds is page content (`ia.md:338-353`, retry focus guard).
- From #220, a block's "Повторить" ([F21](../../flows/courses.md#f21-retry-a-course-that-cannot-be-read); the block in the error form, [ES1](../../flows/ia.md#ES1)): re-reads the dashboard
  ([RR1](../../flows/ia.md#RR1)); its focus move is [RO1](../../flows/ia.md#RO1) or [RO2](../../flows/ia.md#RO2), made or kept by the R2 retry focus guard as [RG1](../../flows/ia.md#RG1) and
  [RG2](../../flows/ia.md#RG2) judge it, and placed by [FB1](../../flows/ia.md#FB1)-[FB7](../../flows/ia.md#FB7) when they apply; the status container text is [AN1](../../flows/ia.md#AN1)'s;
  `<title>` "Главная" (`ia.md` "Retry outcomes"). The button's description is its block's h2 ([ES1](../../flows/ia.md#ES1)).
  Prototype: one state per outcome (L6), each listed in States with its target and focus; AC84, AC85, AC91-AC97,
  AC83.
- From #220, the root error's "Повторить" ([ES2](../../flows/ia.md#ES2)): [RR1](../../flows/ia.md#RR1); [RO3](../../flows/ia.md#RO3), [RO4](../../flows/ia.md#RO4) or [RO5](../../flows/ia.md#RO5), under the guard as
  above ([RG2](../../flows/ia.md#RG2) names its block) and [FB1](../../flows/ia.md#FB1)-[FB7](../../flows/ia.md#FB7); [AN1](../../flows/ia.md#AN1). Prototype: `root-error`,
  `root-error-fails-again`, `root-error-loads-progress-down` (States); AC86-AC88.
- From #220, the progress error's "Повторить" ([ES3](../../flows/ia.md#ES3)): [RR1](../../flows/ia.md#RR1); [RO6](../../flows/ia.md#RO6) or [RO7](../../flows/ia.md#RO7), under the guard as above
  and [FB1](../../flows/ia.md#FB1)-[FB7](../../flows/ia.md#FB7); [AN1](../../flows/ia.md#AN1). Prototype: `one-course-progress-unavailable`, `courses-progress-unavailable`,
  `progress-error-fails-again`, `courses-progress-lost`, `courses-progress-lost-block-broken`,
  `courses-progress-unavailable-announced` (States); AC89, AC90.
- From #220, the press focus of each of these "Повторить": `ia.md` R2, the prose after the page-level retry
  table (not drawn, L7).
- From #30: module row: link to `/courses/[courseId]#[moduleId]` (`ia.md`; `moduleId` is the `module.yaml` `id`, e.g.
  `#introduction`), which focuses that module's section heading (F5.2); from #220 the course is the block's.
  The prototype links `../catalog/prototype.html#<moduleId>` with no `#state-`: the catalog opens its default
  state (from the kept states L1); the course-2 row links `../catalog/prototype.html#state-stub-course` (L3).
- From #35: "Последние попытки" row: link to
  `/courses/[courseId]/lessons/[lessonId]?tab=checks&attempt=[attemptId]` (`ia.md` "Attempt deep link"; from
  #220 the course of the row's lesson, `ia.md` "Rules (#218)" row "course of each control"; course 2: L2),
  whatever its summary; the lesson page selects Проверки and moves focus once, on load, as that table's row
  says: to the attempt's expanded disclosure button (row 1), its plain item (row 2, an attempt with no
  check result), or the h3 "История попыток" while the attempt still runs (row 3). The prototype links
  `../lesson/prototype.html?tab=checks&attempt=<sample id>#state-<target>`, one target per row, listed in
  AC33-AC41 and AC47-AC57. Enter opens it. The dashboard itself never re-reads: a row "Идёт проверка" stays as it was
  read until the next load, with the motionless ring.
- From #35: "Где трудно" row: link to `/courses/[courseId]/lessons/[lessonId]?tab=checks`, no `attempt`
  and no `check` parameter; the lesson opens on Проверки and moves no focus, as any load (`progress.md` "Not
  designed in #72"). The prototype links `../lesson/prototype.html?tab=checks#state-checks-weak`. From #36
  a row of a quiz check links `/courses/[courseId]/lessons/[lessonId]?tab=quiz` instead, no `attempt` and
  no `check` parameter: the lesson opens on Квиз and moves no focus; a quiz check gone from the lesson falls
  back to Теория (`progress.md` A72-2, `ia.md` "Deep links"). Its name and fields are those of any row. No
  sample quiz check qualifies in the drawn states, so the prototype draws no such row (AC60).
- User menu: Enter or Space opens it, focus on the first item; arrows, Home, End; Esc closes and returns
  focus to the button; "Выйти" goes to sign-in with "Вы вышли" (F3.3).
- "Войти снова": `/sign-in?next=%2F` (the current path `/`, URL-encoded; F2.2). The prototype links
  `../sign-in/prototype.html?next=%2F#state-with-next`; sign-in then returns to the dashboard.

## Copy

| Key | Russian text |
|-----|--------------|
| title, h1 | Главная |
| skip link | К содержимому |
| top bar brand | Академия |
| top bar nav | from #220: Главная (A218-3). Until #220: Главная; Курс (from #30, ia.md R6, "Before the catalog ships"; before #30: Главная; not while the course id is unknown, ia.md R6, "Course id unknown") |
| user menu item | Выйти |
| notifications heading (visually hidden) | Уведомления |
| session alert | Сессия закончилась. Файлы в рабочей папке сохранены. |
| session action | Войти снова |
| card title | Следующий урок |
| duration | около N мин |
| start | Начать |
| continue | Продолжить |
| course error (until #220 the h2 in the Card's place; from #220 the block error form's h3, [ES1](../../flows/ia.md#ES1)) | Не удалось загрузить курс |
| root error (#220, [ES2](../../flows/ia.md#ES2)) | Не удалось загрузить курсы |
| status container (#220, [AN1](../../flows/ia.md#AN1); visually hidden) | Прогресс недоступен; Не удалось загрузить курс: <course name>; Не удалось загрузить курсы (their joins: AN1) |
| retry | Повторить |
| progress unavailable, card | Прогресс недоступен, показан первый урок |
| progress unavailable, section (until #220; from #220 the progress error's h2, [ES3](../../flows/ia.md#ES3)) | Прогресс недоступен |
| all passed | Все доступные уроки пройдены |
| all passed description (until #220; from #220 the end Card is A218-2, so no kept state draws it) | Новые модули появятся в каталоге |
| all finished (#220) | Все доступные уроки завершены |
| next-lesson link (#220) | Следующий урок: <lesson title> |
| course name (#220; Card, end Card, block heading link, F18.3 and F18.4 rows with two or more blocks) | the course's `course.yaml` `title` (data, A218-7) |
| open catalog | Открыть курс |
| no ready lessons | В курсе пока нет готовых уроков |
| course line | Пройдено уроков: N из M |
| course line, first run | Пока нет пройденных уроков |
| module row | N из M уроков |
| progress value text | N из M |
| module status | Готовится |
| lesson type | артефакт (any of the `ia.md` lesson type set) |
| recent attempts heading, list name (#35) | Последние попытки |
| recent attempts empty (#35) | Попыток пока нет |
| attempt summary, running (#35) | Идёт проверка |
| attempt summary, no result or every result a runner error (#35) | Сбой проверки, попытка не засчитана |
| attempt summary (#35) | Пройдено проверок: N из M |
| attempt summary note (#35) | Проверок с незасчитанной попыткой: N |
| attempt date and time (#35) | D месяца, ЧЧ:ММ ("4 ноября, 14:05"); D месяца ГГГГ, ЧЧ:ММ when not the current year ("28 октября 2025, 13:30") |
| attempt cost (#37) | Потрачено: $N; Потрачено: не меньше $N; Потрачено: нет данных |
| weak checks heading, list name (#35) | Где трудно |
| weak checks empty (#35) | Пока нет проверок, которые не удаются |
| weak check, closed (#35) | Закрыта: не пройдено |
| weak check, counter (#35) | Неудачных попыток: N; Неудачных попыток: N из M |
| total (#37) | Потрачено на проверки и разборы: $N; Потрачено на проверки и разборы: не меньше $N; Потрачено на проверки и разборы: нет данных |
| total note (#37) | Расход агента в терминале сюда не входит |
| field join in a row name (#35, visually hidden where no punctuation shows; from #220 also after the course name, A218-13) | ". " (full stop and space); " " alone after a field that ends in ".", "!", "?", "…" or ":" (A72-19) |

Rows "card title" to "open catalog" and "course line" to "lesson type" are shown from #30; before #30 the
page renders title and h1, skip link, top bar brand and nav, user menu item, the notifications heading, the
session alert and action, and "no ready lessons". Rows marked (#35) are shown from #35, rows marked (#37)
from #37 (`ia.md` R6, "Progress by release (#72)"); rows marked (#220) from #220. Every string is in the
`ia.md` register: page copy "dashboard (F4, F18, F20, F21)" (its from-#220 parts included) and "dashboard, progress (#72)", closed sets "attempt summary", "cost", "check status"
("Закрыта: не пройдено") and "check row note" (the counters). Money is formatted as `checks.md` "Money"
(two decimals, a dot, rounded up once per figure). The cost variant of a row or the total is ADR-0007 item
11 ("Known or at least"); an attempt of free checks only, or still running, shows no cost (A72-12).

Sample data (not copy): lesson, module and check titles and `learner@example.com`, from `course/` and the
seed; the attempts, their times, summaries and costs, the "Где трудно" counters and the check limits are the
#72 sample timeline (design note §5.0, named in the prototype's sample-data comment). Lesson 01
"Модель, уровень ризонинга и локальные модели" owns every sample attempt row; lesson 02 "Устройство агента:
цикл, харнесс, инструменты, MCP" owns the three "Где трудно" checks ("Цикл агента: результаты в контекст,
max_turns, неизвестный инструмент, MCP-образный сервер, разрешения", "Правила разрешений в
.claude/settings.json и Makefile против политики", "PreToolUse-хук блокирует правки в generated/ и
зарегистрирован так, что Claude Code его запустит"). From #220 the course names in the status container texts and the course id `zz-stub-course` that stands for
a name ([ES10](../../flows/ia.md#ES10)) are data too. From #220 the course titles, the #217 stub's module,
lesson and check titles ("Пробный курс", "Пробный модуль", "Пробный урок", "Пробная проверка") and the two
later attempts of `attempts-two-courses` (5 ноября 2026, 15:30 and 15:45, after every row of the #72
timeline; read at 15:50) are sample data too (States).

## Accessibility notes

- Landmarks: `banner` (top bar), "Уведомления" as a `region` only while it holds an alert (R2), one
  `main` (`tabindex="-1"`, skip-link target). One h1. From #35, "Последние попытки" and "Где трудно" are each
  a `section` labelled by its h2 (`aria-labelledby`), so `region` landmarks; from #37 the total is a
  `section` with no accessible name, so no landmark (its h2 is a figure), reached by heading navigation.
  From #220 each course block is a `section` labelled by its h2 (`aria-labelledby`, the id unique per block:
  `#course-<courseId>-heading`), so a `region` named by the course name (or its id, [ES10](../../flows/ia.md#ES10)), no `F6` stop ("Rules (#218)" rows
  "course block", "Tab order in `main`, `F6`"). The Card course name is a `p`, not focusable.
- From #35: each list is a `ul` labelled by the same h2 ("Последние попытки, список, 5 элементов"); an
  empty section holds its Empty text in place of the `ul`, so no empty named list is rendered.
- From #35: each row is one link; its accessible name is its visible text in DOM order, the fields joined
  by ". " (A72-19): attempt row lesson title, date and time, summary (with its own visible ". " before the
  note), from #37 ". Потрачено: ..." (visible); "Где трудно" row check title, lesson title, closed word or
  counter; from #220 with two or more course blocks the course name after the lesson title in both (A218-13,
  names measured in AC67). Where the layout shows no punctuation (after the title and after the date of an attempt row,
  after the two titles of a "Где трудно" row) the ". " is a `.sr-only-inline` span inside the text run of the field before it. The status icon is
  `aria-hidden` and says nothing the words do not (A72-8). Every date is a `<time datetime>` with the ISO
  value, shown in the learner's local time (A72-7).
- Live containers until #220 (the kept states; from #220 the next bullet): only the two in "Уведомления"
  (`role="alert"` and `role="status"`), present and empty from load; text inserted, never the container
  (R2). The course error and the progress line are static, not live: they render with the page. From #35
  nothing in F18.3-F18.5 is live and nothing needs to be: the sections render with the page and are never
  re-read in the background; they change only through the progress "Повторить", which moves focus (R2),
  under the retry focus guard.
- Live containers from #220: the two in "Уведомления" and the dashboard status container ([ES6](../../flows/ia.md#ES6)), which
  only [AN1](../../flows/ia.md#AN1) writes (R2, live containers list). The Alerts of [ES1](../../flows/ia.md#ES1) and [ES2](../../flows/ia.md#ES2) and the progress error of
  [ES3](../../flows/ia.md#ES3) are static, not live: no `role="alert"`, no `aria-live`; they render with the page (measured in
  AC73). F18.3-F18.5 change only through a re-read ([RR1](../../flows/ia.md#RR1)), whose focus and announcement are the rows of
  Interactions and keyboard.
- From #220 the focus targets are headings with `tabindex="-1"`: the Card heading of the `ia.md` vocabulary
  (the end Card's included), the block h2s and from #35 the F18.3 and F18.4 h2s ([ES5](../../flows/ia.md#ES5)), the h3 of the
  block error form ([ES1](../../flows/ia.md#ES1)), the h2 of the root error ([ES2](../../flows/ia.md#ES2)) and of the progress error ([ES3](../../flows/ia.md#ES3)). None is a
  Tab stop or an `F6` landing (R3).
- From #35: "Идёт проверка" takes `.status-icon[data-status="running-still"]`, the `running` ring with no
  animation in any motion setting (WCAG 2.2.2), because the row is a snapshot; never the spinning
  `running`. The ring keeps 3:1 against every surface the row sits on (#72 design note §5: light
  `--background` and `--card` 6.071:1, light `--accent` 5.569:1, dark `--background` 9.074:1, dark `--card`
  8.217:1, dark `--accent` 6.936:1).
- **One "Прогресс недоступен" composition (round-4 advisory, `.icon-note`), reused on catalog:** a muted `text-sm` line
  with the `info` status icon (`aria-hidden`) and the words, icon on the first line when the text wraps,
  normal weight. Dashboard uses it twice: in the Card ("Прогресс недоступен, показан первый урок") and as
  the progress section heading until #220, from #220 the progress error's h2 ([ES3](../../flows/ia.md#ES3))
  ("Прогресс недоступен", an h2 so focus has a target after "Повторить"),
  followed by "Повторить"; catalog uses it once under the course description without a button (its
  retry is the course reload). Same markup, same style; only the words and the following button differ.
- From #30: the lesson-type Badge text is part of the Card; status is never colour alone ("Готовится" is a word).
- From #30: the course Progress is `aria-labelledby` the course line, `aria-valuetext` "N из M"; from #220 the
  line is the block's `p` (`#course-<courseId>-line`), one Progress per readable block (not under [ES3](../../flows/ia.md#ES3)).
- Focus never falls back to `body` after "Повторить" (R2). From #220: [FB1](../../flows/ia.md#FB1)-[FB7](../../flows/ia.md#FB7).
- Runtime checks for the tester of #35 / #37 (static prototypes cannot settle them; #72 design note §9):
  1. (#37) money is read as an amount by NVDA and VoiceOver: "$0.08", "не меньше $1.20", "$0.00" in a row
     name and in the total h2;
  2. the inset `:focus-visible` ring shows on the lesson page's programmatic focus on load for deep-link rows
     1-3 also when the dashboard row was activated with a mouse click, not only with Enter;
  3. the dashboard "Идёт проверка" ring does not move, with and without `prefers-reduced-motion: reduce`;
  4. NVDA and VoiceOver pause at every ". " join of a row name, so the title, the date and the summary are
     not run together;
  5. the lesson page's plain item, reached from an attempt row with no check result, is read by its text when
     focused on load (A72-19), the lesson acceptance's check.

## Acceptance checks

AC1-AC6, AC8 and AC9 apply from #30. AC7 and AC10-AC13 apply in both releases; before #30 AC7's `main` is
shown whatever the course holds (AC14). AC14 applies before #30 only (`ia.md` R6, "Before the catalog ships").
AC15-AC44 apply from #35; AC45-AC59 apply from #37 (`ia.md` R6, "Progress by release (#72)"); AC60
applies from #36 with #35; AC61-AC71 apply from #220, AC67 from #220 with #35 (`ia.md` "Several courses
(#218)"); AC72-AC97 apply from #220 (`ia.md` [Error and focus states (#222)](../../flows/ia.md#errors-222)), AC93 and AC94 from
#220 with #35. AC6, AC7, AC8, AC9, AC26, AC27, AC31 and AC59 hold until #220 as written; their from-#220 form is
named in each. AC3 is scoped by release in its text.

- AC1: the Card shows the first `ready` lesson in catalog order that is not finished, with module title,
  lesson type Badge, "около N мин" and one button.
- AC2: the button reads "Продолжить" exactly when R5 says the lesson is started, else "Начать"; "Начать"
  opens the lesson on Теория (Задание when there is no theory), "Продолжить" on Задание.
- AC3: first run shows "Пока нет пройденных уроков" and module rows "0 из N уроков". From #30 (before #35)
  no "Последние попытки", "Где трудно" or cost element is rendered anywhere, not even a heading or a
  placeholder (R6). From #35 "Последние попытки" shows "Попыток пока нет" and "Где трудно" shows "Пока нет
  проверок, которые не удаются", with no cost element. From #37 also "Потрачено на проверки и разборы:
  $0.00" with "Расход агента в терминале сюда не входит" (A72-13).
- AC4: the course line counts passed `ready` lessons ("Пройдено уроков: N из M"); the bar exposes
  `aria-valuetext` "N из M".
- AC5: a module with status "Готовится" shows the Badge and no bar; a module row opens
  `/courses/[courseId]#[moduleId]` and focus lands on that module heading.
- AC6: (until #220) all ready lessons passed shows "Все доступные уроки пройдены", "Новые модули появятся в
  каталоге" and "Открыть курс" to the catalog. From #220: the end Card of A218-2 (AC64).
- AC7: (until #220) no ready lesson shows "В курсе пока нет готовых уроков" with no button and no progress
  section; `F6` to `main` focuses `main`. From #220: no Card (A218-2), each course a block in the empty form
  (AC63), `F6` by "Rules (#218)" row "Tab order in `main`, `F6`" (AC66).
- AC8: (until #220; from #220: AC74, AC84, AC85) a course read failure replaces the Card with "Не удалось загрузить курс" and "Повторить"; the top
  bar works, without "Курс" while the course id is unknown, only when `course.yaml` itself cannot be read
  (ia.md R6, "Course id unknown"); "Повторить"
  reloads and focuses the Card heading; if the course fails again, focus moves to the h2 "Не удалось
  загрузить курс" (`tabindex="-1"`), and again on every later failure; `<title>` "Главная". A pointer press on
  "Повторить" that did not focus it (Safari) puts focus on it before the retry ends, so a failure always moves
  focus from "Повторить" to the error heading (`ia.md:323-353`).
  The closing focus move happens only while focus is still on "Повторить", on `body` or inside the Alert, and
  its target is shown; otherwise focus stays where the learner put it and nothing is announced, because the
  error is unchanged on screen and a load that succeeds is page content (`ia.md:338-353`, retry focus guard).
  Test: a Shift+Tab to the top bar before the retry ends keeps focus there, in both
  outcomes.
- AC9: (until #220; from #220: AC76, AC89, AC90) a progress read failure shows the first lesson with "Начать" and "Прогресс недоступен, показан
  первый урок", and the progress section "Прогресс недоступен" with "Повторить"; "Повторить" reloads the
  section and the Card and focuses the section heading. A pointer press on "Повторить" that did not focus it
  (Safari) puts focus on it before the retry ends, so a failure always moves focus from "Повторить" to the
  error heading (`ia.md:323-353`). The closing focus move happens only while focus is still on "Повторить", on
  `body` or inside the progress section, and its target is shown; otherwise focus stays where the learner put
  it and nothing is announced, because the error is unchanged on screen and a load that succeeds is page
  content (`ia.md:338-353`, retry focus guard).
- AC10: a rejected request mid-session puts "Сессия закончилась. Файлы в рабочей папке сохранены." with
  "Войти снова" into the existing `role="alert"` container without moving focus; the wrapper becomes the
  "Уведомления" region; "Войти снова" goes to `/sign-in?next=/`.
- AC11: the user menu opens with Enter or Space, shows the email, "Выйти" signs out to `/sign-in` with "Вы
  вышли"; Esc returns focus to the button.
- AC12: `F6` and Ctrl+Shift+. cycle top bar, "Уведомления" (only when non-empty), `main` as R3.
- AC13: no horizontal scroll at 375, 768, 1280, light and dark; the top bar stays one row at 375.
- AC14: Before #30 the top bar shows "Академия", "Главная" and the user menu with no "Курс", and no link to a
  `/courses/...` route appears anywhere on the page; `main` shows only the h1 and "В курсе пока нет готовых
  уроков", nothing focusable, whatever the course holds; Tab order and `F6` as in Interactions (before #30);
  `F6` to the top bar lands on "Академия".
- AC15: (#35) below the module rows the progress section holds "Последние попытки" then "Где трудно", each a
  `section` labelled by its h2, its list a `ul` labelled by the same h2, or its Empty text in place of the
  `ul` (no empty list is rendered).
- AC16: (#35) "Последние попытки" lists at most 5 attempts (`RECENT_ATTEMPTS_SHOWN`, A72-1), newest first by
  `attempts.started_at`, over every `ready` lesson of the course; fewer when fewer exist (`attempts-mixed`:
  3); an attempt of a lesson that is not `ready` in the current tree is not listed (A72-3); when every
  attempt is such, the section shows "Попыток пока нет". No "Все попытки" link.
- AC17: (#35) each "Последние попытки" row is one link whose accessible name is lesson title, date and time,
  summary (from #37 then the cost) joined by ". ", with " " alone after a field ending in ".", "!", "?", "…"
  or ":" (A72-19), for example "Модель, уровень ризонинга и локальные модели. 5 ноября, 15:20. Идёт
  проверка"; the status icon is first in the row and `aria-hidden`.
- AC18: (#35) an attempt still `running` reads "Идёт проверка" with `.status-icon[data-status="running-still"]`,
  which has no animation with and without reduced motion; it is never `running`.
- AC19: (#35) an attempt with no check result, or whose every result is a runner error, reads "Сбой
  проверки, попытка не засчитана" with `warning` (`attempts-mixed` row 2).
- AC20: (#35) an attempt whose every result is "Пройдено" reads "Пройдено проверок: M из M" with no note and
  `success` (`attempts-mixed` row 3, "1 из 1").
- AC21: (#35) an attempt where every result that did not pass has a word with "попытка не засчитана" reads
  "Пройдено проверок: N из M. Проверок с незасчитанной попыткой: K" with K = M - N and `warning` (`attempts`
  rows 2 and 4, `attempts-mixed` row 1).
- AC22: (#35) an attempt with at least one result that did not pass and whose word does not say "попытка не
  засчитана" reads "Пройдено проверок: N из M", with ". Проверок с незасчитанной попыткой: K" only when K is
  at least 1, and `destructive` (`attempts` rows 3 and 5).
- AC23: (#35) each date reads "D месяца, ЧЧ:ММ" in the learner's local time, with the year after the month only
  when it is not the current year ("28 октября 2025, 13:30" in `attempts-mixed`, "28 октября, 13:30" in
  `attempts-running-first`, read in 2025), inside `<time datetime>` with the ISO value.
- AC24: (#35) "Где трудно" lists at most 5 checks (`WEAK_CHECKS_SHOWN`) of `ready` lessons that the platform
  runs, not passed, closed or with at least 2 counted failed results (`WEAK_CHECK_MIN_FAILED_COUNT`, A72-2);
  ordered by the latest counted failure, newest first (a closed check by the failure that closed it), then by
  counted failed results, most first; a closed check has no precedence; a check passed later is not listed.
  None qualifies: "Пока нет проверок, которые не удаются" (`attempts-mixed`, `attempts-weak-none`).
- AC25: (#35) each "Где трудно" row is one link whose accessible name is check title, lesson title, then
  "Закрыта: не пройдено" for a closed check, "Неудачных попыток: N из M" with a known limit (R7) or
  "Неудачных попыток: N" otherwise, joined by ". " as AC17; no status icon.
- AC26: (#35, until #220) Tab order after the module rows: the "Последние попытки" rows newest first, then the "Где
  трудно" rows in their order; `F6` to `main` still lands on the Card's button. From #220: "Rules (#218)" row
  "Tab order in `main`, `F6`" (AC66).
- AC27: (#35, until #220; from #220: AC73, AC83) after load nothing in F18.3-F18.4 changes, is re-read in the background or is announced; no live
  container is added (only the two of "Уведомления").
- AC28: (#35) while the progress read loads, the one Skeleton covers F18.1-F18.4 (from #37 F18.5 too),
  `aria-hidden`; there is no loading state per section (`attempts-loading`).
- AC29: (#35) no string "Слабые темы" or "Слабых тем пока нет" appears in any state.
- AC30: (#35) no cost element ("Потрачено...") appears in any #35 state, in a row or as a total.
- AC31: (#35, until #220; from #220: AC76, AC89, AC90, AC94) when the progress read fails, no F18.3-F18.5 element is rendered: no heading, no second error
  text, no second "Повторить" (A72-4); the one "Повторить" that loads renders F18.1-F18.4 (from #37 F18.5)
  together and focuses the course line; one that fails focuses "Прогресс недоступен" (`progress-unavailable`).
  A pointer press on "Повторить" that did not focus it (Safari) puts focus on it before the retry ends, so a
  failure always moves focus from "Повторить" to the error heading (`ia.md:323-353`). The closing focus move
  happens only while focus is still on "Повторить", on `body` or inside the progress section, and its target
  is shown; otherwise focus stays where the learner put it and nothing is announced, because the error is
  unchanged on screen and a load that succeeds is page content (`ia.md:338-353`, retry focus guard).
- AC32: (#35) a progress section that renders also renders both "Последние попытки" and "Где трудно" (each
  with its rows or its empty text); no state shows one without the other.
- AC33: (#35) `attempts` row 1 (and `attempts-weak-none` row 1) "5 ноября, 15:20. Идёт проверка" opens
  `?tab=checks&attempt=<№8>`; prototype `#state-history-deep-link-running`: №8's run in the check rows and
  bar, the list without "№ 8", focus on the h3 "История попыток" (deep-link row 3).
- AC34: (#35) `attempts` row 2 "5 ноября, 15:05. Пройдено проверок: 1 из 3. Проверок с незасчитанной попыткой:
  2" opens `&attempt=<№7>`; prototype `#state-history-deep-link-7`: "№ 7" with the same date, time, summary and
  `warning`, expanded and focused (row 1).
- AC35: (#35) `attempts` row 3 "5 ноября, 14:50. ... 0 из 3. ...: 2" opens `&attempt=<№6>`; prototype
  `#state-history-deep-link-6`: "№ 6", `destructive`, expanded and focused.
- AC36: (#35) `attempts` row 4 "5 ноября, 14:35. ... 0 из 3. ...: 3" opens `&attempt=<№5>`; prototype
  `#state-history-deep-link-5`: "№ 5", `warning`, expanded and focused.
- AC37: (#35) `attempts` row 5 "5 ноября, 14:20. Пройдено проверок: 0 из 3" opens `&attempt=<№4>`; prototype
  `#state-history-deep-link-4`: "№ 4", `destructive`, expanded and focused.
- AC38: (#35) `attempts-mixed` row 1 "4 ноября, 14:05. Пройдено проверок: 1 из 2. Проверок с незасчитанной
  попыткой: 1" opens `&attempt=<№3>`; prototype `#state-history-deep-link`: "№ 3" expanded and focused, the
  list "№ 3", "№ 2", "№ 1", D a current check.
- AC39: (#35) `attempts-mixed` row 2 "4 ноября, 13:50. Сбой проверки, попытка не засчитана" opens
  `&attempt=<№2>`; prototype `#state-history-deep-link-plain`: the plain item "№ 2" focused, nothing expanded
  (row 2).
- AC40: (#35) `attempts-mixed` row 3 "28 октября 2025, 13:30. Пройдено проверок: 1 из 1" opens
  `&attempt=<№1>`; prototype `#state-history-deep-link-1`: "№ 1" expanded and focused.
- AC41: (#35) `attempts-running-first` row 1 "28 октября, 13:30. Идёт проверка" opens `&attempt=<№1>` (the
  same id as AC40); prototype `#state-history-deep-link-running-empty`: №1's run, "Попыток пока нет" alone
  after the focused h3 "История попыток" (row 3, empty history).
- AC42: (#35, the three "Где трудно" rows in `attempts`; from #37 the same rows in `cost`, `cost-at-least`
  and `cost-no-data`, checked by the #37 tester) the row
  "PreToolUse-хук ... Неудачных попыток: 9 из 10" opens `/courses/[courseId]/lessons/[lessonId]?tab=checks`
  with no `attempt`; prototype `#state-checks-weak`: tab Проверки selected, the check row "Не пройдено" whose
  panel reads "Неудачных попыток: 9 из 10", focus not moved.
- AC43: (#35) the row "Правила разрешений ... Неудачных попыток: 3" opens the same `?tab=checks`; prototype
  `#state-checks-weak`: the check row whose panel reads "Неудачных попыток: 3", focus not moved.
- AC44: (#35) the row "Цикл агента: ... Закрыта: не пройдено" opens the same `?tab=checks`; prototype
  `#state-checks-weak`: the check row "Закрыта: не пройдено", focus not moved. Prototype limit (AC42-AC44):
  lesson 02's check rows are drawn on the lesson prototype's one page (h1 lesson 01, its history); the check
  asserts the three rows, the selected tab and no focus move, not the h1 or the history.
- AC45: (#37) a "Последние попытки" row of an attempt that holds anything that spends ends with ". Потрачено:
  $N", ". Потрачено: не меньше $N" (a spending term has no reported cost and the known part is above zero) or
  ". Потрачено: нет данных" (the known part is zero), by ADR-0007 item 11; an attempt of free checks only, or
  still running, shows no cost (`cost` rows 1-4).
- AC46: (#37) the total "Потрачено на проверки и разборы: $N" (or "не меньше $N", "нет данных") is an h2 in a
  `section` with no accessible name, followed by "Расход агента в терминале сюда не входит"; it sums every
  attempt of the user whatever its lesson's status, check results and mentor reviews, USD only, rounded up
  once; it holds nothing focusable; "$0.00" before any spend (`cost-first-run`).
- AC47: (#37) `cost` row 1 "5 ноября, 15:20. Идёт проверка" (no cost) opens `&attempt=<№8>`; prototype
  `#state-history-cost-deep-link-running`: №8's run with the R1 and R2 rows, the list of `history-cost`, focus
  on the h3.
- AC48: (#37) `cost` row 2 (as `attempts` row 2, no cost) opens `&attempt=<№7>`; prototype
  `#state-history-cost-deep-link-7`: "№ 7" expanded and focused, "№ 4" in the list reads "Потрачено: $0.08".
- AC49: (#37) `cost` row 3 (as `attempts` row 3) opens `&attempt=<№6>`; prototype
  `#state-history-cost-deep-link-6`: "№ 6" expanded and focused.
- AC50: (#37) `cost` row 4 (as `attempts` row 4) opens `&attempt=<№5>`; prototype
  `#state-history-cost-deep-link-5`: "№ 5" expanded and focused.
- AC51: (#37) `cost` row 5 "5 ноября, 14:20. Пройдено проверок: 2 из 5. Потрачено: $0.08" (`destructive`) opens
  `&attempt=<№4>`; prototype `#state-history-cost-deep-link-4`: "№ 4" with the same text, five items, R1 and R2
  "Пройдено" with "Стоимость попытки: $0.04", expanded and focused.
- AC52: (#37) `cost-at-least` row 5 "... Пройдено проверок: 2 из 5. Потрачено: не меньше $0.04" opens
  `&attempt=<№4>`; prototype `#state-history-cost-at-least-deep-link-4`: "№ 4" with the same text, R2's item
  without a cost line, focused.
- AC53: (#37) `cost-no-data` row 5 "... Пройдено проверок: 2 из 5. Потрачено: нет данных" opens
  `&attempt=<№4>`; prototype `#state-history-cost-no-data-deep-link-4`: "№ 4" with the same text, no cost line
  in R1's or R2's item, focused.
- AC54: (#37) `cost-at-least` row 1 and `cost-no-data` row 1 "5 ноября, 15:20. Идёт проверка" open
  `&attempt=<№8>`; prototype `#state-history-cost-deep-link-running` (as AC47). Prototype limit, AC54-AC57: the
  target is the `cost` target of the same attempt, so the clicked attempt matches (date, time, summary,
  icon, no cost), but the rest of the target shows `cost`'s figures ("№ 4" "Потрачено: $0.08", R1 and R2
  "Стоимость попытки: $0.04"), not the variant's; the variant figures are drawn on the targets of row 5
  (AC52, AC53). A tester does not report this difference.
- AC55: (#37) `cost-at-least` row 2 and `cost-no-data` row 2 open `&attempt=<№7>`; prototype
  `#state-history-cost-deep-link-7` (as AC48; limit as AC54).
- AC56: (#37) `cost-at-least` row 3 and `cost-no-data` row 3 open `&attempt=<№6>`; prototype
  `#state-history-cost-deep-link-6` (as AC49; limit as AC54).
- AC57: (#37) `cost-at-least` row 4 and `cost-no-data` row 4 open `&attempt=<№5>`; prototype
  `#state-history-cost-deep-link-5` (as AC50; limit as AC54).
- AC58: (#37) the total and the row 5 cost of one state agree with ADR-0007 item 11: exact total with every
  term known (`cost`, $1.24 = $0.08 + $1.16), "не меньше" when a term is unknown and the known part is above
  zero (`cost-at-least`, $1.20), "нет данных" when no term is known (`cost-no-data`); a row cost is never above
  its state's total.
- AC59: (#37) the Tab order of AC26 (from #220 of AC66) is unchanged: the total section adds no stop.
- AC60: (#36 with #35) a quiz check that qualifies by AC24 (not passed, closed or with at least 2 counted
  failed quiz attempts) is a "Где трудно" row like any other (AC25: check title, lesson title, then
  "Закрыта: не пройдено" or "Неудачных попыток: N из M" / "Неудачных попыток: N") whose link is
  `/courses/[courseId]/lessons/[lessonId]?tab=quiz`, not `?tab=checks`; the lesson opens with Квиз selected
  (the questions with "Попытка A из M" while the quiz is open, the review once closed) and focus not moved;
  a quiz check no longer in the lesson opens Теория (or Задание without theory). Not drawn: tested in the app
  against the lesson prototype's `#state-quiz-failed` (open) and `#state-quiz-closed` (closed) Квиз panels.

- AC61: (#220) `main` follows "Rules (#218)" rows "dashboard order" and "course block" (A218-1, A218-6):
  `courses-two` shows h1 "Главная", the Card, the block "ИИ для разработчиков" and the block "Пробный курс", each
  block a `section` named by its h2, the h2's whole text one link (`.heading-link`); a readable block (outside [ES3](../../flows/ia.md#ES3)) holds its
  course line `p` labelling its Progress ("Пройдено уроков: 1 из 37" / "Пока нет пройденных уроков") and its
  module rows (six in course 1, one in course 2). With one course (`first-run`, `in-progress`, `all-passed`,
  `all-finished`, `session-expired`, `user-menu`, `attempts-first-run`, `attempts-running-first`,
  `attempts-mixed`, `attempts`, `attempts-weak-none`, `cost-first-run`, `cost`, `cost-at-least`,
  `cost-no-data`) the same block, once.
- AC62: (#220) the Card follows A218-2 and names its course under its heading (A218-7): course 2 "Пробный
  курс" in `courses-two`, `attempts-two-courses` and `courses-other-broke`, course 1 "ИИ для разработчиков" in
  every other from-#220 state with a Card; the name is not focusable, so the Card's only Tab stop is its button.
- AC63: (#220) the next-lesson link follows A218-4 and A218-5: `courses-two` and `attempts-two-courses` show
  "Следующий урок: Устройство агента: цикл, харнесс, инструменты, MCP" in block 1 only; no other drawn state
  shows one. A block in the empty form ("Rules (#218)" row "course block") shows its heading link and "В курсе
  пока нет готовых уроков", no line, no rows (`courses-one-empty` block 2, `no-ready-lessons`).
- AC64: (#220) the end Card follows A218-2: "Все доступные уроки пройдены" (`all-passed`,
  `courses-all-passed`) or "Все доступные уроки завершены" (`all-finished`), the Card course's name and
  "Открыть курс" to `/courses/[courseId]` of that course; "Новые модули появятся в каталоге" appears in no
  state.
- AC65: (#220) the top bar follows A218-3 on this page: in every from-#220 state and in `before-catalog`
  "Академия", "Главная" (`aria-current="page"`) and the user menu, no "Курс"; the five kept states add "Курс"
  (until #220). Measured on a fresh load of every state.
- AC66: (#220) Tab order and `F6` follow "Rules (#218)" row "Tab order in `main`, `F6`". Measured landings of
  `F6` to `main` and of the first Tab after the skip link, on a fresh load of each state: "Начать"
  (`courses-two`, `first-run`, `attempts-first-run`, `cost-first-run`), "Продолжить" (`courses-one-empty`,
  `attempts-two-courses`, `in-progress`, `session-expired`, `user-menu`, `attempts-running-first`,
  `attempts-mixed`, `attempts`, `attempts-weak-none`, `cost`, `cost-at-least`, `cost-no-data`), "Открыть курс"
  (`courses-all-passed`, `all-finished`, `all-passed`), the heading link "ИИ для разработчиков"
  (`no-ready-lessons`), `main` itself (`loading`, `attempts-loading`, R3: nothing focusable). Tab order in
  `main` of `courses-two`: "Начать", "ИИ для разработчиков", "Следующий урок: ...", the six module rows,
  "Пробный курс", "Пробный модуль".
- AC67: (#220 with #35) with two or more course blocks each F18.3 and F18.4 row names its course after the
  lesson title (A218-13); measured names in `attempts-two-courses`, light and dark: "Пробный урок. Пробный
  курс. 5 ноября, 15:45. Пройдено проверок: 0 из 1", "Модель, уровень ризонинга и локальные модели. ИИ для
  разработчиков. 5 ноября, 15:20. Идёт проверка", "Пробная проверка. Пробный урок. Пробный курс. Неудачных
  попыток: 2", "PreToolUse-хук блокирует правки в generated/ и зарегистрирован так, что Claude Code его
  запустит. Устройство агента: цикл, харнесс, инструменты, MCP. ИИ для разработчиков. Неудачных попыток: 9 из
  10". With one block (`attempts-running-first`, `attempts-mixed`, `attempts`, `attempts-weak-none`, `cost`,
  `cost-at-least`, `cost-no-data`) no row holds a course name. The course-2 rows open
  the L2 targets (States, prototype limits).
- AC68: (#220) while the dashboard loads, Skeletons stand for the Card and one block ("Rules (#218)" row
  "loading"), `aria-hidden`, from #35 also for F18.3-F18.5 (`loading`, `attempts-loading`).
- AC69: (#220) each control opens its course by "Rules (#218)" row "course of each control": block heading
  `/courses/[courseId]`, next-lesson link `/courses/[courseId]/lessons/[lessonId]` (`?tab=task` when started),
  module row `/courses/[courseId]#[moduleId]`, Card and end Card buttons the Card course's, F18.3 and F18.4 rows
  their lesson's course. In `courses-two` the course-1 controls open `ai-for-developers` routes and the
  course-2 controls `zz-stub-course` routes (prototype: States, L2 and L3).
- AC70: (#220) a 120-character course name in the block heading link, the Card, the end Card and the F18 rows
  wraps; no horizontal scroll at 320 px and at 640 px (1280 px at 200 % zoom), light and dark (`courses.md`
  F22 Keyboard path, WCAG 1.4.10). Measured headless in `courses-two`, `courses-one-empty`,
  `courses-all-passed`, `attempts-two-courses`, `all-finished`, `first-run`, `no-ready-lessons`, `all-passed`.
- AC71: (#220) the block heading link (`#course-<courseId>-heading > a`) measured in light and dark: `inline-block`,
  the heading's colour and 18px (`text-lg`) size, underlined, and on keyboard focus the global 2px solid
  `:focus-visible` ring.
- AC72: (#220, [ES5](../../flows/ia.md#ES5)) in every from-#220 state each block h2 has `tabindex="-1"`, in every form, and so do
  the Card heading `#next-lesson-heading` and the end Card heading `#all-passed-heading`; from #35 also
  `#recent-attempts-heading` and `#weak-checks-heading`. No heading is in the Tab orders of AC66 and AC79.
- AC73: (#220, [ES6](../../flows/ia.md#ES6)) the dashboard status container is in `main` right after the h1 in every from-#220 state
  and empty on a fresh load of each, except the four "after ..." states of States (L6); it is no Tab stop and
  changes no `F6` landing. Measured in every #222 state: the only elements with a live role or `aria-live` are
  the two "Уведомления" containers and `#dashboard-status`; no Alert in `main` has one. The kept states and
  `before-catalog` have no status container.
- AC74: (#220, [ES1](../../flows/ia.md#ES1)) the error form as ES1 renders it, measured in each state that draws one: block 1
  in `one-course-error`, `one-course-error-fails-again`, `courses-no-card` and `courses-other-broke`; block 2 in
  `courses-one-broken`, `courses-block-error-fails-again`, `courses-broken-no-title`, `courses-progress-lost-at-retry`, `courses-progress-lost-fails-again`, `courses-progress-lost-focus-away`, `courses-other-broke-at-retry`, `courses-block-renamed`, `courses-block-removed` and `courses-progress-lost-block-broken`. The button's computed
  description is the block's h2 (measured: "Пробный курс" in `courses-one-broken`, "ИИ для разработчиков" in
  `courses-no-card`). The Card follows ES1 and A218-2: none in `one-course-error` and `courses-no-card`, course
  1's in `courses-one-broken`, course 2's in `courses-other-broke`.
- AC75: (#220, [ES2](../../flows/ia.md#ES2)) `root-error`: the Alert in the Card's place with the h2 "Не удалось загрузить курсы"
  (`tabindex="-1"`) and "Повторить"; no Card, no block, no F18.3-F18.5.
- AC76: (#220, [ES3](../../flows/ia.md#ES3)) `one-course-progress-unavailable`, `courses-progress-unavailable`, `courses-progress-lost`,
  `courses-progress-lost-block-broken`: the Card of ES3 (course 1, "Начать", "Прогресс недоступен, показан первый
  урок"), then the progress error (h2 "Прогресс недоступен", `tabindex="-1"`, and "Повторить"), then the
  blocks: readable ones show the heading link only, the empty and error forms are unchanged; from #35 no
  F18.3-F18.5 element.
- AC77: (#220, [ES4](../../flows/ia.md#ES4)) not drawn as a state; app test: the data of `courses-no-card` with progress
  unreadable renders as ES4 says, which is the drawing of `courses-no-card`.
- AC78: (#220, [ES10](../../flows/ia.md#ES10)) `courses-broken-no-title`: block 2's h2, its region name and its "Повторить"
  description read `zz-stub-course` (measured).
- AC79: (#220, [ES12](../../flows/ia.md#ES12)) measured on a fresh load, Tab order in `main` (the first entry is also the `F6`
  landing of `main`): `one-course-error` and `root-error` "Повторить"; `courses-no-card` "Повторить", "Пробный
  курс"; `courses-one-broken` and `courses-broken-no-title` "Продолжить", "ИИ для разработчиков", the six module
  rows, "Повторить"; `one-course-progress-unavailable` "Начать", "Повторить", "ИИ для разработчиков";
  `courses-progress-unavailable` and `courses-progress-lost` "Начать", "Повторить", "ИИ для разработчиков",
  "Пробный курс"; `courses-progress-lost-block-broken` "Начать", "Повторить", "ИИ для разработчиков",
  "Повторить"; `courses-other-broke` "Начать", "Повторить", "Пробный курс", "Пробный модуль".
- AC80: (#220, [RR1](../../flows/ia.md#RR1)) every dashboard "Повторить" re-reads the whole dashboard (app test: after a block retry
  the Card course follows A218-2; prototype: `courses-one-broken` to `courses-two` moves the Card to course 2).
- AC81: (#220, [RG1](../../flows/ia.md#RG1)) the retry focus guard is judged at the time RG1 names. App tests: focus moved by
  Shift+Tab until "Главная" before the answer of a block retry stays there (prototype
  `courses-progress-lost-focus-away`, L7); one Shift+Tab from block 2's "Повторить" in `courses-one-broken`
  lands on block 1's last module row, which the re-read of `courses-progress-lost-at-retry` removes, so focus
  goes to block 1's h2 (AC91).
- AC82: (#220, [RG2](../../flows/ia.md#RG2)) the guard's block of each dashboard "Повторить" is RG2's (app test: focus moved into
  another block before a block retry's answer stays there; focus on the retried block's h2 gets the move).
- AC83: (#220, [AN1](../../flows/ia.md#AN1)) the status container text after each walk of AC84-AC92 (walked
  headless at 1280 px, light and dark, and at 375 px, from a fresh load of the state, clicking the "Повторить"
  its States row names; both in `courses-progress-lost-block-broken`): "Прогресс недоступен" after
  `courses-progress-lost-at-retry`, `courses-progress-lost-fails-again`, `courses-progress-lost-focus-away` and
  `root-error-loads-progress-down`; "Не удалось загрузить курс: ИИ для разработчиков" after
  `courses-other-broke-at-retry`; none after every other walk. It is set and emptied at the times AN1 names
  (L6).
- AC84: (#220, [RO1](../../flows/ia.md#RO1)) walks as AC83: `one-course-error` to `first-run`, focus `#course-ai-for-developers-heading`;
  `courses-one-broken` and `courses-broken-no-title` to `courses-two`, focus `#course-zz-stub-course-heading`;
  `courses-no-card` to `courses-one-empty`, focus `#course-ai-for-developers-heading`;
  `courses-progress-lost-at-retry` to `courses-progress-lost` and `courses-other-broke-at-retry` to
  `courses-other-broke`, focus `#course-zz-stub-course-heading`; `courses-other-broke` to `courses-two`, focus
  `#course-ai-for-developers-heading`; block 2 of `courses-progress-lost-block-broken` to `courses-two`, focus
  `#course-zz-stub-course-heading`. `<title>` "Главная".
- AC85: (#220, [RO2](../../flows/ia.md#RO2)) walks as AC83: `one-course-error-fails-again` to `one-course-error`, focus
  `#course-ai-for-developers-error-title`; `courses-block-error-fails-again` to `courses-one-broken` and
  `courses-progress-lost-fails-again` to `courses-progress-lost-block-broken`, focus
  `#course-zz-stub-course-error-title`. `<title>` "Главная".
- AC86: (#220, [RO3](../../flows/ia.md#RO3)) walks as AC83: `root-error` to `courses-two` and `root-error-loads-progress-down` to
  `courses-progress-unavailable-announced`, focus `#next-lesson-heading`.
- AC87: (#220, [RO4](../../flows/ia.md#RO4)) not drawn; app test: a root error retry that loads the data of `courses-no-card` focuses
  block 1's h2.
- AC88: (#220, [RO5](../../flows/ia.md#RO5)) walk as AC83: `root-error-fails-again` to `root-error`, focus `#root-error-title`.
- AC89: (#220, [RO6](../../flows/ia.md#RO6)) walks as AC83: `one-course-progress-unavailable` to `in-progress`; `courses-progress-unavailable`
  and `courses-progress-unavailable-announced` to `courses-one-empty`; `courses-progress-lost` to
  `courses-two`; the progress error of `courses-progress-lost-block-broken` to `courses-one-broken`; focus
  `#next-lesson-heading` in each.
- AC90: (#220, [RO7](../../flows/ia.md#RO7)) walk as AC83: `progress-error-fails-again` to `courses-progress-unavailable`, focus
  `#progress-unavailable-heading`.
- AC91: (#220, [FB1](../../flows/ia.md#FB1)) not drawn; app test: focus on a module row of block 1 before a block 2 retry whose
  re-read cannot read progress lands on block 1's h2.
- AC92: (#220, [FB2](../../flows/ia.md#FB2)) walks as AC83: `courses-block-renamed` to `courses-two` (L8), focus on the second
  block's h2; `courses-block-removed` to `in-progress`, focus `#course-ai-for-developers-heading`; no status
  text in either.
- AC93: (#220 with #35, [FB3](../../flows/ia.md#FB3)) not drawn (`courses.md` "Not designed in #222", FU21); app test on the
  `attempts-two-courses` data.
- AC94: (#220 with #35, [FB4](../../flows/ia.md#FB4)) not drawn (FU21); app test on the `attempts-two-courses` data.
- AC95: (#220, [FB5](../../flows/ia.md#FB5)) not drawn; app test: a focused element that a re-read removes, in the place FB5
  names, goes to the Card heading.
- AC96: (#220, [FB6](../../flows/ia.md#FB6)) not drawn; app test: a focused element of `main` that a re-read removes, in the place
  FB6 names, hands focus to the first block's h2.
- AC97: (#220, [FB7](../../flows/ia.md#FB7)) not drawn; app test: a block retry whose re-read finds the root error lands on
  `#root-error-title`.

## Open questions

1. **". " joins in the computed name (closed in the author phase).** `.sr-only` (absolute) made Chromium put a
   space before the join (" . "); the ui-designer added `.sr-only-inline`, which the rows now use. Measured
   headless (`Accessibility.getFullAXTree`, light and dark, every attempt and "Где трудно" row of every state):
   each name equals its fields joined by ". " exactly, for example "Модель, уровень ризонинга и локальные
   модели. 5 ноября, 15:20. Идёт проверка" (AC17, AC25).
2. **Lesson targets (closed in the author phase).** Every target of design note §5.3 exists in the lesson
   prototype; walked headless at 1280 and 375 (82 links, 0 mismatches): the target state opens, Проверки is
   selected, the focused element is the one its deep-link row names and holds the row's date, summary and
   icon, "Попыток пока нет" stands alone in `history-deep-link-running-empty`, `checks-weak` moves no focus, and
   Back returns to the dashboard state the row was clicked in.
3. The progress section still has no heading of its own in the `ia.md` copy register, so the course line is
   its h2; a separate heading would need a register entry first. A "Где трудно" row focusing its check row on
   arrival (`?check=`) is not designed (`progress.md` "Not designed in #72", FU13); not proposed here, because
   it needs its own fallback set and the lesson page shows the check rows at the top of the tab anyway.
4. **Card course name (#233 author decision).** F4.1 and A218-7 say the Card names its course but fix no element
   or place; the prototype puts it in `.card-description` under the Card title, the same element and place in
   every state with a Card or an end Card, not a link (the Card's only Tab stop stays its button, "Rules
   (#218)" row "Tab order in `main`, `F6`").
5. **"N из M уроков" with M = 1.** The course-2 module row reads "0 из 1 уроков" / "1 из 1 уроков": the `ia.md`
   Page copy dashboard and F18.2 give no plural rule, so the string is drawn as registered (reported to the
   flows, #233 design section 8).
6. **Not drawn in #222.** [ES11](../../flows/ia.md#ES11) (only if #219 drops Q1), RO4 and FB1, FB3-FB7 (AC87, AC91, AC93-AC97: app
   tests), the busy state of a re-read (`courses.md` "Not designed in #222").
