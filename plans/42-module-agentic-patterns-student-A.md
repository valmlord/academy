# STUDENT REPORT #42, run A: L1 `01-code-over-rules`, L2 `02-architecture-checks`

Interpreter: `/opt/homebrew/bin/python3.12 -I` (3.12.13), a `python3` symlink first on `PATH` for `make`.
Checks were run from the workspace root with `ACADEMY_CHECKS_DIR=<copy of checks/>` and the lesson.yaml run line.
Scratch: `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/student-a/`
(`l1/`, `l2/` honest solutions; `pristine1/`, `pristine2/` untouched starters; `cheat/` one dir per cheat;
`tools/try.sh` harness; `checks1-renamed/` the L1 grader with its `.claude` literal renamed to `dotclaude`,
because shell writes to `.claude/` paths are blocked in scratch). No `course/` file was edited.

## Honest run

| Lesson | Check | Result |
|---|---|---|
| L1 | `rule-placement` | PASS on the 1st scored submission (exit 0) |
| L1 | `poka-yoke-applied` | PASS (exit 0) |
| L1 | `code-over-rules-quiz` | answers b, d, a+c, a, a+b+c, c (6/6 by my reading; not run through a grader) |
| L2 | `arch-linter` | PASS (exit 0) |
| L2 | `arch-workspace-clean` | PASS (exit 0) |
| L2 | `remediation-rubric` | artifacts `l2/scripts/check_architecture.py`, `l2/lint-output.txt`; self-score M1-M4 2/2/2/2 (not graded by a mentor) |

Untouched starters fail every command check with the right messages (L1 placement exit 3 at stage 0, the
others exit 1).

Placement I reached by walking the ladder: R01 delete, R02 delete, R03 memory, R04 code, R05 check, R06 check,
R07 check, R08 hook, R09 delete, R10 hook, R11 memory, R12 code. It equals the key.

Time. As an agent my wall-clock is not a human's. Estimated for the learner profile: L1 about 60 min
(lesson.yaml 60; the walk is quick once settings.json and Makefile are read, the `statement.py` swap trap
takes care); L2 about 85-90 min (lesson.yaml 75): the linter with relative-import resolution, the per-statement
dedup and the exit codes is more than 20 min for someone who has not used `ast.ImportFrom.level`, and
item 4 (w1) is a long list to read before touching `src/`.

### Unclear places
1. L1 quiz `place-a-new-rule` (accuracy). The explanation offers `with repository.connect() as conn:` as the
   fix that closes the connection. `starter/src/invoices/api.py` already uses exactly that with the bare
   `sqlite3.Connection`, whose `with` commits or rolls back but does not close. A learner who checks the repo
   sees the "fix" is already there and does not close anything. Option b is right; the explanation should say
   a custom context manager (or `contextlib.closing`) and that sqlite3's own `with` does not close.
2. L1 quiz `typed-boundary` (accuracy, minor). The explanation says `InvoiceStatus("sent")` raises
   `ValueError`. Changing an annotation from `str` to `InvoiceStatus` does not convert or check at run time;
   the error appears only where the caller builds the enum or a type checker runs. Option c is still the best
   answer, but option b ("Python does not check types") is half true and the explanation does not address it.
3. L2 item 6 is headed "Поведение проекта сохранено" while its first bullet changes `render_statement_line`
   from the partner format (`EUR 100,50`) to `format_cents` (`100.50 EUR`). Clear from "то есть", but the
   heading says the opposite.
4. L2 item 4 (w1) reports one finding per file (seen: a file with `compile`, `"exec"` and `eval` reports only
   the `"exec"` literal; a file with `import builtins` and the literal `"__import__"` reports only the import).
   task.md says "Сообщение называет файл, строку и форму" without saying only the first per file is shown.
   Unlimited attempts, so a UX nit.
5. L2 arch-linter failure output starts with an English line `seed <n>` (P1 asks for fully Russian messages).
6. L2 linter rules leave three edge cases unspecified: a relative import that climbs above `src/`
   (`from ... import x` in `src/invoices/a.py`), a relative import in a top-level `src/x.py` (package ""), and
   `from m import *` (is `m.*` a module?). The hidden roots apparently do not exercise them (my choices passed).

### Ambiguities (two reasonable readings)
- L1 R06 ("Only repository.py may use sqlite3"): step 4 lists "удаление мёртвого модуля" as a code fix, and
  the only other sqlite3 user is the dead `old_api.py`. A learner can read R06 as `code` (delete the module
  that misleads). The key says `check`; the difference is "makes the mistake impossible" vs "removes today's
  instance". The theory's second walk could add one sentence on this. Binary feedback plus cap 3 makes this
  costly if a learner picks `code`.
