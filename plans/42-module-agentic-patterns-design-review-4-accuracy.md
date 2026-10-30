# #42 judge_design round 4: accuracy

Reviewed: `plans/42-module-agentic-patterns-design.md` revision 4. I read sections 15 and 14, 2.3 (suite runner), 2.8,
L1 s2, L2 theory, w1, w2, the must-fail list and Готово items 4-5, the L4 brief, G4, G6, N4, the demo matrix, section 6,
section 11 rows 1-15 and 12.9 V13/V15. I re-fetched the primary sources on 2026-10-30. I checked 2.8 against the threat
model of record byte for byte in content: it is unchanged and still matches Stepan's lists.

PASS. No false fact that a lesson would teach or a check would grade. All seven of my round-3 non-blocking items landed
correctly. NB7 is still owed by the content-researcher and is recorded as owed. The non-blocking items below go to the
practice-designer and the lesson-author, and judge_content checks them.

## Round-3 NB1-NB7: where they landed
1. G6 and Glob/Grep. The G6 cell (line 634) says "file tools where present" and gives the reason. V15 (902-904) quotes
   tools-reference verbatim. Re-fetched: "On macOS, Linux, and WSL, Claude Code leaves Glob and Grep out of the default
   tool set, and Claude searches with `find` and `grep` through the Bash tool instead". Correct.
2. One `compile` rule. w1 (412, 415-416) and item 4 (458) state the same rule: the bare name is banned whatever binds
   it, and the attribute is allowed only on the receiver `re`. Row 4 covers `from re import compile`, `import re as r`
   and `re.compile` passing. Correct.
3. N4 effective value. The N4 cell (639) uses the order local, then project, then user. The matrix (660-662) and row 14
   cover both directions. This matches hooks.md, re-fetched: "Claude Code reads the value left after settings precedence
   applies, so a `"disableAllHooks": false` in a project's `.claude/settings.json` overrides a `true` in your user
   settings". Correct.
4. G4.
   - (a) The brief (612-613) excludes project files, and `[[tool.uv.index]] default = true` is a must-fail (632, 660).
     concepts/indexes, re-fetched: "To exclude PyPI from the list of indexes, set `default = true` on another index
     entry". Correct. See N1 for the user-level `uv.toml`.
   - (b) `name=` is allowed only on `UV_INDEX` (632; row 15). concepts/indexes: on the command line or in an env
     variable, "use its URL, a configured name, or the `<name>=<url>` syntax". The CLI reference for
     `--extra-index-url`/`UV_EXTRA_INDEX_URL` says "(Deprecated: use `--index` instead) Extra URLs of package indexes"
     and does not mention `name=url`. Correct.
5. L2 item 5 (460-461) uses the call-stack wording. Correct. See N3 for line 420.
6. L1 s2 (277-278): the lesson presents the `@` rule as the exercise's rule, never as Claude Code behaviour. Correct.
7. Research corrections: 12 item 6 still records them as owed. Research line 52 still reads "positive form". The lesson
   must cite V10, V14 and Jain's article. judge_content checks this.

## Revision-4 claims verified
- w1 providers and names. These are standard CPython behaviour on 3.10-3.13, and each claim matches it:
  - The `builtins` module exposes `exec`, `eval`, `compile` and `__import__`.
  - `__builtins__` is the builtins dict in an imported module and the module itself in `__main__`, so
    `__builtins__["exec"]` works in `src/` modules.
  - `print.__self__` is the `builtins` module, because a builtin function's `__self__` is its module.
  - `__loader__` and `__spec__.loader` give a loader. `type(__loader__)(name, path)` is a `SourceFileLoader`. Its
    `load_module()` (deprecated but present through 3.13) or its `get_code()` plus `types.FunctionType` runs a file
    with no import statement.
  - Through their finders, `sys.meta_path`, `sys.path_hooks` and `sys.path_importer_cache` yield `find_spec` and a
    loader, which is the same route.
  - Banning all of these closes literal-name routes only. Strings built at run time stay RS3, as 2.8 says.
- The stdlib modules listed:
  - These execute source directly: `code` (`InteractiveInterpreter.runsource`), `cProfile`/`profile` (`run`,
    `runctx`), `pdb.run`, `bdb.Bdb.run`, `timeit.Timer(stmt)`, `doctest` (runs docstring examples), `trace.Trace.runctx`
    and `ctypes` (`pythonapi.PyRun_SimpleString`).
  - `pickle.loads` resolves any `module.name` global, which imports it without an import statement.
  - `zipimport`, `pkgutil.resolve_name` and `runpy` import or run code.
  - `codeop` and `marshal` produce code objects, which `types.FunctionType` runs.
  - `py_compile` and `compileall` only write `.pyc` files. Banning them is harmless, but they are not executors (N2).
