# Journey: checks

Page: lesson. The check bar is the region "Проверка", drawn under the left pane and visible on every tab
and at every width: "Проверить", one status line and a timer. It is a sibling of the "Урок" region, not
inside it (rule R3 in `ia.md`). Disabled "Проверить" follows R1, live elements and focus R2, unshipped check
kinds R6, attempt limits R7. Per-check results and attempt counters live in the Проверки tab; the attempt
history is from #35 (`progress.md` F19, R6). Sources: `docs/learning-process.md` §1 (check results on the left) and §2 (the "Check"
button runs the checks from `lesson.yaml`; agent checks spend tokens, each has a budget); #34 (results
streamed over SSE, timeout marked as timeout, concurrent checks do not collide, saved as an attempt); #39
(hidden-task, timeout and budget from `lesson.yaml`); #37 (rubric checks, a budget per call, cost logging);
#68 (attempt limits and the mentor threshold per check, not yet in the contract); ADR-0007 (attempt and
result statuses, completion; item 5 "Attempt scope": an attempt is one grading run over a non-empty subset
of the lesson's checks; item 5's "grading run" covers a run and, from #36, a quiz send, while "run" below is
only the vocabulary's run, "Words"); task.md "Как проверяется" and "Попытки и подсказки" in all six module 00 lessons;
`packages/lesson-schema` check fields; Stepan's decisions for #69 (B0: both "limit known" and "limit
unknown" are designed, the lesson contract is not changed; S1-S12 of 2026-11-03 and 2026-11-04, cited below
by id: S7 no "Повторить", S8 no other-tab reason, S9 the #34 requirements, S10 no outcomes polish, S11 a
passed check that spends tokens is not re-run, S12 a passed lesson whose counted checks all spend tokens has
nothing to run).

Release words used below: **v1** is the lesson page once #34 ships together with the ADR-0007 amendment
the #69 design note asks for (it reports closed checks, format errors, counting and the lesson outcome);
**limit known** needs #68 as well; **from #37 / #39** marks checks that spend tokens (rubric, hidden-task).

