# #41 judge_content round 1: assessment

Judge: judge-assessment, 2026-10-30. Module `course/ai-for-developers/01-spec-driven-development` (7 lessons).
Inputs: design rev. 7 and my design-round reports, demo records A/B/C (rounds 1-3), student reports A/B/C
(rounds 1-3). Stepan's decisions (cap 10 + uncounted stage 0, K = 1, residuals (iii), (iv), 11.2, L2/L4
obfuscation classes graded by mentor rubrics) were taken as given and not re-litigated.

Verdict: **FAIL, 1 blocking issue** (L2 import resolver). Everything else holds.

## Runtime convention (own driver, not the demo's)
`scratchpad/ja/jrun.py`: the grader mount is a copy of `checks/` without `reference/` and `data/reserve/`
(asserted). The workspace is a fresh `starter/`, plus `checks/reference/` for "reference" (L2: without
`rubric-demo/` and with the root `scripts/release.py` removed, as README and demo B say), plus overlays.
The command is `env PATH=<python3.12 shim>:/usr/bin:/bin HOME=<tmp> ACADEMY_CHECKS_DIR=<mount> python3 -I
"$MOUNT/<script>"` in the workspace, on Python 3.12.13 (`/opt/homebrew/bin/python3.12`). The hook exec
bit is set on the copies, as in demo A.

## 1. `pnpm content:validate`
`content: 1 course(s), 6 module(s), 13 lesson(s), 0 issue(s)`.

## 2. Starter must fail, reference must pass (my runs)
| Check | Untouched starter | Reference |
|---|---|---|
| L1 late-fee-verified | exit 3, stage 0 (skip at line 17) | exit 0, 1.3 s |
| L1 stop-hook-tests | exit 3, stage 0 (no Stop group) | exit 0, 2.0 s |
| L2 skills-structure | exit 1 (skills missing, memory 93 lines / 960 words) | exit 0; with the root script kept: exit 1 |
| L3 glossary-structure | exit 1 | exit 0 |
| L4 sdd-artifacts | exit 1 | exit 0 |
| L5 reminders-accepted | exit 3, stage 0 (tasks todo) | exit 0, 1.4 s |
| L7 artifact-linter | exit 1 | exit 0 |
| L7 change-request-applied | exit 3, stage 0 (no new REQ) | exit 0 |
| L7 stop-hook-integrity | exit 1 (counted) | exit 0, 2.6 s |
Every reference run of L1, L5 and L7 was repeated 3 times: 18/18 exit 0, no flake. `reference/` and
`data/reserve/` are not needed on the mount (absent in every run above). Every runtime is far below its
`timeoutSec`.

## 3. Recorded attackers re-run
- **Cross-run lookup (student A cheat 12)**, demo A's `cross_run_cheat.py` against the current graders,
  loot in a fixed path outside the workspace, 10 counted rounds plus the table-only final:
  L1 (A) fails all 10 rounds and the final (95 inputs logged, none reused); L5 fails all 10 and the final
  (411 inputs); L7 fails all 10 and the final (448 inputs). `sdd_accept.py` draws with
  `secrets.SystemRandom` per run; the shared code is byte-identical in L1, L5 and L7 (sha256 checked).
- **Stop-hook attackers through the full `verify_stop_hook.py`** (not the probe harness), 5 runs each:
  `static_off`, `mtime_off`, `static_ast`, `counter_grep`, `gap_mem`: 25/25 exit 1. Positive control:
  `generic_eval` 2/2 exit 0 (residual (iv), accepted), so the harness can pass.
- **L7 `verify_stop_integrity.py`**, 3 runs each: `atk_static_off`, `atk_mtime_off`, `atk_static_ast`,
  `mf_token_dropped`, `mf_l1_hook_only`: 15/15 exit 1. `atk_generic_eval_l7`: exit 0 (residual (iv)).
