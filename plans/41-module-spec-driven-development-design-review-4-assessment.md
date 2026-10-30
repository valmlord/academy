# #41 design review, round 4: judge-assessment

Reviewed 2026-10-29: design revision 5 (`plans/41-module-spec-driven-development-design.md`). I read sections 2.8, 2.10
(items 8 and 10), 11.9, 11.13, 16 and 17, plus the L1 Stop-hook check and the L7 `stop-hook-integrity` check in full.
I grepped 2.3, 2.6 and L1 for the round-3 items. I also read the prototype in `m3/probes/` (`harness.py`,
`dist_check_t.py`, `dist_check_t_leaky.py`, the hooks, `run_r5.sh/.out`, `dist_check_r5.out`), my round-3 report,
`judge_mistakes.md` and `_contract.md`. Verdict: FAIL, 1 blocking item and 1 honesty correction. Stepan's decisions
(K = 4, the cap of 10, residuals (iii) and (iv) as accepted classes) are not re-opened. Only the numbers and claims
recorded about them are checked.

Scratch for this round:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-zealous-bhaskara-22c06a/8b58a220-6421-4cbe-980e-760493c05b9c/scratchpad/judge-r4/`.
It holds:
- `m3probes/`: a copy of the architect's K = 4 prototype;
- `hooks/mtime_off.py`, `hooks/mtime_off_linux.py`, `hooks/generic_eval.py`, `hooks/gap_mem.py`,
  `hooks/straightforward.py`;
- `run.py`, `per_template.py`, `gaps.py`, `fixed_order.py`, `constwork.py`, `gap_run.py`;
- `sum_leak.py`, `rates.py`, `rates_noncausal.py`.

All runs used python3.12 `-I` (3.12.13) on macOS. The Linux runs used `python:3.12-slim`, uid 1000, `--network none`.

## What I checked and ran

### (1) B1'' (the literal leak): closed as specified
| Run | Result |
|---|---|
| `static_off` on the K = 4 generator | 0/5 VERDICT PASS. It never blocks a red probe: 46/90 red/green probes right, which is chance |
| guard `dist_check_t.py 3 1000` (re-run) | 1 masked text over 4000; best of 578 features 0.5195; band 0.5447; GUARD PASS |
| leak control: `offset` on T2 | masked distinct 2, accuracy 1.0, GUARD FAIL |
| leak control: `half` on T2 | 0.755, GUARD FAIL |

The guard goes red on both controls. The rule (2.8 items 1-4), the sentinel masking and the feature list are precise
enough for the practice-designer to rebuild. The literal-leak class of B1'' is closed. Two other channels are not
(B1''' below, and H1).

### (2) Round-3 non-blocking items: all 7 applied
- N1, mount rate: 11.9 and 11.13 (iii) say "about 1, observed 3/3", and the mitigation is withdrawn.
- N2, grader non-dumpable: the grader is non-dumpable (2.3:73, 2.6:192). `grader_mem` and `grader_mem_b` are
  must-fail (2.6:308). The Linux run is recorded at 2.10 item 7.
- N3, (B) nonce: the (B) nonce wording is at 2.6:231-235, and the real-nonce forge is a demo item.
- N4, side channels: six reference copies are used. Residual (ii) now covers timing and resource usage, with a
  demo guard (2.6:311, 335).
- N5, bounds of D: bounded D with numbers (2.6:159-173, L1:850).
- N6, trailing spaces: they are stripped before the typed rule (2.3:94, 2.10 item 9).
- N7, probe draw: patterns use `secrets.SystemRandom` (L1 table row 18, L7).

### (3) The 11.13 table, recomputed exactly (`fractions`, `rates.py`)
| Row | Design | Recomputed |
|---|---|---|
| positional L1/L5 | 1/18564, 0.0539% in cap; 1/94585, 0.0106% isolated | same |
| positional L7 | 1/38760, 0.0258%; 1/202255, 0.0049% | same |
| per-class memory | 1/46656, 0.0214%; 1/262144, 0.0038% | same, but only for an attacker that does not read timestamps (B1''') |
| (iv) all 4 templates seen in one copying submission (19 probes) | 0.983; 0.478 for K = 8 | same |
| (iv) S = 1, 2, 3 per submission | 1/926, 1/50, 0.182 | the design's figures equal the non-causal bound, where the hook knows the class's known-template states before deciding (`rates_noncausal.py`: 1/925.9, 1/50.1, 0.1817). The causal optimum is 1/1074, 1/64, 0.150 (cap 0.93%, 14.6%, 80.4%). This overstates the risk, which is the safe direction. Label the figures as bounds |
| (iv) S = 1-3 without memory | 1/4722, 1/177, 0.090 | same |

The S-rows are moot anyway. See H1.

### (4) Honest hooks on all four templates (`per_template.py`, each template forced)
| Hook | T1 | T2 | T3 | T4 |
|---|---|---|---|---|
| reference hook | 2/2 | 2/2 | 2/2 | 2/2 |
| `straightforward.py` (what a learner plausibly writes: `python3` from `PATH`, which here is `/usr/bin/python3` 3.9; inherited env plus `PYTHONPATH`; stdout+stderr combined into a JSON `reason`) | 2/2 | 2/2 | 2/2 | 2/2 |

The reference hook also passed 2/2 on Linux.

`pnpm content:validate`: "1 course(s), 6 module(s), 6 lesson(s), 0 issue(s)". Module 01 is not built yet.

## Blocking

### B1'''. The generator leaks the state through timing: P's file timestamps, and the time between probes
Green rejection sampling costs about 10^4 draws per seed (3 x 10^4 per probe). Red costs about 3 draws. In the
prototype (`harness.build`) the directories of P are created before `draw()`, and the files are written after it.
`gaps.py`, 300 + 300 builds, measured `mtime(tests/__init__.py) - mtime(src)`:

| Platform | Red | Green |
|---|---|---|
| macOS | max 0.188 ms | min 4.9 ms, median 28 ms |
| Linux | max 0.29 ms | p1 1.8 ms, median 11 ms |

`mtime_off.py` is a hook of about 20 lines. It runs no test, evaluates no hash, knows no template and keeps no
memory. It compares two `os.stat` mtimes against 1 ms and puts every grepped test name into every reason.

| Run | Result |
|---|---|
| macOS | VERDICT PASS 20/20, 360/360 red/green probes right |
| per template | 2/2 on each of T1-T4 |
| Linux, untuned | 5/10 submissions, 0.96-0.97 of probes right |

Within the cap this is about 1, at the first submission. It needs no copying, no grader source and no runner gap.
None of the 11.13 rows covers it. The rows "per-class memory 1/46656" and "(iv) needs template evaluation" are
therefore false as an upper bound on non-running hooks. 2.8 says "Deciding red or green statically needs
evaluating the template's `sha256` expressions". That is also false.

The text-only guard cannot see this: masked text and static features are identical. The 2.8 spec says nothing
about when P is created relative to the draw, or about the cost of the draw. A practice-designer copying
"P is a copy of the reference layout plus grader-controlled files" naturally copies first and generates second.
The L7 stub sampler (`d[0] % 4`) has the same structure, at a smaller cost difference.

Drawing first alone is not enough:
- `fixed_order.py` (draw before creating P): `mtime_off` 0/5, reference 2/2.
- The draw time then moves into the gap between probes. `gap_mem.py` keeps the last hook's exit time in a
  hard-coded `/tmp` file (the accepted memory class). Measured gap: red 16.3-23.2 ms, green p5 25.3 ms, median
  41.8 ms. It passed 7/10 with a fixed 20 ms threshold.
- `constwork.py` (draw first, plus a hit seed and a miss seed sampled for every value on every probe, whatever the
  state): `gap_mem` 0/10, `mtime_off` 0/3, reference 2/2.

Required change:
- (a) 2.8 generator rule, added to items 1-3:
  - The work the generator does is independent of the state. For each of `k`, `j`, `m` it samples both a hitting
    seed and a missing seed, every probe, and the state only selects which one is written. The same applies to
    the L7 stub: a seed for every behaviour, then select.
  - Every value is drawn before anything of P is created.
- (b) Extend the generator guard with a metadata and timing item, per template:
  - Build >= 1000 red and 1000 green P on disk with the real grader code path.
  - Compare, with the same 4-sd rule:
    - every pairwise mtime and ctime gap among P's paths;
    - the inode order of P's files;
    - the wall time and grader CPU time from the start of one probe's build to the hook's start.
  - Watched red: the revision-5 build order (directories before the draw), and draw-first without constant work.
- (c) Add `mtime_off` (base EMPTY skeleton) to the L1 and L7 must-fail lists. Add `gap_mem` (memory class) as a
  demo item that must fail on the logged seeds. Re-cite 1/46656 only after both runs.

## Honesty correction (non-blocking for the verdict, required with B1''')

### H1. 11.13 (iv) and 2.8: template diversity does not buy what the text says
All four templates compute the same `h` (`int(hexdigest()[:8], 16) % 10**4`, `int.from_bytes(digest()[:4])` and
the T3 loop are one function). Each writes the seeds as 16-hex literals and the constants as plain digits
(`f<j>.json`, `_a<m>`, `_m<m>.py`, `k` as a literal or a JSON value). `generic_eval.py` checks "every 16-hex
token's `h` appears as a number somewhere in P". It parses no template and runs no unittest. Result:
- macOS: VERDICT PASS 10/10 twice, 180/180 probes right;
- Linux: 5/5.

So one copying submission that shows any single template gives about 1. The S = 1/2/3 rows, the 2.8 sentences "a
static evaluator written for one shares no parsing with another" and "on a template it was not written for it is
left with a guess", and the 11.13 sentence "What the decisions buy: (iv) for a learner who copies one or two
templates is 1.07% or 18.3%" are wrong as recorded.

The accuracy judge of this round reached the same finding independently (it is already in
`curriculum-architect_mistakes.md`), so I do not append it again.

Required:
- State (iv) as "about 1 after one copying submission of any template (observed `generic_eval` 10/10); K = 4
  only defeats template-specific parsers".
- Keep the S-rows only as labelled non-causal bounds for those parsers.
- Stepan's decision (K = 4) stands; he should see this figure.

## Non-blocking

1. **The guard cannot see joint leaks.** The feature set holds single values, plus `=` and `<` between constants.
   `sum_leak.py` (red `m = (k + j) mod N`, every constant uniform on its own) passes the guard on T1 (best 0.5210
   against the 0.5447 band). A non-running hook testing `m == (k + j) % N` would win. The generator rule forbids
   this, so it is a backstop gap, not a hole. Add to the guard a code rule: the state argument reaches only the
   seed selector (one call site, checked by a grep or an AST assertion in the demo). Optionally add pairwise sums
   and differences mod N to the features.
2. **Label the S-rows as non-causal bounds** (see section 3 above), or replace them with 1/1074, 1/64, 0.150
   (cap 0.93%, 14.6%, 80.4%).

Checked:
- validate green;
- `static_off` 0/5;
- guard re-run on T3: PASS;
- leak controls on T2: offset FAIL, half FAIL;
- my `sum_leak` control: PASS, a blind spot;
- `mtime_off`:
  - macOS 20/20 PASS, Linux 5/10, 2/2 per template;
  - draw-first 0/5;
  - constant-work 0/3;
- `gap_mem`: draw-first 7/10, constant-work 0/10;
- `generic_eval`: 10/10 + 10/10 macOS, 5/5 Linux;
- reference and straightforward hooks 2/2 on each of T1-T4 (reference also 2/2 Linux, 2/2 draw-first and
  constant-work);
- 11.13 rows recomputed exactly; the (iv) S-rows match the non-causal bound;
- round-3 N1-N7 applied.

FAIL
