# #42 judge_content round 3: accuracy

Verdict: PASS. Round 3 blocking rule (Stepan, 2026-10-30): block only on (a) regressions from the round-2 fixes, (b) an
honest correct solution failed by a check, (c) an in-scope bypass, (d) a factual error in text added or changed since
round 2. None found. Four non-blocking notes at the end.

## Round-2 items: status (sources re-fetched 2026-10-30)

- **B1 (WebFetch preflight source): fixed.** L4 lesson.yaml:38-40 adds `https://code.claude.com/docs/en/data-usage`,
  checkedAt 2026-10-30. That page, "WebFetch domain safety check": "This check runs regardless of which model provider you
  use and is not affected by `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. ... set `skipWebFetchPreflight: true`".
  "Default behaviors by API provider": "This variable doesn't affect the WebFetch check". theory.md:188-190 and the quiz
  option d key now rest on a listed source.
- **B2 (`excludedCommands` "всегда"): fixed.** theory.md:110-115 now says `false` does not affect `excludedCommands`,
  except when `false` comes from managed settings or `--settings`: then the sandbox is admin-required, repository
  `excludedCommands` are ignored, `~/.claude/settings.json` entries still apply. Sandboxing page: "The sandbox is
  admin-required while ... `allowUnsandboxedCommands` set to `false` in managed settings, or with the `--settings` flag
  ..."; "It ignores these settings in a repository's `.claude/settings.json` and `.claude/settings.local.json`:
  `excludedCommands` ... Every entry"; "In a developer's own settings: the settings in the table still apply from
  `~/.claude/settings.json` or `--settings`"; "A `false` in your user settings doesn't make the sandbox admin-required".
  Correct.
- **N1 (precedence rule in task.md): fixed.** L4 task.md:68-73 now names both exceptions (`strictAllowlist` only from
  user settings among the three files; a user `false` for `allowUnsandboxedCommands` holds over project or local
  `true`). Matches theory.md:98-110 and the sandboxing quotes above.
- **N2 (Codex version): fixed.** lesson.yaml:77-79 adds the npm registry page; `@openai/codex` latest `version` is
  `0.166.0` (fetched today).
- **N3 (`failIfUnavailable`):** not addressed; it was optional and stays non-blocking.

## Text changed since round 2, checked against the check code

**L1 item 10 (task.md:118-128) vs `verify_pokayoke.suite_problems` (290-306) and `grader_runtime.replace_tests` /
`run_suite` / `overlay_pristine_tests`.**
- Run 1: `replace_tests(copy, pristine_tests)` removes `tests/` and writes only `checks/data/pristine_tests/`
  (`__init__.py`, `fixtures/invoices.json`, `test_api.py`, `test_statement.py`; no `test_late_fee.py`). "в `tests/` лежат
  только исходные файлы стартовой папки, а ваши файлы ... не попадают": true.
- Run 2: `keep=("test_late_fee.py",), with_test_modules=False` drops top-level `test*` pristine files, keeps
  `__init__.py` and `fixtures/`, then writes the learner's `test_late_fee.py`; the pristine ids of `tests.test_late_fee.`
  must start and not be skipped. Text "запускается отдельным прогоном, один, рядом только с `tests/__init__.py` и
  `tests/fixtures/`; все его стартовые тесты должны быть на месте, не пропущены и зелёные": matches.
- Run 3: workspace `tests/` with pristine files copied over, empty pristine id set: "Добавленные вами тесты запускаются
  отдельно ... они тоже должны проходить": matches.
- "30 секунд на прогон, прогонов три" (task.md:149-150): `SUITE_TIMEOUT_SEC = 30`, three `run_suite` calls. Budget fits
  `timeoutSec: 120`.
- Honest solution: the starter `test_late_fee.py` calls `late_fee` positionally, so it is correctly excluded from run 1
  and the learner's keyword version runs in run 2; pristine `test_api.py`/`test_statement.py` do not call `late_fee`
  (grep). No honest-solution failure.

**L2 item 7 (task.md:140-147) and L3 item 7 (task.md:157-164) vs `verify_workspace.suite_problems` (237-247) and
`verify_deps.suite_problems` (155-165).** Run 1 pristine only (pristine = starter/tests byte for byte, per round-2
assessment), run 2 workspace plus pristine overlay. "вторым, отдельным прогоном вместе со стартовыми и не влияют на
первый": matches. Timings: L2 "30 секунд, прогонов два" = `SUITE_TIMEOUT_SEC = 30`; L3 "25 секунд, прогонов два" =
`SUITE_TIMEOUT_SEC = 25`; L3 code probe 20 s = `PROBE_TIMEOUT_SEC = 20`.

**L2 item 8 (task.md:148-159) and "Как проверяется" (172-175) vs `verify_workspace.make_problems` (288-349),
`planted_violation`, `root_render.render`, `arch_roots.json`.**
- Seven copies: as is (0); new `src/ledger/m<hex>.py` whose docstring and comment name `import invoices`, plus a
  passing test (0); new failing test (non-zero); `REGRESSION` appended to `src/invoices/late_fee.py` (non-zero); one
  A1, A2, A3 each appended to `PLANT_TARGETS` = `src/ledger/accounts.py`, `src/invoices/service.py`,
  `src/invoices/models.py`. All as the text says. `MAKE_TIMEOUT_SEC = 25` = "не дольше 25 секунд", "семи копиях".
- Planted forms: one chunk per run from `files[0]` of `a1-forms` / `a2-forms` / `a3-forms` with exactly one finding of
  that rule: in a function, parenthesised multi-line, after `;`, backslash continuation (A2), relative `from .` (A3),
  under `if TYPE_CHECKING:` (A1), plus plain forms and `# noqa`. The text's list matches, see non-blocking 2.
