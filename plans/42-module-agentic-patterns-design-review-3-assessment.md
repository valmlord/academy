# #42 design review, round 3: assessment

Reviewer: judge-assessment. Object: `plans/42-module-agentic-patterns-design.md` revision 3 (2.3, 2.8, L1-L3 check
entries, 6, 10, 11, 12.2, 15). Threat model judged against: design 2.8 = Stepan's decision of 2026-10-30.

The architect's `arch3/` prototypes and my `judge-r1/`, `judge-r2/` harnesses were lost with the scratchpad, so I
rebuilt minimal verifiers from the revision-3 text alone. Scratch dir:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/judge-r3/`.
Layout:
- `l1/verify_stage0.py` (s1-s5 and the key; `IMPORT_TOKEN` copied verbatim from module 01 `verify_skills.py:119`) and
  `l1/cases.py`;
- `l2/verify_ws.py` (w1 AST and w2 audit-hook probe) on a minimal reference project `l2/ref/`, with `l2/cases.py`;
- `l3/verify_b.py` (part (b): pristine D1 sets, pristine file list, `to_json` probe) and `l3/cases.py`;
- `suite/runner.py` (the 2.3 bootstrap: pipe, nonce, `-I -B`, `env` scrubbed, new session) and `suite/cases.py`;
- `arith/l1search.py` (exact optimal search) and `arith/faillog.py`.

Interpreter `/opt/homebrew/bin/python3.12` (3.12.13). Every case runs on a fresh `mktemp -d` copy under `python3.12 -I`.

Verdict: FAIL, 1 blocking item. Everything else that rounds 1 and 2 raised is closed, or is recorded as a residual
that matches 2.8. The arithmetic is exact.

## Blocking

### B1. L2 `arch-workspace-clean` (w1): plain `exec` under an import alias passes w1 and w2
Rule in the design: "no name `__import__`, `exec`, `eval`, `compile`". A faithful AST implementation checks `ast.Name`
nodes. That rule does not see `from builtins import exec as run_source`. The binding is an `ast.alias`, and every call
site then uses the name `run_source`.

Reproduction (`l2/cases.py`). `src/ledger/report.py` with the starter `money.py`:

```python
from builtins import exec as run_source
import os
_P = os.path.join(os.path.dirname(__file__), '..', 'invoices', 'money.py')
ns = {}
run_source(open(_P).read(), ns)
format_cents = ns['format_cents']
```

Results:
- The case above gives `PASS`. (a) finds no import of `invoices`. w1 finds no banned name, attribute or module. w2
  sees no `invoices` module in `sys.modules`, and (b) gives the expected output.
- `from builtins import compile as c` + `types.FunctionType` gives `PASS` the same way.

This is the listed must-fail `exec(open(".../invoices/money.py").read(), ns)` with a literal `exec`. It is neither
built from a string (RS3) nor a `runpy` trick (RS4). That makes it the in-scope class "plain `exec` ... with literal
names" (2.8).

Fix target, design L2 check 2 (w1), task.md item 4 and section 6:
- w1 also bans any import of the module `builtins` (`import builtins`, `from builtins import ...`) and the name
  `__builtins__` anywhere in `src/`. Honest code needs neither. As a side effect this closes the RS3 forms
  `vars(builtins)["ex" + "ec"]` and `__builtins__["exec"]` at no cost.
- Add `from builtins import exec as run_source` to "Must fail" (w1).

Verified: `l2/verify_ws.py --ban-builtins`. The alias, the `compile` alias, `builtins.exec`, `__builtins__['exec']`,
`vars(builtins)['ex'+'ec']` and `builtins.compile` all fail w1. Reference, `re.compile` in `accounts.py` and
`format_cents` copied into ledger all PASS.

Attribution: curriculum-architect (design author). Lesson appended to `.claude/feedback/curriculum-architect_mistakes.md`.

## Non-blocking (practice-designer, when writing the scripts; the architect may fold them into revision 4)

1. **2.3 suite runner: the text names only `unittest` as pre-imported.** A literal implementation does this: `import
   unittest`, then extend `sys.path`, then `import json` to write the record. With that order a root `json.py` that
   rewrites `failed` forges the record. Result: `broken + root json.py forging the record` -> `PASS` (variant A).
   Importing `json` before `sys.path` changes defeats it (variants B and C: `тесты красные`). The attack needs the
   record format, so it is class (iv), not blocking. Write it this way anyway: "the bootstrap imports every module it
   uses (`unittest`, `json`, `os`, `sys`) before it extends `sys.path`".
2. **2.3 suite runner: test code can patch the runner.** A new `tests/test_zz.py` that sets
   `unittest.TestResult.addFailure = lambda *a: None` gives `PASS` on a red suite (variants A and B). It is generic and
   needs no grader knowledge. It is not blocking because the hidden probes cover the graded behaviour of L1, L2 and L3:
   a solution with wrong behaviour still fails. The suite is defence in depth, as in round-2 N3.
   - Cheap closure, verified (variant C): snapshot `vars()` of `TestResult`, `TestCase`, `TestSuite` and `TestLoader`
     before discovery, and fail when any of them differs after the run. Result: `runner tampered ['TestResult']`. The
     other 12 cases are unchanged.
   - Otherwise, name it as a residual in 2.8.
3. **L1 s5 must say "the word stream of the whole file".** "appears in CLAUDE.md" can be built per line. A per-line s5
   lets the verbatim moved texts through as 5-word `##` headings: `NEW2 normalised moved words as 5-word headings` ->
   `PASS` with `--s5-per-line`, and `s5` on the whole-file stream. Headings are exempt from s4, so the per-line reading
   leaves verbatim retention unbounded.
   - Write: "the words of the whole file, across line breaks, headings and list markers included".
   - Add the heading form to "Must fail".
