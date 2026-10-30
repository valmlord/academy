# #42 judge_design round 5: accuracy

Reviewed: `plans/42-module-agentic-patterns-design.md` revision 5. I read sections 15, 11.2, 2.3, 2.8, L1 (starter bullet,
s4, items 4-5, must-pass), L2 (theory, w1, w2, must-fail/must-pass, Готово items 4-5), L3 check 2 (b) and item 5, the L4
brief, G4 and the demo matrix, section 6 (O2 row and residuals) and section 13. I read the six revision-5 harness outputs
in `arch5/` (`l2/cases5.out`, `suite/cases5.out`, `l3/cases5.out`, `l1/cases5.out`, `l4/g4_uvtoml.out`; row 18 is in
`l2/cases5.out`) and the real 00 L6 `scripts/codegen.py`. I could not re-run the harnesses: this role has no shell. The
verdicts below rest on the saved outputs, which match the rows of 11.2 case for case, all with "unexpected 0".

Blocking rule of round 5 applied: (a) regressions from the revision-5 fixes, (b) an honest correct solution that fails,
(c) an approved in-scope bypass, (d) a factual error in a claim that revision 5 added or changed. None found.

2.8 is unchanged and still matches the threat model of record.

## Round-4 non-blocking items: where they landed
1. NB1, user-level `uv.toml`. The brief (line 668) now reads "uv config files (`pyproject.toml`, `uv.toml`, at project,
   user or system level) do not count". G4 (688) names `[[index]] default = true` in a project, user
   (`home/.config/uv/uv.toml`) or system `uv.toml` as failing, which is the right table name, since `uv.toml` has no
   `[tool.uv]` prefix. The demo matrix has the revision-5 addition (719), and the count is now 103 (98 + 4 + 1). Row 19
   output: fail, fail, pass. Correct.
2. NB2, w1 wording. The L2 theory (389-390), w1 (434-437) and the section 6 O2 row now say "modules that run or compile
   source, or load code objects". w1 also says which modules only compile (`py_compile`, `compileall`) and which only
   yield code objects (`codeop`, `marshal`). Correct.
3. NB3, the callback. w2 (455-457) uses the call-stack wording and adds "a callback called from `src/` code still has that
   `src/` frame and is judged by it". Item 5 matches. Correct.
4. NB4, the suite bootstrap. 2.3 (64-67) imports `_log` before the snapshot and never imports `unittest.__main__`, and
   the reason it gives is true: `__main__.py` calls `main(module=None)` at import time, and that exits. The honest corpus
   has `assertLogs` alone and `assertNoLogs` alone. Both fail on r4 (`tampered ['unittest']`) and pass on r5. Correct.
5. NB5, research line 52. It still reads "positive form". This is still owed by the content-researcher (12 item 6), and
   judge_content checks it.

## Facts that revision 5 added or changed

### 2.3 runner
- `mock_open` lazily fills the module globals `file_spec` and `open_spec`.
- `_patch._active_patches` is a class-level list.
- `__warningregistry__` is created through `warn()`'s `setdefault` even when the filter ignores the warning.
- Since 3.11, a test method that returns a value gets a DeprecationWarning from `unittest.case`.
- These are all data, so "data values are never compared" is both needed and sufficient for the honest corpus (r4 failed
  7 of 21, r5 passes 21/21).
- Comparing callables and descriptors by identity still flags the attack probes:
  - `addFailure` patched: `TestResult`
  - `testPartExecutor` patched: `_Outcome`
  - `unittest.TestResult` rebound: `unittest`
- The `__code__` swap really does keep the object's identity.
- Correct.

### L2 w1
- Matching "by whole dotted components" passes `traceback`, `codecs` and the first-party `from . import profile`. It does
  that only because relative imports resolve to `ledger.profile`, which is what w1 says ("`m` or below").
- The narrowed literal rule still closes every form listed in 442-443:
  - `sys.modules["builtins"]`
  - `globals()["__builtins__"]`
  - `"builtins:exec"`
  - `f_builtins["exec"]` (through `"exec"`)
  - `operator.attrgetter(...)(sys.modules["builtins"])` (row 18)
- It now passes the prose docstring.
- No r4 must-fail case changed verdict: all 57 cases, 0 unexpected.

