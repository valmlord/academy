# #41 design review, round 3: judge-assessment

Reviewed 2026-10-29: design revision 3 (`plans/41-module-spec-driven-development-design.md`). I read sections 0-2.10,
L1, L5-L7, 6, 7, 10, 11 and 15 in full. I also read my round-2 report, `judge_mistakes.md`, `_contract.md`, and the
architect's m3 prototype (`grader.py`, `server.py`, `bootstrap.py`, `proxy_late_fee.py`, every variant,
`probes/harness.py`, the probe hooks, `linux_run.sh/.out`, `yaml_typed.py`). Verdict: FAIL, 1 blocking item.

Scratch for this round:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-zealous-bhaskara-22c06a/8b58a220-6421-4cbe-980e-760493c05b9c/scratchpad/judge-r3/`.
It holds:
- `m3/`: a copy of the architect's prototype;
- `m3/mine/`, `m3/mineA/`: my attack files;
- `m3/probes/hooks/static_off.py`: the probe attacker;
- `diffeq.py`, `timing_driver.py`, `side_driver.py`, `linux_r3.sh`;
- `yaml/check.py`.

## What I checked and ran
All runs used python3.12 `-I` (3.12.13) on macOS. The Linux runs used `python:3.12-slim` (3.12.16), uid 1000,
`--network none`, Yama absent.

### B1' and B2': my round-2 attacks re-run against m3
| Attack | Result |
|---|---|
| architect's `honest.py` (B) | VERDICT PASS (macOS and Linux) |
| my round-2 `honest.py` (no rounding test) | FAIL, only `m_round` survives (correct: the test is weak) |
| `pyc_pin` | FAIL. The `ps` scan finds no V path 12/12 runs (`none zzz`), and no `.pyc` exists |
| `race` | FAIL, 12/12 runs `none` |
| `err_bank` | FAIL. Every variant gives the same signature, so the bank fails every correct run |
| `counter` (E=6, key = grader pid), shuffle off | VERDICT PASS (control) |
| `counter`, shuffled | 0/40 PASS |
| (A) reference | PASS |
| (A) `return 0` | FAIL 4/5 |
| (A) forged record to `sys.argv[2]` and to fds 0-63, then `os._exit(0)` | FAIL, `ready=False`, 5 errors |
| (A) monkeypatched `assertEqual` / `assertRaises` + `return 0` | FAIL 4/5 (the patch lives in the server) |
| (A) bare `os._exit(0)` | FAIL |
| Linux: `proc_probe` (B), `proc_forge` (A) | FAIL; `proc_forge` gives test process exit -9 |

B1'.1 (argv and bytecode), B1'.2 (out-of-domain text) and B2' (acceptance in-process) are closed as specified.
B1'.3 (run order) is closed for the variant runs. It is not closed for the Stop-hook probes (B1'' below).

### New attacks on the revision-3 seam
- **In-domain equivalence of the prototype.** Reference, e1 and e2 on 100,256 inputs over the prototype's bound
  (|x| <= 10^9, plus 16x16 edges, exception type and message included): 0 differ.
- **Nonce in (B).** A test file reads `sys.modules["__main__"].nonce` and `REC_FD` and writes its own record with
  the real nonce. The record is accepted (12/12 nonces found). The attack gains nothing, because it cannot tell
  variants apart: correct runs pass, mutants survive, FAIL. In (B) the nonce protects nothing. The design's
  must-fail item "forged record with a guessed nonce" proves only what the real-nonce forge shows anyway (N3).
- **Grader process memory (Linux).** The grader is not made non-dumpable. Learner code read
  `/proc/<ppid>/mem` of the grader:
  - from the server in (A): it found the acceptance test source, 2 candidates for the 32-hex nonce, and the
    record pipe in the grader's `fd/`;
  - from the test process in (B): it found 5-8 copies of variant source per run.

  Both still FAIL because I built no full exploit. They are the same class as the open mount residual (N1),
  but the 2.6 and 11.13 claim "Linux `/proc` closed" is true only for the server and the test process (N2).
- **Mount differential (B), macOS.** The test reads the grader's argv with `ps` and its cwd with `lsof`, loads
  `variants/reference.py` from the checks directory, and compares the seam with it on random inputs plus
  edges. It knows no requirement. VERDICT PASS 3/3. This is the 11.9 residual. The design rates it "open", with
  no number (N1).
- **Timing (B).** 3000 calls per run, median latency, 6 runs per variant. The ranges of all 9 variants overlap
  (base median 8.9-18.1 us, path difference within ±2 us noise). Not separable in the toy.
- **Resource side channel (B).** Server stats readable without `mem`:
  - macOS `ps` rss/vsz: overlapping for every variant;
  - Linux `/proc/<srv>/stat` minflt, rss, statm and VmRSS (all readable after `PR_SET_DUMPABLE` 0): 6 runs per
    variant, the same modal values for all 9 variants, jitter ±2.

  Not separable in the toy, whose variants are 4-10 lines. N4 covers this.
- **Probe generator (L1 / L7 Stop hook).** `static_off.py` is a hook that never runs a test and evaluates no
  `sha256`. It greps the literal `+ 1))` that `harness.build()` writes on red (`+ 0))` on green). Result:
  VERDICT PASS 5/5 on the shuffled 20-probe harness. This is B1'' below.
- Re-ran the architect's probe items:
  - reference hook: PASS;
  - `raw_forward`: FAIL on red rows;
  - `with_I`: FAIL on green rows;
  - `counter_grep`: fixed order PASS, shuffled FAIL;
  - `memory_guess`: 0/20.

### 11.13 rates, recomputed exactly (`math.comb`, `fractions`)
| Check | Rate per submission | Over 100 submissions | With a cap of 10 | Without memory |
|---|---|---|---|---|
| L1 and L5 (B), positional guess | 1/C(18,6) = 1/18564 = 0.0054% | 0.537% | 0.0539% | max_q q^6(1-q)^12 = 1/94585.1 |
| L7 (B), positional guess | 1/C(20,6) = 1/38760 = 0.0026% | 0.258% | 0.0258% | 1/202255.3 |
| Stop-hook probes, non-running guess | (1/6)^6 = 1/46656 = 0.0021% | 0.214% | 0.0214% | per class max_q q(1-q)/2 = 1/8, total 1/262144 |

- Round-2 figures 1/210 and 1/252 are confirmed.
- Every number in 2.6, L1 and 11.13 is correct arithmetic. The probe rate holds only for a generator that
  satisfies 2.8's own property, and the cited prototype does not (B1'').
- If side channels separate the equivalents (N4), L1/L5 becomes 1/C(15,3) = 1/455 and L7 becomes 1/C(17,3) = 1/680.

### Non-blocking items from round 2
- **N1, leak guard.** I grepped every `checks/` occurrence in the design (21 lines). All are grader or check
  descriptions. None is in planned theory.md, task.md or starter text. 2.7 now prints five bullets and replaces
  the sixth with "under `<root>`", and L7 task.md item 1 says so. Applied.
- **N2, resolver.** Applied:
  - one tokenizer, with `test_req_01_client2` yielding `client`;
  - the `s`/`es` plural rule, with `billing` as a near-miss and `clients` as a corrupted root;
  - `## T-NN:` titles scanned;
  - `account` and `LedgerAccount` stated in L5 item 5 and L7;
  - the CommonMark fence rule.
