# #42 judge_content round 1: assessment

Judge: judge-assessment. Date 2026-10-30. Scope: `course/ai-for-developers/02-agentic-patterns/` (5 lessons), the real
check entries, `checks/` (graders, data, reference, reserve, `bugs.yaml`, rubrics), `quiz.yaml`, `starter/`.
Upstream read: design rev 5 (sections 2, 5, 6), plan, demo records A and B, student reports A, B, C, D.
Threat model of record: design 2.8 as relayed in the brief (IN and OUT lists).

Scratch (not committed): `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/judge-c1/`
(`<j>` below). Harness `<j>/jlib.py`: mount = copy of `checks/` without `reference/` and `data/reserve/`; fresh copy
of `starter/` per case (plus the `checks/reference/` overlay for "reference"); the lesson.yaml `run` string run
verbatim through `/bin/sh -c` with `PATH=<python3 symlink dir>:/usr/bin:/bin`, `HOME=<copy>/home`,
`ACADEMY_CHECKS_DIR=<mount>`, nothing else. Interpreters `/opt/homebrew/bin/python3.12` (3.12.13) and `python3.11`
(3.11.14), `-I`, each through a `python3` symlink first on PATH (`<j>/bin312`, `<j>/bin311`). Temp workspaces under
`<j>/tmp`. Note on `.claude/` paths: the starters' `.claude/` directories were copied into scratch workspaces by the
Python harness (copytree, and in `att_l4.py` a name built as `"." + "claude"`), not by shell commands; only scratch
temp copies were written, nothing under the repo's `.claude/` except the feedback file below (Edit tool).

## Verdict: FAIL, 3 blocking issues (B1, B2 mine; B3 concurs with a parallel finding)

### B1. L2 `arch-workspace-clean` item 8: a stub `make check` that runs neither the tests nor the linter passes
In scope: "exit-0 or stub scripts" and "special-casing the visible starter files"; it defeats O2's verb
"подключает её к единой команде проверки проекта". Item 8 probes `make -s check` only on: the copy as is (must be 0),
the copy plus a NEW file `src/ledger/m<6hex>.py` with `import invoices.money`, the copy plus a NEW
`tests/test_m<6hex>.py` with `assertEqual(1, 2)` (each must be non-zero). task.md prints exactly these three. Any
target that reacts to "a new file appeared" passes. Run (`<j>/att_l1l2.py`, both interpreters, outputs
`<j>/out_att_l1l2_31{1,2}.txt`), on the reference with only the Makefile `check` target replaced:

| Case | Result |
|---|---|
| `check:` compares `find src tests -name '*.py' \| sort` with a committed `.known_files` list (runs nothing) | **exit 0 "Пройдено"** on 3.12 and 3.11 |
| `check:` fails only when a name `m[0-9a-f]{6}.py` / `test_m...py` exists under `src/ledger` or `tests` | **exit 0 "Пройдено"** on 3.12 and 3.11 |
| control: reference (suite, then linter) | exit 0 |

Root: design L2 check 2 (d) defines the three variants and lists only `check: test`, `|| true`, `-` prefix,
`check: true` as must-fail, so the practice-designer implemented and demoed the listed forms faithfully; no
neighbour of `check: true` was tried. Fix target (the effect, not a form): `make check`'s exit status must follow the
outcome of the real suite and the real linter on the copy, so that a target which does not run both cannot pass.
A variant set that closes every stub class I could build, to be demoed on these neighbours:
1. must exit 0: the copy plus a clean new ledger module whose docstring or comment says `import invoices` (text never
   counts) and a new passing test, random names (kills list/content fingerprints and text greps);
2. must be non-zero: an A1 import in a random a1-forms form appended to an EXISTING `src/ledger/` file (kills
   name-pattern detectors);
3. must be non-zero: a regression in an existing `src/` function that turns an existing starter test red (kills
   test-file greps; only running the suite sees it);
4. keep the two current non-zero variants.
Budget: five `make` runs at 60 s plus 65 s exceeds `timeoutSec: 300`; lower the per-run limit (the reference
`make -s check` takes well under 2 s) or raise `timeoutSec`, and keep the sum below it (2.3). Update task.md
item 8 and "Как проверяется" to the new variants (2.6). Must-fail demo cases: both stubs above.

