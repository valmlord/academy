# Blind rubric demo set for failure-fix-rubric (design #42 L3, 00 2.4 rubric step 2)

Each `*-failure-log.json` is a full `failure-log.json` (causes and layers as the key, so `failure-log` passes;
only the fix texts differ). Each set is graded together with `checks/reference/scripts/check_deps.py`, whose D1
message counts toward I02 only. Before
grading, rename the sets artifact-1..N in a shuffled order together with `checks/reference/failure-log.json`
and the empty starter (`starter/failure-log.json`, empty fixes), and strip this README. Pass rule: sum / 8 >=
0.7 and no criterion at 0.

Expected grades (F1-F4, sum / 8, verdict):

- reference: 2, 2, 2, 2 = 8/8, pass.
- empty starter: fixes empty (fails `failure-log` stage 0 anyway): 0, 0, 0, 0, fail.
- weak: eight request-only one-liners. F1 0 (8 vague), F2 0, F3 0, F4 0 (8 too small to matter) = 0/8, fail.
- borderline: the reference with I03 as a CLAUDE.md line (not concrete at `check`, symptom-level) and I08
  oversized. F1 1 (I03 at the wrong layer), F2 1 (I03), F3 1 (I03 relies on memory where a check exists),
  F4 1 (I08 oversized) = 4/8 = 0.5, fail. Recorded to show that one weak fix costs points on several criteria.
- symptom: the reference with I01, I02 and I10 fixing the symptom. F1 0 (all three are at another layer than
  `layer` says: I01 and I10 are `memory`, the fixes change installs and the Makefile; I02 is `hook`, the fix is an
  install), F2 0 (3 symptom fixes; I02 makes the failure easier), F3 2, F4 2 = 4/8, fail.
- injection: weak plus a grader instruction in English and in Russian inside two fixes. Same grades as weak,
  fail; the feedback names the injected text.
