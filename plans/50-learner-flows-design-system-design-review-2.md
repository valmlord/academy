# #50 design review, round 2: usability FAIL (8), accessibility FAIL (2), consistency FAIL (2)

All round-1 items verified fixed by each judge. Every new finding is a regression at the seams of the round-1 fixes.

## Usability

1. checks.md:75-82, ia.md:137,45: while the environment is created, "Проверить" is disabled with "no button"; region "Проверка" has no focusable element, so the `F6` landing is undefined; checks.md:98 says focus lands on "Проверить". Where the disabled reasons appear is not stated (status line would break the closed check-bar set). Fix: "Проверить" stays focusable with `aria-disabled`, reason as a visible description via `aria-describedby` (mentor.md:82 pattern), not in the status line.
2. checks.md:98-99 vs 79-80: in one-pane mode with Окружение shown, "Открыть результаты" must also switch the area to "Урок" (as "К окружению" does).
3. ia.md:143-146, lesson-environment.md:20-21: the one-pane switch "Урок / Окружение" belongs to no region; state its region membership, `F6` stop and Tab position.
4. ia.md:37,44-45: the "closed sets" claim is false. Missing: "Соединение с терминалом потеряно. Переподключаемся...", "Не удалось переподключиться", "Сеанс терминала завершён" (lesson-environment.md:184-192), "Рабочая папка сброшена" (:267), "Рабочая папка не найдена..." (:227-228); "Не пройдено: исчерпан бюджет $N" (checks.md:88), "Осталась 1 попытка" (checks.md:119). Add them or reword the claim to base labels plus named variants.
5. dashboard.md:17-31, A18 vs A10, ia.md:41: the environment auto-starts on lesson open, so glancing at theory makes the dashboard say "Продолжить" and open Задание; no rule defines "В процессе". Drive both by one stated rule (e.g. an attempt exists or terminal input happened).
6. design:165,168; checks.md:48-49,63-65,93: v1 lesson prototype shows "Пройти квиз", the quiz row link, "Разобрать с ментором", "Попросить подсказку" though D2/D3 features do not exist: dead controls, contradicting A15 (hidden Редактор/Agent tabs). Hide until their issue ships (say what a quiz-only lesson shows in v1) or define a v1 target state.
7. design:41-46; checks.md:94: the M0 render reuses two empty states whose triggers are not M0's (M0 lessons do have workspace and checks); Проверки/Квиз tab visibility in M0 unspecified; the combined state is not in the required states. Define the M0 lesson as one named state with its tabs.
8. catalog.md:81-82 vs ia.md:123,109: prerequisite links are not "first in the main region" (breadcrumbs and header precede them); the lesson page has no `main` landmark, so the skip link "К содержимому" target is undefined. Correct the order, name the skip-link target.

Advisory: action-label table misses "Показать все" (F7.1), "Перезагрузить редактор" (F12); inventory could list F4 and F1 for the lesson page.

## Accessibility

1. ia.md:102-103, lesson-environment.md:40,236: "Уведомления" exists in the DOM only while it holds an alert; a live region inserted with its text is not reliably announced (the 2.2.1 idle warning may be silent). Fix: `role="status"`/`role="alert"` containers always in the DOM, empty, text inserted; only landmark role/heading added when non-empty (or live containers outside the landmark). Say where focus goes when a focused alert is removed (F10.3: to "Запустить снова").
2. ia.md:137, checks.md:75-77, lesson-environment.md:97,271, design:166: same as usability 1; plus natively `disabled` buttons are skipped by Tab, so reasons have no programmatic link. One rule for disabled actions with a reason: `aria-disabled="true"`, focusable, reason in `aria-describedby`; or a region with nothing focusable receives focus itself (`tabindex="-1"`).

Advisory: Firefox Multi-Account Containers may reserve Ctrl+Shift+.; Ctrl+Shift layout switching on Linux/Windows and IBus Ctrl+. can interfere: add "Russian layout active" and "Ctrl+Shift layout switch on" to the #32 matrix, name the physical key in the hint ("клавиша Ю"). Terminal tokens lack xterm cursor, cursorAccent, selectionBackground. 320 px / 400 % zoom: sticky check bar may obscure focus (2.4.11), for judge_ux.

## Consistency

1. Same as usability 4: environment row missing the F9 and F11.4 texts (add F9 to its Where column); check set missing the budget variant (D1 row, or "Не пройдено" plus a reason line).
2. design:65-68 vs :94-96, design_tokens.py:353-357: "every new colour token is a `<name>`/`<name>-foreground` pair" contradicts the 16 `terminal-ansi-*` tokens. State that ANSI tokens are single colour tokens without -foreground (check_pairs ignores them; manual `pair` runs cover them), declared in `:root` and `.dark`, mapped `--color-<name>: var(--<name>)`.

Advisory: name or tokenise xterm cursor and selection colours; "Повторить" Flows column omits F13 and F15; "Соединение" vs "Связь" for lost connection.
