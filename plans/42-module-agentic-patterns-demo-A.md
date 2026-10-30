# #42 demo record A: L1 `01-code-over-rules`, L2 `02-architecture-checks`, L3 `03-failure-analysis`

Practice-designer A, 2026-10-30. Protocol: design 2.4 (as 00 2.4 with 01 2.4's deltas). Every driver and raw
output is in the scratch dir
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/pd-a/`
(`<pd-a>` below; not committed). Re-run on the image interpreter before `ready` (design 12.6 (d)-(f)).

## Environment
- macOS. Interpreters run: **Python 3.12.13** (`/opt/homebrew/bin/python3.12`) and **Python 3.11.14**
  (`/opt/homebrew/bin/python3.11`), each first on PATH through a scratch `python3` symlink (`<pd-a>/bin`,
  `<pd-a>/bin311`). **3.10 and 3.13 are not installed on this machine and `uv` is absent, so they were not
  run** (S3): owed to the image re-run together with 12.6 (d)-(f). `/usr/bin/python3` (3.9.6) was never used.
  `make` is GNU Make 3.81.
- Driver `<pd-a>/demolib.py`: grader mount = copy of `checks/` without `reference/` and `data/reserve/`
  (asserted, (4d) line in every output); workspace = fresh copy of `starter/` (plus the `checks/reference/`
  overlay for base "reference"; `reference/_deleted.txt` lists files the reference deletes, L1 `old_api.py`);
  the lesson.yaml `run` string executed verbatim by `/bin/sh -c` with `PATH=<python3 dir>:/usr/bin:/bin`,
  `HOME=<copy>/home`, `ACADEMY_CHECKS_DIR=<mount>`, nothing else.
- Exit codes: capped checks (`rule-placement`, `failure-log`) 0 pass, **3 stage 0 (not counted)**, 1 counted;
  all other command checks 0/1.

## Summary
| Run | 3.12.13 | 3.11.14 | Output |
|---|---|---|---|
| L1 both checks (`<pd-a>/demo_l1.py`) | 83 cases, 0 unexpected | 83, 0 | `out_l1_312.txt`, `out_l1_311.txt` |
| L2 both checks, wrong linters on 20 seeds (`demo_l2.py`) | 84 cases, 0 unexpected | 84, 0 | `out_l2_312.txt`, `out_l2_311.txt` |
| L3 both checks, wrong gates on 20 seeds (`demo_l3.py`) | 61 cases, 0 unexpected | 61, 0 | `out_l3_312.txt`, `out_l3_311.txt` |
| Suite runner corpus (`suite/corpus.py`) | 27 attacks + 41 honest, 0 unexpected | same | `suite/out_suite_312.txt`, `suite/out_suite_311.txt` |
| Quiz audit (`quiz_audit.py`, 4 files) | all OK | | inline below |
| Every student cheat workspace replayed (`replay.py`, 101 workspaces) | see "Student runs" | identical verdicts | `out_replay_312.txt`, `out_replay_311.txt` |

(1) untouched starter fails and (2) reference passes, for every check: L1 `rule-placement` exit 3 (s1),
`poka-yoke-applied` exit 1 (signature, 11 positional calls, first `src/invoices/statement.py:13`, `old_api.py`);
L2 `arch-linter` exit 1 (skeleton raises), `arch-workspace-clean` exit 1 (A1-A3, w2, behaviour, no `check`
target); L3 `failure-log` exit 3, `deps-gate` exit 1. References: exit 0, on 20/20 seeds for the randomised
checks.

## L1 `rule-placement` (`out_l1_*.txt`)
- Must fail, each exit 3 with the named item: R05 tag left after `check`; tags stripped, 12 texts kept (s3);
  moved texts and normalised moved words as 5-word `##` headings (s4); 16-word untagged line; `## Notes` + 3
  lines; two texts verbatim untagged (s5); texts in `CLAUDE.local.md`, `AGENTS.md`, `.claude/rules/a.md`,
  `.claude/CLAUDE.md`, `src/CLAUDE.md` (s2); `@docs/rules.md`, `**Rules:**@...`, `<!-- rules -->@...`, `@` after
  an unbalanced backtick, `` `@docs/rules.md` ``, fullwidth `＠` (NFKC) (s2); a tag every 3 words (s3 33 lines);
  one `[R03]` line paraphrasing ten (+42 words); second `[R03]` line; two tags on a line; 4 untagged lines; R04
  phrase in a sentence and across a line break and a heading (s5 stream); key with CLAUDE.md untouched (s3);
  +11 words; NaN, duplicate key, value `hooks` (s1).
- Counted (exit 1, "Не пройдено (отправка засчитывается)."): two wrong placements (R08 check, R07 code); every
  value memory with all tags.
- Must pass: key; R09 memory with tag (11/12); paraphrased untagged line; 15-word line; starter headings kept;
  e-mail address; +9 words; `[R03]` + fenced `make test` (3 untagged lines). Residual shown passing: the ten
  paraphrased in 3 lines of <= 15 words (12.2).
- Starter CLAUDE.md holds only headings, 12 tagged lines and blanks (asserted, NB4).

## L1 `poka-yoke-applied`
- Must fail: callers not updated (stage 0, 11 calls, first `statement.py:13`); `*args`; a default; `**kwargs`;
  `late_fee(**{...})`; aliased positional call `lf(balance, days_late)` (probe 48/48 + suite); cap 20% (grid 8/35);
  `old_api.py` emptied; renamed to `db_v0.py` (name); renamed with renamed functions (body fingerprint); test
  renamed `_disabled_*` (stage 0); test skipped (suite); swap kept by name (statement 39/48); same + workspace
  `unittest/` printing OK (still 39/48); red test marked `expectedFailure` (suite); (4c) `os._exit(0)` in
  `late_fee.py` (no record); S1 patch-and-restore with a red test (suite: tampered `TestResult` + red).
- Must pass: reference; reference + `unittest/` shadow; reference + a stale `__pycache__` pyc.

## L2 `arch-linter` (20 logged seeds 1001-1020; `l2_linters.py` holds every wrong linter)
Reference 20/20. Each wrong linter 0/20: stub; substring; relative imports not resolved; allowance by file
name; honouring `# noqa`; `end_lineno`; `tree.body` only; exit 1 on a parse error; no ` Fix: `; the judge's
line-anchored regex linter with a `compile()` gate; one line per matching name (repeats); hardcoded output;
(4c) `os._exit(0)` in the linter (0/3). `lint-output.txt` with a line dropped 0/3; reordered lines 5/5 pass.

## L2 `arch-workspace-clean`
- Must fail (each its own message): importlib (judge's evasion, w1 modules); `__import__('sqlite3')` in
  `api.py`; `runpy` with starter and reference `money.py`; `exec(open(...))`; `from builtins import exec as ...`,
  `compile as c` + `FunctionType`; `import builtins as b`; `__builtins__['exec']`; `vars(builtins)['ex'+'ec']`;
  `getattr(sys.modules['builtins'], 'exec')`; `print.__self__.compile`; `f_builtins['exec']`;
  `code.InteractiveInterpreter`; `cProfile.runctx`; `from timeit import Timer`; `codeop` + `FunctionType`;
  `pkgutil.resolve_name`; `type(__loader__)`; `from re import compile` + `compile(...)`; `import re as r` +
  `r.compile`; `sys.modules['builtins'].__dict__['ex'+'ec']`; `globals()['__builtins__']['ex'+'ec']`;
  `import pickle` (labelled "модуль, который загружает код или объекты, способные исполнить код", P1);
  `sys.path.insert`, `sys.path.append(Path(__file__).parents[1]/'invoices')`, `site.addsitedir` + `import money`
  (w2 `__file__` rule: "импорт модулей ledger загружает код из src/invoices/: money");
  `sys.modules['importlib'].import_module(...)` (w2 name rule); `import _sqlite3`, `repository.sqlite3.connect`,
  **`repository.sqlite3.Connection(':memory:')` (fails on 3.12.13 and 3.11.14: the `sqlite3.connect` audit event
  fires; 3.10 and 3.13 owed to the image)**, a `ThreadPoolExecutor` worker (no `src/` frame); `__builtins__['__import__']`;
  statement on `money_str` (3, 6, 8); behaviour change without the import (6); `export_csv.py` deleted (6);
  `check: test`; `|| true`; `-` prefix; `check: true`; workspace `unittest/` exiting 0 (make green on the red
  test, 8); red test `expectedFailure` (7); (4c) `os._exit(0)` in `statement.py` (no record); `# noqa` on the
  A1 import (grader's own rules, 3); unchecked-hash `__pycache__/report.cpython-3{11,12,13}.pyc` behind a raising
  `report.py` (the copy has no `__pycache__/`, so `entry_lines` raises, 6).
- Must pass: reference; `format_cents` copied into ledger; `re.compile` in `accounts.py`; docstring "no exec
  here" by `con.execute`; `import traceback, codecs` in `api.py`; first-party `ledger/profile.py` via `from .
  import profile`; docstring "do not shadow Python builtins such as sum"; reference + `make codegen`; stale
  `__pycache__` in `src/`. Residuals shown passing (2.8, mentor reviews the diff): RS3 identity search +
  `'ex' + 'ec'`; RS4 `subprocess` running the interpreter on `money.py`.
- Starter `src/` (including `generated/`) has no w1 form: the starter run lists only items 3, 5, 6, 8.

## L3 `failure-log`
Starter exit 3; key 0; alternative layers (I02 check, I04 code, I05 hook, I10 delete) 0; one wrong 0; two
wrong exit 1, binary "Не пройдено (отправка засчитывается)."; I01 and I10 on `code` exit 1 (no longer
accepted); extra key, 401-char fix, layer `test`, extra field, NaN, a UTF-8 BOM (named): exit 3.
Arithmetic with the revised key (accepted counts 1,2,1,2,2,1,1,2 of 36; `<pd-a>/arith/faillog_newkey.py`): blind
1.185e-9 per submission; per-item oracle within 10 submissions 0.51%. Search under binary feedback, causes
assumed known (`<pd-a>/arith/sim_binary.py`): see "Student runs", item 4.

## L3 `deps-gate` (20 seeds 2001-2020)
- (a) Reference 20/20; a gate validating with `compile()` first 20/20. Each 0/20: stub; hand-written stdlib
  list; dotted names compared to the allowlist; relative imports reported; `tree.body` only; case-insensitive
  allowlist; first-party hardcoded; lenient allowlist parser; the judge's line-regex gate; exit 1 on a parse
  error; one line per statement instead of per name; (4c) `os._exit(0)` (0/3).
- (b) Must fail: starter; `fastjsonx` in the workspace allowlist; vendored `src/fastjsonx.py`,
  `src/fastjsonx/__init__.py`, `src/invoices/fastjsonx.py`; sourceless `src/invoices/fastjsonx.pyc` + `from .
  import fastjsonx`; `src/invoices/extra.json`; empty `src/invoices/fastjsonx/` + attribute; `src/*.egg-info/`;
  `.DS_Store`, `export_json.py~`, `.export_json.py.swp` (each path named, "удалите их ..."); unchecked-hash
  `__pycache__/export_json.cpython-3x.pyc` behind a raising file; `try`/`except ImportError` fallback; no
  `sort_keys`; red test `expectedFailure`; skipped test; (4c) `os._exit(0)` in `export_json.py`.
- Must pass: reference; reference + `__pycache__` file; reference + `make codegen`; a comment naming `fastjsonx`.
  Residuals shown passing: RS6 `sys.modules.setdefault`, RS7 `class fastjsonx` in `money.py`. Reference
  `make -s check` exits 0.

## (4a)-(4d), every command check
(4a) usercustomize on the EMPTY starter: without `-I` exit 0 (attack real), with `-I` the check fails. (4b)
PATH shim: first on PATH exit 0 (runner-only defence), fixed PATH fails. (4c) above per check. (4d) mount has
neither `reference/` nor `data/reserve/`. Linux-only items (`prctl`, `/proc`) not run here (no Linux run).

## Suite runner (2.3), `grader_runtime.py`, one file copied byte-identically into L1, L2, L3 (`cmp` OK)
Corpus `<pd-a>/suite/corpus.py` on the judge's calc project: judge-r5 `cases4.py` attacks, `suite_honest.py`
(18), the round-5 single-idiom honest cases (3), `honest_r5.py` (20 honest, 4 attacks), plus:
- **S1** closed: the bootstrap now counts failures with its own `TestResult` subclass bound to the methods
  captured before discovery and compares behaviour keys at every `stopTest`. Patch at import + restore in a
  later test: `addFailure`/`addError` -> tampered `TestResult`; `_Outcome.testPartExecutor` -> tampered
  `_Outcome` (both previously passed on r5). Honest corpus 41/41 still passes.
- **A1**: the `enterContext` honest case is gated on `sys.version_info >= (3, 11)` (else `addCleanup`).
- **A3** (wording, not code): a well-formed `__code__` swap on `addFailure`/`addError` is now red (the bootstrap
  counts before calling the swapped method); a well-formed swap on `_Outcome.testPartExecutor.__wrapped__`
  (one that swallows exceptions) **passes the suite part**: residual of the 2.8 bytecode class, left to the
  mentor and the hidden probes. Never "red anyway".
- **S2**: `unittest.installHandler()` in a test reports tampering (`unittest.signals`); task.md L1 item 10,
  L2/L3 item 7 say so (lesson-author A).
Run on 3.12.13 and 3.11.14: attacks 27, honest 41, unexpected 0.

## Quizzes (`quiz_audit.py`)
L1 `quiz.yaml`, L1 reserve, L3 `quiz.yaml`, L3 reserve: 6 questions each (4 single, 2 multiple), options a-d,
correct sizes valid, single positions a/b/c/d once each (25% < 40%), correct uniquely longest in 1 single,
no all/none-of-the-above; key 1.0, empty 0, always-a/always-b/always-longest 1/6. Exact random pass 0.1211% per
attempt, 0.3628% over 3.

## Rubrics (blind sets built, grading owed to the student phase)
`02-architecture-checks/checks/reference/rubric-demo/` (weak, borderline, memory-dependent, suppress, shouting,
injection; all match the `arch-linter` form regex) and `03-failure-analysis/checks/reference/rubric-demo/`
(weak, borderline, symptom, injection), each with a README of expected grades. The blind grading by the student
agent acting as mentor (00 2.4 rubric step 2) is not done here: this role cannot spawn agents.

## Open
- 3.10 and 3.13 not run (S3); image interpreter, `make` in the image, `sqlite3.Connection` audit event on the
  image (12.6 (d)-(f)) owed before `ready`.
- Linux `prctl`/`/proc` items not run.
- Blind rubric grading owed (above).

## Student runs (A: L1, L2; B: L3; C: rubrics), fixes and re-runs, 2026-10-30
All re-runs on 3.12.13 and 3.11.14: L1 83, L2 84, L3 61 cases, suite corpus 27 + 41, 0 unexpected on both.
Every student cheat workspace (`student-a/cheat/l1-*`, `l2-*`, `student-b/l3/cheat/ws_*`, and the honest `l1`,
`l2`, `ws`) was replayed with the real checks in a copy (`dotclaude` renamed back to `.claude`); 3.11 and 3.12
give identical verdicts (`out_replay_31{1,2}.txt`).

| # | Finding | Fix | Demo now |
|---|---|---|---|
| 1 | L1 item 2: symlinked `.claude/rules` hides moved rules | memory scan follows symlinks (each real dir once, loops end); `.claude/rules` has its own walk so the loop guard cannot hide it | student cheat exit 3; `.claude` as a symlink exit 3; a subdir linked outside the workspace holding `CLAUDE.md` exit 3; a symlink loop passes |
| 2 | L1 item 8: positional twin `compute_fee` | `statement_line` must call `late_fee`; no file in `src/`/`tests/` outside `late_fee.py` may import or reach as an attribute another function of `late_fee.py` | student twin, attribute twin, twin defined in `statement.py`: fail (static); private positional helper used only inside `late_fee.py`: passes (student `l1-wrapper-star` passes) |
| 3 | L3 item 6: near misses pass on retry | 3 dicts per run, each with out-of-order top and nested keys and a Cyrillic value | `dict(sorted(d.items()))` 0/20 seeds, `ensure_ascii=False` 0/20; `sort_keys=True` with explicit default separators 20/20 |
| 4 | L3 `failure-log` count feedback hill-climbable | counted message is binary "Не пройдено (отправка засчитывается)." | see rates below |
| 5 | L1 item 9: `old_api` copy in `scripts/` or with renamed locals | `scripts/` scanned; fingerprint normalises every variable and argument name | both fail; the student's `l1-oldapi-fullrename` passes only because its copy is not the same code (`sqlite3.connectionect`); a correct full rename fails |
| 6 | L2 item 6: A2 fixed by deleting the DB ping | during `GET /health` the probe must see a connection opened by `src/invoices/repository.py` | student case fails item 6; reference passes |
| 7 | L1 item 7: exception message not compared | grid compares value, exception type and text | student message-change cheat fails item 7 |
| 8 | English `seed` line | now `номер запуска для разбора: N` (stderr, L2 and L3) | |
| 9 | L1 quiz explanations | `place-a-new-rule`: sqlite3's own `with` does not close, use `contextlib`; `typed-boundary`: annotations are not checked at run time, a type checker and building the enum are | audit OK |
| 10 | L3 key vs ladder | key follows the printed definition ("code" = Python in `src/`/`scripts/`): I01 `memory` only, I10 `delete`/`memory`; I01 context no longer mentions CI; I08 context says CLAUDE.md already asks to run `make test` | demo rows above |
| 11 | rubrics | L2 M2 level 1 names "points to a named document other than the memory file", level 0 "points to the memory file"; M1/M3 level 0 cover "names no module / nothing to act on"; L3 F1 judges the layer of symptom fixes too, F3 level 1 counts a memory line where a deterministic layer applies, F4 level 0 covers fixes too small to matter, `check_deps.py` feeds I02 only; READMEs: L2 borderline reasoning, L3 symptom F1 0 (4/8), weak F4 0 (0/8) | blind regrade owed (student C graded the previous text: 6/6 and 4/4 verdicts) |
| 12 | BOM; two statements on one line | stage-0 BOM message in L1 `placement.json` and L3 `failure-log.json`; a finding expected twice on one line may be printed once or twice (new root chunk `import cbor2x; import cbor2x`) | BOM rows exit 3; reference 20/20; student B's honest gate (prints once) passes |

`failure-log` search rates with binary feedback (new key, causes known, up to 11 submissions):
- student B's `sim.py` strategy (one layer change per submission, from all `check`): 0.2% (was 25% with the count);
- `sim2.py` strategy from a sensible start: the start itself already holds 7 of 8 right layers, so it passes on
  the first submission (knowledge, not search); from all `check` with one change per submission it is the 0.2% above;
- uniform random layers per submission: 0.3%;
- optimal greedy search when sure of k of 8 layers: sure of 7 or 6: 100%; sure of 5: 67.6%; sure of 4: 17.8%
  (L1, sure of 9 of 12: 31.2%). For comparison, with the count student B measured 59.8% from a blind
  all-`check` start.

Residual seen, not built against (2.8): student B's W20 overwrites the pristine `generated/invoice_schema.py`
with a `dumps` and imports it as `fastjsonx` (RS7, code planted into an existing module): passes.

## Rubric wording after the blind regrade (student run D: 6/6 L2, 4/4 L3 on verdicts and score vectors)
Wording only; each blind-set sample was re-read against the new text and keeps its expected vector and verdict.
- L2 `rubric-remediation.md`: M1 heading drops "in one clause" (no level graded it; `shouting.txt` keeps M1 2);
  M2 opens with "a concrete action offered with suppression as the alternative: grade M2 on the action, the
  suppression is penalised under M4 only" (`suppress.txt` stays 2, 2, 2, 0); M3 opens with "judge the whole line,
  the part before ` Fix: ` and the Fix".
- L3 `rubric-failure-fix.md`: F1 opens with the ladder's layers (`code` = Python in `src/`/`scripts/`, a Makefile
  target is not code; `hook` = stops the agent at a moment of its turn: PreToolUse/Stop hook and a
  `permissions.deny` rule; `check` = test, linter, a gate in `make check`; a Stop hook running `make check` is
  `hook`); F1 level 0 "3 or more fixes that are vague or at another layer"; F2 level 0 "3 or more fixes that would
  not have stopped the repeat"; F4 opens with "a fix may lose points under both F3 and F4; intended".

## judge_content round 1 fixes and re-runs (2026-10-30)
Re-runs, 3.12.13 and 3.11.14, 0 unexpected on both: L1 85, L2 91, L3 65 cases; suite corpus 27 + 41; replay of the
101 student workspaces identical on both; the judge's `judge-c1/att_l1l2.py` 15 cases and `att_tests.py` 4 cases
(`<pd-a>/out_judge_att_*_31{1,2}.txt`); quiz audit 4/4 OK; `grader_runtime.py` byte-identical in L1-L3.

| Finding | Fix | Demo |
|---|---|---|
| B1 L2 item 8: stub `make check` targets pass | 6 variants, each at most 30 s (6 x 30 + 20 + 45 = 245 < 300): as is (0); a clean new ledger module whose docstring and comment say `import invoices`, plus a new passing test, random names (0); a new file with an A1 import; an A1 import (one of three forms, drawn per run) appended to the existing `src/ledger/accounts.py`; a new failing test; a regression appended to the existing `src/invoices/late_fee.py` (every fee + 1 cent) that turns starter tests red (each non-zero). Every `make` copy gets the pristine starter tests first | judge's file-list stub and m+6hex stub fail; check running only the linter, only the tests fail; reference passes. L3 `deps-gate` has no `make` part, no gap there |
| B2 L1/L2/L3: suite ran the workspace's own test files | `checks/data/pristine_tests/` (a copy of the starter `tests/`) is copied over the grader's copy before the suite (`grader_runtime.overlay_pristine_tests`); learner-added test files stay and run. L1 overlays every starter test file except `test_late_fee.py`, which item 7 asks the learner to edit (its names are still checked statically and the grids cover `late_fee`) | judge `att_tests.py` both cases fail in L2 and L3; the same broken filter + edited `test_api.py` fails in L1. Old demo rows "red test marked expectedFailure" / "skipped test" now break code and mark the test: fail; marking or deleting a starter test with correct code has no effect and passes (student `l2-delete-health-test`, `ws_W17` now pass, as intended) |
| B3 L3 I04 | key I04 accepts `check`, `code`, `hook`; reference I04 is `hook` ("the Stop hook runs `make check`", plus deleting `report_v0.py` as code); reference I02 fix text now leads with its `hook` (deny) and names the gate as the check alternative. Re-walk of all 8 from the printed text: I01 memory, I02 check/hook, I03 check, I04 check/code/hook, I05 check/hook, I07 task, I08 hook, I10 delete/memory; each reference fix sits at its label under rubric F1's definitions | I04 on hook passes; I04 hook + one other wrong passes (7/8) |
| N1 L1 | the probe replaces `late_fee` (in `invoices.late_fee` and, if bound, in `invoices.statement`) with a marker returning 424242 and requires `statement_line` of a 30+ days late invoice to show "+ fee 4242.42" | judge's correct-order twin with a dead keyword call fails item 8 |
| quiz `typed-boundary` | last clause about the memory line dropped | audit OK |

`failure-log` rates with the round-1 key (accepted counts 1,2,1,3,2,1,1,2 of 36): blind 1.727e-9 per submission;
per-item oracle within 10 submissions 0.65%; binary search with causes known: one change per submission from all
`check` 0.3%, uniform random 0.5%, greedy sure of 7/6/5/4 of 8 layers: 100 / 100 / 67.6 / 17.8%
(`<pd-a>/arith/faillog_newkey.out`, `sim_binary.out`).

Residual noted by the judge, info only: in L1 a learner-added red test in `test_late_fee.py` (the file the task asks to
edit) rebased on a `TestCase` whose `run()` swallows failures passes the suite part; the grids grade `late_fee` and
`statement_line`, and the pristine `test_api.py`/`test_statement.py` run unmodified.

## judge_content round 2 fixes (C1, C2; Stepan's approved construction) and re-runs (2026-10-30)
Re-runs, 3.12.13 and 3.11.14, 0 unexpected on both: L1 87, L2 93, L3 67 cases; suite corpus 27 + 41; judge
`judge-c2/att2.py` 24 cases, `judge-c1/att_l1l2.py` 15, `att_tests.py` 4 (`<pd-a>/out_judge_*_31{1,2}.txt`); L2
reference `arch-workspace-clean` 20/20 runs on each interpreter with the planted forms drawn per run
(`out_l2ref20_31{1,2}.txt`); `grader_runtime.py` byte-identical in L1-L3.

C1, starter tests in their own process (`grader_runtime.replace_tests`, `suite_problems` in each verifier):
- child 1: the copy's `tests/` holds only `checks/data/pristine_tests/` (every learner file under `tests/` removed);
  pristine names must run, not be skipped, all green, no tampering;
- L1 only, child 2: `tests/` holds the pristine support files (`__init__.py`, `fixtures/`) and the learner's
  `test_late_fee.py` alone (the file item 7 asks to edit); its starter names must run and be green;
- last child: the workspace `tests/` with the pristine files copied over (learner-added tests included); it must be
  green and untampered, and it cannot make child 1 pass.
- Budgets: L1 probe 20 + 3 x 30 = 110 < 120; L2 20 + 2 x 30 + 7 x 25 (make) + 3 x 12 (linter) = 291 < 300; L3 6 x 12 +
  20 + 2 x 25 = 142 < 150 (suite limits now 30 s in L1/L2, 25 s in L3).
- Must fail, each lesson: the judge's three new-file patches (`test_filters_by_status` replaced, `run()` replaced,
  `assertEqual` replaced on `InvoiceListTest`) with the status filter broken; a `load_tests` hook in an added file that
  patches the starter class. Must pass: an honest added test; a non-test `tests/helpers.py` that would exit if imported.

C2, L2 item 8 (`verify_workspace.make_problems`): 7 `make -s check` copies at 25 s: as is (0); clean new ledger module +
passing test (0); new failing test; regression in `late_fee.py`; and one planted A1, A2 and A3 each, appended to an
existing module (`src/ledger/accounts.py`, `src/invoices/service.py`, `src/invoices/models.py`), the form drawn per run from
the `arch_roots.json` chunks with exactly one finding of that rule (in a function, parenthesised over lines, after `;`,
backslash continuation, relative `from .`/`from ..`, under `TYPE_CHECKING`, with `# noqa`), padded by `root_render`. A
planted variant counts only when make exits non-zero AND its output holds a finding line for the planted rule, path and
line whose message and Fix equal what the learner's own `scripts/check_architecture.py` prints for that statement on the
same copy. The judge's two grep stubs fail; the reference passes 20/20.

Replay note: for workspaces whose linter is wrong (`l2-lin-body-only`, `-no-relative`, `-noqa`, `-regex`), the
item-8 outcome now depends on whether that wrong linter happens to catch the planted form of the run, so their
`arch-workspace-clean` verdict varies between runs; all of them fail `arch-linter` on every run. Every other replayed
verdict is unchanged and identical on 3.11 and 3.12.

## judge_content round 3 (pedagogy B1) fix and re-run (2026-10-30)
Finding: four of the planted A1 chunks import `invoices.money` at module level; a correct solution that deletes
`src/invoices/money.py` and tests `ledger.report` went red in `make test` before the linter (~40% of runs).
Fix (`verify_workspace.never_executed`): every planted chunk (A1, A2, A3; form still drawn per run from `arch_roots.json`)
is placed inside a block that never runs on import, drawn per run: an uncalled `def _planted_<hex>()`, `if` on
`TYPE_CHECKING` imported from `typing`, or `if False:`. So no command that runs before the linter sees a change. If the
named target (`src/ledger/accounts.py`, `src/invoices/service.py`, `src/invoices/models.py`) is missing, the plant goes
into another existing module of that package the rule applies to (never `repository.py` for A2 or `export_csv.py` for
A3), else a new file there; the message names the actual module.
Re-demo (`<pd-a>/demo_l2_b1.py`, `out_l2_b1_31{1,2}.txt`), each on 3.12.13 and 3.11.14:
- correct solution with `src/invoices/money.py` deleted, `shared.money` imported, a new `tests/test_report.py` importing
  `ledger.report`, `check: test` then the linter: passed 30/30;
- reference: 20/20;
- `service.py` renamed to `validation.py` (A2 falls back to another module): 10/10.
`demo_l2.py` 93 cases, 0 unexpected, and judge `judge-c2/att2.py` 24 cases, 0 unexpected (both grep stubs fail item 8),
on both interpreters.

## judge_content round 3 (assessment D1) fix and re-run (2026-10-30)
Finding: one planted chunk per rule let a grep script printing the reference message pass ~10% of runs.
Fix (`verify_workspace.planted_violations`): each rule's copy now gets every single-finding chunk of that rule from
`arch_roots.json` (A1 10, A2 5, A3 5), in random order, each with its own padding and its own drawn never-executed
wrapper; the copy counts only when make exits non-zero and its output holds the learner's own linter line (rule, path,
line, message, Fix) for every planted statement. Still 3 planted copies and 3 linter runs: budget unchanged (291 < 300).
The message counts how many of the planted lines are missing and names the first.
Re-runs, 3.12.13 and 3.11.14 (`<pd-a>/out_l2_d1_31{1,2}.txt`, `out_l2_b1_31{1,2}.txt`):
- judge's `lint.sh` (grep, fixed module names): passed 0/40; a sed variant that extracts the module name: 0/40 (it
  still misses the backslash continuation and the parenthesised `from invoices import (... legacy_format,)`);
- every wrapper forced for all plants at once through the grader's own `make_problems`: reference, the correct
  workspace (money.py deleted + ledger test), student A's honest `l2`, the reference with `check:` running the linter
  before the tests: 12 of 12 pass;
- correct workspace 30/30, reference 20/20, A2 fallback target 10/10;
- `demo_l2.py` 93 cases, judge `att2.py` 24, `att_l1l2.py` 15: 0 unexpected; replay of 101 student workspaces now
  identical on 3.11 and 3.12 (the wrong linters now fail item 8 on every run, since every form is planted).
N7: L1 `poka-yoke-applied` children sum to 110 s (probe 20 + 3 suites x 30) against `timeoutSec: 120`; measured 0.4 s.
`timeoutSec: 150` gives 40 s of margin. L2 `arch-workspace-clean` children sum to 291 s against 300 (measured ~1 s);
the same reasoning suggests 360.
