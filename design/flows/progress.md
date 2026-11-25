# Journey: progress

Pages: dashboard (F18), lesson, tab Проверки (F19). Progress is not a page of its own (decision A7 in the
#50 design notes), because learning-process §4 puts "progress by module, attempt history, mentor remarks and
weak topics" on the dashboard, and the history of one lesson belongs where its next attempt happens.
Sources: learning-process §2 ("the cost of an attempt is shown on the dashboard") and §4; #35 (attempt
history per lesson, lesson and module status, course percentage, weak topics); #28 (attempts,
check_results, mentor_reviews tables, `packages/db/src/schema.ts:183-287`); research §1 G5; the #72
research (`plans/72-progress-prototypes-research.md`, a working note like the #50 ones) and Stepan's
decisions for #72 (O1 weak checks, O3 cost with #37, O4 cost rule in ADR-0007, O9 mentor remarks
deferred), cited as "Stepan, #72 architect brief". Decisions A72-n, each with its reason, are in
"Decisions (#72)" at the end of this file.

Built on #69 (the check panel, not yet on `main` when #72 was designed): the check status words ("Сбой
проверки, попытка не засчитана", "Время вышло, попытка не засчитана"), "Стоимость попытки: $N", the money
format, the token rule and S1 (a passed check stays "Пройдено") are #69's (`checks.md`, `ia.md` after #69
merges). Where `main` still has the #50 words, #69's replace them.

