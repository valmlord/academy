# #41 design review, round 2: judge-assessment

Reviewed 2026-10-29: design revision 2 (`plans/41-module-spec-driven-development-design.md`, read in full),
my round-1 report, schema.ts, validate.ts (leak guard), `_contract.md`, module 00 `05-memory-agents-md/checks/verify_memory.py`
(`memory_set()`), the 00 L6 starter, `plans/15-module-introduction-design.md` 2.1 (quiz model), and the
architect's scratch evidence (`m26/` 2.6 toy, `yaml/` subset prototype, `runs/`). Verdict: FAIL, 2 blocking items.

Scratch for this round: `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-zealous-bhaskara-22c06a/8b58a220-6421-4cbe-980e-760493c05b9c/scratchpad/judge-r2/`
(`toy/` is a copy of the architect's `m26` toy plus `verdict.py`, which applies the 2.6 verdict; `toy/learner/*`
are the attack test files; `accept_inproc.py`; `arith.py`; `yaml/`).

## What I checked and ran
- `pnpm content:validate` on the current tree: `1 course(s), 6 module(s), 6 lesson(s), 0 issue(s)`. Nothing of
  module 01 is built, so starter and reference runs cannot happen yet.
- Contract after renumbering. Dirs `01-verification` .. `07-integrity-control` match `NN-kebab`. The 7 lesson ids are
  slugs and unique. The prerequisite chain starts at `intro-permissions-security`, which exists in 00. The 17 check ids
  are slugs, unique per lesson. Types and kinds are in the enum. Every command check has `workspace`, and L6 has one
  for `findings.json`. Rubric and bug-hunt files live under `checks/`. One leak-guard problem: N1.
- Inventory: command x9 (L1 2, L2 1, L3 1, L4 1, L5 1, L7 3), quiz x5 (L1, L2, L3, L4, L7, each 4 single + 2
  multiple), rubric x2, bug-hunt x1 (L6). Matches section 0.
- Time: 65+50+50+70+65+45+60 = 405. Hands-on 268 = 66.2%. Every lesson >= 60% (L2 and L3 exactly 60%).
- Probe budgets: L1 stop-hook 13 x 20 = 260 < 300. L7 18 x 20 = 360 < 420. L5: (10 mutants + 4) x 20 + (A) = 300 < 600.
  L1 late-fee: (6 mutants + 4) x 20 + 20 = 220 < 300, but ">= 6 mutants" has no upper bound (N6).
- Quiz arithmetic, exact (`arith.py`, 00 2.1 model: single 1/4, multiple 1/10): 31/25600 = 0.1211% per attempt,
  0.3628% over 3. Correct for all five quizzes.
- Bug-hunt arithmetic, exact (`arith.py`): I enumerated every allocation of <= 7 reports over 5 x (1 range + 3 decoys)
  plus `skipped-red` (2 ranges + 6 decoys), with `maxDecoyHits` 1 and `minFound` 5. The best allocation is one report
  per category: 19/4096 = 0.4639% per attempt, 1.3852% over 3. The next best allocations give 1/512. The full product
  of 4^5 x 8 = 8192 sets has 38 passing. All of the design's figures for L6 are correct.
- Round-1 items B1-B8: per-item status below. I ran attacks against each new rule:
  - the seam: argv, bytecode, source race, out-of-domain errors, cross-variant state;
  - the in-process (A) run;
  - the label cap and AST extraction;
  - the YAML subset (13 extra forms vs PyYAML 6.0.3);
  - the resolver tokenizer near-misses;
  - the pristine comparisons;
  - the row tokens.