### B2. L2 item 7 and L3 item 7: editing a starter test hides a regression; the check reports the tests green
In scope: "editing tests or graded files". The suite runner checks names, skips, expected failures and runner
tampering, but runs the WORKSPACE's test files, so a starter test whose assertion is edited still "passes". The
hidden probes do not cover everything the starter tests cover (`/invoices` listing and the status filter are covered
only by `tests/test_api.py`). Run (`<j>/att_tests.py`, outputs `<j>/out_att_tests_31{1,2}.txt`), on the reference:

| Lesson / check | status filter broken in `api._list`, tests untouched | same + `test_filters_by_status` assertion edited to the broken output |
|---|---|---|
| L2 `arch-workspace-clean` | exit 1, item 7 red (control) | **exit 0 "... тесты зелёные ..."** |
| L3 `deps-gate` | exit 1, item 7 red (control) | **exit 0 "... стартовые тесты зелёные."** |

Same class, also passing in my L1 run: a starter test class rebased on a `TestCase` subclass whose `run()` reports
success hides a red test (`out_att_l1l2_*`, "rebased"); in L1 the hidden grids cover what the learner must change, so
this matters there only for `test_api.py`. In L2 and L3 the learner never needs to edit `tests/` (the references do
not). Fix: in L2 and L3 run the pristine starter tests from `checks/data/` (a copy of the starter `tests/` placed into
the grader's copy, learner-added test files kept or dropped, say which), or compare every starter test file with a
sha256 from `checks/data/` and name the changed file; in L1 do the same for the test files task.md does not ask to
edit (`tests/test_api.py`, `tests/__init__.py`, `tests/fixtures/`). task.md item 7 (L2, L3) and item 10 (L1) must say
that the check runs its own copy of the starter tests or rejects edited ones (2.6, "in those words"). Must-fail demo
case: the one above, in each lesson.

### B3. L3 `failure-log` key for I04 contradicts the printed definitions and the reference fix (concurs)
A parallel content judge already appended this lesson to `.claude/feedback/practice-designer_mistakes.md`
("A key layer that the lesson's own definitions reject"); I checked it independently from the files and agree. I04's
context: A2 already runs in `make check`, the Stop hook runs only tests, the agent ran only `make test`, CI caught it
30 minutes after "Готово". task.md line 59-60: choose the fix that prevents the repeat, "а не то, что в том
репозитории уже есть"; line 69: "Stop-хук, который запускает `make check`, тоже `hook`". The reference
`failure-log.json` fix for I04 is "make `make check` ... the command the agent runs and the Stop hook runs" and is
labelled `check`; the key (`data/failure_key.json`) accepts `check`, `code` and rejects `hook`. A learner who follows
the printed text and writes the reference's own fix as `hook` spends the single error the 7-of-8 bar allows, under
binary feedback. Assessment effect: an honest variant fails one item it should pass. Fix: accept `hook` for I04 (and
re-label the reference fix `hook`, or split it), then recompute the blind and search rates (accepted counts become
1,2,1,3,2,1,1,2) and re-walk every key entry from the printed text alone.

## What I ran and what holds

### Contract
`pnpm content:validate`: `content: 1 course(s), 6 module(s), 18 lesson(s), 0 issue(s)` (rerun by me in this
worktree). Lessons `status: draft`, module `planned` (allowed until the end of the pipeline). Every check entry: kind,
run line `python3 -I "$ACADEMY_CHECKS_DIR/<script>.py"`, `timeoutSec`, `passScore`/`minFound` as the design; rubric
paths and artifacts exist. No hidden-task or agent-eval check (design 10), so no `budgetUsd`.

### Demo records reproduced (practice-designer harnesses re-run by me, outputs `<j>/rerun/`)
| Run | 3.12.13 | 3.11.14 |
|---|---|---|
| L1 `demo_l1.py` (both command checks) | 83 cases, 0 unexpected | 83, 0 |
| L2 `demo_l2.py` (wrong linters on 20 seeds each) | 84, 0 | 84, 0 |
| L3 `demo_l3.py` (wrong gates on 20 seeds each) | 61, 0 | 61, 0 |
| suite corpus `suite/corpus.py` | 27 attacks + 41 honest, 0 unexpected | same |
| `replay.py`, 101 student workspaces with the current checks | identical verdicts on both | |
| L4 `matrix.py` | 167 cases (109 must-fail, 58 must-pass), 0 unexpected | same |

Untouched starter fails and reference passes, every command check (from these runs and my own): L1 `rule-placement`
exit 3 (stage 0, item 1) / 0; `poka-yoke-applied` 1 (signature, 11 positional calls, `old_api.py`) / 0; L2
`arch-linter` 1 / 0 on 20/20 seeds; `arch-workspace-clean` 1 (A1-A3, w2, behaviour, no `check`) / 0; L3
`failure-log` 3 / 0; `deps-gate` 1 / 0 on 20/20 seeds; L4 `contour-config` 1 with exactly G1-G7 / 0.

Student cheats with the current checks (replay): every blocking cheat of students A and B now fails (symlinked
`.claude/rules`, positional twin `compute_fee`, `/health` without a DB call, verbatim `scripts/old_api.py`, renamed
locals, item-6 near misses `dict(sorted(...))` and `ensure_ascii=False` 0/20, exception-message change). The five
replayed workspaces that still pass are expected: `l1-wrapper-star` (honest private helper), `l1-oldapi-fullrename`
(not the same code), `l2-lin-empty-fix` (`Fix: x`, prose goes to the rubric), `l2-lintout-cwd` (honest),
`ws_W20` (RS7, OUT). Student C's lexical attack: see L5.

### My own cases (not in the demo record)
| Case | Expected | Observed (3.12 and 3.11) |
|---|---|---|
| L1 twin in `money.py`, `statement_line` keeps a dead keyword call to `late_fee` and charges via the twin, swapped | fail | fail, item 8 grid 31/48 |
| same, twin called in the right order | (info) | passes, see N1 |
| L1 decorator re-exposing a positional `late_fee` | fail | fail (TypeError probe, grid) |
| L1 moved text in `home/.claude/CLAUDE.md`, in `tests/CLAUDE.md` | fail (s2) | exit 3, item 2 names the file |
| L2 two stub `check` targets | fail | **pass** (B1) |
| L2/L3 broken filter + edited starter test | fail | **pass** (B2) |
| L4 `ANTHROPIC_BASE_URL=""` in user env over a correct launcher | fail G1 | fail G1 |
| L4 leaked token in a `home/` backup file | fail G2 | fail G2 |
| L4 empty `ANTHROPIC_API_KEY` in local env | fail G2 | fail G2 |
| L4 web denies only in local settings | pass | pass |
| L4 `sandbox.excludedCommands: ["curl"]` | (info) | passes, see N2 |

### Search odds (recomputed by me)
- L1 `rule-placement`: blind 2.007e-7 per submission (12 cards, 5 layers, >= 11); partial-knowledge table of the
  design (84.0 / 31.2 / 8.2% for sure of 10 / 9 / 8) not re-derived, student A's independent minimax agrees for 10
  and 9. Stage 0 depends on the placement only through the learner's own memory set: no key channel.
- L3 `failure-log`: blind 1.185e-9 per submission, 1.19e-8 over 10 counted, with the current key; binary message
  confirmed in the code. B3's fix raises it slightly (one more accepted layer).
- Quizzes (`<j>/quiz_audit.py`, `<j>/out_quiz.txt`), L1, L3, L4 and their three reserves: 6 questions each (4 single,
  2 multiple), 4 options, single correct exactly one, multiple 2 or 3, explanations present, single positions a-d once
  each, the correct option uniquely longest in at most 1 single, no all/none option. Random pass 0.1211% per attempt,
  0.3628% over 3 (guesser who knows multiples have 2-3 correct; 0.0712% / 0.2134% for a uniform guesser). I read every
  question of the three live quizzes: each single has one defensible answer by the theory's mechanism, distractors are
  the misconceptions the theory names (`0` turns the flag off, deny `*`, project `strictAllowlist`, "longer prompts"),
  explanations say why the distractors fail.
- L5 `anti-pattern-hunt` (`<j>/l5.py`, my own matcher, `<j>/out_l5.txt`): ranges in their files, pairwise
  non-overlapping, transcript numbering equals physical lines; reference 9/9, 0 decoys; student C's honest file 9/9;
  `[]` and starter fail; every hook and script as over-harness fails (3 found, 3 decoys); CLAUDE.md 49-55 all
  prose-rule fails (2, 4); prose-rule/memory-bloat swapped fails (5); reference with transcript lines off by one
  passes (7, expected: two misses within the slack). Exact block enumeration (blocks 6/6/9/6): best (1,2,2,2) 0.3086%
  per attempt, 0.9231% over 3, as the design. Demo B's lexical enumeration (0 of 10,593) not re-run.

### Leak check
No `checks/` substring in any `starter/`, `task.md`, `theory.md`; no grader, key or data file name (`verify_*`,
`*_key.json`, `bugs.yaml`, `rule_texts`, `pristine_*`, `contour_spec`, `arch_rules`, `deps_rules`, `grader_runtime`,
`root_render`, rubric files) in them; no card ids R01-R12 in L1 theory, no incident ids in L3 theory; L4 task prints
the requirement ids and wording only (by design). The mounts used for every run had no `reference/` or
`data/reserve/`.

### Outcome map (design 6) against the checks
O1 placement (rule-placement key), memory clean-up (stage 0 s1-s5), code change (poka-yoke grids and static rules):
each has its check and the check matches the verb. O2 AST check with rule/file/line/fix (arch-linter on hidden roots,
rubric for prose), "приводит к зелёной проверке изменением кода" (a, w1, w2, b, c), "подключает к единой команде" (d):
**(d) does not observe it, B1**; (c) is weakened by B2. O3 class and layer (failure-log; B3), fix (rubric), gate
(deps-gate; B2 for item 7). O4 find and fix (contour-config by effect), process choices (quiz). O5 (bug-hunt). Rubrics
exist with blind sets; student D regraded 6/6 and 4/4 blind.

## Non-blocking
- N1. L1: a positional twin defined outside `late_fee.py`, called in the right order by `statement_line` next to a
  dead keyword call to `late_fee`, passes. The swap stays writable through the twin. It needs a deliberate dead call
  against the static rule, so I do not block on it. Cheap closure if wanted: in the probe, after the grid, replace
  `invoices.statement.late_fee` with a marker function and require every overdue line to show the marker fee.
- N2. L4: `sandbox.excludedCommands` (commands that run outside the sandbox) is neither planted nor graded; G7's
  wording ("команды в песочнице") is literally kept. Optional guard; mention it to the mentor.
- N3. L5 reserve excerpt (mentor review only): 4 planted, one per category, 4 decoys, minFound 3, 5 reports; a guesser
  who knows the four families passes with one report per category 5/16 = 31%. Fine for a mentor conversation, weak as
  a score; the mentor should require the "why".
- N4. Rubric texts were reworded after student D's blind regrade and re-read by the designer, not blind. A blind
  regrade of the final wording on the existing sets is owed before `ready`.
- N5. Owed and already recorded: 3.10 and 3.13 not run, image interpreter, `make` in the image, the
  `sqlite3.Connection` audit event on the image, the Linux `prctl` path (design 12.6 (d)-(f)).
- N6. Student B's earlier `failure-log` count hill-climb is closed by the binary message (accepted deviation); with
  causes known the binary greedy search still passes 67.6% when sure of 5 of 8 layers (demo A); recorded, not blocking.

## Accepted deviations (not judged): L3 binary feedback; L3 key follows the printed "code" definition; L4 G7 includes
`allowUnsandboxedCommands`; L5 decoys replaced and ranges widened.

## Attribution
B1, B2, B3: practice-designer A (L2 `verify_workspace.py` (d); L2/L3 suite input; L3 key and reference). B1's
variant list originates in design L2 check 2 (d) and passed five design rounds, so the fix also needs the
curriculum-architect's (d) text and lesson-author A's task.md item 8 and item 7 updates. Lesson appended to
`.claude/feedback/practice-designer_mistakes.md` for B1/B2 (B3's lesson is already there).

FAIL