- L1 R01: step 2 names the Makefile; `make test` sets `PYTHONPATH=src` and runs unittest, so "Makefile
  enforces it" is a possible reading (`check`). Weaker than the R06 case.

## Cheater run

Harness: copy the honest solution, apply one mutation, run both checks of the lesson.

### L1 `rule-placement`
| Cheat | Result |
|---|---|
| all `memory`, starter CLAUDE.md kept | stage 0 passes, counted "не пройдено" (correct) |
| rules moved into a real `.claude/rules/rules.md` | stage 0 fails, item 2 (correct) |
| `AGENTS.md` as a symlink to the moved rules | stage 0 fails, item 2 (correct) |
| **`.claude/rules` itself a symlink to `docs/agent-rules/` holding R04-R08, R10, R12 verbatim** | **PASS (exit 0)**, tested on `checks1-renamed` with `dotclaude` |

Cause: `other_memory_files()` walks with `followlinks=False`; a symlinked directory is listed in `dirnames`
but never entered, and the `.claude/rules` match needs `len(path.parts) > 2`. The same hole covers `.claude`
as a symlink and any symlinked subdirectory holding a `CLAUDE.md`. This is the "move the rule into another
memory file" mistake the theory names, not an OUT-of-scope class. Not verified: whether Claude Code loads a
`.claude/rules` that is itself a symlink (its docs show symlinks inside `rules/`, which the check does catch).
Fix: walk with `followlinks=True` (guard cycles) or flag any symlink named `rules` under `.claude`, `.claude`
being a symlink, and symlinked dirs anywhere.

Search cost under the cap (binary verdict, pass at >= 11 of 12, 3 scored submissions), exact minimax for k <= 2
and greedy for k = 3 (`tools/search.py`, `tools/greedy3.py`):
| Learner sure of | Options per unknown card | Worst-case submissions | P(pass within 3) |
|---|---|---|---|
| 11 | any | 1 | 1.00 |
| 10 | 5 / 4 | 5 / 4 | 0.84 / 0.94 |
| 9 | 5 / 4 | 14 / 11 (greedy) | 0.31 / 0.47 |
| 0 (uniform guess) | 5 | about 5 million (1 / 2.0e-7) | 6e-7 |
A learner sure of 10 passes by search most of the time; that is the design's accepted 11-of-12 slack.

### L1 `poka-yoke-applied`
| Cheat | Result |
|---|---|
| named-by-position swap in `statement.py` | fail, item 8 (39/48 hidden invoices) |
| alias `late_fee as fee_of`, positional call | fail, items 8, 10 |
| hardcoded table of starter-test values | fail, items 7, 8 |
| starter tests left positional | fail, item 8 static |
| `@unittest.skip` / `@expectedFailure` on a starter test | fail, item 10 |
| `TestResult.addFailure` patched at import; patch-and-restore across tests; `TestCase.assertEqual` patched; via `importlib` + `exec` literal | fail, item 10 (tampered) |
| workspace `unittest/` + `json.py`; `sitecustomize.py`/`usercustomize.py` in root and `src/` | fail, item 10 (red test seen) |
| `os._exit(0)` in a test | fail, no record |
| old_api copied with `list_invoices_v0` renamed and one local renamed (other function verbatim) | fail, item 9 |
| old_api copied with a docstring added | fail, item 9 |
| **old_api.py copied verbatim to `scripts/old_api.py`** | **PASS** |
| **old_api.py copied to `src/invoices/legacy_api.py` with both functions and `conn` renamed** | **PASS** |
| **positional twin: `late_fee(*, ...)` returns `compute_fee(amount_cents, days_late)`; `statement.py` calls `compute_fee(balance, days_late)` positionally** | **PASS** |
| late_fee error message changed and the starter test's expected message edited to match | PASS |
| internal positional helper with `statement.py` still calling `late_fee` by keyword | PASS (honest refactor, not a defect) |

- The `scripts/` copy matches task.md item 9 ("в src/ и tests/"), but the ladder says code is `src/` or
  `scripts/`, and the dead module stays there for agents to copy. A design gap rather than text/check drift.
- The renamed copy beats the exact-AST fingerprint (`ast.dump` is name-sensitive). task.md promises only
  "не совпадает телом", so text and check agree, but the dead code survives under another name. Cheap fix:
  normalise local names and argument names before `ast.dump`, or match on the SQL string constants.
