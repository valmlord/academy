# #42 judge_content round 2: assessment

Judge: judge-assessment. Date 2026-10-30. Scope: `course/ai-for-developers/02-agentic-patterns/` after the round-1 fixes
(change logs: `plans/42-module-agentic-patterns-demo-A.md` "judge_content round 1 fixes", `-demo-B.md` "Round 3").
Threat model of record: design 2.8 as relayed in the brief (IN and OUT lists).

Scratch (not committed): `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/judge-c2/`
(`<j>` below). Harness `<j>/jlib.py` (same as round 1): mount = fresh copy of the real `checks/` without `reference/`
and `data/reserve/`; fresh copy of `starter/` per case (plus the `checks/reference/` overlay for "reference"); the
lesson.yaml `run` string run verbatim through `/bin/sh -c` with `PATH=<python3 symlink dir>:/usr/bin:/bin`,
`HOME=<copy>/home`, `ACADEMY_CHECKS_DIR=<mount>`, nothing else. Interpreters `/opt/homebrew/bin/python3.12` (3.12.13)
and `python3.11` (3.11.14), `-I`, each through a `python3` symlink first on PATH (`<j>/bin312`, `<j>/bin311`). Every
run below was done on both; verdicts identical on both. `.claude/` paths in scratch workspaces were created by the
Python harnesses (copytree and a name built as `"." + "claude"`), not by shell; nothing under the repo's `.claude/` was
written except the two feedback files named at the end (Edit tool).

## Verdict: FAIL, 2 blocking issues (C1, C2). Round-1 B1, B2 and B3 are closed as stated, but each of B1 and B2 has a
neighbour in scope that still passes.

### C1. L1, L2, L3 suite: a NEW test file can neutralise a pristine starter test (B2 neighbour)
In scope: "editing tests or graded files". task.md L2/L3 item 7 promises "правка, пропуск или удаление стартового теста
ничего не меняет" (L1 item 10 likewise). The overlay puts the pristine files back, but learner-added test files run in
the same process, are imported first by discovery (sorted names), and may rebind attributes of the starter test
classes. The tamper check snapshots only `unittest`'s own modules and classes, so a starter class is unguarded. Plain
import and plain attribute assignment; no name built from strings, no `sys.modules`, no runpy. Run `<j>/att2.py`
(outputs `<j>/out_att2_31{1,2}.txt`), on the reference with the status filter broken in `src/invoices/api.py`
(`status = None` after validation) plus a new `tests/test_00_helpers.py` that does `from tests import test_api` and then:

| Patch in the new test file | L1 `poka-yoke-applied` | L2 `arch-workspace-clean` | L3 `deps-gate` |
|---|---|---|---|
| none (control) | exit 1, item 10 red | exit 1, item 7 red | exit 1, item 7 red |
| `InvoiceListTest.test_filters_by_status = lambda self: None` | **exit 0 "стартовые тесты зелёные"** | **exit 0** | **exit 0** |
| `InvoiceListTest.run = <start/stop only>` | **exit 0** | **exit 0** | **exit 0** |
| `InvoiceListTest.assertEqual = lambda self, *a, **k: None` | **exit 0** | **exit 0** | **exit 0** |
| honest new passing test, correct code | exit 0 | exit 0 | exit 0 |

Fix target (the effect): every pristine starter test body runs as written, and no learner-written file under `tests/`
executes in the process that runs them. One construction, stricter by design: run the pristine pass in a copy whose
`tests/` holds only the pristine files (learner-added test files removed; in L1 also `test_late_fee.py`, which item 7
asks the learner to edit, run in a separate child together with its existing static checks), and run learner-added
tests, if they are kept at all, in a second child whose result cannot affect the pristine one. Neighbours to demo
against the fix: the three patches above; a learner-added `tests/test_x.py` that patches from a `load_tests` hook; a
learner-added non-test helper under `tests/` (never imported by pristine files, so it must be irrelevant). Info, OUT
of scope (RS6 `sys.modules` / code planted in an existing module, `<j>/att_src.py`): `api.py` that, during the call,
fetches `sys.modules["tests.test_api"]` and rebinds `assertEqual` still passes after this fix; extending the stopTest
tamper snapshot to the classes of the pristine test modules would close it too, but I do not block on it. Update
task.md L2/L3 item 7 and L1 item 10 ("добавленные вами тесты запускаются отдельно и не влияют на стартовые").

