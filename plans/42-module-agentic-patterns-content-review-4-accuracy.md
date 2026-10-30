# #42 judge_content round 4: accuracy

Verdict: FAIL, 2 issues, both under (d): a factual error in text changed since round 3. No regression in check
behaviour, no honest solution failed, no new in-scope bypass found.

Round 4 blocking rule (Stepan, 2026-10-30): block only on (a) regressions from the fixes since round 3, (b) an honest
correct solution failed by a check, (c) an in-scope bypass from the approved list, (d) a factual error in text added or
changed since round 3.

## Blocking

1. [L1 01-code-over-rules/task.md:126-127] "Правка, пропуск или удаление стартового теста в `tests/test_statement.py`
   или `tests/test_api.py` ничего не меняют: эти файлы всегда берутся из копий проверки." That is false for deleting
   or renaming a starter test in `tests/test_statement.py`. `verify_pokayoke.py:37` has
   `STATIC_TEST_FILES = ("test_late_fee", "test_statement")`, and `pristine_test_problems` (275-287) checks the
   workspace's `tests/test_statement.py` for `StatementLineTest.test_invoice_within_grace_has_no_fee`
   (`checks/data/pristine_tests.json:15`). If that test is missing, stage 0 prints
   "пункт 10: стартовых тестов нет под своими именами: tests.test_statement...." and the check stops. The same task says
   so itself at :147-148 ("статический этап 0 ...: ... имена стартовых тестов") and at :119-120 ("на месте под своим
   именем"). The sentence is true for `tests/test_api.py`, which stage 0 does not inspect, and for edits to a test body
   or skips in `test_statement.py`, since all three runs use the grader's copy of that file.
   Fix, either way: (i) the text says "Правка тела или пропуск стартового теста в `tests/test_statement.py` и любая
   правка `tests/test_api.py` на прогоны не влияют: эти файлы берутся из копий проверки. Удаление или переименование
   стартового теста в `tests/test_late_fee.py` или `tests/test_statement.py` отмечает этап 0."; or (ii) drop
   `test_statement` from `STATIC_TEST_FILES` so the current sentence becomes true (then :119-120 still needs to say that
   only `test_late_fee.py` is checked by name). Attribution: practice-designer.

2. [L2 02-architecture-checks/task.md:153-156] "В копию дописываются все формы нарушения этого правила из скрытых
   проектов пункта 1 ... (для A1 десять форм, для A2 и A3 по пять ...)". The code plants fewer than that.
   `planted_violations` (250-269) takes the single-finding chunks of `files[0]` of `a1-forms`, `a2-forms` and
   `a3-forms` only. The hidden roots of item 1 hold more single-finding forms for each rule
   (`checks/data/arch_roots.json`):
   - A1: `import invoices.late_fee` in `src/ledger/%m2%/%m3%.py`, so 11 in `a1-forms`;
   - A2: `from sqlite3 import dbapi2 as db` in `src/%m2%.py`, plus plain `import sqlite3` in
     `src/invoices/repository_helpers.py` and `src/ledger/repository.py`, so 8;
   - A3: the two-dot `from ..legacy_format import money_str`, `from .. import legacy_format` in a subpackage
     `__init__.py`, and `src/invoices/%m2%/export_csv.py`, so 8.

   The counts 10/5/5 match the code, but "все формы ... из скрытых проектов" does not. Fix: "В копию дописываются
   формы нарушения этого правила из скрытых проектов пункта 1, для A1 десять, для A2 и A3 по пять, каждая отдельным
   блоком (среди них ...)". You can also plant every single-finding chunk from every file of the template, but then the
   target-path logic must handle the subpackage-relative forms. Attribution: practice-designer.

## Changed since round 3, checked and correct

**L2 item 8 vs `verify_workspace.py` (read in full) and `root_render.py`.**
- Counts: single-finding chunks in `files[0]`: A1 10 (`arch_roots.json:11-100`), A2 5 (244-288), A3 5 (377-421).
  These are the numbers in the text.
- Every form in the text's list is present among those chunks: parenthesised multi-line (A1, A3), after `;` (A1),
  backslash continuation (A2), relative (A3), in a function (A1, A2), `if TYPE_CHECKING:` (A1).
- "Их порядок ... меняются при каждом запуске": `rng.shuffle(chunks)` with a `secrets` seed. Padding is drawn per
  render. See non-blocking 2.
- Targets and fallback: `PLANT_TARGETS` are the three modules the text names. When a target is missing, the code uses
  the first other `*.py` of the same package, skipping `__init__.py` and the rule's allowed file (`repository.py` for
  A2, `export_csv.py` for A3), and otherwise a new file. The text "другого модуля того же пакета" holds. The excluded
  files and the new-file case are not mentioned (non-blocking 3).
