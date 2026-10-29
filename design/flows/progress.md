# Journey: progress

Pages: dashboard (F18), lesson, tab Проверки (F19). Progress is not a page of its own (decision A7 in the
design file), because learning-process §4 puts "progress by module, attempt history, mentor remarks and
weak topics" on the dashboard, and the history of one lesson belongs where its next attempt happens.
Sources: learning-process §2 ("the cost of an attempt is shown on the dashboard") and §4; #35 (attempt
history per lesson, lesson and module status, course percentage, weak topics); #28 (attempts,
check_results, mentor_reviews tables); research §1 G5.

## F18: See progress by module

**Goal:** see how far I am in the course, where I stumble and what my attempts cost. Source:
learning-process §4; #35; G5.

**Entry:** the dashboard, below the "Следующий урок" card (F4).

**Steps (4):**

1. F18.1 Learner sees the course line: "Пройдено уроков: 2 из 6", a progress bar, counting `ready` lessons
   only (assumption A9: by lessons, not by check `weight`).
2. F18.2 Learner sees one row per module in course order: title, "2 из 6 уроков", a bar; a module with
   status "Готовится" (`ia.md` set) shows the status and no bar.
3. F18.3 Learner sees recent attempts (lesson, date, "Пройдено" / "Не пройдено", cost) with links to the
   lesson's Проверки tab (F19). Part of #35 (M2); not shown before it ships (rule R6 in `ia.md`).
4. F18.4 Learner sees "Слабые темы" (from mentor reviews, #35) and the total spent on agent checks and
   reviews. Part of #35 (M2); not shown before it ships (R6).

**Success:** the learner knows where they are and where to go back.

**Error states:** progress cannot be read: the section shows "Прогресс недоступен" with "Повторить"; F4
still works (see its error state).

**Empty states:**
- First run (#29 "empty for now"): "Пока нет пройденных уроков", module rows at "0 из N". Recent
  attempts, weak topics and the total cost are not shown in v1 at all (R6), so the first run has no block,
  no placeholder and no "$0" for them; their own first-run states are designed in D4.
- No weak topics yet (D4): "Слабых тем пока нет".

**Exit:** a module row opens its catalog section (F5.2); from D4 an attempt opens F19.

**Keyboard path:** module rows and attempts are links in reading order; progress bars carry the text value
("2 из 6") for screen readers.

**Time limits:** none.

## F19: Review the attempts of a lesson

**Goal:** see what I tried, what the checks said and what the mentor answered. Source: #35 ("attempt
history per lesson"); #38 (transcript attached to the attempt); G5.

**Entry:** the Проверки tab of a lesson, section "История попыток"; an attempt link on the dashboard
(F18.3). The section arrives with #35 (D4) and is not shown in v1 (R6), because #34 saves attempts but no v1
page lists them; the empty text below, shown before the first run, is then the Проверки tab's own empty state
(F13).

**Steps (3):**

1. F19.1 Learner sees attempts newest first: number, date and time, one status per check, cost.
2. F19.2 Learner opens an attempt: each check's grader message, the mentor review and hints of that
   attempt (F16, F17).
3. F19.3 Learner closes it and returns to the current attempt.

**Success:** the learner finds the earlier review and messages.

**Error states:** history cannot be read: "История попыток недоступна" with "Повторить"; the current run
(F13) is unaffected.

**Empty states:** "Попыток пока нет. Нажмите "Проверить", когда будете готовы."

**Exit:** F19.3.

**Keyboard path:** each attempt is a disclosure button; Enter or Space expands and collapses it.

**Time limits:** none.
