# #41 design review, round 6 (confirmation): judge-assessment

Reviewed 2026-10-29: design revision 7 (`plans/41-module-spec-driven-development-design.md`, section 19).

The scope was strict:
- check that my five round-5 corrections were applied;
- check that the new L7 `change-request-applied` rules can be checked and agree with stage 0.

Stepan's decisions are not re-opened: K = 1, the cap of 10, and residuals (iii) and (iv).

Scratch:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-zealous-bhaskara-22c06a/8b58a220-6421-4cbe-980e-760493c05b9c/scratchpad/judge-r6/`.
It holds `harness_tokleak.py`, `harness_tokflow.py` and `leakcheck.py`. All runs used python3.12 `-I`.

Verdict: PASS. All five corrections are in, and the L7 rules agree with stage 0. Two items are non-blocking.

## (1) Round-5 corrections
| # | Correction | Where | Status |
|---|---|---|---|
| 1 | The state-flow guard covers `generate()` | 2.8 (lines 520-526); `state_flow.py`; `harness_genleak.py` added as the third control | Applied. See the re-run below |
| 2 | Section 12 names `generic_eval` and (iv) | lines 1685-1687 | Applied |
| 3 | L7: the revision-6 generator, plus "unless it evaluates P statically" | lines 1494-1497 | Applied. `4-template` remains only in labelled revision-5 records (line 961 and sections 17-18) |
| 4 | L1 must-fail: the untouched starter stops at stage 0 (skip), uncounted | line 902; the 2.5 demo at line 146 | Applied |
| 5 | The metadata guard runs at 1000 + 1000 in the demo | line 513 | Applied |

### State-flow re-run (mine)
| File | Result |
|---|---|
| `harness.py` | PASS |
| `harness_sumleak.py` | FAIL: draw uses state 2 times |
| `m3/probes/harness_genleak.py` (byte-identical to my round-5 file) | FAIL at line 75 |
| `judge-r5/harness_genleak.py` | FAIL at line 75 |
| `judge-r5/harness_pickleak.py` | FAIL: `pick` used other than as a seed-pair index |

These match `state_flow_r7.out`.

## (2) The new L7 `change-request-applied` rules
**`Status: done` in (C) and in stage 0.** This rule is static: it reads only the tasks file.
- It agrees with C3: a done task needs a test with its id. So stage 0 also requires, statically, that a test
  labelled with the new id exists.
- An honest solution already has all of this: a new REQ, a new task marked done, and a `test_req_NN_...` test.
  The L5 starter has every task done.

**The stage-0 list is copied verbatim.** I compared the check entry (lines 1445-1453) with task.md item 4 (lines
1399-1408) by script, from the first path to "keep their status.": they are identical.

**Counted re-run of the edited tests.** The new rules are:
- "pass on every correct version in any order";
- "every L5 mutant still killed by a test with its label".

Neither can be checked without running the tests, so both rightly sit in the counted (A)/(B) runs. Task.md item 2
and the counted list in item 4 now state them, so they are no longer a hidden criterion. Stage 0 runs no learner
code and its verdict depends only on the workspace and the pristine data. An uncounted submission therefore learns
nothing about the variants or mutants. Mutant counts are 14 in L7 (L5's 12 plus 2 dispute mutants), and the correct
runs are six copies of the reference.

**Demo pair (2.5, line 148).**
- An ADR numbering gap is C4, which stage 0 runs: the counter stays unchanged.
- A test edited to fail on a correct version passes stage 0 (parse, imports, names and labels all intact) and fails
  only in (B): the counter goes up by 1.

Both outcomes are correct for the rules as written.

No free probing and no false fail of an honest solution.

## Non-blocking
1. **The `generate()` state-flow assertion checks where `state` appears, not where its value goes.**
   Two variants of `harness.py` that I made pass `state_flow.py` and still write the `sum_leak` relation into P.
   Over 60 probes each, `leakcheck.py` gives red 60/60 against green 0/60 for `m == (k + j) mod 10**4`:
   - `harness_tokleak.py`: a side effect inside the allowed `tokens = ... if state == "R" and not
     v.update(m=...) else []`;
   - `harness_tokflow.py`: `v["m"] = (k + j) % N if tokens else v["m"]` after the `tokens` assignment.

   The 2.8 text ("none of these reaches the files") is already the right rule; only the prototype under-enforces
   it. The demo implementation should also assert two things:
   - the `tokens` value contains no call and no `NamedExpr`;
   - `tokens` (and `v` after the `tokens` line) is read only in the `return`, as its second element.

   Add `harness_tokflow.py` as a fourth watched-red control. The rule is right and these two leaks have to be
   written on purpose, so this does not block.
2. **The task rule is worded differently in two places.** Stage 0 says "the task that lists it has `Status: done`";
   task.md item 2 says "a task listing it with `Status: done`". If a learner splits the work into two tasks, one
   still `todo`, the two readings disagree. Pick one wording (suggested: "every task that lists it has
   `Status: done`") and use it in the check entry and in both task.md items.

## Checked
- `pnpm content:validate`: 1 course(s), 6 module(s), 6 lesson(s), 0 issue(s).
- `state_flow.py`:
  - PASS on `harness.py`;
  - FAIL on `sumleak`, both `genleak` copies and `pickleak`;
  - PASS on my `tokleak` and `tokflow`, whose leaks `leakcheck.py` confirms (non-blocking 1).
- I read the line ranges cited for corrections 2-5.
- The stage-0 list and task.md item 4 were compared by script: identical.
- I walked the L7 (C), stage 0, the counted list and the 2.5 demo pair against the counting rule.

PASS
