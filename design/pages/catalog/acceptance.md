# Catalog: acceptance notes

## Route

`/courses/[courseId]`; module sections at `/courses/[courseId]#[moduleId]` (decision A6). Title and h1:
the course title, e.g. "ИИ для разработчиков".

## Prototype

`design/pages/catalog/prototype.html`. States by `#state-<name>`; `#<moduleId>`, the `module.yaml` `id` (e.g.
`prototype.html#introduction`), opens the default state focused on that module heading; the section `id`
is that same `moduleId`, as in the app. The
"Prototype states" bar and "Dark theme" are prototype chrome, not product UI.

## Flows

| Step | Element (`data-step`) |
|------|-----------------------|
| F2.1 | the session Alert inside the `role="alert"` container of "Уведомления" |
| F3.1 | the user menu button |
| F3.2 | the menu item "Выйти" |
| F5.1 | the module list (number, title, module status) |
| F5.2 | the section of module 00 (summary, "Чему научитесь", lessons) |
| F5.3 | the lesson rows list of module 00 |
| F5.4 | the first lesson row link (opens the lesson) |
| F6.1 | the prerequisite note of lesson 03 |

## Status

Status: ready

## Purpose

Show the whole course, every module with its status, and every `ready` lesson; open a lesson (F5); warn
about unpassed prerequisites without locking (F6, decision A5).

## Layout and breakpoints

One column at every width (A8): top bar, "Уведомления" (only with an alert), `main` with the course header
(h1, description, the "Прогресс недоступен" line when it applies), the module list, then one section per
module separated by a Separator. Content column `max-width: 48rem`, gap `space-8`.
- 1280 and 768: lesson rows show number and title, "type, около N мин" under it, the status Badge at the
  right; the prerequisite note under the row, indented to the row text.
- 375: the same; titles wrap, the Badge stays at the right of the row; module list items wrap the Badge
  under the link when needed; top bar one row (the system rule: email cut at 6rem below a 480px viewport,
  full accessible name; wraps to a second row at 320). No horizontal
  scroll at 375, 768, 1280 in any state (checked).

## Components

| shadcn | Usage |
|--------|-------|
| Badge | module status "Доступен" (`secondary`), "Готовится" (`outline`, `data-tone="muted"`); lesson status "Не начат" (`outline` muted), "В процессе" (`secondary`), "Пройден" (`success` with the success icon), "Не пройден" (`outline` `data-tone="destructive"` with the destructive icon, D1 data) |
| Item | lesson rows: each row is one link (`a.item`), one Tab per lesson |
| Separator | between module sections |
| Empty | "Уроки модуля готовятся" |
| Alert | course load error (destructive, static); session expired in "Уведомления" |
| Button | "Повторить" (secondary, sm); "Войти снова" (sm, link) |
| DropdownMenu | user menu: label with the email and "Выйти" (link item) inside one `role="group"` named by the label (`aria-labelledby`, label `role="presentation"`), as in `components.html` |
| Skeleton | loading |

Compositions: top bar, "Уведомления" (R2), the "Прогресс недоступен" line (`.icon-note`, same as the
dashboard), the prerequisite note (`.item-note`, a `p` after the row link in the same `li`: "Сначала
пройдите: " then one link per missing lesson, comma separated).

## States

| State | Anchor | What shows |
|-------|--------|------------|
| default: ready module with lessons, planned modules, both module statuses, lesson statuses, prerequisite notes | `#state-default` | module 00 "Доступен" with six lessons: 01 "Пройден", 02 "В процессе", 03-06 "Не начат"; notes on 03-06; modules 01-05 "Готовится" with "Уроки модуля готовятся" |
| lesson failed (D1 data) | `#state-failed-lesson` | as default, lesson 02 "Не пройден" (sample data: only once checks can close, D1 / F14.4) |
| ready module without ready lessons | `#state-ready-no-lessons` | module 00 "Готовится" in the list and in its section, "Уроки модуля готовятся" instead of the rows; summary and outcomes stay |
| loading | `#state-loading` | Skeletons (`aria-hidden`); the h1 arrives with the data |
| course load error | `#state-course-error` | destructive Alert "Не удалось загрузить курс" (its title is the h1 in this state) with "Повторить"; nothing else in `main` |
| progress unavailable | `#state-progress-unavailable` | "Прогресс недоступен" once under the description; rows with no status Badge and no prerequisite note; rows stay links |
| session expired (F2.1) | `#state-session-expired` | default content plus the Alert in "Уведомления" |
| user menu open (F3.1) | `#state-user-menu` | default content with the menu open |

Not-found is not a catalog state (design §3).

## Interactions and keyboard

- Tab order: skip link, top bar, "Войти снова" (only with the alert), then in `main`: module links in
  order, then per module the lesson row links, each followed by its prerequisite note's links (F6
  keyboard path).
