# Journey: mentor review and hints

Page: lesson, left pane, tab Проверки: the review appears under the check results of the attempt it
reviews, because learning-process §1 puts "check results and the mentor review after submission" on the
left (research open question 9). Sources: learning-process §3 (Socratic review; sees result and
transcript; hint ladder question -> direction -> skeleton -> direct explanation; "подсказка", "скелет",
"скажи прямо"), #37 (rubric grading, Socratic answer, score, budget per call, cost logging), #38
(transcripts), task.md "Попытки и подсказки" (levels "скелет" and "скажи прямо" open after a check is
closed), `learner/profile.md` "Format". Prototypes deferred (D3 in the design file). Nothing of these
flows is shown before #37 ships: no "Разобрать с ментором", no "Попросить подсказку", no review block
(rule R6 in `ia.md`).

## F16: Read the mentor review of an attempt

**Goal:** understand what went wrong in my approach, not only in the result. Source: learning-process §3;
#37; G4, G6.

**Entry:** "Разобрать с ментором" on a failed run (F13.6); automatically after a check closes (F14.3), as
task.md promises "дальше разбор с ментором"; a rubric check, whose grading is the review itself (#37).

**Steps (5):**

1. F16.1 Learner presses "Разобрать с ментором"; the block says "Ментор читает попытку" with elapsed time,
   and the budget "до $N" when #37 provides one.
2. F16.2 Learner reads the review: it opens with a question, then a scenario where things break, then a
   direction (learning-process §3); never a solution.
3. F16.3 For a rubric check, learner sees the score against `passScore` ("Оценка 6 из 10, нужно 7") and the
   rubric criteria the review names.
4. F16.4 Learner answers the mentor's question in a text field, "Ответить", and reads the next reply.
5. F16.5 Learner sees the cost of the review ("Стоимость разбора: $0.04"), the same figure the dashboard
   sums (learning-process §2).

**Success:** the review is saved with the attempt and reachable from the attempt history (F19).

**Error states:**
- Budget exhausted: "Бюджет на разбор исчерпан" and what was produced so far; no retry button, because
  retrying spends more of what ran out. The budget value comes from #37.
- The agent fails or times out: "Ментор не ответил" with "Повторить" and the note that a retry costs
  again.
- API key missing: "Ключ API не задан, разбор недоступен. Добавьте ключ в .env." (#33).
- No transcript attached (#38 not shipped or the agent was not used): the review proceeds on the result
  only, with a muted note "Ментор не видел транскрипт работы с агентом".

**Empty states:** no review requested yet: the attempt shows "Разобрать с ментором" only.

**Exit:** back to work (F9); F17.

**Keyboard path:** the review text is not live while it streams; when it is complete, "Разбор готов" is
inserted into an always-present `role="status"` container (R2) and announced once, and the elapsed time is `role="timer"`, to keep a screen reader quiet.
The reply draft is kept in `sessionStorage` under the attempt id, so a session expiry (F2) does not lose
it; it is cleared after "Ответить" succeeds. The answer field: Enter adds a line, Ctrl+Enter (Cmd+Enter) sends, because answers
can be several lines.

**Time limits:** the agent call has a server-side timeout (#37); the UI shows elapsed time only.
Assumption A12: the review runs on request, plus automatically once a check closes, because every review
costs money (#37).

## F17: Ask the mentor for a hint

**Goal:** get unstuck one level at a time without receiving the answer. Source: learning-process §3 (hint
levels on request); task.md (levels "скелет" and "скажи прямо" only after the check is closed);
`learner/profile.md` "Format"; G4, G7.

**Entry:** "Попросить подсказку" on any check row (F13.6), on the Задание tab's "Попытки и подсказки"
section, or in the review (F16).

**Steps (4):**

1. F17.1 Learner sees the hint ladder for this check: "Вопрос", "Направление", "Скелет", "Скажи прямо",
   with the current level marked and the levels already used listed.
2. F17.2 Learner presses "Следующая подсказка" (one level up) or names a level that is open.
3. F17.3 Learner reads the hint under the ladder; earlier hints stay above it.
4. F17.4 For a check that is not closed, "Скелет" and "Скажи прямо" show a lock and "Откроется, когда
   проверка будет закрыта".

**Success:** the hint at the chosen level is shown and saved with the attempt.

**Error states:** as F16 (budget, agent failure, API key).

**Empty states:** no hint asked yet: the ladder at "Вопрос" with "Попросить подсказку".

**Exit:** back to work (F9).

**Keyboard path:** the ladder is a list of buttons; locked levels follow R1: focusable, `aria-disabled`,
the reason "Откроется, когда проверка будет закрыта" as their description, so the learner hears why.

**Time limits:** as F16.
