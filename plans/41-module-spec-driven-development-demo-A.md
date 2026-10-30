# #41 demo record A: L1 `01-verification`, L5 `05-pocock-pipeline`, L7 `07-integrity-control`

Practice-designer A, 2026-10-29. Protocol: design 2.4 (as 00 2.4) with the 2.6 and 2.8 additions.
Every command and its raw output is kept next to this file in `plans/41-module-spec-driven-development-demo-A/`
(`out_*.txt`); the tables below summarise them. Re-run on the image interpreter before `ready`.

## Environment
- macOS, `python3 --version`: **Python 3.12.13** (`/opt/homebrew/bin/python3.12`, first on PATH through a
  scratch `python3` symlink; `/usr/bin/python3` is 3.9.6 and is never used for checks). Spot runs on
  **3.11.14** (`out_py311.txt`).
- Linux: `python:3.12-slim` (Python **3.12.16**), uid 1000, `--network none`, repo mounted read-only, Yama
  absent (`linux_run.sh`, `out_linux.txt`).
- Driver: `run_check.py` builds the grader mount as a copy of `checks/` without `reference/` and
  `data/reserve/`, the workspace as a fresh copy of `starter/` (plus `checks/reference/` for base
  "reference") plus overlays, and runs `python3 -I "$ACADEMY_CHECKS_DIR/<script>"` with a fixed PATH and
  HOME. It sets the exec bit on hook copies, because the repo files cannot carry it yet (see "Open").
- Exit codes of every capped check: 0 pass, **3 stage-0 failure (not counted)**, 1 counted failure.

## (1)/(2) Untouched starter fails, reference passes (macOS 3.12 and Linux 3.12.16)
| Check | Starter | Reference |
|---|---|---|
| `late-fee-verified` | exit 3, stage 0: the skipped test | exit 0 (1.3 s) |
| `stop-hook-tests` | exit 3, stage 0: no Stop hook | exit 0 (1.9 s) |
| `reminders-accepted` | exit 3, stage 0: tasks not done | exit 0 (1.3 s) |
| `change-request-applied` | exit 3, stage 0: no new requirement | exit 0 (1.5 s) |
| `stop-hook-integrity` | exit 1 (L5 hook registered, linter rows fail) | exit 0 (2.4 s) |
| `artifact-linter` | exit 1 (skeleton raises) | exit 0, 3/3 seeds |
Also on 3.11.14: L1 both checks pass on the reference.

## Stage 0 vs counted pairs (2.5; `out_pairs.txt`)
Counter = number of exit-1 results. Every stage-0 row leaves it unchanged, every counted row raises it by 1.
| Check | Stage 0 (exit 3) | Counted (exit 1) |
|---|---|---|
| late-fee-verified | untouched starter (skip) | weak tests: mutant REQ-01 survives |
| stop-hook-tests | `matcher: "*"` | exit 1 with names on stderr |
| reminders-accepted | a task left `todo` | weak labelled tests: mutants survive |
| change-request-applied | ADR numbering gap (C4 ADR-0003) | test broken on a correct version |
| stop-hook-integrity | `matcher: "*"` | linter token dropped from the reason |

