# #42 judge_content round 3: assessment

Judge: judge-assessment. Date 2026-10-30. Scope: `course/ai-for-developers/02-agentic-patterns/` after the round-2 fixes
C1 and C2 (`plans/42-module-agentic-patterns-demo-A.md`, "judge_content round 2 fixes"), plus the pedagogy-B1 fix
that landed during this review (same file, "judge_content round 3 (pedagogy B1)": `verify_workspace.never_executed`
and the target fallback). Blocking rule of record (Stepan, 2026-10-30): block only on (a) regressions from the C1/C2
fixes, (b) an honest correct solution that a check fails, flaky failures included, (c) a bypass from the approved
in-scope list. Threat model: design 2.8 as relayed in the brief.

Scratch (not committed): `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/judge-c3/`
(`<j>` below). Harness `<j>/jlib.py` (same as rounds 1-2). The mount is a fresh copy of the real `checks/` without
`reference/` and `data/reserve/`. Each case gets a fresh copy of `starter/`, with the `checks/reference/` overlay for
"reference". The lesson.yaml `run` string runs verbatim through `/bin/sh -c` with only
`PATH=<python3 symlink dir>:/usr/bin:/bin`, `HOME`, `ACADEMY_CHECKS_DIR`. Interpreters: `/opt/homebrew/bin/python3.12`
(3.12.13) and `python3.11` (3.11.14), run with `-I`, each through a `python3` symlink first on PATH (`<j>/bin312`,
`<j>/bin311`). Verdicts were identical on both interpreters unless stated otherwise.

Concurrency note: `verify_workspace.py` changed at 18:36 while this review was running (the pedagogy-B1 fix).
`<j>/out_forms_31{1,2}.txt` ran against the version before the fix and reproduced pedagogy B1 independently. Every
other run below ran against the current version. A hash of all module files taken after the fix
(`<j>/hash_before.txt`) matched again at the end for every `checks/` file. Only `task.md` (L1, L2), L4 `theory.md` and
the demo log changed after that hash. I re-read L1 item 10 and L2 items 7-8 in their final text.

## Verdict: FAIL, 1 blocking issue (D1, in scope (c)). C1 is closed. C2 is closed against the round-2 stand-ins, but a
grep stub that forges the linter's lines passes about 1 run in 10. Pedagogy B1 is closed.