- **N3, YAML.** Applied:
  - two spaces after the colon rejected;
  - block scalars get "one line";
  - CRLF normalized;
  - "same scalar text".

  I ran the m3 typed-scalar regex against PyYAML 6.0.3 on 70 new values (casings, signs, `0x_1`, sexagesimal,
  `1.0e+3`, timestamps with `t` and offsets, `0777`, `-0x1F` and others):
  - 0 typed values were accepted;
  - 6 strict-side rejections (`Y`, `N`, `+.5`, `-.5`, `._`, and `-`, which the leading-character rule rejects anyway);
  - 1 edge: `2026-10-29 ` with a trailing space is a date to PyYAML. The design does not say whether values
    are right-stripped before classification (N6).
- **N4.** The test order is shuffled in `bootstrap.py`, and the 11.2 wording is updated. Applied.
- **N5.** Streams are stated: stdout for findings, stderr for usage and parse errors. The hook forwards both. Applied.
- **N6.** Counts are fixed at 12/12/14. L1 budget: 19 x 10 = 190 < 300. L5: 190 < 600. L7: 21 x 10 = 210 < 600.
  Probe budgets: 20 x 20 = 400 < 480 and 25 x 20 = 500 < 600. Applied.
- **N7.** Linter roots are shuffled. Applied.
- **N8.** The "nothing survives" scope is limited to grader-created files (2.3, 11.9). Applied.