## L1 `late-fee-verified` (`out_l1_seam.txt`, `out_l1_banks.txt`, `out_l1_near.txt`)
Base REFERENCE implementation for (B) attacks (so (A) passes), learner test file replaced.
| Item | Result |
|---|---|
| reference code + starter tests | exit 3 (skip); same tests without the skip: exit 1, mutants survive |
| reference tests + starter code | exit 1, (A) REQ-03 and REQ-05 |
| weak tests / tautological tests | exit 1, mutants survive |
| private helper import (`GRACE_DAYS`) | exit 3 stage 0; dynamic `importlib` getattr: exit 1 (proxy exposes only `late_fee`) |
| dynamic `skipTest` | exit 1 "тесты пропущены во время запуска" |
| top-level `os._exit(0)` (with 3 literal tests) | exit 1, no valid record |
| real-nonce forge (stack walk to `nonce`, `record_fd`, writes a 3-passing-tests record, `os._exit(0)`) | exit 1: it runs at import, before the `loaded` ack, so the run is "tests did not load" on every variant; a forge after the ack would still say the same on every variant and fail on the mutants (2.6) |
| source/code/size fingerprint bank, `pyc_bank`, `race`, `err_bank`, `raw_pipe`, structure probe (each + 3 literal tests) | all exit 1; debug views over 18 runs: 1 distinct each (`err`, `race`, `raw`, `struct`, `pyc_pin`) |
| `counter` (/tmp keyed by grader pid) | fixed order (control) **PASS**; shuffled **0/30** (`out_counter.txt`); in the matrix exit 1 |
| timing, `side` (ps rss) probes | exit 1 |
| (A) `return 0`, bare `os._exit`, forged record via argv / fds 0-63, patched asserts, top-level exit, `hijack` | all exit 1 |
| (4c) top-level `os._exit(0)` in the REFERENCE implementation | exit 1 |
| near-miss: renamed and reordered reference tests; domain `TypeError` for `"x"` and `1_000_000_001`; both bounds; subTest loop; keyword arguments; two and more TestCase classes | exit 0 |
Linux (`out_linux.txt`): `/proc` probe of the server: `environ` and `mem` PermissionError, `fd/` empty, 1 view
over 18 runs, exit 1; `grader_mem_b` (B) PermissionError on `/proc/<ppid>/mem` 18/18; `grader_mem` (A)
PermissionError on `/proc/<ppid>/maps`, `cmdline` readable (residual iii); `proc_forge` (A): `mem`
PermissionError, bootstrap killed, exit -9, exit 1; `side` (Linux stat/statm/VmRSS): exit 1.

Mutants (`out_mutant_audit.txt`): 12 L1, 12 L5, 14 L7; every mutant has a witness inside D, no two alike on
the sample. L1 reference over 120 256 calls (uniform over D, extremes, boundaries): only `ok` and
`ValueError("amount_cents must be positive")`. L5/L7 reference over 20 000 structured calls: no exception.
Side-channel guard (`out_side.txt`, macOS): 40 runs per variant, threshold learned on 20, tested on 20:
best accuracy 0.650 (`m01_grace_four_days`, median latency of a 300-call loop), 4-sd band 0.816: within band.

## L1 `stop-hook-tests` (`out_l1_hooks.txt`, `out_l1_reg.txt`, `out_hook_grounding.txt`, `out_hook_attacks_l1.txt`)
Must fail on the REFERENCE hook with one change, all exit 1: exit 1 + names on stderr; exit 2 + raw output
(missing-file phrase); `-I` child; no `PYTHONPATH`; `continue: false` (exit 0 and 2); `approve` on green;
block without reason; names only in `systemMessage`; plain text; JSON array; two objects; exit 2 + plain
stdout; `hookSpecificOutput` on green; exit 2 on green; first name only; always block; trust
`last_assistant_message`; ignore `stop_hook_active`; missing key as true; crash on non-JSON; hard-coded
"Ran 0 tests"; empty skeleton (always allow). Decide by exit code only: **passes on 3.12** (exit 5 on zero
tests, correct), **fails on 3.11.14** (zero-tests probe), as the design states.
Near-miss, all exit 0: pretty JSON; JSON on exit 2 with stderr; JSON on exit 1; exit 2 with names only on
stderr; exit 2 with `systemMessage` and names on stderr; allow as `{}` and as `continue: true` +
`suppressOutput` + `systemMessage`; `python3` from PATH; temp file under `$TMPDIR`.
Registration: 22 must-fail settings (matcher, if, once, shell, async, asyncRewake, agent/prompt/http types,
timeout 5, disableAllHooks true in either file, two groups, a second Stop hook in the local file, typo
`stop_test.py` in shell and exec form, relative path, unquoted variable, quoted exec arg, bare `$VAR` in exec,
unknown key, bad onFailure, no hooks) all exit 3; 17 must-pass (E1-E3, the 12 shell spellings with edge
whitespace, timeout 30 + statusMessage + onFailure, onFailure continue, disableAllHooks false) all exit 0.
Grounding with a project path containing a space: E1-E3 and all 12 shell spellings started for real, exit 0;
typo path under `sh -c`: exit 2 "No such file or directory"; E1 without the exec bit: PermissionError.
Reference hook on the real L1 reference workspace: green exit 0, no output; one test broken: block with its
name; every assertEqual test broken plus the probe files: all 7 names and both probe tokens in the reason;
the missing-file phrase appears only inside the JSON reason on stdout, never on stderr.
Attackers (real probe code, shuffled; base EMPTY skeleton semantics):
| Hook | Result |
|---|---|
| reference | 3/3 PASS, 54/54 probes right |
| `counter_grep` | fixed order (control) 2/2 PASS; shuffled 0/20 |
| `static_off` | 0/20 (never blocks red) |
| `static_ast` (adapted to read only the generated `test_x*.py`) | 0/20, 0.522 of probes right |
| `mtime_off` | 0/20, 0.481 |
| `gap_mem` | 0/20, 0.486 |
| `cpu_mem` (judge r5) | 0/20, 0.511 |
| per-class memory hook | 0/300; per-class hit 287/1800 = 0.159 (theory 1/6); 1/46656 holds as the modelled bound |
| `generic_eval` | **10/10 PASS**: residual (iv), accepted |

