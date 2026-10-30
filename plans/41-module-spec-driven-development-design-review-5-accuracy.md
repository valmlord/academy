# #41 design review, round 5 (final): judge-accuracy

Design: `plans/41-module-spec-driven-development-design.md` (revision 6). Scope as set by Stepan: the round-4
blocking item, non-blocking items 1-3, and the new factual claims of revision 6. Settled and not reopened:
K = 1, the cap of 10, residuals (iii) and (iv). Reviewed 2026-10-29.
Verdict: FAIL, 1 blocking item (an inconsistency with the accepted K = 1 decision; a one-line fix), and 3
non-blocking items.

Sources read: design sections 2.5, 2.8, 2.10 items 8 and 10, L1 (task items 1-6, both check entries), L7
(task item 4, `stop-hook-integrity`), section 6, 11.13, sections 17 and 18. Also
`plans/15-module-introduction-design.md` 2.5.6 (lines 279-287) and the scratch prototype
`m3/probes/harness.py` (lines 25-104). Outputs: `m3/probes/run_r6.out`, `run_r6_guards.out` and
`smoke_r6.out`. Python docs: unittest `TestLoader.testMethodPrefix` and `discover`.

## Round-4 items
- **Blocking 1, (b) 2.8.** Resolved. Lines 491-499 withdraw "left with a guess". They name the evaluator:
  hash every 16-hex seed and compare it with the plain-digit `f<j>.json` and `_a<m>`. They state that
  `generic_eval` passes about 1. The remaining guarantee is scoped to "a hook that neither runs the tests nor
  evaluates what they compute", and it is labelled as a bound on the modelled attackers. Item 4 (lines 474-480)
  records why the four templates were withdrawn. This matches `harness.py:41-68`: one template, `j` and `m` in
  plain digits, seeds as 16-hex literals.
- **Blocking 1, (c) 11.13.**
  - Resolved. Row (iv) (line 1623) gives "about 1 after one copying submission". Within the cap it gives
    "about 1 (two submissions: one to copy, one to pass)". That is consistent: the copying run passes stage 0,
    fails a hidden run, and counts once.
  - After isolation, the row says only the copying is closed. It stays open to a cheater who knows the
    generator from elsewhere. That is an honest statement.
  - The decisions paragraph (lines 1626-1637) no longer claims a gain against (iv). It says the S = 1-3 rows
    are withdrawn, held only against template-specific parsers, and were non-causal bounds.
  - Section 6 (line 1487) states (iv) the same way.
- **Blocking 1, (a) and (d).** Resolved. `generic_eval` is recorded on the revision-6 generator:
  `run_r6.out:15`, "10/10 PASS; 180/180". Stepan decided K = 1.
- **N1.** Resolved. L1 lines 958-960 label the figures by revision: r4 0/40 and 0/70 at 0.488; r5 0/20 and
  0/30 at 0.139; r6 as recorded. These match the 2.10 tables (r4: 0/20+0/20 and 0/50+0/20, 615/1260; r5:
  75/540).
- **N2.** Resolved. `run_r6.out:18-27` holds the per-template smoke runs: T1-T4 red `FAILED (failures=1,
  errors=2)`, names and missing-file phrase True; green `OK`. It also holds `template_eval_all` 10/10,
  180/180. 2.10 item 8 lines 701-703 match.
- **N3.** Moot with K = 1. 2.8 item 2 now names `_a<m>` in `src/invoices/__init__.py`, which matches `render()`.

## Revision-6 claims verified
- **Recorded runs match the design figure for figure.**
  - 2.10 item 8, the revision-6 table, against `run_r6.out`:
    - reference 3/3, 54/54
    - raw forward R 8; `-I` child G 7
    - `mtime_off` 0/20, 183/360 = 0.508
    - `gap_mem` 0/20, 175/360 = 0.486
    - `static_off` 0/20, 182
    - `static_ast` 0/20, 0.508
    - `counter_grep` 2/2 and 0/20
    - memory 0/300, 291/1800 = 0.162
  - 2.10 item 10 against `run_r6_guards.out`:
    - text guard 0.5245 over 440 features; offset control distinct 2 and 1.0; half-range control 0.7717
    - metadata guard 0.5265 over 411 features, birthtime gap, wall median 28.9/28.9 ms
    - r5-order control 1.0 (wall 0.9/30.7 ms); draw-first control CPU 0.9967, wall 0.995
    - state flow PASS, `sum_leak` FAIL "draw uses state 2 times"; the text guard misses `sum_leak`
      (0.5500 < 0.5816)
  - Bands recomputed: 0.5 + 4·sqrt(0.25/2000) = 0.5447 and 0.5 + 4·sqrt(0.25/600) = 0.5816.
