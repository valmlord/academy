# Journey: quiz

Page: lesson, left pane, tab Квиз (shown only when the lesson has a check of kind `quiz`). The quiz lives
on the lesson page, not on a route of its own, because it is one of the lesson's checks, its result
belongs next to the other check results, and leaving the route would drop the terminal session view.
Sources: #36 (render quiz.yaml, server scoring; its "explanations after submission" is narrowed by the
course rule, see "Requirements for #36"), quiz.yaml format
(`questions[] {id, type: single | multiple, prompt, options[], correct[], explanation}`), task.md
"Попытки и подсказки" in every quiz lesson ("Квиз: не больше 3 попыток", 13 lessons), #70 and Stepan's
decisions for it (P1-P11 below). Prototype: new states of `design/pages/lesson/prototype.html` (P1).
Nothing of this flow is shown before #36 ships (rule R6 in `ia.md`; every member: "Release scope" below).

## Stepan's decisions for #70

Quoted from Stepan (2026-11-04); the flow below follows them.

- **P1 Placement.** "Option D. Flows now; the prototype goes into `design/pages/lesson/prototype.html` +
  `acceptance.md` as new states, and the author phase starts only after #69 (check panel detail) merges to
  main, then this branch rebases. No proto.js state-inheritance attribute."
- **P2 Pass threshold as a count.** "Pass threshold is shown as a count, not a percent: header "Нужно 5 из
  6", result like "Верно 4 из 6. Нужно 5." ... it must match task.md "нужно 5 верных". The count comes
  from the server ...: the page never computes it."
- **P3 Attempts.** "Draw "Попытка N из 3" and the closing after the 3rd failure (course rule from task.md),
  with the dependency on #68 stated: "из M", the last-attempt warning and the closed state are shown only
  when #68 provides the limit; without it the page shows "Попытка N" and explanations only after a pass.
  Both variants are specified in flows; the prototype draws the limit-known variant plus one limit-unknown
  state."
- **P4 Release order.** "#36 ships after #34 (I added blocked-by #34 to #36), so no "quiz before checks"
  release state is designed."
- **P5 No retake after a pass.** Asked whether a passed learner may retake the quiz for practice: "Нет,
  пересдачи нет". A passed quiz takes no further attempt (Success below). An unscored practice mode, if it is
  ever needed, is a task of its own.
- **P6 A quiz send never sets a text in the check bar status line.** Asked to confirm "a quiz send never changes
  the check bar status line; the lesson outcome is said in the quiz result block instead": "Да, так". He
  confirmed it as worded, before the corner cases were shown to him; P7 and P8 refine it for the two corners
  in which an unchanged check bar would be false or incomplete. A quiz send still never sets a text in the
  status line.
- **P7 A status line made untrue by a quiz send is cleared.** Asked what the line does when it holds an end
  text ("Пройдено: 1 из 2") that a quiz pass or close makes untrue, including a pass that makes the lesson
  passed: "Молча очистить строку". The status line is emptied silently (an emptied live region announces
  nothing); "Открыть результаты" stays.
- **P8 A quiz send that leaves nothing to run updates the buttons silently.** Asked what the check bar does
  when a quiz pass or close finishes the lesson as not passed (S3 of `checks.md`): "Молча обновить кнопки".
  "Проверить" silently gets the R1 reason "Проверки завершены", "Открыть результаты" appears, and the status
  line is empty. The outcome is announced once, in the quiz result block.
- **P9 A send answered while the learner is away from the Квиз panel is announced by a notice.** Asked how
  to announce the outcome when the learner left the panel before the server answered (options: a notice
  under the top bar, a text in the check bar status line, nothing): "Уведомление под верхней панелью". One
  short notice in region "Уведомления" announces the result, including the lesson outcome (for example
  "Квиз пройден. Урок пройден"), with the button "Открыть квиз"; it disappears when the learner opens Квиз;
  the check bar status line is untouched, so P6-P8 hold. Specified in "Quiz notice (P9)".
- **P10 "Away" is the hidden panel or the environment pane (refined by P11).** Approving round 5 ("Да, раунд 5"), Stepan chose
  the option "Ушёл" = Квиз скрыт или фокус в терминале/редакторе, together with a refusal line in the result
  block. Specified in "Answer while the learner is away from the Квиз panel" and in Error states.
- **P11 "Away" covers the whole region "Окружение".** Round 5's "terminal or editor" left the status bar, its
  menu and the reset dialog unclassified; Stepan chose "Весь регион Окружение, раунд 6": away is the Квиз panel
  not shown, or focus anywhere in the region "Окружение" (terminal, editor, their Терминал / Редактор tabs, the
  environment status bar with the status action, "Подробности" and "Действия", the "Действия" menu, and every
  dialog opened from the region, such as "Сбросить рабочую папку?"), wherever they render in the DOM. It
  refines P10. The one definition is "Away" below; every other place quotes it.
  Consequence of P11's own reason, "a modal must keep focus" (round 7; a refinement within P11, not a new
  decision of Stepan's): the reason holds for every open menu or modal dialog on the page, not only for those
  opened from "Окружение", so the definition says "in an open menu or modal dialog anywhere on the page" in
  place of round 6's "in another open modal dialog", and the open user menu, the same modal Radix
  DropdownMenu as "Действия", is away. The region "Уведомления" in the definition is the architect's addition
  of round 7, as the split handle and the budget confirmation were, with its reason in the "Away" table.

## Quiz data the page shows

Source: the 13 `course/**/quiz.yaml` files and their `lesson.yaml` checks (#70 research §2).
- One quiz check per lesson. Its `title` begins with "Квиз:" in all 13 lessons and is shown as data.
- 5, 6 or 8 questions; each `single` or `multiple`, always 4 options. Prompts are Markdown: inline code,
  paragraphs, and in one quiz a fenced code block of up to 10 lines (directory trees). Options hold inline
  code, some only code. Explanations are 2-5 lines of Markdown.
- Questions and options are shown in file order, on every attempt and in the review, because the learner
  compares the same list across attempts and the review must match what was answered.
- Every number comes from the server, never from the page: the question count Q, the required count K
  (`requiredCorrect`, P2), the correct count C after a send, the attempt number A, the limit M (from #68,
  R7), and the quiz state (open, passed, closed). K must equal the K of task.md's "Q вопросов-сценариев,
  нужно K верных".

**Placeholders.** In the quiz's own templates (the strings of the quiz set, of the quiz notice in the page
alert set, and of the page copy row "lesson, quiz" in `ia.md`) each letter has one meaning, because dev writes the copy templates from them:

| Letter | Meaning | Strings |
|--------|---------|---------|
| Q | the number of questions in the quiz; in the attempt history's "Верно C из Q." (`progress.md` F19.2, from #35) the number of questions of that quiz attempt record, as #36 stored it with the result (item 11 of "Requirements for #36"), because the quiz may change later | "Нужно K из Q", "Верно C из Q. Нужно K.", "Верно C из Q.", "Вопрос I из Q", "Вопрос I из Q: выберите ответ", "Вопрос I из Q: выберите хотя бы один вариант", "Последний результат: Верно C из Q. Нужно K.", notice rows 1-2 |
| I | the position of one question, 1 to Q | "Вопрос I из Q", the summary links |
| K | the required number of correct answers (`requiredCorrect`) | "Нужно K из Q", "Верно C из Q. Нужно K.", "Последний результат: Верно C из Q. Нужно K.", notice rows 1-2 |
| C | the number of correct answers of the attempt shown (after a refusal, the latest attempt of another browser tab; in the attempt history, F19.2, that quiz attempt record's, item 11) | "Верно C из Q. Нужно K.", "Верно C из Q.", "Последний результат: Верно C из Q. Нужно K.", notice rows 1-2 |
| A | the number of the attempt being answered | "Попытка A из M", "Попытка A" |
| M | the quiz check's attempt limit (from #68, R7): the same M as in the check row counter "Неудачных попыток: N из M" | "Попытка A из M" |
| U | the number of unanswered questions | "Ответьте на все вопросы: осталось U" |

No quiz string uses N. Strings quoted from the check sets keep the letters `checks.md` gives them: in the
counter "Неудачных попыток: N из M" N is the quiz check's counted failed attempts; in the lesson line
"Урок завершён: не пройден. Пройдено: N из M" N and M are the passed and the counted checks of the lesson,
also where that line ends quiz notice rows 5 and 7 ("... Пройдено: N из M.") and rows 10-11 when they use them;
in the check bar notes ("Закрытых проверок: N" and the others) N is the count each note names. Stepan's
quotes (P2, P3) keep his own wording ("Попытка N из 3" is "Попытка A из M").

## Release scope (R6)

Every member of the class "quiz controls" that R6 hides until #36, and its scope:

| Member | Before #36 | From #36 |
|--------|------------|----------|
| the Квиз tab in the left-pane tab list | not rendered | rendered when the lesson has a quiz check |
| the quiz panel and everything in it (header, questions, "Отправить ответы", result, review) | not rendered | rendered |
| the quiz check row in Проверки, with "Пройти квиз" in its open panel | not listed | listed (quiz check row below) |
| the quiz check in "Пройдено: N из M" and in the lesson status | not counted (A19) | counted |
| "Пройти квиз" in the check bar of a quiz-only lesson (`checks.md`) | not rendered | rendered; no such lesson exists, not drawn |
| the deep link `?tab=quiz` | falls back (Navigation model in `ia.md`) | opens the Квиз tab; on a lesson without a quiz check it falls back the same way |
| "Разобрать с ментором" in the closed quiz block | not rendered | not rendered until #37 (R6) |
| the quiz notice container in "Уведомления" and its notice with "Открыть квиз" (P9) | not rendered | rendered on a lesson page with a quiz check; the notice only after a send answered while away |

No release state "quiz before checks" exists (P4): from #36 on, a lesson page with a quiz also has the check
bar and the Проверки tab of #34.

## F15: Take a quiz

**Goal:** check understanding of the lesson's concepts. Source: learning-process §2 (quiz: understanding
of concepts, scored on the server); task.md "Квиз: не больше 3 попыток" and "6 вопросов-сценариев, нужно 5
верных" (L1 `task.md:51`); issue #70 ("see which answers were wrong": after the quiz is passed or closed,
because task.md shows only the total score after a failure).