### C2. L2 item 8: a `check` target with the real suite and a `grep` instead of the linter passes (B1 neighbour)
In scope: "exit-0 or stub scripts" and "special-casing the visible starter files" (task.md item 8 prints the variant
list). Round-1 fix target: "a target which does not run both [the real suite and the real linter] cannot pass". The six
variants plant only A1, and the three A1 forms drawn are all top-level `import`/`from` lines at column 0 in
`src/ledger/`. So a target that runs the real suite and then
`! grep -rqE '^(import|from) +invoices' src/ledger` tells every variant apart without running the linter. Run
`<j>/att2.py`, on the reference with only the `check` recipe replaced:

| `check: test` followed by | Result (3.12 and 3.11) |
|---|---|
| `! grep -rqE '^(import\|from) +invoices' src/ledger` | **exit 0 "Пройдено ... make check ловит нарушение"** |
| `! grep -rqE '^ *(import\|from) +(\.*invoices\|sqlite3)' src/ledger` | **exit 0** |
| `true` (control) | exit 1, item 8 names the two A1 variants |
| reference (`python3 scripts/check_architecture.py .`) | exit 0 |

Partly my own round-1 prescription: I listed "an A1 import in a random a1-forms form" and no A2/A3 variant, so the
designer's three column-0 forms satisfied it. Fix target (the effect): `make check` passes only when the learner's linter
actually ran on the copy. Construction, stricter than a form list: (1) for every must-fail lint variant, require that
make's combined output contains the exact line the grader gets by running the learner's own
`scripts/check_architecture.py` on the same copy for the planted statement (rule, path, line; the task's regex), so a
grep must forge the learner's message to pass; (2) plant A2 and A3 as well as A1 (for example `import sqlite3` inside a
function of an existing non-repository file, `from ..legacy_format import money_str` style in another invoices file);
(3) draw A1 from the same renderer the hidden `arch-linter` roots use (`root_render.py`: in a function, parenthesised
multi-line, after `;`, relative `from .. import invoices`), not from three fixed column-0 lines. Neighbours I tried
against (1)-(3) on paper: `grep -n | sed` that formats `A1 path:line: x. Fix: y` fails (1) unless it copies the learner's
message text exactly, and fails (2)/(3) unless it grows into an AST linter; a target running the linter with `-` prefix
or `|| true` still fails the existing variants. Keep the budget below `timeoutSec: 300` (one more linter run per
variant is about 0.1 s on the reference). Update task.md item 8.

## Round-1 findings: re-run against the real checks

| Round-1 item | Re-run | Result (3.12 and 3.11) |
|---|---|---|
| B1 file-list stub, `m<6hex>` stub (`<j>/r1/att_l1l2.py`, 15 cases) | must fail | both exit 1 at item 8; reference exit 0; 0 unexpected |
| B2 broken filter + edited `test_api.py` assertion, L2 and L3 (`<j>/r1/att_tests.py`, 4 cases) | must fail | both exit 1, item 7 red; 0 unexpected |
| B3 I04 key (`<j>/att_l3.py`, 8 cases) | I04 `check`/`code`/`hook` pass; one wrong passes; two wrong exit 1 | as expected; reference labels all in the key (I01 memory, I02 hook, I03 check, I04 hook, I05 check, I07 task, I08 hook, I10 memory) |
| N1 L1 correct-order twin with a dead keyword call | must fail | exit 1, item 8 "пеня в statement_line берётся не из вызова late_fee" |
| N2 L4 `excludedCommands` | now graded | see L4 below |

L3 `failure-log` rate with the new key, recomputed from `failure_key.json` (accepted layers 1,2,1,3,2,1,1,2 of 36 per
incident): blind 1.727e-9 per counted submission, 1.727e-8 over 10. Matches demo A.

