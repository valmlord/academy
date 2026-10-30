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
| F4.1 | the "Следующий урок" Card |
| F4.2 | the Card footer holding the one button |
| F4.3 | the button link: "Начать" opens the lesson on Теория (Задание when it has no theory), "Продолжить" on Задание (`?tab=task`) |
| F18.1 | the course line (h2 "Пройдено уроков: N из M" or "Пока нет пройденных уроков") and its Progress |
| F18.2 | the module rows list |

F18.3 (recent attempts) and F18.4 (weak topics, cost) are not drawn in any state, not even as an empty slot
(R6, D4).

## Status

Status: ready

## Purpose

Say in one look what to study next and open it (F4); show course and module progress (F18.1-F18.2).

## Layout and breakpoints

One column at every width (decision A8): top bar, "Уведомления" (only with an alert), then `main` with h1,
the Card, the progress section. Content column `max-width: 48rem` inside the page container (`72rem`,
gutter `space-4`), gap `space-8`.
- 1280 and 768: the column sits at the left of the page container; module rows show title, "N из M
  уроков" and a bar, or the "Готовится" Badge at the right.
- 375: the same column at full width; titles wrap; the top bar stays one row (the system rule: the email
  is cut at 6rem below a 480px viewport, the button's accessible name stays the full email; at 320 the
  user button wraps to a second row). No horizontal scroll at
  375, 768, 1280 in any state (checked).

## Components

| shadcn | Usage |
|--------|-------|
| Card | "Следующий урок"; "Все доступные уроки пройдены" |
| Button | "Начать" / "Продолжить" (default, as a link), "Открыть курс" (outline, link), "Повторить" (secondary, sm) |
| Badge | lesson type (`outline`, e.g. "артефакт"); module status "Готовится" (`outline`, `data-tone="muted"`) |
| Progress | course bar (`role="progressbar"`, labelled by the course line, `aria-valuetext` "N из M"); module bars inside the row links are `aria-hidden` (the row text already says "N из M уроков") |
| Item | module rows, each one link to the catalog section |
| Alert | course load error (destructive, static); session expired in "Уведомления" (destructive) |
| DropdownMenu | user menu: label with the email and "Выйти" (link item) inside one `role="group"` named by the label (`aria-labelledby`, label `role="presentation"`), as in `components.html` |
| Empty | "В курсе пока нет готовых уроков" |
| Skeleton | loading |

Compositions: top bar, "Уведомления" (R2), and the "Прогресс недоступен" line (see Accessibility notes).

## States

| State | Anchor | What shows |
|-------|--------|------------|
| first run (default) | `#state-first-run` | Card: first lesson of the first module, "Начать"; course line "Пока нет пройденных уроков", bar 0; module 00 "0 из 6 уроков"; other modules "Готовится" |
| in progress | `#state-in-progress` | Card: the started next lesson (sample: 02 "Устройство агента: цикл, харнесс, инструменты, MCP", около 60 мин; 01 passed, the same story as the catalog default), "Продолжить"; "Пройдено уроков: 1 из 6"; module 00 "1 из 6 уроков" |
| all ready lessons passed | `#state-all-passed` | Card "Все доступные уроки пройдены", "Новые модули появятся в каталоге", "Открыть курс"; "Пройдено уроков: 6 из 6" |
| no ready lessons | `#state-no-ready-lessons` | Empty "В курсе пока нет готовых уроков", no button, no progress section (nothing focusable in `main`, R3) |
| loading | `#state-loading` | Skeletons for the Card and the progress section (`aria-hidden`) |
| course load error | `#state-course-error` | Alert "Не удалось загрузить курс" with "Повторить" instead of the Card; no progress section; the top bar works |
| progress unavailable (F4 and F18 errors) | `#state-progress-unavailable` | Card: first lesson, "Начать", line "Прогресс недоступен, показан первый урок"; progress section: line "Прогресс недоступен" and "Повторить" |
| session expired (F2.1) | `#state-session-expired` | in-progress content plus the Alert in "Уведомления" with "Войти снова" |
| user menu open (F3.1) | `#state-user-menu` | in-progress content with the user menu open |

R5: until #31 or #34 ships no lesson can be started, so the shipped app shows only "Начать"; the
in-progress state is drawn for when it can.

## Interactions and keyboard

- Tab order: "К содержимому", "Академия", "Главная", "Курс", user menu, "Войти снова" (only with the
  alert), then `main`: Card button (or "Повторить", or "Открыть курс"), "Повторить" of the progress
  section when shown, module rows in order.
- `F6` / Shift+`F6` and Ctrl+Shift+. / Ctrl+Shift+, cycle "Верхняя панель" ("Академия"), "Уведомления"
  ("Войти снова", only while it holds the alert), `main` (its first focusable element: the Card button,
  "Повторить" or "Открыть курс"; in "no ready lessons" `main` itself, `tabindex="-1"`). R3.
- "Начать" / "Продолжить": navigation (`a href`); target tab per F4.3.
- Course error "Повторить" (prototype: proto.js `data-goto-state` + `data-focus`): reloads the Card; focus moves to the Card heading "Следующий урок"
  (`tabindex="-1"`, R2).