Words (`ia.md` vocabulary, rows "run", "attempt record (of a run or of a quiz send)" and "attempt (one
check's result)"): a **run** is one press of "Проверить" (or "Запустить" in the budget confirmation); the
check bar calls it "проверка" ("Идёт проверка"), and ADR-0007 saves it as one **attempt** record. From #36
an answered quiz send is saved as an attempt record too, a **quiz attempt record**, which is never a run
(`progress.md` A72-17; widened at the merge of #72 with #70). In checks "attempt" /
"попытка" has two senses, and `ia.md` lists which words and strings belong to each (sign-in attempts,
"Слишком много попыток входа", and the reconnect tries counted by `CHECK_STREAM_RECONNECT_ATTEMPTS` are other
concepts with rows or names of their own):
- **the attempt record** (ADR-0007 item 5: the record of one run or, from #36, of one answered quiz send):
  in docs "attempt" alone, "attempt id", "attempt status", "attempt history" and the field `attemptId`; the
  fields `runningAttemptId` and `latestFinishedAttempt` name runs only, never a quiz attempt record
  ("Baseline of a re-read"); in UI copy only
  the history and review strings ("История попыток", "Попыток пока нет. Нажмите "Проверить", когда будете
  готовы.", "История попыток недоступна", "Ментор читает попытку").
- **one check's result in an attempt record** (an ADR-0007 `check_results` row; "in an attempt record", not
  "in a run", since the merge of #72 with #70), the unit the limit counts: in docs
  only next to a limit or counting word ("attempt limit", "last attempt", "attempts left" / "remain" /
  "leaves one attempt", "counted" / "failed attempt", "spends an attempt", "attempt counter") or as a quiz
  attempt (one sent quiz is one result of the quiz check, `quiz.md`), and the fields `attemptLimit`,
  `lastAttemptCount`; in UI copy every check-row, limit and quiz string: "Неудачных попыток: N" counts this
  check's counted failed results, "..., попытка не засчитана" says a result does not count (as the check
  bar's summary 4 it says that no result of the run counts toward a limit), "Стоимость попытки" is what
  this check's result cost. One run over two checks is one record and two results; one answered quiz send
  is one record and one result.

## Status of one check

A closed set (`ia.md` vocabulary). Colour is never the only signal: every status has an icon shape and a
word. The row shows exactly one status word, chosen in this order: during a run, "В очереди" or "Идёт" for
each check the run includes (see "Run composition"); otherwise "Закрыта: не пройдено" if the check is
closed; otherwise "Пройдено" if it ever passed (S1, sticky); otherwise the word of its latest result;
otherwise "Не запускалась". A check the run does not include (closed, S2; passed and spending tokens, S11)
keeps its word during the run. From #36 the quiz check row says "Ответы не отправлялись" in place of
"Не запускалась" and uses only "Пройдено", "Не пройдено" and "Закрыта: не пройдено" besides (`quiz.md`,
"Quiz check row in Проверки").

| Status | Russian label (exact) | Token, icon shape | Counted as a failed attempt | Release | In the #69 prototype |
|--------|-----------------------|-------------------|-----------------------------|---------|----------------------|
| not run | "Не запускалась" | `muted`, dotted ring | - | v1 | yes |
| queued | "В очереди" | `info`, dashed ring | - | v1 | yes |
| running | "Идёт" | `info`, spinning ring | - | v1 | yes |
| passed (sticky, S1) | "Пройдено" | `success`, check mark | - | v1 | yes |
| failed | "Не пройдено" | `destructive`, cross | yes | v1 | yes |
| timeout, counted | "Время вышло" | `warning`, exclamation mark | yes | v1 | yes |
| timeout, not counted | "Время вышло, попытка не засчитана" | `warning`, exclamation mark | no | v1, when the server reports the timeout as not counted | yes |
| format error | "Ошибка формата, попытка не засчитана" | `warning`, exclamation mark | no | v1, only when the server tags the result as a format error | yes |
| runner error | "Сбой проверки, попытка не засчитана" | `warning`, exclamation mark | no | v1 | yes |
| closed | "Закрыта: не пройдено" | `destructive`, lock (new icon `closed`) | - (final) | v1, when the server reports the check closed | yes |
| failed, budget spent (variant of failed) | "Не пройдено: исчерпан бюджет $N" | `destructive`, cross | as the server reports | from #39 | yes, sample data |

**Token rule.** The icon says what kind of outcome the check reached, never whether it counts; counting
is carried by the words only ("..., попытка не засчитана"):
- `success` check mark: the grader's verdict is a pass (sticky, S1).
- `destructive` cross: the grader reached a verdict, and it is a fail on the work by the check's own
  criteria. The budget-spent variant is one: the server reports it as `failed` (ADR-0007
  result status), because the hidden-task's budget is one of its criteria (#39: "timeout and budget from
  `lesson.yaml`"; learning-process §2 "each has a budget").
- `warning` exclamation mark: the check did not reach a verdict on the work: it ran out of time (ADR-0007
  gives `timeout` its own result status, so the grader did not finish), it could not read the work
  (format error), or the platform failed (`error`, runner error). Counted or not, the shape is the same.
- `destructive` lock: closed, a final state (S2), not a result; the shape tells it from the cross.
- `info` rings: in progress (queued, running). `muted` dotted ring: no result yet.

Every row of the table above follows it: "Не пройдено" and its budget variant are verdicts (cross);
"Время вышло" in both variants, "Ошибка формата..." and "Сбой проверки..." have no verdict ("!"), although
the counted "Время вышло" counts like "Не пройдено" (ADR-0007 item 4 groups `timeout` with `failed` for the
attempt status, which is counting, not the icon). If #39 reports budget exhaustion as a guard rather than a
criterion (a result status other than `failed`), the variant moves to `warning` with a word of its own
(design note, residuals).

Why these choices:
- Runner error is `warning`, not `destructive` as in the #50 notes, by the token rule: the platform could
  not grade, so there is no verdict. Its label changes from "Не удалось запустить проверку" to "Сбой
  проверки, попытка не засчитана", because ADR-0007 puts a run that never started and a run that lost its
  runner into the same `error` status, and "запустить" is false for the second; the wording repeats the
  shape of the format error ("..., попытка не засчитана"), the other result that does not count.
- The timeout word follows the server's counting rule, because ADR-0007 does not state it and the learner
  must not read a counted attempt into an uncounted one: "Время вышло" alone is counted, like "Не
  пройдено"; the uncounted variant says so in the same words as the format error.
- The closed check gets its own icon shape, because "closed" and "failed" are both `destructive` and the
  shape is the second signal after the word.
- The format error label appears only when the server tags the result. Untagged, a format error reads "Не
  пройдено" and counts, which contradicts task.md (L1, L3, L4); that is a #34 requirement (design note,
  data requirements), not a design fallback.

## Check row fields

The row is a disclosure button (Collapsible); its accessible name is its visible text in DOM order. Every
field below is in the `ia.md` register.

Collapsed row, in order, each only when the meta table below says so:
1. status icon (`aria-hidden="true"`);
2. title (`lesson.yaml` `title`, as is);
3. status word (table above);
4. meta, in this order: the running time "M:SS из M:SS" (elapsed against `timeoutSec`), "лимит M:SS" (the
   check's `timeoutSec`), then "Осталась 1 попытка" with a warning icon (R7). The running time is not
   live: it sits inside the row's button, whose children are presentational, so it has no `role="timer"`
   there and is read as part of the button's name when the learner reaches the row. The kind is not shown
   (Stepan's #50 decision, kept for #69; label set for later in "Check kind" below).

**Row meta by status word.** Each meta item is tied to the status word shown, never to a result the word
does not describe ("лимит M:SS" never sits under "Пройдено" or "Закрыта: не пройдено").

| Status word shown | Running time "M:SS из M:SS" | "лимит M:SS" | "Осталась 1 попытка" (limit known, M - N = 1) |
|-------------------|-----------------------------|--------------|-----------------------------------------------|
| "Не запускалась" | - | - | yes (only a limit of 1 can leave one attempt before any run) |
| "В очереди" | - | - | yes |
| "Идёт" | yes, when the check has a `timeoutSec` (a rubric check has none: no time shown) | - | yes |
| "Пройдено" | - | - | never: a passed check spends no attempt (S1) |
| "Не пройдено", "Не пройдено: исчерпан бюджет $N" | - | - | yes |
| "Время вышло", "Время вышло, попытка не засчитана" | - | yes | yes |
| "Ошибка формата, попытка не засчитана" | - | - | yes |
| "Сбой проверки, попытка не засчитана" | - | - | yes |
| "Закрыта: не пройдено" | - | - | never: no attempt is left |

Open panel, in order, each only when the panel table below says so:
1. closed note: "Проверка закрыта: попытки исчерпаны. Сброс рабочей папки и перезапуск окружения её не
   откроют." (S2);
2. sticky-pass note, when the check passed earlier and its latest result is not a pass (S1): "Проверка уже
   засчитана. Последний результат: не пройдено" or "Проверка уже засчитана. Последний результат: сбой
   проверки". "не пройдено" is here a group word for every latest result that is a counted or uncounted
   miss without a runner error: failed, budget spent, timeout in both variants, format error; "сбой
   проверки" is the runner error (registered so in `ia.md`, check row note);
3. the grader message of the latest result, verbatim (`pre`), when that result has one; the UI adds no
   detail the grader did not give and never shows an older result's message, because the message must
   describe the status shown;
4. "Подробности" (the latest result is a runner error): a Collapsible with the raw error as the server
   gives it;
5. cost: "Стоимость попытки: $N", the cost of this check's latest result (one check, not the run), when
   the server reports one (from #37 / #39);
6. counter: "Неудачных попыток: N" or "Неудачных попыток: N из M" (R7), in every row.

**Open panel by status word.**

| Status word shown | Closed note | Sticky-pass note | Grader message (latest result) | "Подробности" | Cost | Counter |
|-------------------|-------------|------------------|-------------------------------|---------------|------|---------|
| "Не запускалась" | - | - | - | - | - | yes |
| "В очереди", "Идёт" | - | - | - (the last result describes files now being graded again) | - | - | yes |
| "Пройдено", latest result a pass | - | - | if any | - | if any | yes |
| "Пройдено", latest result not a pass (S1; a command check only, S11) | - | yes | if any | if the latest is a runner error | - (command checks spend nothing) | yes |
| "Не пройдено", budget variant | - | - | if any | - | if any | yes |
| "Время вышло", both variants | - | - | if any | - | if any | yes |
| "Ошибка формата, попытка не засчитана" | - | - | yes (index and field, task.md L1, L3, L4) | - | - | yes |
| "Сбой проверки, попытка не засчитана" | - | - | if any | yes | if any | yes |
| "Закрыта: не пройдено" | yes | - | the closing result's, if any (a closed check is never run again, so its latest result is the one that closed it) | - | if any | yes |

Not in the row: the kind (above), mentor and hint controls (from #37, R6), the attempt history (from #35, `progress.md` F19, R6).

Counter: N is the number of counted failed results the server reports for this check: failed, budget
spent and timeouts the server counts; never a format error, a runner error, or any result after the
check's first pass (S1). M is the check's attempt limit, when the server reports one.

Money: "$" and the amount with two decimals and a dot ("$0.04", "$2.50"), as `mentor.md` writes it. Costs
are rounded up to the cent, because "$0.00" for a spend that was not zero would misinform; budgets are
shown as the server reports them.

## Run composition

A run includes (S1, S2, S11):
- every counted `command` check (R6) that is not closed, passed ones included (S1: they are free, and the
  learner sees when their files break, through the sticky-pass note);
- every counted check that spends tokens (rubric from #37, hidden-task from #39) that is neither passed
  nor closed. A passed check that spends tokens is not run again (S11), because a re-run would spend the
  learner's money on a check that can only stay "Пройдено".

The server computes the included checks at the start and reports them with the run (design note, data
requirements), so the rows, the budget confirmation and the server never disagree. A quiz check is never in
a run: from #36 its row links to the quiz (F15).

**Nothing to run.** When a run would include no check, "Проверить" is `aria-disabled` with "Проверки
завершены" (R1). This holds in S3 (every counted check passed or closed, at least one closed), and from
#37 / #39 in a passed lesson whose counted checks all spend tokens (S12: S11 leaves nothing to re-run). In both
the status line holds the lesson outcome (summary 6 or 5) and "Открыть результаты" from page load (Live
regions). In v1 every counted check is a free `command` check, so only S3 reaches this state.

## Attempt limits: limit known and limit unknown (R7)

R7 in `ia.md` is the rule; this table is every element it touches. "Limit known" means the server reports
a limit M for the check (from #68); "limit unknown" covers both a check whose limit the server does not
report and a check with no limit (task.md: "число попыток не ограничено"), because the learner is told the
same in both cases: no number to count against.

| Element | Limit known | Limit unknown or unlimited |
|---------|-------------|----------------------------|
| counter in the open row | "Неудачных попыток: N из M" | "Неудачных попыток: N" |
| last-attempt warning in the row meta | "Осталась 1 попытка", while M - N = 1 and the check is neither passed nor closed (row meta table) | never |
| last-attempt note in the check bar after a run | "Осталась 1 попытка" (exactly one such check) or "Проверок на последней попытке: N" (two or more) | never |
| closed state | when the server reports it; the warning showed from the run before | when the server reports it, with no warning before |
| quiz attempt line (D2, `quiz.md`) | "Попытка A из M" | "Попытка A" |

The warning shows only when exactly one counted attempt remains (S4), so the learner sees it before the
last attempt and not on every failure. It stays while that is true: a format error, a runner error or an
uncounted timeout on the last attempt leaves it in place.

Russian plurals. The one string whose words agree with a number is "Осталась 1 попытка", and S4 shows it
only for exactly one remaining attempt, so the app renders it as a fixed string, never through plural
rules. The three CLDR forms (one, few, many) are written out for any later change of S4 and are not
rendered by anything designed here: one (1, 21, 31, ..., not 11) "Осталась 1 попытка"; few (2-4, 22-24,
..., not 12-14) "Осталось 2 попытки"; many (0, 5-20, 25-30, ...) "Осталось 5 попыток". Every other number in
check copy follows a colon ("Неудачных попыток: N", "Закрытых проверок: N", "Проверок на последней попытке:
N", "Проверок со сбоем: N", "Пройдено: N из M"), a label form that needs no agreement; that is why the bar's
notes use it. The budget confirmation has no numeral next to a noun; its one count-dependent word pair is
chosen by the number of listed checks (F13.1, budget confirmation).

## Check bar status line

The status line holds one summary, the first that matches, and for the last summary only, notes joined
with ". " in the order listed. No final full stop, as in "Пройдено: 2 из 3". The run a summary describes is
the run this page started or attached to, or, after a background re-read, the latest finished run
(Background changes and focus).

| # | When | Summary (exact) | Notes |
|---|------|-----------------|-------|
| 1 | a run of this lesson is going (started here, in another tab or before a reload) | "Идёт проверка" | - |
| 2 | the result stream dropped and the browser is reconnecting (automatically, or after "Переподключиться") | "Соединение с проверкой потеряно. Переподключаемся..." | - |
| 3 | reconnecting failed `CHECK_STREAM_RECONNECT_ATTEMPTS` times | "Не удалось получить результат проверки" | - |
| 4 | the run could not start, or every check it included ended in a runner error | "Сбой проверки, попытка не засчитана" | - |
| 5 | the server reports the lesson passed | "Урок пройден" | - |
| 6 | the server reports the lesson finished and not passed (S3) | "Урок завершён: не пройден. Пройдено: N из M" | - |
| 7 | otherwise, after a run | "Пройдено: N из M" | "Закрытых проверок: N" (one or more counted checks closed); "Осталась 1 попытка" or "Проверок на последней попытке: N" (R7, limit known); "Проверок со сбоем: N" (one or more checks of this run ended in a runner error) |

N and M in "Пройдено: N из M" are the passed and the counted checks (R6) as the server reports them; M
includes closed checks, which count as not passed. Summaries 5 and 6 come from the lesson status the
server reports, never from the browser's own count, because the bar and the dashboard must say the same
(ADR-0007 completion counts every check id today, including unshipped kinds; data requirement). A closed
check is never passed (S1, S2), so "Урок пройден" never shows while a counted check is closed.

From #36 a quiz send also changes this line: which notes of summary 7 count the quiz, and the two
exceptions to this section after a quiz send ("Открыть результаты" shown with an empty line, P7 and P8;
in S3 an empty line in place of summary 6 until a reload, P8), are in `quiz.md` "Check bar after a quiz
send".

Examples:

| Situation | Status line |
|-----------|-------------|
| L1, one counted check, failed, limit unknown | "Пройдено: 0 из 1" |
| L1, failed, 9 failed of 10 | "Пройдено: 0 из 1. Осталась 1 попытка" |
| L1, the check closed | "Урок завершён: не пройден. Пройдено: 0 из 1" |
| four checks: one passed (runner error on its re-run), one closed, two on their last attempt | "Пройдено: 1 из 4. Закрытых проверок: 1. Проверок на последней попытке: 2. Проверок со сбоем: 1" |
| three checks: two passed, one closed | "Урок завершён: не пройден. Пройдено: 2 из 3" |
| every counted check passed | "Урок пройден" |
| the stream ended without a result (ADR-0007 `error`), one check | "Сбой проверки, попытка не засчитана" |

"Открыть результаты" is shown while the status line holds an end text (summaries 4-7): from the end of a
run, or from a background re-read that finds a newer finished run, until the next run starts or the learner
leaves the page; in the nothing-to-run state (S3, summary 6; a passed lesson with only token-spending
checks, summary 5) from page load, because then "Проверить" is permanently disabled and the results are the
only next step.

"Проверить" after an end text: enabled, so after "Урок пройден" the learner can re-run the passed `command`
checks (S1; a passed check that spends tokens is not re-run, S11); `aria-disabled` with "Проверки
завершены" when nothing is left to run (Run composition), in S3 by Stepan's decision S3 although the passed
`command` checks of that lesson could be re-run too; the environment reasons of R1 otherwise.

## Live regions

**One rule.** The check bar status line is the only live element of checks (R2). Its text changes, and so
is announced, exactly when this page learns of a change in the lesson's run: a run started or found
(summary 1), the stream lost (2), reconnecting failed (3), a run ended or could not start (4-7), a run that
ended while the tab was hidden found on return (4-7). Everything else is rendered silently: the text the
page loads with, the rows, every running time, the R1 reasons (read when the learner reaches "Проверить"),
the Проверки tab's name, and "К окружению" appearing or going (the environment status text announces the
environment change in its own container, R2). Every change the learner must notice is therefore a text
change of the status line. A change that yields the string the line already holds (B9: a newer run ended
elsewhere with the same end text as the run shown) empties the container and sets the text again after the
gap below, so it is still announced; a re-read that finds nothing new (B11) sets nothing.

**Text gap.** Between two consecutive texts of the status line, including the empty one of an equal-string
re-set, at least `CHECK_STATUS_TEXT_GAP_MS` passes (a parameter set by #34, about 100-150 ms, and never less
than one rendered frame). A text due sooner waits for the gap; only the newest waiting text is set. Because
browsers compare the accessibility tree once per rendered frame, "X", "", "X" inside one frame, or two texts
inside one frame, can reach a screen reader as no change or as the second text only; the gap makes each text
its own change. It also covers a reconnect cycle that fails at once (B16 then B17), whose duration has no
lower bound.

**Baseline of a re-read.** The page keeps one value: the id of the latest finished run it has read
(`latestFinishedAttempt.attemptId`, null when no run has ever finished). **Runs only:** the check-state
read (#34) serves in `latestFinishedAttempt` and `runningAttemptId` attempt records that are runs, never a
quiz attempt record (from #36, `progress.md` A72-17; a record whose result has `check_kind = 'quiz'`,
which a run never holds, "Run composition"), and #36 writes a quiz attempt record already finished, never
`running` (`quiz.md` "Requirements for #36", item 11). So a quiz send, in this page or another browser
tab, never changes this baseline, never makes a re-read B8, B9 or B10, never sets a run's end text and
never attaches a run; what a re-read does with a quiz attempt record it finds is B27. The attempt history (from
#35) keeps a baseline of its own over every record kind (`progress.md` F19 Loading). It is set on load from the
check-state read, and replaced by the id of every run whose end this page shows: its own or an attached
run's end (B19), a reconnect that finds the run ended (B14, B17), and a re-read that shows a newer run
(B9, B10). A start refused with no attempt record (summary 4, F13 error states) leaves it as it is. A re-read
compares the server's `latestFinishedAttempt.attemptId` with this baseline, never with what the status line
holds, so:
- on a page loaded with an empty status line (B1) the baseline is the run that ended before the load; a
  re-read that finds the same id changes nothing (B11, the line stays empty), one that finds another id
  shows that run's end text (B9);
- after this page's own or attached run ended (B19) the baseline is that run; the same id is B11, another
  id (a later run elsewhere) is B9;
- on a tab that gave up its stream ("Не удалось получить результат проверки", summary 3) the baseline is
  still the run that ended before the one it followed, because this page never saw that one end; a re-read
  that finds it still going re-attaches (B8), one that finds it ended has another id and shows its end text
  (B9); B11 cannot occur there.

**Which tabs re-read.** Every tab that holds no live result stream re-reads the check states when it becomes
visible (`visibilitychange` to visible, S9): a tab that never attached, a tab whose run ended, and a tab in
summary 3. A tab holding a stream (summary 1, or summary 2 while it reconnects) does not, because its stream
or its reconnect read (B13, B14, B17) already reports the run.

**Containers and order.**
- The status line is an always-present `role="status"` container. On load it is empty, except in the
  nothing-to-run state (Run composition: S3 with summary 6, a passed lesson with only token-spending checks
  with summary 5), where the page renders it with that text inside, so it is not announced on load (a live
  region's initial content is not announced); the `aria-disabled` "Проверить" carries the reason. Disabled
  reasons are never put in it (R1).
- Text changes and their order: `Background changes and focus` below lists every transition with its text.
  The pairs that must reach a screen reader as two announcements are always two different texts: a lost
  stream (2) is followed by 1, an end text or 3; a manual "Переподключиться" sets 2 for the whole
  reconnect cycle, then 1, an end text or 3 again; every two consecutive texts are at least the text gap
  apart.
- The last-attempt warning, a closed check and a runner error are announced only through the status line
  (summaries 4 and 6 and the notes of summary 7), once, at the end of the run; the rows are not live.
- The timer next to the status line ("0:42") is a separate element with `role="timer"` (not announced),
  outside the status element. It counts from the run's start time on the server, so every tab and a
  reload show the same time; it is removed in summaries 3-7.
- Check rows in Проверки are not live, and their running times are part of the row button's name, not
  live timers (Check row fields). A screen reader user hears the run start and end once, and reads the rows
  when they open the tab.
- The Проверки tab's running badge is not colour or a spinner alone: while a run is known to be going
  (summaries 1 and 2), the tab's accessible name is "Проверки, идёт проверка" (visually hidden text inside
  the tab), back to "Проверки" otherwise. The name change is not announced (silent, by the rule above).
- The budget confirmation is a modal AlertDialog, not a live region: focus moves into it.

## Background changes and focus

Every transition that adds, removes or replaces a check-bar control or a control inside an open check row,
whether the learner activated it or not. "Проверить" is never removed in a lesson with checks the
platform runs (R1 keeps it in place), and the row buttons are never removed (the rows are the lesson's
counted checks). The controls that can go are "К окружению", "Переподключиться", "Открыть результаты" and
"Подробности" in an open row, and from #36 "Пройти квиз" in an open quiz check row (B26, B27). R2 states the
focus rule once; this table is every case of it. The prototype and the acceptance run test each row (design
note, author phase).

| # | Transition (who triggers it) | Status line text (announced) | Controls removed or replaced | Focus, if a removed control had it |
|---|------------------------------|------------------------------|------------------------------|------------------------------------|
| B1 | Page load, no run going | empty (nothing to announce) | - | page start (no control had focus) |
| B2 | Page load in the nothing-to-run state (S3, or a passed lesson with only token-spending checks) | summary 6 or 5 rendered with the page, not announced | - | page start |
| B3 | Page load, the server reports a running run (attach) | summary 1, announced when the read returns | - | page start |
| B4 | Learner presses "Проверить" and the run starts | summary 1 | "Открыть результаты" | focus is on "Проверить" (activated), stays |
| B5 | "Проверить" refused because a run is going (409), attach | summary 1 | "Открыть результаты" | stays on "Проверить" |
| B6 | "Запустить" in the budget confirmation: the run starts, or is refused (409) and the page attaches | summary 1, set after the dialog has closed and focus is on "Проверить" (a status change behind an open modal may not be announced) | the dialog closes; "Открыть результаты" | "Проверить" (`aria-disabled`, "Дождитесь окончания проверки") |
| B7 | A "Действия" item refused (409, F11), attach | summary 1 | "Открыть результаты" | focus is on "Действия" (F11 error states), stays |
| B8 | Tab without a live stream becomes visible (Which tabs re-read), the re-read finds a run going | summary 1 | "Открыть результаты", "К окружению", "Переподключиться", whichever was shown; "Подробности" in an open row whose check the run includes (its panel drops to the counter) | "Проверить" (check bar); that row's button (open row) |
| B9 | Tab without a live stream becomes visible, no run going, and the re-read's `latestFinishedAttempt.attemptId` differs from the page's baseline (Baseline of a re-read) | that run's end text (4-7); the baseline becomes its id | "Переподключиться"; "К окружению" if the environment now runs; "Открыть результаты" is shown (kept if it was there); "Подробности" in an open row whose result changed | "Проверить" (check bar); that row's button (open row) |
| B10 | As B9, and that run left nothing to run (S3; a passed lesson with only token-spending checks, S12) | summary 6 or 5; the baseline becomes its id | "К окружению", "Переподключиться"; "Подробности" in an open row (a closed check's panel has none; the latest result changed); "Открыть результаты" is shown | "Проверить" (now `aria-disabled`, "Проверки завершены"); that row's button (open row) |
| B11 | Tab without a live stream becomes visible, no run going, and the re-read's id equals the baseline, and the quiz check is as the page shows it (otherwise B27) | unchanged, nothing set, nothing announced (after a load with an empty line it stays empty) | - | - |
| B12 | The result stream drops | summary 2 | - | - |
| B13 | Automatic reconnect succeeds, run still going | summary 1 | - | - |
| B14 | Automatic reconnect succeeds, run ended meanwhile | its end text (4-7); the baseline becomes its id | "Подробности" in an open row whose result changed | that row's button |
| B15 | Reconnecting fails `CHECK_STREAM_RECONNECT_ATTEMPTS` times | summary 3 | - ("Переподключиться" is added after "Проверить") | - |
| B16 | Learner presses the check bar's "Переподключиться" | summary 2, for the whole new reconnect cycle | "Переподключиться" (removed while the cycle runs) | "Проверить" |
| B17 | The manual cycle ends: run going / run ended / still unreachable | summary 1 / its end text (the baseline becomes its id) / summary 3 again, at least the text gap after summary 2 | on failure "Переподключиться" comes back after "Проверить" | focus is on "Проверить", stays |
| B18 | A check's result arrives during a run | unchanged (rows are silent) | that row's panel is replaced (it showed only the counter while "В очереди" or "Идёт") | - |
| B19 | The run ends (own or attached) | its end text (4-7); the baseline becomes its id | - ("Открыть результаты" is added) | - |
| B20 | The environment stops (idle stop, limits, platform restart), no run going | unchanged (the environment status announces it) | - ("К окружению" is added after "Проверить") | - |
| B21 | The environment stops during a run | the run ends with runner errors: its end text (4 or 7 with "Проверок со сбоем: N") | as B19, then B20 | - |
| B22 | The environment becomes creating, starting or running (its own action, auto-start, another tab) | unchanged (silent) | "К окружению" | "Проверить" |
| B23 | Budget confirmation open, and a change alters its list, its sum or the state of "Проверить" (B8-B10, B20, B22, any re-read) | as that change, set after the dialog has closed and focus is on "Проверить" | the dialog closes, nothing runs | "Проверить" |
| B24 | Budget confirmation: "Отмена" or Esc | unchanged | the dialog closes | "Проверить" |
| B25 | Learner presses "Открыть результаты" | unchanged | - | the Проверки panel heading (F13.4) |
| B26 | A quiz send is answered (from #36; `quiz.md` "Check bar after a quiz send") | emptied silently when the send makes its text untrue (P7) or leaves nothing to run (P8), nothing set, not announced (the quiz result block or the quiz notice says the outcome); otherwise unchanged | P8: "К окружению", "Переподключиться"; "Проверить" becomes `aria-disabled` "Проверки завершены", silently; "Открыть результаты" is shown (kept if it was there). A pass or close: "Пройти квиз" in an open quiz check row | "Проверить" (as B10); the quiz row's own disclosure button for "Пройти квиз" (as B8-B10, B14) |
| B27 | Tab without a live stream becomes visible, no run going, the re-read's id equals the baseline, and the quiz check differs from what the page shows (its state or its failed count: the server recorded a quiz send this page has not shown, sent in another browser tab or by this page's own send that timed out, `quiz.md` F15 Error states; from #36) | nothing set, nothing announced: the line follows `quiz.md` "Check bar after a quiz send", row "refused", by the quiz's current state (P7: an untrue summary 7 is emptied silently; P8: nothing to run, the line empty; otherwise unchanged), because a quiz attempt record is not a run and a quiz send never sets a text in the line (P6); the quiz check row changes silently; from #35 the history applies the same read (`progress.md` F19 Loading) | P8: "К окружению", "Переподключиться"; "Проверить" becomes `aria-disabled` "Проверки завершены", silently; "Открыть результаты" is shown (kept if it was there). A pass or close: "Пройти квиз" in an open quiz check row | "Проверить" (as B10); the quiz row's own disclosure button for "Пройти квиз" |

A change that removes nothing the learner has focus on never moves focus: the page moves focus only when the
focused element is removed or the dialog holding it closes.

## F13: Run the checks and read the result

**Goal:** find out whether the task is done, and what to fix if it is not. Source: learning-process §2;
#34; task.md "Как проверяется"; G1, G2.

**Entry:** "Проверить" in the check bar, from any left-pane tab and in one-pane mode from either pane.

**Steps (6):**

1. F13.1 Learner presses "Проверить". It starts one run over the checks of "Run composition": every
   counted `command` check that is not closed (S2), passed ones included (S1), and from #37 / #39 every
   token-spending check that is neither passed nor closed (S11). A quiz check is never run by it: from #36
   its row links to the quiz (F15). When the run includes a check that spends tokens, the budget
   confirmation opens first, on every such run (S5; below); once every token-spending check is passed or
   closed, no run includes one and the confirmation no longer opens. No module 00 lesson has such a check
   today.
2. F13.2 The check bar shows "Идёт проверка" and the timer "0:42"; the Проверки tab gets its running badge;
   the learner stays on the current tab (no automatic switch), because a run of 30-120 s, or up to an hour
   for hidden-task, must not pull the learner away from reading or the terminal.
3. F13.3 In the Проверки tab each check row shows the fields of "Check row fields": while running, its
   status and the elapsed time against `timeoutSec` ("0:42 из 2:00"). Rows update as results stream in. A
   check the run does not include (closed; passed and spending tokens, S11) keeps its word and is not run.
4. F13.4 When the run ends, the status line reads the end text of "Check bar status line" (for example
   "Пройдено: 2 из 3", or "Урок пройден" when the server reports every counted check passed) with "Открыть
   результаты", announced once. "Открыть результаты" shows the Проверки tab and moves focus to its heading;
   in one-pane mode it first switches the area to "Урок" (R3). If the environment stops after the run, the
   bar holds, in this order, "Проверить" (`aria-disabled`, "Сначала запустите окружение"), "К окружению",
   "Открыть результаты" (R1).
5. F13.5 Learner opens a check row: the open panel of "Check row fields", ending with the counter,
   "Неудачных попыток: 3" when the limit is unknown, "Неудачных попыток: 3 из 10" when it is known (R7).
6. F13.6 From #37 (D3; not shown in v1, R6): after a failed run, when the lesson's mentor threshold is
   known and reached (e.g. 5 failed, task.md L2, L5, L6), the row offers "Разобрать с ментором" (F16);
   otherwise "Попросить подсказку" is always there (F17). In v1 the open row ends with the counter of
   F13.5, and the Задание tab's "Попытки и подсказки" text stays as written in task.md.

**Budget confirmation (F13.1, S5, S11; from #37 / #39).** An AlertDialog, the same component as F11.3.
- When: "Проверить" is pressed and the run would include at least one check that spends tokens (Run
  composition: never a passed one, S11); on every such run, never remembered, because each run spends real
  money from the learner's own key, runs are long and few, and a remembered consent hides a cost the
  learner may not expect a week later.
- Title: "Потратить до $N с вашего ключа API?" ($N: the sum of the items). The title names the decision
  (spending money), not who spends it, because the spender differs by kind: the mentor grades a rubric check
  ("оценка ментора"), an agent solves a hidden task, and "агент" alone would also read as the learner's own
  agent in the terminal (`ia.md` vocabulary, "агент").
- Description, tied by `aria-describedby` (the paragraph and the list): with one listed check "Эта
  проверка расходует токены:", with two or more "Эти проверки расходуют токены:", then a list with one item per
  check of this run that spends tokens, "<check title>: до $N". The form is chosen by the number of listed
  items (one, or more than one); no numeral stands next to the noun, so no other plural form exists. The
  check titles come from `lesson.yaml` and already say the kind ("(оценка ментора по рубрике)"). Checks
  that spend nothing are not listed, because they cost nothing. First real cases: L4 `plan-rubric` and L5
  `agents-md-rubric`, each the only token-spending check of its lesson, so one item and the singular form.
- Named: the maximum spend (hidden-task: `budgetUsd`; rubric: the per-call budget of #37, both reported
  by the server), whose money it is (the learner's API key, `learning-process.md` §1), which checks spend
  it. Not named: the actual cost, unknown before the run (the row shows "Стоимость попытки: $N" after it),
  and whether a run that exhausts the budget counts (#39 decides; the counter shows what the server
  reports).
- Buttons in DOM order: "Отмена" (outline, initial focus), "Запустить" (default variant, not destructive:
  spending is not destroying, and the filled destructive colour is reserved for "Сбросить",
  `design/system/README.md`).
- Focus: on open, "Отмена"; Tab cycles inside the dialog; Esc or "Отмена" closes it, nothing runs, focus
  returns to "Проверить" (B24); "Запустить" closes it and starts the run, focus stays on "Проверить", now
  `aria-disabled` with "Дождитесь окончания проверки", as after F13.1 without the dialog (B6). When a
  change the learner did not make alters the list, the sum or the state of "Проверить" while the dialog is
  open (a run found on return to the tab, a newer finished run, the environment stopping or starting), the
  dialog closes, nothing runs, and focus goes to "Проверить" (B23), because a confirmation must never
  approve a list the learner did not read; pressing "Проверить" again shows the current list. In B6 and
  B23 the order is: close the dialog, move focus to "Проверить", then set the status-line text, because
  while the modal is open the rest of the page is inert and a status change there may not be announced. The `F6`
  cycle is off while the dialog is open (R3). The dialog does not count as activity for the idle stop
  (F10); while it is open the idle warning in "Уведомления" is behind the modal (design note, residuals).

**Success:** every counted check passed: the check bar reads "Урок пройден", the lesson status becomes
"Пройден" on the dashboard and in the catalog, and the dashboard's next lesson moves on (F4).

**Error states:**
- A check times out: its row reads "Время вышло" with "лимит 2:00"; when the server reports the timeout as
  not counted, "Время вышло, попытка не засчитана" with the same meta. The counter shows what the server
  reports.
- Format error, tagged by the server: "Ошибка формата, попытка не засчитана" plus the grader's message
  naming index and field; the counter does not change (task.md L1, L3, L4).
- Runner error (the container died, the checks directory is missing, the service stream ended without a
  final result, ADR-0007): the row reads "Сбой проверки, попытка не засчитана", its panel holds the latest
  result's grader message if it has one and "Подробности" with the raw error; the counter does not change.
  The status line reads summary 4 when every check of the run errored, else the note "Проверок со сбоем:
  N". The retry is "Проверить" itself (S7). There is no separate "Повторить", because it would do exactly
  what "Проверить" does (one label per action, `ia.md` Action labels) and would need every R1 reason of its
  own.
- The run cannot start (the service refuses for a reason other than a running run, or does not answer): no
  attempt exists, the rows keep their previous status, the status line reads summary 4 with "Открыть
  результаты"; "Проверить" stays enabled. No detail is shown, because no attempt row holds a raw error
  (design note, residuals).
- The environment is being created or started (F8.1) when a command check needs it: "Проверить" is
  `aria-disabled` with the reason "Окружение запускается, проверка станет доступна после запуска" (R1),
  and no other button, because the start is already under way.
- The environment is stopped or failed to start (F8 error states, F10.3): "Проверить" is `aria-disabled`
  with "Сначала запустите окружение" (R1), followed by the button "К окружению", which switches the area to
  "Окружение" in one-pane mode and moves focus to the status bar's status action ("Запустить снова",
  "Повторить" or "Открыть курс", R3). If the environment starts by any other way while focus is on "К
  окружению", the button goes and focus moves to "Проверить" (B22).
- A run of this lesson is already going, started in this tab, in another tab or before a reload (#34
  lock). The page attaches to it: on load, when the server reports a running attempt (B3), and when
  "Проверить", "Запустить" in the budget confirmation or a "Действия" item (F11) is refused because of it
  (B5-B7). Then the status line reads "Идёт проверка", the timer counts from the run's start, the rows
  stream, and "Проверить" is `aria-disabled` with "Дождитесь окончания проверки" (R1). The UI does not say
  which tab started the run (S8), because it cannot tell its own reloaded run from another tab's without a
  tab id, and the learner's only action is the same in both cases: wait (#69 research Q5). Every attached
  tab shows the end text. Every tab without a live result stream (never attached, its run ended, or
  stuck in "Не удалось получить результат проверки") re-reads the check states when it becomes visible
  again (`visibilitychange`, S9; Live regions, "Which tabs re-read"): it attaches to a running run (B8);
  or, when `latestFinishedAttempt.attemptId` differs from the page's baseline (the id of the latest finished
  run this page has read, on load or at the end of its own or an attached run), it shows that run's end text
  (B9, B10), because the rows it then shows changed during this page view and the status line is where a
  change is reported; or, with the same id, nothing is set (B11), so a page loaded with an empty status
  line stays empty; a quiz send this page has not shown (sent in another browser tab, or this page's own send that timed
  out and the server recorded) sets nothing either and only applies P7 or P8 of `quiz.md` silently (B27).
- The result stream (SSE) drops: the status line reads "Соединение с проверкой потеряно.
  Переподключаемся..."; the timer keeps counting; "Проверить" keeps "Дождитесь окончания проверки". The
  browser's `EventSource` reconnects by itself; on reconnect the page re-reads the attempt and shows
  "Идёт проверка" or, if the run ended meanwhile, its end text (B12-B14). The run continues on the server,
  and the UI never shows a check as failed because the stream dropped.
- Reconnecting fails `CHECK_STREAM_RECONNECT_ATTEMPTS` times (a parameter set by #34, like
  `TERMINAL_RECONNECT_ATTEMPTS` of F9): the status line reads "Не удалось получить результат проверки"; the
  timer, the spinner and the tab badge go; each row keeps the last status it received, so a running row
  keeps "Идёт" with its time stopped, possibly past its own limit (the status line says why; accepted, design
  note residuals). "Проверить" is `aria-disabled` with "Результат проверки ещё не получен", followed by
  "Переподключиться" (B15). "Переподключиться" starts a new reconnect cycle, as the terminal's does (F9):
  the button goes, focus moves to "Проверить", and the status line reads "Соединение с проверкой потеряно.
  Переподключаемся..." with "Дождитесь окончания проверки" on "Проверить" and the tab's running badge for
  the whole cycle (B16), although the run may have ended while the page was disconnected (accepted for one
  cycle, design note residuals). The
  cycle ends with the run still going (summary 1), with its end text, or, the server still unreachable,
  with "Не удалось получить результат проверки" again and "Переподключиться" back after "Проверить"; focus
  stays on "Проверить" (B17). Each outcome is a text change, so it is announced. A run that ends while the
  page is disconnected is saved and shown on the next read (data requirement: the relay keeps consuming the
  service stream with no browser attached).
- The learner leaves the page during a run: the run continues on the server; its result is there on return
  (same data requirement).
- The budget runs out during a hidden-task (#39): the row reads "Не пройдено: исчерпан бюджет $N" ($N: the
  check's budget) with "Стоимость попытки: $N"; counted as the server reports.

**Empty states:**
- Before any run: the check bar shows "Проверить" and an empty status line (R2); the Проверки tab lists
  every check as "Не запускалась" and "Попыток пока нет. Нажмите "Проверить", когда будете готовы." (the
  text of F19's empty state; the history section itself is from #35, `progress.md` F19, R6).
- Nothing to run (Run composition): "Проверить" `aria-disabled` with "Проверки завершены", the outcome in
  the status line and "Открыть результаты" from load.
- A lesson with no check the platform runs: no check bar, no "Проверка" region, no Проверки tab (R6).
  This covers a lesson with no checks (not allowed by the schema today), the M0 lesson, and in v1 a
  lesson whose checks are all of unshipped kinds, such as a quiz-only lesson (none exists in module 00:
  every lesson there has a `command` check). From #36 (D2) a quiz-only lesson's check bar shows "Пройти
  квиз" instead of "Проверить".

**Exit:** F13.4 back to work (F9); F14 when a limit is reached; F16 and F17 from #37 (D3, R6).

**Keyboard path:** `F6` to "Проверка" lands on "Проверить" in every state (R3), enabled or `aria-disabled`
with its reason read as its description (R1); Tab then reaches, when shown, "К окружению" or
"Переподключиться", then "Открыть результаты" (F13.4; the two never show together). Enter runs; in the
budget confirmation focus starts on "Отмена", Tab cycles inside, Esc cancels. "Открыть результаты" and "К
окружению" switch the one-pane area first (F13.4, error states). Each check row is a disclosure button
(Enter or Space expands the panel); inside an open runner-error panel Tab reaches "Подробности", another
disclosure button. When a change removes the focused control, focus goes where "Background changes and
focus" says, never to `body` (R2).

**Time limits:** per check `timeoutSec` (command up to 1800 s, hidden-task up to 3600 s, schema), shown
as elapsed against the limit; no warning before a check's timeout, because the learner cannot do anything
about a running check except wait. Reconnecting the result stream has no time limit of its own, only the
number of reconnect tries `CHECK_STREAM_RECONNECT_ATTEMPTS`. A run counts as activity for the environment's idle stop
(F10), so the idle warning does not fire during a run as long as #34 reports activity during it (design
note, dev notes). A run continues on the server if the learner leaves the page or the session expires (F2);
the result is there on return.

## F14: Reach the attempt limit of a check

**Goal:** know before running checks how many attempts remain, that a check is closed, why, and what comes
next. Source: issue #69; task.md "Попытки и подсказки" (L1 `model-routing` and L3 `cost-estimate`: at most
10 failed checks, then closed as "не пройдено"; L4 `context-bug-hunt`: 3 graded submissions; "скелет" and
"скажи прямо" open after a check is closed; "Сброс урока или рабочей папки счётчик не обнуляет"); Stepan's
decisions S1-S4.

**Entry:** limit known: a counted failed result that leaves one attempt (F13.4). Limit unknown: a run after
which the server reports the check closed (then F14 starts at F14.3).

**Steps (4):**

1. F14.1 After a counted failed result that leaves exactly one attempt (limit known, R7), the row's meta
   shows "Осталась 1 попытка" with the warning icon, and the run's end text carries the note "Осталась 1
   попытка" (one such check) or "Проверок на последней попытке: N", announced once with the end of the
   run (S4).
2. F14.2 Learner fixes the files and presses "Проверить" (after the budget confirmation, if the run spends
   tokens); the last counted attempt fails.
3. F14.3 The row reads "Закрыта: не пройдено" with the lock icon and no meta; its open panel shows the
   closed note "Проверка закрыта: попытки исчерпаны. Сброс рабочей папки и перезапуск окружения её не
   откроют.", the closing result's grader message and "Неудачных попыток: 10 из 10" ("Неудачных попыток:
   10" when the limit is unknown). The check is no longer run by "Проверить"; it stays listed and counted
   in "Пройдено: N из M" as not passed.
4. F14.4 The end text names the outcome: "Пройдено: N из M. Закрытых проверок: X" while another counted
   check is still open, or "Урок завершён: не пройден. Пройдено: N из M" when every counted check is passed
   or closed (S3). In S3 "Проверить" becomes `aria-disabled` with "Проверки завершены" (R1, nothing to run)
   and "Открыть результаты" stays, on this visit and on every later one.

**Success:** the learner knows which check is closed, that it stays closed, and what comes next. From #37
the closed row offers "Разобрать с ментором" and the hint levels "Скелет" and "Скажи прямо" open (F16, F17;
D3, not shown in v1, R6); in v1 the Задание tab's "Попытки и подсказки" says the same in the course's
words. When no counted check is open any more, the lesson status becomes "Не пройден" in the catalog and on
the dashboard, and the dashboard's next lesson moves on (assumption A9).

**Error states:**
- The limit is unknown (until #68, or not reported for this check): no F14.1, the counter has no "из M",
  and the closed state appears only when the server reports it (R7).
- The last attempt ends in a format error, a runner error or an uncounted timeout: nothing is counted, the
  check stays open and "Осталась 1 попытка" stays.
- The learner fixes the files of a closed check: "Проверить" no longer runs it, so no new message appears;
  the panel keeps the closing message, because a closed check is final (S2).
- The learner resets the working folder or restarts the environment (F11): the check stays closed and the
  counters stay (S2; the reset dialog says "Счётчики попыток не обнулятся."). No control anywhere reopens a
  closed check.
- A passed check never reaches F14: its later failures spend no attempt (S1).

**Empty states:** a check with no limit, or with an unknown limit that the server never reports closed,
never reaches F14; a lesson with no limited check never shows the warning.

**Exit:** F14.4 back to the lesson's other open checks (F13) or out of the lesson (F4); from #37 into F16
or F17.

**Keyboard path:** as F13. In S3 `F6` to "Проверка" lands on the `aria-disabled` "Проверить", whose
description reads "Проверки завершены"; Tab reaches "Открыть результаты". The row is not live: the status
line is the one announcement (R2).

**Time limits:** none. Nothing reopens a closed check: not a reset (F11), not a restart, not time.

## Check kind (hidden in v1)

The row does not show the check kind (Stepan's #50 decision, kept for #69), because in v1 every listed row
is a `command` check and the word would repeat on every row. The label set is registered in `ia.md` (closed
set "check kind") for the release in which a lesson can list a second kind (#36 quiz or #37 rubric), when
the kind starts to tell the learner what a run costs and whether "Проверить" runs it. Showing it then is a
DESIGN task of its own (the row layout and the acceptance checks change). The labels reuse the course's
words: "команда" (task.md "(команда в рабочей папке)"), "квиз", "оценка ментора" (titles "(оценка ментора по
рубрике)"), "скрытая задача" (learning-process §2), "поиск багов" (the same word as the lesson type
`bug-hunt`, because a bug-hunt lesson and a bug-hunt check are one concept and one concept gets one word).