- **Demo A row files** (`rows_l1_seam`, `rows_l1_banks`, `rows_l5`, `rows_l7_change`, `rows_pairs`, 68
  rows): every verdict as recorded. All (A) forges (exit, forge_argv, forge_fds, patch_asserts, hijack,
  top_exit_ref) exit 1. All (B) banks/probes (nonce_forge, pyc_bank, race, err_bank, raw_pipe, side, timing,
  counter, structure_probe) exit 1. The stage-0/counted pairs give 3/1 for all five capped checks. The
  near-misses (L5 two labels, LedgerAccount, subTest; L7 REQ-12, mid-list insert) exit 0.
- **L2 memory glue** (built by me from `procedures.orig` on top of the reference): giantline, `_` glue and
  CamelCase exit 1 (833-834 words). All-lower-case concatenation and glue with a Lo letter (U+A78F) exit 0.
  Both are "glued words beyond the splitter", an accepted class, and rubric C3 counts them.
- **L4 help flag** on the reference T-03 `Check:`: `-h`, `--help`, `-bh`, `-"h"`, `--hel'p'`, `-fch`,
  `--he`, `-hk x` all exit 1 (`-fch` and `-bh` really exit 0 on 3.12). `make test` exits 0, as designed.

## 4. Blocking

**B1 (L2 `skills-structure`, practice-designer B): the `@` import resolver misses two forms that Claude
Code follows, so procedures can be loaded every session and still pass the memory budget.**
`verify_skills.py:109` `IMPORT_TOKEN = (?:^|\s)@([^\s]+)`, and `imports_of` keeps the token as written
(apart from trailing punctuation). The installed Claude Code binary (2.1.267,
`/opt/homebrew/Caskroom/claude-code/2.1.267/claude`, `strings`) extracts imports with
`/(?:^|\s)@((?:[^\s\\]|\\ )+)/g`. It cuts the token at the first `#`
(`let P=E.indexOf("#");if(P!==-1)E=E.substring(0,P)`), turns `\ ` into a space (`E.replaceAll("\\ "," ")`),
then resolves the path against the importing file's directory. Runs on the L2 reference:
- `CLAUDE.md` + `Team conventions: @docs/procedures.md#steps`, with `docs/procedures.md` = the whole
  `procedures.orig`: **exit 0**.
- `CLAUDE.md` + `See @docs/proc\ edures.md`, with `docs/proc edures.md` = `procedures.orig`: **exit 0**.
- Control, plain `@docs/procedures.md`: exit 1 (69 lines, 839 words).

task.md:132 promises that every file an `@path` import reaches is counted, and the check tries to enforce
this class itself (it rejects `@~/`, absolute and `../` imports). These forms are therefore not among the
accepted rubric-graded L2 classes. Rubric C3 would probably still catch the cheat, but the command check
that claims to enforce imports passes it.

Fix: tokenize exactly as Claude Code does. Use the regex `(?:^|\s)@((?:[^\s\\]|\\ )+)`, cut at `#`, replace
`\ ` with a space, then resolve the path (outside-workspace rules unchanged). Add both cheats as must-fail
cases and a near-miss (`@docs/style.md#intro` of a short honest file: pass). Re-run the 236 L2 cases. The
version caveat: verified in 2.1.267, the lesson pins 2.1.312; re-check the string in the pinned binary
if it is available.

## 5. Non-blocking (fix or record; none changes the verdict)
1. **Exec bit (demo A "Open", still open).** All 8 `stop_tests.py` files are 0644 on disk. L1 task.md:87
   says "заготовка уже такая". The shipped settings use E2 (`python3` + args), so no starter or reference
   depends on the bit. A learner who picks E1 or a shell form without `python3` gets an uncounted stage 0
   ("нет бита исполнения"). It must be fixed at commit time (`git update-index --chmod=+x` on the 8
   files, check `git ls-files -s` shows 100755) or task.md reworded. The agents' shell guard blocks it, so
   this is the orchestrator's or Stepan's step.
2. **L2 rubric artifact globs vs rubric text.** `rubric-skills.md` says the mentor reads "everything under
   `.claude/`". `lesson.yaml` gives `.claude/skills/**`, `.claude/**/*.md`, `.claude/settings*.json` and
   `.claude/hooks/**`, plus `scripts/**`, `docs/**`, `**/*.py`, root `*`. A SessionStart hook that runs
   `cat notes/procedures.txt` (or a `.txt` under `.claude/`) shows the mentor the hook but not the file.
   C3's hook rule probably still gives 0, but widen the glob to `.claude/**` and `**/*.txt` (or `**/*`)
   so the mentor can see the evidence.
