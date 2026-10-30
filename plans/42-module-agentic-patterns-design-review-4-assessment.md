# #42 design review, round 4: assessment

Reviewer: judge-assessment. Object: `plans/42-module-agentic-patterns-design.md` revision 4. I read section 15, section
11, 2.3, 2.8, the L1-L3 entries and their task.md items, and section 6. Threat model: design 2.8, Stepan, 2026-10-30.

Scratch dir:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/judge-r4/`
(`<r4>` below). It is a copy of the architect's `arch4/`, plus:
- `l2/cases_r4.py`: the B1 neighbours and the honest L2 variants;
- `l2/verify_ws_fixfile.py`: the B1 fix;
- `suite/runner4.py`: variants D = revision 4 as written, E and F = candidate fixes;
- `suite/cases4.py`: the attack corpus on D/E/F;
- `honest/suite_honest.py`: the honest test corpus;
- `honest/l1_honest.py`, `honest/l3_honest.py`.

Interpreter `/opt/homebrew/bin/python3.12` (3.12.13). Every case runs on a fresh `mktemp -d` copy under `-I`.

Verdict: FAIL, 2 blocking items.
- B1 is an in-scope import neighbour that passes.
- B2 is the other direction: the revision-4 suite runner fails honest, green test suites.

Round-3 B1 is closed.

## Blocking

### B1. L2 `arch-workspace-clean`: `sys.path` plus a plain `import money` loads `src/invoices/money.py` into ledger and passes

`src/ledger/report.py` with the starter `money.py`:

```python
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'invoices'))
from money import format_cents
```

Command: `python3.12 -I <r4>/l2/cases_r4.py` (`verify_ws.py` = the revision-4 w1/w2). Results:
- `sys.path.insert` + `from money import format_cents`: `PASS`.
- `sys.path.append(str(Path(__file__).resolve().parents[1] / 'invoices'))` + `import money`: `PASS`.
- `site.addsitedir(...)` + `from money import format_cents`: `PASS`.

Why each layer misses it:
- (a) sees `money`, which is not `invoices`.
- w1 has no banned name, attribute, module or string here.
- w2 asks whether a module *named* `invoices...` is loaded. The module is named `money`.

Why it is in scope:
- It is the most ordinary plain-Python way to import code with a literal name. It is the same effect as the listed
  must-fail `exec(open(".../invoices/money.py").read(), ns)`: invoices' code runs inside ledger.
- None of 2.8's out-of-scope classes covers it. It builds no name from strings, uses no `runpy` or other executor, no
  `subprocess`, no bytecode and no `sys.modules` alias, and plants no code.

Fix target, L2 check 2 (w2), task.md item 5 and section 6. Name the effect, not the module name:
- "After importing every `ledger` module and calling `entry_lines`, no module whose `__file__` resolves (`realpath`)
  under the copy's `src/invoices/` is loaded, whatever its name."
- Add the three forms above to "Must fail" (w2).

Verified with `V=verify_ws_fixfile.py python3.12 -I <r4>/l2/cases_r4.py` and `python3.12 -I <r4>/l2/cases4_fixfile.py`:
- All three forms fail: `(w2) invoices loaded money`.
- The 28 cases of `cases4.py` (section 11 rows 1-5 plus the unchanged ones) and every honest variant below keep their
  revision-4 verdicts.

This adds no `open` audit, so it is consistent with section 10. An `open` audit (`l2/verify_ws_fix.py`) would also catch
the RS3 identity-search case, but it is not needed.

Attribution: curriculum-architect.

### B2. 2.3 suite runner (L1 `poka-yoke-applied`, L2 (c), L3 (b)): the `vars()` snapshot fails honest, green suites

The 2.3 rule as written:
- snapshot `vars()` of every `unittest` module and class;
- `tampered` = every object whose `vars()` changed.

`unittest` writes into its own namespaces during an ordinary run. So honest tests that pass are reported as
`runner tampered`, and the check fails.

Command: `python3.12 -I <r4>/honest/suite_honest.py D` (D = 2.3 text). Each case is the pristine suite plus one honest
`tests/test_honest.py`. Results:

| Honest test (green when run normally) | D result | Cause (`honest/diffkeys.py`) |
|---|---|---|
| `self.assertLogs(...)` / `assertNoLogs` | `runner tampered ['unittest']` | lazy `from ._log import ...` adds `unittest._log` |
| `mock.mock_open(...)` patched over `builtins.open` | `runner tampered ['unittest', 'unittest.mock']` | `mock_open` fills the module globals `file_spec` and `open_spec` on first use |
| a file opened in a test and not closed (`f = open(tempfile.mkstemp()[1], 'w')`) | `runner tampered ['unittest.case']` | the ResourceWarning is attributed to a `unittest/case.py` frame and `warnings` creates `unittest.case.__warningregistry__` (even under the default "ignore" filter) |
| a test method that returns a value | `runner tampered ['unittest.case']` | unittest's own DeprecationWarning, same registry |

Why this blocks:
- The first two are idiomatic. The third is the commonest sloppy-but-green test, and on Python 3.13 an unclosed
  `sqlite3` connection emits the same ResourceWarning. The image interpreter is 3.10-3.13, 12.6 (d).
- An agent asked for tests in L1-L3 writes such tests routinely. The reference fails too if the practice-designer's own
  starter tests use `assertLogs`.
- 2.8 makes "a check failing an honest correct solution" blocking.

Reading "every submodule" literally does not rescue it:
- Importing `unittest._log` fixes only `assertLogs` (variant E).
- Ignoring `__warningregistry__` as well still leaves `mock_open` failing.
- Importing `unittest.__main__` runs `unittest.main` and exits 5 ("NO TESTS RAN"), so "every submodule" must exclude it.

Fix target, 2.3. Name the effect: test code replaced the runner's behaviour. Changed data is not tampering.
- Keep D's imports and snapshot.
- Report as `tampered` a key of a snapshotted namespace whose old or new value is callable or a descriptor (function,
  class, method, property, staticmethod) when it was added, removed or rebound to a different object (`is` compare).
- Do not compare data values. That covers `__warningregistry__`, `file_spec` and `open_spec`, submodule attributes, and
  lists mutated in place such as `_patch._active_patches`.
- Add the honest corpus below to the "Must pass" of every suite-running check, and keep the three tamper probes as
  must-fail.

Verified, variant F (`<r4>/suite/runner4.py F`):
- `python3.12 -I <r4>/honest/suite_honest.py F`: all 18 honest cases `PASS`.
- `python3.12 -I <r4>/suite/cases4.py`: every attack verdict is unchanged from D:
  - `TestResult.addFailure` patched: `tampered ['TestResult']`;
  - `_Outcome.testPartExecutor` patched: `['_Outcome']`;
  - `unittest.TestResult` class replaced: `['unittest']`;
  - root `json.py` forging the record: failed=2;
  - root `unittest/`: red;
  - `os._exit(0)`: no record;
  - expectedFailure and skip: red.

Attribution: curriculum-architect (2.3 is design text; the architect's row 12 ran only `mock.patch`, `MagicMock` and
`IsolatedAsyncioTestCase`).

## Non-blocking

1. **L2 w1 "string containing `builtins`" bans honest prose.** A docstring "do not shadow Python builtins such as sum."
   in `ledger/accounts.py` gives `(w1)`. It is printed in task.md item 4, so the learner can fix it. Still, narrowing to
   strings equal to `builtins` or starting with `builtins.`, `builtins:` or `__builtins__` keeps every row-2 closure.
   (`sys.modules["builtins"]`, `"builtins:exec"`. `f_builtins` is an attribute.) Practice-designer: run the narrowed rule
   on rows 1-2 if adopted.
2. **L3 "no new file or directory": OS and editor files.** `src/invoices/.DS_Store` and `src/invoices/export_json.py~`
   fail (b). The message names the path, so this is acceptable. Either ignore `.DS_Store`, `*~` and `.#*` (none is
   importable), or name them in the message next to `egg-info`.
