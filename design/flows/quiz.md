# Journey: quiz

Page: lesson, left pane, tab Квиз (shown only when the lesson has a check of kind `quiz`). The quiz lives
on the lesson page, not on a route of its own, because it is one of the lesson's checks, its result
belongs next to the other check results, and leaving the route would drop the terminal session view.
Sources: #36 (render quiz.yaml, server scoring, explanations after submission), quiz.yaml format
(`questions[] {id, type: single | multiple, prompt, options[], correct[], explanation}`), task.md
"Попытки и подсказки" in L1, L2, L3, L5, L6 (research §3, §4). Prototype deferred (D2 in the #50 design notes).
Nothing of this flow is shown before #36 ships: no Квиз tab, no quiz check row, no "Пройти квиз" (rule R6
in `ia.md`).

## F15: Take a quiz

**Goal:** check understanding of the lesson's concepts. Source: learning-process §2 (quiz: understanding
of concepts, scored on the server); task.md "Квиз: не больше 3 попыток".

**Entry:** the Квиз tab; "Пройти квиз" on the quiz check row (F13.1) or in the check bar of a quiz-only
lesson.

**Steps (6):**

1. F15.1 Learner sees the quiz header: number of questions, "Нужно N%" (from `passScore`), "Попытка 1 из
   3" when the server reports the limit, "Попытка 1" when it does not (rule R7 in `ia.md`).
2. F15.2 Learner answers each question: a single-choice question is a radio group, a multiple-choice
   question is a checkbox group with the note "Несколько вариантов".
3. F15.3 Learner presses "Отправить ответы". Unanswered questions block sending with "Ответьте на все
   вопросы: осталось 3" and links to them.
4. F15.4 After a failed attempt the learner sees only the total score, "Результат: 70%. Нужно 80%.", and
   "Попытка 2 из 3"; answers stay selected for the next attempt; nothing says which question is wrong.
5. F15.5 After a pass, or after the 3rd failed attempt, the learner sees every question with the correct
   options marked and the `explanation` under each.
6. F15.6 After the 3rd failure the quiz check reads "Закрыта: не пройдено" and offers "Разобрать с ментором"
   (F16).

**Limit unknown (R7), open for D2.** F15.1 follows R7. F15.4-F15.6 are still written for a known limit of 3
("Попытка 2 из 3", "after the 3rd failure"); with an unknown limit F15.4 reads "Попытка N" and F15.5-F15.6
happen only after a pass or when the server reports the quiz check closed. Rewriting them is part of the
quiz's own DESIGN task (#36, D2), because the quiz is not designed or shown before #36 ships (R6) and #69
changed only F15.1.

**Success:** "Квиз пройден" with the score; the quiz check row in Проверки reads "Пройдено".

**Error states:**
- Sending fails (network, server): "Ответы не отправлены. Попробуйте снова."; the answers stay selected
  and the attempt is not counted.
- quiz.yaml cannot be loaded: "Не удалось загрузить квиз" with "Повторить".
- Session expired while answering: F2. Selected answers are kept in `sessionStorage` under the lesson
  and check id on every change, so the same-tab round trip through sign-in (F2.2-F2.4) restores them;
  they are cleared after a successful send. A different tab or a closed browser starts empty, which the
  learner expects.

**Empty states:** no quiz check: no Квиз tab.

**Exit:** F15.5 or F15.6; any other tab.

**Keyboard path:** Tab moves between questions (one stop per radio group, arrow keys inside it; each
checkbox its own stop), Space selects. "Отправить ответы" is last in the tab order. After sending, focus
moves to the result heading.

**Time limits:** none (no source asks for a timed quiz). `correct` and `explanation` reach the browser only
after F15.5 conditions hold (#36).
