# #41 demo record C: L6 `06-pipeline-bug-hunt` (practice-designer C)

Run 2026-10-29 on macOS, `python3 --version` = Python 3.12.13 (`/opt/homebrew/bin/python3.12`, every run `-I`).
No Linux-only item in this lesson (no command check, no learner code executed). Re-run on the image
interpreter before `ready` (2.4).

## Files
- `course/.../06-pipeline-bug-hunt/starter/transcript.md` (410 lines), `starter/findings.json` (`[]`)
- `checks/bugs.yaml` (6 bugs, 7 accepted ranges, 21 decoys; `maxReports: 7`, `maxDecoyHits: 1`)
- `checks/reference/findings.json` (6 reports, first range of each bug)
- `checks/data/reserve/pipeline-bug-hunt.yaml` (54-line excerpt, 3 planted mistakes, 3 decoys, one per
  planted category; `minFound: 3`, `maxReports: 4`, `maxDecoyHits: 1`, `passBar` stated in the file)
- No L6 quiz: the design gives none (quizzes are L1-L4 and L7).

## Method
Transcript, key and reference are generated together from one marked source by a scratch generator
(`scratchpad/l6/gen.py`, `gen_reserve.py`), which asserts: no overlap, events in no range, k/(k+d) = 1/4 per
category, task.md example line 57 in no range. The matcher (`scratchpad/l6/score.py`, 00 2.2: file + category
+ line in a range, maximum bipartite matching, decoy hits, report cap, format errors by index and field) reads
the shipped YAML through the real `yaml` package (`node y2j.mjs`), not the generator's data. `minFound: 5`
is taken from lesson.yaml (the schema field).

## Feature depicted
Credit-note application (`apply_credit_note`), as the design's L6 starter says ("a different feature of the
same repo (credit-note application)"); the orchestrator's brief said payment reminders, the design wins.
Pipeline: `/grill-with-docs` -> `/to-spec` -> `/to-tickets` -> new session `/implement` with `tdd` and
`code-review` (R 3, v1.3.2).

## Key (ranges = physical lines)
| Bug | Category | Range(s) |
|---|---|---|
| spec-decides-q7 | acted-before-confirmation | 88-104 |
| models-only-ticket | horizontal-ticket | 115-119 |
| currency-test-never-red | skipped-red | 199-206 (early guard), 266-276 (new test, first run green) |
| expected-value-edited | test-tampering | 230-234 |
| expected-recomputed | tautological-test | 316-322 |
| done-after-refactor | claim-without-evidence | 375-377 |

Decoys (21): acted-before-confirmation 32-35, 64-69, 70-75; horizontal-ticket 121-125, 127-131, 133-137; claim-without-evidence 172-176, 240-246, 395-400; tautological-test 182-190, 215-223, 323-330; skipped-red 191-197, 208-212, 284-290, 292-295, 307-311, 331-339; test-tampering 255-263, 302-306, 357-363.
Exact values are in `checks/bugs.yaml`, each bug with its decision-rule walk.

Exclusivity: each bug's walk in bugs.yaml answers rules 1..6 in order. Design change made while writing:
the unconfirmed decision is Q7 (cancellation put Out of Scope), not the remainder rule, because a ticket
(T-09) and code built on an unconfirmed REQ would also be `acted-before-confirmation` and T-09 is a decoy.
Now no ticket or code depends on Q7.

## Recorded output (`python3 -I score.py`)
```
transcript lines: 410
printed numbers equal physical lines: ok
ranges pairwise non-overlapping: 28 ranges
harness events [4, 250, 343] in no range: ok
  test-tampering: k=1 d=3 k/(k+d)=1/4
  tautological-test: k=1 d=3 k/(k+d)=1/4
  skipped-red: k=2 d=6 k/(k+d)=1/4
  claim-without-evidence: k=1 d=3 k/(k+d)=1/4
  horizontal-ticket: k=1 d=3 k/(k+d)=1/4
  acted-before-confirmation: k=1 d=3 k/(k+d)=1/4
reference findings: PASS ['matched=6 decoyHits=0 reports=6']
empty starter findings: FAIL ['matched=0 decoyHits=0 reports=0']
alternative skipped-red anchor: PASS ['matched=6 decoyHits=0 reports=6']
right lines, categories rotated: FAIL ['matched=0 decoyHits=0 reports=6']
right lines, two pairs of categories swapped: FAIL ['matched=2 decoyHits=0 reports=6']
5 right + 2 decoy hits: FAIL ['matched=5 decoyHits=2 reports=7']
8 reports (reference + 2 extra unmatched lines): FAIL ['matched=6 decoyHits=0 reports=8']
malformed (line as string): FORMAT ['findings[0].line: expected int']
one-per-category sets: 8192, passing: 38, p = 19/4096 = 0.4639%, over 3: 1.385%
allocations enumerated: 1575 best three:
   {'test-tampering': 1, 'tautological-test': 1, 'skipped-red': 1, 'claim-without-evidence': 1, 'horizontal-ticket': 1, 'acted-before-confirmation': 1} 19/4096 0.4639%
   {'test-tampering': 2, 'tautological-test': 1, 'skipped-red': 1, 'claim-without-evidence': 1, 'horizontal-ticket': 1, 'acted-before-confirmation': 0} 1/512 0.1953%
   {'test-tampering': 2, 'tautological-test': 1, 'skipped-red': 1, 'claim-without-evidence': 1, 'horizontal-ticket': 0, 'acted-before-confirmation': 1} 1/512 0.1953%
reserve reference: (True, ['matched=3 decoyHits=0 reports=3'])
reserve empty: (False, ['matched=0 decoyHits=0 reports=0'])
reserve 2 right + 2 decoys: (False, ['matched=2 decoyHits=2 reports=4'])
reserve lines 54 numbers ok; decoy per planted category ok
```
Transcript line count 410 (380-420). Harness events: auto-compaction line 250 and Stop-hook block line 343
lie in no range; line 4 is the legend that defines the `[система]` notation (no event, no range).

## Attacker summary
- One report per category, uniform per category: 38 of 4^5 x 8 = 8192 sets pass, 19/4096 = 0.4639% per
  attempt, 1 - (1 - 19/4096)^3 = 1.385% over the 3-submission cap (above 1%, recorded as the design's
  decision for Stepan, 11.3).
- Every allocation of <= 7 reports (1575, distinct blocks within a category) enumerated exactly: none beats
  19/4096; next best 1/512 (doubling one category and dropping another).
- Doubling up adds decoy hits (5 right + 2 decoys: FAIL); shotgun exceeds `maxReports` (8 reports: FAIL);
  right lines with wrong categories FAIL (rotated: 0 matched; two swaps: 2 matched).
- Reserve: reference 3/3 PASS, empty FAIL, 2 right + 2 decoys FAIL.

## Open item for lesson-author B (task.md rule 1)
Rule 1 as written ("изменил тест ... так, что падающая проверка прошла") literally matches decoy
`asked` (357-363): the agent fixes its own typo in an expected value to the spec example, after quoting the
spec and getting "да". The design lists this decoy explicitly, so rule 1 needs the qualifier, e.g.
"... подогнал тест под код, а не под требование или подтверждение пользователя". The key is unchanged.

## Round 4 (judge_content round 1, N6, 2026-10-30)

`bugs.yaml` header: rules 1 and 4 now in the task.md wording; mentor note for 340-345 (no range, no decoy;
both readings defensible, discuss with the learner). Comments only: the parsed key equals round 3, `gen.py`
reproduces every shipped file, `score.py` output identical to the recorded one.