## Generator guards (`guards/out_guards.txt`, 1000 + 1000 pairs, macOS 3.12, run alone)
| Guard | Grader | Watched-red controls |
|---|---|---|
| state flow (P3 rules incl.) | PASS | `sum_leak` FAIL, `genleak` FAIL, `tokflow` FAIL, `tokleak` FAIL (call/walrus), stub selector leak FAIL |
| text | 1 masked text over 4000; best 0.5175 of 396 features; band 0.5447: PASS | offset FAIL (1.0); half-range red k FAIL (0.758); `sum` 0.543 PASS (only state flow sees it) |
| text, L7 stub seeds | 1 masked text over 4000; best 0.5210; PASS | |
| metadata and timing, L1 path | best 0.5300 of 633 features; wall median 31.8 / 31.5 ms: PASS | revision-5 order 1.0 FAIL; draw-first with state-dependent work 1.0 FAIL |
| metadata and timing, L7 stub path | best 0.5350 of 1137 features: PASS | |

## L5 `reminders-accepted` (`out_l5.txt`)
Must fail: tests without `req_NN` (exit 3); labels swapped between two tests (exit 1, killed only by
unlabelled tests); one name with all 8 labels (exit 3); labels only through `setattr` (exit 3, C3); a task
`todo` (exit 3); `client` and `clients` in a test name (exit 3, C6); `_Avoid_: client` deleted in the workspace
+ `client` in a name (exit 3: pristine glossary); weak and tautological labelled tests (exit 1); top-level
exit after the tests (exit 1); (A) `return []`, bare exit, patched asserts, forged fds (exit 1); a disallowed
implementation import (exit 3); the starter stub (exit 1). Near-miss, exit 0: `test_req_05_req_07_...`,
`LedgerAccount` in a name, a subTest loop, helper functions and four TestCase classes (the reference).

## L7 (`out_l7_change.txt`, `out_l7_hooks.txt`, `out_hook_attacks_l7.txt`, linter runs)
`change-request-applied` must fail: spec unchanged; REQ-08 text replaced; REQ-08 id reused; no task lists the
new id; listing task `todo`; test labelled for another REQ; no dispute test; `_Avoid_` line deleted + `client`
in the requirement (all exit 3); L5 code without the dispute rule (exit 1). Near-miss exit 0: new id REQ-12;
new line between REQ-03 and REQ-04.
`stop-hook-integrity` must fail (exit 1): token only in `systemMessage`; plain-text stdout; `continue: false`;
linter exit 2 treated as clean; only stdout forwarded; exit code ignored; token dropped; fixed usage text;
linter first with early allow; the L1 hook without linter; grep of the stub source; six L1 regression
must-fails. Near-miss exit 0: forwarded on stderr with exit 2; tests and linter joined in one reason.
Attackers wrapped with a linter call: reference 3/3; `counter_grep` fixed 2/2 PASS, shuffled 0/20;
`static_off` 0/20; `static_ast` 0/20; `mtime_off` 0/20; `gap_mem` 0/20; memory hook 0/100 (per-class
0.138). `generic_eval` as built for L1 0/10 (it also hashes the stub seed); with one line skipping
`scripts/` **5/5 PASS**: residual (iv) applies unchanged.
`artifact-linter`: skeleton fails all 25 roots and the workspace; the reference passes 3/3 seeds (8 clean
near-miss roots, 4 exit-2 cases, 13 one-violation roots, each with exactly one finding line, workspace exit 0).

## Runner items (`out_runner_cheats.txt`), every command check of L1, L5, L7
(4a) usercustomize on the EMPTY starter: without `-I` exit 0 (the attack is real), with `-I` exit 3 or 1.
(4b) PATH shim `python3` exiting 0: passes (runner-only defence); fixed PATH: fails. (4d) the mount holds no
`reference/` and no `data/reserve/`.

