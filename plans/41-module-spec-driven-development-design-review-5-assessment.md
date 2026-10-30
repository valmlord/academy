# #41 design review, round 5 (final): judge-assessment

Reviewed 2026-10-29: design revision 6 (`plans/41-module-spec-driven-development-design.md`). I read:
- sections 2.5, 2.8, 2.10 items 8 and 10, 11.13 and 18;
- the L1 `late-fee-verified` and `stop-hook-tests` entries and L1 task.md items 4-6;
- the L5 `reminders-accepted` entry and task.md item 6;
- the L7 stub generator, `change-request-applied`, `stop-hook-integrity` and task.md item 4;
- section 6 row O1 and the section 12 self-review.

I also read the revision-6 prototype in `m3/probes/`: `harness.py`, `meta_guard.py`, `state_flow.py`,
`dist_check_r6_leaky.py`, `run_r6.sh/.out`, `run_r6_guards.sh/.out` and the hooks. Before reviewing I loaded my
round-4 report, `judge_mistakes.md` and `_contract.md`.

Stepan's decisions are not re-opened: K = 1, the cap of 10, and residuals (iii) and (iv) accepted at about 1 until
runner isolation.

Scratch for this round:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-zealous-bhaskara-22c06a/8b58a220-6421-4cbe-980e-760493c05b9c/scratchpad/judge-r5/`.
It holds:
- `hooks/side_logger.py`, `side_run.py`, `side_analyze.py`, `side_analyze.out`;
- `hooks/gap_mem_tuned.py`, `hooks/cpu_mem.py`;
- `run_attacks.sh/.out`, `runv.py`, `guards.out`, `linux_r5.sh/.out`;
- `harness_genleak.py`, `harness_pickleak.py`.

Runs used python3.12 `-I` (3.12.13) on macOS. The Linux runs used `python:3.12-slim` (3.12.16), uid 1000,
`--network none`.

Verdict: PASS. No blocking item. Five non-blocking corrections follow, to apply before the demo.

## (1) Timing, metadata and ordering attackers against the revision-6 generator

### Attack hooks, VERDICT runs (`run_attacks.out`, `linux_r5.out`)
| Hook (base EMPTY skeleton, runs no test, reads no probe content) | macOS | Linux |
|---|---|---|
| `mtime_off` (round 4; it was 20/20 on revision 5) | 0/20; 170/360 = 0.472 | 0/10; 0.506 |
| `gap_mem` (round 4, 20 ms threshold; it was 7/10 on the draw-first generator) | 0/20; 0.492 | 0/10; 0.444 |
| `gap_mem_tuned` (mine: the gap since the last hook's exit, adaptive threshold at the running median of every gap seen, history warmed up) | 0/20; 0.500 | 0/10; 0.483 |
| `cpu_mem` (mine: the grader's CPU time between two hook starts, read with `ps` on the parent, threshold at the measured median of 30 ms) | 0/20; 0.517 | not run (the slim image has no `ps`) |

### Side-channel sweep (`side_analyze.out`)
`side_logger.py` is a hook that runs nothing and records everything a hook can see without reading file contents:
- the birthtime, mtime and ctime of every path of the probe root and P, as an offset from its own start, plus
  every pairwise difference of those (1374 features in total);
- the size and blocks of each path, the inode order and the inode span;
- its PID and the PID delta to the previous hook;
- the parent's CPU time, RSS and VSZ, and their deltas;
- the load average, free blocks and free inodes, and their deltas;
- the wall gap since the previous hook's exit.

I took 2400 probes with a uniformly random state through `harness.probe` and learned on the first half with the
`meta_guard` rule (10 quantile bins), testing on the second half.

Result: the best feature reached 0.5392, against a 4-sd band of 0.5577. That is the maximum of 1374 null features,
as expected. Medians, red against green:
- gap 49.7 / 49.0 ms;
- parent CPU delta 30 / 30 ms;
- PID delta 2 / 2;
- RSS delta 0 / 0.

No channel above the band.

### Ordering
I wrote no new hook: the row structure gives an ordering attacker nothing beyond per-class memory, and I checked
this analytically.
- A deterministic per-class strategy matches exactly one of the 6 patterns, so 1/6.
- The positions of the Z row and the active row are shuffled independently of the patterns, and both rows are
  identifiable from stdin or statically anyway.
- Without memory, the best randomised guess is (1/2)q(1-q), maximised at 1/8 per class, which gives 2^-18.

The architect's `memory_guess` measurement (0/300, 0.162) agrees.

### The guards go red (re-run myself, `guards.out`, 300 + 300 pairs each)
| Guard | Grader | Control |
|---|---|---|
| metadata and timing | PASS, best 0.5517, band 0.5816 | revision-5 order: FAIL, 1.0. Draw-first with state-dependent work: FAIL, wall 0.9967 |
| text | (architect, 1000 + 1000: PASS 0.5245) | offset literal: FAIL, 1.0. Half-range red `k`: FAIL, 0.7567 |
| state flow | PASS on `harness.py` | `sum_leak`: FAIL. Mine, `harness_pickleak.py` (the leak via `pick`): FAIL |

B1''' is closed. Every attacker outside (iv) that I ran is at chance, on both platforms.

## (2) Honest hooks
| Hook | macOS | Linux |
|---|---|---|
| reference | 3/3, 54/54 | 2/2, 36/36 |
| `straightforward.py` (`python3` from `PATH`, inherited env plus `PYTHONPATH`, combined output in a JSON `reason`) | 3/3, 54/54 | 2/2, 36/36 |

`generic_eval` 3/3 is the (iv) control. It still passes, which is recorded and accepted.

## (3) Stage 0 of the five capped checks
For each check I asked three questions:
- Is it listed explicitly?
- Is it static?
- Does it read only visible material?

| Check | Listed | Static | Visible material |
|---|---|---|---|
| `late-fee-verified` | yes, at L1:886, copied in task.md item 6 | AST only | yes |
| `stop-hook-tests` | yes, at L1:906 | registration, shebang, exec bit, parse | yes |
| `reminders-accepted` | yes, at L5:1288 | yes, (C) included | yes |
| `change-request-applied` | yes, at L7:1429 | yes | the "pristine" L5 spec and glossary equal the L7 starter, which is the L5 reference state |
| `stop-hook-integrity` | yes, at L7:1437 | yes | yes |

**No free probing.** Stage 0 runs before, and instead of, any hidden run. It executes no learner code. Its verdict
is a function of the submitted files alone, so an uncounted submission learns nothing about the variants,
mutants, acceptance tests or probes. The classification is fixed by the pre-run stage 0, and:
- a failure found only in the run record counts (2.5);
- learner code that kills the grader counts (11.13 row "fails closed").

So a hidden run cannot be made uncounted after the fact.

**Statically checkable rules are in stage 0.** The one candidate is the L7 "test labelled with the new id", and it
is already enforced statically by C3 inside (C), which stage 0 runs.

**Demo.** 2.5 has the stage-0 / counted demo for all five checks.

No boundary defect.

## (4) The final residual table, recomputed (`fractions`)
| Row | Design | Recomputed |
|---|---|---|
| positional L1/L5 | 1/18564; 0.0539% in cap; 1/94585, 0.0106% isolated | same (C(18,6) = 18564; max q^6(1-q)^12 at q = 1/3 = 2^12/3^18 = 1/94585) |
| positional L7 | 1/38760; 0.0258%; 1/202255, 0.0049% | same |
| per-class memory | 1/46656; 0.0214%; 1/262144, 0.0038% | same. Now a valid bound for the modelled attackers: the timing and metadata attackers are at chance (section 1) |
| (ii) timing between variants | demo guard | unchanged, not re-measured this round |
| (iii) mount | about 1 | unchanged, accepted |
| (iv) static evaluation of P | about 1 after one copying submission; two within the cap; after isolation open only to a cheater who knows the generator | correct. `generic_eval` passes 3/3 here and 10/10 in `run_r6.out` |

All numbers check out.

## (5) Is (iv) stated honestly?
It is stated correctly in:
- 2.8 (lines 490-499);
- 2.10 item 8;
- 11.13 row (iv) and the decisions paragraph;
- section 6 row O1;
- L1 (965-967);
- the L7 stub paragraph (1457) and its closing line (1473).

There are two stale sentences: non-blocking items 2 and 3 below.

## Non-blocking (apply before the demo; none changes a rate)

1. **The state-flow guard does not check `generate()`.** The prototype `state_flow.py` loops over `generate`'s
   uses of `state` with `pass`. `harness_genleak.py` writes the `sum_leak` relation in `generate` after `draw`
   (`if state == "R": v["m"] = (v["k"] + v["j"]) % N`) and gets STATE FLOW PASS. It is invisible to the text
   guard for the same reason `sum_leak` is (0.55 against a 0.5816 band).

   The 2.8 spec ("never in the renderer or writer") does not name the glue either, so a practice-designer
   copying it leaves the same gap.

   Fix in 2.8: "outside the selector, `state` may appear only as the zero-tests branch test and in the
   expected-token computation, and neither value reaches the files dict". Add `harness_genleak.py` as a
   third watched-red control.

2. **Section 12, the "Revision 4 applies" paragraph:** "The attack that still passes, a template-specific
   evaluator, is recorded". This is stale. Since round 4, the passing attack is the template-agnostic
   `generic_eval`. Reword as "a hook that evaluates the probe files statically (`generic_eval`), residual (iv)".

3. **L7 (around line 1470):** "The test-state P of every probe come from the 4-template 2.8 generator (revision 5)"
   contradicts K = 1. It should say "the revision-6 2.8 generator".

   On the same line, "A hook that runs the stub but not the tests is left with the L1 guess" should add "unless
   it evaluates P statically (11.13 (iv))".

4. **L1 `late-fee-verified` must-fail, "untouched starter (A fails: defects; B fails: tautology and skip)".**
   With stage 0, the starter stops at stage 0 (skip) and never reaches (A) or (B). The 2.5 demo already says
   so. Align the must-fail text: "stage 0 (skip), uncounted".

5. **Metadata guard spread on my 300-pair re-run.** The best feature was 0.5517, and the wall medians were 30.5
   ms red against 33.0 ms green. Both are inside the band and consistent with geometric-sampling noise. My
   1200-pair side sweep shows 49.7 against 49.0. The demo should run the guard at the specified 1000 + 1000,
   not fewer.

## Checked
- `pnpm content:validate`: "1 course(s), 6 module(s), 6 lesson(s), 0 issue(s)". Module 01 is not built yet.
- Attackers on revision 6:
  - `mtime_off`: 0/20 macOS, 0/10 Linux;
  - `gap_mem`: 0/20, 0/10;
  - `gap_mem_tuned`: 0/20, 0/10;
  - `cpu_mem`: 0/20.
- The 2400-probe side-channel sweep: best 0.5392, band 0.5577.
- Guards and controls:
  - metadata guard PASS, with r5order and drawfirst FAIL;
  - text controls offset and half FAIL;
  - state flow PASS, with `sum_leak` and `pickleak` FAIL and `genleak` PASS (item 1).
- Hooks:
  - reference 3/3 macOS and 2/2 Linux;
  - straightforward 3/3 macOS and 2/2 Linux;
  - `generic_eval` 3/3 ((iv), accepted).
- 11.13 recomputed exactly.
- Stage 0 of all five capped checks read and walked against the counting rule.
- (iv) wording grepped across the design.

PASS
