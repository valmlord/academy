# STUDENT REPORT sdd-pipeline-bug-hunt (#41), student C

Lesson: `course/ai-for-developers/01-spec-driven-development/06-pipeline-bug-hunt/`.
Workspace: `scratchpad/student-C/` (copy of theory.md, task.md, starter/). Before the run only the
"Files" and "Method" sections of `plans/41-module-spec-driven-development-demo-C.md` were read (they
leak 6 bugs / maxReports 7 / maxDecoyHits 1, which task.md states anyway; no ranges).
Scoring: own copy of the 00 2.2 matcher (`scratchpad/student-C/tools/m.py`, same logic as
`scratchpad/l6/score.py`: file + category + line in range, maximum bipartite matching, decoy hits by
file + line in any category, report cap, format errors by index and field), run on the shipped
`checks/bugs.yaml` and `checks/data/reserve/pipeline-bug-hunt.yaml` converted by the real `yaml`
package (`node scratchpad/l6/y2j.mjs`), every Python run `-I`.

## Honest run: PASS (6/6 matched, 0 decoy hits, 6 reports)

| line | category | key range |
|------|----------|-----------|
| 115 | horizontal-ticket | 115-119 |
| 232 | test-tampering | 230-234 |
| 201 | skipped-red | 199-206 (alt 266-276) |
| 321 | tautological-test | 316-322 |
| 375 | claim-without-evidence | 375-377 |
| 101 | acted-before-confirmation | 88-104 |

Time. Agent wall clock is not comparable (theory+task 7 s, transcript 24 s, findings under 1 s);
estimate for a human of the profile: theory 10-12 min, transcript 25-30 min (410 lines, two passes as
task.md advises), findings 4-5 min. Total about 40-47 min, inside `estimatedMinutes: 45`.

## Unclear places
1. Rule 4 (`claim-without-evidence`) says "в этом месте нет команды и её вывода". The bug at 375 relies
   on "no run AFTER THE LAST CODE EDIT": a full green run exists at 364-367, just before the refactor
   edit at 371. A literal reader can say the evidence is there. Theory should say "после последней
   правки кода нет прогона", and its example should show a stale run, not a missing one. Non-blocking,
   but this is the subtlest of the six and the text does not teach the distinction.
2. Theory never says that a code defect itself (205 and 373 compute from `total_minor`, not the
   Outstanding Balance) is not a category. A learner who spots the real defect has nowhere to put it
   and may spend a report on it. One sentence ("сам дефект кода не категория, ищем подмену проверки")
   would help.

## Ambiguities (two reasonable readings)
1. 340-346: the agent asks "Начать?", the Stop hook fires (343, event), the agent implements without
   the user's answer. Reading A: `acted-before-confirmation` (it asked and did not wait). Reading B:
   not a bug (`/implement ... через /tdd` already authorised implementation; the hook forbids ending
   on red). The key has it in no range (neither bug nor decoy), so a report there costs nothing and
   matches nothing. A learner who chooses A and puts the acb report on 345 instead of 101 still passes
   with 5/6, but the mentor explanation never addresses the episode. Recommend: mention it in the key
   explanation / mentor notes; do NOT turn it into a decoy (reading A is defensible).
2. Anchor for Q7: the action is the Edit at 88, the wrong content is at 101-102, the announcement is at
   84. Range 88-104 accepts the first two; 84 (announcement) and 57-61 (the question) fall outside.
   Consistent with the anchor rule, fine.
3. Skipped-red anchors 199-206 and 266-276 both accepted, as the theory promises. Fine.

## Cheats tried (shipped key) -> result
- C1 both sides of every look-alike, 12 reports -> FAIL (12 > 7, 6 decoy hits).
- C2 honest 6 + one hedge on a decoy (361) -> PASS, needs real knowledge of all 6; allowed by design
  (`maxDecoyHits: 1`).
- C3 4 sure + both sides of two pairs (232/361, 321/326) truncated to 7 -> PASS, again needs 5 real
  finds; the hedge buys nothing beyond what the honest skill gives.
- C4 honest + free hedge on unregistered 345 -> PASS (no cost, see ambiguity 1).
- C6 right six lines, categories permuted at random (category rotation) -> 1/720 = 0.139 %.
- C7 one line reported under all 6 categories -> FAIL (1 match).
- C8/C9 `line` as float / bool -> format error (not an attempt, no information leaked).
- C10 `file: "./transcript.md"` -> FAIL (0 matches; exact string compare).
- A1 one report per category, uniform over that category's blocks (key ranges + decoys) ->
  38/8192 = 0.4639 % per attempt (= design 19/4096; 1.39 % over 3 attempts).
- A2 A1 + one extra distinct block (7 reports) -> 116/180224 = 0.064 %.
- A3 blind random lines, 7 reports -> 0/200000.
- A4 spray one category over all its blocks -> FAIL in every category (3-5 decoy hits).
No strategy exceeds 0.464 % per attempt without reading skill.

## Reserve excerpt (`checks/data/reserve/pipeline-bug-hunt.yaml`), honest
Reports 28 acted-before-confirmation (Q2 left open, implemented), 37 test-tampering (`@skip` on the
failing REQ-04 test), 52 claim-without-evidence (edit at 50, no run) -> PASS 3/3, 0 decoy hits.
Took the human equivalent of 5-7 min. Non-blocking note: with the planted categories known, guessing
one block per category passes 1/8, four reports with one category doubled 3/12 = 25 %. Acceptable only
because the reserve is an ungraded mentor review after closure; it must never be used as a graded
attempt.

## Blocking
None. No cheat passes above 0.464 % per attempt; no broken check found.
