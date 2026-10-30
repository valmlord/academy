# #42 judge_content round 4: assessment

Judge: judge-assessment. Date 2026-10-30. Scope: `course/ai-for-developers/02-agentic-patterns/` after the round-3 D1
fix (`plans/42-module-agentic-patterns-demo-A.md`, "judge_content round 3 (assessment D1)"):
`verify_workspace.planted_violations` now plants every single-finding chunk of each rule (A1 10, A2 5, A3 5), in random
order, each in its own drawn never-executed wrapper, and needs the learner's linter line for every one. Also new:
`timeoutSec` L1 `poka-yoke-applied` 150, L2 `arch-workspace-clean` 360. Blocking rule of record (Stepan, 2026-10-30):
block only on (a) regressions from the fixes since round 3, (b) an honest correct solution that a check fails, flaky
failures included, (c) a bypass from the approved in-scope list. Threat model: design 2.8 as given in the brief.

Scratch (not committed): `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/judge-c4/`
(`<j>` below). The harness is `<j>/jlib.py`, the same as in rounds 1-3. The mount is a fresh copy of the real `checks/`
without `reference/` and `data/reserve/`. Each case gets a fresh copy of `starter/`, plus the `checks/reference/`
overlay where the case says reference. The lesson.yaml `run` string runs verbatim through `/bin/sh -c`. The env holds
only `PATH=<python3 symlink dir>:/usr/bin:/bin`, `HOME` and `ACADEMY_CHECKS_DIR`. Interpreters:
`/opt/homebrew/bin/python3.12` (3.12.13) and `python3.11` (3.11.14), run with `-I`, each through a `python3` symlink
first on PATH (`<j>/bin312`, `<j>/bin311`). Verdicts were the same on both interpreters.

