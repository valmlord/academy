# #41 design review, round 6 (confirmation): judge-pedagogy

Design: `plans/41-module-spec-driven-development-design.md` (revision 7, text only, section 19 at :1978-2000).
Scope as instructed: B1' and N-l..N-n from round 5; the stage-0 list of each of the five capped checks diffed
against its task.md copy; "Готово, когда" equal to the check rules (2.9) for L1, L5, L7. Nothing else reviewed.
Verdict: PASS. Nothing blocking; 1 cosmetic non-blocking note.

## B1' (L7 `change-request-applied`): fixed
- (C) now has "the task that lists the new requirement has `Status: done`" (design:1442-1443), static, so in
  stage 0. Item 2's "a task listing it with `Status: done`" (design:1389) is now graded. Sub-item 2 closed.
- Stage-0 list: check entry (design:1446-1453) vs task.md item 4 (design:1399-1407), diffed clause by clause:
  files exist and parse; implementation imports; test-file imports; no skip constructs; name format with at
  most two labels; REQ-01..REQ-08 unchanged (whitespace collapsed); exactly one new WHEN...SHALL line, new id,
  `Dispute`/`disputed`; its task `Status: done`; "spec, tasks, ADRs and test names pass rules C1-C6 (as your
  linter checks them) with the original glossary"; ADR-0001/0002 status kept. Identical text. C4 and C5 now
  named. Sub-item 1 closed.
- Counted list: item 4 (design:1409-1411) names the acceptance tests, every correct version in any order,
  every L5 broken version caught by its label, the dispute mutant by the new id, and the hook behaviour of
  item 3. Matches (A) and (B) in the check (design:1453-1456) and the `stop-hook-integrity` probes. Item 2
  (design:1390-1391) says the same in learner words. Sub-item 3 closed.
- Demo pair added in 2.5 (design:148-149): ADR numbering gap (stage 0, C4, counter unchanged) and a test
  edited to fail on a correct version ((B), counter +1).

## Non-blocking from round 5
- N-l: L5 item 6 stage-0 list (design:1284-1289) no longer has "literal `def test_...` methods"; it stays in
  item 2 (design:1268) as an explanation, and it is graded indirectly (C3 in stage 0 and traceability in (B)
  see only AST names). Fixed.
- N-m: L7 `stop-hook-integrity` now says "from the 2.8 generator (revision 6: one template ...)"
  (design:1495-1496). Remaining `4-template`/`K = 4` hits (design:678, 681, 723, 961, 1925) are labelled
  records. Fixed.
- N-n: L5 item 1 says another import "is rejected before the runs, item 6" (design:1265). Fixed.

## Stage-0 lists, all five capped checks
- L1 `late-fee-verified`: check (design:892-897) vs item 6 (design:878-882). Equal (unchanged since round 5).
- L1 `stop-hook-tests`: check (a) (design:913-915) vs item 6 "everything in item 4; the hook exists and
  parses" (design:882-883); item 4 covers group, path, forms, keys, `timeout`, `disableAllHooks`, shebang and
  exec bit. Equal.
- L5 `reminders-accepted`: check (design:1296-1304: imports, skips, names, all of (C) = C1-C3, C6, every task
  done) vs item 6 (design:1284-1289: same, with item 3 and item 5). Equal; counted list "items 1, 2 (order and
  domain) and 4" = (A) and (B).
- L7 `change-request-applied`: equal (above).
- L7 `stop-hook-integrity`: check (design:1462-1463) vs item 4 (design:1407-1408). Equal.

## 2.9 for L1, L5, L7 "Готово, когда"
- L1 items 1-6 vs `late-fee-verified` and `stop-hook-tests`: every rule named; nothing ungraded.
- L5 items 1-6 vs `reminders-accepted`: every rule named; nothing ungraded.
- L7 items 1-4 vs `artifact-linter`, `change-request-applied`, `stop-hook-integrity`: every rule named;
  the round-5 ungraded "done" requirement is now graded; nothing ungraded.

## Non-blocking
- N-o (lesson-author, at authoring; cosmetic). L1 item 1 lists "no `skip`, `skipTest`, `expectedFailure`"
  (design:839), item 6 and the check list five constructs (+ `skipIf`, `skipUnless`). Not a 2.9 gap (item 6
  names all five), but write item 1 with the same five words so the two items do not differ.
- Note: task.md says "original spec/glossary"; the check defines "original" as the pristine copy in
  `checks/data/`, which task.md cannot name (leak guard). "As shipped in the starter" would read clearer for
  the learner; optional.

PASS
