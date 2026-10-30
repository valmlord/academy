# #42 judge_content round 4: pedagogy

Judge: judge-pedagogy. Module `course/ai-for-developers/02-agentic-patterns/`, worktree
`content-42-agentic-patterns-887a63`. Blocking rule for round 4 (Stepan, 2026-10-30): block only on (a) regressions
introduced by the fixes since round 3, including learner-facing wording that became wrong or confusing, (b) an honest
correct solution that a check fails, (c) an in-scope bypass from the design 2.8 list.
Verdict: **PASS**. Round-3 B1 is closed. I found no blocking regression. Three non-blocking notes are below.

## What I read
- Loaded: `.claude/feedback/judge_mistakes.md`, my round-3 report, the change log
  `plans/42-module-agentic-patterns-demo-A.md:257-292` (sections "judge_content round 3 (pedagogy B1)" and
  "(assessment D1)"), and the round-3 accuracy note on the L1 item 10 wording (`content-review-3-accuracy.md:91-94`).
- L2: `task.md` in full; `checks/verify_workspace.py:236-378` (`suite_problems`, `planted_violations`,
  `never_executed`, `finding_text`, `normalise_path`, `make_problems`); `checks/root_render.py` in full (padding
  pool, line arithmetic); `checks/data/arch_roots.json:1-492` (`a1-forms`, `a2-forms`, `a3-forms`, `files[0]`
  chunks); the reference file list (`src/shared/money.py` exists; `src/invoices/money.py` is a shim).
- Demo driver `<pd-a>/demo_l2_b1.py` and its outputs `out_l2_b1_312.txt`, `out_l2_b1_311.txt`.
- L1: `task.md:20-152` (items 7-10, "Как проверяется"); `checks/verify_pokayoke.py:20-45, 225-306, 347-376`
  (`STATIC_TEST_FILES`, `pristine_test_problems`, `suite_problems`, `main`).
- L4: `task.md:62-87` and `theory.md:96-116` (the admin-required clause).
- `lesson.yaml` `timeoutSec` in L1-L4 and the schema limit (`packages/lesson-schema/src/schema.ts:43`, max 1800).

## B1 (round 3): closed
- **By construction.** `never_executed` (`verify_workspace.py:272-284`) puts every planted chunk in one of three
  blocks: an uncalled `def _planted_<hex>() -> None:` ending in `return None`, `if <alias of typing.TYPE_CHECKING>:`, or
  `if False:`. Neither block executes on import, so no planted import is resolved at runtime. Whatever the solution
  moved or deleted (`src/invoices/money.py` included), the suite on a planted copy sees the same behaviour as on the
  project. The only added runtime statement is `from typing import TYPE_CHECKING as _planted_<hex>`, which cannot fail.
- **Syntax hazards checked.** Wrapping would break parsing for `from __future__`, `import *`, `global` and `nonlocal`.
  Of these, only `from __future__` appears, in `a1-forms` `files[1]`, and `planted_violations` draws only `files[0]`.
  None of the 20 drawn chunks has any of them. The padding pool (`root_render._padding_line`) gives blank lines,
  comments, a one-line docstring and assignments, all valid inside an indented block. The backslash and parenthesised
  chunks stay valid when indented.
- **Line arithmetic.** `planted.append(... content.count("\n") + 1 + len(header) + line)` matches the layout
  `content + "\n" + header + "\n" + body`. I checked it for both an existing file ending in a newline and a new empty
  file. The header has one line for `def` and `if False:`, and two for the TYPE_CHECKING form.
- **Demo record.** `demo_l2_b1.py` builds exactly the round-3 scenario: `src/invoices/money.py` deleted, imports
  rewritten to `shared.money`, a new `tests/test_report.py` that imports `ledger.accounts` (the A1 plant target) and
  `ledger.report`, and the reference Makefile (`check`: tests, then the linter). It passed 30/30 runs on 3.12.13 and
  30/30 on 3.11.14. The reference passed 20/20, and the A2 fallback target (`service.py` renamed) passed 10/10. Since D1,
  every form is planted on every run, so each of the 30 runs covered all 20 forms.