- **Progress "Повторить" (round-4 advisory):** reloads the progress section **and** the Card, because the
  next lesson and "Начать" / "Продолжить" are progress data; focus moves to the progress section heading
  (the course line, `tabindex="-1"`, R2). The Card updates in place without taking focus.
- Module row: link to `/courses/[courseId]#[moduleId]` (`ia.md`; `moduleId` is the `module.yaml` `id`, e.g.
  `#introduction`), which focuses that module's section heading (F5.2). The prototype links
  `../catalog/prototype.html#<moduleId>` with no `#state-`: the catalog opens its default state.
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
| top bar nav | Главная; Курс |
| user menu item | Выйти |
| notifications heading (visually hidden) | Уведомления |
| session alert | Сессия закончилась. Файлы в рабочей папке сохранены. |
| session action | Войти снова |
| card title | Следующий урок |
| duration | около N мин |
| start | Начать |
| continue | Продолжить |
| course error | Не удалось загрузить курс |
| retry | Повторить |
| progress unavailable, card | Прогресс недоступен, показан первый урок |
| progress unavailable, section | Прогресс недоступен |
| all passed | Все доступные уроки пройдены |
| all passed description | Новые модули появятся в каталоге |
| open catalog | Открыть курс |
| no ready lessons | В курсе пока нет готовых уроков |
| course line | Пройдено уроков: N из M |
| course line, first run | Пока нет пройденных уроков |
| module row | N из M уроков |
| progress value text | N из M |
| module status | Готовится |
| lesson type | артефакт (any of the `ia.md` lesson type set) |

Sample data (not copy): lesson, module titles and `learner@example.com`, from `course/` and the seed.

## Accessibility notes

- Landmarks: `banner` (top bar), "Уведомления" as a `region` only while it holds an alert (R2), one
  `main` (`tabindex="-1"`, skip-link target). One h1.
- Live containers: only the two in "Уведомления" (`role="alert"` and `role="status"`), present and empty
  from load; text inserted, never the container (R2). The course error and the progress line are static,
  not live: they render with the page.
- **One "Прогресс недоступен" composition (round-4 advisory, `.icon-note`), reused on catalog:** a muted `text-sm` line
  with the `info` status icon (`aria-hidden`) and the words, icon on the first line when the text wraps,
  normal weight. Dashboard uses it twice: in the Card ("Прогресс недоступен, показан первый урок") and as
  the progress section heading ("Прогресс недоступен", an h2 so focus has a target after "Повторить"),
  followed by "Повторить"; catalog uses it once under the course description without a button (its
  retry is the course reload). Same markup, same style; only the words and the following button differ.
- Lesson-type Badge text is part of the Card; status is never colour alone ("Готовится" is a word).
- Course Progress: `aria-labelledby` the course line, `aria-valuetext` "N из M".
- Focus never falls back to `body` after "Повторить" (R2).

## Acceptance checks

- AC1: the Card shows the first `ready` lesson in catalog order that is not finished, with module title,
  lesson type Badge, "около N мин" and one button.
- AC2: the button reads "Продолжить" exactly when R5 says the lesson is started, else "Начать"; "Начать"
  opens the lesson on Теория (Задание when there is no theory), "Продолжить" on Задание.
- AC3: first run shows "Пока нет пройденных уроков", module rows "0 из N уроков", and no attempts, weak
  topics or cost block anywhere (R6).
- AC4: the course line counts passed `ready` lessons ("Пройдено уроков: N из M"); the bar exposes
  `aria-valuetext` "N из M".
- AC5: a module with status "Готовится" shows the Badge and no bar; a module row opens
  `/courses/[courseId]#[moduleId]` and focus lands on that module heading.
- AC6: all ready lessons passed shows "Все доступные уроки пройдены", "Новые модули появятся в каталоге"
  and "Открыть курс" to the catalog.
- AC7: no ready lesson shows "В курсе пока нет готовых уроков" with no button and no progress section;
  `F6` to `main` focuses `main`.
- AC8: a course read failure replaces the Card with "Не удалось загрузить курс" and "Повторить"; the top
  bar works; "Повторить" reloads and focuses the Card heading.
- AC9: a progress read failure shows the first lesson with "Начать" and "Прогресс недоступен, показан
  первый урок", and the progress section "Прогресс недоступен" with "Повторить"; "Повторить" reloads the
  section and the Card and focuses the section heading.
- AC10: a rejected request mid-session puts "Сессия закончилась. Файлы в рабочей папке сохранены." with
  "Войти снова" into the existing `role="alert"` container without moving focus; the wrapper becomes the
  "Уведомления" region; "Войти снова" goes to `/sign-in?next=/`.
- AC11: the user menu opens with Enter or Space, shows the email, "Выйти" signs out to `/sign-in` with "Вы
  вышли"; Esc returns focus to the button.
- AC12: `F6` and Ctrl+Shift+. cycle top bar, "Уведомления" (only when non-empty), `main` as R3.
- AC13: no horizontal scroll at 375, 768, 1280, light and dark; the top bar stays one row at 375.

## Open questions

None blocking. The progress section has no heading of its own in the `ia.md` copy register, so the course
line is its h2; a separate heading would need a register entry first.
