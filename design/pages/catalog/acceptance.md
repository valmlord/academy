# Catalog: acceptance notes

## Route

`/courses/[courseId]`; module sections at `/courses/[courseId]#[moduleId]` (decision A6). Title and h1:
the course name of the URL's course ([A218-7](../../flows/ia.md#A218-7)), e.g. "ИИ для разработчиков" or
"Пробный курс". While the course cannot be read, `<title>` and h1 are "Не удалось загрузить курс" (HTTP
200), whatever course id the URL names (until #220, the one-course app; from #220 [ES7](../../flows/ia.md#ES7), [ES8](../../flows/ia.md#ES8)). A catalog URL
that is a way into the not-found page opens it (`design/pages/not-found/`, HTTP 404; `ia.md` page
inventory, not-found Route).

## Prototype

`design/pages/catalog/prototype.html`. States by `#state-<name>`; `#<moduleId>`, the `module.yaml` `id` (e.g.
`prototype.html#introduction`), opens the default state focused on that module heading; the section `id`
is that same `moduleId`, as in the app. The "Prototype states" bar and "Dark theme" are prototype chrome,
not product UI.

**Several courses (from #220, #218).** Every state draws #220 (its States label starts "#220, ") except the
three kept until #220 (`#state-course-error`, `#state-progress-unavailable`, `#state-default-until-220`;
label ends ", until #220"; the from-#220 course error: `#state-courses-course-error` ([ES7](../../flows/ia.md#ES7)) and
`#state-root-error` ([ES8](../../flows/ia.md#ES8)); the progress line has no #220 drawing, limit 7). #220 states: the top bar is
[A218-3](../../flows/ia.md#A218-3) ("Академия", "Главная", the user menu; no "Курс", `aria-current` on
neither link); the h1 is the course name (A218-7), except in the course error (`#state-courses-course-error`,
`#state-root-error`), whose h1 is "Не удалось загрузить курс"; `#state-courses-two`, `#state-courses-one-empty`,
`#state-stub-course`, `#state-stub-course-empty`, `#state-courses-course-error` and
`#state-courses-other-no-title` end with "Другие курсы" ([A218-14](../../flows/ia.md#A218-14),
[ES7](../../flows/ia.md#ES7)); the other #220 states have none (`#state-root-error`: [ES8](../../flows/ia.md#ES8); the
others draw one course). Kept states keep that release's
top bar with "Курс" (`ia.md` R6 "Top bar by release"), as drawn before #220. `#state-default-until-220` is
the default drawing in that release; "Повторить" of `#state-course-error` lands there, because the retry
stays in its release.

**Sample data.** Course 1 is `course/ai-for-developers` as on HEAD: six modules, all `ready`, with 6, 7, 5,
6, 8 and 5 `ready` lessons (37); titles, types, minutes and prerequisites from the YAML. Progress in every
course-1 state with a lesson status: lesson 01 "Пройден", lesson 02 "В процессе" (`#state-failed-lesson`:
"Не пройден"), every other lesson "Не начат", so every lesson from 03 on has a prerequisite note.
Course 2 is the #217 stub: id `zz-stub-course`, "Пробный курс", "Курс-заглушка с одним уроком.", one module
`stub-module` "00. Пробный модуль" (summary "Один урок для проверки нескольких курсов.", outcome "Открыть
урок второго курса."), one lesson `stub-lesson` "01. Пробный урок", "артефакт, около 15 мин", "Не начат".
`#state-stub-course-empty` is the same course with that lesson not `ready`. The numbers "00", "01" of the
stub are its sample directory prefixes.

**Prototype limits** (design #233 rules L1-L4; the static file holds one `<title>`, and proto.js joins no
state and anchor):
1. `<title>` is course 1's, "ИИ для разработчиков", in every state, course 2 and the course error states
   (`#state-course-error`, `#state-courses-course-error`, `#state-root-error`) included; the app sets the URL's
   course name, or "Не удалось загрузить курс" in the course error.
2. Course-2 lesson (L2): no lesson prototype of course 2 exists, so the "Пробный урок" row of
   `#state-stub-course` opens `../lesson/prototype.html`. App route
   `/courses/zz-stub-course/lessons/stub-lesson`; focus on arrival: none (page load).
3. Other sample progress (L4): the lesson prototype draws one lesson, so in the #220 course-1 states every
   lesson row and every "Сначала пройдите" link opens `../lesson/prototype.html` (app route
   `/courses/ai-for-developers/lessons/<lessonId>`, focus: none); in the kept `#state-progress-unavailable`
   and `#state-default-until-220` they open `../lesson/prototype.html#state-m0`, the lesson of that release
   (same route, focus: none). The top bar of `#state-failed-lesson` and `#state-ready-no-lessons` opens
   `../dashboard/prototype.html#state-in-progress`, other progress than theirs (route `/`, focus: none).
4. Arrival from a dashboard block 2 module row (L3): `../catalog/prototype.html#state-stub-course` opens
   course 2 without its module anchor; the app opens `/courses/zz-stub-course#stub-module`, focus target on
   arrival the `#stub-module` section heading, present in `#state-stub-course`.
5. Arrival from a past or kept state of another page with `#<moduleId>` (L1, e.g. the M0 lesson's module
   crumb): opens `#state-default`, drawn from #220; the app opens that release's catalog
   (`/courses/ai-for-developers#<moduleId>`, focus: that module section's heading).
6. "Другие курсы" links are same-page `#state-` links here; the app loads `/courses/<courseId>` (focus on
   arrival: none, page load), while the prototype's hash change puts focus on `main` (proto.js focus
   repair). The kept top-bar "Курс" links its own state, so focus stays on it; the app reloads the page
   (route `/courses/ai-for-developers`, focus: none).
7. The from-#220 course error (L6 of the dashboard notes): each "Повторить" simulates the "Loads" outcome
   only, `#state-courses-course-error` to `#state-stub-course` and `#state-root-error` to `#state-courses-two`,
   focus on the course h1; "Fails again", the not-found column, the guard and the press focus are not drawn
   (AC15-AC19). The progress line is drawn only in the kept `#state-progress-unavailable`; from #220 it is the
   same composition (F6 error states; #222 adds no rule for it).
8. From #220, a course that cannot be read while the root reads is drawn only as `#state-courses-course-error`. Its "ИИ для разработчиков" link
   opens `#state-courses-two`, which shows course 1 as that sample has it, while the "Пробный курс" link and the
   top bar of `courses-two` are drawn for the sample in which every course reads (the readable
   `#state-stub-course`, dashboard `courses-two`). `#state-courses-other-no-title` stands for a root where course
   2's `course.yaml` is unreadable; its "zz-stub-course" link opens `#state-courses-course-error`, drawn for the
   sample in which course 2's title reads (its top bar opens dashboard `courses-one-broken`, h2 "Пробный
   курс"). App: `/courses/<courseId>` of the link, focus: none (page load).

Top-bar links per state (each a `data-state` variant, one renders per state; app href `/`):

| States | "Академия", "Главная" open | "Курс" (kept only) |
|---|---|---|
| `default`, `failed-lesson`, `ready-no-lessons`, `session-expired`, `user-menu` | `../dashboard/prototype.html#state-in-progress` | none |
| `courses-two`, `stub-course` | `../dashboard/prototype.html#state-courses-two` | none |
| `courses-one-empty`, `stub-course-empty` | `../dashboard/prototype.html#state-courses-one-empty` | none |
| `loading` | `../dashboard/prototype.html#state-loading` | none |
| `courses-course-error` | `../dashboard/prototype.html#state-courses-one-broken` | none |
| `root-error` | `../dashboard/prototype.html#state-root-error` | none |
| `courses-other-no-title` | `../dashboard/prototype.html#state-courses-broken-no-title` | none |
| `course-error` | `../dashboard/prototype.html#state-course-error` | `prototype.html#state-course-error` |
| `progress-unavailable` | `../dashboard/prototype.html#state-progress-unavailable` | `prototype.html#state-progress-unavailable` |
| `default-until-220` | `../dashboard/prototype.html#state-in-progress-until-220` | `prototype.html#state-default-until-220` |

## Flows

| Step | Element (`data-step`) |
|------|-----------------------|
| F2.1 | the session Alert inside the `role="alert"` container of "Уведомления" |
| F3.1 | the user menu button |
| F3.2 | the menu item "Выйти" |
| F5.1 | the module list of course 1 (number, title, module status) |
| F5.2 | the section of module 00 of course 1 (summary, "Чему научитесь", lessons) |
| F5.3 | the lesson rows list of module 00 of course 1 |
| F5.4 | the first lesson row link (opens the lesson; both link variants of the row) |
| F6.1 | the prerequisite note of lesson 03 of module 00 (both note variants) |

## Status

Status: ready

## Purpose

Show the whole course, every module with its status, and every `ready` lesson; open a lesson (F5); warn
about unpassed prerequisites without locking (F6, decision A5); from #220 reach the other courses'
catalogs (A218-14).

## Layout and breakpoints

One column at every width (A8): top bar, "Уведомления" (only with an alert), `main` with the course header
(h1, description, the "Прогресс недоступен" line when it applies), the module list, then one section per
module separated by a Separator, then, from #220 by A218-14, the "Другие курсы" section after a Separator. In
the course error `main` holds the Alert, and from #220 the "Другие курсы" section after it when
[ES7](../../flows/ia.md#ES7) renders one.
Content column `max-width: 48rem`, gap `space-8`.
- 1280 and 768: lesson rows show number and title, "type, около N мин" under it, the status Badge at the
  right; the prerequisite note under the row, indented to the row text.
- 375: the same; titles wrap, the Badge stays at the right of the row; module list items wrap the Badge
  under the link when needed; top bar one row (the system rule: email cut at 6rem below a 480px viewport,
  full accessible name; wraps to a second row at 320).
- A long course name (h1, a "Другие курсы" link) wraps; nothing scrolls sideways at 320 px and at 1280 px
  with 200 % zoom (WCAG 1.4.10; checked with a 120-character name, light and dark).

## Components

| shadcn | Usage |
|--------|-------|
| Badge | module status "Доступен" (`secondary`), "Готовится" (`outline`, `data-tone="muted"`); lesson status "Не начат" (`outline` muted), "В процессе" (`secondary`), "Пройден" (`success` with the success icon), "Не пройден" (`outline` `data-tone="destructive"` with the destructive icon, D1 data) |
| Item | lesson rows: each row is one link (`a.item`), one Tab per lesson |
| Separator | between module sections, and before "Другие курсы" |
| Empty | "Уроки модуля готовятся" |
| Alert | course load error (destructive, static); session expired in "Уведомления" |
| Button | "Повторить" (secondary, sm); "Войти снова" (sm, link) |
| DropdownMenu | user menu: label with the email and "Выйти" (link item) inside one `role="group"` named by the label (`aria-labelledby`, label `role="presentation"`), as in `components.html` |
| Skeleton | loading |

Compositions: top bar, "Уведомления" (R2), the "Прогресс недоступен" line (`.icon-note`, same as the
dashboard), the prerequisite note (`.item-note`, a `p` after the row link in the same `li`: "Сначала
пройдите: " then one link per missing lesson, comma separated), the module list (`.module-list`, page
style: a vertical list of text links, a Badge after each module link). "Другие курсы" is a `section`
labelled by its h2 with a `ul.module-list` of plain text links, the module list's style without Badges; no
new component.

## States

| State | Anchor | What shows |
|-------|--------|------------|
| #220, default (ready and planned modules, prerequisites) | `#state-default` | course 1: six modules "Доступен"; lesson statuses and prerequisite notes per the sample data |
| #220, lesson failed (D1 data) | `#state-failed-lesson` | as default, lesson 02 "Не пройден" (sample data: only once checks can close, D1 / F14.4) |
| #220, ready module without ready lessons | `#state-ready-no-lessons` | as default, module 05 `legacy-code` with no `ready` lesson (sample variant): "Готовится" in the list and in its section, "Уроки модуля готовятся" instead of the rows; summary and outcomes stay |
| #220, loading | `#state-loading` | Skeletons (`aria-hidden`); the h1 arrives with the data |
| #220, session expired (F2.1) | `#state-session-expired` | default content plus the Alert in "Уведомления" |
| #220, user menu open (F3.1) | `#state-user-menu` | default content with the menu open |
| #220, two courses: course 1 | `#state-courses-two` | default content, then "Другие курсы" with "Пробный курс" |
| #220, two courses, course 2 without ready lessons: course 1 | `#state-courses-one-empty` | as `courses-two`; its "Пробный курс" opens `#state-stub-course-empty` |
| #220, two courses: course 2 | `#state-stub-course` | h1 "Пробный курс", its description, one module "Доступен" (section `#stub-module`), one lesson "Не начат"; "Другие курсы" with "ИИ для разработчиков" |
| #220, two courses: course 2 without ready lessons | `#state-stub-course-empty` | as `stub-course`, the module "Готовится" and "Уроки модуля готовятся" instead of the row (`catalog.md` F5 Empty states); the #220 e2e opens it from its dashboard block and from "Другие курсы" (`courses.md` "Requirements for #220" item 7) |
| #220, two courses: course 2 cannot be read | `#state-courses-course-error` | [ES7](../../flows/ia.md#ES7): the course error of `course-error` (h1 "Не удалось загрузить курс", "Повторить"), then "Другие курсы" with "ИИ для разработчиков"; top bar of A218-3. "Повторить": to `#state-stub-course`, focus on the course h1 (limit 7) |
| #220, the root cannot be read | `#state-root-error` | [ES8](../../flows/ia.md#ES8): the course error only, no "Другие курсы"; top bar of A218-3. "Повторить": to `#state-courses-two`, focus on the course h1 (limit 7) |
| #220, two courses: course 1, course 2's title unreadable | `#state-courses-other-no-title` | as `courses-two`, the "Другие курсы" link reads `zz-stub-course` ([ES10](../../flows/ia.md#ES10); limit 8) |
| course load error, until #220 | `#state-course-error` | destructive Alert "Не удалось загрузить курс" (its title is the h1 in this state) with "Повторить"; nothing else in `main`; top bar with "Курс" (`ia.md` R6, "Course id unknown", decides when it is left out; the prototype draws the id-known bar). From #220: `#state-courses-course-error`, `#state-root-error` |
| progress unavailable, until #220 | `#state-progress-unavailable` | course 1: "Прогресс недоступен" once under the description; rows with no status Badge and no prerequisite note; rows stay links. From #220 the same composition, not redrawn (limit 7) |
| default, until #220 | `#state-default-until-220` | the default content in the release before #220: top bar with "Курс", no "Другие курсы" |

Not-found is its own page (`design/pages/not-found/`), not a catalog state.

## Interactions and keyboard

- Tab order: skip link, top bar ("Академия", "Главная", until #220 also "Курс"; `ia.md` R6 "Top bar by
  release", from #220 A218-3), user menu, "Войти снова" (only with the alert), then in `main`: module
  links in order, then per module the lesson row links, each followed by its prerequisite note's links (F6
  keyboard path), then from #220 the "Другие курсы" links (A218-14; `catalog.md` F5 Keyboard path). From
  #220 in the course error: [ES12](../../flows/ia.md#ES12) (measured in AC19).
- Module link (F5.1): moves focus to that module's section heading (`tabindex="-1"`) and scrolls it into
  view; the URL fragment becomes `#<moduleId>` (the prototype keeps its `#state-` hash instead, proto.js
  in-page anchors).
- Arrival with `#<moduleId>` (dashboard module row, lesson module crumb, both linking
  `/courses/[courseId]#[moduleId]`, e.g. `#introduction`): focus on that module heading.
- Lesson row: opens the lesson on Теория (Задание when it has no theory).
- Prerequisite link: opens that lesson.
- "Другие курсы" link (from #220): opens that course's catalog, `/courses/<courseId>` (A218-14; F5 of that
  course); one Tab per link.
- "Повторить" (until #220; from #220 the next bullet): reloads the course (`ia.md` R2, page-level retry table):
  focus on the course h1 with `<title>` the course title on success; the error h1 (`id="course-error-title"`,
  `tabindex="-1"`) with `<title>` "Не удалось загрузить курс" on a second failure; the not-found h1 with
  `<title>` "Страница не найдена" when the course loads but its id is not the URL's. A pointer press on
  "Повторить" that did not focus it (Safari) puts focus on it before the retry ends (`ia.md` R2). The
  closing focus move follows the R2 retry focus guard (`ia.md:338-353`); the guard covers the course h1 and
  error h1 moves; the not-found move keeps its statement (#95). The prototype simulates the first outcome
  only (proto.js `data-goto-state="default-until-220"`, `data-focus="#course-title"`) and draws neither the
  press focus nor the guard.
- "Повторить" from #220 ([ES7](../../flows/ia.md#ES7), [ES8](../../flows/ia.md#ES8)): the R2 page-level retry table, row "catalog course error", gives
  each outcome's focus target and `<title>`, its not-found column the ways of the `ia.md` page inventory; the
  closing move follows the R2 retry focus guard with [RG2](../../flows/ia.md#RG2)'s block and [RG1](../../flows/ia.md#RG1)'s timing; the press focus of
  R2 applies. Prototype: limit 7.
- `F6` cycle (R3): "Верхняя панель" ("Академия"), "Уведомления" ("Войти снова", only when non-empty), `main`:
  the first module link ("00. Введение в разработку с ИИ" in course 1, "00. Пробный модуль" in course 2),
  "Повторить" in the error state, `main` itself while loading (nothing focusable). "Другие курсы" changes
  no landing (A218-14).
- "Войти снова": `/sign-in?next=<current path, URL-encoded>`, e.g. `/sign-in?next=%2Fcourses%2Fai-for-developers`
  (F2.2). The prototype links `../sign-in/prototype.html?next=%2Fcourses%2Fai-for-developers#state-with-next`;
  sign-in then returns to the catalog prototype.
- User menu: as on every page with the top bar (F3).

## Copy

| Key | Russian text |
|-----|--------------|
| skip link | К содержимому |
| top bar brand | Академия |
| top bar nav | Главная (A218-3); until #220 also "Курс" (`ia.md` R6 "Top bar by release" and "Course id unknown"; replaced by A218-3) |
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
| other courses heading (from #220) | Другие курсы |
| other course link (from #220) | <course name> (A218-7); the course id where the title cannot be read ([ES10](../../flows/ia.md#ES10)) |

Data, not copy: course name and description, module numbers (the directory prefix, "00".."05") and
titles, summaries, outcomes, lesson numbers (the directory prefix within the module) and titles, lesson
types from the `ia.md` set ("артефакт", "поиск багов", "проект"), minutes, all from `course/<courseId>/`;
the course-2 values are the #217 stub's sample data.

## Accessibility notes

- Landmarks: `banner`, "Уведомления" (region only while non-empty, R2), one `main`. One h1 (the course
  name, A218-7; the Alert title in the error state). Module sections are `section` labelled by their h2;
  "Другие курсы" is a `section` labelled by its h2 (A218-14), its links named by the course name (or the
  course id, [ES10](../../flows/ia.md#ES10)).
- Live containers: only the two in "Уведомления". Course error (from #220 also with "Другие курсы", [ES7](../../flows/ia.md#ES7)) and
  progress line are static.
- **"Прогресс недоступен" (round-4 advisory):** the same composition as on the dashboard (`.icon-note`): muted `text-sm`
  line, `info` icon `aria-hidden`, words in `muted-foreground`, icon on the first line when wrapping. Here
  it appears once, under the course description, without a button, and both the status Badges and the
  prerequisite notes are hidden (F6 error state: whether a prerequisite is passed is progress data).
- Each lesson row is one link; its name is number and title, type and time, and status (the Badge text).
  Badges for "Пройден" and "Не пройден" carry icons of different shapes; status is never colour alone.
- A module without outcomes in `module.yaml` omits "Чему научитесь" rather than drawing it empty (every
  module on HEAD has outcomes).
- Prerequisite links are underlined text links in `muted-foreground` (5.251:1 light on `background`).
- The variants of a top-bar link, a lesson row or a prerequisite note are prototype markup: one renders per
  state, and the app renders one element.

## Acceptance checks

AC1-AC7, AC9-AC12 apply in both releases; AC8 is the one-course form until #220 (from #220: AC15-AC19);
AC13-AC19 apply from #220.

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
- AC8 (until #220; from #220: AC15-AC19): a course read failure shows only "Не удалось загрузить курс" and
  "Повторить" in `main`, with `<title>` "Не удалось загрузить курс" (the app; the static prototype keeps
  the course title) and the top bar "Курс" by `ia.md` R6 "Course id unknown". "Повторить" moves focus as
  "Interactions and keyboard" states (`ia.md` R2, page-level retry table and retry focus guard).
- AC9: a progress read failure shows "Прогресс недоступен" once, removes every lesson status and
  prerequisite note, and keeps every lesson openable (both releases; #222 adds no rule for it, limit 7).
- AC10: session expiry fills the existing `role="alert"` container without moving focus (as dashboard
  AC10).
- AC11: user menu and `F6` cycle as on the dashboard (AC11, AC12 there); `F6` to `main` lands on the first
  module link (in the course error on "Повторить": Interactions and keyboard, `F6` cycle; from #220 AC19).
- AC12: no horizontal scroll at 375, 768, 1280, light and dark.
- AC13 (from #220): the top bar is A218-3: "Академия", "Главная", the user menu, no "Курс", `aria-current`
  on neither link; h1 and `<title>` are the URL's course name (A218-7), except in the course error (AC15, AC16).
- AC14 (from #220): A218-14 decides when the page ends with the "Другие курсы" section (h2 "Другие курсы",
  a `ul` of one link per other course in list order, `courses.md` Q5, each named by the course name (or its
  id, [ES10](../../flows/ia.md#ES10)) and
  opening `/courses/<courseId>`, a course with no `ready` lesson included); its links come after the
  lesson and prerequisite links in the Tab order and change no `F6` landing; a long course name wraps with
  no horizontal scroll at 320 px and at 1280 px with 200 % zoom.
- AC15 (from #220, [ES7](../../flows/ia.md#ES7)): `#state-courses-course-error`: `main` holds the course error (the h1 "Не удалось
  загрузить курс", `tabindex="-1"`, and "Повторить") and then "Другие курсы" (A218-14), here "ИИ для разработчиков"; `<title>` "Не удалось загрузить курс" (the app; limit 1); the
  Alert has no live role.
- AC16 (from #220, [ES8](../../flows/ia.md#ES8)): `#state-root-error`: the course error and nothing else in `main`, no "Другие
  курсы".
- AC17 (from #220, [ES10](../../flows/ia.md#ES10)): `#state-courses-other-no-title`: the "Другие курсы" link of the course whose title
  cannot be read is named `zz-stub-course` (measured accessible name).
- AC18 (from #220, [RG2](../../flows/ia.md#RG2), [RG1](../../flows/ia.md#RG1)): "Повторить" moves focus as the R2 row "catalog course error" says (Loads:
  the course h1; Fails again: the error h1; not-found column: the not-found h1), under the retry focus guard
  whose block is RG2's and whose timing is RG1's. App tests: focus moved to a "Другие курсы" link before the
  answer stays there when the link remains, in "Loads" and in "Fails again"; a focused "Другие курсы" link that
  the result removes gets the target of the outcome (for example "Loads": the course h1); a learner in the top
  bar keeps focus in "Loads" and "Fails again"; the not-found column keeps its R2 statement (#95). Prototype: walked headless at 1280 and 375 px, light and dark:
  `courses-course-error` to `stub-course`, focus `#stub-course-title`; `root-error` to `courses-two`, focus
  `#course-title` (limit 7).
- AC19 (from #220, [ES12](../../flows/ia.md#ES12)): measured on a fresh load, Tab order in `main` and its first entry, the `F6`
  landing of `main`: `courses-course-error` "Повторить", "ИИ для разработчиков"; `root-error` "Повторить".
## Open questions

- Number format: the prototype shows the directory prefix ("00. ", "01. "). If Stepan prefers 1-based
  numbers or no number in the title, it is a data formatting change only.