3. **L3 / L2: `make codegen` on the reference.** `src/invoices/generated/` rides forward from L1. If `make codegen`
   writes any file name the starter lacks, an honest regeneration fails L3 (b). If it emits any w1 form, it fails L2
   w1. Add "reference + `make codegen`" to the must-pass of `deps-gate` and `arch-workspace-clean`.
4. **L1 s4 and the real starter CLAUDE.md.** s4 exempts only the starter's headings. If the lesson-author's starter
   CLAUDE.md gets any untagged non-heading line (an intro sentence), that line counts toward 3 lines of <= 15 words in
   the key solution. Either keep the starter to headings + 12 tagged lines (as L1 describes), or exempt every starter
   line kept verbatim, as with headings.
5. **Harness label.** `arch4/l1/cases.py` still expects `s4` for "strip tags". The design (row 10) says `s3`, and s3 is
   observed. Only the harness label is stale.
6. **`pnpm content:validate`.** Not runnable in this worktree (round-3 NB10). The validate phase runs it.

## Residuals seen (2.8 out of scope, not hunted further)

- After the B1 fix: grabbing `format_cents` and then `del sys.modules["money"]` would hide the module. That is
  `sys.modules` manipulation, the RS6 class.
- A symlink `src/ledger/money.py -> ../invoices/money.py`: the grader's copy dereferences it, so it is graded as the
  allowed copy.
