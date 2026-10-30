# #42 judge_content round 3: pedagogy

Judge: judge-pedagogy. Module `course/ai-for-developers/02-agentic-patterns/`, worktree
`content-42-agentic-patterns-887a63`. Blocking rule for round 3: block only on (a) regressions from the fixes made
since round 2, (b) an honest correct solution that a check fails, or (c) an in-scope bypass.
Verdict: **FAIL**, with one blocking issue of type (b), introduced by the C2 fix (so also type (a)). Attributed to
practice-designer.

## What I read
- Loaded: `.claude/feedback/judge_mistakes.md`, my round-2 report, and the change log `plans/42-module-agentic-patterns-demo-A.md`
  section "judge_content round 2 fixes" (lines 224-255).
- L2: `task.md` in full; `checks/verify_workspace.py:150-378` (`static_problems`, `probe_problems`, `suite_problems`,
  `planted_violation`, `linter_line`, `finding_text`, `make_problems`, `main`); `checks/data/arch_roots.json:1-520`
  (`a1-forms`, `a2-forms`, `a3-forms`; only `files[0]` chunks are drawn); `checks/reference/Makefile` and
  `checks/reference/src/invoices/money.py`; starter `src/invoices/{money,service,legacy_format}.py`,
  `src/ledger/{report,__init__}.py`, `CLAUDE.md`; the imports of `checks/data/pristine_tests/*.py`; a grep for `ledger`
  under starter `src/invoices/` (no hits) and for `invoices.money` under the starter (`statement.py:8`, `ledger/report.py:3`).
- L1: `task.md:100-150` (items 7-10, "Как проверяется"), `checks/verify_pokayoke.py:290-306` (`suite_problems`, three
  children), and the `checks/data/pristine_tests/` listing (no `test_late_fee.py`, which is correct).
- L3: `task.md` item 7 and "Как проверяется" (`:146-177`).
- L4: `task.md:60-91` (the precedence-exceptions sentence) and `theory.md:98-115` (the `excludedCommands` paragraph).

## Blocking

**B1. [L2 `checks/verify_workspace.py:250-260, 308-348` against `task.md:32, 148-159, 194-196`]: item 8 fails an honest
correct project about 40% of runs.** (practice-designer)

The planted A1 chunk is drawn from the ten single-A1 chunks of `a1-forms` `files[0]` and appended to
`src/ledger/accounts.py`. Four of them run `invoices.money` at module level: `import invoices.money`,
`import invoices.money as money_module`, `from invoices import models, money` and
`from invoices.money import format_cents`. The task allows, and its hint at `:194-195` encourages, an A1 fix that
moves `format_cents` to a shared package. Deleting `src/invoices/money.py` afterwards is allowed: item 6 checks only
the output, and nothing says to keep the module. Item 7 allows added tests, and a test of `ledger.report.entry_lines`
is a natural guard for item 6. Take that project with the reference's own target shape (`check: test`, then the
linter):

1. On the planted copy, the learner's ledger test imports `ledger.accounts`, which raises `ModuleNotFoundError`.
2. `make test` goes red, so make stops before the linter line.
3. make exits non-zero. Nothing in the output carries the A1 line, but `linter_line` (run directly) prints it.
4. The check reports "make -s check ... падает, но в его выводе нет строки вашего линтера ... цель check должна запускать
   линтер".

The learner's target does run the linter, so the message misleads, and the result depends on the random draw. The
reference keeps `invoices/money.py` as a shim, so the 20/20 reference runs never reached this corner. Before C2, any
non-zero exit counted, so this is a regression from the fix. The other planted chunks are safe: A2 is only `sqlite3`
forms; A3 imports `legacy_format`, which the contract freezes; the A1 `invoices.service` names and
`invoices.repository` exist in every allowed solution I could construct; the function and `TYPE_CHECKING` forms do not
run.

Fix target (the effect): on any solution the task allows, a planted mutation does not change the result of the
commands that run before the linter. Two constructions work. (i) Draw only chunks that cannot fail at runtime: the
not-executed forms (inside a function, under `TYPE_CHECKING`) and imports of modules the task guarantees
(`invoices`, `invoices.api`, `invoices.repository`, `invoices.legacy_format`, `sqlite3`). Keep the remaining forms in
the per-run draw, but plant them so that they do not execute, for example inside a function. (ii) Run the copy's suite
after planting and redraw if it turns red. Either way, re-demo with a correct workspace that deletes
`src/invoices/money.py`, adds a `tests/test_report.py` importing `ledger.report`, and uses `check: test` ordering. Run
it at least 20 times, so every chunk is drawn. The grep stubs must still fail.

## Non-blocking
- L2 `task.md:153-155`: the list of forms ("внутри функции, в скобках..., под `if TYPE_CHECKING:`") reads as complete.
  The draw also includes plain module-level imports, `import ... as ...` and `# noqa`. An honest linter written to the
  rules handles all of them, so nothing fails, but "например" or the full list would make the text exact.
- L1 `task.md:118`: "Каждый стартовый тест `tests/test_late_fee.py` и `tests/test_statement.py`" omits
  `test_api.py`, which child 1 also runs as pristine. Item 9's deletion of `old_api.py` does not touch it (round 2), so
  this cannot fail anyone. Information only.
- Carried from round 2: if `src/ledger/accounts.py` is missing, the A1 variant plants nothing and the message says
  "выходит с кодом 0, а должен упасть".

## Checked and fine
- **C1 texts against the code, both directions.** L1 item 10 describes three runs (pristine only; the learner's
  `test_late_fee.py` with only `__init__.py` and `fixtures/`; everything together), which matches `suite_problems`
  `:294-305`. "Как проверяется" says 30 s per run, three runs, which matches the change log's budget. L2 and L3 item 7
  describe two runs, the first holding only starter files. L2 says 30 s and two runs (`:173-174`); L3 says 25 s and
  two runs (`:176-177`). Both match the code and the log. The texts promise nothing the code does not do, and the code
  checks nothing the texts do not state.
- **C2 text against the code.** The seven copies, the 25 s per make run, the three targets, the per-run draw from the
  item-1 forms, and the "line of your own linter with the same text and `Fix:`" condition all match `make_problems`.
  The messages are Russian, name the variant, and say what is expected. Apart from B1 they are actionable.
- **Time.** L2 stays at 85 min. Item 8 still asks only for a `check` target that runs the tests and the linter on the
  root, which is three lines of Makefile. A correct linter (already needed for items 1-2) satisfies the new
  "own line" condition without extra work, so the 3 min line holds. Module totals are unchanged: 325 min, 68.9%
  practice. L1 and L3 times are unaffected, because C1 changes only how the check runs, not what the learner does.
- **L4 accuracy fixes.** The `excludedCommands` paragraph (`theory.md:110-115`) precedes the task's constraint
  (`task.md:81-82`, "остаётся пустым"), so no concept is used before it is introduced. The precedence-exceptions
  sentence (`task.md:69-73`) matches theory `:98-102, 109-110`. It names keys the learner has already read about and
  gives away no G-defect.
- **Threat model.** No changed text promises detection of RS1-RS8. C1 and C2 close in-scope items (edited tests,
  stub or grep `make check`).

FAIL