3. **L1 quiz `enforce-not-ask`.** Option d ("Повторный прогон тестов в CI из чистого checkout") is keyed
   correct, but re-running a suite whose expected value the agent edited stays green. It is enforcement in
   general (theory.md:123 lists it), but not against this scenario, so a careful learner who leaves it out
   loses the question at a 5/6 bar. Reword the prompt to the general category, or replace d.
4. **Quizzes, otherwise.** All 5 quizzes and 5 reserves (own audit): 6 questions (4 single + 2
   multiple), every key inside its options, single keys have 1 answer and multiple keys 2-3 of 4, every
   question has an explanation, single-key positions a/b/c/d once each in every graded quiz. By
   characters the correct option is uniquely longest in 2 L1 questions, 1 in L3, 1 in L4 and 1 in L7. The
   always-longest strategy stays at or below 2/6. The L1 reserve uses position b twice. Not blocking.
   passScore 0.8 = 5/6 everywhere.
5. **L4 `make test`.** The learner can redefine the Makefile `test:` target. It gains nothing over writing
   `make test` honestly, and L4 never runs `Check:`. Note only.
6. **Image interpreter.** No `images/` definition exists yet. Demos ran on macOS 3.12.13 (and 3.11 spot
   runs, where L1's "exit code only" hook passes on 3.12 and fails on 3.11, as the design states). Re-run on
   the image before the platform serves the module. This is the platform residual, as in module 00.

## 6. Other checklist items
- **Outcomes to checks.** O1 L1 (2 command checks + quiz); O2 L2 (command + rubric + quiz); O3 L3
  (command + rubric + quiz; entity/value object and aggregate are covered by the quiz items
  `money-equality` and `aggregate-transaction`); O4 L4 (command + rubric + quiz); O5 L5 (command) + L6
  (bug-hunt); O6 L7 (3 commands + quiz). Each check matches its outcome.
- **Leaks.** No `starter/` holds a `checks/` dir. There are no symlinks in the module. No bug or decoy id,
  mutant id, checks path, `ACADEMY_CHECKS_DIR`, `procedures.orig`, `release.py.orig`, `rubric-demo` or
  script name appears in any task.md, theory.md or starter file. No L6 key line number appears in L6
  task.md or theory.md. The spoilers in later starters (the L1 reference hook in L5/L7, the L5 reference
  in L7) are the recorded "open after prerequisite" residual.
- **Bug-hunt arithmetic (own matcher on the shipped YAML).** 6 bugs, 7 ranges, 21 decoys, ranges
  pairwise non-overlapping. Blocks per category 4/4/8/4/4/4. The reference passes (6 matched, 0 decoy
  hits) and the empty submission fails. One-per-category sets: 8192, of which 38 pass = 19/4096 =
  0.4639% per attempt and 1.385% over 3, matching design and demo C. The above-1% figure is design 11
  item 3, recorded for Stepan. `maxReports`/`maxDecoyHits` are enforced by no code in the repo yet;
  they are the same platform item as module 00's bug-hunt.
- **Rubrics.** The no-zero gate is stated in L2, L3 and L4. The L4 C2 and C4 levels are now mutually
  exclusive (round-2 blocking 7 closed). Demo sets: L2 10 (incl. subagent and output-style), L3 4, L4 6
  (incl. obfuscated-vocab). Each set has a README with expected grades; the L2 blind grades match 10/10
  (author) and 6/6 (student).
- **Hidden-task determinism.** Verdicts are stable over repeats (section 2). The randomness (fresh draws,
  shuffles, linter seeds) is by design, and every run is independent of earlier ones.

## Attribution
B1: practice-designer (B, owner of L2 `verify_skills.py`). Lesson appended to
`.claude/feedback/practice-designer_mistakes.md`.

FAIL