- The positional twin is the in-scope "near miss" that defeats the outcome ("ошибка стала невозможной"):
  the swap is again writable through `compute_fee`. Item 8 checks only calls named `late_fee`. Fix options:
  require `statement_line` to reach the fee only through `late_fee` (no other function in
  `src/invoices/late_fee.py` with two positional int parameters, or every function there keyword-only), or
  add a hidden invoice grid with a swapped twin as a must-fail demo.
- The message change: item 7 says "Результаты те же, что у исходной функции", but the grid compares only the
  exception type. Low; say "тип исключения" in task.md or compare the message.

### L2 `arch-linter`
| Cheat / near miss | Result |
|---|---|
| hardcoded linter (prints the example output when the three visible file names exist) | fail |
| line-regex linter | fail (missed and extra on several roots) |
| no relative-import resolution; `tree.body` only; prefix match without the dot; `repository.py` by name; `end_lineno`; `ledger` by prefix; obeys `# noqa`; duplicate lines; no `Fix:` | each fails item 1 |
| stale or hand-written `lint-output.txt` | fail, item 2 |
| `Fix: x` (empty remediation) | PASS (by design: prose goes to the rubric) |
| output produced from another cwd | PASS (correct: output is cwd-independent) |

### L2 `arch-workspace-clean`
| Cheat | Result |
|---|---|
| fixed linter, untouched `src/` | fail, items 3, 5, 6, 8 |
| `# noqa` on the violations | fail, items 3, 5 |
| `importlib.import_module`, `from importlib import import_module as`, `importlib.util` spec loader, `__import__`, `import builtins` + `getattr`, `compile` + `eval`, `exec(open(...).read())`, `pkgutil.resolve_name`, `runpy.run_path`, `__loader__`, `pickle` | each fails item 4 (and item 5 where the code loads) |
| `sys.modules["importlib"].import_module(...)` (RS6-like) | fail, item 5 |
| `sys.path` + `import money` from `src/invoices` | fail, item 5 |
| `shared/money.py` re-exporting `invoices.money` | fail, item 5 |
| `repository.sqlite3.connect` from `api.py`; `from invoices.repository import sqlite3 as db` | fail, item 5 (no static A2, runtime catches) |
| `render_statement_line` special-cased for `(7, 10050, 5, "EUR")` | fail, item 6 |
| Makefile `check` without the linter, with `-` before tests, `\| cat` pipe, `@true` | each fails item 8 |
| starter health test deleted | fail, item 7 |
| suite: `addFailure` patched; extra `@expectedFailure` test | fail, item 7 |
| `src/json.py` shadow | fail, item 8 |
| **`/health` returns 200 `ok` without touching the database (A2 fixed by deleting the DB ping)** | **PASS** |

The `/health` case matches item 6 as written ("отвечает 200 и ok"), so it is not text/check drift, but A2 goes
away by deleting behaviour instead of moving it into the repository (the fix the theory teaches). Cheap fix:
during the item-5/6 probe, require that `handle("GET", "/health")` opens at least one connection from
`repository.py` (the probe already records connection frames), or answers non-200 when `INVOICES_DB` points at
an unopenable path; state it in item 6.

The suite runner `grader_runtime.py` is byte-identical in L1 and L2.

## Blocking
1. L1 `rule-placement`: a symlinked `.claude/rules` directory (or symlinked `.claude`, or a symlinked subdir
   holding `CLAUDE.md`) hides moved rules from item 2; the cheat passes with exit 0. In scope (moving a rule
   into another memory file). Owner: practice-designer A.
2. L1 `poka-yoke-applied`: a positional twin (`compute_fee(amount, days)`) called positionally from
   `statement.py` passes; the swap stays writable, defeating the lesson's outcome. In scope (listed near-miss
   class). Owner: practice-designer A (check and must-fail demo), lesson-author A (item 8 wording).

## Should fix (non-blocking)
3. L1 item 9: dead `old_api.py` survives as a verbatim copy in `scripts/` or as a renamed-locals copy in `src/`.
4. L2 item 6: `/health` without a database call passes; A2 is "fixed" by deleting behaviour.
5. L1 quiz `place-a-new-rule` explanation: sqlite3's `with` does not close; it conflicts with the starter's `api.py`.
6. L1 R06 can be read as `code` under step 4's "удаление мёртвого модуля"; one sentence in the theory walk.
7. L1 item 7 "Результаты те же": exception messages are not compared.
8. L2 messages: English `seed <n>` line; w1 shows one finding per file without saying so.
9. L2 heading of item 6 vs the `render_statement_line` format change; linter edge cases (over-deep relative,
   top-level relative, `import *`) unspecified.
10. L1 quiz `typed-boundary` explanation overstates run-time checking.