### Quiz and bug-hunt
The counts are unchanged: 5 quizzes of 4 single + 2 multiple questions, `passScore` 0.8; L6 has 21 decoys,
`minFound` 5, `maxReports` 7, `maxDecoyHits` 1. Round-2 figures stand: 31/25600 per quiz; 19/4096, 38/8192 for
the bug-hunt. I did not re-run them.

`pnpm content:validate`: nothing of module 01 is built, and this round changes only plans, so I did not re-run it.
The round-2 result stands.

## Blocking

### B1''. The L1/L7 probe generator: red and green are distinguishable from the file text; the design does not pin the property tightly enough to rebuild it
2.8 requires: "Red and green P ... differ only in values that are visible only after evaluating `sha256`
expressions in the test code". 2.10 item 8 and 11.13 rest the non-running rate (1/46656) on the m3 harness.
That harness writes the red/green flag as a literal:
`"f%d.json" % (_h("<seed>", 10**6) + {off})` and `... % 10**6 + {off}))`, with `off` = 1 on red and 0 on green.
The expected constant is `k = h + 1` on red. That is a smaller leak: `k = 0` means green and `k = 97` means red.

`static_off.py` (no test run, no hashing, about 15 lines) passes the shuffled harness 5/5. So:
- the "best non-running attacker" of 2.10 item 8 was not the best;
- the 0/150 figure measured a weaker attack;
- B1'.3 for the probes (the row-counting and the non-running hook) is not closed in the evidence the design
  cites.

The planned guard, "red and green P of one seed diffed to show they differ only in the computed values", would
not catch it: the diff shows `+ 1` vs `+ 0`, which reads as a computed value. The architect wrote both the rule
and the prototype, and the prototype breaks the rule. A practice-designer rebuilding from the same sentence can
do the same. The same generator feeds the L7 `stop-hook-integrity` regression probes and its red linter probe.

Required change:
- (a) Specify the generator the way L7's stub already is: one template; every value in the files is a fresh
  uniform random seed, name or constant. A probe's state is set only by which random values the grader picked
  (rejection sampling on the `sha256` result). There is no flag or offset literal, and every literal has the
  same distribution on red and green. For example:
  - the constant is uniform on both sides, equal to `h` on green and `(h + r) mod n` with uniform `r != 0` on red;
  - the fixture file and the module attribute on disk get a name from a second fresh seed on red.
- (b) Add to the L1 must-fail list and the demo: `static_off` (grep for a literal that differs, base EMPTY
  skeleton) must fail on every logged seed. Also add a distribution check over >= 1000 generated red/green pairs:
  with every random seed and name masked, the text is byte-identical, and the multiset of each remaining
  literal's values does not separate red from green.
- (c) Re-run 2.10 item 8 on the corrected generator. Restate the 1/46656 claim only on that run.

