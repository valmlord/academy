# #42 design review, round 5: assessment

Reviewer: judge-assessment. Object: `plans/42-module-agentic-patterns-design.md` revision 5. I read:
- section 15 and section 11.2;
- 2.3 and 2.8;
- the L2 check 2 entry, L2 task.md items 4-5, and the L3 check 2 entry with its item 5;
- section 6 (O2 row and residuals).

Upstream: my round-4 report (B1, B2, NB1-NB6).

Blocking rule for this round (Stepan, 2026-10-30). Block only on:
- (a) a regression introduced by the revision-5 fixes;
- (b) an honest correct solution that a check fails;
- (c) a bypass from the approved in-scope list of 2.8.

Scratch dir:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/judge-r5/`
(`<r5>` below). It is a fresh copy of `arch5/` with every `__pycache__/` removed, plus my files:
- `l2/judge_r5.py`;
- `suite/honest_r5.py`;
- the single probes listed under "Checked".

Interpreter `/opt/homebrew/bin/python3.12 -I` (3.12.13). Python 3.11.14 was used as a second interpreter where noted.

Verdict: PASS. B1 and B2 are closed. No regression, no honest failure and no in-scope bypass found.

## B1 (L2 w2, `sys.path` import of `src/invoices` code): closed

Design text (L2 w2, item 5, section 6 O2) and the prototype `l2/verify_ws.py` agree:
- the rule is "no loaded module has a `__file__` whose `realpath` lies under the copy's `src/invoices/`, whatever name it
  was imported under";
- the implementation compares against `realpath(SRC)/invoices` plus `os.sep`, so a sibling such as `src/invoices_common/`
  is not caught by the prefix;
- `SRC` is the resolved temp copy, so the macOS `/private` prefix cannot split the comparison.

Runs:
- `python3.12 -I l2/cases5.py`: 57 cases, 0 unexpected, matching row 16/18. The three B1 forms give
  `(w2) invoices loaded money`.
- `python3.11 -I l2/cases5.py`: the same, 0 unexpected.
- `python3.12 -I l2/judge_r5.py` (my neighbours), 12 cases, 0 unexpected:
  - Must fail, each gave `(w2) invoices loaded <name>`:
    - `sys.path` + `import repository`;
    - `sys.path` set in `ledger/__init__.py` with the import in `report.py`;
    - `sys.path` set in `accounts.py` with a lazy import inside `entry_lines`;
    - `os.chdir(src/invoices)` + `sys.path.insert(0, '')` + `import money`;
    - a string-concatenated `.../invoices` path;
    - `sys.path` to `src/` + `from invoices.money import` (name rule);
    - `sys.path` into `src/invoices/generated/` + `import invoice_schema`.
  - Must pass, each gave PASS:
    - a new top-level `src/invoices_common/money.py` (prefix boundary);
    - `src/invoicing_shared/` next to `shared`;
    - a `ledger/views/` subpackage;
    - `shared.money` importing `decimal` and a sibling `shared.currency`;
    - `invoices` named in ledger comments and strings.

NB1, the narrowed `builtins` literal, causes no regression:
- the three literal-key probes of row 18 stay w1;
- the round-3/4 B1 forms in the `[c4]` and `[r4]` rows of `cases5.py` keep their verdicts;
- the docstring now passes.

## B2 (2.3 suite runner failing honest suites): closed

Design text (2.3) and `suite/runner5.py` agree:
- `unittest._log` is imported before the snapshot and `unittest.__main__` never is;
- a change is reported as tampering only when an added, removed or rebound key (`is`) has an old or new value that is
  callable or a descriptor;
- data values are never compared.

Runs:
- `python3.12 -I suite/cases5.py`: attacks 17, honest 21, 0 unexpected. The r4 variant fails 7 honest cases and r5
  passes all 21. Row 17 is reproduced.
- `python3.11 -I suite/cases5.py`: the same, 0 unexpected.
- `python3.12 -I suite/honest_r5.py` and `python3.11 -I suite/honest_r5.py`: 20 extra honest suites PASS on both:
  - module-level `TestCase.maxDiff = None`;
  - `patch.object` as a decorator; `patch(..., autospec=True)`;
  - `addTypeEqualityFunc`; `assertRaisesRegex` and `assertWarnsRegex`;
  - `mock.ANY`, `call`, `DEFAULT`, `NonCallableMock`, `Mock(spec=...)`;
  - `patch.stopall` in `tearDown`; `sys.stdout` patched with `StringIO`;
  - `assertLogs()` on the root logger with `logging.basicConfig`;
  - `simplefilter('error')` inside `catch_warnings`;
  - `asyncio.run` in a sync test; `addAsyncCleanup` + `asyncTearDown`;
  - `@unittest.removeHandler`;
  - a skipped extra class; `setUpClass` raising `SkipTest`;
  - two extra test files plus `tests/helpers.py`;
  - a user base `TestCase` with a mixin;
  - `assertCountEqual`, `assertDictEqual`, `assertAlmostEqual`;
  - `patch.dict(os.environ, clear=True)`; `shortDescription`/`id`.
- Tamper neighbours, all fail:
  - `TestCase.run` rebound: `['TestCase']`;
  - `setattr` on `TestResult.addError`/`addFailure`: `['TestResult']`;
  - a never-stopped `patch.object(TestResult, 'addFailure').start()`: `['TestResult']`;
  - `TestCase._callTestMethod` replaced: `['TestCase']`.

## Other revision-5 items, re-run

- L3 (NB2, NB3): `python3.12 -I l3/cases5.py`: 21 cases, 0 unexpected, matching row 20.
  - `.DS_Store`, `*~` and `.swp` fail, and the message names each path and says "delete it".
  - Reference + `make codegen` passes, because `pristine_src5.json` lists the `generated/` files.
  - The honest states keep their verdicts.
- L1 (NB4, NB5, pedagogy NB4):
  - `python3.12 -I l1/cases.py`: 0 unexpected. "Strip tags" now gives s3. The s4 message carries line numbers and word
    counts (`строка 5: 16 слов`).
  - `python3.12 -I honest/l1_honest.py`: 14/14 PASS.
- L4 (accuracy NB1): `python3.12 -I l4/g4_uvtoml.py`: the user-level `uv.toml` `default = true` fails, the root
  `uv.toml` fails, `UV_DEFAULT_INDEX` in `launcher.env` passes. All three as expected.

## Non-blocking for practice-designer (check on the real checks in judge_content)

1. **Suite runner: patch and restore within the run is not seen.** A new form outside the approved list, and not a
   regression: r4 and r5 both pass it.
   - Setup: `tests/test_aa.py` replaces `TestResult.addFailure`/`addError` with no-ops at import, and the last test
     (`tests/test_zz.py`) restores the originals.
   - Result on a red `calc`: without these files the run is red (`failed=2`). With them, both r4 and r5 print PASS,
     because the snapshot is compared only after `suite.run`.
   - The hidden probes still grade behaviour, as 2.3 says (defence in depth).
   - Cheap hardening options:
     - compare the behaviour keys in the bootstrap's own `stopTest` and record `tampered` per test;
     - or count failures with a `TestResult` subclass defined in the bootstrap that binds the original
       `addFailure`/`addError`/`addSubTest` functions captured before discovery;
     - or run the pristine test modules (names from `checks/data/`) in a second run that does not import the learner's
       extra test files.
2. **`unittest.installHandler()` inside a test fails as `runner tampered ['unittest.signals']`.** The cause is the
   callable `_interrupt_handler` instance. This is not idiomatic test code: it changes the runner's Ctrl-C handling, so
   reading it as tampering is defensible. r4 failed it too. Either leave it, or name "do not install signal handlers
   from tests" next to the task.md sentence on replacing `unittest`.
3. **Interpreters.** The honest and attack corpora pass on 3.12.13 and 3.11.14. 3.10 and 3.13 were not available here.
   Add the runner's honest corpus to the image-interpreter re-run already owed in 12.6 (d), before `ready`.
4. **`pnpm content:validate`** still fails here with `spawn ENOENT` (`tsx` is missing because there is no
   `node_modules` in the worktree). This is environmental. The validate phase runs it (round-4 NB6).

## Residuals seen (2.8 out of scope, not hunted further)

None new beyond section 6. The `__code__` swap goes red in r5 (row 17), and that matches my reading.

## Checked

- Read:
  - `judge-assessment.md`, `judge_mistakes.md`, `_contract.md`;
  - review-4-assessment;
  - design sections 2.3, 2.8, L2 check 2 with items 4-5, L3 check 2 with item 5, 6, 11.2, 15;
  - the diffs `l2/verify_ws_r4.py` -> `verify_ws.py` and `suite/runner4_judge.py` -> `runner5.py`.
- Runs in `<r5>`:
  - `python3.12 -I`: `l2/cases5.py`, `suite/cases5.py`, `l3/cases5.py`, `l1/cases.py`, `honest/l1_honest.py`,
    `l4/g4_uvtoml.py`; all exit 0 with 0 unexpected;
  - `python3.11 -I`: `suite/cases5.py`, `l2/cases5.py` (0 unexpected);
  - my files: `l2/judge_r5.py` (12 cases), `suite/honest_r5.py` on 3.12 and 3.11 (24 cases each);
  - single probes: the patch-and-restore runner probe (r4 and r5) and `installHandler` (r5).
- `pnpm content:validate`: ran, environment failure (NB4).
- Not run: the L2/L3 linter roots on 20 seeds, the full L4 `verify_contour.py`, the L5 enumeration. These mechanisms did
  not change in revision 5.

PASS