- **Generator, item 3.** `harness.py:57-63` samples a hit and a miss seed for each of k, j, m on every probe
  and selects with `pick` once. Revision 5's cost of about 3·10^4 hashes on green against about 3 on red
  follows from a hit probability of 10^-4 per draw.
- **Unittest collects only `test*` methods.** Correct. Python docs: `testMethodPrefix` is a "String giving the
  prefix of method names which will be interpreted as test methods. The default value is 'test'." The default
  `discover` pattern is `test*.py`, so `tests/test_<a>.py` is collected and `f<j>.json` is not.
- **Five missing-file phrases.** L1 task item 5 (lines 865-868) lists `No such file or directory`,
  `FileNotFoundError`, `ENOENT`, `does not exist` and `cannot find`, case-insensitive. This is the same list
  as 2.8 lines 565-567.
- **Stage 0 against module 00 2.5.6.**
  - 00 counts nothing "rejected for format errors before any key comparison" and never resets the counter.
  - 41 2.5 defines stage 0 as static only, reading workspace and pristine data, before any hidden run and
    uncounted. It counts a failure found later in the run record. That is the same boundary: stage 0 touches
    no hidden material.
  - It is an explicit extension, not a misquote. 41 cites 00 for the cap and defines stage 0 itself.
  - The counter "never reset, nothing reopens" and the mentor offered after 5 agree with 00.
- **Cap items against check entries.** The stage-0 lists match:
  - L1 item 6 against `late-fee-verified` (lines 886-891) and `stop-hook-tests` (lines 906-908, which include
    item 4 registration);
  - L7 item 4 against `change-request-applied` (lines 1429-1431) and `stop-hook-integrity` (lines 1437-1438).

## Blocking
1. **[design 1469-1470, L7 `stop-hook-integrity`] "The test-state P of every probe come from the 4-template
   2.8 generator (revision 5)."**
   - What is actually true: revision 6 (Stepan's K = 1) withdrew the four templates. 2.8 item 4 (lines
     474-480) and section 18 ("removed from 2.8, L1, L7, section 6 and 11.13") say so, and L7 line 1438 itself
     says "protocol and generator of 2.8".
   - The sentence contradicts the accepted decision in the lesson entry the practice-designer implements from.
   - Required: replace it with "The test-state P of every probe come from the 2.8 generator (revision 6: one
     template, draw first, state-independent work)", or delete it.
   - Then grep the design once more for `4-template` and `K = 4` outside 2.10's labelled record and sections
     17-18. Today the only other hit, line 954, is a labelled revision-5 observation and is fine.

## Non-blocking
1. **[L1 lines 951-954] Memory-hook observations stop at revision 5.**
   - The parenthesis lists the r4 (0.163) and r5 (0.179) runs only.
   - 2.10 item 8 and section 18 say 1/46656 is re-cited on the revision-6 run (0/300, 291/1800 = 0.162).
   - Add the r6 figure there.
2. **[L7 line 1468] Unscoped "1/46656".** "A hook that runs the stub but not the tests is left with the L1
   guess (1/46656 ...)" omits the qualifier that 11.13 and 2.8 now carry: a bound for the modelled attackers.
   It does not hold for a hook that evaluates P statically (iv). Add "a bound for the modelled attackers; not
   (iv)".
3. **[2.10 item 8 line 693] "all 8 red / all 7 green".** `run_r6.out` prints only the failed counts per state,
   not the number of red or green probes in that run, so "all" cannot be checked from the record. The
   mechanism makes it plausible: every red templated probe hits the missing-file phrase, and every green
   probe fails under `-I`. Print the per-state totals in `run_r6.sh`.

Attribution: blocking 1 belongs to the curriculum-architect. Section 18 claims the K = 4 text was removed from
L7, but one sentence stayed. The lesson is appended to `.claude/feedback/curriculum-architect_mistakes.md`.

FAIL