### Attack runs (python3.12 `-I`, the architect's toy, 3 correct variants + 2 mutants)
| Attack (learner test file) | Toy as built | After `-B` on the server |
|---|---|---|
| `honest.py` (behavioural) | ref/e1/e2 ok, `m_req04` killed, `m_req01` survives (it is behaviourally equivalent, as 2.10 says) | same |
| `pyc_bank.py` (4096 tests, fingerprint = hash of the variant's leftover `__pycache__/*.pyc` code objects, path read from the server's argv via `ps`) | names `test_h_15a`/`f89`/`08b` on ref/e1/e2. Stable across runs | no pyc |
| `pyc_pin.py` (3 tests: fingerprint in the learned set) | **VERDICT PASS** (twice). It also "kills" the equivalent `m_req01` | FAIL |
| `race.py` (read `<V copy>` from argv before the unlink) | lost the race 10/10 | lost 10/10 |
| `err_bank.py` (fingerprint = messages of out-of-domain calls `late_fee(10000, "x")` etc.) | distinct for ref, e1, e2. `m_req01` differs from ref (`'<'` vs `'<='`) | same |
| `counter.py` (counter in `/tmp` keyed by `os.getppid()`. Tests fail iff run index >= 3. No call to `late_fee`) | **VERDICT PASS** | **VERDICT PASS** |
| `accept_inproc.py`: (A) acceptance in-process, learner module writes a record to `sys.argv[2]` and `os._exit(0)` | **PASS** with `return 0` code | n/a |
| same, learner module patches `unittest.TestCase.assertEqual` / `assertRaises` | **PASS** with `return 0` code | n/a |
| same, bare `os._exit(0)` (demo item 4c) | no valid record, so it fails | n/a |

## Round-1 blocking items
- B1 (fingerprints learnable): **not closed as specified.** The seam is the right idea, but the spec leaves its
  structure observable from the test process. See new B1' below.
- B2 (one name carries every id): closed. The <= 2 cap applies, labels come only from AST names, and the residual is
  recorded in 11.2. Probed edges: `test_req_01_req_02_x` -> [01, 02], `test_req_010_x` and `test_REQ_01_x` -> none,
  generated names carry nothing, and `subTest` ids are cut at the first space. Residual wording: N4.
- B3 (YAML subset): closed for the round-1 forms. The "same string as YAML" claim is overstated (N3).
- B4 (memory moves): closed. I read 00's `memory_set()`. It covers CLAUDE.md, AGENTS.md and CLAUDE.local.md at any
  depth, `.claude/rules/**/*.md`, and `@` imports over 5 hops, skipping imports inside code spans and fences. That
  catches the `@docs/release.md` move and the `.claude/rules/release.md` move, and leaves the unimported
  `docs/release.md` near-miss passing. The 00 L6 starter has no AGENTS.md, so the 20-line sum is satisfiable.
- B5 (single resolver): closed in substance. The clean/corrupted pairs (`клиент`, `clientId`, `billing`, English
  inside Russian) behave as stated in my tokenizer run. Leftover inconsistencies: N2.
- B6 (editable inputs): closed. C6 now reads the pristine glossary. The L7 (C) pristine REQ-01..08 comparison catches
  "REQ-08 text replaced", and a duplicated REQ-08 line is a new line whose id is in the pristine set.
- B7 (src layout): closed. The pinned command, the observed outputs, the bootstrap `sys.path` and the
  real-workspace demo item are all present. (A) is reopened on different grounds: B2'.
- B8 (unsatisfiable rows): closed. The rows use `Ran 0 tests`, `tests.test_<r>` and a random `<t2>`. Stream: N5.

## Blocking items

### B1'. 2.6 seam: the test process can still tell variants apart (structure, and run order)
Ran in the architect's own toy, which 2.10 cites as evidence:
1. **Argv and bytecode.** 2.6 starts `python3 -I <server.py> <V copy> <fds>`, so `ps` (or `/proc/*/cmdline` on
   Linux) shows the copy's path to every same-uid process. Importing it writes `__pycache__/<name>.pyc` next to it,
   and the server deletes only the `.py`. `pyc_pin.py` hashes the leftover code objects. The bank learns the three
   correct fingerprints in one submission, and the pin passes in the second. It even "kills" a mutant that no
   behavioural test can kill. With `-B` this fails. A slower start could still win the source race: nothing makes the
   grader wait until the unlink.
