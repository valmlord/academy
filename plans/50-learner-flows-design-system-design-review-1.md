# #50 design review, round 1: usability FAIL, accessibility FAIL, consistency FAIL

Judge reports, issues only (verbatim in substance).

## Usability

1. Design file :108: the lesson prototype must show an "M0 stub ('Окружение появится позже', for #30)" state, but no flow defines it. It contradicts F8 (environment starts by itself) and the F13 error state ("Проверить" disabled with "Запустить снова", which a stub lacks). Unknown whether the stub has the check bar, status bar, "Действия" menu, F6 hint. Fix: add the stub state to F8 (or a new flow) or drop it.
2. Design file :108 vs :118: in-scope states ask for "each status of the checks.md table", which includes "Закрыта: не пройдено", runner error and format error, but D1 defers "F14 all" and "runner error", and F13 is limited to F13.1-F13.5. Fix: list which statuses are in v1 and which belong to D1.
3. ia.md:62-65 vs lesson-workspace.md:119 and A2: the F6-key cycle order differs (Урок, Окружение, check bar vs Урок, check bar, Окружение). One order.
4. checks.md:101 vs catalog.md:25-26: F14.4 shows lesson status "Не пройден" in catalog and dashboard; F5.3 has only "Не начат", "В процессе", "Пройден"; ia.md vocabulary has no lesson-status row.
5. One action, two labels: "Разобрать с ментором" (checks.md:50, mentor.md:16,21, A12) vs "Разбор с ментором" (checks.md:99, quiz.md:30). Pick one, add to the vocabulary.
6. Design file :105-108: F3.1-F3.2 (user menu, "Выйти") assigned to no prototype though the top bar is on dashboard, catalog and lesson; F2.4 and F6.3 also unassigned. judge_ux would find no `data-step` for them.
7. Lesson "must show" list misses states defined by in-scope flows: F2.1 session-expired alert; F6.2 prerequisite alert; F7 "Не удалось загрузить текст урока" and copy-denied; F8 "Запуск идёт дольше обычного"; F11 actions disabled with "Дождитесь окончания проверки"; F13 "Проверить" disabled when the environment is not running; F13 success "Урок пройден"; Проверки tab before any run; the 768-1023 px single-pane switch "Урок / Окружение". Sign-in list misses the F1 seed hint and "Слишком много попыток". Fix: list them or state that every error and empty state of the listed flows is required.
8. checks.md:61-62 vs lesson-workspace.md:59-61 and A10: while the environment is starting by itself, "Проверить" says "Сначала запустите окружение" with "Запустить снова": tells the learner to start something already starting. Creating/starting phases need their own wording.
9. auth.md:34-35: rate-limit copy hardcodes "через минуту" while the value comes from auth config. Placeholder or neutral wording.
10. dashboard.md:21-22 vs ia.md:68-69: F4.3 opens "the last open tab", but the tab lives only in the query string; name the source or open Теория.
11. Design file :107 vs :130-131 and ia.md:79: catalog prototype must show "not-found", yet not-found is out of scope as a prototype and called an app-shell state. One statement.

## Accessibility

1. Design file :158 (A8), WCAG 1.4.4 / 1.4.10: below 768 px the environment and "Проверить" are removed; a 1280 px laptop at 200 % zoom is 640 CSS px, so zoom loses functionality. Fix: keep the one-pane "Урок / Окружение" switch down to 320 px with the terminal reflowing and the check bar present, or justify the 2D exception (it cannot cover "Проверить").
2. checks.md:39-45,114; lesson-workspace.md:65-66: live regions for streaming check results not specified. Ticking timers ("Идёт проверка 0:42", "0:42 из 2:00", status-bar elapsed seconds) would be read every second if inside aria-live. Fix: name the live element (status text changing only on start, end, connection loss); timers out of it (`role="timer"` / `aria-live="off"`); rows not live; the Проверки tab running badge gets an accessible name in words.
3. lesson-workspace.md:160-162,180-181; design file :158, WCAG 2.2.1: in the 768-1023 px one-pane mode the idle banner sits in Окружение, invisible while the learner reads Урок. Show it wherever visible (or mark the switch); define what the F6 key does in one-pane mode. Note for #31: "activity" excludes terminal output, so an agent working alone can be stopped mid-run.
4. WCAG 2.1.2: (a) the F6 key is the only exit from the terminal and rests on unverified browser behaviour (Chrome/Firefox/Safari may keep F6; macOS F6 without Fn is a system key). Make "F6 reaches the page and moves focus" an acceptance test of #32 and name a fallback chord the agent does not use, also in the hint. (b) region order inconsistency (same as usability 3). (c) F2.1 says the session alert is "reachable with F6" but it and the top bar are outside the F6 regions: add a stop or say how to reach them. (d) tie the hint "F6: следующая область" to the xterm input via `aria-describedby`.
5. Design file :54-65, WCAG 1.4.3 / 1.4.11: (a) status colours are used as icon and word on page surfaces, not only as filled badges; the plan needs `pair` runs of each status colour as text (4.5:1) and icon (3:1) on `background` and `card`, both themes, plus the `destructive` fallback when `destructive-foreground` is absent (shadcn v4). (b) xterm default ANSI colours measure 1.26-2.80:1 on light and red/blue below 4.5:1 on black. Keep the terminal surface dark in both themes and state the ANSI handling, or bring a checked ANSI palette into scope; check the focus ring at 3:1 against the terminal surface.

Advisory: quiz.md:39-40 loses quiz answers on re-sign-in (sessionStorage survives a same-tab redirect); same for the mentor draft in mentor.md:27.

## Consistency

1. ia.md:19 fixes English "workspace" for the running container, but ia.md, registry titles F8/F10/F11, lesson-workspace.md and the plan say "environment"; lesson-workspace.md:82 and ia.md:64 mix both. One English term (suggest "environment"; `workspace` only as the lesson.yaml field name), grep for leftovers.
2. Two labels for the mentor action (same as usability 5).
3. Lesson status set not closed (same as usability 4); add a lesson-status row (masculine forms) and a module-status row to the vocabulary.
4. Region order (same as usability 3); ia.md:64 also puts the check bar inside the Урок pane while listing it as its own region.
5. ia.md:75-78 page inventory Flows column wrong: F3 enters from any page except sign-in (auth.md:88) but listed only for sign-in and dashboard; F2 enters from any protected page but missing on catalog.
6. Design file :54-65: name the status and terminal tokens in the `<name>` / `<name>-foreground` shape (e.g. success, warning, info, terminal); say status colour is used only as a filled surface with its foreground, or require `pair` runs for text/icon use; restate that every new colour token is in `:root` and `.dark` and mapped `--color-<name>: var(--<name>)`. Module status "Готовится"/"Доступен" needs a component (Badge row lists only lesson and check status). D1 budget confirmation should reuse AlertDialog.
7. "F6" means both flow F6 and the F6 key; write the key as `F6` in backticks / "the F6 key" everywhere.

Verified by consistency: Spinner, Kbd, Empty, Field, Item exist in current shadcn docs (ui.shadcn.com/docs/components/radix/<name>); drop the "unverified" marks. No real validator output line parses as a verdict.