**Entry:** the Квиз tab; "Пройти квиз" in the quiz check row's open panel (F13.5); "Пройти квиз" in the
check bar of a quiz-only lesson; the deep link `?tab=quiz`, also on the return from sign-in (F2).

**Steps (6):**

1. F15.1 Learner sees the quiz header under the panel heading (the check `title`): "Нужно 5 из 6" (P2:
   K and Q from the server), then the attempt line, "Попытка 1 из 3" when the server reports the limit and
   "Попытка 1" when it does not (R7, P3). On the last attempt with a known limit the line "Осталась 1
   попытка" with the warning icon follows it.
2. F15.2 Learner answers each question. Each question has the heading "Вопрос 2 из 6", its prompt, and one
   group: a radio group for `single`, a checkbox group for `multiple`. A `multiple` question also shows the
   note "Засчитывается только точный набор ответов" (exact-set scoring, task.md). Nothing is preselected.
3. F15.3 Learner presses "Отправить ответы". With unanswered questions nothing is sent: the error summary
   "Ответьте на все вопросы: осталось 2" with one link per unanswered question appears above the questions
   and takes focus, and each unanswered question shows its message ("Выберите ответ" or "Выберите хотя бы
   один вариант"); both then follow the learner's answers ("Error summary and per-question messages"
   below). With every question answered the button shows "Отправляем..." (busy) and the answers are locked
   until the server answers ("Sending" below).
4. F15.4 After a failed attempt the result block takes focus: "Верно 4 из 6. Нужно 5." and "Ответы остались
   выбранными. Какие из них неверны, квиз покажет после прохождения или после последней попытки." The
   header reads "Попытка 2 из 3"; the answers stay selected; nothing says which question is wrong. After
   the failure that leaves one attempt the header adds "Осталась 1 попытка".
5. F15.5 After a pass, or after the failure that closes the quiz, the questions become the review: each
   question heading carries "Верно" or "Неверно", each option the marks "Ваш ответ" and "Верный ответ" where
   they apply, and the `explanation` follows under "Пояснение". The result block reads "Квиз пройден" with
   "Верно 5 из 6." or "Квиз не пройден: попытки исчерпаны" with "Верно 4 из 6. Нужно 5.", then "Ниже верные
   ответы и пояснения." "Отправить ответы" and the attempt line are gone: no attempt follows.
6. F15.6 After the closing failure the quiz check row in Проверки reads "Закрыта: не пройдено". The
   learner's next action is the review itself, right below the result block, then the lesson's other open
   checks (check bar) or the next lesson (top bar "Главная", F4). From #37 the closed block also offers
   "Разобрать с ментором" (F16; R6 hides it until then).

