# Journey: authentication

Pages: sign-in, and every protected page for F2 and F3. Source of the model: #29 (email and password,
protected routes, redirect to sign-in, sign-out, seed creates the local user), ADR-0003 (Better Auth),
research §5. There is no sign-up and no password reset page: the seed creates the only user (#29, issue
#50 excludes multi-user features).

## F1: Sign in

**Goal:** get into the platform to continue learning. Source: #29 AC "a lesson cannot be opened without
signing in", "e2e: sign-in, sign-out, redirect to the sign-in page".

**Entry:** any protected route without a session redirects to `/sign-in?next=<path>`; or the learner
opens `/sign-in` directly.

**Steps (4):**

1. F1.1 Learner sees the page heading "Вход" and the form: fields "Почта" and "Пароль", "Войти".
2. F1.2 Learner fills email and password (typing, paste or a password manager all work).
3. F1.3 Learner submits; the button shows a busy state "Входим..." and is not pressable twice: it stays
   focusable with `aria-disabled="true"`, the busy label being its reason (rule R1 in `ia.md`).
4. F1.4 Learner lands on `next` if it is a same-origin path, otherwise on the dashboard.

**Success:** the target page loads with the learner signed in.

**Error states:**
- At F1.3, wrong email or password: one message above the form, "Неверная почта или пароль"; focus moves
  to it (keyboard path); the email stays filled, the password is cleared. The message does not say which
  field is wrong, because naming it tells anyone at the keyboard which emails exist; the platform is
  local, but the habit costs nothing.
- At F1.3, server unreachable: "Не удалось связаться с сервером. Проверьте, что платформа запущена
  (docker compose up), и попробуйте снова." with "Повторить", in the same message place; focus moves to
  it.
- At F1.2, an empty field on submit: inline "Введите почту" / "Введите пароль" under the field, linked
  with `aria-describedby`, the field `aria-invalid="true"`; focus moves to the first empty field, so its
  label and error are read. The form is not sent.
- At F1.3, too many attempts (if Better Auth rate limiting is on): "Слишком много попыток входа.
  Подождите и попробуйте снова." in the same message place; focus moves to it. No duration in the copy,
  because the window comes from the auth config and may change; a number in the text would lie the day
  it does.

**Empty states:** no user exists (seed not run): the error reads the same as wrong credentials; the
message adds a muted line "Пользователя создаёт скрипт seed, см. README" inside it, so it is read with the
focused message. Because the learner is also the operator and this is the most likely first-run failure.

**Exit:** F1.4; or closing the tab.

**Keyboard path:** focus starts in the email field; Tab to password, Tab to "Войти", Enter submits from
any field. Errors (rule R2 in `ia.md`: sign-in has no live container, so focus carries every error):
every F1.3 error is shown in one message container above the form (an Alert with `tabindex="-1"`), and
focus moves to it when its text is set; Tab then reaches "Повторить" (server unreachable) or the email
field. An empty-field submit moves focus to the first empty field instead. "Повторить" sends the form
again and moves focus to "Войти" while it reads "Входим..." (R2, focus when a control removes itself).
Paste and autofill are never blocked (WCAG 2.2 SC 3.3.8, research §5).

**Time limits:** none on the form. A successful sign-in starts a session of 7 days, extended on use
(Better Auth defaults, research §5).

## F2: Session expires during a lesson

**Goal:** not lose work or place when the session ends mid-lesson. Source: research §5 (Better Auth
session expiry; an API call or WebSocket rejected mid-lesson).

**Entry:** a request, the check stream or the terminal WebSocket is rejected with "not authenticated"
while the learner is on a protected page.

**Steps (4):**

1. F2.1 Learner sees a non-modal alert in the region "Уведомления" under the top bar, outside every pane
   (`ia.md`): "Сессия закончилась. Файлы в рабочей папке сохранены." with "Войти снова".
2. F2.2 Learner presses "Войти снова" and lands on `/sign-in?next=<current path with tab>`.
3. F2.3 Learner signs in (F1.2 to F1.3).
4. F2.4 Learner is back on the same lesson and tab; the environment reconnects (F10 if it was stopped
   meanwhile).

**Success:** the learner continues where they were; files are intact (they live in the volume, ADR-0002).

**Error states:**
- A check was running when the session ended: its result is still saved by the server as an attempt
  (#34); on return the Проверки tab shows it. If the server could not save it, the attempt list does not
  show it and nothing pretends otherwise.
- Sign-in fails: F1 error states.

**Empty states:** none.

**Exit:** F2.4.

**Keyboard path:** the alert text is inserted into the always-present `role="alert"` container of
"Уведомления" (R2), so it is announced wherever focus is; it never takes focus by itself, because focus
may be in the terminal or in a half-typed quiz answer. It is reached with `F6` (region "Уведомления",
second in the cycle, R3) or with Tab after the top bar; focus lands on "Войти снова", Enter. Quiz answers survive the round trip (`quiz.md`).

**Time limits:** session lifetime 7 days rolling (research §5). No countdown warning: a 7-day rolling
session almost never expires during use, and a warning for it would be noise.

## F3: Sign out

**Goal:** end the session. Source: #29 AC "e2e: sign-in, sign-out".

**Entry:** user menu in the top bar on any page except sign-in.

**Steps (3):**

1. F3.1 Learner opens the user menu (shows the email).
2. F3.2 Learner chooses "Выйти".
3. F3.3 Learner lands on `/sign-in` with a muted note "Вы вышли".

**Success:** protected routes redirect to sign-in again.

**Error states:** sign-out request fails: the session cookie is cleared client-side anyway and the
learner still lands on sign-in; no error is shown, because there is nothing the learner can do.

**Empty states:** none.

**Exit:** F3.3.

**Keyboard path:** Tab to the user menu button, Enter or Space opens it, arrow keys to "Выйти", Enter.
Esc closes the menu.

**Time limits:** none. Signing out does not stop the environment: it keeps running until the idle stop
(F10), because stopping on sign-out would make sign-out destructive for a running check.