4. **L1 12.2 / section 6 residual bound is stated too tightly.**
   - s4 bounds the number of untagged lines, not their length.
   - Headings (`#` lines) are not counted at all.
   - So one untagged line, or one heading, can carry a paraphrase of all ten moved rules (`NEW heading paraphrase of
     all ten` -> PASS). It can also carry their verbatim text with a filler word every 5 words (`NEW2 ... filler every
     5, one untagged line` -> PASS).
   - The must-fail "one `[R03]` line paraphrasing all ten moved rules (s3 +10 words)" is therefore only a form: drop
     the tag and the same line passes.
   - Not blocking: paraphrase is the declared residual, and I accepted "3 untagged lines" without a length bound in
     round 2.
   - Either state the bound honestly ("3 untagged lines of any length plus any number of headings"), or make it real.
     Cap each untagged line at about 15 words, and count every heading except the starter's own toward s4. Then the
     budget (about 45 + 20 words) cannot hold the moved texts (about 120 words).
5. **L1 stage-0 order vs the must-fail labels.** "tags stripped but all 12 texts kept (s4)" (also section 11 row 1)
   reports s3 when s3 runs before s4: the tag set `{}` is not `{R03, R11}`. Run: `strip tags` ->
   `stage0 s3: tags [] != memory ['R03', 'R11']`. Relabel it, or run s4 before s3.
6. **L2 other stdlib executors.**
   - `code.InteractiveInterpreter(ns).runsource(text, path, "exec")` and `cProfile.runctx(text, ns, ns)` in
     `report.py` give `PASS` on w1 and w2. `profile`, `bdb`/`pdb`, `timeit`, `doctest` and `trace` do the same.
   - They are not in 2.8's in-scope list. They are the same class as RS4 ("runpy"), but RS4 names only `runpy`.
   - Either add these modules to w1's import ban (one tuple, the same "cheap measure" logic as `runpy`), or widen RS4
     to "runpy or any other stdlib executor", so that the mentor knows to look.
7. **L3: "no new file" does not see a new directory.** An empty `src/invoices/fastjsonx/` (a namespace package) plus
   `from . import fastjsonx; fastjsonx.dumps = json.dumps` in `export_json.py` gives `PASS`. The faking code lives in an
   existing module, so this is RS7. "no new file or directory" costs nothing.