## Non-blocking
1. **11.13 mount row: state its rate.** The row says "open" with no number, and 11.9 says "if it finds the
   path". The grader's argv (`ps`, or `/proc/<pid>/cmdline`, readable even when the process is non-dumpable)
   gives the path. `mount_diff.py` passed (B) 3/3 with no requirement knowledge. Write "pass probability about 1
   for a learner who reads the grader's argv; observed". Drop "the env carries no `ACADEMY_CHECKS_DIR`" as a
   mitigation. As written, the recommendation "accept these rates, below the quizzes" compares numbers that
   this row dominates. This is the same accepted class as module 00, so it is not reopened, but Stepan should
   decide on the true figure.
2. **Grader non-dumpable.** Add the 2.6 `prctl(PR_SET_DUMPABLE, 0)` snippet as the grader's first statement on
   Linux. Add a must-fail item: learner code (server in (A), test process in (B)) reads `/proc/<ppid>/mem` and
   `fd/`. In my run this succeeded: it found the acceptance source, the nonce candidates and the variant
   sources. Correct the 2.6 and 11.13 "`/proc` closed" wording to name the three processes.
3. **(B) nonce wording.** In (B), learner code shares the process with the bootstrap, so it can read the real
   nonce and write a valid record (observed). Say that the (B) verdict rests only on the variants being
   unidentifiable, and that the nonce and exit-code rule protect (A). Replace the "guessed nonce" demo item for
   (B) with the real-nonce forge, which must still FAIL on its mutants.
4. **Resource side channels.** World-readable server stats (Linux `/proc/<pid>/stat` minflt and rss, `statm`,
   `status`; macOS `ps` rss) stay readable after `PR_SET_DUMPABLE` 0. Add them to the structure probe and to
   residual (ii), which becomes "timing and resource usage". In the demo, run the probe on the real-size
   equivalents. If e1..e3 separate from the reference there, the attacker knows 3 correct positions, and the
   rate becomes 1/455 (L1/L5) and 1/680 (L7). Then either record that rate or make all six correct runs
   reference copies: behind the seam, equivalents catch only timing or resource dependence.
5. **Bound D in the text.** The prototype rejects |x| > 10^9 as out of domain (`LIMIT`), but 2.6 and the L1
   `docs/late-fee.md` state D as "exact `int`, `bool` excluded" with no bound. The L5/L7 dataclass fields are
   unbounded too (ints, strings, list lengths, dates). With an unbounded D:
   - "identical over D" cannot be established by "100k random inputs in D", because the sampler is undefined;
   - an equivalent of "different arithmetic form" can diverge, or time out, on huge values;
   - an honest test with a large amount gets the domain `TypeError` the requirement document never mentions.

   State the numeric bounds in 2.6, in the requirement documents and in task.md. Say the differential sampler
   covers the whole bounded range plus its extremes.
6. **Subset value whitespace.** Say whether trailing spaces of a plain value are stripped before the typed-form
   rule, or rejected. `2026-10-29 ` is a date in PyYAML.
7. **Probe draw.** Say that each class's pattern is drawn uniformly and independently with `secrets`. The rate
   (1/6)^6 assumes it. The prototype does this, but the text says only "drawn per run".

Checked:
- round-2 attacks on m3: B1'.1/.2 and B2' closed (pyc_pin, race, err_bank, counter 0/40 with the fixed-order
  control passing, (A) forge/patch/exit all FAIL, Linux proc_probe and proc_forge FAIL);
- new attacks:
  - static probe grep: PASS 5/5 (blocking);
  - mount differential: PASS 3/3 (recorded residual);
  - grader `/proc` memory readable on Linux;
  - real-nonce forge in (B): no gain;
  - timing and resource stats: not separable in the toy;
- in-domain equivalence: 0/100256 differ;
- 11.13 rates recomputed exactly;
- YAML typed rule: 70 values vs PyYAML 6.0.3, 0 typed values accepted;
- round-2 N1-N8 applied;
- leak-guard grep: 0 visible-text hits;
- budgets.

FAIL