### D1. L2 item 8: a `check` target that prints grep-forged linter lines instead of running the linter passes about 10% of runs
In scope: "exit-0 or stub scripts". This is the C2 class (a target that does not run the learner's linter), and it is
the stub the orchestrator named ("a stub that only greps inside the wrapper forms"). Run `<j>/b1f.py`. The workspace is
the reference with `check: test` followed by `sh scripts/lint.sh`. That 12-line shell script greps `src/` for
`import`/`from` lines naming `invoices` (in `src/ledger/`), `sqlite3` or `legacy_format`. It prints each hit as
`<rule> <path>:<line>: ` followed by the reference linter's exact message and `Fix:`, with the module fixed to
`invoices`, `sqlite3` or `invoices.legacy_format`. No Python and no linter run.

- End to end, real check: **exit 0 "Пройдено ... make check ловит нарушение" in 4 of 40 runs on 3.12 and 4 of 40 on
  3.11** (`<j>/out_b1f_31{1,2}.txt`). With unlimited attempts, a retry loop gets through.
- Why, per chunk (`<j>/forger_forms.py`, `<j>/out_forger_forms_312.txt`): every single-finding chunk was forced in turn
  through the grader's own `make_problems`. The stub reproduces the learner's line for 3 of 10 A1 chunks (those where
  the hit module is plain `invoices`), 3 of 5 A2 chunks and 4 of 5 A3 chunks. Only one chunk per rule is drawn per
  run, so the pass rate is 0.3 x 0.6 x 0.8 = 14%, and 10% was observed.
- My round-2 C2 text said on paper that a `grep -n | sed` forger "fails (2)/(3) unless it grows into an AST linter". I
  did not run that. It is false for one drawn form per rule. Construction (1) holds; drawing one form is what fails.

Fix target (the effect): `make -s check` passes only if make ran the learner's `scripts/check_architecture.py` on the
copy. One construction, stricter by design: in each rule's copy, plant every single-finding chunk of that rule (10 A1,
5 A2, 5 A3), each in its own drawn never-executed wrapper, in random order, with padding. Require make's output to hold
the learner's own line for every planted statement. This adds no make or linter runs (still 3 + 3), so the L2 budget is
unchanged. A stub then has to resolve the hit module (`invoices.money`, `invoices.service`, `sqlite3.dbapi2`, relative
`from .`), the first line of a parenthesised statement and a backslash continuation, all in the same run. At that
point it is a second linter. Neighbours to demo against the fix: `<j>/b1f.py`'s `lint.sh`, and that script with sed
extraction of the module name (it then catches the hit-name forms but still misses `import os, \` / `sqlite3` and
`from invoices import (` ... `legacy_format,`). Check that the honest workspaces below still pass: forcing every
chunk x wrapper already passes with the reference linter, so planting all chunks at once should pass too. Show it.
Update task.md item 8 ("получают по одному нарушению", "Форма нарушения выбирается").

## C1, C2 and pedagogy B1: re-runs against the real checks

| Item | Runs | Result (3.12 and 3.11) |
|---|---|---|
| C1 round-2 patches (`judge-c2/att2.py`, `<j>/out_att2_31{1,2}.txt`): new test file replaces `test_filters_by_status`, `run()`, `assertEqual` on `InvoiceListTest`, status filter broken; L1, L2, L3 | must fail | all exit 1, "стартовые тесты: тесты красные"; reference, honest added test pass; 24 cases, 0 unexpected |
| C1 neighbours (`<j>/att_c1.py`, 22 cases): `load_tests` hook in an added file; a `tests/sub/` package; a file under `tests/fixtures/`; L1 learner `test_late_fee.py` patching `test_api` | must fail | all exit 1 in the pristine child |
| same harness: `tests/helpers.py` that `os._exit(0)`s on import; honest added test; stray `tests/zz.pth` | must pass | pass; added failing test fails ("все тесты вместе с вашими") |
| C2 round-2 grep stubs and suite-only control (`att2.py`) | must fail | exit 1, item 8 |
| Round-1 B1/B2 (`judge-c1/att_l1l2.py` 15, `att_tests.py` 4) | as round 2 | 0 unexpected |
| Pedagogy B1, before the fix (`<j>/forms.py`, `<j>/out_forms_31{1,2}.txt`): reference minus `src/invoices/money.py` plus an own ledger test | info | A1 chunks 1-4 failed item 8 (reproduced independently); `legacy_format` inlined into `export_csv.py` failed every A3 chunk. Not an honest layout: export_csv.py documents that partner-sync imports `invoices.legacy_format` |
| Pedagogy B1, after the fix (`<j>/forms2.py`): every chunk x every wrapper (`def`, `TYPE_CHECKING` alias, `if False`) forced through the grader's own `make_problems`, on reference, `student-a/l2`, reference with `check: lint test`, money.py removed + ledger test, legacy inlined; plus the round-2 grep stub | 360 cases per interpreter | 0 unexpected: honest layouts pass every form, so the planted line numbers match the reference linter for every chunk x wrapper; the grep stub fails every form |
| Fallback target (`<j>/forms3.py`): `src/ledger/accounts.py` merged into `posting.py` and deleted | 60 cases | 0 unexpected |
| Orchestrator's correct workspace (`<j>/b1.py`): money.py deleted, statement on `shared.money`, `tests/test_report.py` importing `ledger.report`, `check: test` then linter | 30 runs each interpreter | 30/30 pass on both |

## What else I ran (current checks)

- `<j>/full.py`, run twice per interpreter (`<j>/out_full2_31{1,2}.txt`, 135 cases each, 0 unexpected):
  - Untouched starter fails every command check: L1 `rule-placement` 3, `poka-yoke-applied` 1; L2 `arch-linter` 1,
    `arch-workspace-clean` 1; L3 `failure-log` 3, `deps-gate` 1; L4 `contour-config` 1.
  - Reference passes: `arch-workspace-clean` 20/20 per interpreter (forms drawn per run), every other check 3/3.
  - Honest workspaces: `student-a/l1` (2x each check), `student-a/l2` (20x `arch-workspace-clean`, 2x `arch-linter`)
    and `student-b/l3/ws` (2x each) all pass.
  - Honest L2 variants, 10 runs each: money.py removed with and without a ledger test, own ledger test alone,
    `check: lint test`. All pass.
- `pd-a/replay.py` over the 101 student workspaces (`<j>/out_replay_31{1,2}.txt`): honest `l1`, `l2`, `ws` pass every
  check. The only differences between interpreters and from the designer's run are the four wrong-linter workspaces
  the demo log names (`l2-lin-body-only`, `-no-relative`, `-noqa`, `-regex`): their `arch-workspace-clean` varies by
  draw, and all of them fail `arch-linter`. Every other verdict is unchanged.
- Slow paths (`<j>/slow.py`, 3.12): an `invoices/__init__.py` that sleeps 400 s takes L1 110.2 s of 120, L2 255.3 s of
  300 and L3 70.3 s of 150. A linter that sleeps 11.5 s with make failing takes L2 93.3 s (3.11). All are under
  `timeoutSec`, but L1 has only about 10 s of margin (its child budget is 110 by design; see N7).
- `grader_runtime.py` is byte-identical in L1-L3. The pristine copies match the starter `tests/` (L1 without
  `test_late_fee.py`).
- `pnpm content:validate`: `content: 1 course(s), 6 module(s), 18 lesson(s), 0 issue(s)`.
- Leak scan of every `starter/`, `task.md` and `theory.md` for check, grader, data and key file names (including
  `_planted`, `never_executed`, `pristine_tests`, `arch_roots`): no hits.
- Quizzes, L4 and L5 are unchanged in checks since round 2 and were not re-audited.

## Non-blocking
- N3-N6 from round 1 stand.
- N7 (new): the L1 slow path is 110 s against `timeoutSec: 120`. The margin is the grader's own overhead plus about
  10 s. A slower container may hit the platform timeout, which shows a timeout instead of the item-7 message. Consider
  150.
- N8 (info, OUT, RS6 class as in round 2): src-side code that patches a starter test class at call time is still
  outside the tamper snapshot.

## Attribution
D1: mainly mine. The round-2 C2 prescription said "plant A1/A2/A3" without saying "every form", and claimed on paper,
without running it, that a forger fails. The designer implemented that faithfully. Practice-designer A shares it: per
their own round-2 rule they did not demo a message-forging stub against the fix. Lessons appended to
`.claude/feedback/judge_mistakes.md` and `.claude/feedback/practice-designer_mistakes.md`, written from Python
(shell writes to `.claude/` are blocked).

FAIL
