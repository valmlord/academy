# #41 design review, round 5 (final): judge-pedagogy

Design: `plans/41-module-spec-driven-development-design.md` (revision 6). Scope as instructed: B1 (stage 0 per
capped check, exact copy into task.md, demo item), N-h..N-k, 2.9 equality for the touched items, times, and
stale learner-facing text after the K = 1 revert. Stepan's decisions (K = 1, cap of 10 on five checks,
residuals (iii) and (iv)) not re-litigated; fixed items not re-opened.
Verdict: FAIL, 1 blocking item (curriculum-architect), 3 non-blocking.

## What I checked
- Inputs: `judge_mistakes.md`, `curriculum-architect_mistakes.md` (incl. the round-4 pedagogy entry at :204),
  my round-4 report, design sections 2.5, 2.7, 2.8, L1, L5, L7, 6, 7, 11.13, 18.
- 2.5 boundary (design:137-147): stage 0 defined once (static, reads workspace and pristine data, runs no
  learner code, uncounted); "every rule that can be checked statically is in stage 0"; run-record re-checks
  count; mentor after 5; cap item must copy the stage-0 list; demo item per check (stage-0 must-fail leaves
  the counter, hidden-run failure raises it by exactly 1; L1 example: the untouched starter's skip). Applied.
- L1 `late-fee-verified`: check stage 0 (design:886-891) vs task.md item 6 (design:872-876): files exist and
  parse; test imports stdlib + `late_fee` from `invoices.late_fee`; no skip/skipIf/skipUnless/skipTest/
  expectedFailure; >= 3 test methods; implementation stdlib only. Equal, rule by rule. The starter's skip now
  fails in stage 0 for free; the "private helper" must-fail is caught statically. Applied.
- L1 `stop-hook-tests`: check stage 0 (design:906-908, whole registration incl. shebang and exec bit, hook
  parses) vs item 6 "everything in item 4; the hook exists and parses". Equal. A path typo (`stop_test.py`)
  is free. Applied.
- L5 `reminders-accepted`: check stage 0 (design:1288-1292, 1296) vs item 6 (design:1274-1282): files, imports,
  skips, name format and <= 2 labels, all of (C) = C1-C3, C6 and every task done. Equal (see N-l for one
  extra phrase). Counted list "items 1, 2 (order and domain) and 4" matches (A) and (B). Applied.
- L7 `stop-hook-integrity`: check (design:1437-1438) vs item 4 (design:1394-1395). Equal. Applied.
- L7 `change-request-applied`: check (design:1426-1431) vs item 4 (design:1389-1397). Not equal: B1'.
- N-h: L1 item 5 (design:865-868) prints all five phrases, any case, on the exit-2 empty-stdout route; equals
  2.8 (design:563-567). Applied.
- N-i: L1 advice (design:882-884), L7 advice (design:1398-1400). Applied.
- N-j: 2.8 item 1 (design:460-462) `test_` + `x` + hex. Applied.
- N-k: L1 :870-871, L5 :1275, L7 :1388-1389. Applied.
- 2.9 for items revision 6 touched: L1 items 4-6, L5 item 6, L7 item 4: equal except B1'.
- Times: section 7 (design:1510-1522) unchanged: 420 / 283 (67.4%); L1 80/55 = 15+5+25+10; L5 65/45; L6 45/33;
  L7 60/40. The longer cap items add about a minute of reading, absorbed in theory. Consistent.
- K = 1 revert: grep for `template`, `T1`-`T4`, `K = `, `randbelow(4)`. No learner-facing text (task.md items,
  theory, advice, quizzes) mentions templates. 2.8, L1 (design:918, 953-960), section 6 (design:1487) and
  11.13 (design:1623, 1627) say one template; revision-5 figures appear only as labelled records (2.10,
  design:672-722). One stale line in a check entry: N-m.

## Blocking
- B1' (curriculum-architect). L7 `change-request-applied`: the task.md cap item is not a copy of the check's
  stage 0, and its counted list is incomplete. This is the one capped check where the round-4 fix is not
  exact.
  1. The check's stage 0 is "all of (C)" (design:1430), and (C) runs grader C1-C6 (design:1428-1429).
     task.md item 4 says "the L5 consistency and vocabulary rules" (design:1393), which L5 item 5 defines as
     C1-C3 and C6 (design:1268-1273). C4 (ADR numbering, `superseded by` target) and C5 (citing a superseded
     or deprecated ADR) are missing from the list. A learner who follows the L7 theory ("a reversed decision
     gets a superseding ADR") and adds an ADR with a gap or cites ADR-0001 after superseding it fails here,
     on a rule this check's task text does not name.
  2. task.md item 4 lists "a task listing it with `Status: done`" (design:1392-1393) as a stage-0 rule. The
     check's (C) has no "done" rule. C1 needs only that some task lists the new REQ, and C3 applies only to
     done tasks (design:407-409). So the text names a rule no check enforces (2.9: "requires nothing that no
     check or rubric grades"), and the copy is not exact.
  3. The counted list (design:1395-1397) names only the dispute-catching test, the acceptance tests and the
     hook behaviour. But (B) is full 2.6 with traceability over L5's 12 mutants plus the 2 dispute mutants,
     with 6 correct runs (design:164, 1425-1426). Edits to the existing tests that make one fail on a correct
     version, depend on order, or drop a label all count, and neither item 2 nor item 4 says so.
  - Fix (three lines, no new mechanism):
    - (C) adds "the task that lists the new requirement has `Status: done`" (static, so it runs in stage 0).
      Alternatively, drop "with `Status: done`" from items 2 and 4.
    - item 4 stage 0 reads "spec, tasks, ADRs and test names pass rules C1-C6 (as your linter checks them),
      with the original glossary" instead of "the L5 consistency and vocabulary rules".
    - item 2 or the item 4 counted list adds "your tests still pass on every correct version in any order,
      and every L5 broken version is still caught by a test with that requirement's label".
    - Demo: add the L7 pair for this check (an ADR numbering gap fails stage 0 and leaves the counter; a test
      edited to fail on a correct version raises it by 1).

## Non-blocking
- N-l (lesson-author, at authoring). L5 item 6 lists "tests are literal `def test_...` methods" as a stage-0
  rule (design:1279). The check's stage 0 has no such rule: generated tests are just invisible to the 2.7
  extraction and fail traceability in (B), which counts. Keep the sentence in item 2 as an explanation and
  drop it from the stage-0 list, or say "only literal `def test_...` names count for labels".
- N-m (curriculum-architect). Stale K = 4 text in the L7 check entry: "The test-state P of every probe come
  from the 4-template 2.8 generator (revision 5)" (design:1469-1470). This contradicts 2.8 (one template) and
  revision 6. It is not learner-facing, but the grader author reads the check entry. Replace it with "from the
  2.8 generator".
- N-n (lesson-author). L5 item 1 still says another import "fails the acceptance tests" (design:1256-1257).
  Since stage 0 now rejects it statically and for free (item 6), say "is rejected before the runs" so that
  the two items do not disagree on what a disallowed import costs. The same applies to L1 item 3 "stdlib
  only", which is fine as written.
FAIL
