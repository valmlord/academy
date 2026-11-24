# Journey: mentor review and hints

Page: lesson, left pane, because learning-process §1 puts "check results and the mentor review after
submission" on the left (research open question 9); where each piece stands: `ia.md` A71-1, A71-5, A71-6,
A71-10. Sources: learning-process §3 (Socratic review; sees result and transcript; hint ladder question -> direction -> skeleton -> direct explanation; "подсказка", "скелет",
"скажи прямо"), #37 (rubric grading, Socratic answer, score, budget per call, cost logging), #38
(transcripts), task.md "Попытки и подсказки" (levels "скелет" and "скажи прямо" open after a check is
closed), the learner profile, "Format". Prototypes: #71's author phase. Their own rules: `ia.md` "Mentor
review and hints (#71)", A71-1 to A71-13; release: A71-12.

## F16: Read the mentor review of an attempt

**Goal:** understand what went wrong in my approach, not only in the result. Source: learning-process §3;
#37; task.md "Попытки и подсказки" ("после 5 неудачных интерфейс предложит ментора"); G4, G6.

**Entry:** "Разобрать с ментором" in an open check row panel (F13.6, F14.3) or in the closed quiz block
(F15.6), where `ia.md` A71-1 offers it.

**Steps (4):**

1. F16.1 Learner presses "Разобрать с ментором" (`ia.md` A71-2).
2. F16.2 The review block reads "Ментор читает попытку" with the elapsed time (`ia.md` A71-5, A71-7).
3. F16.3 The review arrives (`ia.md` A71-8): it opens with a question, then a scenario where things break,
   then a direction (learning-process §3); never a solution.
4. F16.4 Learner sees its cost, "Стоимость разбора: $0.04", and the transcript note when it applies
   (`ia.md` A71-5), then goes back to the files.

**Success:** the learner has read the review where `ia.md` A71-5 and A71-10 show it; the next run is the
learner's answer.

**Error states:** the mentor fails or times out, or the budget runs out (`ia.md` A71-5); a run that
includes the check, a call already running, the mentor key missing (`ia.md` A71-7); a press refused in a
tab that has not re-read (`ia.md` A71-8).

**Empty states:** no button, or no review asked yet: `ia.md` A71-1, A71-5.

**Exit:** back to work (F9); F17; "Проверить" (F13).

**Keyboard path:** Tab order in the open panel: `ia.md` A71-5, A71-6; Enter on "Разобрать с ментором"
asks; focus after the press and at the end: `ia.md` A71-5, A71-8. No text field, no key of its own; the
`F6` cycle is unchanged (R3).

**Time limits:** the call's timeout is #37's; the busy display and its time, the run that waits for the
call, leaving the page, a session expiry (F2) and the idle stop with its warning (F10): `ia.md` A71-7.

## F17: Ask the mentor for a hint

**Goal:** get unstuck one level at a time without receiving the answer. Source: learning-process §3 (hint
levels on request); task.md (levels "скелет" and "скажи прямо" only after the check is closed);
the learner profile, "Format"; G4, G7.

**Entry:** "Попросить подсказку" in an open check row panel (F13.6, F14.3), where `ia.md` A71-6 offers it.

**Steps (4):**

1. F17.1 Learner sees the ladder "Подсказки" with the hints already received (`ia.md` A71-6).
2. F17.2 Learner presses "Попросить подсказку", "Следующая подсказка" or a level by name;
   "Ментор готовит подсказку" with the elapsed time (`ia.md` A71-6, A71-7).
3. F17.3 The hint arrives in its level's item (`ia.md` A71-6, A71-8).
4. F17.4 Learner reaches a locked level (`ia.md` A71-6): an `aria-disabled` control with its reason (R1).

**Success:** the hint at the chosen level is shown in the ladder and stored with its result (`ia.md` A71-6,
A71-13 item 2).

**Error states:** the mentor fails or the budget runs out (`ia.md` A71-6); a run that includes the check,
a call already running, the mentor key missing (`ia.md` A71-7); a press refused in a tab that has not
re-read (`ia.md` A71-8).

**Empty states:** no ladder, or nothing received yet: `ia.md` A71-6.

**Exit:** back to work (F9); F16; "Проверить" (F13).

**Keyboard path:** Tab reaches the ladder's controls in DOM order, locked ones included (R1); Enter asks;
focus after the press and at the end: `ia.md` A71-6, A71-8. The `F6` cycle is unchanged (R3).

**Time limits:** the call's timeout is #37's; the busy display and its time, the run that waits for the
call, leaving the page, a session expiry (F2) and the idle stop with its warning (F10): `ia.md` A71-7.

## Not designed in #71

- #37/#68: whether "Разобрать с ментором" waits for `attempts.mentorAfter` where a check has it
  (`ia.md` A71-1).
- #37: what each kind of refused press says and where focus goes (`ia.md` A71-8).
- #37/#35: whether a hint's cost joins the attempt cost and the total cost (`ia.md` vocabulary, A71-2).
- #37: how a hint is stored, a `mentor_reviews` row with a level or another table (`ia.md` A71-13 item 2).
- #37/#35: hints in an attempt history panel, a DESIGN task of its own (`ia.md` A71-11).
- #36/#37: hints for the quiz check: where the ladder sits, and the level "Вопрос" next to "Вопрос I из Q"
  (`ia.md` vocabulary "quiz question").
- #37: a reply thread with the mentor, a DESIGN task once #37 stores turns (`ia.md` A71-5).
- #37: re-assessment after a close on reserve items (module 00 design note), an ADR-0007 change Stepan
  approves first.
- #37: rubric criteria with their points, if #37 stores them per criterion (`ia.md` A71-4).
- #37: a visible cue for a mentor answer that arrives while the learner is away (`ia.md` A71-9).
