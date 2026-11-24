# Not-found: acceptance notes

## Route

No route of its own: the not-found page is what the app renders for the ways into it listed in the `ia.md`
page inventory (not-found Route, the only statement of the set), each answered with HTTP 404. The ways
are numbered (1)-(4) there; this note uses those numbers and never restates their conditions.

- From #220 (#218): the page inventory's "From #220" ways. `#state-default` draws way (4), with
  "Открыть курс"; `#state-no-course` draws ways (1)-(3), with no action ([A218-12](../../flows/ia.md#A218-12)).
  While the root or the URL's course cannot be read: see #222.
- Until #220 (the one-course app): the inventory's first list. `#state-no-course` stood for "course id
  unknown" and `#state-default` for "course id known" (`ia.md` R6, "Course id unknown"); from #220
  A218-12 replaces that rule on this page (`ia.md` "Several courses (#218)", intro).

`<title>` and h1: "Страница не найдена" in every state. The URL stays as the learner typed or followed it.

App file: `apps/web/app/(app)/not-found.tsx` (dev changes: `ia.md` "Open follow-ups", FU1).

## Prototype

`design/pages/not-found/prototype.html`. States by `#state-<name>`; every state is the #220 form (labels
start with "#220"). The "Prototype states" bar and "Dark theme" are prototype chrome, not product UI. The
top bar is the #220 bar of every page ([A218-3](../../flows/ia.md#A218-3); `ia.md` R6, "Top bar by
release") and "Уведомления" the shared shell. `main` uses only system classes (`main.page` > `div.column`
> `div.stack`); the page has no `<style>` of its own.

Prototype limits (the static file cannot follow the URL):
- "Академия" and "Главная" link `../dashboard/prototype.html#state-courses-two`; the app links `/`. The
  page shows no progress, so the prototype picks the two-course sample; focus on arrival: none.
- "Открыть курс" links `../catalog/prototype.html` (its default state, course 1); the app links the URL's
  course, `/courses/[courseId]` (`ia.md` "Rules (#218)" row "course of each control"); the sample way (4)
  URL is a course-1 lesson URL. Focus on arrival: none (page load).
- "Войти снова" carries the sample way (4) URL `/courses/ai-for-developers/lessons/no-such-lesson` as
  `next`. The sign-in prototype maps every lesson path to the lesson prototype, so it lands there; the app
  returns to the same URL, which is this page again (F2.4).

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
whether a hidden lesson exists. In way (4) lead back to the URL's course in one step ("Открыть курс"); in
ways (1)-(3) show only the sentence, and the top bar ("Академия", "Главная") is the way on (A218-12).

## Layout and breakpoints