2. **Out-of-domain errors.** The proxy forwards exception type and message for any JSON input. A `TypeError` message
   names the variant's operator: the reference gives `'<='`, e2 gives `'<'`, and `m_req01` gives `'<'` on
   `days_late`. Boundary mutants, the very kind L5 adds two of, are therefore distinguishable without knowing any
   requirement. 2.6's "identical ... for EVERY input" is unattainable for structurally different equivalents. It also
   makes an honest robustness test that asserts a message fail on an equivalent, and the learner is then wrongly
   told "проверяет устройство кода".
3. **Run order and shared state.** Variants run in a fixed order, sequentially, under one grader pid. `counter.py`
   keeps a counter in `/tmp` and passes with no behavioural content. The `/tmp` channel is still open after `-B`.
   "Nothing a check run writes survives" cannot hold for files that learner code writes itself at the same uid,
   and runner 2.5.3 (a separate uid) does not close this either, because every variant run would share that uid.
   The same applies to the 2.8 probes. The rows run in table order, with the grader as the parent of every hook run.
   A hook that counts probes in `/tmp` and greps `def test_` names from `tests/test_*.py` can block or allow by row
   index without ever running the tests. It passes all 13 rows, which contradicts "pass probability 0 without a hook
   that runs the tests". This is reasoned from the spec. I did not run it: no grader exists yet.

Required change:
- (a) Give the server V's source over an inherited fd. It runs `compile`+`exec` into a fresh module, with no file,
  no bytecode cache and nothing variant-specific in argv. Otherwise, at least require `-B`, a constant copy name in
  a 0700 dir, and an unlink before a "ready" handshake. Either way, the grader starts the test process only after
  the handshake.
- (b) The server validates every argument against the seam's typed domain before calling V: ints, `date`, lists of
  the pristine dataclasses. Anything else gets one fixed, variant-independent `TypeError`. Restate the equivalence
  surface over that domain.
- (c) Shuffle variant order (2.6) and probe order (2.8, L1 and L7) per run with `secrets`. Give each variant and
  each probe a fresh TMPDIR and HOME, and kill the process group after each.
- (d) In section 11, record the remaining positional-guess residual with its number, or cap failed submissions of
  the affected checks. One shuffled guess per submission passes with probability 1/C(10,4) = 1/210 for L1 (B) with
  6 mutants. For L1 probes, guessing red vs green on the 10 discriminating rows gives 1/C(10,5) = 1/252.
- (e) Add these must-fail demo items: `pyc_pin`, `counter`, `err_bank`, and a row-counting hook.
- (f) Correct 2.3, 2.6 and section 6, which say "no structural fingerprint can tell variants apart" and "uncapped
  submissions learn nothing beyond behaviour". Both hold only after (a)-(c).

### B2'. (A) acceptance runs learner code in the grader's test process (L1, L5, L7)
2.6 and L1 specify that (A) is "run in-process by the 2.6 bootstrap (grader tests, learner module, no proxy)".
The learner's module is imported by the grader's tests, so it shares their process and the record fd (`sys.argv[2]`).
`accept_inproc.py` shows two zero-skill passes against a `return 0` implementation:
- a forged single record followed by `os._exit(0)`;
- patching `unittest.TestCase.assertEqual` and `assertRaises`.

Demo item (4c) catches only a bare `os._exit(0)`. This passes the "implementation meets requirements" part of O1 and
O5 and the dispute rule of O6.

Whether or not revision 1 had the same wording, I did not raise it in round 1. It is a gap of mine as well.

Required change: run (A) through the same seam, reversed. The learner's module is V in the server process. The
grader's acceptance tests run in the test process against the proxy. Make the forged record and the
unittest monkeypatch must-fail demo items. Record as residual (11.9 class) that server-side learner code can find
the test project by its cwd and read the acceptance tests while it runs.