- Runner: a `__code__` swap on a runner function keeps the object identity. It is test code patching the runner at the
  bytecode level, the class of 2.8 bytecode. It errored on `addFailure` (closure) in my probe. Snapshotting
  `(f, f.__code__, f.__defaults__)` for functions would close it cheaply.
- The RS3 identity search and the RS4 `subprocess` still pass, as section 11 row 5 records.

## Honest direction (task item 3), all must pass

- **L1 stage 0, revision 4.** `python3.12 -I <r4>/honest/l1_honest.py`: 14 of 14 `PASS`.
  - Variants: starter heading kept, renamed or removed; a 13-word pointer line; `## Memory` + `## Where the rules went`
    + a summary line (3 untagged lines); R03 wrapped over two lines; R03 with a fenced `make test` block; both memory
    lines reworded shorter; R11 + 8 words; CRLF; `* ` markers and trailing spaces; a 15-word "why" line; R09 deviation
    reworded; `---` + an HTML comment.
  - The 65-word budget: 3 x 15 + 2 x 10 = 65 < 113 normalised moved words (recomputed, `l1/cases.py`); 75 with the R09
    deviation, still below. The arithmetic changes no decision.
- **L2 w1/w2.** `l2/cases_r4.py`, all `PASS` except NB1:
  - reference; `format_cents` copied;
  - `__future__`/`typing`/`TYPE_CHECKING`/`dataclasses`/`functools.lru_cache`/`logging`/`decimal`;
  - repository with `contextlib.closing`, `executemany`, `re.compile`;
  - `/health` without the database; an `if __name__ == "__main__"` block; `ast.literal_eval`;
  - `traceback`, `codecs`, `tracemalloc` (not matched by `trace`/`code`); the string `"executed"`.
- **L3 (b).** `honest/l3_honest.py`: all `PASS`.
  - Reference after importing every module (writes `__pycache__/` at depth); a nested `__pycache__/`; a starter file
    deleted.
  - `egg-info` fails with the named message, as designed. `.DS_Store` and `*~` fail (NB2).
- **Suite runner.** See B2. With F: `subTest`; `setUpClass`/`tearDownClass`/`addClassCleanup`;
  `setUpModule`/`addModuleCleanup`; `tempfile.TemporaryDirectory` + `addCleanup`; an unclosed sqlite3 connection;
  `patch().start()` with `addCleanup(stop)` and without stop; `create_autospec`; `sentinel`; `patch.dict`;
  `patch.multiple`; `PropertyMock`; `AsyncMock` in `IsolatedAsyncioTestCase` with `asyncSetUp`;
  `assertWarns`/`assertLogs`/`assertRaises`; `assertNoLogs`; `enterContext`; `mock_open`; `seal`; class `maxDiff`;
  `skipIf` on an extra test; `load_tests`; doctest via `load_tests`; `catch_warnings`; an unclosed file; a test returning
  a value.

## Re-runs of in-scope attacks (rounds 1-3) on revision 4

