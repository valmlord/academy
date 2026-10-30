# #42 judge_content round 4b: accuracy re-check

Verdict: PASS. Both rewritten sentences now say what the check code does. No regression found.

Scope (Stepan, 2026-10-30, "Да, только точность"): only the two sentences failed in round 4. Block only on (a) a
regression from the fixes, (d) a factual error in the changed text.

## 1. L1 01-code-over-rules/task.md item 10 (lines 119-132)

Read `checks/verify_pokayoke.py` in full and `checks/grader_runtime.py` (`copy_workspace`, `overlay_pristine_tests`,
`replace_tests`, `run_suite`). Listed `checks/data/pristine_tests/` and read `checks/data/pristine_tests.json`.

- `checks/data/pristine_tests/` holds `__init__.py`, `fixtures/invoices.json`, `test_api.py` and `test_statement.py`.
  It has no `test_late_fee.py`.
- Run 1 (`replace_tests`, defaults) deletes `tests/` and writes only the pristine files. Run 2
  (`keep=("test_late_fee.py",), with_test_modules=False`) keeps only the support files plus the learner's
  `test_late_fee.py`. Run 3 (`overlay_pristine_tests`) copies the pristine `test_api.py` and `test_statement.py` over the
  workspace files. So in every run `test_statement.py` and `test_api.py` are the grader's copies. A body edit, a skip
  decorator, or any edit or deletion of `test_api.py` cannot reach a run. "Правка тела или пропуск стартового теста в
  `tests/test_statement.py` и любая правка `tests/test_api.py` на прогоны не влияют: эти файлы берутся из копий проверки"
  is true.
- Stage 0, `pristine_test_problems` (275-287): for every id whose module is in `STATIC_TEST_FILES = ("test_late_fee",
  "test_statement")` (line 37), it looks for a top-level `ClassDef` with that name and a `FunctionDef` with that method
  name in the workspace's `tests/<module>.py`. A missing, renamed or re-classed test, or a deleted file, adds "пункт 10:
  стартовых тестов нет под своими именами: ...", and `main` stops before running code (356-360). It only checks names,
  so a skip in `test_statement.py` passes stage 0, which is consistent with the sentence before it. "А удаление или
  переименование стартового теста в `tests/test_late_fee.py` или `tests/test_statement.py` проваливает пункт 10:
  проверка ищет их имена в ваших файлах" is true. For `test_late_fee.py`, run 2 also fails it through `run_suite`'s
  missing-ids check.
- The rewritten text now agrees with "Как проверяется" :149-150 ("статический этап 0 ...: ... имена стартовых тестов").
- Regression: `verify_pokayoke.py` keeps the same constants and line positions that round 4 cited (37, 275-287,
  290-306). The fix changed the text only.

## 2. L2 02-architecture-checks/task.md item 8 (lines 153-157)

Read `checks/verify_workspace.py` 240-384 (`planted_violations`, `never_executed`, `make_problems`),
`checks/root_render.py` in full, and the `a1-forms`, `a2-forms` and `a3-forms` templates in `checks/data/arch_roots.json`
(lines 1-300 and 370-492).

- Counts: `planted_violations` keeps the chunks of `files[0]` whose findings are exactly `[rule]`. I recounted them:
  - A1 has 10 (`arch_roots.json` 11-100);
  - A2 has 5 (244-288);
  - A3 has 5 (377-421).
  "десять форм нарушения A1 (для A2 и A3 по пять)" is true.
- "из тех, что встречаются в скрытых проектах пункта 1": these chunks are a subset of the hidden roots. `verify_arch.py:122`
  renders the same `arch_roots.json` for `arch-linter`, which covers items 1-2 (task.md :170). The wording no longer
  claims "все формы", so the extra forms in other files of those templates (round-4 item 2) no longer contradict it.
- The listed forms are all among the planted chunks:
  - in parentheses over several lines: A1 :57 and A3 :414;
  - after `;`: A1 :93;
  - with a line continuation: A2 :281;
  - relative: A3 :378 and :387;
  - inside a function: A1 :66 and A2 :272;
  - under `if TYPE_CHECKING:`: A1 :75.
- "Их порядок, пустые строки и другой код между ними меняются при каждом запуске":
  - `rng.shuffle(chunks)` uses `random.Random(secrets.randbits(64))`.
  - Each plant is rendered as a one-chunk template. `render` adds 0-3 padding lines drawn from blank lines, comments, a
    docstring and assignments (`_padding_line`).
  - The wrapper header is drawn per plant (`never_executed`).
  So order, blank lines and the code between the blocks are all drawn anew each run. The text is true.
- Regression: `planted_violations` (250-269), `never_executed` (272-284) and the line arithmetic (351) are where
  round 4 read them. The fix changed the text only.

## Non-blocking

1. [L1 task.md:119-120] "Каждый стартовый тест `tests/test_late_fee.py`, `tests/test_statement.py` и `tests/test_api.py`
   на месте под своим именем" is phrased as a requirement for `test_api.py` too. Lines 126-127 then say correctly that
   no edit to `test_api.py` matters, and stage 0 does not inspect it. This is not false, but a reader may think the
   `test_api.py` names are checked. Possible change: name only `test_late_fee.py` and `test_statement.py` in the "на месте
   под своим именем" clause.
2. Round-4 non-blocking notes 1 and 3 on L2 (tests that read source; the fallback skips `__init__.py` and the allowed
   file, or creates a new file) still apply, unchanged.

## Not done

This run had no shell, so the checks were not executed with python3.12. All conclusions come from reading the code and
data files listed above and from counting the template chunks by hand.

PASS