## Non-blocking items
1. **Leak guard.** 2.7 says the resolver is "printed verbatim in L7 task.md", but its last bullet contains
   `checks/data/`. validate.ts fails any task.md containing `checks/`. Print only the tokenizer, region, test-name
   and regex bullets, and say "the glossary at `<root>`" for the learner.
2. **Resolver loose ends.**
   - Test-name tokens are "split on `_`" (case and digits unspecified), while prose uses the lower-cased `[A-Za-z]+`
     tokenizer. The two disagree: `test_req_01_client2` and `test_req_01_Client` match under the tokenizer but not
     under the split. Use the one tokenizer for test names too.
   - Plurals escape C6 (`clients` is not `client`). Either state this in task.md, with a near-miss, or define a
     plural rule.
   - Heading lines are not scanned, so task titles `## T-NN: <title>` escape C6, although L3 teaches Matt's
     vocabulary-in-issue-titles rule. Scan the title part of `## T-NN:` lines.
   - C6 bans the union of `_Avoid_` words, so ledger "account" cannot be written in spec, tasks or tests even in the
     ledger sense. Say so in task.md, since L3 teaches the polyseme.
   - Define the fence rule (backticks or tildes, an unclosed fence).
3. **YAML subset vs YAML typing.** These accepted plain scalars are typed by YAML, not strings:
   - `license: null` and `~` -> None;
   - `metadata: version: 1.0` -> float (SPEC: metadata is "a map from string keys to string values", and its
     example quotes `"1.0"`);
   - `internal: yes` -> bool;
   - `compatibility: 2026-10-29` -> date (skills-ref rejects a non-string compatibility).

   So "every form the subset accepts parses ... with the same string" (2.3, 2.10 item 5) is false. Reject YAML
   1.1-typed plain scalars outside the two CC boolean fields with "quote the value".

   Also:
   - The prototype keeps a leading space for `key:  value`, which the spec rejects. Align the implementation.
   - Folded and literal scalars (`>`, `|`) get "quote the value". Use a "one line" message for them instead.
   - CRLF frontmatter is rejected as "line 1 not ---". Normalize line endings or name the rule.
4. **Residual 11.2 wording.** The cheapest form of "labels spread in pairs" is a single behavioural test plus
   labelled stubs that fail through shared module state, a flag set by the earlier test. The bootstrap can shuffle
   test order per variant, which reduces this to the recorded "every test asserts everything".
5. **L7 row 5 stream.** State which stream the stub writes on each row (findings on stdout; usage on stderr as
   argparse does, or stdout). task.md should say the hook forwards both streams. Otherwise an honest hook that
   forwards stdout only fails row 5 for a reason task.md does not state.
6. **L1 late-fee budget.** Bound the mutant count, or check (mutants + 4) x 20 + 20 <= 300 in the demo. With more
   than 10 mutants it overruns.
7. **L7 linter roots.** Shuffle the root order per run as well (same channel as B1'(c)). Low value to an attacker,
   because the tokens are random, but cheap.
8. **Run-scope claim in 2.3.** Scope "nothing a check run writes survives" to grader-created files. Learner code at
   the same uid can write the workspace or `/tmp`, for example copying the grader's acceptance tests; that belongs
   in 11.9.

Checked: content:validate green (6 lessons, 0 issues); contract fit of the 7 dirs, ids and checks; quiz 31/25600 =
0.1211% / 0.3628%; bug-hunt 19/4096 = 0.4639% / 1.3852%, next best 1/512, 38/8192 (exact enumeration); timeouts;
seam attacks in the architect's toy: pyc pin PASS, counter PASS, error fingerprint distinguishes ref/e1/e2/m_req01,
source race lost 10/10; in-process (A): forged record PASS, monkeypatch PASS, bare `os._exit` fails; tokenizer and
label regex boundaries; 13 YAML forms vs PyYAML 6.0.3; 00 `memory_set()` read.

FAIL
