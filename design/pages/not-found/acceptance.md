# Not-found: acceptance notes

## Route

No route of its own: the not-found page is what the app renders for the ways into it listed in the `ia.md`
page inventory (not-found Route, the only statement of the set), each answered with HTTP 404:

1. a path no route matches;
2. a catalog URL whose course id is not the course's;
3. a lesson URL whose course id is not the course's;
4. a lesson URL whose lesson id names no `ready` lesson of the course (unknown, or not `ready`).

Ways (2)-(4) need the course read: while it cannot be read those URLs show the course error of their page
(HTTP 200), so only way (1) remains. The course id is unknown (`#state-no-course`) only when `course.yaml`
itself cannot be read; when `course.yaml` parsed and a later file failed, the id is known and the default
state applies (`#state-default`): "Курс" and "Открыть курс" open the catalog's course error with
"Повторить" (`ia.md` R6, "Course id unknown"). `<title>` and h1: "Страница не найдена" in every case. The URL stays as the learner typed or followed it.

App file: `apps/web/app/(app)/not-found.tsx` (dev changes: `ia.md` "Open follow-ups", FU1).

## Prototype

`design/pages/not-found/prototype.html`. States by `#state-<name>`; the "Prototype states" bar and "Dark
theme" are prototype chrome, not product UI. The top bar and "Уведомления" are the catalog prototype's
shell with "Курс" not marked current. `main` uses only system classes (`main.page` > `div.column` >
`div.stack`); the page has no `<style>` of its own.

## Flows

The page has no flow step of its own: it is an error state of F5 and F7 (`catalog.md` F5 error states,
`lesson-environment.md` F7 error states). It carries the shared steps of every page with the top bar.

| Step | Element (`data-step`) |
|------|-----------------------|
| F2.1 | the session Alert inside the `role="alert"` container of "Уведомления" |
| F3.1 | the user menu button (shows the email) |
| F3.2 | the menu item "Выйти" |

## Status

Status: ready

## Purpose

Say in one sentence that the address leads nowhere, without blaming the learner and without revealing
whether a hidden lesson exists, and lead back to the course in one step ("Открыть курс") while the course
id is known. While it is unknown the page shows only the sentence, and "Главная" in the top bar is the way
on (`ia.md` R6, "Course id unknown").

## Layout and breakpoints