One column at every width, the composition of the app's `not-found.tsx`: top bar, "Уведомления" (only with
an alert), then `main.page` (`--page-max` 72rem, the app's `max-w-6xl`, gutter `space-4`) > `div.column`
(`--column-max` 48rem, `max-w-3xl`) > one `div.stack` (gap `space-4`, `gap-4`) holding the h1, the
sentence and, in way (4), "Открыть курс" wrapped in a plain `div`.
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
| #220, default (course id known) | `#state-default` | top bar "Академия", "Главная", user menu; `main`: h1, the sentence, "Открыть курс" (A218-12) |
| #220, course id unknown | `#state-no-course` | the same top bar; `main`: h1 and the sentence only, nothing focusable (A218-12) |
| #220, session expired (F2.1) | `#state-session-expired` | default content plus the Alert in "Уведомления" with "Войти снова" |
| #220, user menu open (F3.1) | `#state-user-menu` | default content with the menu open |

Every state has `aria-current` on neither top-bar link (`ia.md` R6, "Top bar by release"). Until #220 the
bar also held "Курс" in every state but "course id unknown" (R6, "Course id unknown"); from #220 see
A218-3.

## Interactions and keyboard

- Tab order. Way (4): "К содержимому", "Академия", "Главная", user menu, "Войти снова" (only with the
  alert), "Открыть курс". Ways (1)-(3): "К содержимому", "Академия", "Главная", user menu, "Войти снова"
  (only with the alert); nothing focusable in `main`. Until #220 "Курс" followed "Главная" whenever the
  course id was known; from #220 see A218-3.
- `F6` / Shift+`F6` and Ctrl+Shift+. / Ctrl+Shift+, cycle "Верхняя панель", "Уведомления" (only while it
  holds the alert), `main` (R3). Landings from a fresh load (A218-12):

  | State | Верхняя панель | Уведомления | `main` |
  |-------|----------------|-------------|--------|
  | default: way (4) | "Академия" | no stop | "Открыть курс" |
  | ways (1)-(3) | "Академия" | no stop | `main` itself (`tabindex="-1"`) |
  | session expired | "Академия" | "Войти снова" | "Открыть курс" |
  | user menu open | "Академия" | no stop | "Открыть курс" |

- Focus on arrival: none. An ordinary arrival leaves focus where the browser puts it on a new page. Until
  #220 the one exception: a catalog or lesson "Повторить" whose course loads while the URL is a way into
  this page puts focus on the h1 (`id="not-found-title"`, `tabindex="-1"`; `ia.md` R2, page-level retry
  table). From #220: see #222. The h1 is no Tab stop and no `F6` target.
- "Открыть курс": link to the URL's course catalog, `/courses/[courseId]` (F5; row "course of each
  control"). The prototype link: Prototype limits.
- "Главная", "Академия": `/`, as on every page with the top bar. Until #220 "Курс": `/courses/[courseId]`;
  from #220 see A218-3.
- User menu: Enter or Space opens it, focus on the first item; arrows, Home, End; Esc closes and returns
  focus to the button; "Выйти" goes to sign-in with "Вы вышли" (F3.3).
- "Войти снова": `/sign-in?next=<current path, URL-encoded>` (F2.2); after sign-in the app returns to the
  same URL, which is this page again (F2.4). The prototype links
  `../sign-in/prototype.html?next=%2Fcourses%2Fai-for-developers%2Flessons%2Fno-such-lesson#state-with-next`
  (Prototype limits).

## Copy

| Key | Russian text |
|-----|--------------|
| title, h1 | Страница не найдена |
| sentence | Возможно, в адресе опечатка или ссылка устарела. |
| open catalog | Открыть курс (way (4) only, A218-12) |
| skip link | К содержимому |
| top bar brand | Академия |
| top bar nav | Главная (A218-3; until #220 also "Курс", not while the course id was unknown, R6 "Course id unknown") |
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
- The h1 has `tabindex="-1"` for the retry focus only (R2; from #220 see #222); it is not a Tab stop and
  not an `F6` target (R3 excludes `tabindex="-1"`).
- The sentence names both real causes (a typed address, an old link) and is true for a hidden lesson too,
  so the page never reveals that a non-`ready` lesson exists.
- "Открыть курс" is the outline Button as a link (`a href`), so it is announced as a link and opens with
  Enter.

## Acceptance checks

All checks apply from #220; the "until #220" lines above are the one-course form the app ships before it.

- AC1: `<title>` and the one h1 read "Страница не найдена"; the h1 has `tabindex="-1"`.
- AC2: `main` holds the h1, the sentence "Возможно, в адресе опечатка или ссылка устарела." and nothing else
  but "Открыть курс": no Alert, icon, "404", breadcrumb or search.
- AC3: in way (4) "Открыть курс" opens the URL's course catalog (`/courses/[courseId]`) and keeps its
  intrinsic width, 16px under the sentence (A218-12).
- AC4: in ways (1)-(3) (`#state-no-course`) there is no "Открыть курс"; `F6` to `main` focuses `main`
  (A218-12).
- AC5: the top bar is "Академия", "Главная", user menu in every state, with no "Курс" and `aria-current`
  on neither link (A218-3).
- AC6: `F6` and Ctrl+Shift+. land as the table in Interactions and keyboard, in each of its four states;
  the user menu state's keyboard is AC8.
- AC7: session expiry fills the existing `role="alert"` container without moving focus; the wrapper
  becomes the "Уведомления" region; "Войти снова" goes to `/sign-in?next=<current path>`.
- AC8: the user menu works as on the dashboard (dashboard AC11): Enter or Space opens it, Esc returns
  focus to the button, "Выйти" signs out to `/sign-in` with "Вы вышли".
- AC9: focus does not move on arrival. Focus after a catalog or lesson "Повторить" that ends here: see #222.
- AC10: the response is HTTP 404 for each way in (Route).
- AC11: no horizontal scroll at 320, 375 and 1280, light and dark, in every state.

## Open questions

None.