- Wrappers (`never_executed`, 272-284): an uncalled `def _planted_<hex>() -> None:` (with `return None` appended),
  `from typing import TYPE_CHECKING as _planted_<hex>` plus `if _planted_<hex>:`, or `if False:`. The text names all
  three. The alias import is the only executed line, and it binds a fresh name.
- Every planted chunk compiles inside each wrapper:
  - no single-finding chunk is the `future` chunk, which carries no finding;
  - nested `def` and `if TYPE_CHECKING:`, a backslash continuation and a parenthesised import all stay valid under
    4-space indentation;
  - blank lines become empty lines, and every `if` body is non-empty.
- Line arithmetic (351): the content ends in `\n`, then one blank line, then `len(header)` lines, then the body. So
  body line k sits at `count("\n") + 1 + len(header) + k`. Indentation keeps the line count, and the rendered
  `expected` line already includes the leading padding. Correct.
- Counting rule (363-377): the copy needs a non-zero exit, and for every planted (path, line) both the learner's
  linter output and make's stdout+stderr must give the same (message, Fix) through `FINDING`. That matches "строка
  вашего линтера про каждое дописанное нарушение (правило, путь, строка, тот же текст и `Fix:`)".
- Honest solutions: no planted code runs on import, so nothing an honest solution moves or deletes (for example
  `src/invoices/money.py`) can turn a test red on the planted copies. The text's claim "ваши тесты на такой копии ведут
  себя так же" holds for tests that import and run code (see non-blocking 1). This matches demo A's 30/30 for the
  correct workspace with `money.py` deleted, 20/20 for the reference and 10/10 for the A2 fallback.
- Budget: 20 + 2x30 + 7x25 + 3x12 = 291 s. `lesson.yaml:52` `timeoutSec: 360` gives 69 s of margin.

**L1 item 10 vs `verify_pokayoke.suite_problems` (290-306).** Run 1 uses the pristine copies without
`tests.test_late_fee.` ids. Run 2 uses the learner's `test_late_fee.py` with only `__init__.py` and `fixtures/`
(`with_test_modules=False`). Run 3 uses the workspace tests with the pristine overlay. The text matches all three
runs. `test_api.py` is now named. The issue is the restricted sentence, blocking item 1. Timing: probe 20 + 3x30 =
110 s; `lesson.yaml:46` `timeoutSec: 150`.

**L4 theory.md:111-114 vs https://code.claude.com/docs/en/sandboxing (fetched 2026-10-30).**
- Source: "The sandbox is admin-required while ... `allowUnsandboxedCommands` set to `false` in managed settings, or
  with the `--settings` flag unless managed settings set it to `true`". The lesson's "в managed settings или через
  `--settings` (если managed settings не ставят `true`)" attaches the condition to the `--settings` branch, as the
  source does.
- Source: "It ignores these settings in a repository's `.claude/settings.json` and `.claude/settings.local.json`:
  `excludedCommands` ... Every entry". This matches "игнорирует `excludedCommands` из файлов репозитория".
- Source: "the settings in the table still apply from `~/.claude/settings.json` or `--settings`". This matches
  "записи из `~/.claude/settings.json` действуют и тогда".
- Source: "A `false` in your user settings doesn't make the sandbox admin-required". This is consistent with the user
  `false` exception being absent from the clause.
- "по требованию администратора (admin-required)" resolves round-3 note 1.
- The clause is correct.

## Non-blocking

1. [L2 task.md:160-161] "Поэтому ваши тесты на такой копии ведут себя так же, как на вашем проекте" is false for a test
   that reads source, for example one that runs the learner's linter on `src/` and expects no findings. On a planted
   copy that test goes red, `check: test lint` stops before the linter, and item 8 fails. Nothing in the module
   suggests such a test, and item 8 states that the linter line is required, so I do not count this under (b). The
   behaviour predates round 3; only the sentence is new. Suggested: "ваши тесты, которые импортируют и вызывают код,
   ведут себя так же".
2. [L2 task.md:156-157] "пустые строки между ними": the padding is blank lines, comments, one-line docstrings and
   assignments (`root_render._padding_line`), and the wrapper kind is drawn too.
3. [L2 task.md:158-159] The fallback skips `__init__.py` and the rule's allowed file, and when no module is left it
   creates a new file. The text does not say so.
4. [L4 theory.md:111-114] The source adds "Requires Claude Code v2.1.285 or later" (v2.1.282-284 also ignored repository
   `excludedCommands`). The paragraph gives no version, while the neighbouring sentences do (:99, :101).

## Not done

There was no shell in this run, so no check was executed. I read the code and walked the templates by hand. The demo
results come from the change log in plans/42-module-agentic-patterns-demo-A.md and were not reproduced. Reserve
quizzes and unchanged lessons (L3, L5) were not re-read.

FAIL