- **Round-3 B1** (`python3.12 -I <r4>/l2/cases4.py` and `cases4_fix*.py`):
  - `from builtins import exec as run_source`: w1;
  - `from builtins import compile as c` + `FunctionType`: w1;
  - every row 1-4 form: w1 (`builtins.exec`, `__builtins__['exec']`, `vars(builtins)[...]`,
    `sys.modules['builtins']`, `print.__self__.compile`, `f_builtins`, `code`, `cProfile`, `timeit`, `codeop`,
    `pkgutil.resolve_name`, `type(__loader__)`, `from re import compile`, `import re as r`);
  - `re.compile`: PASS.
- **B1 neighbours** (`l2/cases_r4.py`):
  - `import builtins as b; b.exec`, `getattr(builtins, "exec")`, `importlib.import_module("invoices.money")`,
    `from importlib import import_module as im`, `importlib.util.spec_from_file_location`,
    `__import__("invoices.money")`, `eval(compile(...))`: all w1;
  - `sys.modules["importlib"].import_module("invoices.money")`: w2;
  - `sys.path` in `api.py` + top-level `repository.sqlite3.connect`: w2 (frame rule);
  - the three `sys.path`/`site` forms: PASS (B1).
- **L2 other**:
  - `runpy.run_path`, plain `exec`: w1;
  - `repository.sqlite3.connect`, `ThreadPoolExecutor`: w2;
  - unchecked-hash `__pycache__/report...pyc` (`l2/pyc_case.py`): no record (the copy has no `__pycache__/`).
- **L1** (`python3.12 -I <r4>/l1/cases.py`): every round 1-3 case at its revision-4 verdict:
  - s1 starter;
  - s2: all memory-file and `@` forms;
  - s3: tag every 3 words, the +42-word `[R03]` line, the second `[R03]`, +11 words, strip tags;
  - s4: 4 untagged lines, a 16-word line, a 43-word heading, the 19- and 23-heading splits, 114- and 135-word filler
    lines, the 4th line as a heading;
  - s5: the R04 phrase, R05+R06 verbatim, zero-width;
  - must-passes: PASS.
- **L3** (`python3.12 -I <r4>/l3/cases.py`):
  - starter, allowlist: D1;
  - vendored `.py`, sourceless `.pyc`, `extra.json`, the namespace dir, `egg-info`: (b) new file or directory;
  - try/except: D1; no `sort_keys`: (b);
  - unchecked-hash pyc behind a raising `export_json.py`: (b) `to_json`;
  - `__pycache__` file: PASS; RS6/RS7: PASS (residuals).
- **Suite attacks**: `suite/cases4.py`, 17 cases, D = F verdicts (B2).
- **Arithmetic** (`arith/faillog.py`): blind 3.1477e-9; per-item oracle over 10 submissions 1.0208% (1.7368% at 11).
  The L1 search table is unchanged from round 3 (not re-run; `l1search.py` is identical to `judge-r3`).

## Checked
- Read: `judge-assessment.md`, `judge_mistakes.md`, `_contract.md`, review-3-assessment, design sections 2.3, 2.8, L1, L2,
  L3, 6, 10, 11, 12, 15.
- Runs (all `python3.12 -I` in `<r4>`):
  - `l2/cases4.py`, `l2/cases4_fix.py`, `l2/cases4_fixfile.py`;
  - `l2/cases_r4.py` with `verify_ws.py`, `verify_ws_fix.py` and `verify_ws_fixfile.py`;
  - `l2/pyc_case.py`;
  - `l1/cases.py`, `honest/l1_honest.py`;
  - `l3/cases.py`, `honest/l3_honest.py`;
  - `suite/cases4.py` (D, E, F); `honest/suite_honest.py` D, E, F; `honest/diffkeys.py` on the four D failures;
  - `python3.12 -I -B -c "import unittest.__main__"` (exit 5);
  - `arith/faillog.py`.
- Not run: `pnpm content:validate` (NB6); the L2/L3 linter roots on 20 seeds; L4 `verify_contour.py`; the L5
  enumeration (unchanged mechanisms).

FAIL
