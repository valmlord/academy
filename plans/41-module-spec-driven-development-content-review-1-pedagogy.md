# #41 content review, round 1: judge-pedagogy

Module: `course/ai-for-developers/01-spec-driven-development` (7 lessons, built, validate green).
Against: design revision 7 (`plans/41-module-spec-driven-development-design.md`, sections 1, 4, 5, 7), my
design-round reports 1-6, `docs/course-reference.md` (via design section 8), `learner/profile.md`,
`learner/journal.md` (empty), student reports A (L1, L5, L7; rounds 1-2), B (L2, L3, L4; rounds 1-3),
C (L6), demo records A and B (for the status of open items).
Verdict: FAIL. 2 blocking items (both L2, lesson-author), 1 merge condition, 8 non-blocking.

## What I checked

- module.yaml: six outcomes verbatim from design section 1, observable verbs, 7 lessons in order, `status: ready`.
- Every lesson.yaml: outcome copied in full; `estimatedMinutes` 80/50/50/70/65/45/66 = 426 (L7 66 per
  the post-design change); prerequisites form the L1 -> L7 chain.
- Every theory.md opens with "## Проблема" and the design's problem text verbatim (L1-L7), and the
  idea follows from the problem, not from definitions. Teaching before testing: each quiz key of L1, L2,
  L7 read against its theory (L3, L4 quiz topics against theory headings); L2 Q4 fails (B2).
- Concept order (design section 4) in the built text: mutant and requirement id appear in L1 theory before
  L5/L7 messages use them; `disable-model-invocation` in L2 before L5 uses it; glossary format and grilling in
  L3 before L4/L6; WHEN...SHALL, ADR, vertical tasks in L4 before L6/L7; C1-C6 numbered only in L7 (L5
  item 5 spells the four rules in words, as designed); `converge` only in L7 (L4 points forward). Holds.
- "Готово, когда" vs checks (rule 2.9), spot checks: L1 stage 0 (`sdd_static.py:14-15` five skip names,
  `MIN_TESTS_STAGE0 = 3`, stdlib by `sys.stdlib_module_names`) equals items 1 and 6; L2 constants
  (`verify_skills.py:42-62`: 20 lines, 250 words, 6-word sequences <= 20, markers, 0.5 copy share, 20 chars)
  equal items 6-7; L2 item 9 vs `checks/rubric-skills.md` criteria 1-4 (content equal, see N1); L4 items 1-12
  and the rubric summary vs `checks/rubric-sdd.md` (criteria 1, 2, 4 levels copied correctly); L6 items vs
  `bugs.yaml` (`maxReports: 7`, `maxDecoyHits: 1`, `minFound: 5`); L7 token table vs student A round 2
  (surface token, file free, C4 sub-cases, C2+C3 double, duplicate number two lines) and stage 0 "ваш линтер
  здесь не запускается". Method advice sits in "Как работать (совет, не проверяется)" in every task.md.
- Time vs student runs: L1 80 vs ~80; L2 50 vs 40-45; L3 50 vs 35-40; L4 70 vs 60-70; L5 65 vs ~60;
  L6 45 vs 40-47; L7 66 (linter 28) vs ~66 (linter ~30). Realistic. Hands-on 55+30+30+50+45+33+46 = 289 of 426
  (67.8%), every lesson >= 60%.
- Style: no em or en dashes and no curly quotes in any lesson `.md`/`.yaml` (one hit is the vendored upstream
  `to-tickets/SKILL.md`, verbatim by design). Text is short in theory; task.md files are long where the
  checks force it (L1 item 4, L2 item 7, L4 item 8, L7 table) - see N1, N2.
- Every student unclear place, round by round, against the built text (table below).
- Reference program: deviations are the ones the design justified in section 8; no new ones in the build.

## Student unclear places: status

| Report | Item | Status |
|---|---|---|
| A r1 L1 | exec bit claimed, files are 0644 | open (demo A "Open"); merge condition M1 |
| A r1 L1 | must my code raise the domain `TypeError`? | resolved, task.md:61-65 |
| A r2 L1 | out-of-domain test red locally | resolved, task.md:165-167 |
| A r1 L5 | latest `sent_on`, duplicate ids, Dispute | resolved, pinned in spec; task.md:55-56 |
| A r1/r2 L7 | C6 token, stage-0 wording, file part, C4 cases, C2+C3, C5 scope, duplicate number | resolved, task.md:57-85, 176-178 |
| A r2 L7 | linter part 22 too low | resolved, 28 min, lesson 66 |
| B r1 L2 | "кроме true/false" | resolved, theory.md:39-40 "помимо" |
| B r1 L2 | 120 vs 110 lines | resolved, task.md:15 |
| B r1 L2 | `${CLAUDE_SKILL_DIR}`, `$ARGUMENTS` untaught | resolved, theory.md:41-44 |
| B r1 L2 | theory says a tests `verify` changes the name's meaning, task requires exactly that | **open, B1** |
| B r1 L2 | quiz Q4 c "регистрируются при вызове" not in theory | **open, B2** |
| B r1 L2 | "не больше 2 строк" lines vs content | resolved, 6-word sequences, task.md:65-66, 135-138 |
| B r2 L2 | markers case-sensitive? | resolved, "пишутся как есть" task.md:60 |
| B r3 L2 | rubric C3 "any part", one pointer line, demo `bump.py` | resolved, rubric-skills.md:100-109; README:46 |
| B r1 L3 | language of definitions; where the polyseme reason goes | resolved, task.md:36-40 |
| B r2 L3 | "вторая строка под `# Ledger`" read literally | open, minor: N3 |
| B r1 L3 | non-crossing events on the map | accepted: rubric criterion 4 grades it |
| B r1 L4 | Dispute reading, Outstanding Balance, Check form | resolved (transcript Q7/Q8, task.md:75-82) |
| C L6 | rule 4 stale run; code defect not a category | resolved, theory.md:42-45, 66-73; task.md:31-39 |
| C L6 | 340-345 "Начать?" episode | not in any range by design; mentor note missing: N6 |