- Module link (F5.1): moves focus to that module's section heading (`tabindex="-1"`) and scrolls it into
  view; the URL fragment becomes `#<moduleId>` (the prototype keeps its `#state-` hash instead, proto.js
  in-page anchors).
- Arrival with `#<moduleId>` (dashboard module row, lesson module crumb, both linking
  `/courses/[courseId]#[moduleId]`, e.g. `#introduction`): focus on that module heading.
- Lesson row: opens the lesson on Теория (Задание when it has no theory).
- Prerequisite link: opens that lesson.
- "Повторить": reloads the course; focus moves to the h1 (`tabindex="-1"`, R2).
- `F6` cycle: "Верхняя панель" ("Академия"), "Уведомления" ("Войти снова", only when non-empty), `main`
  (first module link, or "Повторить" in the error state). R3.
- "Войти снова": `/sign-in?next=<current path, URL-encoded>`, e.g. `/sign-in?next=%2Fcourses%2Fai-for-developers`
  (F2.2). The prototype links `../sign-in/prototype.html?next=%2Fcourses%2Fai-for-developers#state-with-next`;
  sign-in then returns to the catalog prototype.
- User menu: as on every page with the top bar (F3).

## Copy

| Key | Russian text |
|-----|--------------|
| skip link | К содержимому |
| top bar brand | Академия |
| top bar nav | Главная; Курс |
| user menu item | Выйти |
| notifications heading (visually hidden) | Уведомления |
| session alert | Сессия закончилась. Файлы в рабочей папке сохранены. |
| session action | Войти снова |
| course error | Не удалось загрузить курс |
| retry | Повторить |
| progress unavailable | Прогресс недоступен |
| module status | Доступен; Готовится |
| outcomes heading | Чему научитесь |
| no lessons yet | Уроки модуля готовятся |
| lesson row meta | <lesson type>, около N мин |
| lesson status | Не начат; В процессе; Пройден; Не пройден |
| prerequisite note | Сначала пройдите: <lesson title> |

Data, not copy: course title and description, module numbers ("00".."05", the directory prefix) and
titles, summaries, outcomes, lesson numbers ("01".."06") and titles, lesson types from the `ia.md` set
("артефакт", "поиск багов"), minutes, all from `course/ai-for-developers/`.

## Accessibility notes

- Landmarks: `banner`, "Уведомления" (region only while non-empty, R2), one `main`. One h1 (the course
  title; the Alert title in the error state). Module sections are `section` labelled by their h2.
- Live containers: only the two in "Уведомления". Course error and progress line are static.
- **"Прогресс недоступен" (round-4 advisory):** the same composition as on the dashboard (`.icon-note`): muted `text-sm`
  line, `info` icon `aria-hidden`, words in `muted-foreground`, icon on the first line when wrapping. Here
  it appears once, under the course description, without a button, and both the status Badges and the
  prerequisite notes are hidden (F6 error state: whether a prerequisite is passed is progress data).
- Each lesson row is one link; its name is number and title, type and time, and status (the Badge text).
  Badges for "Пройден" and "Не пройден" carry icons of different shapes; status is never colour alone.
- Planned modules have no outcomes in `module.yaml`, so "Чему научитесь" is omitted there, not drawn
  empty.
- Prerequisite links are underlined text links in `muted-foreground` (5.251:1 light on `background`).

## Acceptance checks

- AC1: the page lists every module of `course.yaml` in order with number, title and status "Доступен"
  (has `ready` lessons) or "Готовится" (`planned`, or `ready` without a `ready` lesson).
- AC2: a module link moves focus to its section heading and sets the fragment; arriving with
  `#<moduleId>` focuses that heading.
- AC3: a ready module section shows summary, "Чему научитесь" with the module outcomes, and only `ready`
  lessons, each as one link with number, title, "<type>, около N мин" and a lesson status by R5.
- AC4: a planned module, or a ready one with no ready lesson, shows "Уроки модуля готовятся" and no list.
- AC5: a lesson whose prerequisite is not passed shows "Сначала пройдите: " with one link per missing
  lesson right after its row in the Tab order; a broken prerequisite id is not shown; passed ones are not
  listed.
- AC6: lesson links open the lesson on Теория (Задание when there is no theory).
- AC7: "Не пройден" renders as the outline destructive Badge with icon; it appears only once checks can
  close (D1).
- AC8: a course read failure shows only "Не удалось загрузить курс" and "Повторить" in `main`;
  "Повторить" reloads and focuses the h1.
- AC9: a progress read failure shows "Прогресс недоступен" once, removes every lesson status and
  prerequisite note, and keeps every lesson openable.
- AC10: session expiry fills the existing `role="alert"` container without moving focus (as dashboard
  AC10).
- AC11: user menu and `F6` cycle as on the dashboard (AC11, AC12 there).
- AC12: no horizontal scroll at 375, 768, 1280, light and dark.

## Open questions

- Number format: the prototype shows the directory prefix ("00. ", "01. "). If Stepan prefers 1-based
  numbers or no number in the title, it is a data formatting change only.