## Quizzes (`out_quiz.txt`, scratch scorer)
`verification-quiz`, `integrity-quiz` and both reserves: 6 questions (4 single + 2 multiple), 4 options,
keys valid, every single-key position used once in the quizzes; key 1.0, empty 0, every always-letter
0.167 or less, longest-option strategy 0.33/0.17 in the quizzes; random pass 0.111% / 0.116% over 200 000
trials (analytic 0.1211%).

## Shared code
`sdd_seam.py`, `sdd_static.py`, `fixtures/seam_*.py` byte-identical in L1, L5, L7; `sdd_stophook.py`,
`sdd_probegen.py` in L1, L7; `sdd_trace.py` in L5, L7; `sdd_grammar.py` byte-identical with practice-designer
B's copy (sha256 8055c2a2...f50f40a3). `pnpm content:validate`: 0 issues.

## Round 2: fixes after student run A (2026-10-29)

### Cheat 12 (cross-run memory of acceptance inputs): fix (A)
Before: (A) sent fixed acceptance inputs; the learner's module (the seam server in (A)) logged them to a
hard-coded path, the (B) runs recorded the reference's outputs on them (per-input majority over 18/20 runs),
and a lookup table passed (A) after 4-5 counted failures (student record A).
Fix: `checks/sdd_accept.py` (new, byte-identical in L1, L5, L7). Every (A) run draws fresh inputs from D with
`secrets.SystemRandom`, per requirement (L1 60 per REQ-01..05, boundaries included; L5 30 per REQ-01..08;
L7 the same plus 30 dispute cases): structured `plan_reminders` calls with shared customers, escalation
histories (sometimes two reminders of the top level), noise history of other invoices, duplicate ids, balances
around 500, all four statuses, large lines. Expected answers come from the reference in a seam server of its own
(`sdd_seam.oracle_answers`), started and killed before the learner's module exists; the drawn cases and answers
go into the acceptance source (`DRAWN`, pipe only, never on disk), and each `test_req_NN` first runs its
category (`check_drawn`), then its fixed examples. A table of earlier inputs covers none of the drawn ones.
A reference fault (no answer, a drawn case outside D) is reported as an internal error, exit 3, not counted.
- Draw quality (`draw_audit.py`, `out_draw_audit.txt`, drawn cases only, fixed examples left out): every mutant
  is caught by its own requirement's category in every draw, L1 500/500, L5 500/500, L7 500/500; every drawn
  case decodes in D; the reference raises only `ValueError("amount_cents must be positive")` (L1) or nothing.
- Must fail, the student's protocol automated (`cross_run_cheat.py`, `out_cross_run.txt`): round k = lookup
  table from the per-input majority + logging of unknown inputs, recording tests; 10 counted submissions; then
  the table-only final with snapshot tests.
  | Lesson | loot in a hard-coded path outside the workspace | loot inside the workspace |
  |---|---|---|
  | L1 late-fee-verified | (A) fails all 10 rounds (5 REQs each), final exit 1 | same, final exit 1 |
  | L5 reminders-accepted | (A) fails all 10 rounds (7 REQs), final exit 1 | same, final exit 1 |
  | L7 change-request-applied | (A) fails all 10 rounds (8), final exit 1 | same, final exit 1 |
  Control, guard watched going red (`out_cross_run_control.txt`): the same driver against a mount patched to a
  fixed seed and 1 case per requirement (fixed inputs, as before the fix): **PASS** after 6 (L1), 5 (L5), 5 (L7)
  counted failures, the student's figure. With a fixed seed and the full 30/60 cases the attack did not finish
  within 10 either (`check_drawn` stops at the first wrong case, so about one new input per category leaks per
  submission); freshness is the defence, this is a second one.
- The student's exact final files (`attacks/cross_run/student_final_*`, `rows_cross_run.txt`,
  `out_cross_run_rows.txt`): L1 table + snapshot tests exit 1 (A); L1 table + reference tests exit 1; L5 and L7
  table + snapshot exit 1 (A).
- Honest controls: the student's honest L1 code and tests exit 0; the student's L5 tests on the reference exit 0;
  the student's L7 change exit 0; the reference passes 3/3 in each check after the change.