## Regression review of the round-3 fixes
- **L2 item 8: text against code, both ways.** Each line below is a claim in the text and what the code does.
  - "все формы ... десять для A1, по пять для A2 и A3": the filter `findings == [rule]` over `files[0]` gives 10, 5 and 5.
    I counted the chunks in `arch_roots.json:11-100, 244-288, 377-420`.
  - "порядок и пустые строки меняются": the code calls `rng.shuffle` and uses per-chunk padding.
  - Target modules: the three named modules, with a fallback to another module of the same package. The fallback never
    picks `repository.py` for A2 or `export_csv.py` for A3, where the rule does not apply.
  - The three wrapper kinds: as listed in `never_executed`.
  - "ненулевой код и строка вашего линтера про каждое нарушение (правило, путь, строка, текст, Fix)": this is the
    `silent` and `absent` lists, against the learner's own `scripts/check_architecture.py` on the same copy.
  - Each copy holds a single rule. The A1 forms contain no `legacy_format` or `sqlite3` import, so no second-rule line
    can appear.
  - The code checks nothing that the text leaves unsaid. The new-file case is the only one the text omits, and only a
    project with no other module in the package reaches it.
- **An honest linter written to the rules passes every planted copy.** `task.md:41-43` already requires every import
  "в любом месте файла: внутри функции, под условием, под `if TYPE_CHECKING:`". So `if False:` and the aliased
  TYPE_CHECKING header need nothing new. Target ordering does not matter: with `check: test lint` the suite stays green
  and the linter runs, and with `check: lint test` the linter fails first and its output is there.
- **Clarity of the long item 8.** The paragraph (`task.md:153-165`) runs in order: what is planted, where, how it is
  wrapped, why the tests are unaffected, what counts, and so what `check` must do. The last sentence states the action
  in one line. The learner's work is unchanged: a three-line `check` target. A learner can act on it.
- **Messages.** Both new messages are in Russian. Each names the copy, the module, the rule, the missing count and the
  first `path:line`, and the `absent` message says "цель check должна запускать линтер". On a correct linter, neither
  message fires spuriously.
- **Time.** L2 stays at 85 min. A correct linter is already required by items 1-2. Item 8 adds only reading time for
  the longer paragraph, which fits inside the 3 min line and the 10 min of polishing. Module totals are unchanged.
- **Timeouts.** L1 `poka-yoke-applied` is now 150 s against a child budget of 110 s. L2 `arch-workspace-clean` is now
  360 s against 291 s. Both are under the schema maximum of 1800. The learner-facing "Как проверяется" quotes only the
  per-run limits, which are unchanged, so no text went stale.
- **L4 admin-required clause** (`theory.md:111-115`). It agrees with the task's constraint (`task.md:81-82`, empty in
  every settings file) and with the user-settings exception (`task.md:72-73`). The admin-required case needs managed
  settings or `--settings`, which the exercise does not use, so it hands the learner no shortcut. Accuracy is the
  accuracy judge's call.
- **Threat model.** No changed text promises detection of RS1-RS8. D1 plants every form, so the grep forgers fail
  (change log: 0/40 for both).

## Non-blocking
- **N1. L1 `task.md:126-127` against `verify_pokayoke.py:37, 275-287`.** The sentence "Правка, пропуск или удаление
  стартового теста в `tests/test_statement.py` или `tests/test_api.py` ничего не меняют" is still untrue for one case:
  deleting or renaming a starter test in `test_statement.py`. `STATIC_TEST_FILES` includes `test_statement`, so stage 0
  reports "стартовых тестов нет под своими именами". The same item's first sentence also requires those tests "на
  месте", so the item contradicts itself. This is not a regression: the round-3 sentence was general and wrong in the
  same case, so the fix narrowed the error but did not create it. No honest solution deletes a starter test, and the
  stage-0 message is clear. Exact wording: "Правка или пропуск стартового теста в `tests/test_statement.py`, а также
  любая правка `tests/test_api.py`, ничего не меняют: в прогонах эти файлы берутся из копий проверки (удалённый или
  переименованный стартовый тест в `test_late_fee.py` или `test_statement.py` останавливает этап 0)". The other
  option is to drop `test_statement` from `STATIC_TEST_FILES`. (lesson-author / practice-designer)
- **N2. L2 `silent` message** (`verify_workspace.py:372-373`). The `path:line` it names is in the grader's planted
  copy, which the learner never sees. It cannot fire on a linter that `arch-linter` passes, so in practice it repeats
  an `arch-linter` failure. Adding "сначала добейтесь прохождения `arch-linter`" would make it actionable on its own.
- **N3. L4 `theory.md:111-114`.** The admin-required sentence nests two conditions ("если `false` задан ... (если
  managed settings не ставят `true`)"), and line 114 is longer than the file's wrap width. Splitting it into two
  sentences would read more easily. The meaning is correct.
- Carried from round 3 and now resolved: the list of forms says "и другие", and the count is stated. L1 item 10 now
  names `test_api.py`.

PASS