- The L2 theory (365-367) names only `builtins`, `code` and `cProfile` as examples. That is accurate.
- Suite runner (2.3; rows 11-12). I checked CPython `Lib/unittest/__init__.py` (3.13):
  - `IsolatedAsyncioTestCase` is lazy: `def __getattr__(name): if name == 'IsolatedAsyncioTestCase': global
    IsolatedAsyncioTestCase; from .async_case import IsolatedAsyncioTestCase`. The first access therefore rebinds a name
    in `vars(unittest)`, so touching it before the snapshot is required. Row 12's `['unittest']` without the touch
    matches this.
  - `__init__` does not import `unittest.mock`, so importing it first is required too, because importing a submodule
    binds it on the package.
  - `Lib/unittest/case.py` (3.10, 3.12) has `class _Outcome` with `def testPartExecutor(self, test_case,
    isTest=False)`, a context manager, so it is a real patch target. Correct.
- The brief's "project files (`pyproject.toml`, `uv.toml`)": configuration-files says "a `pyproject.toml` or `uv.toml`
  file in the current directory, or in the nearest parent directory" for the project level. Correct as far as it goes;
  see N1.
- `UV_EXTRA_INDEX_URL` is deprecated in favour of `UV_INDEX` (V13). The CLI reference, re-fetched, reads "(Deprecated:
  use `--index` instead)". Correct.

## Non-blocking (practice-designer, lesson-author; judge_content checks)
1. User-level `uv.toml` (L4 brief, G4). configuration-files: "User-level: `~/.config/uv/uv.toml`" and "System-level:
   `/etc/uv/uv.toml`". These apply outside the repository, so "project files ... do not count" leaves them open. The
   general rule ("wherever the documentation says it takes effect") lets a learner argue for a
   `home/.config/uv/uv.toml` with `[[index]] ... default = true`, which the check does not read.
   - It can't be reached from the starter: `home/` holds only `.claude/settings.json`, and task text lists the four
     files read. That is why it isn't blocking.
   - Fix: the brief line reads "uv config files (`pyproject.toml`, `uv.toml`, at project, user or system level) do not
     count: the team's machines get uv settings only from `launcher.env`".
   - Add `home/.config/uv/uv.toml` with `default = true` as the only index change to the demo matrix as must fail.
2. w1 heading "the stdlib executors" (408). `py_compile` and `compileall` only compile to `.pyc`, and `codeop` and
   `marshal` only yield code objects. The lesson text must not say each listed module runs code. Say "modules that run or
   compile source, or load code objects". Item 4's framing ("`src/` runs no code without importing it: no import of
   ...") is a rule, not a per-module claim, and is fine.
3. w2 line 420, "(another thread, a callback)". A callback called synchronously from `src/` code (for example `map` in
   `api.py`) still has the `api.py` frame, so it is caught as opened elsewhere by the innermost-frame rule. It is not
   caught because no `src/` frame is on the stack. The lesson-author copies item 5's wording (460-461), not line 420.
4. Suite bootstrap, "every submodule" (2.3, line 64). `Lib/unittest/case.py` 3.12 has `assertLogs` and `assertNoLogs`
   doing `from ._log import _AssertLogsContext` lazily ("# Lazy import to avoid importing logging if it is not
   needed."). An honest test using `self.assertLogs` therefore binds `_log` on the package after the snapshot, and the
   run would report `tampered ['unittest']`. Two fixes in the bootstrap:
   - Import `unittest._log` explicitly before the snapshot, and add an honest `assertLogs` test to the must-pass set.
   - Never import `unittest.__main__`: it calls `main(module=None)` at import time. "Every submodule" is safe only as
     "every submodule except `__main__`".
   The starter tests use neither (grep over `course/`), so the starter and the reference are not affected. That is why
   it isn't blocking.
5. NB7 of round 3: research (c) at line 52 is still "positive form". This is still owed by the content-researcher
   (12 item 6).

## Checked
- docs.astral.sh/uv/concepts/configuration-files: project, user and system discovery, precedence, `uv.toml` without
  the `[tool.uv]` prefix, `--no-config`.
- docs.astral.sh/uv/concepts/indexes: `[[tool.uv.index]]`, `default = true`, `<name>=<url>` for the CLI and env
  variables, `--extra-index-url` description.
- docs.astral.sh/uv/reference/cli: `--index`, `--default-index`, `--extra-index-url`, `--index-url` with env names and
  deprecation notes.
- code.claude.com/docs/en/tools-reference: Glob section (line 304 of the fetched page), Glob/Grep restore cases.
- code.claude.com/docs/en/hooks: "Disable or remove hooks" (effective value, project `false` over user `true`,
  `--settings`, managed hierarchy), "Hook entries merge across settings levels".
- CPython source: `Lib/unittest/__init__.py` (3.13) lazy `__getattr__`; `Lib/unittest/case.py` (3.10) `_Outcome` and
  `testPartExecutor`; `Lib/unittest/case.py` (3.12) lazy `._log` imports; `Lib/unittest/__main__.py` (3.12).
- Python reference semantics as known for 3.10-3.13: `builtins`, `__builtins__` dict vs module, `print.__self__`,
  `SourceFileLoader.load_module`/`get_code`, `meta_path`/`path_hooks`/`path_importer_cache` finders, and the stdlib
  module entry points listed above.
- Repo: `course/` grep for `assertLogs`, `IsolatedAsyncio`, `unittest.mock` (none); research line 52.
- Section 15 against sections 2.3, L1, L2, L4, 6 and 11 rows 1-15: every listed change is present at the cited place.
  2.8 is unchanged.

PASS