8. **`__pycache__` exception and bytecode (RS5).** An unchecked-hash `src/invoices/__pycache__/export_json.cpython-312.pyc`
   runs instead of a visible `export_json.py` that raises (`-B` does not stop reading). Result: `PASS`. This is RS5,
   out of scope. A zero-cost measure: the grader copies the workspace without `__pycache__/` before any learner-code
   subprocess. It removes the bytecode class in L1, L2 and L3 and makes the L3 exception moot.
9. **L3 honest-failure note.** `pip install -e .` creates `src/*.egg-info/`, which fails (b). The message names the
   file, so this is acceptable. Mention it in the "no new file" message or the task.md item 5 wording.
10. **`pnpm content:validate`** is still not runnable in this worktree (`tsx` spawn ENOENT, no `node_modules` in
    `packages/lesson-schema`). `02-agentic-patterns/` holds only `module.yaml`. The validate phase runs it.

## Threat model and residuals (2.8)
- RS1-RS8 and (iii)/(iv) match Stepan's out-of-scope list item by item:
  - invisible characters = RS1;
  - homoglyphs = RS2;
  - names built from strings = RS3;
  - `runpy` beyond the plain import = RS4;
  - bytecode = RS5 (worded for L3 only; NB8 shows it applies wherever learner code runs);
  - `sys.modules` aliasing = RS6;
  - planted code faking a dependency = RS7;
  - SessionStart/output-style injection = RS8;
  - grader/mount reading = (iii)/(iv).
- No in-scope class is filed as a residual. Missing from the list: NB2 (runner patching) and NB6 (other stdlib
  executors). Neither is in scope.
