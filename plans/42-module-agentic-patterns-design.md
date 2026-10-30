# #42 module design (revision 5): course/ai-for-developers/02-agentic-patterns "Паттерны агентной разработки"

Curriculum-architect design, revision 5 (judge reports: `plans/42-module-agentic-patterns-design-review-{1,2,3,4}-*.md`;
what changed and why: section 15 for revision 5, section 14 for revisions 2-4). Revision 3 adopted Stepan's grading
threat model of 2026-10-30 (2.8); revisions 4 and 5 keep it unchanged. Fact base: `plans/42-module-agentic-patterns-research.md` (checked 2026-10-30, Claude
Code 2.1.314, Codex CLI 0.166.0), cited as "R <section>" ("R OA" = the orchestrator addendum on OpenAI "Harness
engineering"; "R DEC" its decisions). Every vendor fact that revision 2 changed or added was re-fetched from the primary
page on 2026-10-30 and is quoted in section 12.9, cited as "V<n>". Conventions of modules 00 and 01 are reused by
reference: "as 00 2.x" = `plans/15-module-introduction-design.md` section 2.x (revision 4), "as 01 2.x" =
`plans/41-module-spec-driven-development-design.md` section 2.x (revision 7); only deltas are written here. Contract
unchanged (`packages/lesson-schema/src/schema.ts`, ADR-0001): existing lesson types and check kinds only.

## 0. Summary
- 5 lessons, 315 min, 214 min hands-on (67.9%). Reference block 3, topics 1-4, in the reference order.
- Zero agent spend in checks (R DEC). Future rubric mentor ~$0.02 per attempt for each of 2 rubrics.
- Checks: command x7 (all `python3 -I "$ACADEMY_CHECKS_DIR/<script>.py"`, Python >= 3.10 stdlib only), quiz x3,
  rubric x2 (each paired with a command check), bug-hunt x1. Capped: L1 `rule-placement` (3 scored submissions) and
  L3 `failure-log` (10 counted failures); both have a free stage 0 copied into task.md.
- Spine: the placement ladder (2.7). L1 places the rules of a bloated CLAUDE.md and moves two into code; L2 turns three
  into a deterministic import check with fix text; L3 runs the ladder backwards from agent failures and builds one
  dependency gate; L4 repairs a closed-contour configuration with seven planted, documented defects; L5 hunts
  anti-patterns of every layer.
- One domain: the `invoice-service` of modules 00 and 01 (section 3).
- Every rule changed in revisions 4 and 5 was prototyped on Python 3.12.13; each boundary that broke the previous
  revision was first run on the previous rule and shown passing there, and each changed check was also run on an honest
  corpus (section 11).

## 1. Module outcomes (module.yaml `outcomes`, Russian, verbatim)
Each lesson's `outcomes[]` copies the full sentence it serves; every verb is mapped to a check in section 6.
- O1 (L1): "Раскладывает правила из файла инструкций агента по ступеням (удалить, изменить код, проверка, хук, память) по заданному порядку решения, убирает из памяти всё, что ушло на другие ступени, и меняет код так, чтобы ошибка, от которой предостерегало правило, стала невозможной."
- O2 (L2): "Пишет детерминированную проверку архитектурных правил по AST, которая на каждое нарушение печатает правило, файл, строку и способ исправления для агента, подключает её к единой команде проверки проекта и приводит проект к зелёной проверке изменением кода, а не исключениями и не обходом правил."
- O3 (L3): "Разбирает сбои агента по записям сессий: называет класс причины и ступень, на которой исправление предотвратит повтор, формулирует конкретное исправление и реализует одно из них как проверку зависимостей."
- O4 (L4): "Находит и исправляет в настройках Claude Code и окружения проекта дефекты закрытого контура (адрес шлюза, секрет в репозитории, необязательный трафик, веб-инструменты, песочница со строгим списком хостов, внутренний индекс пакетов, доверие корпоративному CA для каждого инструмента) и в сценариях со слабой локальной моделью выбирает изменения процесса: чаще запускать проверки, дробить задачи, закреплять версии и документацию."
- O5 (L5): "Находит в снимке проекта и записи сессии антипаттерны работы с агентом (раздутая память, обязательное правило только в прозе, обвязка ради предпочтения или вместо дешёвой проверки, управление сессией уговорами) и отличает их от похожих хороших практик."

module.yaml: keep `id`, `title`, `summary`; add `outcomes` and `lessons:` (section 5 order); `status: ready` at the end.

## 2. Conventions
### 2.1 quiz.yaml: as 00 2.1, with 01 2.1's delta
Every quiz: 6 questions (4 single + 2 multiple), `passScore: 0.8`; random pass 0.1211% per attempt, 0.3628% over the
3-attempt cap. Questions grade a mechanism or a habit, never a version, a date, a vendor number or a study's percentage.
A Claude Code scenario names "Claude Code 2.1.314"; a Codex scenario names "Codex CLI 0.166.0".

### 2.2 bugs.yaml and findings.json: as 00 2.2 and 2.2.1
Delta: L5 defines its own categories and decision rule; `file` may be any starter file; `maxReports` and
`maxDecoyHits` live in `bugs.yaml` (01 2.2).

### 2.3 Command-check runtime: as 00 2.3 and 01 2.3
As 01 2.3 (run string, mount, `checks/data/` only, strict JSON, leak-free messages, learner code in its own `-I -B`
subprocess with a scratch environment, temp root resolved with `realpath`, new session, timeout, group kill, shuffled
order, pipe record with a nonce). `-I` keeps `usercustomize` and a workspace `sitecustomize` out; a `sitecustomize` in
the image's system site-packages still loads (accepted 00/01 convention). Deltas:
- Hidden roots (L2, L3): rendered per run from `checks/data/` templates; free file names random (`m` + 6 hex); 0-3
  padding lines before and 0-2 between template lines from one pool (blank, comment, docstring, assignment, some naming
  forbidden modules in text); expected findings computed by the generator, no marker. Templates include parser-only
  forms (an import inside a multi-line string, `x = 1; import m`, a backslash continuation, a parenthesised multi-line
  `from` list); a file that starts with `from __future__` gets only blank and comment lines before it.
- "Does not parse" means `ast.parse` raises (`SyntaxError`, `ValueError`); task.md says so.
- Linter-check messages: the root's theme, the exit code, counts of missing, extra, malformed and repeated ("повторов
  N"); no cap (randomised).
- Output parsed by one regex per check; non-matching lines are malformed; order free; a repeated finding fails.
- Learner code always runs from the grader's copy of the workspace made without any `__pycache__/` directory (L1, L2,
  L3), so a stale or planted bytecode file never runs in place of the visible source (`-B` stops writing, not reading).
- "Starter tests run and pass": a grader bootstrap `python3 -I -B -c` first imports every module it uses: `unittest`
  and its submodules `case`, `result`, `suite`, `loader`, `runner`, `util`, `signals`, `main`, `mock`, `async_case` and
  `_log` (`assertLogs`/`assertNoLogs` import `_log` lazily), never `unittest.__main__` (importing it runs
  `unittest.main` and exits); it touches the lazy `unittest.IsolatedAsyncioTestCase`, imports `json`, `os`, `sys`, and
  snapshots `vars()` of every `unittest` module and of every class they define. Only then it puts the copy's `src` and
  root on `sys.path`, discovers `tests`, runs a `TestResult` and writes `{nonce, testsRun, ids, failed, skipped,
  tampered}` to the pipe, where `failed` counts failures, errors, unexpected successes and expected failures.
  `tampered` lists every snapshotted object with a key whose old or new value is callable or a descriptor (function,
  class, method, property, staticmethod) and that was added, removed or rebound to another object (compared with `is`).
  Data values are never compared: `unittest` and `warnings` fill some lazily during an honest run (`mock_open`'s
  `file_spec`/`open_spec`, `__warningregistry__` from a ResourceWarning or unittest's own DeprecationWarning, submodule
  attributes, lists such as `_patch._active_patches`). Pass = `failed` 0, `tampered` empty, > 0 run, every pristine test
  name (`checks/data/`) ran and was not skipped. task.md: "a test marked skipped or expected-failure counts as not
  passed; a test that replaces a function or class of `unittest` itself fails the run". A workspace `unittest/` or
  `json.py` cannot replace the runner; an early exit leaves no record. All three suite runners (L1, L2 c, L3 b) are
  this one; it is defence in depth behind the hidden probes.
  Must fail (each suite-running check keeps these probes): `TestResult.addFailure` patched, `_Outcome.testPartExecutor`
  patched, `unittest.TestResult` rebound to a subclass (`tampered`); a root `json.py` forging the record; a red
  starter test marked `@unittest.expectedFailure`; a skipped or renamed starter test; `os._exit(0)` (no record).
  Must pass, the honest corpus (each as an extra `tests/test_honest.py` next to the green starter suite):
  `assertLogs` and `assertNoLogs`, each alone; `mock.mock_open` patched over `builtins.open`; a file opened in a test
  and not closed (ResourceWarning); an unclosed `sqlite3` connection; a test method that returns a value
  (DeprecationWarning); `subTest`; class and module fixtures with `addClassCleanup`/`addModuleCleanup`;
  `TemporaryDirectory` + `addCleanup`; `patch().start()` with and without `stop`; `create_autospec`, `sentinel`,
  `patch.dict`, `patch.multiple`, `PropertyMock`, `seal`, `enterContext`; `AsyncMock` in `IsolatedAsyncioTestCase` with
  `asyncSetUp`; `assertWarns`/`assertRaises`; `catch_warnings`; class `maxDiff`; `skipIf` on an extra test;
  `load_tests` and a doctest suite through it (section 11 row 17).
- The sum of a check's per-run timeouts stays below its `timeoutSec` (each entry states the budget).

### 2.4 Demonstration protocol: as 00 2.4 with 01 2.4's deltas
(1) empty starter fails, (2) reference passes, (3) every listed wrong solution fails, (3b) every "must pass" variant
passes, (4a) usercustomize and (4b) PATH shim on the EMPTY starter, (4c) top-level `os._exit(0)` in learner code on the
REFERENCE for every check that executes learner code, (4d) `$ACADEMY_CHECKS_DIR/reference` and `.../data/reserve`
absent. Randomised checks (L2, L3) run the reference and every wrong solution on 20 logged seeds. (5) For every check
changed after a judge FAIL: the boundary case that broke the earlier version is a named demo case, run green on the
earlier version first. Rubrics: blind set as 00 2.4. `python3 --version` of the demo interpreter is recorded; the demo is
re-run on the image interpreter before `ready`. `make check` (L2) calls `python3` by name: on the authoring Mac put a
symlink `python3 -> /opt/homebrew/bin/python3.12` first on `PATH` (without it `make` picks `/usr/bin/python3` 3.9.6).

### 2.5 Runner, caps, mentor, reserve: as 00 2.5 items 1-6 and 01 2.5
Quizzes and the bug-hunt: 3 scored submissions, then closed as "не пройдено"; mentor review records
`passedVia: mentor-review`; nothing reopens a closed check. Two capped command checks, each with a never-reset counter,
a free stage 0 listed in its entry and copied into task.md, and close-on-cap:
- L1 `rule-placement`: 3 scored submissions (binary verdict on a fixed 12-card key, which a partially sure learner
  could search without a cap; binary kept over "N из 12" by the exact search table in L1).
- L3 `failure-log`: at most 10 counted failed submissions (aggregate count over enum fields, as 00 L1).
All other command checks: no cap (binary or non-enumerable messages); the UI suggests the mentor after 5 failed
attempts. Mentor information rule as 00 2.5.6 (no key, no per-item correctness). Reserve pools in
`checks/data/reserve/<check-id>.yaml`: every quiz >= 6 unseen questions; `rule-placement` 6 unseen cards with key and
the per-step walk; `failure-log` 3 unseen incidents with key; L5 a second excerpt with >= 3 planted items, its own key,
explicit `minFound`, >= 1 decoy per planted category.
Prerequisite gating (01 2.5, 11.8): a lesson's workspace opens only when its prerequisite lesson is done, "done" meaning
every check of that lesson passed or closed. Answers the next lesson does not use are trimmed from its starter (L2
drops `placement.json`, L3 `lint-output.txt`, L4 `failure-log.json` and `incidents/`); code the next lesson builds on
(keyword-only `late_fee`, the linter, the gate) rides forward, safe under the gating.

### 2.6 Task text equals the checks: as 01 2.9
Every task.md has "Готово, когда" listing every rule its command checks enforce (with numbers and forms) and every
rubric criterion by name, and nothing else; method advice sits in "Как работать (совет, не проверяется)", which every
lesson has, starting with a first step. When a check runs its own implementation or pristine data instead of the
learner's, the text says so in those words (01 L7 task.md item 4). When the outcome is to find something (L4), each
rule is stated as the requirement it protects, in the brief's terms, plus one general acceptance rule; the per-item
key, file and value table stays the grader's and the mentor's, and messages name the requirement only. Each lesson below gives the list in English; the
lesson-author translates it item by item and the content judges diff it against the scripts both ways (section 13).