- Counting: non-zero exit AND `finding_text(out + err)` equals what `scripts/check_architecture.py .` prints for the same
  (rule, path, line), message and Fix compared. Text "правило, путь, строка, тот же текст и `Fix:`": matches. Line
  arithmetic checked: `existing` ends in `\n`, a blank separator line, then the body, so body line k is
  `existing.count("\n") + 1 + k`. Correct.
- Honest solution under the reference recipe `check: test` then the linter: make stops after a red suite, so a planted
  chunk that broke the tests would hide the linter line. I walked every eligible chunk against the starter `src/`:
  A1 imports of `invoices`, `invoices.money.format_cents`, `invoices.service.validate_status/to_json_dict`,
  `invoices.repository`, `invoices.api` (in a function), `invoices.models.Invoice` (TYPE_CHECKING) all exist and no
  `invoices` module imports `ledger`, so no cycle; A2 `os`/`sqlite3`/`sqlite3.dbapi2` are stdlib; A3 into `models.py`:
  `legacy_format` imports nothing, and `from invoices import models` inside `models.py` resolves through `sys.modules`
  (3.7+). Padding lines are blanks, comments, string expressions and fresh `VALUE_<hex>`/`LABEL_<hex>` names, so nothing
  is shadowed. No chunk breaks the suite; consistent with demo A's 20/20 reference runs on 3.11 and 3.12.
- Budget: 20 + 2x30 + 7x25 + 3x12 = 291 < `timeoutSec: 300`.

**L4 theory/task text changed since round 2** (above): no new factual error. verify_contour.py precedence code was
checked in round 2 and the task text now describes it.

**Threat model.** No new in-scope bypass in the changed text; the bypass side of C1/C2 belongs to the assessment judge.

## Non-blocking

1. [L4 theory.md:112-113] "песочница становится обязательной для администратора" reads as "mandatory for the admin".
   The source term "admin-required" means required by the administrator: "обязательной по требованию администратора
   (admin-required)". The consequence sentence after it is correct. Also the source's "with the `--settings` flag unless
   managed settings set it to `true`" nuance is omitted; harmless for the practice.
2. [L2 task.md:154-155] The list of planted forms omits `# noqa: A1` and the plain top-level forms, which are also drawn.
   "из тех же форм, что в скрытых проектах пункта 1" makes the reference correct; the list reads as complete after the
   colon. Adding "например" or "в том числе с `# noqa`" would make it exact.
3. [L1 task.md:125] "Правка, пропуск или удаление стартового теста ничего не меняют" (pre-existing sentence) is now
   literally untrue for `tests/test_late_fee.py`, whose edited version runs in run 2 as the learner wrote it, and whose
   deleted starter names fail the check. The meaning ("editing cannot hide a regression") still holds, because the probe
   compares `late_fee` to the original on a grid. "не помогают скрыть ошибку" would be exact.
4. [L4 theory.md:107-109] Round-2 N3 (`failIfUnavailable`) still optional.

## Not done

No shell in this run: no check or snippet executed. Code was read; the honest-solution walk for item 8 was done by
hand against the starter `src/` and the templates. Reserve quizzes not re-read (unchanged since round 2 per demo logs).

PASS