One column at every width, the composition of the app's `not-found.tsx`: top bar, "Уведомления" (only with
an alert), then `main.page` (`--page-max` 72rem, the app's `max-w-6xl`, gutter `space-4`) > `div.column`
(`--column-max` 48rem, `max-w-3xl`) > one `div.stack` (gap `space-4`, `gap-4`) holding the h1, the
sentence and, while the course id is known, "Открыть курс" wrapped in a plain `div`.
- The wrapper keeps the button at its intrinsic width, left-aligned (the app's `items-start`): `.stack` is a
  flex column that stretches its children, so a bare button link would fill the column.
- 1280: the column sits at the left of the page container.
- 375 and 320: the same column at full width minus the gutter; the sentence wraps; the top bar follows the
  system rule (the email cut at 6rem below a 480px viewport; at 320 the user button wraps to a second row).
- Checked in every state at 320, 375 and 1280, light and dark: h1 to sentence 16px, sentence to button
  16px, the button narrower than the sentence, no horizontal scroll.

## Components

| shadcn | Usage |
|--------|-------|
| Button | "Открыть курс" (`outline`, default size, as a link); "Войти снова" (sm, link) |
| Alert | session expired in "Уведомления" (destructive) |
| DropdownMenu | user menu: label with the email and "Выйти" (link item) inside one `role="group"` named by the label (`aria-labelledby`, label `role="presentation"`), as in `components.html` |

Compositions: top bar, "Уведомления" (R2). Nothing else: no Alert in `main`, no Empty, no icon, no
breadcrumb, no search, no "404", no destructive colour, because nothing failed (`catalog.md` F5 error
states).

## States

| State | Anchor | What shows |
|-------|--------|------------|
| course id known (default) | `#state-default` | the course read, or `course.yaml` parsed and a later file failed; top bar "Академия", "Главная", "Курс", user menu; `main`: h1, the sentence, "Открыть курс" |
| course id unknown | `#state-no-course` | only when `course.yaml` itself cannot be read; top bar without "Курс" (ia.md R6, "Course id unknown"); `main`: h1 and the sentence only, nothing focusable |
| session expired (F2.1) | `#state-session-expired` | default content plus the Alert in "Уведомления" with "Войти снова" |
| user menu open (F3.1) | `#state-user-menu` | default content with the menu open |

Every state has `aria-current` on neither top-bar link.

## Interactions and keyboard

- Tab order. Course id known: "К содержимому", "Академия", "Главная", "Курс", user menu, "Войти снова"
  (only with the alert), "Открыть курс". Course id unknown: "К содержимому", "Академия", "Главная", user
  menu, "Войти снова" (only with the alert); nothing focusable in `main`.
- `F6` / Shift+`F6` and Ctrl+Shift+. / Ctrl+Shift+, cycle "Верхняя панель", "Уведомления" (only while it
  holds the alert), `main` (R3). Landings from a fresh load:

  | State | Верхняя панель | Уведомления | `main` |
  |-------|----------------|-------------|--------|
  | course id known | "Академия" | no stop | "Открыть курс" |
  | course id unknown | "Академия" | no stop | `main` itself (`tabindex="-1"`) |
  | session expired | "Академия" | "Войти снова" | "Открыть курс" |

- Focus on arrival: none. An ordinary arrival leaves focus where the browser puts it on a new page. The
  only exception: a catalog or lesson "Повторить" whose course loads while the URL is a way into this page
  puts focus on the h1 (`id="not-found-title"`, `tabindex="-1"`; `ia.md` R2, page-level retry table). The
  h1 is no Tab stop and no `F6` target.
- "Открыть курс": link to the catalog, `/courses/[courseId]` (F5). The prototype links
  `../catalog/prototype.html`.
- "Главная", "Академия": `/`; "Курс": `/courses/[courseId]`, as on every page with the top bar.
- User menu: Enter or Space opens it, focus on the first item; arrows, Home, End; Esc closes and returns
  focus to the button; "Выйти" goes to sign-in with "Вы вышли" (F3.3).
- "Войти снова": `/sign-in?next=<current path, URL-encoded>` (F2.2); after sign-in the app returns to the
  same URL, which is this page again (F2.4). The prototype links
  `../sign-in/prototype.html?next=%2Fno%2Fsuch%2Fpath#state-with-next`; the sign-in prototype maps only
  lesson and course paths, so it returns to the dashboard prototype for this unmapped `next`.

## Copy

| Key | Russian text |
|-----|--------------|
| title, h1 | Страница не найдена |
| sentence | Возможно, в адресе опечатка или ссылка устарела. |
| open catalog | Открыть курс (only while the course id is known) |
| skip link | К содержимому |
| top bar brand | Академия |
| top bar nav | Главная; Курс (not while the course id is unknown, ia.md R6, "Course id unknown") |
| user menu item | Выйти |
| notifications heading (visually hidden) | Уведомления |
| session alert | Сессия закончилась. Файлы в рабочей папке сохранены. |
| session action | Войти снова |

Every string is in the `ia.md` register: the not-found page copy row, the action labels, the "page alert"
set. Sample data (not copy): `learner@example.com`.

## Accessibility notes

- Landmarks: `banner` (no `aria-label`; R3 calls it "Верхняя панель"), "Уведомления" as a `region` named by
  its hidden h2 only while it holds an alert (R2), one `main` (`tabindex="-1"`, skip-link target, no
  name). The `navigation` in the bar has no name (the only one in the banner). One h1.
- Live containers: only the two in "Уведомления" (`role="alert"` and `role="status"`), present and empty
  from load; text inserted, never the container (R2). The sentence is static.
- The h1 has `tabindex="-1"` for the retry focus only (R2); it is not a Tab stop and not an `F6` target
  (R3 excludes `tabindex="-1"`).
- The sentence names both real causes (a typed address, an old link) and is true for a hidden lesson too,
  so the page never reveals that a non-`ready` lesson exists.
- "Открыть курс" is the outline Button as a link (`a href`), so it is announced as a link and opens with
  Enter.

## Acceptance checks

- AC1: `<title>` and the one h1 read "Страница не найдена"; the h1 has `tabindex="-1"`.
- AC2: `main` holds the h1, the sentence "Возможно, в адресе опечатка или ссылка устарела." and nothing else
  but "Открыть курс": no Alert, icon, "404", breadcrumb or search.
- AC3: "Открыть курс" opens the catalog (`/courses/[courseId]`) and keeps its intrinsic width, 16px under
  the sentence.
- AC4: while the course id is unknown (`#state-no-course`): no "Курс", no "Открыть курс"; `F6` to `main`
  focuses `main`.
- AC5: the top bar has `aria-current` on neither link in every state.
- AC6: `F6` and Ctrl+Shift+. land as the table in Interactions and keyboard, in each of its three states;
  the user menu state is the default content with the menu open, and its keyboard is AC8.
- AC7: session expiry fills the existing `role="alert"` container without moving focus; the wrapper
  becomes the "Уведомления" region; "Войти снова" goes to `/sign-in?next=<current path>`.
- AC8: the user menu works as on the dashboard (dashboard AC11): Enter or Space opens it, Esc returns
  focus to the button, "Выйти" signs out to `/sign-in` with "Вы вышли".
- AC9: after a catalog or lesson "Повторить" that ends here, focus is on the not-found h1 with `<title>`
  "Страница не найдена"; otherwise focus does not move.
- AC10: the response is HTTP 404 for each of the four ways in (Route).
- AC11: no horizontal scroll at 320, 375 and 1280, light and dark, in every state.

## Open questions

None.