- Residual, recorded and not closed: with (A) forcing real behaviour, (B) by "snapshot of recorded correct
  outputs" (the learner records the reference's outputs on chosen inputs in the (B) runs and asserts them) is
  equivalent to the accepted 11.2 residual "differential test against the learner's own correct
  re-implementation": the learner already holds a correct implementation that passes (A) and can compute the
  same expected values; choosing discriminating inputs stays theirs.
- Reconciling design 11.13 row (i): cross-run storage of acceptance inputs and outputs was rated there as a
  positional guess (1/C(18,6) = 0.0054% per submission, 0.0539% within the cap; L7 0.0258%). Observed in the
  student run before this fix: about 1 within the cap (4-5 counted failures, all three checks). After: 0 of 6
  automated runs (2 loot locations x 3 checks, 10 counted submissions each); the stored table never covers a
  fresh draw (inputs from ranges of 10^9 values or structured lists, collision chance negligible). Row (i)'s
  positional-guess figure stays valid for (B) only.

### L5 spec pins (non-blocking item)
`docs/spec.md` Implementation Decisions (L5 starter, L7 starter, L7 pristine and reference spec, byte-identical
among the three shipped copies): the 14 days of REQ-02/03 count from the latest `sent_on` of the highest level;
of several Invoices with one id only the first in list order counts, even if it is not ISSUED. The reference
already did both; fixed acceptance examples added (invoices 205/206, 810/811) and the draws exercise both;
reference tests gained `test_req_02_counts_from_the_latest_first_reminder` and
`test_req_08_only_the_first_invoice_with_an_id_counts` (L5 reference, L7 starter, L7 reference). Must fail:
earliest `sent_on` exit 1 (A) REQ-02; first ISSUED duplicate counts exit 1 (A) REQ-08; the student's honest L5
code (second occurrence) now exit 1 (A) REQ-08, as the pinned spec requires. Note: L4's reference spec (lesson
B) no longer equals the L5 starter spec. After practice-designer B's glossary/brief/transcript sync: the L7
`checks/data/glossary` ledger file re-synced with the starter (avoid words unchanged); L5 draws keep
`dispute` NONE, consistent with the transcript's "Dispute ignored in this feature" (the L5 reference ignores it).

### L7 time fallback: helper module
`starter/scripts/artifact_text.py`: `normalize_newlines(text)`, `tokens(text)`, `token_matches(token, word)`,
`fenced_line_flags(lines)` (the 2.7 tokenizer, match rule and fence scanner). The skeleton imports it after
`sys.path.insert(0, <script dir>)` (`python3 -I` on 3.11+ does not add it). `verify_linter.py` copies every
`scripts/*.py` next to the linter copy. Reference linter now imports the helper: 3/3 PASS; alone without the
helper: `ModuleNotFoundError` (the copy is what makes it pass); the student's self-contained linter still PASS;
skeleton still exit 1. C6 token unchanged: the token as found in the text (`clients`).

### Re-run of the touched checks (`out_rerun_*.txt`)
`rows_l1_seam`, `rows_l1_banks`, `rows_l5`, `rows_l7_change`, `rows_pairs`: every row as in round 1 (starter
exit 3, reference exit 0, every attacker exit 1, near-misses exit 0, stage-0/counted pairs 3/1).
`pnpm content:validate`: 0 issues.

## Open
- The exec bit cannot be set by this agent (the shell guard blocks `chmod` on `.claude/hooks/` paths): the
  three starter hooks and two reference hooks are 0644 in the repo; they need `git update-index --chmod=+x`.
  The L1 untouched starter still fails stage 0 for its skip; an E1/shell-without-python3 registration on the
  shipped starter would fail stage 0 ("нет бита исполнения") until this is fixed.
- Linux side-channel guard not run (macOS only); Linux `side` stats vary by a few pages across runs of the
  same variant.

### Student round 2: C4-in-ADR and C5 heading/`Check:` roots (`out_linter_c4c5.txt`)
`verify_linter.py` gained finding roots for a missing `Status:`, an invalid status, a duplicate number, a
title number unequal to the file number, a self-supersede, C5 in a spec heading and C5 in a `Check:` line,
plus six near-miss clean roots. Duplicate number: the reference names both files (each breaks "the number is
not repeated in another file"), so that root expects two C4 lines. Reference exit 0 on 9 seeds; each of 9
rule-removing and 6 overreaching mutants exit 1 on the intended root; the student's later-only linter exit 1.
