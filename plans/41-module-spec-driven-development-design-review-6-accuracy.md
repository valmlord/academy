# #41 design review, round 6 (confirmation): judge-accuracy

Design: `plans/41-module-spec-driven-development-design.md` (revision 7, text only). Scope as set: the round-5
blocking item, non-blocking items 1-3, and whether the section 19 edits add a false factual claim or contradict
Stepan's decisions (K = 1, the cap of 10, residuals (iii) and (iv) accepted). Reviewed 2026-10-29.
Verdict: PASS.

Sources read: design section 2.5 (lines 134-153), 2.10 item 8 (lines 675-705), L1 (lines 950-971), L7 task
item 4 and the `change-request-applied` and `stop-hook-integrity` check entries (lines 1396-1499), 11.13
(lines 1647-1657), and sections 17-19. Scratch prototype `m3/probes/run_r4.py:15` and `per_state_r7.out`.
Grep for `4-template`, `K = 4`, `four templates` and `1/46656`.

## Round-5 items
- **Blocking 1 (L7 "4-template" sentence).** Resolved. Lines 1495-1496 now say "The test-state P of every
  probe come from the 2.8 generator (revision 6: one template, draw first, state-independent work)".
  - `4-template` / `K = 4` now appear only in records labelled revision 5:
    - 2.10 lines 678, 681 and 723;
    - L1 line 961, an observation labelled "on the revision-5 4-template generator";
    - section 17, lines 1925 and 1934;
    - section 18, line 1962;
    - section 19, line 1982.
  - 11.13 line 1654 says "revision 5's four templates bought nothing", which matches K = 1.
- **N1 (L1 memory-hook run).** Resolved. Lines 961-962 add the revision-6 run: 0/300, 291/1800 = 0.162. 1/46656
  is cited on that run. This matches 2.10 line 705 and my round-5 reading of `run_r6.out`.
- **N2 (unscoped 1/46656 in L7).** Resolved. Lines 1493-1494 now read: "1/46656 with cross-probe memory, a
  bound for the modelled attackers, 11.13), unless it evaluates P statically (11.13 (iv))". This agrees with
  11.13 rows 1647 and 1650.
- **N3 (per-state totals).** Resolved.
  - `run_r4.py:15` now prints `failed probes by state {fails} of {tot}`.
  - `per_state_r7.out` records:
    - `raw_forward`: failed `{'R': 9}` of `{'G': 9, 'R': 9, ...}`;
    - `with_I`: failed `{'G': 10}` of `{'G': 10, 'R': 8, ...}`.
  - These match the design text at line 699 and section 19 ("9 of 9 red failed / 10 of 10 green failed").
  - The original "all 8 red / all 7 green" run is still unverifiable from its own output. It is now backed by a
    re-run that can be checked.

## Revision-7 edits against the decisions
- **K = 1.** No edit brings back more than one template. The L7 stub generator (lines 1474-1482) is one
  template and refers to residual (iv) for static evaluation.
- **Cap of 10.** The edits keep it unchanged:
  - 2.5 line 136;
  - L7 item 4 line 1396 (mentor after the 5th, close after the 10th).
- **(iii) and (iv).** Both stay accepted residuals. 11.13 lines 1649-1650 and 1655 are unchanged in substance.
- **The new `change-request-applied` rule ("the task that lists it has `Status: done`").** It is static. It
  is listed in the same words in:
  - the check's stage 0 (lines 1452-1453);
  - task.md item 4 (line 1405);
  - criterion (C) (lines 1442-1443).
- **The 2.5 demo pair (line 148).** An ADR numbering gap is a C4 rule, and C4 is part of the "rules C1-C6"
  stage-0 item. So "stage 0, counter unchanged" is consistent. A test edited to fail on a correct version
  belongs to the counted (B) list (lines 1453-1456), so "+1" is consistent.
- No false factual claim found in the section 19 edits.

## Non-blocking
1. **[section 19, line 1983]** "`4-template` and `K = 4` remain only in labelled revision-5 records (2.10,
   sections 17-18)" leaves out L1 line 961. That hit is also a labelled revision-5 observation, so nothing is
   wrong in substance. Only the list of locations is incomplete. Optionally add "L1 line 961" to the list.

PASS