- In-scope classes, each with a rule and a probe I ran:
  - starter;
  - near misses;
  - edited tests (pristine names, hidden grids);
  - hardcoding (hidden roots and grids, not re-run);
  - `# noqa` (grader's own rules);
  - exit-0 and stub (`os._exit(0)` leaves no record);
  - `unittest/` shadow (root and `src/`);
  - `usercustomize` and `sitecustomize` (`-I`);
  - plain `importlib`, `__import__`, `exec`, `eval` (w1/w2, except B1);
  - new stub file of any extension;
  - special-casing (hidden data).
- Round-1 and round-2 in-scope attacks, all covered:
  - r2 B1(a) `**Rules:**@`, `<!-- -->@`, the unbalanced backtick and the code span: s2;
  - r2 B1(b) tag every 3 words: s3; paraphrase on an `[R03]` line: s3 (NB4); second `[R03]` line: s3;
  - r2 B2 `runpy`: w1; plain `exec`: w1;
  - r2 B3 `.pyc`: (b) new file;
  - r1 B2 forms: s2/s3/s4; r1 B3 `importlib`/`__import__`: w1/w2; r1 B4 vendored `.py`: (b);
  - r2 N3 expected failure: runner; N4 `re.compile`: PASS; N5 thread: w2.
- Zero-width, homoglyph, string-built `exec`, the `sys.modules` alias and the class stub are RS1/RS2/RS3/RS6/RS7, as
  2.8 records them.

## Checked (every run, Python 3.12.13)
- `pnpm content:validate`: fails to start, `tsx` ENOENT (NB10).
- `l1/cases.py` (whole-file s5), with result:
  - starter: s1;
  - key: PASS; key + R09 `memory`: PASS;
  - untouched CLAUDE.md: s3;
  - R08 `check` + R07 `code`: "не пройдено";
  - strip: s3 (NB5);
  - `CLAUDE.local.md`, `.claude/CLAUDE.md`, `.claude/rules/a.md`: s2;
  - imports `@docs/rules.md`, `**Rules:**@...`, `<!-- rules -->@...`, `` `@docs/rules.md` ``, `@` after an
    unbalanced backtick: s2;
  - e-mail line: PASS;
  - tag every 3 words: s3 (33 lines);
  - `[R03]` paraphrasing ten: s3 (+42 words); second `[R03]`: s3;
  - 4 untagged: s4;
  - R04 phrase: s5; R05+R06 verbatim untagged: s5;
  - one paraphrased untagged line: PASS; R03 +9 words: PASS; R03 +11 words: s3;
  - heading paraphrase of ten: PASS (NB4);
  - verbatim 5-word headings: s5 (per-line s5: PASS, NB3);
  - verbatim + filler every 5 in one untagged line: PASS (NB4);
  - zero-width in an untagged line: s5 (my word split treats U+200B as a separator; RS1 anyway).
- `l2/cases.py`, default (Name-only w1):
  - reference: PASS;
  - starter A1: w2;
  - `runpy.run_path`: w1; `exec(open().read())`: w1; `builtins.exec`: w1;
  - **`from builtins import exec as run_source`: PASS (B1)**; `from builtins import compile as c`: PASS (B1);
  - `code.InteractiveInterpreter`: PASS; `cProfile.runctx`: PASS (NB6);
  - `__builtins__['exec']`: PASS; `vars(builtins)['ex'+'ec']`: PASS (RS3);
  - `__builtins__['__import__']('invoices.money')`: w2;
  - `repository.sqlite3.connect` in api: w2 `invoices/api.py`; `repository.sqlite3.Connection` in api: w2;
  - `ThreadPoolExecutor` and `threading.Thread`: w2 `<no src frame>`;
  - `pkgutil.resolve_name('sqlite3')`: w2;
  - `re.compile` in accounts: PASS; `builtins.compile`: w1;
  - `format_cents` copied into ledger: PASS.
- `--alias-is-name`: both aliases w1. `--ban-builtins`: all `builtins` forms w1, every must-pass PASS, the rest
  unchanged.
- `l3/cases.py`:
  - reference: PASS;
  - starter: D1;
  - workspace allowlist + `src/fastjsonx.py` + `import fastjsonx`: D1 (pristine sets);
  - `src/invoices/fastjsonx.py` + `from . import`: (b) new file;
  - sourceless `.pyc`: (b) new file; `extra.json`: (b) new file;
  - try/except fallback: D1;
  - no `sort_keys`: (b) `to_json`;
  - `__pycache__` file: PASS;
  - empty namespace dir + attribute: PASS (NB7);
  - unchecked-hash pyc in `__pycache__`: PASS (NB8, RS5);
  - `sys.modules` alias: PASS (RS6); class stub in `money.py`: PASS (RS7).
- `suite/cases.py`, variants A (literal), B (pre-import `json`), C (B + snapshot). Same result in A, B and C:
  - reference: PASS;
  - broken: failed=2;
  - broken + `expectedFailure`: failed=2;
  - green test marked `expectedFailure`: failed=1 (unexpected success);
  - skipped: fail (skipped);
  - renamed: fail (missing);
  - broken + root `unittest/` printing OK: failed=2; reference + root `unittest/`: PASS;
  - broken + `src/unittest/`: failed=2;
  - `os._exit(0)`: no record;
  - broken + root `sitecustomize.py`/`usercustomize.py`: failed=2.

  Where the variants differ:
  - broken + root `json.py` forging: A PASS, B and C fail (NB1);
  - broken + `tests/test_zz.py` patching `TestResult`: A and B PASS, C `runner tampered` (NB2).
- `arith/l1search.py`, exact optimal adaptive search, cap 3, first guess fixed by symmetry. Matches the design table:
  - sure of 10: binary 21/25 = 84.0%, count 84.0%;
  - sure of 9: binary 39/125 = 31.2%, count 59/125 = 47.2%;
  - sure of 8: binary 51/625 = 8.2%, count 24/125 = 19.2%.
  - The count figure for sure of 8 (19.2%) exceeds Stepan's 15% threshold, so binary feedback stays.
- `arith/faillog.py`, keys (2,2,1,2,2,1,1,3)/36, >= 7 of 8:
  - blind: 3.1477e-9 per submission;
  - per-item oracle without replacement over 10 submissions: 1.0208%. Matches the design.
  - The cap of 10 counted failures allows 10 submissions in total, not 11. With 11 the bound would be 1.737%.
- Timeouts against 2.3's rule:
  - L1 `poka-yoke` 80 < 120;
  - L2 `arch-linter` 96 < 120; `arch-workspace-clean` 245 < 300;
  - L3 `deps-gate` 125 < 150.
- Not re-run (no prototypes left, no new mechanism): the L2/L3 linter roots on 20 seeds (rows 10-12, 17), the L4
  `verify_contour.py` cases (row 24), the L5 enumeration (row 26).

FAIL