## What else I ran

- Untouched starter fails and reference passes, every command check: L1 `poka-yoke-applied` 1 / 0, `rule-placement` 3
  / 0; L2 `arch-workspace-clean` 1 / 0 (`arch-linter` 1 / 0 in the designer demo re-run); L3 `deps-gate` 1 / 0,
  `failure-log` 3 / 0; L4 `contour-config` 1 / 0.
- Designer harnesses re-run by me (outputs `<j>/rerun/`): `demo_l1.py` 85 cases, `demo_l2.py` 91, `demo_l3.py` 65,
  `pd-b/l4/matrix.py` 175 (114 must-fail + 61 must-pass), 0 unexpected on both interpreters; `pd-a/replay.py` over the
  101 student workspaces: identical on 3.11 and 3.12 and identical to the designer's `out_replay_312.txt`. Honest
  workspaces `student-a/l1`, `student-a/l2`, `student-b/l3/ws` pass every check. Passing cheat workspaces are the
  expected ones (`l1-wrapper-star`, `l1-oldapi-fullrename`, `l2-lin-empty-fix`, `l2-lintout-cwd`, `ws_W20` RS7, and
  `l2-delete-health-test`, `ws_W17`, now no-ops under the overlay with correct code). L5 `bugs.yaml` and student C's
  set are unchanged since round 1 (only `05/theory.md` changed), not re-run.
- Pristine copies: `checks/data/pristine_tests/` equals `starter/tests/` byte for byte in L2 and L3; in L1 it is the
  starter without `test_late_fee.py`, as intended. `grader_runtime.py` byte-identical in L1-L3.
- Timing: L2 item 8 budget 6 x 30 + 20 + 45 = 245 s < 300; measured on the reference 0.7-0.9 s for the whole check, L3
  `deps-gate` 0.3 s, L1 0.2 s.
- L4 G7 (`<j>/att_l4b.py`, 14 cases, 0 unexpected): pass: user `false` with project unset, over project `true`, over
  local `true`; project `false` with user `true`; `excludedCommands: []` in all three files. Fail: project `false` under
  local `true`; unset everywhere; `0`; string `"false"`; `excludedCommands` `["curl"]` (project), `["uv"]` (user),
  `"curl"` (local), `{}` (project). Matches theory.md:107-110. Round-1 `att_l4.py` 7 cases still 0 unexpected
  (`excludedCommands ["curl"]` now fails G7).
- L4 quiz `local-open-weight-model`: new option d ("WebFetch перестанет отправлять имя хоста на `api.anthropic.com`")
  is false per theory.md:185-187 and a plausible misconception; key `[a, c]`; explanation covers d. Quiz audit
  (`<j>/quiz_audit.py`, `<j>/out_quiz.txt`) on L1, L3, L4 and their reserves: 6 questions, 4 single + 2 multiple, one
  correct per single, positions spread, correct option uniquely longest in at most 1 single, random pass 0.0712% per
  attempt, 0.2134% over 3; no problems.
- `pnpm content:validate`: `content: 1 course(s), 6 module(s), 18 lesson(s), 0 issue(s)`.
- Leak scan of every `starter/`, `task.md`, `theory.md` for `checks/`, grader, key and data file names: no hits.

## Non-blocking (carried)
N3-N6 of round 1 stand (L5 reserve weak as a score, rubric blind regrade owed, 3.10/3.13 and image owed, L3 binary
search residual). New info: the src-side `sys.modules` patch in C1 (RS, OUT).

## Attribution
C1, C2: practice-designer A (`grader_runtime.run_suite` / `overlay_pristine_tests`; `verify_workspace.make_problems`),
with lesson-author A's task.md L1 item 10, L2 items 7-8, L3 item 7. C2 partly mine (round-1 variant list named only
A1). Lesson appended to `.claude/feedback/practice-designer_mistakes.md` and `.claude/feedback/judge_mistakes.md`
(Edit tool).

FAIL
