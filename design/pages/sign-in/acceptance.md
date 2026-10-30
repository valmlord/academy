# Sign-in: acceptance notes

## Route

`/sign-in`, optional query `next=<same-origin path>`, URL-encoded (`ia.md`, Navigation model, "Return after
sign-in"). The lesson's "Войти снова" sends the lesson path with its current `?tab=`, for example
`next=%2Fcourses%2Fai-for-developers%2Flessons%2Fintro-models-effort%3Ftab%3Dchecks`. `next` stays for the
whole visit: an empty-field error, a server error and "Повторить" keep it, and the redirect after success
uses it.

## Prototype

`design/pages/sign-in/prototype.html`. States by `#state-<name>`; the "Prototype states" bar at the bottom
and its "Dark theme" button are prototype chrome, not product UI (English, `lang="en"`). The prototype reads
`?next=` from its own query (the lesson prototype links with it) and shows it in the chrome bar; without
the query, `#state-with-next` uses the sample `/courses/ai-for-developers/lessons/intro-models-effort?tab=task`.
A lesson `next` lands on the lesson prototype with the same query, a course `next` (`/courses/<courseId>`, the
catalog's "Войти снова") on the catalog prototype, any other (`/`, the dashboard's) on the dashboard.

**History, deliberate:** the prototype's own submit outcomes (empty fields, submitting) replace the
`#state-` hash with `history.replaceState` and keep the query, unlike the `data-goto-state` push of
`proto.js` on other pages. The app's form never changes the URL, so a failed attempt is no place Back
returns to; Back from sign-in leaves the page, as in the app.

## Flows

| Step | Element (`data-step`) |
|------|-----------------------|
| F1.1 | the sign-in Card (`section.card`) with h1 "Вход" and the form |
| F1.2 | the group of the two fields "Почта" and "Пароль" |
| F1.3 | the "Войти" submit button |
| F1.4 | the `form`: its target is `next` (same-origin only) or the dashboard |
| F2.2 | the hidden `next` input, sent only when the page was reached with `?next=` (state `with-next`), kept through every later state |
| F2.3 | the card footer holding "Войти": the same submit, which then lands on `next` |
| F3.3 | the muted note "Вы вышли" under the h1 (state `signed-out`) |

## Status

Status: ready

## Purpose

Email and password for the single local user (#29). No sign-up, no password reset (`auth.md`).

## Layout and breakpoints

One column at every width (decision A8). The Card is centred horizontally, `max-width: 24rem`, top
padding `space-12` (`space-6` below 30rem), page gutter `space-4`.
- 1280: card centred near the top; the rest of the page is `background`.
- 768: same as 1280.
- 375: card spans the width minus the `space-4` gutters; "Войти" is full width at every size; the long
  server message wraps inside the Alert; no horizontal scroll (checked at 375).

No top bar, no "Уведомления" region (`ia.md` R3: sign-in has no `F6` cycle; `F6` keeps its browser meaning).

## Components

| shadcn | Usage |
|--------|-------|
| Card | the form container; `CardTitle` is the page h1 "Вход"; `CardDescription` is "Вы вышли" |
| Field, Label, Input | "Почта" (`type="email"`, `autocomplete="username"`), "Пароль" (`type="password"`, `autocomplete="current-password"`); error text under the field |
| Alert | the one message place above the form: `destructive` (wrong credentials, no user), `warning` (server unreachable, too many attempts) |
| Button | "Войти" (default, full width); "Повторить" (secondary, sm) inside the server Alert |
| Spinner | inside "Войти" while sending |

## States

| State | Anchor | What shows |
|-------|--------|------------|
| default | `#state-default` | empty form, focus in "Почта" |
| arrived with `next` (F2.2) | `#state-with-next` | same as default; the form carries `next` (the chrome bar shows the URL) |
| empty fields | `#state-empty-fields` | both fields `aria-invalid`, "Введите почту" and "Введите пароль" under them, focus in "Почта" |
| empty password | `#state-empty-password` | email kept, "Введите пароль" under "Пароль", focus in "Пароль" |
| submitting | `#state-submitting` | "Войти" reads "Входим..." with the Spinner, `aria-disabled="true"`, `aria-busy="true"`, focus stays on it |
| wrong credentials | `#state-wrong-credentials` | destructive Alert "Неверная почта или пароль"; email kept, password cleared; focus on the Alert |
| server unreachable | `#state-server-unreachable` | warning Alert with the server message and "Повторить"; both fields kept; focus on the Alert |
| too many attempts | `#state-too-many-attempts` | warning Alert with the neutral message (no duration); password cleared; focus on the Alert |
| no user, seed hint (F1 empty) | `#state-no-user` | the wrong-credentials Alert plus the muted line "Пользователя создаёт скрипт seed, см. README" inside it |
| signed out (F3.3) | `#state-signed-out` | default form plus "Вы вышли" under the h1 |

## Interactions and keyboard

- Focus starts in "Почта". Tab: skip link "К содержимому" (first), "Почта", "Пароль", "Войти". Enter
  submits from any field.
- Submit with an empty field: the form is not sent; focus moves to the first empty field (its label and
  error are read).
- Submit with both fields: "Войти" becomes "Входим..." and stays focusable with `aria-disabled="true"`
  (R1 row "Войти": the busy label is the reason); a second press does nothing.
- An F1.3 error: the message is set in the message place and focus moves to it (`tabindex="-1"`); the next
  Tab reaches "Повторить" (server unreachable) or "Почта".
- "Повторить" sends the form again, `next` included; focus moves to "Войти", which reads "Входим..." (R2,
  focus when a control removes itself).
- Success: navigate to `next` when it is a same-origin path, otherwise to the dashboard (F1.4).
- Paste and password-manager autofill are never blocked (WCAG 3.3.8).

## Copy

| Key | Russian text |
|-----|--------------|
| title, h1 | Вход |
| skip link | К содержимому |
| label email | Почта |
| label password | Пароль |
| submit | Войти |
| submit busy | Входим... |
| error empty email | Введите почту |
| error empty password | Введите пароль |
| wrong credentials | Неверная почта или пароль |
| no user hint | Пользователя создаёт скрипт seed, см. README |
| server unreachable | Не удалось связаться с сервером. Проверьте, что платформа запущена (docker compose up), и попробуйте снова. |
| retry | Повторить |
| too many attempts | Слишком много попыток входа. Подождите и попробуйте снова. |
| signed out note | Вы вышли |

Sample data (not copy): `learner@example.com`.

## Accessibility notes

- Landmarks: one `main` (the card); no `banner`, no notifications region.
- **Alert role vs focus (round-4 advisory):** the message place is an Alert **without** `role="alert"`
  (drop the role shadcn's Alert renders). It has `role="group"` (a role, so `aria-labelledby` is
  allowed), `tabindex="-1"`, `aria-labelledby` its title and, when it has a second line, `aria-describedby` that line; focus is moved to it right after its text is set. A
  focused element that is also a live alert is announced twice; sign-in has no live container (R2), so
  focus alone carries the message, read once.
- Field errors: `aria-invalid="true"` and `aria-describedby` the error text, set only while the error shows;
  error text in `destructive` on `card` (5.386:1 light, 6.287:1 dark, system README contrast runs).
- "Войти" while busy: name changes to "Входим..."; whether a screen reader echoes a name change on the
  focused button varies, so dev verifies it in the tester run (see Open questions).
- Status is never colour alone: Alerts carry an icon of a different shape and the words.
- Focus ring: 2px `ring` outline with offset; invalid inputs draw it in `destructive`.

## Acceptance checks

- AC1: `/sign-in` renders h1 "Вход", labelled inputs "Почта" and "Пароль" and the button "Войти"; focus is
  in "Почта" on load.
- AC2: submitting with "Почта" empty sends no request, shows "Введите почту" (and "Введите пароль" if that
  is empty too), sets `aria-invalid="true"` and `aria-describedby`, and focuses "Почта"; with only the
  password empty, focuses "Пароль".
- AC3: while the request is in flight, "Войти" reads "Входим...", has `aria-disabled="true"` (never the
  `disabled` attribute), keeps focus, and a second Enter or click sends nothing.
- AC4: wrong credentials show "Неверная почта или пароль" in the Alert above the form, keep the email,
  clear the password and move focus to the Alert; the Alert has no `role="alert"` and the screen reader
  reads it once.
- AC5: with no user in the database, the same Alert adds "Пользователя создаёт скрипт seed, см. README"
  inside it, read with the focused Alert (`aria-describedby`).
- AC6: server unreachable shows the server message and "Повторить"; "Повторить" re-sends the same values
  and moves focus to "Войти" ("Входим...").
- AC7: a rate-limit response shows "Слишком много попыток входа. Подождите и попробуйте снова." with no
  number in the text.
- AC8: success redirects to `next` when it is a same-origin path, else to `/`; `next=//evil.example` or an
  absolute URL lands on `/`. Arrived with `next=<lesson path>?tab=checks`, a first submit with an empty field
  and then a valid one, or "Повторить" after a server error, still lands on that lesson with Проверки.
- AC9: after "Выйти" (F3) the page shows "Вы вышли" under the h1.
- AC10: paste into both fields works and autofill fills them; no `onpaste` blocking.
- AC11: no horizontal scroll at 375, 768, 1280; light and dark match the prototype.
- AC12: the skip link is the first Tab stop and moves focus to `main`.

## Open questions

- Name change echo: if the tester's screen-reader run shows that "Войти" -> "Входим..." is not announced,
  dev may add a visually hidden `role="status"` echo; that would be the only live container on sign-in and
  needs a change to `ia.md` R2 first (a DESIGN follow-up). Not blocking: focus stays on the button, whose
  name is read again on any re-query.