Concurrency: I hashed the module at the start (`<j>/hash_before.txt`) and again at the end (`<j>/hash_after.txt`). Only
`01-code-over-rules/task.md` and `02-architecture-checks/task.md` changed during the review (19:37, text only). No
`checks/` file and no `lesson.yaml` changed, so every run below ran against the final checks. I re-read the new L2
item 8 text: it matches `planted_violations` (ten A1 forms, five each for A2 and A3, "из тех, что встречаются в скрытых
проектах", order and padding redrawn, wrapper list, fallback target).

## Verdict: PASS. D1 is closed and I found no blocking issue

### D1 re-run (`<j>/d1.py`, `<j>/out_d1_31{1,2}.txt`, real check, 130 cases per interpreter)

| Make target instead of the linter | Runs | Passed (3.12 / 3.11) |
|---|---|---|
| Round-3 `lint.sh` (grep, fixed module names, exact messages) | 40 | 0 / 0 (was 4/40 in round 3) |
| Designer's sed variant (module name pulled out with sed) | 40 | 0 / 0 |
| `<j>/scan.awk` without backslash joining | 10 | 0 / 0 (misses `import os, \` / `sqlite3`) |
| `scan.awk` without parenthesis joining | 10 | 0 / 0 (misses `from invoices import (` ... `legacy_format,`) |
| `scan.awk` without relative-import resolution | 10 | 0 / 0 (misses `from . import legacy_format`, `from .legacy_format import ...`) |
| `scan.awk` full | 20 | 20 / 20, see the classification below |

The failure messages name the rule, the count of missing lines and the first one, for example "нет строки вашего
линтера A2 для 1 из 5 дописанных нарушений (первое: src/invoices/service.py:51)".

**Smarter forger in the stub class, and why it is not a bypass.** `scan.awk` is my strongest regex/awk tool that never
runs `scripts/check_architecture.py`. Getting it to pass took a 50-line awk program. It joins backslash and
parenthesis continuations, splits on `;`, parses `import a, b as c` and `from X import a, b`, resolves relative imports
from the file's package, applies A1-A3 with the reference's "first module below the forbidden one" rule, and prints the
learner's message. Each feature is needed: dropping any one of them fails 10/10. Against the reference linter on every
hidden root template, 5 renders each (`<j>/awk_roots.py`), the output matched in 25 of 35 renders. The 10 differences
are the known regex-linter defects: a false positive inside the `NOTES = """..."""` string, and no parse-error exit on
the syntax-error root. So the tool is a second, working import linter. It catches real violations of every import
syntax, outside the planted set too, and is not a stub. It is not an AST linter, but item 8 protects "make check
catches violations", and this target does. The learner still has to pass `arch-linter` with the AST linter. Round 3's
fix target said the same: "At that point it is a second linter". The cheaper forgers (round-3 grep, sed, any of the
ablations) fail every run. Non-blocking, N9.

### Honest solutions (b): no failure, no flake

- Correct workspace (`<j>/b1.py`: money.py deleted, statement on `shared.money`, `tests/test_report.py`, `check: test`
  then the linter): **30/30 pass** on 3.12 and 30/30 on 3.11 (`<j>/out_b1_31{1,2}.txt`).
- `<j>/full.py` end to end (`<j>/out_full_31{1,2}.txt`, 135 cases each, 0 unexpected):
  - Untouched starter fails every command check: L1 `rule-placement` 3, `poka-yoke-applied` 1; L2 `arch-linter` 1,
    `arch-workspace-clean` 1; L3 `failure-log` 3, `deps-gate` 1; L4 `contour-config` 1.
  - Reference: **`arch-workspace-clean` 20/20** per interpreter (plants redrawn each run), every other check 3/3.
  - Honest student workspaces `student-a/l1`, `student-a/l2` (20x `arch-workspace-clean`) and `student-b/l3/ws`: all
    pass.
  - Honest L2 layouts, 10 runs each, all pass: money.py removed with and without a ledger test, own ledger test
    only, `legacy_format` inlined, and `check: lint test` for two of them.
- Every wrapper forced for all plants at once through the grader's own `make_problems` (designer's
  `pd-a/demo_l2_d1.py` re-run by me, `<j>/out_pd_d1_31{1,2}.txt`): reference, correct workspace, student A `l2`,
  lint-before-test target, 3 wrappers each, 12/12 pass on both. Its forgers: 0/40 and 0/40.
- Fallback plant target (`<j>/fallback.py`): with `src/ledger/accounts.py` merged into `posting.py`, `make_problems`
  in-process 10/10 pass on both. The same layout end to end fails items 5-6, because the behaviour probe imports
  `ledger.accounts.Entry` (public API, unchanged since round 2). That is not an honest layout for this task.
- Linter determinism (`<j>/nondet.py`): a linter that names the last hit instead of the first passes
  `arch-workspace-clean` 10/10. Its message is deterministic, and its `arch-linter` failure is only my stale
  `lint-output.txt`. A linter that takes the module name from set iteration (the hash seed differs per process) fails
  item 8 10/10. The outcome says "детерминированную", so it is not a correct solution, and its `arch-linter` item 2
  fails as well. Non-blocking, N10.

### Regressions (a): none found

- Student replay (`pd-a/replay.py`, 101 workspaces, `<j>/out_replay_31{1,2}.txt`): identical on 3.11 and 3.12 and
  identical to the designer's run. Against round 3 exactly three lines changed: `l2-lin-end-lineno`,
  `l2-lin-no-relative` and `l2-lin-regex` now fail `arch-workspace-clean` on every run instead of by draw. They also
  fail `arch-linter`. Honest `l1`, `l2` and `ws` pass every check. The workspaces that pass every command check are
  the same seven as in round 3. Their dispositions were settled in earlier rounds (rubric or residuals), and none of
  them is a D1 forger.
- Slow paths under the new timeouts (`<j>/slow.py`, `<j>/out_slow_*.txt`):

  | Case | Wall | timeoutSec |
  |---|---|---|
  | L1 `invoices/__init__` sleeps 400 s | 110.2 s | 150 (N7 closed, 40 s margin) |
  | L2 same hang | 255.4 s | 360 |
  | L2 worst case built for the budget: hang + `check:` sleeps 12.5 s, then a linter that sleeps 11.5 s, so all 7 makes finish under 25 s and the grader's 3 linter runs take about 12 s each | 283.7 s | 360 (design sum 291) |
  | L2 linter sleeps 11.5 s, make fails (3.11) | 93.4 s | 360 |
  | L3 hang | 70.3 s | 150 |

  Each slow case fails with its own message, not a platform timeout.
- Normal runs got no slower: `arch-workspace-clean` on the reference takes about 1.0-1.1 s.

### Other checklist items

- `pnpm content:validate`, at the end of the review: `content: 1 course(s), 6 module(s), 18 lesson(s), 0 issue(s)`.
- Leak scan of every `starter/`, `task.md` and `theory.md` for `_planted`, `never_executed`, `arch_roots`,
  `PLANT_TARGETS`, `a1-forms`, `pristine_tests`: no hits. Item 8 names the categories of forms, not the hidden files.
- Quizzes, L3-L5 checks: unchanged since round 3, not re-audited.

## Non-blocking

- N3-N6 (round 1) and N8 (round 3) stand. N7 is closed by `timeoutSec: 150`.
- N9 (info): a full regex/awk import scanner in `make check` instead of the learner's linter passes item 8. It is a
  second working linter (see above), not a stub. Residual: the mentor sees a Makefile that does not call
  `scripts/check_architecture.py`. Optional hardening, if wanted later: require make's output to equal the learner's
  linter output line for line, so that over-reporting fails too.
- N10 (message): when the learner's linter prints different text on two runs, item 8 says "цель check должна
  запускать линтер", which is wrong when the target does run it. Consider adding "или ваш линтер печатает разный
  текст при двух запусках".

## What I ran (all in `<j>`)

`d1.py` (130 cases x 2), `awk_roots.py` (35 renders), `b1.py` (30 x 2), `full.py` (135 x 2), `pd-a/demo_l2_d1.py`
(14 x 2), `fallback.py` (20 x 2), `nondet.py` (22), `pd-a/replay.py` (101 x 2), `slow.py` (5 cases),
`pnpm content:validate`, leak grep, start and end hashes. No feedback file was appended (no FAIL).

PASS