## Blocking

**B1. L2 theory contradicts the task on the `verify` name, and nothing says why (lesson-author).**
`02-skills/theory.md:102-110` ends with "`verify` на тестах меняет смысл этого имени для команды" (the
built-in `/verify` runs the app "without falling back to tests"), and task.md:21 and items 4, 6, 9 then
require exactly a tests-based skill named `verify`. Student B raised it in round 1 ("No sentence on why
that is the right choice here"); it was neither changed nor accepted. A senior learner reads a warning and
then an order to do the warned thing.
Required change: one or two sentences after theory.md:110 that state the trade-off the exercise takes,
from the facts already on the page: the project skill named `verify` is what the commit instructions
point at, so the team gets its test procedure run before each commit, and pays for it with a `/verify`
that no longer means the bundled app check; a team that wants both keeps another name and loses the
commit hook-in. No new claim beyond the cited source.

**B2. L2 quiz key `third-party-skill-risks` option c is not taught (lesson-author).**
`02-skills/quiz.yaml:61` option c "Хуки скилла регистрируются при вызове и продолжают работать до конца
сессии" is part of the exact correct set [a, c, d]. Theory says only "Хуки, которые регистрирует скилл,
остаются до конца сессии" (theory.md:126): when they start is not said, and a learner who thinks they
start with the session, like the description, drops c and loses the question. Student B round 1 flagged
it; not resolved.
Required change: theory.md:126 states when a skill's hooks start (on invocation, if that is what the
source says), quoting the source's own wording, so every part of option c is on the page. If the source
does not say "on invocation", the practice-designer rewrites option c to the source's wording instead.
The accuracy judge confirms the sentence.

## Merge condition (not a content defect; orchestrator / Stepan)

**M1. Exec bit.** `01-verification/task.md:23-24` and `:86-87` say the starter hook has the owner exec bit
("заготовка уже такая"); demo A "Open" (`plans/41-...-demo-A.md:227-230`) records all three starter hooks
and both reference hooks at 0644, and the agent shell guard cannot chmod them. An E1 or shell-without-
`python3` registration then fails stage 0 for a reason the text says cannot happen (uncounted, but wrong).
Module 00 closed the same item (D3) with Stepan's chmod. Before the PR: Stepan sets `+x` (or
`git update-index --chmod=+x`) on the five hook files, and `git ls-files -s` shows `100755` for them. If
that is not done, the text must stop claiming the bit instead.

## Non-blocking

- **N1 (practice-designer). L2 task.md:73-86, item 9** is one 14-line sentence. Rule 2.9 asks for every
  rubric criterion by name, as L3 (task.md:78-82) and L4 (task.md:152-166) do. Split it into the rubric's
  four criteria, numbered, one to three lines each; the content is already equal.
- **N2 (practice-designer). L2 task.md:61-71, item 7.** The word definition and the invisible-character
  list are anti-cheat detail an honest learner never meets. Keep the numbers (20 lines, 250 words, 20
  six-word sequences, no out-of-repo `@`, no invisible characters) in item 7 and move the definitions to
  the "что считается памятью проекта" reference block, which already explains the word split.
- **N3 (lesson-author). L3 task.md:39** "вторая строка под `# Ledger`" -> "вторая строка описания под
  `# Ledger`" (student B round 2).
- **N4 (lesson-author). L4 theory.md:71-85.** Rubric criterion 4 Q3 wants the rejected option named; theory
  says it only implicitly ("результат настоящего компромисса"; MADR's Considered Options). One line: "в
  ADR называют отвергнутый вариант и почему его не взяли".
- **N5 (practice-designer). L4 task.md:77-79** "группа коротких ключей с `h` до `k`, `s`, `p` или `t`" is
  hard to parse. Say what is rejected with two examples (`-h`, `-vh`) and what is fine (`-k test_req_05`).
- **N6 (practice-designer). L6 `checks/bugs.yaml`.** Add the mentor note student C recommended for
  340-345 (agent asks "Начать?", implements after the Stop-hook block without an answer): no range, reading
  "acted before confirmation" is defensible, a report there scores nothing. Also bring the header
  comment's rules 1 and 4 (bugs.yaml:9, 12) to the reworded task.md text; the per-bug walks already match.
- **N7 (practice-designer). L5 task.md:120-139.** "Попытки и подсказки" comes before "Как работать"; every
  other lesson has the reverse order. Cosmetic.
- **N8 (lesson-author). L2 quiz.yaml:48** uses " - " as a dash ("Редкая процедура с последствиями -
  скилл"); write "это" as elsewhere. Cosmetic.

FAIL
