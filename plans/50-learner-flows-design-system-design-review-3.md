# #50 design review, round 3: consistency PASS, usability FAIL (1), accessibility FAIL (2)

All round-2 items verified fixed by every judge.

## Usability (blocking)

1. design :159, ia.md:305, progress.md:34-35: R6 (ia.md:246-248) and progress.md:24,26 hide recent attempts, weak topics and cost in v1, but the dashboard required states still ask for "reserved slots for F18.3-F18.4 marked "M2"", the page inventory repeats it, and the F18 first-run empty state shows cost "$0" (F18.4). Drop the slots (or make them a prototype-only annotation outside every `#state-` and every acceptance check) and remove or mark D4 the "$0".

Advisory: R5 sits under Vocabulary though "Interaction rules" claims all rules; "Before #31 and #34 ship" should read "until #31 or #34 ships"; R5 needs a durable per-lesson "terminal input recorded" flag (say so in P2); a lesson with no counted check is never "Пройден" (write it down); check bar after a run with the environment stopped: do both "К окружению" and "Открыть результаты" show, order, when the latter goes away; R1 reason precedence when a run is going and the environment stops; catalog "all four lesson statuses" includes D1-only "Не пройден" (note it); sign-in labels and h1 missing from the page-copy register; catalog without progress: is the prerequisite note hidden?

## Accessibility (blocking)

1. ia.md:154-157 with auth.md:31-37, WCAG 4.1.3: sign-in errors "Не удалось связаться с сервером...", "Слишком много попыток входа..." appear with neither focus nor live region; empty-field errors have no focus target. Fix: every F1.3 error moves focus to its message (as wrong credentials does) and an empty-field submit focuses the first invalid field, or add a sign-in `role="alert"` container to R2.
2. lesson-environment.md:168-169; design :135, :237, WCAG 2.5.7: pane resizing is drag or keyboard only; keyboard does not satisfy 2.5.7 and shadcn Resizable has no click alternative. Add a single-pointer way (click the handle to cycle preset splits, or step buttons).

Advisory: focus target when an activated control removes itself ("Запустить снова", "Повторить", "Переподключиться", "Открыть новый сеанс", page-level "Повторить"): move to the status text (tabindex -1) or the state's R3 landing; one-pane with Окружение shown: DOM order puts "Проверить" before the switch, contradicting R4's Tab-order sentence; button name changes ("Копировать" -> "Не скопировано...", "Войти" -> "Входим...") may not be announced, consider a live echo; 2.4.11 sticky check bar at 320 px / 400 % for judge_ux.

## Consistency: PASS

Advisory: Badge row should name a variant per lesson-status label; mark catalog "Не пройден" as a D1-data state; "Прогресс недоступен" gets different treatments on catalog vs dashboard, name the component; R5 location pointer.
