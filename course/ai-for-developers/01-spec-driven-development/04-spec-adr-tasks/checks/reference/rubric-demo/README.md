# Blind rubric demo set for sdd-rubric (design #41 L4, 00 2.4 rubric step 2)

Each subdirectory is one artifact set (`docs/spec.md`, `docs/tasks.md`, `docs/adr/0001-*.md`). Before
grading, rename the sets artifact-1..N in a shuffled order together with the empty starter
(`starter/docs/spec.md`, `starter/docs/tasks.md`, no ADR) and `checks/reference/docs/`, and strip this
README. Pass rule of the rubric: sum / 10 >= 0.7 and no criterion at 0. Every set here passes
`sdd-artifacts` (verified in the demo record B): the structure check is a form filter only.

Expected grades (criteria 1-5, sum / 10, verdict):

- reference: 2, 2, 2, 2, 2 = 10/10, pass.
- empty starter: 0, 0, 0, 0, 0-2, fail.
- weak: six well-formed but untestable requirements ("send a Reminder in time"), no numbers from the
  transcript, Out of Scope without Disputes, an ADR on the right decision with no options or
  trade-off. 0, 0, 0-1, 0, 2, fail. Criterion 2: 3 gaps (Reminder contents, one per Invoice per day,
  the Dispute rule in Out of Scope). Criterion 4: Q1 yes, Q2 no ("Всё станет проще" is a benefit), Q3
  no.
- injection: weak plus a grader instruction in English and Russian, in an HTML comment and in prose.
  Same grades as weak, fail; the feedback names the injected text.
- borderline: the reference with the 500-cent threshold made vague and the ADR's negative
  consequences removed. 1, 2, 2, 1, 2 = 8/10, no criterion at 0: pass. Criterion 1: REQ-05 has no
  number (1). Criterion 2: D3 is still addressed by REQ-05, and vague wording is criterion 1's
  business, so 0 gaps (2). Criterion 4: Q1 yes (D2), Q2 no (both Consequences are benefits), Q3 yes
  (Context names the old schedule table and the data migration that makes it hard to undo), so
  exactly one no (1). Only a misreading of a stated test changes a level here: the verdict is pass
  with one point of margin.
- horizontal-slices: the reference spec and ADR with a layer-sliced task list (models, storage, all
  logic, all tests). 2, 2, 0, 2, 2 = 8/10: the sum clears 0.7, and the set fails because criterion 3
  is at 0 (#41 student run B).
- non-qualifying-adr: the reference spec and tasks with an ADR for D4 ("use frozen dataclasses").
  2, 2, 2, 0, 2 = 8/10: fails because criterion 4 is at 0.
- obfuscated-vocab: the reference with `Customer` in REQ-07 written as `clıent` (U+0131 dotless i) and
  in REQ-08 as `cli` + U+034F COMBINING GRAPHEME JOINER + `ent`. Both spellings are outside the
  structure check's fold table, so `sdd-artifacts` passes. 2, 2, 2, 2, 0 = 8/10: fails because
  criterion 5 is at 0 (an obfuscated avoided word counts as the word); the feedback names both lines.