**Limit known and limit unknown (R7, P3).** "Limit known" means the server reports the quiz check's limit M
(from #68). Without it the page never infers 3 from task.md, because a number the platform does not enforce
would misinform (R7).

| Element | Limit known (drawn) | Limit unknown (one state drawn) |
|---------|---------------------|---------------------------------|
| attempt line (F15.1, F15.4) | "Попытка A из M" | "Попытка A" |
| last-attempt warning (F15.1) | "Осталась 1 попытка", while exactly one attempt remains | never |
| failed result description (F15.4) | "Ответы остались выбранными. Какие из них неверны, квиз покажет после прохождения или после последней попытки." | "Ответы остались выбранными. Какие из них неверны, квиз покажет после прохождения." |
| review (F15.5) | after a pass, or after the failure that closes the quiz | after a pass; after a failure only if the server reports the quiz closed |
| closed state (F15.6) | when the server reports it, after the warning | only when the server reports it, with no warning before |
| quiz check row counter | "Неудачных попыток: N из M" | "Неудачных попыток: N" |

**Lesson outcome after a send.** When the lesson status the server reports with the answer changed since the
page last read it (below), the result block adds the check bar's own outcome text as its last line: "Урок
пройден", or from #69 "Урок завершён: не пройден. Пройдено: N из M". **Changed since the page last read it**
(used here, by the refusal result block and by the quiz notice's lesson line): the status differs from the
latest lesson status this page view read before the answer, whichever came last of the page load, the answer
to an earlier send, a run end in the check bar (its end text is computed from the server's state then,
`checks.md` "Check bar status line"), and #69's re-read of the check states when the browser tab becomes
visible (`checks.md` B8-B11, and B27 for a quiz send from another browser tab, announced in that tab).
**Send window.** From the press of "Отправить ответы" until this send, or its retry after a failure, is
answered, the server may already have recorded the send and changed the lesson status, and the page cannot
tell; a B27 in this window may have found this page's own send, not another tab's. So in the window a read
counts only if it put summary 5 or 6 in the status line (a run end, or #69's B9 or B10 with that end text),
because only such a read has said the lesson outcome; any other read does not count: B8 (it attaches to a run
and shows summary 1), B11, B27 (they set nothing), a run end with summary 4 or 7 (4 wins over 5 and 6; 7 says
the lesson is not finished) and a run given up (summary 3, no end text). The answer (or the retry's, same
client attempt id) compares the lesson status with the latest read before the press, or with the latest
counting read in the window, so its result block, or the quiz notice when the learner is away, carries the
lesson line once unless the status line has already said it; if the quiz changed in another tab, the send or
the retry is refused and the refusal result block or notice carries it, once in this page view. So an outcome the check bar already shows as summary 5 or 6 is not said again. Every "once" about the lesson outcome in this file holds except for a send answered during a run, which the run's end text repeats (accepted, "Check bar after a quiz send", row "1, 2 or 3"). A quiz send never sets a text in the check bar status line (P6), because it
reports runs of "Проверить" (`checks.md`, "Live regions"), a quiz send is not a run, and setting it while
focus moves to the result block would announce the outcome twice; it only empties the line when its text
became untrue (P7) and updates the controls silently when nothing is left to run (P8). After a send the
page re-reads the check states, so the quiz check row changes silently (rows are not live, `checks.md`).
What the check bar shows after a send, for every state of its status line: "Check bar after a quiz send"
below.

### Check bar after a quiz send

The status line's states are the summaries of `checks.md` "Check bar status line" (#69): empty, 1-3 (a run
going or its stream), 4 (run failed to start or every check errored), 5 "Урок пройден", 6 "Урок завершён:
не пройден. Пройдено: N из M", 7 "Пройдено: N из M" with its notes. The quiz check is a counted check from
#36 (R6), so it is in N and M of summaries 6 and 7 and in "Урок пройден", and the server's lesson status
includes it.

| Status line before the send | Send outcome | Check bar after the send | Same as after a reload? |
|-----------------------------|--------------|--------------------------|-------------------------|
| empty (no run ended on this page view) | any outcome that leaves a command check open to run | unchanged: empty; "Проверить" and its reason unchanged | yes: a reload shows an empty line (`checks.md` B1) |
| 1, 2 or 3 (a run going, its stream lost or given up) | any | unchanged; the run's end text, when it comes, is computed from the server's state at that time, so it already counts the quiz as it then stands. **Accepted double announcement:** a send answered during the run that changes the lesson status (a quiz pass that makes the lesson passed, possible because a run re-runs passed `command` checks, `checks.md` "Run composition"; or a pass or close, or a refusal finding one, that finishes the lesson) carries the lesson line in its result block or quiz notice, and the run's end text says it again as summary 5 or 6. Accepted, because the end text answers the learner's own "Проверить" press, and holding the result block's line back can lose the outcome: summary 4 wins over 5 and 6, and summary 3 sets no end text (`checks.md` "Check bar status line"). This is the one path where the lesson outcome is announced twice in a page view; #36's tester confirms it with a screen reader (`ia.md` FU13, Q6) | yes |
| 4 (the run could not start, or every check errored) | any outcome that leaves a command check open to run | unchanged: the text says the run failed and stays true | the reload shows an empty line; the text is about a run, not false |
| 7, and the send leaves N, M and every note of it true (a failed attempt that does not close the quiz) | failed, not closing | unchanged and still true: the quiz was not passed and is still not passed | the reload shows an empty line |
| 7, and the send makes its count or a note untrue (a pass raises N; a close adds a closed check to "Закрытых проверок: N" or adds that note), including a pass that makes the lesson passed; not S3 (next row) | passed, or failed and closing | P7: the status line is emptied silently (nothing is set in its place, so nothing is announced and no text gap applies); "Открыть результаты" stays, because the rows it opens now show the quiz's new state; "Проверить" and its reason unchanged; no control is removed, so focus is on the result block when the learner is not away and stays where it was when away. The re-read baseline (`checks.md`, "Baseline of a re-read") is unchanged, because no run ended (it names runs only; a quiz attempt record never enters it, item 11 of "Requirements for #36"): a later re-read that finds the same run sets nothing, one that finds a newer run shows its end text | the reload shows an empty line without "Открыть результаты" (B1); neither state is false |
| any, no run going, and the send leaves nothing for "Проверить" to run with the lesson finished (S3: every counted check passed or closed, at least one closed; the send is the quiz's pass or close) | passed, or failed and closing | P8: the status line is empty (emptied silently if it held a text); "Проверить" becomes `aria-disabled` with the R1 reason "Проверки завершены", silently (read when the learner reaches it); "Открыть результаты" is shown after it (kept if it was there); "К окружению" and "Переподключиться" go if shown, as in #69's B10. Focus: on the result block when the learner is not away; when away, it stays where it was, unless it was on "К окружению" or "Переподключиться" (the check bar is away while the Квиз panel is not shown), which P8 removes: then it moves to "Проверить", now `aria-disabled` "Проверки завершены" (`ia.md` R2, "Focus after a background change", as #69's B10). The outcome is announced once, by the result block's lesson line when the result block takes focus; when the learner is away, by the quiz notice instead (P9, "Quiz notice (P9)") | the reload renders summary 6 in the line, not announced on load (B2), with the same controls; only the unannounced text differs |
| any, and the send is refused because the quiz changed in another browser tab | refused; the page re-reads and shows the quiz's current state | by that current state, as if the change were this page's own, the first branch that holds: the line already at 5 or 6 and matching the current lesson status (next row): unchanged, text and controls as the run end or #69's B10 left them, and since the lesson status has not changed since the page last read it ("Lesson outcome after a send"), neither the refusal result block nor the notice carries a lesson line (the notice is row 3 or 6 text); the quiz still open: nothing changed for the bar (the rows of a failed attempt that does not close it: unchanged); the quiz now passed or closed and summary 7 untrue: P7 (line emptied silently, "Открыть результаты" stays); the quiz now passed or closed and the lesson in S3: P8 (empty line, "Проверить" `aria-disabled` "Проверки завершены", "Открыть результаты"; focus on a removed "К окружению" or "Переподключиться" moves to "Проверить", as in the P8 row). A lesson outcome that changed since the page last read it is announced once, by the refusal result block's lesson line or by notice rows 4, 5 or 7 when away; a refusal answered during a run is said again by the run's end text (row "1, 2 or 3", accepted) | as the matching row above; for the line at 5 or 6, as before the send |
| 5 or 6, set by a run end on this page view or by #69's re-read when the browser tab became visible (`checks.md` B9, B10) while the quiz panel kept its earlier state (the panel does not re-read on its own, Error states) | refused only: summary 5 means the lesson is passed, so the quiz is passed, and summary 6 means every counted check is passed or closed, so the quiz is too; a send from a panel that still shows the quiz open is refused | the refused row above, branch "line already at 5 or 6": unchanged, no lesson line anywhere. The line always matches the current status, because a passed lesson stays passed (S1) and a closed check stays closed; the branch is stated so the app has one rule | as before the send: the send changes nothing in the bar |

Decided for the notes of summary 7, which a later run's end text carries:
- "Закрытых проверок: N" counts a closed quiz, because it counts the lesson's closed counted checks and the
  quiz is one, as M of "Пройдено: N из M" counts it.
- "Осталась 1 попытка" and "Проверок на последней попытке: N" count only the checks the run included, so
  never the quiz, because a run never includes the quiz (`checks.md` "Run composition") and the note is
  announced as the outcome of what "Проверить" just ran; a quiz on its last attempt says so in its own
  header and in the quiz check row meta.
- "Проверок со сбоем: N" counts the checks of the run, never the quiz (it is never in a run).

A lesson whose every `command` check is closed while its quiz is open is FU8 (Seams below). A passed lesson
whose other counted checks all spend tokens (S12, from #37 / #39) reaches "nothing to run" by a quiz pass
too; P8's rule applies to it the same way (empty line, "Проверки завершены", "Открыть результаты"; a reload
renders summary 5), and it does not exist before #37.

### Quiz panel, in DOM order

1. The panel heading, `h2`, `tabindex="-1"`: the quiz check `title` (data), because it says what the quiz
   covers and matches the quiz check row in Проверки.
2. The header: "Нужно K из Q"; the attempt line; the last-attempt warning (limit known). No separate
   question count: "Нужно 5 из 6" names the total, and leaving out "6 вопросов" avoids a noun next to a
   numeral (no plural forms). The warning "Осталась 1 попытка" is the same element as #69's check row meta
   warning (`<span data-tone="warning">` with a leading warning `.status-icon`, words not muted), because one
   string has one look wherever it shows.
3. The result block, only after a send or on a return visit with a result: an Alert used as a focusable
   message (`design/system/README.md` Alert: `role="group" tabindex="-1" aria-labelledby` the title,
   `aria-describedby` the lines). Never `role="alert"`: the app's `Alert` renders `role="alert"` by default
   and must be overridden as sign-in does (`sign-in-form.tsx`), because R2 allows no live container here.
4. The error summary, only after a blocked send: the same focusable-message pattern, title "Ответьте на все
   вопросы: осталось U", then a list of links, one per unanswered question in question order.
5. The questions, each a question block (below).
6. The send error, only after a failed send: the same focusable-message pattern, title "Ответы не
   отправлены. Попробуйте снова.", placed right before the button so the next Tab reaches it.
7. "Отправить ответы", last, while the quiz is open.

In the review (passed or closed) items 4, 6 and 7 are not rendered.

**Loading.** While the quiz is being read (the Квиз tab opened, a deep link, or "Повторить" after a load
error), the heading (item 1) stays, everything after it is replaced by Skeleton blocks
(`aria-hidden="true"`), and the panel has `aria-busy="true"` until the content is in place. Nothing is
announced and focus does not move on its own, because loading is not news and R2 allows no live container
here; the heading is shown from the start because its text is the check `title`, which the page already has
from `lesson.yaml`. Only when #36 loads the quiz on the client; a server-rendered quiz has no loading state.
"Повторить" is removed when the loading state replaces the load error, so focus moves to the panel heading at
once and stays there when the quiz loads (R2 retry table); if the load fails again the error comes back and
focus moves to its "Повторить", unless the learner is away ("Answer while the learner is away from the Квиз
panel" below); then focus stays where the learner put it.

**The load error** is a plain destructive Alert (`.alert` `data-variant="destructive"`, title "Не удалось
загрузить квиз", "Повторить" in its actions), the same markup as the lesson text load error
(`design/pages/lesson/prototype.html`, `#state-text-error`), with no `role` and no `tabindex`, because it
never takes focus: it appears on load, which moves no focus, or after a failed retry, where focus goes to
its "Повторить". "Повторить" has `aria-describedby` the Alert title's id, so on the focus move after a
second failure, and whenever the learner reaches it, it reads "Повторить, Не удалось загрузить квиз"; that
the second failure happened is still not announced (FU6).

### Error summary and per-question messages

After a blocked send the summary and the per-question messages follow the learner's answers, silently (the
summary is not a live container, R2), because a count or a message that no longer holds would misinform, and
the change is the learner's own action at the point of focus:
- Answering an unanswered question removes its message, removes its link from the summary and lowers U in
  the title ("осталось 2" becomes "осталось 1"). The group's `aria-describedby` drops the removed message.
- Un-answering a `multiple` question (unchecking its last box) while the summary is shown adds its message
  and its link, in question order, and raises U, whether the question was unanswered at the blocked send
  (its link comes back) or was answered then and is emptied now (its link is added for the first time),
  because the summary lists the questions unanswered now, not the ones unanswered at the send.
- When no unanswered question is left the summary is removed. Once removed it does not come back until the
  next blocked send, because a message that appears without a send would report an error the learner did not
  ask about; un-answering a question then shows nothing until "Отправить ответы" is pressed again.
- Focus when the removed element holds it: if the summary, its title or a link being removed has focus (a
  pointer user can answer while focus stays on a link, Safari does not focus a radio or checkbox on click),
  focus moves to the option the learner just changed (the radio now checked, or the checkbox just toggled),
  because that is where the action happened and the next answer or the send is reached from there. Focus
  never falls to `body` (R2).
- A new blocked send renders the summary afresh from the current unanswered set and moves focus to it.
- A send with every question answered removes the summary and every message before "Отправляем..." shows.

### Sending: busy button and locked answers

From the press of "Отправить ответы" until the server answers (result, send error, refusal with the current
state, or a 401):
- The button is busy (`aria-busy="true"`, `aria-disabled="true"`, Spinner, label "Отправляем...", the R1
  "Войти" pattern), and focus is on it: a keyboard press leaves focus there, and a pointer press focuses the
  button by script when the browser does not (Safari, and Firefox on macOS, do not focus a clicked button,
  MDN "Clicking and focus"), because the busy label is the reason (R1) and must be where focus is, and the
  away rule below needs a defined starting point.
- Every radio and checkbox is locked: `aria-disabled="true"` on each option control and on each group, and
  the change is cancelled (a click, Space and the arrow keys check or toggle nothing; in the app the
  controlled groups ignore value changes while sending and cancel the arrow keys before Radix handles them).
  Not the native `disabled`, because R1 keeps a control that will act again focusable, `disabled` would drop
  every option from the Tab order for the length of the send, and an option that had focus would lose it.
  Why lock at all: an answer changed during the send would differ from the answers the server scores. No
  reason is tied to each group: the busy label on the focused button is the reason, and the lock lasts only
  the send.
- When the server answers the lock and the busy state end together, before focus moves to the result block
  or the send error; in the review the inputs are replaced by the static list.
- Leaving the panel is not locked: the left tab list, the one-pane switch, `F6` and "К окружению" stay live,
  because in one-pane mode `F6` and "К окружению" show the other pane (R3), so no lock could keep the panel
  shown, and the send may last until a network timeout. What happens when the answer arrives while the
  learner is away: next subsection.

### Answer while the learner is away from the Квиз panel

**Away** (Stepan's P10, P11; the one definition, quoted word for word wherever the rule appears). At the moment
the server answers, the learner is away when: the Квиз panel is not shown, or focus is in the region
"Окружение" (R3), in a menu or dialog opened from it, on the split handle, in the region "Уведомления", or in an
open menu or modal dialog anywhere on the page. Everything else is "not away".

**Open menu or modal dialog** is decided by what the component does while open, read from the app and its
library source, not by the region it sits in: a component that traps focus or puts `aria-hidden` on the rest of
the page counts. On the lesson page these are every DropdownMenu, the user menu in the top bar
(`apps/web/components/user-menu.tsx`) and "Действия": the app's `DropdownMenu` passes no `modal` prop to Radix
(`apps/web/components/ui/dropdown-menu.tsx`), Radix `DropdownMenu` defaults to `modal = true`
(`@radix-ui/react-dropdown-menu` 2.2.1), and its modal content calls `hideOthers` and traps focus
(`@radix-ui/react-menu` 2.2.1: `trapFocus: context.open`); and every AlertDialog (`role="alertdialog"`,
`design/system/README.md` AlertDialog): the reset dialog (F11.3) and the budget confirmation (from #37 / #39).
"Действия" is not in the app yet: it is modal when it is built, as the user menu is, from
`apps/web/components/ui/dropdown-menu.tsx` without `modal={false}`, and the lesson acceptance states that (a
non-modal "Действия" would need this table re-read). A focus move out of one cannot happen (the trap sends focus
back) and the rest of the page is hidden from a screen reader, so a result block focused behind it would be
announced nowhere (WCAG 4.1.3). The Tooltip of the split handle holds nothing focusable, and "Подробности" is a
disclosure in its row, not a dialog.

**The notice stays audible while a menu or dialog is open.** `hideOthers` (`aria-hidden` 1.2.6, used by the
Radix menu above, and by `@radix-ui/react-dialog` 1.3.1, which the app already has through the umbrella
`radix-ui` 1.8.1 (`apps/web/package.json:24`) and whose modal content calls `hideOthers(content)`
(`dist/index.mjs:165`); only the app's AlertDialog component is still missing) sets `aria-hidden` on every
node outside the open content except nodes matching
`[aria-live], script` and their ancestors, queried when the menu opens; a `role="status"` with no `aria-live`
attribute is not spared, so the quiz notice set while the menu is open would land in an `aria-hidden` subtree
and be announced nowhere. So every live container of R2 (`ia.md`) carries an explicit `aria-live` that matches
its role (`aria-live="polite"` with `role="status"`, `aria-live="assertive"` with `role="alert"`), present from
page load with the container; the quiz notice container is one of them, and the idle warning (F10.1) and the
F2.1 session alert share the fix (FU11 in `ia.md` for the app's `notifications.tsx`). The prototype draws no
away answer with a dialog open: its native `dialog.showModal()` makes the rest of the page inert, which no
attribute exempts, so the case is a test of the app (Requirements for #36, item 9).

**The panel axis wins.** "The Квиз panel is not shown" makes the learner away on its own, wherever focus is,
`body`, the top bar and "Проверка" included. So every place below has two branches, with the Квиз panel shown
and with it not shown; "-" marks a combination that cannot occur.

| Place | Квиз panel shown | Квиз panel not shown | Why |
|-------|------------------|----------------------|-----|
| the skip link, "Верхняя панель" ("Академия", "Главная", "Курс", the user menu button with its menu closed) | not away | away | shown: the panel is in front of the learner, a short visit; not shown: the panel axis |
| the open user menu and its item "Выйти", rendered in a portal | away ("an open menu or modal dialog anywhere on the page") | away | the menu is modal (above): focus cannot leave it and the panel is `aria-hidden` while it is open |
| "Уведомления" ("Войти снова", "Продолжить работу"; "Открыть квиз" cannot hold focus when an answer arrives, because the start of that send removed the notice, "Removal") | away ("in the region "Уведомления"") | away | the learner is answering a page alert: "Продолжить работу" answers the idle time limit (F10, WCAG 2.2.1), and a focus move off it could let the environment stop; "Войти снова" is the way back from an expired session; the quiz notice is announced in the same region, beside the focus. When "Продолжить работу" is then pressed and the outcome has replaced the element focus is to return to (the busy button or the options, now the review), focus goes to the result block or send error (`ia.md` R2, "Focus after a background change", item 1), which also removes the notice |
| "Урок" with Квиз selected: the one-pane switch tab "Урок", breadcrumbs, lesson header ("Показать все"), prerequisite alert links (F6.2), the left-pane tab list, the Квиз panel | not away | - (with Квиз selected the panel is hidden only together with the whole "Урок" pane, one-pane mode with "Окружение" shown, and a hidden pane holds no focus) | the panel is shown |
| "Урок" with another tab selected (Теория, Задание, Проверки) | - | away | the panel is not shown |
| "Проверка": "Проверить" and its reason, "К окружению", "Открыть результаты", "Переподключиться" (#69's check bar control, `ia.md:295`, R3) | not away | away (another left-pane tab selected, or one-pane mode with "Окружение" shown) | shown: the check bar sits under the panel and is pressed, not worked in; not shown: the panel axis |
| the budget confirmation (from #37 / #39), a modal opened from "Проверка" | away ("an open menu or modal dialog anywhere on the page") | away | a send answered while a modal dialog is open must never pull focus out of it |
| the split handle (belongs to no region, R3; two panes only) | away | away | it is operated by repeated arrow keys (F9.3); a focus move mid-adjust would send the next arrow key to the result block |
| "Окружение", two panes: the status action ("Повторить", "Запустить снова", "Переподключиться", "Открыть новый сеанс", "Открыть курс"), "Подробности" and its content, "Действия", the Терминал / Редактор tab list, the terminal, the editor (from #40) | away | away | the learner works there; this is where `F6` into "Окружение" lands ("Действия", R3) |
| the "Действия" menu and its items (including "Режим для экранного диктора"), and every dialog opened from the region ("Сбросить рабочую папку?", F11.3), wherever they render in the DOM | away ("a menu or dialog opened from it") | away | portalled out of the pane but opened from it; a modal must keep focus |
| "Окружение", one-pane mode with it shown | - | away | the panel is not shown |
| `body` (a mouse learner in Safari or Firefox on macOS, whose clicks focus no button, radio or checkbox, MDN "Clicking and focus"; or a click on non-focusable page background) | not away | away | shown: deciding by "focus in the panel" alone made every Safari mouse learner away; not shown: the panel axis (a Safari mouse learner who clicked another tab) |

Why this split: a hidden panel, "Окружение" (with what it opens), "Уведомления" and every open menu or modal
dialog are where moving focus to the result block would pull the learner out of work, out of a page alert or
out of a dialog, or cannot happen at all; with the panel shown, everywhere else it is in front of them.

Every outcome above that moves focus into the panel (result block, send error, the refusal, the second failure
of "Повторить") does so whenever the learner is not away. The result block or send error is scrolled into view
as it takes focus (the browser's default, nearest edge), not with `preventScroll`, because after a press on
"Отправить ответы" far down the questions the outcome is above the viewport, and a focused element out of view
is lost to a sighted keyboard or mouse learner (WCAG 2.4.7: the focus indicator must be visible to be of use).
When the server answers while the learner is away:
- The answer is applied in full: the quiz state held above the tab panels (#36: answers, result, attempt
  line, review, send error) takes the new outcome, the quiz check row is re-read silently, and the check bar
  follows "Check bar after a quiz send" (P6-P8). The lock and the busy state end. Nothing waits for the
  learner to come back.
- Focus does not move. The learner is away: the Квиз panel is not shown, or focus is in the region
  "Окружение" (R3), in a menu or dialog opened from it, on the split handle, in the region "Уведомления", or in an
  open menu or modal dialog anywhere on the page. Focus stays where the learner put it: on the element in
  "Окружение", the menu or dialog, the split handle or "Уведомления", or, with the panel not shown, on the control
  that hid it (a tab, the one-pane switch, "К окружению"), on a place reached since (the check bar, the top bar),
  or on `body` (a Safari mouse learner who clicked another tab). The page moves nothing, so a menu or dialog
  keeps focus and the learner's work in the environment or reading elsewhere is not interrupted, with one
  exception: when the answer itself removes the element that holds focus, `ia.md` R2 "Focus after a background
  change" moves it, never to `body`. The answer removes "К окружению" and "Переподключиться" from the check bar
  in S3 (P8; focus to "Проверить") and "Пройти квиз" from the open quiz check row after a pass or close (focus to
  the quiz row's own disclosure button); with the panel not shown these places are away, so focus can be there.
- On the next showing of the Квиз panel (the Квиз tab, the switch back to "Урок", `?tab=quiz`, "Пройти
  квиз"), the panel shows the outcome as a return visit does: the result block after the header (or the
  review), or the send error right before "Отправить ответы", with the answers kept. Showing the panel moves
  no focus beyond what the control that showed it does ("Пройти квиз" focuses the heading; a tab keeps focus
  on itself, so arrow keys in the tab list keep working), and the result block, the first content after the
  header, is read next.
- The outcome is announced once by the quiz notice in "Уведомления" (P9, next subsection), because the result
  block cannot take focus without pulling the learner out of what they moved to, and the check bar status
  line gets no text (P6-P8). In the S3 corner the notice carries the lesson outcome, so P8's one
  announcement is the notice's instead of the result block's.
- A load or a retry that ends while the learner is away announces nothing: a successful load is content, and a
  second load failure is FU6's silent case; no notice is shown for loads.
- A learner who leaves the page during a send finds the outcome on return (Requirements for #36, item 7), with
  no notice: an outcome found on load is page content.

### Quiz notice (P9)

**When.** The server answers a send (result, send error, or a refusal with the current state) while the learner
is away. No notice when the learner is not away (the result block or the send error takes focus), for a 401 (the
F2.1 session alert is shown instead, F2), or for a load.

**Text, per outcome.** Every legal notice text, word for word; no other text and no other combination
exists. Each ends with a full stop. The lesson line ("Урок пройден.", "Урок завершён: не пройден. Пройдено: N
из M.") appears only where a row lists it, and only when the lesson status the server reports changed since
the page last read it (by this send, or for rows 10-11 by another browser tab; "last read" includes a run end
and #69's re-read, as "Lesson outcome after a send" defines it, inside a send's window only a read that showed
summary 5 or 6, "Send window").

| # | Outcome while away | Notice text (exact) |
|---|--------------------|---------------------|
| 1 | failed, quiz still open, more than one attempt left or limit unknown | "Ответы квиза проверены. Верно C из Q. Нужно K." |
| 2 | failed, quiz still open, exactly one attempt left (limit known) | "Ответы квиза проверены. Верно C из Q. Нужно K. Осталась 1 попытка." |
| 3 | passed, lesson status unchanged | "Квиз пройден." |
| 4 | passed, the lesson becomes passed | "Квиз пройден. Урок пройден." |
| 5 | passed, the lesson becomes finished and not passed (S3: another counted check closed) | "Квиз пройден. Урок завершён: не пройден. Пройдено: N из M." |
| 6 | failed, closing the quiz, lesson status unchanged | "Квиз не пройден: попытки исчерпаны." |
| 7 | failed, closing the quiz, the lesson becomes finished and not passed (S3) | "Квиз не пройден: попытки исчерпаны. Урок завершён: не пройден. Пройдено: N из M." |
| 8 | send failed (network, server, timeout) | "Ответы квиза не отправлены. Попробуйте снова." |
| 9 | refused, the quiz changed elsewhere and is still open | "Ответы квиза не приняты: квиз изменился в другой вкладке." |
| 10 | refused, the quiz is now passed (by another browser tab) | the text of row 3, 4 or 5, by the lesson status the page now reads; row 3 when it has not changed since the page last read it |
| 11 | refused, the quiz is now closed (by another browser tab) | the text of row 6 or 7, by the lesson status the page now reads; row 6 when it has not changed since the page last read it |

Why: "Ответы квиза проверены" leads rows 1-2 because "Верно C из Q. Нужно K." alone does not say what was
counted, and "Квиз не пройден" alone would read as final while attempts remain. A closing failure never
passes the lesson, so "Квиз не пройден: попытки исчерпаны. Урок пройден." does not exist. Rows 9-11 never say
the answers were checked, because the refused send was not scored and counted nothing (Error states); row 9
names what happened instead, and rows 10-11 state the quiz as it now is, which is true whoever finished it.
For rows 10-11 the lesson line follows the lesson status the page reads with the refusal when it differs from
the one the page last read (another browser tab changed it), because the check bar then follows P7/P8 by the
same current state ("Check bar after a quiz send") and the outcome must be said once (twice only when the
refusal is answered during a run, whose end text repeats it, row "1, 2 or 3", accepted); when the check bar
already shows that status as summary 5 or 6 (a run end, or #69's re-read when the browser tab became
visible), it has not changed since the page last read it, so the text is row 3 or 6; row 9 carries none,
because a quiz that is still open finishes no lesson. Every text ends with a full stop
because each is one or more full sentences in an Alert title, as the other page alerts are; the result block
titles ("Квиз пройден" without a stop) are other strings.

**Markup and live region.** A new kind in R2: region "Уведомления" holds a third container, `role="status"
aria-live="polite"`, the quiz notice container, present and empty from page load, after the F2.1 `role="alert"`
container and the F10.1 `role="status"` container (each with its explicit `aria-live`, R2, so an open menu or
dialog does not hide it: "Away" above). A container of its own, because the idle warning and the notice can
be shown together, and replacing a shared container's content would announce the other message again. The
notice is an Alert (default variant, a leading info `.status-icon`, the same composition as the idle warning
F10.1): the title is the notice text, then "Открыть квиз" in its actions. The Alert has no role of its own:
the app's `Alert` renders `role="alert"` by default (`apps/web/components/ui/alert.tsx:36`) and takes
`role={undefined}` here, as `notifications.tsx:57-58` does for F2.1, because the container is the only live
element (R2); a `role="alert"` inside the polite container would interrupt the learner and could announce the
text twice. It is inserted into the existing empty container, so it is announced once; while it is shown the
wrapper is a `region` landmark (R2).

**Removal.** The notice is removed silently (the container is emptied; an emptied live region announces
nothing) by the first of these, because each ends one branch of "away" and after each the panel itself shows
the outcome:
- the Квиз panel becomes shown (the Квиз tab, the one-pane switch back to "Урок" with Квиз selected,
  `?tab=quiz`, "Пройти квиз", "Открыть квиз", the window widening to two panes): ends "not shown";
- focus or a pointer press moves into the shown Квиз panel, from anywhere: focus enters the panel (Tab,
  Shift+Tab, `F6` landing in "Урок" on an element of the panel) or a pointer press lands anywhere in it (on a
  control, on the `tabindex="-1"` heading or result block, or on text, focused by the browser or not): ends the
  second branch of away (focus is in the region "Окружение" (R3), in a menu or dialog opened from it, on the
  split handle, in the region "Уведомления", or in an open menu or modal dialog anywhere on the page), the case
  of the panel shown and the learner in the terminal, the status bar, "Уведомления" or an open menu. Focus
  moving from "Окружение" to the check bar or the top bar does not remove it, because the learner has not
  reached the outcome yet;
- "Отправить ответы" starts a send: a new outcome is coming, and the old notice would contradict it (the press
  is also a press in the panel; stated so no implementation keeps a notice across sends);
- the learner leaves the page.
The notice has no close button.

**Announced once, never twice.**
- The notice is set once per away-answer. Only one send can be pending (the button is busy until the answer),
  and every next send removes the notice when it starts (Removal), so a notice never stands next to a newer
  result in the panel.
- If a notice is still shown when another away-answer arrives (no flow above reaches this, because a new
  send needs a press in the panel, which removes the notice; stated so the app has one rule), the new text replaces the old in the same
  container, never a second notice: only the Alert title's text changes, and the Alert and its "Открыть квиз"
  stay, so focus on "Открыть квиз" stays there (`ia.md` R2, "Focus after a background change", item 5). When
  the new text equals the shown one, the title is emptied and its text set again at least one rendered frame
  later, so it is announced; otherwise the replacement is announced once by itself.
- Focus reaches the result block or the send error after the notice only by the learner's own action
  ("Открыть квиз", a press on it, focus moved into the panel) or by the R2 fallback when the element focus was
  on or was to return to is gone ("Removed while focused" below; `ia.md` R2 "Focus after a background
  change"). Each is a focus move to content the learner asked for or was left with, read once at that point;
  no live text is set again, so the outcome is not announced twice.

**"Открыть квиз".** Shows "Урок" in one-pane mode, selects the Квиз tab, sets `?tab=quiz`, removes the notice,
and moves focus to the element that holds the outcome: the result block (failed, passed, closed, refused), or
the send error (send failed), so the next Tab reaches "Отправить ответы", the retry. Why not the panel
heading as "Пройти квиз" does: this button exists for the outcome, and the result block and the send error
carry the detail the notice shortened (the description lines, the review below).

**Removed while focused.** Any removal trigger can fire while focus is on "Открыть квиз", because a pointer
press in Safari and Firefox on macOS moves no focus, and the window can widen without a focus move. One rule
for every case: if the trigger is a press on a focusable element in the panel (an option, a summary link,
"Отправить ответы", a code block with `tabindex="0"`, or a `tabindex="-1"` target: the panel heading, the result
block, the send error, the error summary), focus moves to that element by script; "Отправить ответы" is then the busy
button, which also holds the reason (Sending). Otherwise (the panel becoming shown without a focus move, a press
on text) focus moves to the element "Открыть квиз" would focus, the result block or the send error, which is
rendered then because no send is in flight. Never `body` (R2), and never an outcome element a new send is about
to replace. Whether focus was in the notice is read at `pointerdown`, before the browser blurs anything, because
by `click` a browser that does focus clicked controls has already moved focus out of the notice.

**Keyboard path.** Tab: skip link, top bar, then "Уведомления", where "Открыть квиз" follows the session
alert's "Войти снова" and the idle warning's "Продолжить работу" when they are shown (container order), then
`main`. `F6` to "Уведомления" lands on its first focusable element: "Войти снова", else "Продолжить работу",
else "Открыть квиз" (R3). Enter or Space activates.

### Question block

- Heading `h3` "Вопрос I из Q". In the review the heading also holds the verdict, a status icon plus the
  word "Верно" or "Неверно" (`.status-icon` success check mark or destructive cross), so heading navigation
  lists the verdicts. The verdict is a part of the heading of its own (a new composition for the
  ui-designer, design note §5), not `.icon-note`, which would make the heading muted body text.
- The prompt, rendered Markdown (`.prose`). A fenced block is a `pre` of the `.code-block` composition
  without its header (no "Копировать": copying a prompt helps nobody answer, and it would add a Tab stop
  per block); it keeps its lines and scrolls horizontally inside itself at narrow widths. Only when its
  lines overflow does it get `tabindex="0"`, so a keyboard user can scroll it (WCAG 2.1.1), together with
  `role="group"` and `aria-label="Код к вопросу"`, because a focusable element needs a name and the `pre`
  has none; a block that fits is no Tab stop, because there is nothing to scroll. When a resize makes a
  focused block fit, it keeps `tabindex="0"` until it loses focus and drops it then, so focus stays on it
  and never falls to `body`.
- For `multiple` only: the note "Засчитывается только точный набор ответов" (`.field-description`: the muted
  description tied to its control by `aria-describedby`, as on sign-in; not `.icon-note`, whose leading
  status icon would mark a rule as a status). It replaces the note "Несколько вариантов" of #50: every `multiple` prompt already ends with "Выберите все
  верные." (26 of 26), so "Несколько вариантов" would be read twice, while the exact-set rule is in no
  prompt and decides the score.
- The per-question error, only after a blocked send while the question is unanswered: "Выберите ответ"
  (`single`) or "Выберите хотя бы один вариант" (`multiple`), styled `.field-error`, plain text. Not the
  app's `FieldError`, which renders `role="alert"` (R2; the same reason sign-in uses its own
  `FieldErrorText`).
- The group: `role="radiogroup"` (`single`) or `role="group"` (`multiple`), `aria-labelledby` the `h3`,
  `aria-describedby` the prompt, then the note, then the error when shown. Each option is a label wrapping
  its radio or checkbox and the option text (inline code allowed); the whole label is the target. No
  letter prefixes: no UI refers to an option by letter.
- Why no `<fieldset>`: a `<legend>` permits only phrasing content and headings (MDN, legend), so a prompt
  with a fenced block cannot be the legend, and a legend holding only "Вопрос I из Q" would repeat the
  heading. Why the name is the heading and not the prompt: a name is read on every entry into the group,
  and a prompt of up to 10 code lines makes a name of hundreds of characters; the prompt is the
  description. The app uses shadcn RadioGroup (Radix: `role="radiogroup"`) and Checkbox with the same name
  and description.
- Review (F15.5): a static list, not inputs. Each option shows a drawn selection indicator
  (`aria-hidden="true"`), its text, then its marks as text: "Ваш ответ" (the learner chose it) and "Верный
  ответ" (in `correct`), each with an icon of its own shape, never colour alone (WCAG 1.4.1). A chosen wrong
  option shows only "Ваш ответ"; a missed correct one only "Верный ответ". Then the explanation: `h4`
  "Пояснение" and the rendered Markdown. Why static: the HTML `readonly` attribute does not apply to radios
  and checkboxes (MDN, readonly); `disabled` removes them from the Tab order and from the contrast
  requirement, so the learner's own answer would be faint; `aria-readonly` on a radio group still lets
  arrow keys move focus and, on native radios, change the checked one, so script would have to cancel keys
  on a control that looks operable. A static list has nothing to operate, and the words carry every fact.
- Exact-set scoring is visible three ways: the note under every `multiple` prompt (before and after the
  send), the verdict "Неверно" on a `multiple` question answered with only part of the set, and the marks
  showing which option was missed or extra. The score never shows partial credit.

### Quiz check row in Проверки

The row follows `checks.md` "Check row fields" (status icon, title, status word, meta; open panel), with
these differences, because a quiz is answered, not run:
- Status words, each with the icon shape and token `checks.md` "Token rule" gives it (icon shape plus word,
  never colour alone):

  | Quiz state | Status word | Token, icon shape |
  |------------|-------------|-------------------|
  | no attempt sent | "Ответы не отправлялись" | `muted`, dotted ring (the token rule's "no result yet", as "Не запускалась") |
  | latest attempt failed, quiz open | "Не пройдено" | `destructive`, cross |
  | passed | "Пройдено" | `success`, check mark |
  | closed | "Закрыта: не пройдено" | `destructive`, lock (`closed`) |

  "Ответы не отправлялись" replaces "Не запускалась" (a quiz check is never run, so "not run" reads wrong;
  the words name what the learner does, "Отправить ответы"). "Не запускалась", "В очереди", "Идёт" and the
  timeout, format-error and runner-error words never apply: a quiz is not in a run (`checks.md`, "Run
  composition").
- Meta: "Осталась 1 попытка" with the warning icon while exactly one attempt remains (limit known), #69's
  `[data-tone="warning"]` element unchanged; never the timer or "лимит M:SS".
- Open panel, in order: the counter "Неудачных попыток: N" or "Неудачных попыток: N из M", then "Пройти
  квиз" while an attempt can be made (not passed, not closed). No closed note: #69's "Проверка закрыта:
  попытки исчерпаны. Сброс рабочей папки и перезапуск окружения её не откроют." speaks of the working folder
  and the environment, which a quiz does not use, and its first sentence repeats the status word, the lock
  and the counter "3 из 3"; the quiz panel's closed result block says the rest. After a pass or close the row
  has no action, because "Пройти" would be false and the Квиз tab, which shows the review, is in the same tab
  list. "Пройти квиз" is the first action inside a check row panel (#69's panel holds none but the
  "Подробности" disclosure): its Button variant and size are a gap for the ui-designer (design note §5).
- "Пройти квиз" selects the Квиз tab, sets `?tab=quiz` and moves focus to the panel heading, as "Открыть
  результаты" does for Проверки (F13.4).
- If "Пройти квиз" holds focus when a pass or close removes it (the learner is away on Проверки while a send
  from the Квиз panel is answered, or another browser tab passed the quiz and a re-read shows it), focus moves to
  the quiz row's own disclosure button (`ia.md` R2, "Focus after a background change", item 2), never `body`.
- The kind word is not shown: every quiz title already begins with "Квиз:", and showing the kind column
  is the DESIGN task `checks.md` "Check kind" names.

### Focus targets

| Event | Focus moves to | Why |
|-------|----------------|-----|
| send blocked (unanswered) | the error summary | GOV.UK error summary: focus must move to it on submit; no live region needed |
| a summary link activated | the first option of that question (its first radio or checkbox), scrolled into view with its heading; focusing does not select it | GOV.UK: links go to the first input of the group |
| answering removes the summary or the link that holds focus | the option just changed ("Error summary and per-question messages") | the place of the action; never `body` |
| "Отправить ответы" pressed, every question answered | the button (busy, `aria-busy` plus `aria-disabled`, label "Отправляем...", R1 "Войти" pattern): kept there after a key press, moved there by script after a pointer press the browser did not focus (Safari, Firefox on macOS); answers locked ("Sending") | the busy label is the reason |
| a result arrives (failed, passed, closed, refused), the learner not away: everything the "Away" definition does not name, for example, with the Квиз panel shown, focus in the panel, in the left-pane tab list (the Квиз tab), on the breadcrumbs, the lesson header, the prerequisite alert links, the one-pane switch tab "Урок", in the check bar, in the top bar with no menu open, or on `body` | the result block, scrolled into view | a focus move needs no live region (WCAG 4.1.3 covers messages that do not take focus) |
| the send fails, the learner not away | the send error, scrolled into view | as above; the next Tab reaches "Отправить ответы", the retry |
| any answer to a send or a retry while the learner is away (the Квиз panel is not shown, or focus is in the region "Окружение" (R3), in a menu or dialog opened from it, on the split handle, in the region "Уведомления", or in an open menu or modal dialog anywhere on the page) | none: focus stays where it is, unless the answer removes the focused element (next row); a send's outcome is announced by the quiz notice (P9) and waits in the panel for its next showing ("Answer while the learner is away from the Квиз panel") | never a jump out of the environment, a page alert, a menu or dialog, or another tab |
| any background change (an away answer, a run end, a re-read, an idle stop) removes, hides or makes unfocusable the element that holds focus or that "Продолжить работу" returns to: "К окружению" or "Переподключиться" in S3 (P8), "Пройти квиз" after a pass or close, the busy button or an option replaced by the review, the idle warning removed by an idle stop | the first that applies of `ia.md` R2 "Focus after a background change": in the Квиз panel the result block or send error; in an open check row panel that row's disclosure button; in "Проверка" "Проверить"; in "Окружение" its R3 landing; in "Уведомления" the idle warning's "Продолжить работу" to "Запустить снова" (or the switch tab "Окружение" in one-pane mode with "Урок" shown, F10.3), the quiz notice by its own removal rule, and a replaced notice text keeps focus on "Открыть квиз"; else the R3 landing of the shown pane | one rule for the page, one target per place; never `body` |
| "Открыть квиз" in the quiz notice | the result block, or the send error after a failed send | the outcome the button names; next Tab reaches the retry |
| the quiz notice removed while focus is in it (read at `pointerdown`), by a press on a focusable element in the panel (an option, a summary link, "Отправить ответы", a code block, or a `tabindex="-1"` heading, result block, send error or summary) | that element, by script ("Отправить ответы": the busy button) | the learner's own target; never an outcome element a new send replaces |
| the quiz notice removed while focus is in it, any other trigger (the panel shown without a focus move, a press on text in the panel) | the element "Открыть квиз" would focus | never `body` (R2) |
| focus enters the shown Квиз panel from elsewhere while the notice is shown | where the learner moved it; the notice goes silently | the panel now shows the outcome itself |
| "Пройти квиз" in the quiz check row | the panel heading `h2` | as "Открыть результаты" |
| quiz load error, "Повторить" pressed | the panel heading `h2`, at once, while the loading state replaces the error ("Loading") | "Повторить" is removed; the heading heads what replaced it |
| quiz load error, "Повторить" loads | stays on the panel heading `h2` (R2 retry table) | the heading of what replaced the block |
| quiz load error, "Повторить" fails again, the learner not away | "Повторить" itself (R2 retry table; silent, FU6), described by the Alert title | as the lesson text load error |
| page load, any state (first visit, return after a failed attempt, a pass or a close, restore after sign-in) | none: the page start, as every load | a result found on load is page content, not news |

A heading or message that takes focus has `tabindex="-1"` and draws the ring inset (`design/system/README.md`,
"Focus ring"). The quiz panel holds no live container (R2): every message after an action takes focus unless
the learner is away. The quiz's one live container is the quiz notice container in "Уведомления" (P9), used
only when the learner is away.

**Success:** "Квиз пройден" with "Верно C из Q.", the review with explanations; the quiz check row reads
"Пройдено". A passed quiz takes no further attempt (Stepan's P5): its answers are open, so another attempt
would score nothing (course rule "answers open after a pass"); this also matches sticky pass S1 of
`checks.md`.

**Error states:**
- Sending fails (network, server, timeout): the send error "Ответы не отправлены. Попробуйте снова." takes
  focus; the answers stay selected and editable; the retry is "Отправить ответы" itself, with no
  "Повторить", because both would do the same (one label per action). The server counts an attempt at most
  once: the send carries a client attempt id, so a retry after a timeout that the server did record returns
  that recorded result instead of a second attempt (#36). The message does not say the attempt was not
  counted, because after a timeout the page cannot know. When the recorded send changed the lesson status
  (a pass or a close that finishes the lesson), the retry's result block (or the quiz notice) carries the lesson
  line after any read that did not show summary 5 or 6 since "Отправить ответы" was pressed (for example a
  visibility re-read that applied P7 or P8 silently, `checks.md` B27), because nothing else in this page view
  says it; a run end or a re-read (B9, B10) that showed summary 5 or 6 since the press has said it ("Lesson
  outcome after a send", "Send window").
- The quiz changed elsewhere (another browser tab sent an attempt, passed or closed the quiz): the send is
  refused and counts nothing; the page shows the quiz as the server now has it, with focus on the result
  block (unless the learner is away; then the notice, rows 9-11 of "Quiz notice (P9)"). The result block of a
  refusal starts with the line "Ответы не приняты: квиз изменился в другой вкладке." (its title, because it is
  the news), then the quiz's current state, never presented as this send's result:
  - quiz still open: the latest result of the other browser tab as "Последний результат: Верно C из Q. Нужно
    K.", the new attempt line in the header, and the learner's unsent selection kept, with no "Ответы
    остались выбранными. ..." line, because these answers were never scored;
  - quiz now passed or closed: the review, with "Квиз пройден" or "Квиз не пройден: попытки исчерпаны", the
    lesson line when the lesson status the page reads changed since the page last read it ("Урок пройден" or
    "Урок завершён: не пройден. Пройдено: N из M", as "Lesson outcome after a send" defines it; none when the
    check bar already shows summary 5 or 6 for it), and "Ниже верные ответы и пояснения." after the refusal
    line.
  The notice row 9 says the same fact ("Ответы квиза не приняты: квиз изменился в другой вкладке."), and rows
  10-11 the same current state with the same lesson line. The check bar follows P7/P8 by that current state
  (row "refused" of "Check bar after a quiz send"). The panel does not re-read on its own when the browser tab becomes
  visible, because the next send finds the change and nothing is lost before it (accepted).
- The quiz cannot be loaded: "Не удалось загрузить квиз" with "Повторить" replaces the panel content under
  the heading (the plain destructive Alert of "Loading" above); focus per the table above.
- Session expired while answering (F2): a 401 on send or load shows the F2.1 session alert in "Уведомления",
  never the send error. Selected answers are kept in `sessionStorage` under the lesson id, the check id and the
  attempt number on every change, so the same-tab round trip through sign-in (F2.2-F2.4, back to
  `?tab=quiz`) restores them, with no message (the learner sees the answers where they left them, and a
  message would need focus or a live container). They are dropped when the server's attempt number differs
  or the quiz is passed or closed, and cleared after a successful send. A different browser tab or a closed
  browser starts from the server's state.
- Leaving the Квиз tab and coming back keeps unsent answers (they live above the tab panels or in
  `sessionStorage`, #36), because Radix may unmount an inactive panel.

**Empty states:** no quiz check: no Квиз tab, no quiz check row. Before the first attempt: the quiz check row
reads "Ответы не отправлялись" and the panel shows the questions with no result block. Проверки shows
"Попыток пока нет. Нажмите "Проверить", когда будете готовы." (`checks.md` "Empty states") only while no
counted check has an attempt, every `command` check row "Не запускалась" and the quiz check row "Ответы не
отправлялись", because the learner cannot tell the history's "попытка" from the quiz row's, so once a sent
quiz shows "Неудачных попыток: N" or "Пройдено" beside it the text would read as false. A lesson with two
quiz checks does not exist (13 lessons, one each) and is not designed: the quiz.yaml validation (#36)
rejects it.

**Exit:** F15.5 or F15.6; any other tab (answers kept), also while a send is going (its outcome is announced
by the quiz notice and waits in the panel, "Answer while the learner is away from the Квиз panel"); the
check bar; the top bar.

**Keyboard path:** Tab order inside the panel: the result block and the summary are not Tab stops (they
take focus only by script); the summary's links; then per question the prompt's code block when it
overflows, then the group: a radio group is one stop (focus lands on the checked radio, or the first when none is
checked; Space checks the focused radio; arrow keys move focus and also check the next or previous radio,
so arrowing through the options changes the answer, WAI-ARIA APG Radio Group and Radix RadioGroup), each
checkbox is its own stop (Space toggles). "Отправить ответы" is last. Enter on an option does not send (no
implicit form submission), because an accidental send spends an attempt; only the button sends. In the
review the questions hold no Tab stop except overflowing code blocks. While sending, the options stay in
the Tab order, locked ("Sending"). The quiz needs no terminal: `F6` and the region
order are R3's, the quiz is inside "Урок".

**Narrow widths and zoom:** in one-pane mode (below 1024 px, down to 320 px, and a 1280 px screen at 200 %
zoom) the quiz is in the "Урок" pane at full width; options wrap under their control; only a prompt's code
block scrolls horizontally, inside itself; the page never scrolls sideways (WCAG 1.4.10); each option label
is at least 24 px high (WCAG 2.5.8).

**Time limits:** none (no source asks for a timed quiz). The environment idle stop (F10) and the session
(F2) are unchanged: a learner answering a quiz for a long time may see the idle warning in "Уведомления";
answering is not terminal input, and a stopped environment does not affect the quiz. `correct` and
`explanation` reach the browser only once F15.5 holds (#36).

## Requirements for #36

The quiz design depends on these; each comes from #70 research §9 and is a requirement of #36 (dev) or of
the issue named.

1. Explanations, correct options and per-question verdicts reach the browser only after a pass or the
   closing failure, never with a failed attempt's response (task.md; F15.4). "Explanations after
   submission" in #36 is read that way.
2. Delivery against ADR-0009: the web image holds no `quiz.yaml` and the e2e leak scan forbids its text.
   #36 decides (ADR-0009 change with a server-side strip, or answers moved under `checks/`) and splits the
   leak guard: prompts, options and the check `title` allowed, `correct` and `explanation` forbidden until
   F15.5, with e2e for both sides.
3. A validated quiz.yaml shape: unique question and option ids, `correct` within the option ids, exactly
   one correct for `single`, at most one quiz check per lesson.
4. Scoring: exact set for `multiple`; `requiredCorrect` (K) computed on the server as the smallest integer K
   with K / Q >= `passScore` by the server's own comparison, never `ceil(passScore * Q)` (in doubles
   0.7 x 10 = 7.000000000000001), sent with the quiz; the page never computes it (P2).
5. Attempt number A, limit M (from #68, R7) and the states open, passed, closed. Before #68 nothing closes the
   quiz unless the server reports it.
6. An idempotent send (client attempt id) and a refusal with the current state when the attempt number is
   stale (Error states).
7. The last submitted answers of the latest attempt are returned on load (stored server-side, for example
   in `check_results.details`, ADR-0007), so "answers stay selected" holds after a reload, and the review
   can mark "Ваш ответ".
8. A 401 on send or load leads to F2, never to the send error.
9. Tests the app must pass: following a summary link focuses without selecting; Enter on an option sends
   nothing; switching tabs keeps unsent answers; no `role="alert"` and no new live container in the quiz
   panel; while sending, a click, Space or an arrow key on an option changes nothing and the options stay
   in the Tab order; removing the error summary while a link in it has focus moves focus to the option just
   changed; a quiz send sets no text in the check bar status line; a quiz pass or close after a summary 7
   that it makes untrue empties the line and keeps "Открыть результаты" (P7); a quiz send that reaches S3
   leaves the line empty, gives "Проверить" "Проверки завершены" and shows "Открыть результаты", with
   nothing announced from the check bar (P8); a mouse-only send in Safari and in Firefox on macOS (focus on
   `body` before the press) puts focus on the busy button, then on the result block or send error scrolled into
   view, and sets no notice; with the Квиз panel shown, a send answered while focus is on the Квиз tab trigger
   (reached by Shift+Tab from "Отправить ответы" through the panel), on a breadcrumb, in the check bar or in the
   top bar with no menu open also focuses the outcome and sets no notice, and with the panel not shown (another
   tab selected, or one-pane mode with "Окружение" shown) a send answered while focus is in the check bar, the
   top bar or on `body` sets the notice and moves no focus; a send answered while the learner is away (the Квиз
   panel is not shown, or focus is in the region "Окружение" (R3), in a menu or dialog opened from it, on the
   split handle, in the region "Уведомления", or in an open menu or modal dialog anywhere on the page), tested
   for each place of the "Away" table (another tab, one-pane "Окружение", the terminal, "Действия" after `F6`,
   the open "Действия" menu, the open user menu, which keeps focus, "Продолжить работу" in the idle warning, the
   open "Сбросить рабочую папку?" dialog, which keeps focus, the split handle, the budget confirmation from #37 /
   #39), leaves focus there, applies the outcome, and
   shows it on the next showing of the Квиз panel (result block or send error, answers kept), for each
   outcome: failed, passed, closed, send error, stale-attempt refusal, and the S3 corner; a resize that makes a
   focused prompt code block fit leaves focus on it; for each of those outcomes answered while away, the quiz
   notice container (present and empty from load, `role="status" aria-live="polite"`) gets the notice text of
   "Quiz notice (P9)" exactly once; with the user menu open, and with the "Сбросить рабочую папку?" dialog open,
   when the answer arrives, the notice container and every ancestor of it carry no `aria-hidden` and the
   notice text is announced by a screen reader (the F2.1 and F10.1 containers likewise keep no `aria-hidden`);
   after the answer, with focus on "Продолжить работу" and the busy button as the element focus had before
   entering "Уведомления", pressing "Продолжить работу" after a pass, a close or a refusal that finds the quiz
   passed or closed (the button is gone, the options are the review) moves focus to the result block, never
   `body`, and empties the notice container, while after a failed attempt or a refusal that finds the quiz open
   it returns focus to "Отправить ответы", which also empties the notice container (focus moved into the shown
   panel); with Задание selected and focus on the check bar's "К окружению", a closing send that reaches S3
   removes "К окружению" and moves focus to "Проверить" (`aria-disabled`, "Проверки завершены"), never `body`, and
   sets the notice; with Проверки selected, the quiz check row open and focus on "Пройти квиз", a pass removes
   "Пройти квиз" and moves focus to the quiz row's own disclosure button, never `body`, and sets the notice; the
   quiz notice container and the F10.1 container hold no `[role="alert"]` or `[role="status"]` descendant (the
   notice Alert renders with no role); the check bar status line gets no text, and no second announcement follows: opening Квиз by
   its tab empties the container and moves no focus; "Открыть квиз" shows "Урок" in one-pane mode, selects
   Квиз, empties the container and focuses the result block or the send error; no notice is set for a 401 or a
   load; `F6` to "Уведомления" lands on "Открыть квиз" when it is the region's only control; with two panes
   and Квиз selected, a send followed by a click into the terminal sets the notice once while the panel stays
   shown, and the notice is emptied silently when focus comes back into the panel (Tab, Shift+Tab, `F6`) or a
   pointer press lands in it, and at the latest when "Отправить ответы" starts the next send, so no notice is
   ever shown next to a newer result; moving focus from the terminal to the check bar keeps the notice; with
   focus on "Открыть квиз", a mouse press (Safari, Firefox on macOS) on an option or on "Отправить ответы"
   removes the notice and moves focus to that control (the busy button for the send), and a press on text
   in the panel or a widening to two panes removes it and moves focus to the result block or send error, never
   `body`; a second away-answer while a notice is shown replaces its title text in the one container (an equal text
   is re-set after an empty frame) and, with focus on "Открыть квиз", leaves focus there; each notice text equals one row of "Quiz notice (P9)" exactly; a refused
   send answered while the learner is not away focuses a result block titled "Ответы не приняты: квиз
   изменился в другой вкладке.", then "Последний результат: Верно C из Q. Нужно K." (quiz open, no "Ответы
   остались выбранными" line) or the review (passed, closed), and the same refusal while away shows notice
   row 9, 10 or 11; a refusal that finds the quiz passed or closed by another browser tab applies P7 to an
   untrue summary 7 (line emptied, "Открыть результаты" kept) and P8 in S3 ("Проверить" `aria-disabled`
   "Проверки завершены", "Открыть результаты", empty line), sets no text in the status line, and says the
   lesson outcome once (the refusal result block's lesson line, or notice row 4, 5 or 7 when away; during a run
   the run's end text repeats it, accepted, "Check bar after a quiz send" row "1, 2 or 3"); a refusal
   that finds the quiz still open leaves the check bar unchanged; with the check bar line at summary 5 or 6 set
   by a re-read when the browser tab became visible (`checks.md` B9, B10) after another browser tab passed or
   closed the quiz and then ran "Проверить" to the end (a quiz send alone is B27 there and sets no line
   text, item 11), while the Квиз panel still shows it open, a send is refused, the check bar keeps its text
   and controls, and neither the refusal result block nor the notice (row 3 or 6 text) carries a lesson line.
10. History and arrival (the app and the prototype, "Prototype and history requirements" below): arriving at
   the lesson with `?tab=quiz` (the F2 return through "Войти снова" `next`, a typed URL) opens the Квиз tab in
   the restored state, never Теория.
11. Quiz attempt records (added at the merge of #72 with #70, `progress.md` A72-17; for #36 unless another
   issue is named), because the attempt history (#35, `progress.md` F19) and the check bar (#34, `checks.md`)
   read the same `attempts` table:
   - One record per answered send. Each answered send (failed, passed or closing) writes exactly one
     `attempts` row holding exactly one `check_results` row, the quiz check's (`check_kind = 'quiz'`),
     inserted already finished (status `passed` or `failed`, `finished_at` set) in the transaction that
     evaluates completion (ADR-0007 item 5, "Atomic finish"), never `running`. A refused send (item 6, stale
     attempt number) writes none; a send repeated with the same client attempt id returns the recorded
     result and writes none, so one client attempt id has at most one record.
   - C and Q per result. C and Q of that send are stored with its result (for example as fields of
     `check_results.details` beside the answers of item 7, Q as the quiz stood at that send), and the
     history read serves a quiz result as its status and C and Q only: never `details`, the answers, the
     verdicts or `correct` (item 1).
   - Run-only fields (#34, which serves the check-state read). `latestFinishedAttempt` and
     `runningAttemptId` never name a quiz attempt record, and #34's lock on a running run never sees one, so a
     quiz send never changes the run baseline (`checks.md` "Baseline of a re-read"), never makes a re-read
     B8, B9 or B10, never sets a run's end text and never attaches; a visibility re-read that finds only a
     quiz change is `checks.md` B27 (P7 or P8, silent).
   - History read (#35). The check-state read serves `latestAttemptRecordId`, the newest finished record of
     the lesson of either kind (`progress.md` F19 Loading, "History baseline"); the check-state re-read after
     an answered or refused send, and every visibility re-read, read the history in the same server read;
     the history lists quiz attempt records with the runs, numbered "№ N" (`progress.md` A72-10).
   - Cost. A quiz result spends nothing: its `cost_usd` is null, read as zero (ADR-0007 item 11).
   - Mentor review (#37). A review asked for by "Разобрать с ментором" in the closed quiz block (F15.6) is
     stored with the quiz attempt record of the closing send as its `attempt_id` and the quiz check as its
     `check_id`, so the history shows it in that record's panel (`progress.md` F19.2).
   - Tests: two answered sends in one page view give two records and two history rows; a refusal and a
     repeated client attempt id add none; after a send the next visibility re-read sets no text in the
     status line and shows no run's end (B11 or B27, never B9); a send in another browser tab followed by a
     visibility re-read sets no status line text, applies P7 or P8 silently, and from #35 shows the new
     history row in the same render as the changed quiz check row; the history response for a quiz result
     holds C and Q and no `details`.

## Prototype and history requirements

Behaviour the prototype (author phase) and the app must meet; how the prototype implements it is the author
phase's, built against main after #69 merges (Stepan's decision for round 4), not designed here.

- Arrival with `?tab=quiz` (the F2 return through the `next` of "Войти снова", a reload, a typed URL) opens
  the Квиз tab in the restored or loaded state, never Теория, and keeps `?tab=quiz` in the URL. A lesson
  without a quiz check falls back as the Navigation model says.
- The app: a tab change replaces the query with no history entry (`design/pages/lesson/acceptance.md:15-16`
  and AC17 at `:445`), so Back after "Пройти квиз"
  or "Открыть квиз" leaves the lesson page as Back from any tab does; the notice removed by "Открыть квиз" is
  not restored.
- The prototype: each simulated action is one history entry, and Back after "Пройти квиз" and after
  "Открыть квиз" returns to the previous state exactly as it was: the same selected tab and shown pane, the
  same panel content, the quiz notice shown again where the previous state showed it (and not shown beside
  the Квиз panel), and focus on the control that was activated, or, when that control lived in a notice that
  was re-rendered, on the re-rendered control. Forward after Back repeats the action's result. A reload of
  any state shows that state with its tab.

## Seams with `checks.md` (for the merge with #69)

Each item is a line the merge or the author phase's rebase must change; none is mechanical. "main" below
is main at e469b09 (#69 merged), before this branch's merge; the merge of e469b09 applied every item
except FU8's and the author phase's.

- `checks.md` "Status of one check" picks "Не запускалась" when nothing else holds; for the quiz check row
  that word is "Ответы не отправлялись" (above). One sentence in `checks.md` pointing here is needed when
  #69 has merged.
- "Nothing to run" in `checks.md` covers S3 and S12. A lesson whose `command` checks are all closed while
  its quiz is open has nothing for "Проверить" to run and is neither case: "Проверки завершены" would be
  false there. Owner: the checks design (follow-up in `ia.md`, FU8).
- The check bar after a quiz send ("Check bar after a quiz send" above) reads `checks.md` "Check bar status
  line", "Run composition" and the re-read rows B8-B11 of "Background changes and focus" of #69 (also used by
  "changed since the page last read it", "Lesson outcome after a send"), and departs from two of its statements: "Открыть результаты" is shown
  "while the status line holds an end text" (P7 and P8 show it with an empty line), and in S3 the line holds
  summary 6 (P8 leaves it empty until a reload). The merge adds to `checks.md` one sentence under the summary
  table (the notes' scope and these two exceptions, pointing here) and one row to "Background changes and
  focus" for a quiz send (status line emptied, not announced; the P8 control changes; focus moves only when a
  removed control had it: "К окружению" or "Переподключиться" to "Проверить", as B10, and "Пройти квиз" to the
  quiz row's disclosure button, as the open-row cases B8-B10, B14).
- `ia.md` R2, "Focus after a background change": #69 already states the same rule for the checks (main
  `ia.md:226-236`: R3 landing of the region as it now is, "Проверить" in the check bar, the row's own disclosure
  button in an open row panel, "Проверить" when the budget confirmation closes, B1-B25 as its cases), and every
  B row that moves focus on a background change (B8-B10, B14, B22, B23) matches this branch's order. This
  branch's bullet is wider: the Квиз panel (item 1), "Уведомления" (item 5: the idle stop's F10.3 target, F2.1,
  the quiz notice), the fallback to the shown pane's R3 landing in place of "the first focusable element of
  "Урок"" (item 6), the return target after "Продолжить работу", and `aria-disabled` keeping focus. The merge
  keeps one bullet, this branch's, folding in #69's B6 / B23 sentence (already quoted) and its pointer to `checks.md` B1-B25, and
  changes #69's "Продолжить работу" sentence (main `ia.md:200-202`) to this branch's.
- `ia.md`, the quiz set's Where: this branch cites "Осталась 1 попытка" in the check row note set, where it
  is on main. #69 moves it to a new "check row meta" set (main `ia.md:64`, row "check row meta"; the counters
  stay in "check row note"). The merge rewrites the citation: "the check row meta set ("Осталась 1 попытка",
  also in the quiz header) and the check row note set ("Неудачных попыток: N", "Неудачных попыток: N из
  M")".
- `ia.md`, the check status set's Where: this branch narrows "quiz check row (F15)" to the three words it
  uses. #69's row (main `ia.md:63`, row "check status") has the same "quiz check row (F15)"; the merge applies
  the same narrowing there.
- `ia.md`, the lesson status set's When: #69 adds "The lesson page never shows a lesson status; its check
  bar says "Урок пройден" or "Урок завершён: не пройден. Пройдено: N из M" from the same server status". From
  #36 the quiz result block says it too after a send that changes it; the merge appends "and so does the
  quiz result block after a send that changes it (`quiz.md`, "Lesson outcome after a send")".
- `ia.md` vocabulary, `ia.md` R7 and `checks.md` R7 table: #69 writes the quiz attempt line as "Попытка N из
  M" / "Попытка N" in three places (grep of main `design/`): main `ia.md:33` (row "attempt (one check's
  result)"), main `ia.md:433` (R7: "A quiz follows the same rule ("Попытка N из M" / "Попытка N", D2)") and main
  `checks.md:204` ("Attempt limits" row "quiz attempt line"). This branch's letters are "Попытка A из M" /
  "Попытка A" ("Placeholders" above); the merge rewrites all three. (main `ia.md:73`, the quiz set row, is
  replaced by this branch's row, and main `quiz.md:35-39` is dropped with #69's paragraph.)
- `ia.md`, the check bar status line set's Where: this branch adds "emptied silently by a quiz send that
  makes its text untrue or leaves nothing to run (P7, P8)". #69's row (main `ia.md:66`, row "check bar status
  line") rewrites that cell ("empty on load except in the nothing-to-run state"); the merge appends the same
  clause to #69's text.
- Strings that exist only in #69's register and arrive with its merge, before this branch's rebase:
  "Проверки завершены" (disabled reason), "Урок завершён: не пройден. Пройдено: N из M" (check bar summary 6,
  quoted as the result block's lesson line), and the summary 7 notes "Закрытых проверок: N", "Осталась 1
  попытка" (as a check bar note), "Проверок на последней попытке: N", "Проверок со сбоем: N". On this branch's
  `ia.md` they are not yet registered; the rebase on #69 closes the register, and the author phase starts
  only after it (P1).
- `ia.md`, the quiz notice (P9): this branch edits the page alert set (notice strings), Action labels ("open
  the quiz outcome from the quiz notice", "Открыть квиз"), R2 (a third container in "Уведомления"; the focus rule when the notice
  goes; the explicit `aria-live` on every live container and no live role inside one; "Focus after a background change",
  item above), R3 (the "Уведомления" landing rows) and the Navigation model's list of page-level alerts. The "Away"
  table also names #69's check bar "Переподключиться" in "Проверка" (main `ia.md:252`, R3), which this branch's
  R3 ("Проверка", ea9c8a1 `ia.md:253`) does not list yet; the merge brings it with #69's R3 text. #69 keeps
  each of these rows or bullets with its main text (main `ia.md:72` page alert row, Action labels `:95`,
  R2 `:174`, R3 `:239`, Navigation model `:469`); the merge applies the same additions to #69's text. #69's
  lesson prototype has the "Уведомления" wrapper with two containers (`page-alert`, `page-status`, main
  lesson `prototype.html:121-125`); the author phase adds the third.
- `ia.md` closed-set placeholder sentence: this branch extends it with the quiz letters; #69 has the same
  sentence unchanged, so the merge keeps this branch's.

## Not designed here

- The check kind column (`checks.md`, "Check kind").
- The mentor review of a closed quiz and A12's automatic review (#37, `mentor.md`).
- The lesson status after a closed quiz against ADR-0007 sticky completion and A19 (follow-up in `ia.md`,
  FU7).
- A quiz-only lesson's check bar beyond the existing `checks.md` sentence (no such lesson exists).
- A timed quiz, shuffled options, partial credit, retakes after a pass (P5; an unscored practice mode would
  be a task of its own).