### L2 w2
- `sys.path.insert`/`append` and `site.addsitedir` all put `src/invoices` on `sys.path`, so `money` loads under a
  top-level name with a `__file__` under `src/invoices/`. Using `realpath` matches the copy's resolved temp root.
- The reference (`src/shared/money.py`, re-exported) and `format_cents` copied into ledger still pass.
- Correct.

### L3 (b)
- The real codegen (`shutil.rmtree` then `mkdir`) writes exactly `__init__.py` and `invoice_schema.py`, so "the same two
  file names" is true.
- The editor artefacts named are accurate:
  - Emacs backups `*~`
  - Emacs lock files `.#*`
  - Vim swap files `.<name>.swp`
  - macOS `.DS_Store`
- Row 20 output names each path. The reference + `make codegen` passes on r5.

### L1 s4
- The word and code-fence line definitions match the harness: `##` counts as a word, as row 21's "12 слов" for a 10-word
  heading shows.
- The fenced `[R03]` + `make test` case passes in the honest run (14/14).

## Non-blocking for practice-designer (judge_content checks them on the real checks)
1. Interpreter version in the honest suite corpus.
   - `enterContext` exists only from 3.11. A test returning a value warns only from 3.11.
   - If the image interpreter turns out to be 3.10 (12 item 6 (d) is still owed), the `enterContext` must-pass case
     errors and the demo goes red for a reason that has nothing to do with the learner.
   - Gate that case on `sys.version_info >= (3, 11)`, or replace it with `addCleanup` on 3.10.
2. L2 item 4's parenthesis (499-500), "each of these runs or compiles source, or loads code or objects that can run code,
   handed to it as text, bytecode or serialised data".
   - `importlib`, `pkgutil` and `zipimport` import modules by a name or path given at run time, not code "handed as
     text".
   - The lesson-author should add "or imports a module by a name or path given at run time". This is precision, not a
     false rule: the rule itself is unaffected.
3. The section 6 suite-runner residual (817-819) says a `__code__` swap "errors and the run is red anyway". That is what
   the prototype's swap did.
   - It is not true of every swap. A replacement code object with the same free-variable count (`addFailure` is the
     `failfast` wrapper, which has one) turns `addFailure` into a no-op that keeps its identity. Failures then go
     uncounted, and on r5 the suite part would pass.
   - It also passed on r4: r4's `['_FailedTest']` came from the erroring swap, not from the swap itself. So it is not a
     regression, and the hidden probes still grade behaviour. It stays a recorded residual (bytecode-level patching, out
     of scope).
   - The wording should say "the prototype's swap errored; a well-formed swap passes the suite part and is left to the
     mentor and the hidden probes", so that nobody reads "red anyway" as a guarantee.
4. The research correction NB5 (line 52 "positive form") is still owed by the content-researcher.

## Checked
- Design revision 5: sections 0, 2.3, 2.8, L1 230-375, L2 377-517, L3 552-625, L4 660-724, 6, 11.2, 12, 13, 15.
- `arch5/` outputs: `l2/cases5.out` (57 cases), `suite/cases5.out` (17 attacks, 21 honest), `l3/cases5.out` (21),
  `l1/cases5.out` (36 lines), `l4/g4_uvtoml.out` (3). Not re-executed (no shell in this role).
- `course/ai-for-developers/00-introduction/06-permissions-security/starter/scripts/codegen.py`: the output file set.
- Research line 52.
- CPython 3.10-3.13 semantics:
  - `Lib/unittest/__main__.py` calls `main(module=None)` at import.
  - `Lib/unittest/mock.py`: the `file_spec`/`open_spec` globals and `_patch._active_patches`.
  - `warnings.warn` uses `setdefault` on the registry.
  - `case.py` warns when a test returns a value (3.11+). `enterContext` is 3.11+.
  - Function `__code__` assignment keeps identity and requires a matching free-variable count.
  - `site.addsitedir` and `sys.path` semantics.
- uv configuration-files levels (project, `~/.config/uv/uv.toml`, `/etc/uv/uv.toml`; `uv.toml` without `[tool.uv]`),
  fetched in round 4 on 2026-10-30 and unchanged in what revision 5 cites.

PASS
