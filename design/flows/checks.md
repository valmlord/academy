# Journey: checks

Page: lesson. The check bar is the region "Проверка", drawn under the left pane and visible on every tab
and at every width: "Проверить", one status line and a timer. It is a sibling of the "Урок" region, not
inside it (rule R3 in `ia.md`). Disabled "Проверить" follows R1, live elements R2, unshipped check kinds
R6. Per-check results, attempt counters and the attempt history live in
the Проверки tab. Sources: `docs/learning-process.md` §1 (check results on the left) and §2 (the "Check"
button runs the checks from `lesson.yaml`; agent checks spend tokens); #34 (results streamed over SSE,
timeout marked as timeout, concurrent checks do not collide, saved as an attempt); #39 (hidden-task,
timeout and budget); task.md "Как проверяется" and "Попытки и подсказки" in all six module 00 lessons
(research §4); `packages/lesson-schema` check fields (research §3).

Status set of one check (closed set, `ia.md` vocabulary; tokens in the design file §2; colour is never the
only signal, every status has an icon and a word):

| Status | Russian label | Token | In v1 prototype |
|--------|---------------|-------|-----------------|
| not run | "Не запускалась" | `muted` | yes |
| queued | "В очереди" | `info` | yes |
| running | "Идёт" with "0:42 из 2:00" | `info` | yes |
| passed | "Пройдено" | `success` | yes |
| failed | "Не пройдено" | `destructive` | yes |
| timeout | "Время вышло" | `warning` | yes |
| format error, not counted | "Ошибка формата, попытка не засчитана" | `warning` | yes |
| runner error, not counted | "Не удалось запустить проверку" | `destructive`, with "Повторить" | no, D1 |
| closed, failed | "Закрыта: не пройдено" | `destructive`, plus a lock icon | no, D1 |
| failed, budget spent (variant of failed) | "Не пройдено: исчерпан бюджет $N" | `destructive` | no, D1 (#39) |

## Live regions

- The check bar status line is the only live element of checks (R2): an always-present `role="status"`
  container, empty before the first run. Its text changes only when a run starts ("Идёт проверка"), when
  it ends ("Пройдено: N из M" or "Урок пройден"), and when the result stream is lost ("Соединение с
  проверкой потеряно. Переподключаемся...", D1) or restored. Disabled reasons are never put in it (R1).
  The timer next to it ("0:42") is a separate element with `role="timer"` (not announced), outside the
  status element.
- Check rows in Проверки are not live; their per-row timers are `role="timer"`. A screen reader user hears
  the run start and end once, and reads the rows when they open the tab.
- The Проверки tab's running badge is not colour or a spinner alone: while a run is going, the tab's
  accessible name is "Проверки, идёт проверка" (visually hidden text inside the tab), back to "Проверки"
  when it ends.

## F13: Run the checks and read the result

**Goal:** find out whether the task is done, and what to fix if it is not. Source: learning-process §2;
#34; task.md "Как проверяется"; G1, G2.

**Entry:** "Проверить" in the check bar, from any left-pane tab and in one-pane mode from either pane.

**Steps (6):**

1. F13.1 Learner presses "Проверить". It runs every automatic check of the lesson (command, rubric,
   hidden-task, bug-hunt) whose runner has shipped and that is not closed; in v1 that is `command` checks
   only (#34, rule R6), and other kinds are neither listed nor counted. A quiz check is never run by it:
   from #36 its row links to the quiz (F15). When the run includes a check with `budgetUsd`, a confirmation first says "Проверка с агентом
   потратит до $N" with "Запустить" and "Отмена" (AlertDialog, the same component as F11.3), because agent
   checks spend money (learning-process §2). The confirmation is designed in D1.
2. F13.2 The check bar shows "Идёт проверка" and the timer "0:42"; the Проверки tab gets its running badge;
   the learner stays on the current tab (no automatic switch), because a run of 30-120 s, or up to an hour
   for hidden-task, must not pull the learner away from reading or the terminal (research §5).
3. F13.3 In the Проверки tab each check row shows its title, kind, status, and for a running check the
   elapsed time against `timeoutSec` ("0:42 из 2:00"). Rows update as results stream in.
4. F13.4 When the run ends, the check bar reads "Пройдено: 2 из 3" (or "Урок пройден" when every check
   passed, see Success) with "Открыть результаты", announced once by the status line. "Открыть
   результаты" shows the Проверки tab and moves focus to its heading; in one-pane mode it first switches
   the area to "Урок" (R3). It stays in the check bar from the end of a run until the next run starts or
   the learner leaves the page. If the environment stops after the run, the bar holds, in this order,
   "Проверить" (`aria-disabled`, "Сначала запустите окружение"), "К окружению", "Открыть результаты" (R1).
5. F13.5 Learner opens a check row: the grader's message verbatim (for example "findings[2].line:
   expected integer"), and "Неудачных попыток: 3" (v1); "Неудачных попыток: 3 из 10" when the limit is
   known (D1, assumption A13). The UI adds no detail the grader did not give (research §4).
6. F13.6 From #37 (D3; not shown in v1, R6): after a failed run, when the lesson's mentor threshold is
   known and reached (e.g. 5 failed, task.md L2, L5, L6), the row offers "Разобрать с ментором" (F16);
   otherwise "Попросить подсказку" is always there (F17). In v1 the open row ends with the counter of
   F13.5, and the Задание tab's "Попытки и подсказки" text stays as written in task.md.

**Success:** every check passed: the check bar reads "Урок пройден", the lesson status becomes "Пройден"
on the dashboard and in the catalog, and the dashboard's next lesson moves on (F4).

**Error states:**
- A check times out: its row reads "Время вышло" with the limit ("лимит 2:00"); counted as a failed
  attempt only if the server counts it (#34 decides; the UI shows the counter it receives).
- Format error: "Ошибка формата, попытка не засчитана" plus the grader's message naming index and field;
  the counter does not change (task.md L1, L3, L4).
- The environment is being created or started (F8.1) when a command check needs it: "Проверить" is
  `aria-disabled` with the reason "Окружение запускается, проверка станет доступна после запуска" (R1),
  and no other button, because the start is already under way.
- The environment is stopped or failed to start (F8 error states, F10.3): "Проверить" is
  `aria-disabled` with "Сначала запустите окружение" (R1), followed by the button "К окружению", which
  switches the area to "Окружение" in one-pane mode and moves focus to the status bar's status action
  ("Запустить снова", "Повторить" or "Открыть курс", R3).
- A run is already going in this tab (#34 concurrency): "Проверить" is `aria-disabled` with "Дождитесь
  окончания проверки" (R1); the status line says "Идёт проверка". This reason wins while the run goes,
  even if the environment stops under it (R1, one reason at a time). In another tab: the reason "Проверка
  уже идёт в другой вкладке" and the live status (D1).
- The result stream (SSE) drops: the status line reads "Соединение с проверкой потеряно.
  Переподключаемся..."; the run continues on the server and its saved result appears on reconnect. The UI
  never shows a check as failed because the stream dropped (D1).
- Runner error (container died, checks directory missing): "Не удалось запустить проверку" with
  "Подробности" and "Повторить"; not counted as an attempt (D1).
- Budget exceeded during a hidden-task (#39): the row reads "Не пройдено: исчерпан бюджет $N" (D1).

**Empty states:**
- Before any run: the check bar shows "Проверить" and an empty status line (R2); the Проверки tab lists
  every check as "Не запускалась" and "Попыток пока нет. Нажмите "Проверить", когда будете готовы." (the
  text of F19's empty state; the history section itself is D4, R6).
- A lesson with no check the platform runs: no check bar, no "Проверка" region, no Проверки tab (R6).
  This covers a lesson with no checks (not allowed by the schema today), the M0 lesson, and in v1 a
  lesson whose checks are all of unshipped kinds, such as a quiz-only lesson (none exists in module 00:
  every lesson there has a `command` check). From #36 (D2) a quiz-only lesson's check bar shows "Пройти
  квиз" instead of "Проверить".

**Exit:** F13.4 back to work (F9), or F14 (D1); F16 and F17 from #37 (D3, R6).

**Keyboard path:** `F6` to "Проверка" lands on "Проверить" in every state (R3), enabled or `aria-disabled`
with its reason read as its description (R1); Tab then reaches "К окружению" and "Открыть результаты"
when shown, in that order (F13.4). Enter runs; in the confirmation (D1) focus starts on "Отмена".
"Открыть результаты" and "К окружению" switch the one-pane area first (F13.4, error states). Each check
row is a disclosure button (Enter expands the message).

**Time limits:** per check `timeoutSec` (command up to 1800 s, hidden-task up to 3600 s, schema), shown
as elapsed against the limit; no warning before a check's timeout, because the learner cannot do anything
about a running check except wait. A run continues on the server if the learner leaves the page; the
result is there on return (F19).

## F14: Reach the attempt limit of a check

Prototype deferred (D1 in the design file).

**Goal:** know that a check is closed, why, and what comes next. Source: task.md "Попытки и подсказки"
(L1 `model-routing` and L3 `cost-estimate`: at most 10 failed checks, then closed as "не пройдено";
"скелет" and "скажи прямо" open after a check is closed; resets do not reset counters), research §4.

**Entry:** a failed run (F13.4) that reaches the limit.

**Steps (4):**

1. F14.1 Before the last attempt the row warns "Осталась 1 попытка".
2. F14.2 After the last failed attempt the row reads "Закрыта: не пройдено" with a lock icon, and the
   check is no longer run by "Проверить".
3. F14.3 The row offers "Разобрать с ментором" (F16); hint levels "Скелет" and "Скажи прямо" become
   available (F17).
4. F14.4 The lesson counts as finished but not passed: the catalog and the dashboard show the lesson
   status "Не пройден" (`ia.md`, lesson status set), and the dashboard's next lesson moves on (assumption
   A9).

**Success:** the learner knows the check is closed and goes to the mentor review.

**Error states:** the limit is unknown to the UI (it lives in task.md prose only, not in `lesson.yaml`;
contract gap, dev follow-up P1 in the design file): no "Осталась 1 попытка" and no "из N"; the closed state
appears only when the server reports it.

**Empty states:** a check with unlimited attempts never reaches F14.

**Exit:** F14.3 into F16 or F17; F14.4 into F4.

**Keyboard path:** as F13; the closed state changes the check bar status line once ("Пройдено: N из M"
with the closed check counted as not passed), the row itself is not live.

**Time limits:** none. Resetting the working folder (F11) does not reopen a closed check.