### 2.7 The placement ladder (module vocabulary; defined once in L1 theory, reused by L3 and L5)
Seven questions about one line of a memory file, asked in order; the first "yes" decides. task.md of L1 and L3 prints
them verbatim. "Code" means Python source under `src/` or `scripts/`; data files, docs and settings are not code.
1. Is the line the command an agent runs to build, test or check the whole project? -> `memory` (R A1 "the single most
   useful line"). A command for one part (regenerate one directory) is not this step.
2. Does a hook or check that already exists in the repo (`.claude/settings.json`, Makefile, tests) enforce it? -> that
   layer, `hook` or `check` (the guarantee lives there; the line is removed from memory either way).
3. Would an agent that ignores the line still do the right thing, because the line only describes what the repo shows or
   states a preference with legitimate exceptions? -> `delete` (R A1 "Claude reads the repo itself", "let Claude
   decide"; R A6).
4. Can a change to code make the mistake impossible or remove the misleading thing (a signature, deleting a dead module,
   one entry point) without breaking a contract the repo documents? -> `code` (R A5 poka-yoke; R OA "promote the rule
   into code").
5. Must the agent be stopped at a moment of its turn, before a tool call or before the turn ends, because finding the
   violation later is too late? -> `hook` (R A1 deterministic row; 00 L6 PreToolUse, 01 L1 Stop).
6. Can a deterministic program detect a violation after the fact (test, linter, structural test)? -> `check` (R A2; R OA).
7. Otherwise (a fact the repo cannot show, a judgement, a reason) -> `memory`.
L3 asks one question before these, for failures only: 0. Was the task itself the problem (an ambiguous requirement the
agent guessed, or too much for one run)? -> `task` (01 L4). Memory and code are guides; check and hook are computational
controls (R A2).

### 2.8 Grading threat model of record (Stepan, 2026-10-30)
In scope for command checks: each class must fail, with a must-fail probe in the check entry.
- The untouched starter and every listed near miss.
- Editing tests or graded files (pristine copies, test-name sets and "is it ours" sets come from `checks/data/`).
- Hardcoding outputs (hidden randomised roots, hidden grids).
- Linter suppression (`# noqa`, excludes; workspace cleanliness is judged by the grader's own rules).
- Exit-0 or stub scripts.
- Stdlib shadowing, including a workspace `unittest/` package (grader bootstrap, 2.3).
- `usercustomize`/`sitecustomize` (`-I`).
- Plain `importlib.import_module`, `__import__`, `exec`, `eval` with literal names (L2 w1, w2).
- A new vendored stub file (L3 (b): no new file of any extension under `src/`).
- Special-casing the visible starter files (hidden grids and roots).

Out of scope for command checks (deliberate obfuscation against one's own check): recorded residuals, the mentor reviews
the diff for each (section 6 lists them per check, section 11 shows them passing):
- RS1 invisible or format characters in moved rule text; RS2 homoglyphs or mixed scripts there (L1).
- RS3 exec or import names built from strings, e.g. `vars(builtins)["ex" + "ec"]` (L2).
- RS4 `runpy` reached without a plain `import runpy` (L2).
- RS5 bytecode stand-ins beyond a new `.pyc` file; RS6 `sys.modules` aliasing; RS7 code planted into an existing
  module to fake a dependency (L3).
- RS8 rule injection through a SessionStart hook or an output style (L1).

Also out, as module 01 residuals (iii) and (iv): reading the hidden grader or the `checks/` mount and reverse-engineering
probes, keys or expected values. A learner linter that imports `arch_rules.py` or `deps_rules.py` from the mount passes
L2/L3 (12.1).

Cheap measures that also stop some out-of-scope forms are kept: NFKC normalisation (L1 s5), "no new file of any
extension" (L3), `runpy` in w1's import ban (L2), "a connection with no `src/` frame is not repository's" (L2 w2).
Nothing else is built against RS1-RS8 (section 10). Prose quality (remediation messages, fix texts) goes to rubrics
with blind demos; no regex grades prose.

## 3. Practice domain
`invoice-service` as left by 01 L7's reference: billing `src/invoices/`, accounting `src/ledger/`, unittest suite run by
`PYTHONPATH=src python3 -m unittest discover -s tests -t .`, Makefile `test`, and a `.claude/settings.json` with only
the 01 L1 Stop hook (01 L7's starter has neither the 00 L6 PreToolUse hook nor `generated/`). L1 re-adds from 00 L6:
`src/invoices/generated/` with its "Do not edit: run `make codegen`" header, `scripts/codegen.py`,
`schema/invoice.schema.json`, a `codegen` Makefile target and the `protect_generated.py` PreToolUse hook (no `Edit`
deny rule, so R08 has one guarantee). Module 02 fiction, all added in L1: `statement.py` (late fee per invoice), dead
`old_api.py`, `money.py` (`format_cents`), `legacy_format.py` (partner contract, see L1) and `export_csv.py`. Each
starter is its own trimmed copy (no symlinks); module 01 docs (spec, glossary, ADRs) are dropped where no task uses them
(distractors, R B1).

## 4. Concept dependency table
| Concept | Introduced | Used in |
|---|---|---|
| model decides vs harness enforces; PreToolUse hook, deny rules, sandbox basics | 00 L6 | L1, L4, L5 |
| memory files, what is derivable, Gloaguen | 00 L5 | L1, L5 |
| context rot, compaction, /clear after two corrections | 00 L4 | L3, L5 |
| local models via Ollama, context >= 64k, weak tool calling | 00 L1 | L4 |
| Stop hook running tests; tests that can fail | 01 L1 | L1 (R10), L3 (I08), L5 |
| PostToolUse hook (`01-verification/theory.md`) | 01 L1 | L5 |
| `/effort` | 00 L1 | L5 |
| headless `claude -p` (one-line gloss in L5 theory: "runs one prompt without a session and prints the answer") | L5 | L5 |
| test tampering, claim without evidence | 01 L1, L6 | L3 (I05; referenced) |
| deterministic artifact linter, exit codes 0/1/2, one line per finding | 01 L7 | L2, L3 |
| vertical tasks, asking before coding | 01 L4 | L3 (`task` step) |
| guides and sensors; computational vs inferential; harnessability | L1 (R A2) | L1-L5 |
| placement ladder 2.7; promote and demote | L1 (R A1, A4, OA) | L1, L3, L5 |
| poka-yoke (keyword-only arguments, delete the misleading thing) | L1 (R A5) | L1, L3 |
| AGENTS.md as a map, knowledge in `docs/` | L1 (R OA) | L5 |
| remediation message ("Fix: ..."), signals optimised for the LLM | L2 (R A2, A5, A8, OA) | L2, L3 |
| AST import analysis, resolving relative imports; dynamic import evades statement rules | L2 | L2, L3 |
| one check entry point (`make check`) | L2 (R A1, A9) | L2, L3, L4 |
| Ruff TID251 `msg`, ESLint `no-restricted-imports` `message`, import-linter | L2 (R A8) | L2 theory only |
| failure classes and mechanisms (distractors, stale API, invented packages, gamed check, sycophancy, horizon) | L3 (R B1-B6) | L3, L4, L5 |
| CC four-way triage of a bad session; steering loop | L3 (R B7, A2, A4, OA) | L3, L5 |
| instructions do not stop reward hacking (METR) | L3 (R B4) | L3, L5 |
| gateway vs proxy vs CA vs mirror vs egress allowlist; each tool has its own trust setting | L4 (R C1, C4, C6; V7, V9) | L4 |
| settings `env` over shell export, settings precedence, presence-only vs on/off variables | L4 (V1-V3, V8) | L4 |
| non-essential traffic, web tools off, sandbox strict allowlist and its scope | L4 (V1, V4-V6) | L4 |
| supported corporate route vs unsupported local model behind CC | L4 (R C1, C2; V10) | L4 |
| harness value depends on model strength (Jain) | L4 (R B10) | L4, L5 |
| anti-pattern families, L5 decision rule | L5 (R D) | L5 |
Check: no lesson uses a concept from a later lesson. L3's quiz says "без доступа в интернет", not "closed contour".

## 5. Lessons
Directory names in order: `01-code-over-rules`, `02-architecture-checks`, `03-failure-analysis`,
`04-closed-environments`, `05-anti-patterns`. Every lesson: `workspace.image: academy-workspace:dev`,
`workspace.starter: starter`, `status: ready` when done, sources from R (and V for L4) with `checkedAt: "2026-10-30"`.

### L1 `01-code-over-rules`: "Менять код, а не правила"
- id `patterns-code-over-rules`, type `artifact`, O1, 60 min (theory 22, hands-on 38), prerequisites
  `[sdd-integrity-control]`.
- Opening question: "Агент в третий раз передал дни вместо суммы. Добавить четвёртый восклицательный знак в CLAUDE.md или
  сделать так, чтобы перепутать было нельзя?"
- Theory: R A1 two kinds of instructions and the two-way rule; R A2 guides/sensors, computational vs inferential,
  harnessability; R A4 Hashimoto's two fix forms (a memory line is a legitimate first step); R A5 poka-yoke; R OA (one
  big AGENTS.md failed, ~100-line map plus `docs/`, "promote the rule into code", agents copy existing patterns); R A6 a
  wrong rule is followed faithfully; the ladder 2.7 in full; contradiction 3 of R as "memory for guidance, code and hooks
  for must-hold". Pointers back, one line each, not re-taught: memory files and derivability (00 L5), PreToolUse and
  deny rules (00 L6), Stop hook (01 L1).
- Starter: 01 L7 reference trimmed, plus section 3's additions, plus:
  - `src/invoices/statement.py`: `statement_line` calls `late_fee(days_late, balance)`, swapped and positional. No
    starter test catches it: `tests/test_statement.py` has one test, `test_invoice_within_grace_has_no_fee` (5 days
    late gives 0 either way; with the swap `late_fee(5, balance)` is capped to 0). Making the parameters keyword-only
    turns the call into `late_fee(amount_cents=days_late, days_late=balance)` if converted by position, which reads
    wrong: the learner meets the bug the opening question describes.
  - `src/invoices/old_api.py` (`list_invoices_v0`, raw sqlite3, imported by nothing); `tests/test_late_fee.py` (10
    positional calls).
  - `src/invoices/legacy_format.py` docstring: "Contract: the partner tool `partner-sync` imports
    `invoices.legacy_format.money_str` directly (contract PS-2024-07, valid until 2027). Do not move, rename or change
    this module." `export_csv.py` uses it; `money.py` has `format_cents`.
  - `placement.json` template (`{"R01": "", ... "R12": ""}`) and a CLAUDE.md of 12 tagged rules (`- [Rnn] text`)
    plus `#` headings and blank lines, nothing else: s4 exempts only the starter's headings, so an untagged intro
    sentence in the starter would spend the learner's budget (practice-designer asserts it in the demo).
  | id | Rule text (starter CLAUDE.md) | Key |
  |---|---|---|
  | R01 | Tests use unittest and the packages live under src/. | delete |
  | R02 | Layout: src/invoices is billing, src/ledger is accounting, scripts/ is tooling, tests/ holds the tests. | delete |
  | R03 | Run the tests with `make test`; plain `python3 -m unittest` cannot import the packages. | memory |
  | R04 | IMPORTANT!!! late_fee takes the amount first and the days second. NEVER swap them. | code |
  | R05 | ledger must never import from invoices. | check |
  | R06 | Only src/invoices/repository.py may use sqlite3. | check |
  | R07 | Do not use invoices.legacy_format in new code, use invoices.money.format_cents (the partner CSV export keeps legacy_format). | check |
  | R08 | Never edit src/invoices/generated/; regenerate it with `make codegen`. | hook |
  | R09 | Prefer early returns over nested ifs. | delete |
  | R10 | Always run the tests before you say you are done. | hook |
  | R11 | tests/fixtures/invoices.json is synthetic: the names look real but are not personal data, edit them freely. | memory |
  | R12 | src/invoices/old_api.py is dead code; do not copy its patterns. | code |
- Literal walk of the ladder (for the author, the judges and the mentor; Y = first yes, n = no with the starter file that
  says so; steps after the first Y are not asked):
  | id | 1 command | 2 existing hook/check | 3 ignoring is harmless | 4 code change | 5 stop in turn | 6 detect after | 7 |
  |---|---|---|---|---|---|---|---|
  | R01 | n (a fact, not a command) | n (settings: Stop + PreToolUse only; Makefile `test`, `codegen`) | Y: Makefile and `src/` show it | | | | |
  | R02 | n (a fact) | n (no hook or target knows the layout) | Y: the tree shows it | | | | |
  | R03 | Y: the test command of the whole project | | | | | | |
  | R04 | n (a rule) | n (no test covers call sites; `statement.py` swap is green) | n: the swap in `statement.py` is the harm | Y: keyword-only signature | | | |
  | R05 | n (a rule) | n (no import check exists in L1) | n: an import across the boundary is the harm | n: no source change makes an import impossible | n: a forbidden import found after the turn costs one edit; nothing irreversible happens | Y | |
  | R06 | n (a rule) | n (no import check in L1: Makefile `test`, `codegen` only) | n: raw sqlite3 in a handler is the harm; `old_api.py` shows it gets copied | n: no source change makes an import impossible | n: found after the turn it costs one edit | Y: an AST import check | |
  | R07 | n (a rule) | n (no import check in L1) | n: new code on `legacy_format` ties it to the partner format | n: `legacy_format.py` docstring, partner contract forbids moving it | n: found after the turn it costs one edit | Y | |
  | R08 | n (`make codegen` regenerates one directory; it does not build, test or check the whole project) | Y: PreToolUse `protect_generated.py` in `.claude/settings.json` | | | | | |
  | R09 | n (a style) | n (no linter, hook or target checks nesting) | Y: a preference with exceptions | | | | |
  | R10 | n (a rule about when, not the command) | Y: Stop hook `stop_tests.py` | | | | | |
  | R11 | n (a fact) | n (no hook or check reads fixtures) | n: an agent that treats the names as personal data refuses or anonymises | n: a JSON fixture is data, not code | n: no moment of the turn to stop | n: no program tells synthetic from real names | Y |
  | R12 | n (a fact) | n (nothing checks `old_api.py`) | n: it is the only raw-sqlite3 example besides the repository, agents copy patterns (R OA) | Y: delete the module, `rg` shows no importer | | | |
  The author ships the 00 L6 PreToolUse hook files in the L1 starter; the student run confirms the R08 walk on it.
- Checks:
  1. `rule-placement`, command, `python3 -I "$ACADEMY_CHECKS_DIR/verify_placement.py"`, timeoutSec 30, weight 2, capped:
     3 scored submissions (2.5). Stage 0 (free, its message names the item; task.md copies the list):
     (s1) `placement.json` strict JSON object with exactly keys R01-R12, each value one of `delete|code|check|hook|memory`;
     CLAUDE.md is read as UTF-8 and NFKC-normalised first.
     (s2) the only memory file in the workspace is `./CLAUDE.md`: no other file named `CLAUDE.md`, `CLAUDE.local.md` or
     `AGENTS.md` anywhere, nothing under `.claude/rules/`, and no `@` import token anywhere in CLAUDE.md, code spans and
     fences included: module 01 L2's `IMPORT_TOKEN` (any `@` not after a letter or digit, followed by a non-space),
     stricter than Claude Code by construction (it imports `**x**@a.md`, `<!-- c -->@a.md`); `billing@example.com`
     passes (V11). Lesson-author: Claude Code reads `AGENTS.md` by default only when there is no `CLAUDE.md` or
     `CLAUDE.local.md` (memory.md); say the exercise forbids it because it parks the rule in memory for agents that read
     it, never that it loads next to `./CLAUDE.md`. memory.md does not import `@` inside code spans and fences: the lesson
     presents the whole s2 `@` rule as this exercise's rule, never as Claude Code behaviour.
     (s3) the set of `[Rnn]` tags in CLAUDE.md equals the set placed `memory`; each such tag is on exactly one line; a
     line carries at most one tag; a tagged line has at most 10 words more than its rule's pristine line.
     (s4) at most 3 CLAUDE.md lines that are not blank and carry no tag, each at most 15 words; a word is any run of
     non-space characters, a list marker included; every non-blank line counts, a code-fence line included; a `#`
     heading counts as such a line unless it is identical to a heading of the starter CLAUDE.md
     (`checks/data/rule_texts.json`); the s4 message gives the line number and word count of each offending line;
     (s5) for every rule not placed `memory`, no run of 6 consecutive words of its pristine text (lower case,
     punctuation and `[Rnn]` tags removed; from `checks/data/rule_texts.json`) appears in the word stream of the whole
     CLAUDE.md, normalised the same way: across line breaks, headings and list markers included.
     Then the key (`checks/data/placement_key.json`): pass when >= 11 of 12 match; feedback "не пройдено" only.
     Rates: blind 2.007e-7 per submission. Partial-knowledge search, exact optimal adaptive strategy
     (`judge-r3/arith/l1search.py`, judge-assessment round 3, copied to `arch4/arith/`; sure of k cards, uniform over 5 layers on the rest), pass within the cap of 3:
     | Sure of | Binary "не пройдено" | Count "N из 12" |
     |---|---|---|
     | 10 of 12 | 84.0% | 84.0% |
     | 9 of 12 | 31.2% | 47.2% |
     | 8 of 12 | 8.2% | 19.2% |
     Decision (Stepan: count only if "sure of 8" <= 15%): count gives 19.2%, so feedback stays binary. Binary equals the
     judge's greedy cover (uncapped: certain after 5, 14, 68): sure of 10 of 12 passes most of the time, sure of 11 on
     the first submission, sure of 8 under 10%. Residuals: paraphrase within the s3/s4 word budget, i.e. 3 untagged lines
     of at most 15 words plus 10 extra words on each memory line (45 + 20 = 65 words, against 113 normalised words of
     the ten moved texts, so verbatim retention does not fit, with or without filler words) (12.2); RS1, RS2, RS8 (2.8).
     Must fail: starter; R05 tag left after placing it `check`; tags stripped but all 12 texts kept (s3: the tag set
     is empty, not the memory set); the moved texts as 5-word `##` headings (s4; s5 on the whole-file stream); one
     untagged line of 16 words (s4); a new `## Notes` heading plus 3 untagged lines (s4); two rule
     texts kept verbatim without tags (s5); texts moved to `CLAUDE.local.md`, `AGENTS.md`, `.claude/rules/a.md`,
     `.claude/CLAUDE.md` (s2); imports `@docs/rules.md`, `**Rules:**@docs/rules.md`, `<!-- rules -->@docs/rules.md`, an
     `@` line after an unbalanced backtick, `` `@docs/rules.md` `` in a code span (s2); verbatim moved texts on `[R03]`
     lines with a tag every 3 words (s3 one tag per line); one `[R03]` line paraphrasing all ten moved rules (s3 +10
     words); a second line tagged `[R03]` (s3); 4 untagged lines (s4); "late_fee takes the amount first and the days
     second" inside a new sentence (s5); correct placement with CLAUDE.md untouched (s3); two wrong placements (R08
     `check`, R07 `code`); every value `memory` with all tags kept. Must pass: key; key with one deviation (R09 `memory`,
     tag kept); one paraphrased untagged line; an untagged line of 15 words; the starter's own heading kept; an e-mail
     address in an untagged line; a memory line reworded with 9 extra words; `[R03]` followed by a fenced `make test`
     block (2 fence lines and the command line: 3 untagged lines).
  2. `poka-yoke-applied`, command, `python3 -I "$ACADEMY_CHECKS_DIR/verify_pokayoke.py"`, timeoutSec 120 (probe 20 s +
     suite 60 s), weight 2. Stage 0 (static AST): `src/invoices/late_fee.py` has exactly one module-level `late_fee` with
     parameters `amount_cents` and `days_late`, both keyword-only, no defaults, no `*args`, no `**kwargs`; every call of
     `late_fee` (name or attribute) in `src/` and `tests/` passes only named arguments (no positional, no `**`);
     `src/invoices/old_api.py` does not exist, no function under `src/` or `tests/` is named `list_invoices_v0` or has
     a body equal (normalised `ast.dump`, `checks/data/old_api_bodies.json`) to a function of the pristine `old_api.py`;
     every pristine test name of `test_late_fee.py` and `test_statement.py` still exists. Hidden (one learner-code
     subprocess, pipe record): `late_fee(amount_cents=a, days_late=d)` over a 35-point grid equals the pristine reference;
     a positional call raises `TypeError`; `statement_line` over 48 invoices (4 amounts, paid 0 or half, 6 lateness
     values incl. -3 and 400) equals `checks/data/statement_grid.json` (a call that raises counts as a mismatch). Then
     the suite as 2.3.
     Must fail: starter (signature); callers not updated (stage 0 count, first `statement.py:13`); `*args`; a default;
     `late_fee(**{...})`; arithmetic changed; `old_api.py` emptied; renamed; renamed with the function renamed
     (fingerprint); a starter test renamed `_disabled_*`; a starter test skipped; names converted by position, swap kept
     (`statement_line` mismatch); the same plus a workspace `unittest/` package printing "OK" (still the mismatch);
     a red starter test marked `@unittest.expectedFailure` (suite, 2.3); top-level `os._exit(0)` in `late_fee.py` (no
     record). Must pass: reference; reference plus a `unittest/` shadow
     package (the bootstrap ignores it, the real suite is green).
  3. `code-over-rules-quiz`, quiz, passScore 0.8, weight 1. Topics: place a new rule with the ladder (a card not in the
     list); a hook that blocks a style preference: demote; which of four controls are computational sensors (multiple);
     a swapped argument: keyword-only vs a CLAUDE.md line; map-style AGENTS.md vs a 600-line one (multiple: crowds out
     context, rots, cannot be checked); what a typed boundary gives the agent.
- Готово, когда: (1) `placement.json` has R01-R12, each one of the five values; (2) the only memory file is
  `./CLAUDE.md` (no `CLAUDE.local.md`, `AGENTS.md`, other `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/`), and
  CLAUDE.md has no `@` that does not follow a letter or digit, anywhere, code spans included (an e-mail address is
  fine); (3) CLAUDE.md keeps the `[Rnn]` tag of exactly the rules placed `memory`, each on one line, one tag per line, a
  tagged line at most 10 words longer than the rule; (4) at most 3 untagged lines, each at most 15 words; a word is
  any run of non-space characters, a list marker included; every non-blank line counts, a code-fence line included; a
  heading you add counts as one (the starter's headings do not); (5) no 6-word run of a rule you placed elsewhere stays in
  CLAUDE.md, read as one stream of words across lines and headings (after Unicode NFKC normalisation, ignoring case,
  punctuation and tags); (items 1-5 are checked free of charge and the message names the item) (6) at least 11 of 12
  placements follow the ladder; a submission counts only when items 1-5 pass; after the third counted "не пройдено"
  the check closes and the mentor reviews your placement; neither the check nor the mentor says which cards are wrong;
  (7) `late_fee` parameters `amount_cents`, `days_late` keyword-only, no defaults, no `*args`/`**kwargs`, results as
  before, a positional call raises `TypeError`; (8) every call of `late_fee` in `src/` and `tests/` uses named arguments
  without `**`, and `statement_line` charges the right fee on hidden invoices; (9) `old_api.py` deleted, its functions
  exist nowhere under another name; (10) every starter test kept, not skipped, not marked expected failure, the suite
  green (the check runs it with its own runner); (11) quiz >= 5 of 6.
- Как работать (совет): first step: open `.claude/settings.json` and the Makefile and list which hooks and targets exist;
  then walk each card through the seven questions in order and write down where it stopped; fix every free stage-0
  message before you spend a counted submission, and re-walk every card you hesitated on before each counted one; let
  the agent update the call sites and read the diff of `statement.py` before accepting it.

### L2 `02-architecture-checks`: "Проверка архитектуры, которая подсказывает агенту исправление"
- id `patterns-architecture-checks`, type `artifact`, O2, 75 min (theory 20, hands-on 55), prerequisites
  `[patterns-code-over-rules]`.
- Opening question: "Правило R05 ушло из CLAUDE.md. Что теперь скажет агенту, что он его нарушил, и что ему с этим
  делать?"
- Theory: R A2 sensors optimised for LLM consumption, custom lint messages with fix instructions (the author copies
  Böckeler's exact words or paraphrases without quotes), keep quality left; R OA custom linters and structural tests,
  "we write the error messages to inject remediation instructions", invariants not implementations; R A5 "prompt-engineer
  your error responses"; R A8 production equivalents (Ruff `banned-api` `msg`, ESLint `no-restricted-imports`
  `message`, import-linter contracts) and why the lesson uses a stdlib `ast` script; R A1 one entry point `make check`;
  01 L7 conventions (exit 0/1/2, one line per finding). Fixing a violation means changing code, never an exception; a
  rule checked on import statements is evaded by `importlib.import_module`, `__import__`, `exec` or `runpy`, and by
  any other way to run source without importing it (the `builtins` module, stdlib modules that run or compile source
  or load code objects, such as `code` or `cProfile`), and by putting another package's directory on `sys.path`, so
  the project also forbids the first group in `src/` and the check also observes at runtime where loaded code comes
  from.
- Starter: L1 reference without `placement.json`, plus three seeded violations: `src/ledger/report.py` imports
  `invoices.money` (A1); `src/invoices/api.py` `/health` imports and calls `sqlite3` (A2); `src/invoices/statement.py`
  `render_statement_line` uses `legacy_format.money_str` (A3); `scripts/check_architecture.py` with the plumbing
  (argparse, exit codes, `SyntaxError` -> 2, empty stdout) and `lint(root)` raising `NotImplementedError`;
  `examples/violations/` (one A1, one A2, one A3). The starter `src/` has none of the (w1) forms (practice-designer
  re-checks it for the revision-5 list, `src/invoices/generated/` included).
- Rules the learner implements (task.md prints them): scope every `*.py` under `<root>/src/`; every `import`/`from`
  statement anywhere in the file; text in strings and comments never counts; `# noqa` changes nothing. Imported modules:
  `import a.b` gives `a.b`; `from m import x` gives `m` and `m.x`; relative imports resolved against the file's package.
  A1: a file under `src/ledger/` imports `invoices` or below. A2: a file other than `src/invoices/repository.py` imports
  `sqlite3` or below. A3: a file other than `src/invoices/export_csv.py` imports `invoices.legacy_format` or below.
  Output `<RULE> <path>:<line>: <what is wrong>. Fix: <what to do>`, line of the statement's first line, one line per
  statement and rule however many of its imported names match, two rules give two lines; exit 0 clean, 1 findings, 2 with empty stdout on usage error, missing `src/`, or a file `ast.parse` rejects.
  Parsed by `^(A[123]) (\S+):(\d+): (\S.*?) Fix: (\S.*)$`.
- Checks:
  1. `arch-linter`, command, `python3 -I "$ACADEMY_CHECKS_DIR/verify_arch.py"`, timeoutSec 120 (8 runs x 12 s), weight 3.
     Stage 0: `scripts/check_architecture.py` exists. Hidden roots (2.3), shuffled: `a1-forms` (plain, dotted,
     aliased, `from` forms, a parenthesised import, inside a function, under `TYPE_CHECKING`, with `# noqa`,
     `x = 1; import invoices`; no finding for `from . import accounts`, `invoices_archive`, `invoicesx`, and
     `import invoices` lines inside a multi-line string); `a1-near` (`src/ledgerx/`, `tests/ledger/`, a string, `from
     ledger import accounts`: no finding); `a2-forms` (`import os, sqlite3`, `from sqlite3 import connect`,
     `sqlite3.dbapi2`, inside a function, `import os, \` + newline + `sqlite3`; no finding for `sqlite3x`, `mysqlite3`,
     `src/invoices/repository.py`, `scripts/*.py`; findings for `repository_helpers.py` and `src/ledger/repository.py`);
     `a3-forms` (`from . import legacy_format`, `from .legacy_format import`, `from invoices import legacy_format,
     models`, `import invoices.legacy_format as lf`, a multi-line parenthesised `from invoices import (models,
     legacy_format)`, `from ..legacy_format import` in a subpackage; `export_csv.py` allowed, `reports/export_csv.py`
     fires, `legacy_format_v2` does not); `combined`; `syntax-error`, `no-src` (exit 2, empty stdout). Second part:
     `lint-output.txt` equals, as a multiset, the learner linter's output on a pristine copy of `examples/violations`
     run from a temp dir, exit 1. No cap.
     Must fail (each 0/20 seeds): stub; substring linter; relative imports not resolved; allowance by file name;
     honouring `# noqa`; `end_lineno`; `tree.body` only; exit 1 on a parse error; no ` Fix: `; a line-anchored regex
     linter with a `compile()` syntax gate (the judge's, passes 20/20 on revision-1 roots); one line per matching
     name (message "повторов 1"); hardcoded output; hand-edited `lint-output.txt`. Must pass: reference 20/20;
     `lint-output.txt` with the linter's lines in another order.
  2. `arch-workspace-clean`, command, `python3 -I "$ACADEMY_CHECKS_DIR/verify_workspace.py"`, timeoutSec 300 (probe 20 s
     + suite 45 s + 3 make probes x 60 s = 245 s), weight 2.
     (a) the grader's own implementation of A1-A3 (`checks/arch_rules.py`) finds nothing in the workspace's `src/`
     (the learner's linter is not run here);
     (w1) anywhere in `src/`, the literal-name forms of dynamic execution:
     - no import in any form (`import m`, `import m as x`, `from m import ...`, `m` or below, matched by whole dotted
       components, so `traceback`, `codecs` and a first-party `from . import profile` pass) of `importlib`, `runpy`,
       `pkgutil`, `zipimport`, `builtins`, or the stdlib modules that run or compile source, or load code objects:
       `code`, `codeop`, `cProfile`, `profile`, `pdb`, `bdb`, `timeit`, `doctest`, `trace`, `marshal`, `pickle`,
       `py_compile`, `compileall`, `ctypes` (not each of them runs code: `py_compile` and `compileall` only write `.pyc`
       files, `codeop` and `marshal` only yield code objects, which `types.FunctionType` then runs);
     - no name `__import__`, `exec`, `eval`, `compile`, `__builtins__`, `__loader__`, `__spec__`;
     - no attribute `__import__`, `exec`, `eval`, `__builtins__`, `__loader__`, `__spec__`, `meta_path`, `path_hooks`,
       `path_importer_cache`; the attribute `compile` only as `re.compile` (receiver the name `re`);
     - no string or bytes literal equal to `__import__`, `exec`, `eval`, `compile` or `builtins`, or starting with
       `builtins.`, `builtins:` or `__builtins__` (closes `getattr(x, "exec")`, `sys.modules["builtins"]`,
       `f_builtins["exec"]`, `pkgutil.resolve_name("builtins:exec")`, `globals()["__builtins__"]`; prose such as a
       docstring "do not shadow Python builtins such as sum" passes).
     One rule for `compile`, stated identically in task.md: the bare name `compile` is banned whatever binds it, so
     `from re import compile` followed by `compile(...)` fails; write `re.compile(...)` after `import re`.
     Message, one line for the first form found: `<path>:<line>: <form> (пункт 4: <which group of item 4>)`, e.g.
     `src/shared/money.py:40: import doctest (пункт 4: модуль, который исполняет или компилирует код)`; the rule is
     public, so naming the line leaks nothing;
     (w2) runtime, in the learner-code subprocess with an audit hook on `sqlite3.connect`: after importing every module of
     the `ledger` package and calling `ledger.report.entry_lines`, no module named `invoices` or below is loaded and no
     loaded module has a `__file__` whose `realpath` lies under the copy's `src/invoices/`, whatever name it was
     imported under (closes `sys.path.insert(0, ".../src/invoices")` or `sys.path.append(...)` or
     `site.addsitedir(...)` followed by `import money`); while the (b) probes run, every `sqlite3` connection is opened
     from `src/invoices/repository.py` (the innermost `src/` frame on the call stack), and a connection with no code
     from `src/` on its call stack (for example `sqlite3.connect` handed straight to a thread pool) counts as opened
     elsewhere; a callback called from `src/` code still has that `src/` frame and is judged by it;
     (b) behaviour: `render_statement_line(7, 10050, 5, "EUR") == "#7: 100.50 EUR + fee 0.05 EUR"`, `handle("GET",
     "/health")` returns 200 `ok`, `entry_lines` output unchanged, `export_csv.csv_row` still in the partner format;
     (c) starter tests run and pass (2.3); (d) `make -s check` on copies: exit 0 as is, non-zero with a planted A1 file,
     non-zero with a planted failing test.
     Must fail: starter (a); the judge's evasion (`importlib.import_module` in `report.py`, `__import__("sqlite3")` in
     `api.py`) (w1); `runpy.run_path(".../invoices/money.py")` in `report.py`, with the reference or the starter
     `money.py` (w1); `exec(open(".../invoices/money.py").read(), ns)` (w1); round-3 B1 and its neighbours, each
     executing `money.py` text in `report.py` (w1), the 13 forms of section 11 rows 1-3 (`from builtins import exec as
     run_source`, `from builtins import compile as c` + `types.FunctionType`, `__builtins__["exec"]`,
     `print.__self__.compile`, `code.InteractiveInterpreter`, `cProfile.runctx`, `type(__loader__)(...)`, ...);
     `from re import compile` + `compile("x")` and `import re as r; r.compile` in `accounts.py` (w1);
     `sys.modules["builtins"].__dict__["ex" + "ec"]` and `globals()["__builtins__"]["ex" + "ec"]` (w1, the narrowed
     literal rule); in `report.py` with the starter `money.py`: `sys.path.insert(0, os.path.join(os.path.dirname(__file__),
     "..", "invoices"))` + `from money import format_cents`, `sys.path.append(str(Path(__file__).resolve().parents[1] /
     "invoices"))` + `import money`, `site.addsitedir(...)` + `from money import format_cents` (w2, `__file__` under
     `src/invoices/`); an unchecked-hash `src/ledger/__pycache__/report.cpython-312.pyc` that runs `money.py` behind a visible
     `report.py` that raises (no record: the copy has no `__pycache__/`); `import _sqlite3` in `api.py` (w2);
     `repository.sqlite3.connect(...)` and `repository.sqlite3.Connection(":memory:")` in `api.py` (w2; the second is
     accuracy's open question on 3.10-3.13: it fails on 3.12.13, re-run on the image interpreter before `ready`); the
     connection opened in a `ThreadPoolExecutor` worker from `api.py` (w2, no `src/` frame);
     `__builtins__["__import__"]("invoices.money")` in `report.py` (w1 since revision 4; w2 as well); statement on `money_str` (a, b); modules
     deleted (b); `check: test`; `|| true`; `-` prefix; `check: true` (d); a workspace `unittest/` package that exits 0
     (the suite runner ignores it, but `make check` turns green on the planted red test: (d)); a red starter test
     marked `@unittest.expectedFailure` (c); top-level `os._exit(0)` in `statement.py` (no record). Must pass: reference
     (`format_cents` in `src/shared/money.py`, `invoices.money` re-exports it, `repository.ping()`); `format_cents`
     copied into ledger (an invariant, R OA); `re.compile` in `src/ledger/accounts.py`; a docstring "no exec here" next
     to `con.execute`; `import traceback, codecs` in `src/invoices/api.py`; a first-party `src/ledger/profile.py`
     imported as `from . import profile`; a docstring "do not shadow Python builtins such as sum"; reference + `make
     codegen` (the regenerated `src/invoices/generated/` has no w1 form). Residuals (2.8, the mentor reviews the diff): RS3 (a builtin reached without a literal name,
     e.g. an identity search over `sys.modules` plus a string-built `compile` mode `"ex" + "ec"`, passes); RS4, read for
     the mentor as every executor outside the w1 list, e.g. a `subprocess` running the interpreter on `money.py`
     (shown passing, section 11).
  3. `remediation-rubric`, rubric, `checks/rubric-remediation.md`, artifacts `scripts/check_architecture.py`,
     `lint-output.txt`, passScore 0.7, weight 1. Criteria (0-2): M1 what is wrong and which boundary it protects, one
     clause; M2 the Fix names a concrete action and target; M3 an agent can act without reading CLAUDE.md; M4 one line,
     no stack trace, no shouting, no instruction to suppress the rule. Blind demo as 2.4, with an injection sample.
- Готово, когда: (1) your linter implements A1-A3, the output form and the exit codes as printed (checked on hidden
  projects); (2) `lint-output.txt` is your linter's output on `examples/violations`; (3) the check applies its own
  implementation of A1-A3 to your `src/` (your linter is not run there) and finds nothing; (4) `src/` runs no code
  without importing it: no import in any form (a submodule included) of `importlib`, `runpy`, `pkgutil`, `zipimport`, `builtins`, `code`,
  `codeop`, `cProfile`, `profile`, `pdb`, `bdb`, `timeit`, `doctest`, `trace`, `marshal`, `pickle`, `py_compile`,
  `compileall`, `ctypes` (each of these runs or compiles source, or loads code or objects that can run code, handed to
  it as text, bytecode or serialised data; for data use `json`; doctests and profiling belong in `tests/` or
  `scripts/`, which this rule does not cover; a name is matched whole, so `traceback` or `codecs` is fine); no name
  `__import__`, `exec`, `eval`, `compile`, `__builtins__`, `__loader__`, `__spec__`; no
  attribute `__import__`, `exec`, `eval`, `__builtins__`, `__loader__`, `__spec__`, `meta_path`, `path_hooks`,
  `path_importer_cache`; no string or bytes literal `"__import__"`, `"exec"`, `"eval"`, `"compile"`, `"builtins"`, or
  one starting with `builtins.`, `builtins:` or `__builtins__`; `compile` only as `re.compile(...)` after `import re`
  (so `from re import compile` fails); the message names the file, the line and the form; (5) at runtime importing
  every `ledger` module loads no code from `src/invoices/`, whatever name it is imported under (adding
  `src/invoices` to `sys.path` and importing `money` counts), and `sqlite3` connections are opened only by code in
  `src/invoices/repository.py` called from your code: a connection opened with no code from `src/` on its call stack
  (for example `sqlite3.connect` handed straight to a thread pool) counts as opened elsewhere; the check runs your code
  from a copy without `__pycache__/`; (6) starter behaviour kept: statement line in the `format_cents` format, `/health` answers 200 `ok`, ledger
  report and CSV export unchanged; (7) every starter test runs and passes, none skipped or marked expected failure;
  (8) `make check` exits 0 on your project and non-zero when one
  violation or one failing test is added; (9) rubric M1-M4.
- Как работать (совет): first step: write a tiny root with one A1 line and one relative import and decide what your
  linter must print for it; then let the agent draft `lint`; fix the three violations by changing code.
- No quiz: both command checks and the rubric practise the theory; remediation is quizzed in L3 and L5 scenarios.

### L3 `03-failure-analysis`: "Где и почему агент ошибается"
- id `patterns-failure-analysis`, type `artifact`, O3, 70 min (theory 22, hands-on 48), prerequisites
  `[patterns-architecture-checks]`.
- Opening question: "Агент придумал пакет `fastjsonx`. Что поменять, чтобы это не повторилось ни у этого агента, ни у
  следующего?"
- Theory (mechanism, then environment fix; no study number graded): R B1 distractors (the code link is reasoned, say
  so); R B2 stale versions -> pinned interpreter in the check, local docs; R B3 invented packages -> dependency
  allowlist ("slopsquatting" not attributed); R B4 METR: an instruction not to cheat did not stop it, the fix is
  environmental (01 L1/L6 referenced); R B5 sycophancy; R B6 a 50% horizon is not reliability; R B7 CC four-way triage;
  R A4/A2/OA the steering loop; R A6 a faithfully followed stale instruction. Then the cause classes, mapped to the
  mechanisms (gamed-check: reward hacking; invented-api and stale-api: training-data limits; repo-misled: distractors and
  stale memory; missing-fact: underspecified task; no-self-check: claims without evidence), and the ladder with step 0.
- Cause classes (ordered, first "yes" wins; task.md prints them): 1 `gamed-check` (changed a check or special-cased the
  checked input); 2 `invented-api` (a package, module, function or option that does not exist); 3 `stale-api` (exists,
  but not in the pinned version); 4 `repo-misled` (copied a legacy or duplicate pattern, or followed a stale memory
  line); 5 `missing-fact` (a fact the repo does not contain); 6 `no-self-check` (declared done without running anything
  that could fail). Layers: `delete | code | check | hook | memory | task`.
- Starter: L2 reference without `lint-output.txt`, plus `incidents/I01.md` ... `I10.md` (8 files, 15-30 lines each:
  context line, transcript excerpt, diff; fiction, labelled; each incident's context says which hooks and checks its
  repo had), `failure-log.json` template, `allowed-imports.txt` (comment header, no entries), `src/invoices/export_json.py`
  left by I02 (`import fastjsonx`, `to_json` = `fastjsonx.dumps(data, sort_keys=True)`, its import fails),
  `scripts/check_deps.py` with plumbing and `find_unknown_imports(root)` raising `NotImplementedError`.
  | id | Incident | Cause | Layers | Walk (step 0, then 2.7; first yes) |
  |---|---|---|---|---|
  | I01 | No Makefile target; agent runs `python3 -m unittest`, gets `No module named invoices`, says "environment issue, done" | missing-fact | code, memory | 0 n; 1 Y: the test command (memory); a `make test` entry point (code) is the stronger fix, accepted |
  | I02 | `import fastjsonx`; `pip install` fails; it vendors a stub | invented-api | check, hook | 0-4 n; 5 Y: a deny on `pip install` stops an irreversible install; the gate in `make check` (6) accepted |
  | I03 | Project pins 3.10 (`requires-python`); agent uses `datetime.UTC` (added in 3.11) | stale-api | check | 0-4 n; 5 n: found in time by the check; 6 Y: suite on the pinned interpreter in `make check` |
  | I04 | Handler opens `sqlite3` directly, copied from a dead module | repo-misled | check, code | 2 Y: A2 already exists in `make check` (L2); deleting the dead module (4) accepted |
  | I05 | Agent edits an expected value in a test "to reflect the new behaviour" | gamed-check | check, hook | 5 or 6: hidden or mutation tests (6); deny edits of `tests/` during implementation (5) |
  | I07 | "Show overdue invoices": agent guesses `due_on < today`; the business meant "past the grace period" | missing-fact | task | 0 Y: an ambiguous requirement guessed |
  | I08 | "Done, all good" after an edit with a syntax error; nothing was run (repo has no Stop hook) | no-self-check | hook | 5 Y: before the turn ends |
  | I10 | CLAUDE.md says `make lint`; the target was removed a year ago; 40 turns recreating it | repo-misled | delete, code, memory | 1 Y: the line names the check command, correct it (memory); deleting it or restoring the target accepted |
  (I06 and I09 stay free for the reserve, 3 unseen incidents with keys and walks.)
- Checks:
  1. `failure-log`, command, `python3 -I "$ACADEMY_CHECKS_DIR/verify_failure_log.py"`, timeoutSec 30, weight 2, capped at
     10 counted failures (2.5). Stage 0 (free): strict JSON; keys exactly the 8 ids; each value an object with exactly
     `cause`, `layer`, `fix`; `cause` and `layer` in their enums; `fix` a non-empty string <= 400 chars. Counted: an
     incident is right when `cause` equals the key and `layer` is in its set; pass when >= 7 of 8; message "N из 8
     разборов неверны". Rates (accepted-layer counts 2,2,1,2,2,1,1,3 of 36 combinations): blind 3.15e-9 per submission;
     per-item-oracle upper bound over 10 submissions 1.02% (a channel the feedback and mentor rules forbid); an
     aggregate-count hill climb within the cap passed 0 of 20,000. Must fail: starter (stage 0); two wrong (counted).
     Must pass: key; key with the alternative layers (I01 code, I02 check, I05 hook, I10 delete); key with one wrong.
  2. `deps-gate`, command, `python3 -I "$ACADEMY_CHECKS_DIR/verify_deps.py"`, timeoutSec 150 (5 runs x 12 s + workspace
     probe 20 s + suite 45 s = 125 s), weight 2. Rules the learner implements (printed): read `<root>/allowed-imports.txt` (one
     name per line, `[A-Za-z_][A-Za-z0-9_]*`, `#` comments and blank lines allowed, any other line -> exit 2); for every
     absolute import statement in `<root>/src/**/*.py` (any depth, `try/except ImportError` included) take each module's
     top-level name; allowed when in `sys.stdlib_module_names`, a first-party name (a directory or `.py` module directly
     under `<root>/src/`), or listed (exact case); relative imports are first-party. One line per disallowed name
     `D1 <path>:<line>: '<name>' <what>. Fix: <what to do>`, parsed by
     `^D1 (\S+):(\d+): '([A-Za-z_][A-Za-z0-9_]*)' (\S.*?) Fix: (\S.*)$`; exits 0/1/2 as L2 (2: no `src/`, no allowlist,
     malformed allowlist line, a file `ast.parse` rejects).
     Part (a) hidden roots (2.3): `stdlib-and-first-party` (`from __future__ import annotations` first, then json,
     `importlib.metadata`, `xml.etree`, `zoneinfo, graphlib` on one line, `from invoices import models`, a top-level
     `src/shared_util.py`, relative imports, `import requests` lines inside a multi-line string: no finding);
     `allowlist` (httpx and typing_extensions listed with a comment and a blank line; `Httpx`, `requests, yaml`,
     `fastjsonx.core`: findings); `hidden-places` (`try: import ujson`, an import in a function, `import os, simplejsonx`,
     `x = 1; import msgpackx`, a backslash continuation, a parenthesised multi-line `from rapidjsonx import (...)`);
     `bad-allowlist` (`httpx==0.28.1` -> 2); `no-allowlist` (-> 2). Stdlib membership is computed by the interpreter
     that runs the learner script; root names are stable across 3.10-3.13 (12.6 d).
     Part (b), workspace: the grader's own implementation of D1 (`checks/deps_rules.py`) with the starter's (empty)
     allowlist and the starter's first-party names `invoices`, `ledger`, `shared` (both from `checks/data/`; the
     workspace's allowlist and `src/` listing are not read) finds nothing; no file of any extension and no directory
     under `src/` that the starter did not have, `__pycache__/` excepted (`checks/data/pristine_src.json`, which lists
     the starter's `src/invoices/generated/` files too; the message names every new path and says to delete it: `pip
     install -e .` leaves a `src/*.egg-info/`, macOS a `.DS_Store`, editors `*~`, `.#*` or `*.swp`; OS and editor files
     are not exempt, no exception list to maintain); `export_json.to_json(d)` returns
     `json.dumps(d, sort_keys=True)` for a hidden `d`; starter tests run and pass (2.3).
     Must fail: (a), 0/20 each: stub; hand-written stdlib list; dotted names compared to the allowlist; relative imports
     reported; `tree.body` only; case-insensitive allowlist; first-party hardcoded; lenient allowlist parser; the judge's
     line-regex gate (20/20 on revision-1 roots). (b): starter; `fastjsonx` added to the workspace allowlist; a vendored
     `src/fastjsonx.py`, `src/fastjsonx/__init__.py` or `src/invoices/fastjsonx.py` (the I02 anti-pattern itself); a
     sourceless `src/invoices/fastjsonx.pyc` with `from . import fastjsonx` (new file); any new file, e.g.
     `src/invoices/extra.json`; an empty `src/invoices/fastjsonx/` (namespace package) plus `fastjsonx.dumps =
     json.dumps` in `export_json.py` (new directory); a `src/*.egg-info/` (new directory, the honest-failure case);
     `src/invoices/.DS_Store`, `src/invoices/export_json.py~` and `src/invoices/.export_json.py.swp` (each named in the
     message); an
     unchecked-hash `__pycache__/export_json.cpython-312.pyc` behind a visible `export_json.py` that raises (`to_json`:
     the copy has no `__pycache__/`); a `try: import fastjsonx ... except ImportError: import json` fallback; output without
     `sort_keys`; a red starter test marked `@unittest.expectedFailure`; a skipped starter test; top-level `os._exit(0)`
     in `export_json.py`. Must pass: reference 20/20; a gate that validates with `compile()` before `ast` (failed
     revision 1's `__future__` root); reference plus a `src/invoices/__pycache__/` file; reference + `make codegen` (it
     deletes and rewrites `src/invoices/generated/` with the same two file names; if the L1 codegen ever writes another
     name, `pristine_src.json` takes it). Residuals (2.8, the mentor
     reviews the diff): RS5 (no form known after the new-file rule and the `__pycache__/`-free copy), RS6
     (`sys.modules.setdefault("fastjsonx", json)` in `invoices/__init__.py` passes), RS7 (`class
     fastjsonx` appended to `money.py` passes). The judge's string scan and module baseline are not built: they serve
     only RS6/RS7, and the scan would fail an honest comment that names the incident.
  3. `failure-fix-rubric`, rubric, `checks/rubric-failure-fix.md`, artifacts `failure-log.json`, `scripts/check_deps.py`,
     passScore 0.7, weight 2. Criteria (0-2): F1 each fix concrete at the layer named; F2 it prevents the recurrence for
     the stated cause; F3 no "tell the agent to be careful / not to cheat" where a deterministic layer exists (R B4);
     F4 proportional. Blind demo as 2.4.
  4. `failure-analysis-quiz`, quiz, passScore 0.8, weight 1. Topics: near-duplicate helper and wrong reuse; an agent
     without internet access uses a newer API (multiple: pinned interpreter in the check, local docs, not "write the
     version in CLAUDE.md" alone); defending against invented packages (multiple); "do not edit tests" in the prompt and
     it still happens; a user insists on a wrong root cause; a 3-hour autonomous feature and a 50% horizon.
- Готово, когда: (1) `failure-log.json` per stage 0 (checked free of charge, list as above); (2) >= 7 of 8 incidents with
  the cause by the ordered classes and an accepted layer by the ladder with step 0; the check reports only the count,
  closes after 10 counted failures; (3) `scripts/check_deps.py` as printed (checked on hidden projects); (4) the check
  applies its own D1 to your `src/` with the starter's empty `allowed-imports.txt` and the starter's first-party names
  `invoices`, `ledger`, `shared` (your allowlist edits are not read) and finds nothing; (5) no new file of any
  extension and no new directory under `src/` (`__pycache__/` excepted; delete the `src/*.egg-info/` that `pip install
  -e .` leaves, and OS or editor files such as `.DS_Store` or `export_json.py~`; the message names each path): a vendored stand-in for a missing package is exactly incident I02; the check runs your code from a copy
  without `__pycache__/`;
  (6) `export_json.to_json(d)` returns the same string as `json.dumps(d, sort_keys=True)`; (7) every starter test runs
  and passes, none skipped or marked expected failure; (8) rubric F1-F4.
- Как работать (совет): first step: read I01 and I07 and walk them aloud through the classes and the ladder; fill the
  log; then reuse your L2 import walk for `check_deps.py`; fix `export_json.py` last.

### L4 `04-closed-environments`: "Закрытый контур"
- id `patterns-closed-environments`, type `artifact`, O4, 60 min (theory 25, hands-on 35), prerequisites
  `[patterns-failure-analysis]`.
- Opening question: "Банк: интернета нет, модель доступна только через внутренний шлюз. Что в этой настройке Claude Code
  сломается первым, а что утечёт?"
- Shape: find and repair seven planted, documented defects; each is judged gone by its documented effect, any
  documented form or placement passes, guards catch regressions (semantics quoted in 12.9).
- Theory (plain paragraphs, then a list diagram: laptop -> gateway -> model; laptop, sandbox -> mirror). Core: gateway vs proxy vs CA vs mirror vs egress allowlist (R C1, C4, C6); the base URL has no `/v1`
  (V7 curl example); credentials never in project settings, a committed token must be revoked or rotated because
  deleting it leaves it in git history (V7); `apiKeyHelper` for short-lived tokens (V7, V12); settings `env` applies
  over the shell and is the only configuration that reaches background agents; between files: local over project over
  user (V2, V3, V8); presence-only variables vs on/off variables (V1); `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` and its
  "0 still disables" trap (V1); WebSearch/WebFetch: a bare deny removes the tool, `WebFetch(domain:*)` keeps it, the
  env variable removes only WebFetch (V4, V1); the sandbox allowlist only pre-allows: outside it the permission mode
  decides (in Manual mode you get a prompt; auto, `dontAsk` and `bypassPermissions` differ, sandboxing.md), and only
  `strictAllowlist` in user, managed or `--settings` settings, or managed `allowManagedDomainsOnly`, refuses in every
  mode; under a user strict allowlist the repository's `allowedDomains` are ignored (V5, V6). The author writes exactly
  this; "other hosts prompt" without the mode is a blocking error in lesson text. The precedence model holds "in a
  terminal session in a trusted folder": the Desktop app and self-hosted runners build their own launch environment,
  and project and local `env` and a project `apiKeyHelper` apply only after workspace trust (settings-reference,
  llm-gateway-connect); task.md and theory say so; every tool trusts certificates its own way: `NODE_EXTRA_CA_CERTS` for Claude Code, `SSL_CERT_FILE` for uv
  (V9, V13); uv: `UV_DEFAULT_INDEX` replaces the default index, while `UV_INDEX` only adds indexes and the public
  default stays (V13), named side by side as `NODE_EXTRA_CA_CERTS` vs `SSL_CERT_FILE` are; "Claude Code does not support SOCKS proxies", and for NTLM/Kerberos the docs
  suggest a gateway (V9); a weaker local model: more and earlier sensors (Jain, R B10: one experiment on a
  cost-optimised API model, GPT-6 Luna via Codex, never called "hosted"; open-weights models were untested future work,
  so the lesson calls this an extrapolation; cite the article, V10 and V14, not R C1), more invented packages for open models (R B3), stale APIs without web search
  (R B2), smaller tasks (R C9, reasoned). "Справка" block from the start (collapsed): the supported routes (gateway,
  Bedrock, Google Cloud's Agent Platform, Foundry, Claude Platform on AWS, the Bedrock Mantle endpoint; provider
  switches `CLAUDE_CODE_USE_BEDROCK|VERTEX|FOUNDRY|ANTHROPIC_AWS|MANTLE`, V10) vs a local open-weight model behind CC
  (works per Ollama/vLLM/llama.cpp docs, unsupported by Anthropic, R C1-C2); `allowedProviders: ["customEndpoint"]` as a
  managed setting, admitted only for the exact `ANTHROPIC_BASE_URL` a managed `env` block pins (V12, settings-reference); `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT` as the env-vars row states it, and the 2.1.312 change of the
  shorter prompt for unrecognised model names on Bedrock, Vertex, Foundry and Mantle only (V14), not claimed for a
  gateway or a local model; WebFetch preflight and `skipWebFetchPreflight`; the Codex contrast table from R C8 only.
- Starter (fiction): the L3 reference without `failure-log.json` and `incidents/`, shipped without a `.git` directory,
  plus:
  - `docs/contour-brief.md`: the model only through the gateway `https://llm.corp.local`; tokens are short-lived and
    only `/opt/corp/bin/llm-token` prints one; the bank's root CA is the file `/etc/corp/ca-bundle.pem`, not in the OS
    trust store, and signs the gateway and the mirror; Python packages only from the uv mirror
    `https://pypi.corp.local/simple` on port 443; Bash needs the mirror and nothing else; no internet, no proxy; no web
    tools, while the agent keeps its file and shell tools; non-essential traffic off; the team installs with `uv`, also
    from their own terminals, which read only the bank profile `launcher.env`, and also outside this repository, so
    uv config files (`pyproject.toml`, `uv.toml`, at project, user or system level) do not count: the team's machines
    get uv settings only from `launcher.env`; the launcher and every login shell load
    `launcher.env` line by line as `KEY=VALUE` without stripping `export`, quotes or spaces, and accept CRLF line endings;
    `/etc/corp` holds only the CA bundle; the hooks in `.claude/settings.json` stay as they are and stay on.
  - `launcher.env`: `ANTHROPIC_BASE_URL=https://api.anthropic.com` and `NODE_EXTRA_CA_CERTS=/etc/corp/ca-bundle.pem`
    under the comment `# corporate CA, for every tool`.
  - `.claude/settings.json`: `env.ANTHROPIC_AUTH_TOKEN` = a fake `sk-corp-...` token; `permissions.allow: ["WebFetch"]`;
    `permissions.deny: ["Read(.env)", "Read(.env.*)"]`; `sandbox: {enabled: true, network: {strictAllowlist: true,
    allowedDomains: ["pypi.corp.local", "pypi.org"]}}`; the L1 hooks.
  - `home/.claude/settings.json` = `{}` (stands for `~/.claude/settings.json`).
- Planted defects and guards: the grader's specification and the mentor's reference, never printed in task.md or echoed
  by the check (the L1 walk-table convention). "Effective value" of a variable = the first that sets it among
  `.claude/settings.local.json` env, `.claude/settings.json` env, `home/.claude/settings.json` env, `launcher.env`
  (settings over shell, then settings precedence, V2, V3, V8); a setting's effective value = first among local, project,
  user (V3).
  | Id | Starter defect (documented effect) | Gone when | Accepted forms (and why the rest fail) |
  |---|---|---|---|
  | G1 | requests go to `api.anthropic.com`, outside the contour | effective `ANTHROPIC_BASE_URL` is `https://llm.corp.local` (one trailing `/` allowed) | any of the four places; `/v1` fails (V7: CC appends `/v1/messages`); `http://` and other hosts fail (brief) |
  | G2 | a static token committed in project settings ("committed and shared", V7) | no `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` key in any of the four places, the leaked token string in no workspace file (bytes scan), effective `apiKeyHelper` is `/opt/corp/bin/llm-token` | helper in any settings file (scope "Any file", V12); a static token anywhere fails (brief: only the helper prints tokens), an empty value too (not documented for credentials) |
  | G3 | non-essential traffic on | effective `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is non-empty | any non-empty value incl. `0`, `false` (presence-only, V1); empty means unset (V1), so an empty user-env value over a launcher `1` fails |
  | G4 | uv uses its default index (public) | `launcher.env` sets `UV_DEFAULT_INDEX` or `UV_INDEX_URL` to the mirror (`/simple` or `/simple/`), every place that sets either names the mirror, and every item of `UV_INDEX` (a `name=` prefix allowed, V15) or `UV_EXTRA_INDEX_URL` (plain URLs only: `name=` is documented for `--index`/`UV_INDEX`, not here), wherever set, is the mirror | `UV_INDEX_URL` is a documented deprecated equivalent (V13); `UV_INDEX` alone adds an extra index and leaves the default (V13): fails; `UV_EXTRA_INDEX_URL` is the deprecated alias of `UV_INDEX` (V13); a public extra index fails (brief: packages only from the mirror); settings-env only fails (brief: terminals read only `launcher.env`); `[[tool.uv.index]] default = true` in `pyproject.toml` (documented, V15), or `[[index]] default = true` in a project, user (`home/.config/uv/uv.toml`) or system `uv.toml`, fails (brief: uv config files do not count, the check does not read them) |
  | G5 | uv does not trust the bank CA: `NODE_EXTRA_CA_CERTS` is Claude Code's, uv reads `SSL_CERT_FILE`/`SSL_CERT_DIR` (V9, V13) | `launcher.env` sets `SSL_CERT_FILE=/etc/corp/ca-bundle.pem` or `SSL_CERT_DIR=/etc/corp`, and every place that sets either agrees | `UV_SYSTEM_CERTS` loads the OS store, which lacks the CA (brief, V13): not a fix; settings-env only fails (terminals) |
  | G6 | web tools available | WebSearch removed: a deny entry (any settings file; deny wins across scopes, V4) that is `WebSearch` or a tool-name glob matching it (`Web*`); WebFetch removed: the same, or effective `CLAUDE_CODE_DISABLE_WEB_FETCH` in `1|true|yes|on` any case (V1) | fail with their reason: `"*"`, `Bash(*)` or any bare name or glob matching `Bash`, `Read`, `Edit`, `Write`, `Glob` or `Grep` (for example `W*`, `*e*`: removes a file or shell tool the brief keeps; for `Glob` and `Grep` the demo-log reason says "file tools where present": tools-reference leaves them out by default on macOS, Linux and WSL, V15); `WebFetch(domain:*)` in deny (keeps the tool and cuts the sandbox off from every host, V4); `WebSearch(*)`/`WebFetch(*)` (the `Tool(*)` form is documented for Bash only, V4); env `0|false|no|off` (turns it on, V1); any other env value (not an on/off value) |
  | G7 | `strictAllowlist` in project settings has no effect (V5); in Manual mode the sandbox prompts for any unlisted host, and the project list holds `pypi.org` | `home/.claude/settings.json` `sandbox.network.strictAllowlist` is JSON `true`; effective `sandbox.enabled` is JSON `true`; the user-scope allowlist (`allowedDomains` plus `WebFetch(domain:X)` allow rules in user settings) is non-empty and every entry is `pypi.corp.local` or `pypi.corp.local:443` | the repository's `allowedDomains` and `WebFetch(domain:)` allow rules are ignored under a user strict allowlist (V6), so they pass whatever they hold and the mirror must be in user settings; `*.corp.local` fails (broader than the brief's one host); other hosts, other ports, `WebFetch(domain:*)` in user allow fail (brief) |
  | N1 | guard: Claude Code trusts the CA | effective `NODE_EXTRA_CA_CERTS` is `/etc/corp/ca-bundle.pem` | any of the four places (V8 "All environment variables shown on this page can also be configured in settings.json") |
  | N2 | guard: no provider switch away from the gateway | effective `CLAUDE_CODE_USE_BEDROCK|VERTEX|FOUNDRY|ANTHROPIC_AWS|MANTLE` unset, empty or an off value | the five provider variables (V10); `CLAUDE_CODE_USE_POWERSHELL_TOOL` is not a provider and is not read |
  | N3 | guard: the launcher can read the file | lines `KEY=VALUE`, key `[A-Z_][A-Z0-9_]*`, value without spaces or quotes, no duplicates; `#` comments, blank lines, CRLF allowed | extra keys allowed (for example `DO_NOT_TRACK`, `CLAUDE_CODE_API_KEY_HELPER_TTL_MS`) |
  | N4 | guard: files parse, hooks kept and on | the three settings files (local one optional) are strict JSON objects, `env` maps names to strings, project `hooks` equals the pristine copy, effective `disableAllHooks` (first among local, project, user, V15) is not `true` | hooks added in local settings merge and pass; user `true` under a project or local `false` passes (hooks stay on) |
- Not graded (no planted defect, cannot undo one): `deniedDomains`, `allowUnsandboxedCommands`, `failIfUnavailable`,
  `CLAUDE_CODE_CERT_STORE`, `UV_SYSTEM_CERTS` next to `SSL_CERT_FILE` (the file overrides it, V13), `skipWebFetchPreflight`,
  proxy and mTLS variables, managed settings.
- Checks:
  1. `contour-config`, command, `python3 -I "$ACADEMY_CHECKS_DIR/verify_contour.py"`, timeoutSec 30, weight 3. G1-G7,
     N1-N4; each failing rule is reported once as "не выполнено:", its id and the brief requirement it protects (the
     "Готово, когда" wording, e.g. "не выполнено: G5: uv в терминалах команды доверяет корневому CA банка"), never the
     file, key or value; no cap
     (per-requirement feedback is fair, and finding the key and the scope stays the learner's work). The per-reason
     detail goes only to the demo log. Demo matrix (103 cases, section 11), from the table: must fail = the
     starter, the starter with only G7 left, and every form the "Accepted forms" column rejects, each with its rule (plus
     a public URL in user env over a correct launcher, the token in a comment or in `docs/notes.txt`, an empty G3 in user
     env over launcher `1`, local `enabled: false`, `export`, quotes, a duplicate key, hooks removed, a non-string env
     value); must pass = the reference and every form the column accepts (incl. URL only in user env, helper in project
     settings, G3 `0`/`false`, `UV_INDEX_URL` alone, `SSL_CERT_DIR`, env `true`/`TRUE`/`On`, `Web*`, user-scope deny with a
     project `allow: ["WebFetch"]`, `:443`, `pypi.org` left in the project list, a user `WebFetch(domain:pypi.corp.local)`
     allow, `sandbox.enabled` only in user settings, `NODE_EXTRA_CA_CERTS` in user env, empty `CLAUDE_CODE_USE_VERTEX`,
     extra keys, CRLF, `UV_INDEX` or `UV_EXTRA_INDEX_URL` naming the mirror, `hooks: {}` in local settings,
     `disableAllHooks: false`). Round-2 additions to must fail: deny `W*`, `*e*`, `R*`; `disableAllHooks: true` in local
     or user settings; a public `UV_INDEX` (launcher or user env) or `UV_EXTRA_INDEX_URL`. Revision-4 additions: must
     fail `disableAllHooks: true` in user settings only (already listed), `[[tool.uv.index]] default = true` in
     `pyproject.toml` as the only index change, `UV_EXTRA_INDEX_URL=corp=https://pypi.corp.local/simple`; must pass
     user `disableAllHooks: true` under project `false`, and under local `false`. Revision-5 addition: must fail
     `home/.config/uv/uv.toml` with `[[index]] ... default = true` as the only index change (section 11 row 19).
  2. `closed-environments-quiz`, quiz, passScore 0.8, weight 1. Topics: a colleague sets the non-essential traffic
     variable to `0` "to turn it back on"; WebFetch off by env: can the agent still search; `strictAllowlist: true` in
     the project's `.claude/settings.json`, Manual permission mode named in the stem: what happens; a local open-weight model behind Claude Code (multiple: what is
     true); the corporate proxy is SOCKS-only: which statement the docs support (key: Claude Code does not support SOCKS
     proxies; no remedy is invented); a weaker local model (multiple: run checks more often, smaller tasks, pinned docs;
     not "longer prompts").
- Готово, когда (each rule as the brief requirement it protects; no key, file or value named; the table above stays
  off the learner's text): for a terminal session in a trusted folder,
  (G1) every Claude Code request goes to the brief's gateway; (G2) tokens come only from the bank's token program, and
  no static token is left in any file of the workspace; (G3) Claude Code's non-essential traffic is off; (G4) uv in the
  team's terminals installs only from the brief's mirror; (G5) uv in the team's terminals trusts the bank's root CA;
  (G6) the agent has no web tools and keeps its file and shell tools; (G7) sandboxed commands reach the mirror and no
  other host, and no prompt can widen that; (N1) Claude Code still trusts the bank's root CA; (N2) no request goes to
  another provider around the gateway; (N3) the launcher can read its profile (the brief's line format); (N4) the
  settings files parse, and the project's hooks stay and stay on.
  The general rule, stated once:
  - The check reads `launcher.env`, `.claude/settings.json`, `.claude/settings.local.json` if present and
    `home/.claude/settings.json` (it stands for `~/.claude/settings.json`). For the leaked token it reads every file in
    the workspace.
  - A variable's effective value is the first that sets it among local, project and user settings `env`, then
    `launcher.env`: settings apply over the shell, then settings precedence. A setting's effective value is the first
    among local, project and user.
  - Any form that the Claude Code or uv documentation gives the required effect passes, wherever the documentation
    says it takes effect. A form the documentation says has no effect, or a different effect, fails.
  - The brief's own limits narrow the forms: the terminals read only `launcher.env`; only the mirror, port 443; only
    the token program prints tokens; the launcher reads `KEY=VALUE` lines as they are.
  - The check names each failing requirement by its id. It does not name the file, the key or the value. No cap.
  Quiz >= 5 of 6.
- Как работать (совет): first step: copy the brief's lines into a list of requirements. For each one, find the file
  and key that should enforce it today, and for each variable write which file's value wins (the effective value as
  defined above). The gaps you find are the task. Then fix them and run the check; it names the requirements still
  broken, each line starting "не выполнено:".
- Student run: record which of G1-G7 the honest run finds without the check's message, and the minutes of the find
  step. The G5 fallback of section 7 stays ready.

### L5 `05-anti-patterns`: "Антипаттерны"
- id `patterns-anti-patterns`, type `bug-hunt`, O5, 50 min (theory 12, hands-on 38), prerequisites
  `[patterns-closed-environments]`.
- Opening question: "Каждая настройка в этом проекте кем-то задумана как улучшение. Какие из них делают агента хуже
  или дороже?"
- Theory (short: the lesson is the hunt): one line glossing `claude -p` (headless mode: runs one prompt without a
  session and prints the answer), since the planted Stop hook calls it; R D consolidated by family, each with its source; the "what you can stop
  doing" list (R D, CC best practices 2026-10-30; the old "Avoid common failure patterns" names are NOT cited); R A6
  Agent READMEs (68.1% describe architecture); Böckeler: inferential sensor where a computational one would do; build
  rules up gradually; Jain: continuous heavy harness on a frontier model; METR: "don't cheat" as the defence; each family
  with its good look-alike.
- Categories and decision rule (task.md, ordered, exclusive by location then content): 1 a conversation message ->
  `session-steering`; 2 machinery that runs (hook code, settings, scripts, CI) -> `over-harness`; 3 an instruction file
  line that is a must-hold rule a program could check or enforce -> `prose-rule`; 4 otherwise in an instruction file ->
  `memory-bloat`. Anchor: the line of the setup decision, never the agent's later action; one accepted range per item.
- Starter: `snapshot/` (invoice-service copy with a ~70-line `CLAUDE.md`, `.claude/settings.json`, `.claude/hooks/*.py`,
  `scripts/review.sh`, `src/ledger/report.py`), `transcript.md` (~250 lines, physical line numbers, as 00 2.2),
  `findings.json` `[]`. Planted (9) and decoys (18, two per planted range in its look-alike category):
  | Category | Planted (source) | Decoys (good look-alikes) |
  |---|---|---|
  | memory-bloat (2) | `## Project structure` tree (R D, Gloaguen); `YOU MUST ALWAYS ...` emphasis on a rule the agent missed | the `make check` line; the synthetic-fixtures fact; `Decisions: docs/adr/`; a misleading-place note for a file that cannot be removed |
  | prose-rule (2) | "ledger must not import invoices" with no check while `report.py` violates it (R OA, A2); "Always run the type checker before you finish" instead of a Stop hook | "Import boundaries are enforced by `make check` (A1-A3)"; "Ask before adding a migration"; "Reminders skip disputed invoices (REQ-09, tested)"; "Prefer small vertical tasks" |
  | over-harness (3) | PreToolUse hook rejecting any edit containing `print(`; Stop hook calling `claude -p` to check import directions (Böckeler); PostToolUse running the full suite and an LLM review after every Edit for one-line tasks on a frontier model (Jain) | 00 L6 generated-files hook; 01 L1 Stop hook; deny `Read(.env)`; an LLM review for "does the change match the spec intent"; `make check` running the AST linter; a PostToolUse formatter on the edited file only |
  | session-steering (2) | "Think really hard about this" (R D: effort is the control); "Don't cheat and don't edit the tests" as the only defence (METR) | `/effort high` before a hard task; `/clear` then a concise re-prompt; "show the command and its output as evidence"; the verification command given up front |
- Checks:
  1. `anti-pattern-hunt`, bug-hunt, `answers: checks/bugs.yaml`, `minFound: 6`, weight 2; `bugs.yaml`: `maxReports: 10`,
     `maxDecoyHits: 1`. Block enumeration (exact hypergeometric over every allocation of <= 10 reports): best (1,2,2,2)
     0.3086% per attempt, 0.9231% over 3. Must fail: `[]`; shotgun; right lines with wrong categories; the hedge. Must
     pass: `checks/reference/findings.json`.
- Готово, когда: `findings.json` with at most 10 reports `{file, line, category, why}`, at most 1 in a good-practice
  spot, at least 6 planted items found with the right category (the check says only "не пройдено"; 3 scored
  submissions; format errors are free).
- Как работать (совет): first step: read the snapshot's CLAUDE.md and settings before the transcript and mark every
  line that is a setup decision; then classify each by the four questions in order.
- No quiz: the bug-hunt is the assessment; its reserve excerpt serves the mentor review.

## 6. Assessment map
| Outcome verb | Check | Why it cannot pass without the skill |
|---|---|---|
| O1 раскладывает по ступеням по порядку решения | L1 `rule-placement` | 12 cards, binary (count feedback rejected: 19.2% for sure of 8), 3 scored submissions; the walk needs the repo (hooks, Makefile, partner contract, importers); search table in L1 |
| O1 убирает из памяти ушедшее | L1 `rule-placement` stage 0 | only `./CLAUDE.md` may hold memory, no `@` import token anywhere (01 L2 rule), tags equal the memory set, one line each, <= +10 words, <= 3 untagged lines of <= 15 words with added headings counted, no 6-word run of a moved rule in the whole-file word stream after NFKC (65-word budget < 113 moved words) |
| O1 меняет код, чтобы ошибка стала невозможной | L1 `poka-yoke-applied` | AST signature and every call site, hidden grids for `late_fee` and for its caller `statement_line`, suite run by the grader's runner |
| O2 пишет проверку по AST с правилом, файлом, строкой, исправлением | L2 `arch-linter` | randomised roots incl. parser-only forms that a line regex fails (0/20); Fix required in form, quality by the rubric |
| O2 подключает к единой команде | L2 `arch-workspace-clean` (d) | planted violation and planted red test must turn `make check` red |
| O2 приводит к зелёной проверке изменением кода, не обходом | L2 `arch-workspace-clean` (a), (w1), (w2), (b), (c) | grader's own rules, ban on every literal-name form of dynamic execution (providers `builtins`, `importlib`, `runpy`, the stdlib modules that run or compile source or load code objects; names, attributes and literal strings), runtime probes: no loaded module's `__file__` under `src/invoices/` whatever its name, connections only from `repository.py` (no `src/` frame = bad), learner code run without `__pycache__/`, behaviour, suite counting expected failures and runner tampering |
| O3 называет класс причины и ступень | L3 `failure-log` | 36 combinations per incident, aggregate count, cap 10, walk per incident |
| O3 формулирует исправление | L3 `failure-fix-rubric` | rubric only (prose), paired with `failure-log` |
| O3 реализует проверку зависимостей | L3 `deps-gate` | hidden roots; workspace judged with pristine allowlist and first-party set, no new file or directory under `src/` (OS and editor files named, not exempt), code run without `__pycache__/` |
| O4 находит и исправляет дефекты контура | L4 `contour-config` | task text and messages give only the brief requirement, so the learner maps it to key, file and scope; seven documented defects judged by effect with documented precedence; guards against regressions |
| O4 выбирает изменения процесса для слабой модели | L4 quiz | a choice, observed by the quiz |
| O5 находит и отличает антипаттерны | L5 `anti-pattern-hunt` | 18 good look-alike decoys; 0.92% over the cap |

Threat model of record (2.8) per command check. Every in-scope class has a must-fail probe in the check entry. Residuals
are left to the mentor's diff review:
- L1 `rule-placement`: RS1, RS2, RS8. Paraphrase within 3 untagged lines of <= 15 words (headings included) plus 10
  extra words per memory line: 65 words, which cannot hold the 113 moved words verbatim.
- L2 `arch-workspace-clean`: RS3 (any builtin reached without a literal name), RS4 (for the mentor: every executor
  outside w1's list, e.g. a `subprocess` running the interpreter). Seen by judge-assessment round 4, not hunted
  further: after the `__file__` rule, taking `format_cents` and then `del sys.modules["money"]` hides the module (the
  `sys.modules` manipulation class of RS6); a symlink `src/ledger/money.py -> ../invoices/money.py` is dereferenced by
  the grader's copy and graded as the allowed copy of `format_cents`.
- L3 `deps-gate`: RS5 (no known form left), RS6, RS7.
- Suite runner (L1, L2 c, L3 b): a `__code__` swap on a runner function keeps the object's identity (test code
  patching the runner at the bytecode level, the 2.8 bytecode class; in the prototype it errors and the run is red
  anyway, section 11 row 17). Patching objects outside `unittest`, or forging the record with the nonce read from
  the bootstrap's own arguments, is (iii)/(iv) (it needs the grader's record format); the hidden probes still grade
  behaviour.
- Every check: (iii)/(iv). In L2/L3 that includes a linter that imports the grader's rules.

## 7. Time
L1 60, L2 75, L3 70, L4 60, L5 50 = 315 min; hands-on 38 + 55 + 48 + 35 + 38 = 214 (67.9%); every lesson >= 58%.
| Lesson | Closest shipped analogue (budget) | Per part, hands-on in brackets |
|---|---|---|
| L1 60/38 | 00 L1 6 cards 40/25; 00 L5 memory 50/30 | theory 22; [hooks and Makefile survey 4; walk 12 cards 10; placement and CLAUDE.md 6; keyword-only + call sites with the agent, find the swap 10; delete old_api 2; iterate 6] |
| L2 75/55 | 01 L7 linter, 6 rules: 66/46 | theory 20; [own roots 10; `lint` with the agent 20; fix 3 violations 12; Makefile `check` 3; `lint-output.txt` 2; iterate 8] |
| L3 70/48 | 00 L1 + 01 L7 per-rule time | theory 22; [8 incidents, causes and layers 20; fix texts 6; `check_deps.py` 12; `export_json.py` 3; iterate 7] |
| L4 60/35 | 00 L6 80/50 (here config only) | theory 25; [brief to requirement list 4; find the gaps: file, key, effective value per requirement 13; fix 10; iterate with the check 8] |
| L5 50/38 | 01 L6 bug-hunt 45/33 | theory 12; [snapshot + transcript 30; findings 8] |
Fallbacks if the student honest run exceeds the budget: L2 ships the relative-import resolver; L3 excerpts capped at
20 lines; L4 G5 announced in the brief as a hint ("uv has its own trust setting"); L5 transcript 200 lines.

## 8. Deviations from the reference program
1. Topic 1 spans two lessons (placement and poka-yoke; deterministic checks with remediation), each with its own check.
2. Topic 2's "improve the harness and the project code" is practised as the backward ladder plus one implemented fix;
   the other harness fixes were built in 00 L6 and 01 L1 and are referenced.
3. The block's result ("almost every task ends with code that needs no rework") is measured by proxy only (a headless
   agent on hidden tasks is out per R DEC). Upgrade path 12.7.
4. Closed environments are Claude Code-first; Codex only as a contrast table (R DEC).

## 9. Cost
No agent runs in any check. Rubric mentor for 2 rubrics, ~5k in / 1k out per attempt, ~$0.02 each (00 section 8).

## 10. What NOT to build
- No hidden-task, agent-eval, `budgetUsd`, model call, network, `pip`, `uv` or `npm` in checks; no Ruff, import-linter,
  ESLint or mypy installs; no TOML parsing.
- No schema/ADR-0001 change, no new check kinds.
- No re-teaching: memory loading and Gloaguen (00 L5), permissions syntax and PreToolUse (00 L6), Stop hook and test
  tampering (01 L1, L6), context basics (00 L4), local model setup (00 L1).
- No Stop hook or PreToolUse grading (L1 R08/R10 only place rules on existing hooks).
- L4 grades only the keys its seven defects and four guards touch; everything else is accepted (L4 "Not graded").
- The learner's linters read import statements only; dynamic-import detection lives in the L2 workspace check (w1, w2),
  not in the learner's rules.
- No machinery against the out-of-scope classes RS1-RS8 (2.8): no `Cf`/mixed-script scan (L1), no execution profiler
  or `open` audit (L2), no `fastjsonx` string scan or module baseline (L3), no `.claude/` pristine compare in L1. The
  judges' prototypes for these stay in their scratch dirs.
- No "94% of compilation errors are type errors" (R A7), no GitClear percentages (R B8), no METR doubling time (R B6), no
  OpenAI productivity numbers as claims.

## 11. Prototype runs (scratch, 2026-10-30)
### 11.1 Revision 4 runs (rows 1-15)
Revision 4 location:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/arch4/`
(`<arch4>` below), a copy of judge-assessment's round-3 verifiers `judge-r3/`. Each changed verifier sits next to its
revision-3 copy (`*_r3.py`). Interpreter `/opt/homebrew/bin/python3.12` (3.12.13), every case on a fresh `mktemp -d`
copy under `-I`. Outputs are saved next to each script (`*.out`). "r3 -> r4": the verdict of the revision-3 rule, then
of revision 4. Every fixed boundary was run on the revision-3 rule first.
| # | Command (cwd `<arch4>`) | Case (expected r4 in brackets where not obvious) | Observed r3 -> r4 |
|---|---|---|---|
| 1 | `python3.12 -I l2/cases4.py` (`verify_ws_r3.py` vs `verify_ws.py`) | B1 `from builtins import exec as run_source`; `from builtins import compile as c` + `FunctionType` | PASS -> w1; PASS -> w1 |
| 2 | same | B1 neighbours: `__builtins__["exec"]`; `vars(builtins)["ex"+"ec"]`; `getattr(sys.modules["builtins"], "exec")`; `print.__self__.compile`; `sys._getframe().f_builtins["exec"]`; `pkgutil.resolve_name("builtins:exec")`; `type(__loader__)("m0", path).load_module()` | PASS -> w1 (all seven) |
| 3 | same, assessment NB6 | `code.InteractiveInterpreter.runsource`; `cProfile.runctx`; `from timeit import Timer`; `codeop.compile_command` + `FunctionType` | PASS -> w1 (all four) |
| 4 | same, accuracy NB2 (one `compile` rule) | `from re import compile; compile("x")`; `import re as r; r.compile("x")`; `re.compile` (must pass) | w1 -> w1; PASS -> w1; PASS -> PASS |
| 5 | same, residuals shown | identity search over `sys.modules` + mode `"ex" + "ec"` (RS3); `subprocess` running the interpreter on `money.py` (RS4 for the mentor; residual) | PASS -> PASS (both) |
| 6 | `python3.12 -I l2/pyc_case.py`, assessment NB8 in L2 | unchecked-hash `__pycache__/report.cpython-312.pyc` runs `money.py`, visible `report.py` raises (must fail) | PASS -> no record |
| 7 | `V=verify_stage0_r3.py python3.12 -I l1/cases.py --s5-per-line`, then `V=verify_stage0.py ...` (`l1/cases_all.out`), assessment NB3 | normalised moved words as 5-word `##` headings; as 10-word headings with a filler word | per-line s5: PASS x2 -> r4: s4 (23 lines; 12 lines), and s5 on the whole-file stream |
| 8 | same, assessment NB4 | heading paraphrasing all ten; normalised moved words with a filler every 5 words in one untagged line; a new `## Notes` + 3 untagged lines; a 16-word untagged line | PASS x4 -> s4 (43 words; 135 words; 4 lines; 16 words) |
| 9 | same, NB4 must pass and residual | a 15-word untagged line; paraphrase of all ten in 3 untagged lines of <= 15 words | PASS -> PASS (both); moved texts = 113 normalised words |
| 10 | same, assessment NB5 relabel | tags stripped, all 12 texts kept | s3 -> s3 (`tags [] != memory`) |
| 11 | `python3.12 -I suite/cases.py` (variants A = r3 text, C = judge's snapshot, D = r4) | root `json.py` forging the record; `tests/test_zz.py` patching `TestResult.addFailure`; patching `unittest.case._Outcome.testPartExecutor` | A: PASS x3; C: fail, fail, PASS; D: fail, `runner tampered ['TestResult']`, `['_Outcome']` |
| 12 | same, must pass | reference; reference + root `unittest/`; honest tests with `unittest.mock.patch`, `MagicMock`, `IsolatedAsyncioTestCase` | D: PASS x3 (the lazy `IsolatedAsyncioTestCase` is touched before the snapshot; without that D reported `['unittest']`) |
| 13 | `V=verify_b_r3.py python3.12 -I l3/cases.py`, then `V=verify_b.py` (`l3/cases.out`), assessment NB7, NB8, NB9 | empty `src/invoices/fastjsonx/` + attribute; unchecked-hash pyc in `__pycache__/` behind a raising `export_json.py`; `src/invoice_service.egg-info/` | PASS -> (b) new directory; PASS -> (b) `to_json` (NotImplementedError); (b) -> (b) |
| 14 | `python3.12 -I l4/rules_n4_g4.py` (rule functions only), accuracy NB3 | user `true` + project `false`, local `false` + user `true` (must pass); `true` in user only, `true` in local (must fail) | fail -> pass; fail -> pass; fail -> fail; fail -> fail |
| 15 | same, accuracy NB4 (b) | `UV_EXTRA_INDEX_URL=corp=https://pypi.corp.local/simple`; `UV_INDEX=corp=...` (must pass); plain mirror URL in `UV_EXTRA_INDEX_URL` (must pass) | pass -> fail; pass -> pass; pass -> pass |
Unchanged cases re-run on r4, same verdict as r3 (all four harnesses, `*.out`): L2 reference, starter, `runpy`, plain
`exec`, `b.exec`, `builtins.compile`, the w2 cases and the must-passes (+ a docstring "no exec here" with
`con.execute`); L1 all 24 revision-3 cases (s1-s5, key, must-passes); suite: the eleven revision-3 cases; L3: the eleven
revision-3 cases incl. RS6/RS7 passing. Revision-3 rows (arch3, lost with the scratchpad): judge-assessment rebuilt L1 stage 0, L2 w1/w2, L3 (b), the suite
runner and the arithmetic in `judge-r3/` and confirmed them (review-3-assessment "Checked"); the line above re-run that subset. Not re-run since revision 3: the L2/L3 linter roots on 20 seeds, L4 `verify_contour.py` (98 cases;
its four revision-4 additions and the G6 reason text are specified in L4 and run by the practice-designer's demo), the
L5 enumeration, quiz scorer, bug-hunt matcher, rubric blind sets, the image interpreter. `pnpm content:validate` runs
in the validate phase (assessment r3 NB10).

### 11.2 Revision 5 runs (rows 16-21)
Location:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/arch5/`
(`<arch5>` below), a copy of judge-assessment's round-4 dir `judge-r4/` (itself `arch4/` plus the judge's cases and
candidate fixes). Each changed verifier sits next to its revision-4 copy (`*_r4.py`; the judge's runner as
`suite/runner4_judge.py`). `codegen/generated/` is the real output of 00 L6's `scripts/codegen.py` on its
`schema/invoice.schema.json`, run as `make codegen` does (`python3 scripts/codegen.py schema/invoice.schema.json
<out>`). Interpreter `/opt/homebrew/bin/python3.12` (3.12.13), every case on a fresh `mktemp -d` copy under `-I`.
"r4 -> r5": the verdict of the revision-4 rule, then of revision 5, both in the same run. Outputs: `*.out` next to each
harness. Every harness ends with an "unexpected" count; all are 0.
| # | Command (cwd `<arch5>`) | Case | Observed r4 -> r5 |
|---|---|---|---|
| 16 | `python3.12 -I l2/cases5.py` (`verify_ws_r4.py` vs `verify_ws.py`; `l2/cases5.out`), assessment B1 | `sys.path.insert(0, .../invoices)` + `from money import format_cents`; `sys.path.append(str(Path(__file__).resolve().parents[1] / 'invoices'))` + `import money`; `site.addsitedir(...)` + `from money import format_cents` | PASS -> `(w2) invoices loaded money` (all three) |
| 17 | `python3.12 -I suite/cases5.py` (`runner5.py r4` vs `r5`; `suite/cases5.out`), assessment B2, accuracy NB4 | honest corpus, 21 cases (the judge's 18 plus `assertLogs` alone, `assertNoLogs` alone, `mock_open` alone); attack corpus, 17 cases | honest: r4 fails 7 (`assertLogs`, `assertNoLogs`, `mock_open`: `tampered ['unittest']` / `['unittest.mock']`; unclosed file and a test returning a value: `['unittest.case']`) -> r5 PASS 21/21. Attacks: verdicts unchanged, `addFailure` patched `['TestResult']`, `testPartExecutor` `['_Outcome']`, `unittest.TestResult` rebound `['unittest']`, root `json.py` failed=2, expectedFailure/skip/rename red, `os._exit(0)` no record; the `__code__` swap: r4 `tampered ['_FailedTest']` -> r5 red (failed=3: the swapped `addFailure` errors), residual in section 6 |
| 18 | `python3.12 -I l2/cases5.py`, then `python3.12 -I l2/pyc_case.py` (`l2/pyc_case5.out`), assessment NB1, NB3, pedagogy NB2, NB3 | docstring "do not shadow Python builtins such as sum" (must pass); `sys.modules["builtins"].__dict__["ex"+"ec"]`, `globals()["__builtins__"]["ex"+"ec"]`, `operator.attrgetter("ex"+"ec")(sys.modules["builtins"])` (must fail, narrowed literal); `import traceback, codecs` in `api.py`, `from . import profile` of a first-party `ledger/profile.py`, reference + `make codegen` output in `src/invoices/generated/` (must pass); unchecked-hash pyc behind a raising `report.py` | w1 -> PASS; w1 -> w1 (x3, on `'builtins'` / `'__builtins__'`); PASS -> PASS (x3); no record (unchanged). Messages read `(w1) src/ledger/report.py:1: import runpy (пункт 4: модуль, который исполняет или компилирует код)` |
| 19 | `python3.12 -I l4/g4_uvtoml.py` (G4 "gone when" only; `l4/g4_uvtoml.out`), accuracy NB1 | `home/.config/uv/uv.toml` `[[index]] default = true` as the only index change; the same in a root `uv.toml` (must fail); `UV_DEFAULT_INDEX` = mirror in `launcher.env` (must pass) | fail; fail; pass |
| 20 | `python3.12 -I l3/cases5.py` (`verify_b_r4.py` + `pristine_src.json` vs `verify_b.py` + `pristine_src5.json`; `l3/cases5.out`), assessment NB2, NB3, pedagogy NB5 | `src/invoices/.DS_Store`, `export_json.py~`, `.export_json.py.swp` (must fail, path named); starter `generated/` deleted and rewritten by `make codegen` (must pass) | (b) -> (b) `new file or directory under src/: src/invoices/.DS_Store (delete it; ...)` (x3); (b) -> PASS (the r4 pristine set in scratch lacked `generated/`; the real `pristine_src.json` is the starter's, so the fix is listing those files, which r5 does) |
| 21 | `python3.12 -I l1/cases.py` (`l1/cases5.out`), `python3.12 -I honest/l1_honest.py` (`l1/l1_honest5.out`), assessment NB5, pedagogy NB4 | "strip tags" relabelled `s3` in the harness; s4 message with line numbers and word counts; the honest corpus incl. `[R03]` + a fenced `make test` block | `s3: tags [] != memory ['R03', 'R11']`; `s4: untagged line over 15 words (строка 5: 16 слов)`; honest 14/14 PASS, 35 cases, 0 unexpected |
Unchanged cases re-run on r5, same verdict as r4: L2 all 28 cases of the judge's `cases4_fixfile.py` and every honest
variant of `cases_r4.py` (57 cases in all, row 16-18 harness); L3 the 14 cases of `l3/cases.py` and the 3 honest states
of `honest/l3_honest.py` (row 20 harness); L1 every revision-4 case (row 21). Not re-run: the L2/L3 linter roots on 20
seeds, the full L4 `verify_contour.py` (row 19 adds one case to its matrix, run by the practice-designer's demo), the
L5 enumeration, the image interpreter, `pnpm content:validate` (validate phase, assessment r4 NB6).

## 12. Risks and items for Stepan
1. Residuals by the threat model of record (2.8), per check in section 6; (iii)/(iv) closes only with runner isolation
   (00 2.5.3); the mentor reviews the diff.
2. L1 `rule-placement`: paraphrase within the 65-word budget (section 6); binary feedback, cap 3: sure of 9 of 12 passes
   by search 31.2%, sure of 8 8.2% (L1 table).
3. L3 `failure-log`: the per-item-oracle bound is 1.02%, through a channel the rules forbid; the real channel measured 0.
4. Placement and incident keys carry judgement; the content judges and the student run must break or confirm the walks.
5. L4 relies on the vendor semantics in 12.9 at 2.1.314 (precedence, presence-only parsing, the strict-allowlist lock
   from v2.1.285); a change there invalidates G3, G6 or G7 and is caught by the `checkedAt` re-check.
6. Pending addendum (content-researcher): (a) correct R C1 to V14 (`CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT`) and V10 (five
   providers); (b) Jain's "Untested: ... open-weights models" quote into R B10; (c) Böckeler's exact phrase ("positive
   kind" vs "positive form") into R A2; (d) the image interpreter version and stdlib membership of every root name on
   3.10-3.13; (e) `make` in `academy-workspace:dev`; (f) on the image interpreter, `sqlite3.Connection(...)` raises the
   `sqlite3.connect` audit event (L2 must-fail) and uv takes `SSL_CERT_DIR=/etc/corp` with a plain `.pem` name. (a)-(c)
   are theory only; (d)-(f) block `ready`, not the design. (a)-(c) are still owed at revision 4 (accuracy r3 NB7):
   research lines 52, 303, 537; judge_content checks that the lesson cites V10, V14 and Jain's article, not R C1.
7. Paid capstone (hidden-task) stays out (R DEC); upgrade once runner #13 exists.
8. Platform residuals as 00 section 10 and 01 11.1: caps, close-on-reveal, mentor rule, rubric grading, prerequisite
   gating wait for #08/#10/#11.

### 12.9 Vendor facts behind revisions 2-4 (fetched 2026-10-30)
- V1 env-vars.md: "For variables that turn a behavior on or off, set `1`, `true`, `yes`, or `on` to turn it on and `0`,
  `false`, `no`, or `off` to turn it off, in any casing." Presence-only list: "`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`,
  `DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING`, ..." with "any non-empty value including `0` turns the behavior on, and
  you turn the behavior off by unsetting the variable or setting it to an empty value". `CLAUDE_CODE_DISABLE_WEB_FETCH`:
  "Set to `1` to turn off the WebFetch tool. The WebSearch tool stays available." `DO_NOT_TRACK`: "a standard boolean".
- V2 env-vars.md: "When the same variable is set in both your shell and a settings file `env` block, the settings file
  value applies in most sessions."; "Claude Code treats the empty value as unset for provider selection."
- V3 settings.md: precedence "managed settings, command line, project local, shared project, user"; settings-reference
  `env`: "when more than one settings file sets a variable, the highest-precedence one applies".
- V4 permissions.md: "A bare tool name like `Bash` removes the tool from Claude's context entirely"; "`Bash(*)` is
  equivalent to `Bash`"; "Deny and ask rules also accept glob patterns in the tool-name position. The pattern must match
  the full tool name: `"*"` matches every tool"; `WebFetch(domain:*)` in deny: "Claude Code keeps the tool and refuses
  each fetch, and sandboxed commands can't reach any host"; "if user settings allow a permission and project settings
  deny it, the deny rule blocks it".
- V5 sandboxing.md: `strictAllowlist` "in user, managed, or CLI `--settings` settings ... denies sandboxed commands
  access to any host outside the allowlist instead of prompting"; "Setting it in a repository's `.claude/settings.json`
  or `.claude/settings.local.json` has no effect. Requires Claude Code v2.1.219 or later."; unlisted host in Manual mode:
  "You get a prompt"; "The allowlist is `allowedDomains` plus domains from `WebFetch(domain:...)` allow rules".
- V6 sandboxing.md, locks table (v2.1.285+): `network.strictAllowlist` set in "Managed settings, `--settings`, user
  settings" makes Claude Code ignore in a repository's settings "The proxy ports, `allowedDomains`, and
  `WebFetch(domain:...)` allow rules". settings-reference `allowedDomains`: "Wildcards such as `*.example.com` match
  subdomains, and an optional `:port` suffix limits an entry to one port".
- V7 llm-gateway-connect.md: curl to `"$ANTHROPIC_BASE_URL/v1/messages"`; "Don't put the credential in a project's
  `.claude/settings.json`. That file is committed and shared"; apiKeyHelper example in `~/.claude/settings.json`; "If you
  export the gateway only in your shell, it doesn't reliably reach background agents".
- V8 network-config.md: "All environment variables shown on this page can also be configured in `settings.json`";
  "settings are the only configuration that reaches every background session".
- V9 network-config.md: "If your enterprise environment uses a custom CA, configure Claude Code to trust it directly:
  `export NODE_EXTRA_CA_CERTS=...`"; "Claude Code does not support SOCKS proxies."; "For proxies requiring advanced
  authentication (NTLM, Kerberos, etc.), consider using an LLM Gateway service".
- V10 env-vars.md rows: `CLAUDE_CODE_USE_ANTHROPIC_AWS`, `_BEDROCK`, `_FOUNDRY`, `_MANTLE`, `_VERTEX` ("Use ..."), and
  `CLAUDE_CODE_USE_POWERSHELL_TOOL` ("Controls the PowerShell tool").
- V11 memory.md: project instructions "`./CLAUDE.md` or `./.claude/CLAUDE.md`", "`./CLAUDE.local.md`", "`.claude/rules/`"
  ("All `.md` files are discovered recursively"), "`AGENTS.md`", "CLAUDE.md files can import additional files using
  `@path/to/import` syntax", subdirectory files "load on demand".
- V12 settings-reference.md: `apiKeyHelper` "Scope: Any file"; "when the command comes from project or local settings,
  Claude Code doesn't run it until you accept the workspace trust prompt"; `allowedProviders` scope "Managed",
  `"customEndpoint"`: "an LLM gateway named by `ANTHROPIC_BASE_URL`".
- V13 docs.astral.sh/uv/reference/environment: `UV_DEFAULT_INDEX` "use this index as the default index";
  `UV_INDEX_URL` "(Deprecated: use `UV_DEFAULT_INDEX` instead.)"; `UV_INDEX` "additional indexes"; `UV_EXTRA_INDEX_URL` deprecated alias of `UV_INDEX` (accuracy round 2, item 5); `SSL_CERT_FILE`
  "overrides the default certificate source"; `SSL_CERT_DIR` "Path to a directory containing PEM-encoded CA certificate
  files"; `UV_SYSTEM_CERTS` "load TLS certificates from the platform's native certificate store". `NODE_EXTRA_CA_CERTS`
  is not on the page.
- V14 env-vars.md `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT`: "When unset, Haiku 4.5, Sonnet 5, Opus 4.7, and earlier models in
  those families use the full prompt by default, and newer models use the shorter one. Set to `1` ..."; changelog
  2.1.312: "Changed Bedrock, Vertex, Foundry and Mantle to use the shorter system prompt for model names Claude Code
  doesn't recognize".
- V15 (fetched by judge-accuracy, round 3, 2026-10-30; not re-fetched by the architect): tools-reference: `Bash`,
  `Read`, `Edit`, `Write`, `Glob`, `Grep`, `WebFetch`, `WebSearch` are exact names; "On macOS, Linux, and WSL, Claude
  Code leaves Glob and Grep out of the default tool set" (G6: "file tools where present"). hooks.md: "Claude Code reads
  the value left after settings precedence applies, so a `"disableAllHooks": false` in a project's
  `.claude/settings.json` overrides a `true` in your user settings" (N4). uv concepts/indexes: an index in an env
  variable is "its URL, a configured name, or the `<name>=<url>` syntax" (`UV_INDEX`; the CLI reference gives
  `--extra-index-url` as URLs only); "To exclude PyPI from the list of indexes, set `default = true` on another index
  entry" in `pyproject.toml` (G4, excluded by the brief).

## 13. Self-review
- Reference program (block 3): topic 1 -> L1, L2; 2 -> L3; 3 -> L4; 4 -> L5; result by proxy (8.3). Contract: existing
  types and kinds only; no `checks/` in run strings or learner text. Learner profile: plumbing given, one plain
  networking block with a collapsed "Справка", an opening question and a "Как работать" first step everywhere.
- Mistakes file, rounds 1-3: L4 states requirements, not the grader's columns; checks observe effects (any `@` token,
  any new file or directory, any connection without a `src/` caller); round 3: every banned callable is closed by its
  provider, alias, attribute and literal-key forms, and the alias neighbour of every listed must-fail was run (section
  11 rows 1-4); the 12.2 bound was tried with the cheapest forms (rows 8-9).
- 2.6 diff, both ways: L1 items 1-5 = s1-s5, 6 = key, 7-10 = stage 0 + hidden + suite, 11 = quiz; L2 1-2 =
  `arch-linter`, 3-8 = (a), (w1), (w2), (b), (c), (d), 9 = rubric; L3 1-2 = `failure-log`, 3 = (a), 4-7 = (b), 8 =
  rubric; L4 = G1-G7, N1-N4 as requirements plus the general rule, quiz; L5 = bugs.yaml. Revision 4's changed rules: L1 s4 (15 words, headings) and s5 (whole-file stream) = items 4
  and 5; the scored-submission rule = item 6; L2 w1 (every module, name, attribute and literal, one `compile` rule) =
  item 4, word for word; w2 call-stack wording = item 5; the `__pycache__/`-free copy = items 5 (L2) and 5 (L3) and
  2.3; the runner's tampering rule = 2.3 task.md line; L3 "no new directory" and the egg-info note = item 5 and the
  message; L4 N4 effective value = N4 "stay on"; G4 project files = the brief line. Revision 5's changed rules: L1 s4
  word and fence-line definition = item 4; L2 w1 module reason, whole-component matching and narrowed `builtins`
  literal = item 4 word for word, the w1 message = "the message names the file, the line and the form"; w2 `__file__`
  rule = item 5 ("loads no code from `src/invoices/`, whatever name"); the runner's tampering rule = the 2.3 task.md
  line ("replaces a function or class of `unittest`"); L3 OS and editor files = item 5 and the message; L4 uv config
  files at every level = the brief line.
- Mistakes file, round 4: the w2 probe identifies code by where it comes from (`__file__`), not by its name; the
  tamper detector compares callables and descriptors by identity, never data; both were run on an honest corpus of
  the API's common idioms as well as on the attack corpus (section 11 rows 16-18, 17).
- Intended asymmetry (pedagogy r3 NB4): L4 G2's text "no static token is left in any file of the workspace" is
  stricter than the check (planted token string, the two credential keys). No honest learner fails because of it;
  judge_content does not flag it.

## 14. Changes in revisions 2-4 (rounds 1-3), condensed
Full lists: the round-1 to round-3 judge reports and git history of this file.
- Revision 2: accuracy B1-B8 (WEB_FETCH on/off, deny forms, `strictAllowlist` scope, per-tool CA trust,
  `UV_INDEX_URL`, four places by precedence, five provider switches, V14); pedagogy B1 literal ladder walk, B2 task text
  names the grader's own rules; assessment B1 `statement_line` probe and grader runner, B2 L1 s2-s5, B3 L2 w1/w2, B4
  pristine first-party set, B5 L1 cap 3; all NB applied.
- Revision 3: Stepan's threat model of record (2.8); pedagogy B1 L4 requirements, not the grader's columns; assessment
  B1 L1 `IMPORT_TOKEN`, one tag per line, NFKC; B2 `runpy` and plain `exec` in w1; B3 no new file of any extension;
  NB1-NB8 applied, NB9 = RS8, NB10 to validate; accuracy items 1-9 carried into lesson text.
- Revision 4: assessment B1 w1 bans the `builtins` provider, `__builtins__`, the literal keys and the stdlib modules
  that run or compile code (rows 1-3); one `compile` rule (row 4); runner imports before `sys.path` and snapshots
  `unittest` (rows 11-12); L1 s4 15 words with added headings counted and s5 on the whole-file stream, 65 < 113 words
  (rows 7-10); L3 no new directory, egg-info named, learner code run without `__pycache__/` in L1-L3 (rows 6, 13);
  accuracy G6 "file tools where present", N4 effective `disableAllHooks` (row 14), G4 project files excluded and
  `name=` only on `UV_INDEX` (row 15), L2 item 5 call-stack wording, s2 as the exercise's rule; pedagogy L4
  `UV_DEFAULT_INDEX` vs `UV_INDEX`, L1 item 6 counted submissions, "не выполнено:" lines, G2 asymmetry recorded.

## 15. Changes in revision 5 (round 4)
Stepan's approval of 2026-10-30, exactly this scope. 2.8 is unchanged, byte for byte; the lesson set, durations, check
kinds and weights are unchanged. Every changed rule: section 11 rows 16-21.
Assessment:
- B1 L2 w2 fails when any loaded module's `__file__` (`realpath`) lies under the copy's `src/invoices/`, whatever its
  name; the three `sys.path.insert`/`sys.path.append`/`site.addsitedir` forms are must-fail (L2 check 2 (w2) and "Must
  fail"; task.md item 5; section 6 O2 row; row 16).
- B2 2.3 runner: `tampered` = a callable or descriptor key added, removed or rebound (`is`), data never compared;
  `unittest._log` imported before the snapshot, `unittest.__main__` never; the honest must-pass corpus and the
  must-fail tamper probes listed in 2.3 (2.3; row 17).
- NB1 w1 literal narrowed to equal to `builtins` or starting with `builtins.`, `builtins:`, `__builtins__`; rows 1-2
  closures re-run plus three literal-key probes (L2 w1, item 4; row 18).
- NB2 L3 OS and editor files stay "new file", the message names each path and says to delete it; `.DS_Store`, `*~`,
  `.swp` must-fail (L3 check 2 (b), "Must fail", item 5; row 20).
- NB3 "reference + `make codegen`" must-pass in `deps-gate` (pristine set lists `generated/`) and
  `arch-workspace-clean` (L3 and L2 "Must pass"; rows 18, 20).
- NB4 the starter CLAUDE.md is headings + 12 tagged lines + blank lines only (L1 starter bullet).
- NB5 stale harness label: `arch5/l1/cases.py` expects `s3` for "strip tags" (row 21).
- NB6 not applied: `pnpm content:validate` belongs to the validate phase.
- Residuals seen (`del sys.modules["money"]`, symlink, `__code__` swap) recorded in section 6, not built against.
Accuracy:
- NB1 L4 brief: uv config files at project, user or system level do not count; `home/.config/uv/uv.toml` with
  `default = true` must-fail (L4 brief, G4 cell, demo matrix, 103 cases; row 19).
- NB2 w1 wording "modules that run or compile source, or load code objects", with which ones only compile or yield
  code objects (L2 theory, w1, section 6 O2 row).
- NB3 w2 "(another thread, a callback)" replaced by item 5's call-stack wording, plus the synchronous-callback note
  (L2 w2).
- NB4 = B2 (`_log`, never `__main__`).
- NB5 still owed by the content-researcher (12 item 6).
Pedagogy:
- NB1 reason for the w1 module list and the way out (`json`; `tests/`, `scripts/`) in item 4 (L2 Готово item 4).
- NB2 must-pass `import traceback, codecs` in `api.py` and a first-party `from . import profile`; whole-component
  matching stated in w1 and item 4 (row 18).
- NB3 w1 message `<path>:<line>: <form> (пункт 4: <group>)` (L2 w1; row 18).
- NB4 "word" and code-fence lines defined in s4 and item 4; the s4 message gives line numbers and word counts; fenced
  `[R03]` must-pass (L1 s4, item 4, "Must pass"; row 21).
- NB5 editor-artefact demo case with the path in the message (= assessment NB2; row 20).