Words (`ia.md` vocabulary, the two rows "attempt" of #69, the first widened at the merge with #70): in
these flows **attempt** with no limit or counting word names an attempt record (ADR-0007 item 5, the
`attempts` row, `schema.ts:183-217`): the record of one run or, from #36, of one answered quiz send, a
**quiz attempt record**, which is never a run (A72-17); one check's result in it is a **check result**
(`check_results`, `schema.ts:219-255`). The Russian "попытка"
keeps both of #69's senses. The record: "Последние попытки", "История попыток", "Попыток пока нет", the
number "№ N". One check's result, in every string that counts or qualifies a check's results:
"Неудачных попыток: N" and "Неудачных попыток: N из M" (F18.4), "Стоимость попытки: $N" (F19.2), the
result words "..., попытка не засчитана" (F19.2) and the summary note "Проверок с незасчитанной попыткой:
N" (F19.1). On the dashboard the two senses sit in adjacent sections, "Последние попытки" (records) above
"Где трудно" (whose counter counts one check's results); this is accepted as #69 accepted the same pair on
the Проверки tab (#69 design note §6, residual 21), because each counter sits in a row that names its
check, so "Неудачных попыток: 3" reads as that check's, not as three of the records above. The check
bar's "Пройдено: N из M" counts the lesson's counted checks (`checks.md`, "Check bar status line"); an
attempt row's "Пройдено проверок: N из M" counts that attempt's own results (set "attempt summary" in
`ia.md`), so the two never read as the same number.

Release words: **#35** is the release that ships the recent attempts, "Где трудно" and the attempt history;
**#37** turns on every cost element (Stepan, #72 architect brief, O3: before #37 nothing spends money: no
`ready` lesson has a `hidden-task` check and rubric checks have no runner, research §0 item 4). The whole
class each release shows is listed once, in `ia.md` R6, "Progress by release (#72)".

## F18: See progress by module

**Goal:** see how far I am in each course, where I stumble and what my attempts cost. Source:
learning-process §4; #35; G5.

**Entry:** the dashboard, below the "Следующий урок" card (F4), from #30. Before #30 the dashboard shows no
progress section (`dashboard.md`, "Dashboard by release"; `ia.md` R6, "Before the catalog ships").

From #220: F18.1-F18.2 by `ia.md` "Rules (#218)" row "course block" and A218-6, F18.3-F18.5 by A218-13
and "Rules (#218)" row "dashboard order"; error and focus states: `ia.md` [Error and focus states (#222)](ia.md#errors-222).

**Steps (5):**

1. F18.1 Learner sees the course line: "Пройдено уроков: 2 из 6", a progress bar, counting `ready` lessons
   only (assumption A9: by lessons, not by check `weight`).
2. F18.2 Learner sees one row per module in course order: title, "2 из 6 уроков", a bar; a module with
   status "Готовится" (`ia.md` set) shows the status and no bar.
3. F18.3 From #35, learner sees section "Последние попытки": the `RECENT_ATTEMPTS_SHOWN` (5, A72-1) newest
   attempts (runs and, from #36, quiz attempt records, A72-17) over every `ready` lesson of the course, newest first by `attempts.started_at`
   (`schema.ts:193`). Each row is one link, its accessible name its visible text in DOM order with the
   fields joined by ". " (A72-19): a status icon (`aria-hidden`, A72-8), the lesson title (`course/`), the
   date and time (`attempts.started_at`, format in `ia.md` "Page copy", A72-7), the attempt summary (`ia.md`
   set "attempt summary", A72-6), and from #37 the attempt's cost "Потрачено: $N" (or its variants, A72-12)
   when the attempt holds anything that spends (ADR-0007 item 11). The link opens the lesson's Проверки tab with that attempt open (F19 entry,
   `ia.md` "Attempt deep link"). An attempt of a lesson that is not `ready` in the current tree is not
   listed (A72-3, ADR-0007 item 5 "Dashboard").
4. F18.4 From #35, learner sees section "Где трудно" (Stepan, #72 architect brief, O1: derived from
   checks, no word "темы"): up to `WEAK_CHECKS_SHOWN` (5) checks of `ready` lessons that the platform
   runs (R6), not passed, and either closed or with at least `WEAK_CHECK_MIN_FAILED_COUNT` (2) counted
   failed results (A72-2). Order: by the latest counted failure, newest first (for a closed check, the failure
   that closed it), then by counted failed results, most first; closed checks get no precedence, so a check
   where the learner stumbles now pushes an older one out (A72-2). Each row is one link to the lesson's
   Проверки tab (`?tab=checks`), for a quiz check (from #36) to its Квиз tab (`?tab=quiz`, A72-2), its accessible name its visible text with the fields joined by ". "
   (A72-19): the check title (`lesson.yaml` `title`), the lesson title, and "Закрыта: не пройдено" for a
   closed check or the counter "Неудачных попыток: N" / "Неудачных попыток: N из M" (R7) otherwise (one
   check's results, "Words" above). Data: the per-check fields of the #69 check-state read
   (`failedCount`, `isClosed`, `hasPassed`, `isCounted`, `attemptLimit`, #69 design note §4), read for every
   `ready` lesson, plus the time of the check's latest counted failure (`lastCountedFailureAt`, a new
   field #35 computes from `check_results.created_at`, `schema.ts:233`).
5. F18.5 From #37, learner sees the total "Потрачено на проверки и разборы: $N" (or its variants, A72-12)
   and the note "Расход агента в терминале сюда не входит" (A72-11). The total is summed by ADR-0007 item 11
   (Proposed, #72): every attempt of the user, whatever its lesson's status, check results and mentor
   reviews, USD only, rounded up to the cent once.

**Success:** the learner knows where they are, where they stumble and where to go back.

**Error states:**
- Progress cannot be read (until #220; from #220 `ia.md` [ES3](ia.md#ES3), [ES4](ia.md#ES4),
  [RO6](ia.md#RO6), [RO7](ia.md#RO7)): the section shows "Прогресс недоступен" with "Повторить"; F4 still
  works (see its error state). F18.3-F18.5 come from the same read (A72-4), so none of them is rendered then: no
  second error text, no second "Повторить". The retry and its focus are unchanged (`ia.md` R2, row
  "dashboard progress section", and its retry focus guard: the move happens only while focus is still on
  "Повторить", on `body` or in the section); a retry that loads renders F18.1-F18.5 together.
- Session expired during the read: F2 (the page-level alert), not this error state.

**Empty states:**
- First run (#29 "empty for now"): "Пока нет пройденных уроков", module rows at "0 из N". Before #35 the
  F18.3-F18.5 sections are not rendered at all (R6): no heading, no placeholder, no "$0". From #35:
  section "Последние попытки" with the text "Попыток пока нет", section "Где трудно" with "Пока нет
  проверок, которые не удаются". From #37 also the total "Потрачено на проверки и разборы: $0.00" and its
  note, because from #37 the total is a true figure, not a placeholder (A72-13).
- Attempts exist, but none of a `ready` lesson (every attempted lesson left its course or is no longer
  `ready`): "Последние попытки" shows "Попыток пока нет"; the total (#37) still counts their cost (A72-3).
- No check qualifies for "Где трудно" (nothing failed twice, nothing closed, or every such check passed
  later): "Пока нет проверок, которые не удаются".
- No `ready` lesson, course error, before #30: no progress section at all (`dashboard.md`); until #220
  (from #220: `ia.md` "Rules (#218)" rows "course block", "dashboard order", "root error";
  [ES1](ia.md#ES1)).

**Loading** (until #220; from #220 `ia.md` "Rules (#218)" row "loading"): the Skeleton of the progress
section (`dashboard/acceptance.md`, `#state-loading`) covers F18.3-F18.5 too (`aria-hidden`), because they come from the same read (A72-4).

**Exit:** a module row opens its catalog section (F5.2); from #35 a "Последние попытки" row opens F19 with
that attempt open, and a "Где трудно" row opens the lesson's Проверки tab, where the check rows of F13 show
the check's latest result (`checks.md` "Check row fields"), or for a quiz check the Квиз tab (A72-2).

**Keyboard path:** after the Card's button (and "Повторить" when shown) Tab reaches, in reading order, the
module rows, then from #35 the "Последние попытки" rows, then the "Где трудно" rows; each row is one link,
Enter opens it. The total (F18.5) holds nothing focusable. `F6` to `main` still lands on the Card's
button (R3, unchanged). Progress bars carry the text value ("2 из 6") for screen readers. Each list
section (F18.3, F18.4) is a `section` labelled by its h2; each list is a `ul` labelled by the same h2
(`aria-labelledby`), so a screen reader announces "Последние попытки, список, 5 элементов". The total
(F18.5) is a `section` with no accessible name, so it is no `region` landmark: its h2 is a figure
("Потрачено на проверки и разборы: $1.24"), and a landmark named by a figure is noise in the landmark
list, while heading navigation still reaches the h2 (as the F19 section). In an empty state the section
holds its empty text in place of the `ul` (no empty named list is rendered). Until #220 (from #220 `ia.md`
[RR1](ia.md#RR1), [AN1](ia.md#AN1), [FB3](ia.md#FB3), [FB4](ia.md#FB4)): nothing in F18 is live, and
nothing needs to be: F18.3-F18.5 render with the page and are never re-read in the background, so after
load they change only through the progress section's "Повторить", which moves focus to what it shows
(`ia.md` R2, row "dashboard progress section", under its retry focus guard). The rows show the state of the read; an attempt still
`running` reads "Идёт проверка" with the `running` ring held still until the next load (A72-8, A72-9).

**Time limits:** none.

## F19: Review the attempts of a lesson

**Goal:** see what I tried, what the checks said and what the mentor answered. Source: #35 ("attempt
history per lesson"); #38 (transcript attached to the attempt); G5; #69 (the check rows show only the
latest result, "the earlier message returns with the attempt history", #69 design note §6 residual 19).

**Entry:** from #35, the Проверки tab of a lesson, section "История попыток", below #69's check list
(`checks.md`); or a "Последние попытки" row on the dashboard (F18.3), which opens
`/courses/<courseId>/lessons/<lessonId>?tab=checks&attempt=<attemptId>` (`ia.md` "Attempt deep link"):
the Проверки tab is selected and, for a finished attempt with a check result, that attempt's disclosure is
expanded, scrolled into view and focused. Every other arrival (a finished attempt with no check result, a
running attempt, the history read failed, an id that is not an attempt of this lesson and this user, the
check state read failed, the tab not shown, a not-found URL, the course error, an expired session)
and its focus target are stated once, in the table of `ia.md` Navigation model, "Attempt deep link"
(A72-18); in one-pane mode the area shows "Урок" on load in that table's rows 1-6. An `attempt` value never leads to the
not-found page by itself, because the lesson exists. Before #35 the section is not shown (R6); the text
"Попыток пока нет. Нажмите "Проверить", когда будете готовы." is then the Проверки tab's own empty state
(F13, `checks.md` empty states).

**Steps (3):**

1. F19.1 Learner sees the attempts of this lesson newest first, every finished attempt, no paging (A72-5).
   Each row is a disclosure button (Collapsible) whose accessible name is its visible text in DOM order with
   the fields joined by ". " (A72-19): a status icon (`aria-hidden`, A72-8), the number "№ N" (A72-10), the
   date and time (`attempts.started_at`, A72-7), the attempt summary (`ia.md` set "attempt summary", A72-6),
   and from #37 "Потрачено: $N" (or its variants, A72-12) when the attempt holds anything that spends
   (ADR-0007 item 11), for example "№ 3. 4 ноября, 14:05. Пройдено проверок: 1 из 2. Проверок с
   незасчитанной попыткой: 1".
   An attempt with no check result (ADR-0007 `error` with no result: Consequences, the service stream "ends
   without a final result", or the startup sweep) is a plain list item, not a disclosure, because it has
   nothing to open (A72-14): the same fields in the same order and with the same ". " joins in its text, its
   summary "Сбой проверки, попытка не засчитана" with the `warning` icon (A72-8), and `tabindex="-1"` so that
   a deep link can focus it; it is not in the Tab order, because it does nothing. The `li` has no
   accessible name while it is not focused; while it has focus Chromium computes one from its contents
   (A72-19), and whether a screen reader reads it then is a runtime check (lesson acceptance, runtime
   check 2).
2. F19.2 Learner opens an attempt. Its panel lists that attempt's check results, one item per result, in
   `lesson.yaml` order, then results whose check is no longer in the lesson (A72-15). Each item, in order:
   - the check title (`lesson.yaml` `title`), or for a check no longer in the lesson its id
     (`check_results.check_id`, `schema.ts:223`, in `code`) and the note "Этой проверки больше нет в
     уроке";
   - the status icon and word of that result, from `ia.md` "check status", only the result words:
     "Пройдено", "Не пройдено", "Не пройдено: исчерпан бюджет $N" (from #39), "Время вышло", "Время вышло,
     попытка не засчитана", "Ошибка формата, попытка не засчитана", "Сбой проверки, попытка не засчитана";
     the word is that result's own, never the sticky "Пройдено" of the check row (S1), because the history
     says what happened in that attempt; the icon follows #69's token rule (`checks.md` "Status of one
     check"). A result recorded after its check's first pass (a re-run of a passed `command` check, S1)
     also shows its own word, for example "Не пройдено", although it spent no attempt (`checks.md`
     "Check row fields", counter): no word of #69 says "not counted, because already passed", and the counting has no
     consequence there, because a passed check is never warned or closed (S1, S2, R7); the check row above
     says "Пройдено" and, while that result is the latest, "Проверка уже засчитана. ..." (`checks.md`
     "Open panel by status word");
   - the grader message of that result, verbatim (`pre`, `check_results.details`, `schema.ts:228-229`, no
     grader secrets, ADR-0007 item 5), when it has one; for a quiz result (from #36) "Верно C из Q." in
     its place, never `details` (A72-17);
   - "Подробности" (a Collapsible) with the raw error, when the result is a runner error and the server
     stored one;
   - from #37 / #39, "Стоимость попытки: $N" (`ia.md` "check row note", #69), the cost of that result, when
     it spends (ADR-0007 item 11);
   - from #37, the mentor review of that check (`mentor_reviews.check_id`, `schema.ts:262-263`) as D3
     designs the review block (`mentor.md` F16); a whole-attempt review (`check_id` null) after the last
     result. For a quiz result the same rule: a review asked for by "Разобрать с ментором" in the closed
     quiz block (F15.6) belongs to the quiz attempt record of the closing send (a requirement on #37,
     A72-17), so it shows in that record's panel after "Верно C из Q.". Hints: A72-16.

   The words and "Подробности" of an old result need its flags and raw error stored with that result, not
   only with the latest one: #34 stores `isCounted`, `isFormatError`, `isBudgetExhausted` and the runner
   error's raw text on every `check_results` row (Stepan, #72 architect review). The panel's list has no
   accessible name of its own: it directly follows the expanded button that names the attempt.
3. F19.3 Learner collapses it with the same button (focus stays on the button) and goes on with the check
   rows above, which show the current state of each check (F13), or with "Проверить".

**Success:** the learner finds what each earlier attempt's checks said (from #35) and, from #37, the
mentor review of that attempt.

**Error states:**
- History cannot be read (the check state read succeeded): the section heading reads "История попыток
  недоступна" (h3, `tabindex="-1"`) with "Повторить"; the check rows, the check bar and the run (F13) are
  unaffected. "Повторить" re-reads the history only: loads -> focus to the heading "История попыток"; fails
  again -> focus to the heading "История попыток недоступна" (`ia.md` R2, row "lesson attempt history"),
  each only while focus is still on "Повторить", on `body` or in the history section (R2, retry focus guard).
  Arriving by a deep link in this state moves focus to that error heading once, on load, whatever the
  `attempt` value, because the page cannot show any attempt and the learner asked for one (`ia.md`
  "Attempt deep link").
- The check state cannot be read: the history is read only after the check state, in the same server
  read (A72-9), so F19 renders nothing (no heading, no error text of its own) and `attempt` has no effect.
  What the Проверки tab shows then is #69's state; #69's flows do not define it, so it is recorded as
  question Q1 for #69 (`ia.md` FU13), and F19 adds nothing until #69 answers.
- A re-read that a new attempt record starts (a run's end; from #36 an answered quiz send or a visibility
  re-read that finds a record this page has not shown, sent in another browser tab or by this page's own
  send that timed out and the server recorded; Loading below) fails: the list stays as
  it was, so nothing changes on screen and nothing is announced, and the next page load or new record
  reads again (A72-9), because an error replacing a
  list the learner may be reading would be a background change that removes the focused row (`ia.md` R2),
  and the new attempt's results are already in the check rows above. When the history was empty (the first
  run, the first answered quiz send, or the first record found by a visibility re-read), it shows this error state instead, because an empty history has no row the learner could lose, and
  keeping "Попыток пока нет" would deny the attempt just made: the h3 element stays and its text becomes
  "История попыток недоступна", so focus on it (deep link row 3) stays there; "Повторить" follows it.
  This is the one change in F19 that is announced: the history status container (`role="status"`,
  visually hidden, inside the section, `ia.md` R2) receives "История попыток недоступна" at that moment,
  because an error that appears without a focus move is a status message (WCAG 4.1.3) and the text change
  of a heading, focused or not, is not reliably read. It is written only while the Проверки tab panel is
  shown (in one-pane mode, area "Урок"); otherwise nothing is written, and the learner meets the error
  heading on opening the tab. It happens at most once per page view, because every history read that starts
  after the page learned of a new record holds that record, so no later read finds the history empty (a "Повторить" read that
  started before it is followed by one more read, below). The check bar has announced the run's end in its
  own container (an answered quiz send is announced by the result block's focus or, when the answer
  arrived while the learner was away, by the quiz notice, `quiz.md` P9; a quiz sent in another browser
  tab is announced in that tab, B27, and this page's own timed-out send the server recorded is announced
  by the retry, whose recorded result carries the quiz outcome and, when that send changed the lesson status, the
  lesson line, unless a run end or re-read since "Отправить ответы" was pressed already showed it as summary 5 or 6,
  `quiz.md` "Lesson outcome after a send" ("Send window") and F15 Error states; a send answered during a run is said again by the run's end
  text, the accepted double of `quiz.md` "Check bar after a quiz send" row "1, 2 or 3"), so the containers say different things, once each; the history
  container's text is set no sooner than `CHECK_STATUS_TEXT_GAP_MS` after the check bar's end text is set,
  or after the quiz notice text when one was set (a learner who saw the result block and then opened
  Проверки before the re-read failed has no notice, and the gap then waits for nothing; `checks.md` "Live
  regions", text gap), and after that text when it still waits for its own gap, because two polite updates
  in one rendered frame can reach a screen reader as the second only, and the lost one would be the run's
  or the quiz's outcome. The container is emptied, silently, when "Повторить" loads the history; until then a screen reader in browse mode meets the text twice (container, then h3),
  accepted, because emptying it on a timer could cut the announcement short.
- In the error state (on load, after a failed "Повторить" or after the case above) a new record (a run's
  end, an answered quiz send, a visibility re-read that finds one) does not re-read the history, and the history part of a visibility
  re-read is ignored; "Повторить" is the way back, because a background load would remove "Повторить",
  possibly under the learner's focus, and the run's results are in the check rows above.
- A run ends (or from #36 a quiz send is answered, or a visibility re-read finds a new record) while a
  "Повторить" request is pending: when that request returns with the history, the history
  is re-read once more in the background (as Loading below), because the request may have read the history
  before the attempt was finished; when it fails, the error state stays (the rule above). That second read is
  "the history re-read after that run's end" of Empty states, so an empty list it replaces shows "Попыток
  пока нет" alone until it returns, never the first form; if it fails while the history is empty, the case
  above applies (error state, the history status container written once). So F19 never settles on "Попыток
  пока нет" while a finished attempt record exists that this page has learned of (its own run or send, an
  attached run, or a record a visibility re-read found). Focus: "Повторить" moves it to the h3 "История попыток" (R2, under its retry focus guard),
  and the second read keeps that element, as every re-read does.
- Session expired: F2 (the page-level alert, `?tab=checks&attempt=...` kept in `next`).
- The lesson page whose course cannot be read: no Проверки tab, no history (F7 error states).

**Empty states:**
- No finished attempt and no run of this lesson known to be going: the heading "История попыток" and
  "Попыток пока нет. Нажмите "Проверить", когда будете готовы." (#69's text, which #69 defines for "before
  any run"; it stays the same before and from #35, only its place under the heading is new).
- No finished attempt while the first run is going or its result is not yet received ("Проверить" is
  `aria-disabled` with "Дождитесь окончания проверки" or "Результат проверки ещё не получен", `ia.md` R1):
  the heading "История попыток" and "Попыток пока нет" alone, because the learner has already pressed
  "Проверить" and that attempt is in the check rows above, so "Нажмите "Проверить"" would ask for a press
  that has happened. The second form starts when "Проверить" becomes `aria-disabled` for a run (either
  reason above) and stays until the history re-read after that run's end returns, not until "Проверить" is
  enabled again, so the first form never flashes between the run's end and the re-read. A re-read that
  returns replaces the text with the list holding that attempt; one that fails shows the error state (Error
  states above). Neither text change in this paragraph is announced, and focus stays where it is: the
  start of the run that shortens the text is announced by the check bar ("Идёт проверка"), and the
  shorter text adds nothing to it; a re-read that returns adds the attempt whose end the check bar has
  announced; the failure is announced as Error states say. While
  "Проверить" is `aria-disabled` for an environment reason ("Окружение запускается, проверка станет
  доступна после запуска", "Сначала запустите окружение", `ia.md` R1), the first form stays, because no
  run has been made: "когда будете готовы" points to a later press, and the reason under the button says
  what comes first. A start the service refuses (no attempt record, "Проверить" stays enabled, `checks.md`
  F13 error states) also keeps the first form. On a lesson whose check bar has no "Проверить" (a
  quiz-only lesson, from #36, not drawn) the empty history always shows the second form, because the long text
  names a button that is not there (A72-17, Q3). A quiz send on a lesson with "Проверить" keeps the first form until its answer,
  because the long text still offers a press that has not happened, and the re-read after the answer
  replaces it with the list (A72-17). The second form is the text a deep link lands next to in
  row 3 of `ia.md` "Attempt deep link" when the history is empty. Before #35 the Проверки tab's own empty
  state during the first run is #69's (`ia.md` FU13, Q5).

**Loading:** none of its own: the history is read on the server together with the check state when the
page loads (A72-9), as the check rows are; the lesson page draws no loading skeleton
(`lesson/acceptance.md`). **History baseline.** The run baseline of `checks.md` ("Baseline of a re-read",
`latestFinishedAttempt.attemptId`) names runs only, so it cannot tell the history that a quiz attempt
record was added; the history keeps its own: the id of the newest finished attempt record of any kind this
page has read (`latestAttemptRecordId`, run or quiz attempt record, null when there is none), which the
check-state read serves from #35 (a requirement on #35, A72-17), set on load and by every history read that
returns. When the page learns of a record it has not read, the history is re-read in the background (not in
the error state; once more after a "Повторить" that was pending then returns, Error states) and the new
record is inserted in its place by `attempts.started_at` (A72-10): at the top, except a run that ends after
a quiz attempt record sent while it was going, which goes below that record; the rows already shown keep
their expanded state and focus. "Learns of a record" is:
- a run ended: every case in which #69 replaces the run baseline: the end of its own or an attached run
  (B19), a reconnect that finds the run ended (B14, B17), and a visibility re-read that finds a newer
  finished run (B9, B10);
- from #36 an answered quiz send (failed, passed, closed, or refused, because a refusal means another
  browser tab sent one): the history is read in the same server read as the check states the send
  re-reads (A72-17); a send error re-reads nothing;
- from #36 a visibility re-read (B8-B11, B27) whose `latestAttemptRecordId` differs from the history
  baseline: a quiz send this page has not shown (B27: sent in another browser tab, or this page's own send
  that timed out and the server recorded) is such a record, which the run baseline does not see.
  Every visibility re-read reads the history in the same server read as the check states, so the quiz check
  row and the new history row change in one render, as after a send (A72-17); in the error state the
  history part of that read is ignored and "Повторить" stays (Error states).
A visibility re-read whose `latestAttemptRecordId` equals the history baseline leaves the history as it is,
because no record was added.

**Exit:** F19.3; "Проверить" (F13); another tab.

**Keyboard path:** the history is inside the Проверки tab panel of region "Урок"; the `F6` cycle is
unchanged (R3). From the last check row (or its open panel) Tab reaches the history's disclosure buttons in
order, newest first; Enter or Space expands and collapses one, focus stays on it; inside an open panel Tab
reaches each "Подробности" disclosure, then the next
attempt's button; Shift+Tab goes back. A plain item (no check result) is skipped by Tab. In the error
state Tab reaches "Повторить". A deep link moves focus once, on load, to the target its table row names
(`ia.md` "Attempt deep link"). The section is a `section` with no accessible name, so it is no `region`
landmark: inside region "Урок" a named landmark would be listed next to the `F6` stops without being one
(R3), and heading navigation reaches the h3. The attempt list is a `ul` labelled by the h3; in the empty
state the text stands in place of the `ul`, so no empty named list is rendered. F19 holds one live
container, the visually hidden history status container (`role="status"`, R2), present and empty whenever
the section is rendered and written in one case only (Error states, a failed re-read of an empty history).
Every other change in F19 is not announced: the end of a run is announced by the check bar alone
(`checks.md` "Live regions"), a new row records that same run, and the empty-text change follows the
run's start, which the check bar announces. From #36 a new quiz attempt record row, and an empty text the
row replaces, follow a quiz send whose outcome the result block's focus or the quiz notice has announced
(`quiz.md` P9), or a send this page has not shown (`checks.md` B27): one in another browser tab, announced
there, or this page's own timed-out send the server recorded, announced by the retry, whose recorded result
carries the quiz outcome and, when that send changed the lesson status, the lesson line, unless a run end or
re-read since "Отправить ответы" was pressed already showed it as summary 5 or 6 (`quiz.md` "Lesson outcome
after a send", "Send window", and F15 Error states).

**Time limits:** none.

## Not designed in #72

- **Mentor remarks on the dashboard** (learning-process §4 "mentor remarks"): not designed here (Stepan,
  #72 architect brief, O9); follow-up issue #102.
- The transcript of an attempt in the browser (#38): no flow shows it.
- A page listing all attempts across lessons: none (A7); the history of one lesson is F19.
- Showing the check kind in history rows: the same deferral as the check rows (`checks.md` "Check kind").
- Focusing the check row on arrival from a "Где трудно" row: that row opens `?tab=checks` (a quiz check's
  row `?tab=quiz`, A72-2) and moves no focus, as any load of the tab. A `?check=` parameter would need its own fallback set (unknown id,
  removed check, check not shown); left for the author phase to propose (`ia.md` FU13).
- Open questions handed to other tasks: Q1 for #69 (what the Проверки tab shows when the check state
  cannot be read), Q4 for #69 and #39 (the word of a budget-spent result reported as not counted, A72-6),
  Q5 for #69 (the Проверки tab's own empty text during the first run before #35, answered by #70 for a
  lesson with a quiz check), `ia.md` FU13. Q2 and Q3, handed to #70, are decided in A72-17, because #70
  merged without them.

## Decisions (#72)

Each decision takes nothing away from what Stepan has today: the shipped dashboard renders constants and no
cost (`apps/web/app/(app)/page.tsx:19-21`), and the app has no Проверки tab yet
(`apps/web/components/lesson/lesson-panels.ts:21-23`).

- **A72-1. Five recent attempts, no "Все попытки".** `RECENT_ATTEMPTS_SHOWN = 5`, because the dashboard is
  read "in one look" (F4 goal) and `gh run list` shows 10 runs on a page that does only that (#72 research
  §5); every attempt of a lesson is one click away in F19. No "Все попытки" link, because it would need a
  progress page that A7 rules out.
- **A72-2. "Где трудно" lists checks, not topics.** Source: Stepan, #72 architect brief, O1. A check is
  listed when the platform runs it (R6), not passed, and closed or with `WEAK_CHECK_MIN_FAILED_COUNT = 2` counted
  failed results, because one failure is the ordinary first try and two mean the first fix did not work
  either; a check passed later drops out, because the section shows where the learner stumbles, and a
  passed check is no longer such a place. Up to `WEAK_CHECKS_SHOWN = 5`, as A72-1, newest struggle first:
  ordered by the latest counted failure (for a closed check, the failure that closed it), then by the
  number of counted failures. Closed checks get no precedence, because a closed check is final (S2):
  ranked first, five closed checks would fill the section for good and no new struggle could appear in it.
  With this order the end states are: while the learner keeps failing somewhere, the newest struggles push
  the older ones out, closed or not; once nothing new fails, the section keeps the last five places where
  the learner stumbled, which is still true; when more than five checks qualify, only the five newest show,
  with no "more" link, as A72-1. A closed row is kept (Stepan, O1: derived from failed and closed checks), because a
  limit spent is where the learner stumbled most; on arrival (`?tab=checks`) its check row reads
  "Закрыта: не пройдено" and its panel holds the closed note and the last grader message (`checks.md`
  "Open panel by status word"), which is what the learner can reread in #35; from #37 the same panel also
  holds what `ia.md` A71-1 and A71-6 give a closed check (F16, F17). From #36 a quiz check
  qualifies by the same rule, and its row links the Квиз tab (`?tab=quiz`), not Проверки, because there
  its Проверки row would show nothing the "Где трудно" row has not said: the panel holds the counter only,
  no closed note and no grader message (`quiz.md`, "Quiz check row in Проверки"), while the Квиз panel holds
  what the learner can do about that check: the questions with "Попытка A из M" while it is open, the
  quiz review with explanations once closed (F15.5), and from #37 "Разобрать с ментором" (F15.6). The arrival
  follows `ia.md` "Deep links" (`?tab=quiz`, no focus move on load; a quiz check gone from the lesson
  falls back to Теория). The link target is the one difference from the other rows; the row's name and
  fields are the same (A72-19). The heading "Где трудно" names the learner's experience and
  claims no topic; the empty text "Пока нет проверок, которые не удаются" is true on the first run too.
- **A72-3. Attempts of lessons that are not `ready`: not listed, but paid for.** "Последние попытки" lists
  only attempts of `ready` lessons in the current tree, because a row must open F19 and such a lesson has
  no route (it is not-found, `ia.md` inventory), and ADR-0007 item 5 "Dashboard" ignores such rows. The total
  (F18.5) still counts them (ADR-0007 item 11), because that money was spent.
- **A72-4. One dashboard read.** F18.1-F18.5 come from one read with one loading and one error state (from
  #220: `ia.md` [ES3](ia.md#ES3)),
  because they read the same tables and a second error text and "Повторить" in one section would make the
  learner retry twice.
- **A72-5. F19 shows every finished attempt, no paging.** Collapsed rows are one line each, the read is
  served by `attempts_lesson_started_idx` (`schema.ts:203`), and a lesson collects tens of attempts, not
  thousands; paging would add an action, its error state and a focus rule. Revisit if a lesson's history
  passes 100 attempts.
- **A72-6. The attempt summary counts that attempt's results.** "Пройдено проверок: N из M", not
  "Пройдено", because an attempt covers a subset of the checks (ADR-0007 item 5 "Attempt scope") and a bare
  "Пройдено" would read as the lesson passed; not the check bar's "Пройдено: N из M", which counts the
  lesson. A running attempt (dashboard only, A72-9) reads "Идёт проверка", #69's word for a run going
  (check bar summary 1), because a running attempt record is a run ("Words" above), not one check; a
  quiz attempt record is never running (A72-17). An attempt
  with no result, or whose every result is a runner error, reads as the check bar's summary 4, "Сбой
  проверки, попытка не засчитана". Otherwise the summary is "Пройдено проверок: N из M" with at most one
  note, "Проверок с незасчитанной попыткой: N" (its N is the count K below), shown when K is at least 1.
  **The summary says what the panel words say, and nothing else.** M counts the panel's items, N the items
  whose word is "Пройдено", and K exactly the items whose word contains "попытка не засчитана", which is
  #69's own set for those words ("..., попытка не засчитана says a result does not count", `checks.md`
  "Words"): "Время вышло, попытка не засчитана", "Ошибка формата, попытка не засчитана" and "Сбой проверки,
  попытка не засчитана". No other note is given, so #69's "Проверок со сбоем: N" is not used on an attempt
  row: a runner error is one of the K results, and its own panel word says which kind it was. A result
  whose word does not say "попытка не засчитана" is counted in M and not in N or K, whatever the server's
  counting flag, because the row must not say of a result something its panel word does not. Two kinds
  meet this rule while not counting toward a limit (a timeout after the check's first pass is not one of
  them: #69's counter never counts a result after the first pass, `checks.md` "Check row fields", counter,
  and gives "Время вышло" alone only to a counted timeout, `checks.md` "Status of one check", so its word is "Время
  вышло, попытка не засчитана" and it enters K):
  - a failure after the check's first pass (S1), which shows the word its kind gives (F19.2), for example
    "Не пройдено": its counting changes nothing for the learner, because a passed check is never warned or
    closed (S1, S2, R7), so the row does not need to tell it apart;
  - a budget-spent result the server reports as not counted (from #39): #69 gives it the word "Не пройдено:
    исчерпан бюджет $N" "as the server reports" and no wording of its own for "not counted" (`checks.md`
    "Status of one check", the paragraph after the token rule, and #69's design note residuals). Until #69
    or #39 names one (`ia.md` FU13, Q4) it is left out of K by this rule; if the word it gets contains
    "попытка не засчитана", it enters K with no change here.
  So the summary tells a result that did not pass and whose word says it did not count from one whose word
  does not, exactly as its panel does; whether a failure counted toward a limit is read where the limit is
  shown, in the check row's counter "Неудачных попыток: N" (#69, R7). The words "засчитана" and "попытка"
  are #69's ("..., попытка не засчитана", one check's result, "Words" above); "Проверок ... засчитано" is
  avoided, because #69's "Проверка уже засчитана" means a check counted as passed. The set: "attempt
  summary" in `ia.md`; the icon: A72-8. Every result kind #69 defines, and how it enters:

  | Result (panel word, #69) | #69 icon | Counts toward a limit (#69) | Enters | Row icon of a one-result attempt |
  |--------------------------|----------|-----------------------------|--------|----------------------------------|
  | passed, "Пройдено" | `success` | - (a pass) | M, N | `success` |
  | failed, "Не пройдено" | `destructive` | yes | M | `destructive` |
  | failed after the check's first pass (S1), "Не пройдено" | `destructive` | no (`checks.md` "Check row fields", counter) | M | `destructive` |
  | format error not tagged by the server, "Не пройдено" (a #34 requirement, not a design state) | `destructive` | yes | M | `destructive` |
  | timeout counted, "Время вышло" | `warning` | yes | M | `destructive` (the one difference, below) |
  | timeout not counted, "Время вышло, попытка не засчитана" | `warning` | no | M, K | `warning` |
  | timeout after the check's first pass (S1), "Время вышло, попытка не засчитана" (#69's counter never counts it) | `warning` | no | M, K | `warning` |
  | format error, "Ошибка формата, попытка не засчитана" | `warning` | no | M, K | `warning` |
  | runner error, "Сбой проверки, попытка не засчитана" | `warning` | no | M, K; all results of this kind: summary 4 | `warning` |
  | budget spent, counted, "Не пройдено: исчерпан бюджет $N" (from #39) | `destructive` | yes | M | `destructive` |
  | budget spent, reported not counted, the same word until Q4 (from #39) | `destructive` | no | M (K once its word says "попытка не засчитана") | `destructive` |
  | any of the above for a check no longer in the lesson (A72-15) | as its word | as its word | as its word | as its word |
  | a quiz result, passed, "Пройдено" (from #36, A72-17) | `success` | - (a pass) | M, N | `success` |
  | a quiz result, failed, "Не пройдено" (from #36, also the failure that closes the quiz; no failure after a pass, P5 of `quiz.md`) | `destructive` | yes | M | `destructive` |
  | "Не запускалась", "В очереди", "Идёт", "Закрыта: не пройдено" | - | - | never: check states, not results; a finished attempt holds results only (ADR-0007 item 5 "Attempt scope", one result per included check) and a closed check is never in a run (S2) | - |
  | no result at all (A72-14) | - | - | summary 4 | `warning` |
  | the attempt still running (dashboard only) | - | - | "Идёт проверка" | the motionless `running` ring (A72-8) |

  A budget-spent result after a pass does not occur, because a passed check that spends tokens is not run
  again (S11).
- **A72-7. Dates in the learner's local time.** Formatted in the browser's time zone, `<time datetime>`
  with the ISO value, because the web container sets no `TZ` (`docker-compose.yml`) and a UTC time would be
  hours off for the one learner; the year shows only when it is not the current one.
- **A72-8. The row icon repeats the row's words.** Each summary form maps to exactly one `.status-icon`
  `data-status` value, chosen from the words alone, so the icon (`aria-hidden`) never says something a
  screen reader user does not hear:
  - "Идёт проверка" (dashboard only) -> the **motionless form of `running`**: the same ring (`info`
    colour, 2px, open on one side) with no animation in any motion setting. #69 draws this word with that
    ring spinning: the Проверки tab's visually hidden ", идёт проверка" sits next to
    `.status-icon[data-status="running"]` (`design/pages/lesson/prototype.html`, inside `#tab-checks`,
    #69's "running badge", `checks.md` "Live regions"), and the check bar's "Идёт проверка" (the
    `template[data-live-source="check-status"]` of the running states, shown in
    `.check-bar-status [data-live-key="check-status"]`) next to `.check-bar-status .spinner` ("the
    spinner", `checks.md` F13 error states: a ring of the same shape, smaller and in the text colour); the
    per-check "Идёт" gets `running` as well (`checks.md` "Status of one check": "`info`, spinning ring"). There the ring is live and stops with the run. The dashboard row is a snapshot never
    updated until the next load (A72-9), so a spinning ring would spin after the run ended, with no pause
    control (WCAG 2.2.2); the dashboard keeps #69's ring for #69's run word and drops only the motion. Under
    reduced motion #69's live ring turns dotted (`proto.css` "Reduced motion"), while the motionless form
    keeps its open side, because it does not move and the rule has nothing to stop. Not `queued` (dashed
    ring) or `muted` (dotted ring), because they pair with "В очереди" and "Не запускалась". The value is
    declared for the author phase (design note §5: `proto.css`, `design/system/README.md` "Custom pieces",
    `components.html`; in the app lucide `LoaderCircle`, the `Loader2Icon` of
    `apps/web/components/ui/spinner.tsx`, without the spin class);
  - "Сбой проверки, попытка не засчитана" (no result, or every result a runner error) -> `warning`
    (exclamation mark), #69's icon for the same words on a check result;
  - "Пройдено проверок: M из M" (every result passed, M at least 1) -> `success` (check mark). An attempt
    with no result never reaches this form, so the check mark is never given to an empty attempt;
  - "Пройдено проверок: N из M", N below M, and K below M - N: at least one result did not pass and its
    word does not say "попытка не засчитана" -> `destructive` (cross);
  - "Пройдено проверок: N из M", N below M, and K equal to M - N: every result that did not pass says
    "попытка не засчитана" -> `warning` (exclamation mark).

  This is #69's token rule lifted to a record by the words: the cross is "some result did not pass, and
  its word does not say it went uncounted"; the exclamation mark "something did not pass, and every such
  word says "попытка не засчитана"". With K = M - N every panel item is a check mark or an exclamation
  mark, as on the row. With K below M - N the panel holds at least one item that is not a pass and not
  "..., попытка не засчитана": a cross ("Не пройдено", its budget variant) or a counted "Время вышло",
  which #69 draws with the exclamation mark. So the row and its panel differ in one case only: every such
  item is a counted "Время вышло" (exclamation marks in the panel, a cross on the row). The row follows its
  words there, because the words are those of a counted failure ("Пройдено проверок: 0 из 1", no note),
  and an icon hidden from screen readers must not tell a sighted reader anything the words beside it do
  not. The panel shows each result's own word and icon by #69's rule, so the kind is never lost.
- **A72-9. A running attempt is not in F19, and F19 is not a live view of the run.** The check rows above
  are the live view of a run (#69); a second live view of the same run would be announced twice. When the
  run ends the history is re-read silently and the new row appears in its place by `started_at` (F19
  Loading); a failed re-read keeps the
  list (an empty history shows the error state instead, announced once by the history status container,
  because that error is news the check bar does not give; F19 error states). The dashboard
  shows "Идёт проверка" as of its read, with the motionless `running` ring (A72-8); its link carries the
  attempt id, so a click after the run ended opens that attempt, and a click while it still runs lands on
  the history heading (`ia.md` "Attempt deep link").
- **A72-10. "№ N" numbers every attempt.** Oldest = 1 per user and lesson by `started_at`, runner errors
  and quiz attempt records included, because each record is one action of the learner: a press of
  "Проверить" (or "Запустить"), or from #36 an answered quiz send (GitHub numbers every run, `run_number`,
  research §5); derived, so no schema change. A running run is counted too, so a shown number never
  changes: a quiz sent while a run is going gets the number after that run's, and the history shows the gap
  until the run ends and its row fills it (F19 Loading), because a number that changes under the learner
  would misname the attempt it was read for. "Попытка A" is not used, because it is the quiz's per-check
  string (`quiz.md`, "Попытка A из M" / "Попытка A"): a quiz attempt record has both numbers, and they
  differ (A72-17).
- **A72-11. The total names what it sums, and what it leaves out.** "Потрачено на проверки и разборы",
  with the note "Расход агента в терминале сюда не входит", because the terminal agent uses the same API
  key and the platform records none of it (learning-process §1, research §1.3), so an unlabelled figure would
  read as the Anthropic bill. USD only, no tokens (no token columns, `schema.ts:232, 266`).
- **A72-12. Unknown cost is said, not hidden.** "не меньше $N" when a spending term has no reported cost
  and the known part is above zero, "нет данных" when it is zero (ADR-0007 item 11), because treating
  unknown as $0 would understate spend. Each figure is the raw sum rounded up once; rounded row costs may
  add up to more than the rounded total, accepted because rounding the total from rounded rows would
  overstate it by up to a cent per attempt, and the dashboard shows only five rows next to it. An attempt
  of free checks only shows no cost at all, because "$0.00" on every `command` run is noise.
- **A72-13. From #37 the total shows "$0.00" before any spend.** Before #37 no cost element exists (O3);
  from #37 the feature works and "$0.00" is a true figure, not a placeholder (R6 "a control appears only
  when the feature behind it works").
- **A72-14. An attempt with no result is not a disclosure.** It reads "Сбой проверки, попытка не
  засчитана" with the `warning` icon as a plain list item, because a button that opens an empty panel does
  nothing (A15). It carries `tabindex="-1"` (not in the Tab order) only so that its deep link has a focus
  target (A72-18).
- **A72-15. Results of removed checks stay in the history.** Shown by their stored id with "Этой проверки
  больше нет в уроке", after the current checks, because `check_results` keeps what was graded
  (`schema.ts:224`) and the title is not stored; hiding them would lose part of what happened.
- **A72-16. Hints in F19.2.** Since #71: `ia.md` A71-11.
- **A72-17. Quiz attempt records are attempt records.** From #36 every answered quiz send is an attempt record with
  one check result, the quiz check's, because ADR-0007 has no other place for it: a `check_results` row
  needs its `attempt_id` (`schema.ts:222`, not null), #36 is one of item 5's writers, and #70 stores the
  sent answers in `check_results.details` (`quiz.md`, "Requirements for #36", item 7). A refused send
  (the quiz changed in another browser tab) writes no record, because it counts nothing (`quiz.md` Error
  states); a send whose answer is lost (the send error) may have been recorded, and its client attempt id
  keeps the retry to that one record (#36). So a
  quiz attempt record appears in F18.3 and F19 under the same rules, numbered "№ N" among the lesson's records
  (A72-10), its summary "Пройдено проверок: 1 из 1" or "Пройдено проверок: 0 из 1" (A72-6 table); before
  #36 there are none. It is a record, not a run: a run never includes the quiz (`checks.md` "Run
  composition"), and the vocabulary keeps the two apart (`ia.md`, row "attempt record (of a run or of a quiz
  send)" names both kinds, row "run" ties the run-only fields to runs). What #36, #34, #35 and #37 must do
  for it is item 11 of `quiz.md` "Requirements for #36", the list #36 is built against. Decided at the
  merge with #70, which left FU13's questions Q2 and Q3 open:
  - **Two numbers stay apart (Q2).** The history row shows "№ N" only and adds no quiz line, and the quiz
    header shows "Попытка A из M" only. They count different things (every record of the lesson; the
    quiz's own sends) and never stand in one panel: "№ N" is in Проверки, "Попытка A" in Квиз, the same
    reason #70 gives for its "Вопрос I из Q" next to the hint level "Вопрос" (`ia.md` vocabulary, "quiz
    question"). Showing both on one row would set two different numbers side by side for one attempt.
  - **What an open quiz result shows (F19.2).** The check title, its result word ("Пройдено" or "Не
    пройдено", never "Закрыта: не пройдено", a check state) and, in place of the grader message, "Верно C
    из Q." from the quiz set (`ia.md`), with C and Q of that attempt, which #36 stores with the result. Not
    `details` verbatim: it holds the selected answers, and from a failed attempt it must not lead to which
    answers were wrong before the quiz is passed or closed (`quiz.md`, "Requirements for #36", item 1); the
    quiz review with verdicts and explanations is the Квиз tab's (F15.5). Not "Нужно K.", because K is the
    quiz's current threshold and an old attempt's line must stay true if the quiz changes; the result word
    already says whether it passed. No "Стоимость попытки" (a quiz result spends nothing: its null
    `cost_usd` is zero, ADR-0007 item 11), so the record shows no "Потрачено: $N" either, unless from #37 a
    mentor review belongs to it (item 11, "Whether an attempt shows a cost at all"; F19.2, the closed
    quiz's "Разобрать с ментором", F15.6, whose review #37 stores with the record of the closing send); no
    "Подробности" (a quiz has no runner error).
  - **The empty text on a lesson without "Проверить" (Q3).** A lesson whose check bar shows "Пройти квиз"
    in place of "Проверить" (a quiz-only lesson, from #36, `checks.md` empty states; none exists, not drawn)
    shows "Попыток пока нет" alone in F19 (F19 empty states), because the long text names a button that
    is not there; no new string is needed.
  - **After a send the history changes with the quiz row.** The check-state re-read that follows an
    answered send (`quiz.md`, "Lesson outcome after a send") reads the history too, as the page load does
    (A72-9), so the quiz check row and the new history row change in one render and the history never says
    "Попыток пока нет" next to a quiz row "Неудачных попыток: 1" (the reason of `quiz.md` "Empty states").
    From #35 F19's empty states own the Проверки empty text, and they agree with `quiz.md` "Empty states":
    with no record, every `command` row reads "Не запускалась" (or a run is going, the short form) and the
    quiz row "Ответы не отправлялись".
  - **Run-only fields exclude it.** `latestFinishedAttempt` and `runningAttemptId` name runs only
    (`checks.md` "Baseline of a re-read"), and #36 writes a quiz attempt record already finished, never
    `running`. So a quiz send, here or in another browser tab, never sets a run's end text, never shows
    "Открыть результаты" through B9 or B10 and never attaches as a running run; the check bar follows P6-P8
    of `quiz.md` (B26, and B27 for a send this page has not shown: in another browser tab, or its own
    timed-out send the server recorded). The "Открыть результаты" that P8 shows is
    Stepan's decision for #70 and stays.
  - **The history sees it through its own baseline.** Because the run baseline does not, F19 keeps the
    history baseline over every record kind (`latestAttemptRecordId`, F19 Loading), and every visibility
    re-read carries the history, so a quiz send this page has not shown (another browser tab, or its own
    timed-out send the server recorded) reaches F19 in the same render as the
    quiz check row, and the history never says "Попыток пока нет" next to a quiz row that shows a send.
  - **Every other reader.** F18.3: listed like any record, its link is row 1 of `ia.md` "Attempt deep
    link" (never rows 2-3: it always holds its one result and is never running), icon `success` or
    `destructive` by A72-8 ("1 из 1", or "0 из 1" with K = 0); "Где трудно": the quiz check qualifies by
    A72-2 from its counted failed results (`failedCount`, `lastCountedFailureAt` from the quiz result's
    `created_at`) and links `?tab=quiz`; F18.5: adds nothing but the reviews #37 attaches to it; R5: a sent
    quiz already starts a lesson (`ia.md` R5, "a check run or a sent quiz").
- **A72-18. A deep link focuses what it asked for.** `?attempt=` moves focus once on load, as a module row
  focuses its catalog section heading (F5.2), because the learner asked for that attempt: to its
  disclosure button, or to its plain item (A72-14); while it still runs, to the heading "История попыток",
  where it will appear (in an empty history the text after it is then "Попыток пока нет" alone, F19 empty
  states, because "Проверить" is disabled by that run); while the history cannot be read, to the error
  heading. An id the dashboard did not emit for this lesson (malformed, unknown, another user's or another
  lesson's) moves no focus, as any load. Every case, and which case wins when two apply: `ia.md` "Attempt
  deep link".
- **A72-19. The fields of a row are joined by ". " in what a screen reader reads.** Between the fields of
  an attempt row (dashboard and history) and of a "Где трудно" row the accessible name of the link or
  button holds ". " (full stop and space); the plain item (A72-14) is an `li` with no `aria-label` or
  `aria-labelledby`; while it has focus, Chromium computes its name from its contents (name source `contents`,
  measured), so the same joins are in its text and in that name; unfocused it has no name. Whether a
  screen reader voices it when the item gets focus stays a runtime check (lesson acceptance, runtime
  check 2). The ". "
  is a visually hidden `.sr-only-inline` span where the layout shows no punctuation, because a number next to a
  date ("№ 3" and "4 ноября") read without a pause sounds like "№ 34 ноября", and ". " is already the joint
  of the summary and its notes. A data field that already ends in sentence punctuation (".", "!", "?", "…"
  or ":"; a title is data, and some `course/` titles are sentences) is followed by " " only, so no ". .",
  "…." or ":." appears. The plain item's reading on focus is a runtime check for the tester (NVDA and
  VoiceOver read its text when a deep link focuses it on load); if one does not, the author phase names
  the item with `aria-labelledby` on its own field spans.
