# #41 module design (revision 7): course/ai-for-developers/01-spec-driven-development "Spec Driven Development"

Curriculum-architect design, revision 7 (changes in section 19, revision 6 in section 18, revision 5 in section 17, revision 4 changes in section 16, revision 3
changes in section 15, revision 2 changes in section 14, observed command outputs and attack runs in 2.10).
Standalone for downstream roles, except that it reuses the conventions of module 00 by reference: "as 00
2.x" means `plans/15-module-introduction-design.md` (revision 4) section 2.x plus the planner items in
`plans/15-module-introduction.md` (A1-A5, W2, W3), and only deltas are written here. Fact base:
`plans/41-module-spec-driven-development-research.md` (checked 2026-10-29; cited as "R <section>") and its
addendum `plans/41-module-spec-driven-development-research-addendum.md` (checked live 2026-10-29 against CC
2.1.312; cited as "RA A<n>"; page codes H = hooks reference, G = hooks guide, S = skills page, BP = best
practices, SPEC = agentskills.io specification, REF = skills-ref, PBP = platform skill authoring best
practices, CL = CC changelog). Where the addendum and R differ, the addendum wins. Three sources were
re-fetched for revision 2 on 2026-10-29: S (`code.claude.com/docs/en/skills.md`), the MADR 4.0.0 template
(`raw.githubusercontent.com/adr/madr/4.0.0/template/adr-template.md`, cited "MADR-T") and PBP. No fact
outside them is taught; domain rules of the practice project are fiction of the exercise and labelled so.
Contract unchanged.

## 0. Summary
- 7 lessons, 420 min (7 h), ~283 min hands-on (67.4%).
- Zero agent spend per attempt: no hidden-task, no agent-eval, no model call in any check. Future rubric
  mentor ~$0.02/attempt (2 rubrics).
- Checks: command x9 (python3 >= 3.10 stdlib only, every run `python3 -I`, learner and variant processes `-I -B`), quiz x5, rubric x2 (each paired
  with a deterministic command check), bug-hunt x1.
- Spine: verification. L1 makes the check deterministic (tests that can fail, a Stop hook), and every later
  lesson is graded by the same machinery: learner tests run against hidden mutants behind an
  out-of-process seam (2.6), where every variant and every piece of learner code runs in its own process
  and never in the grader's, learner artifacts follow one grammar and one resolver (2.7) that the learner's
  own linter implements in L7.
- One domain across lessons: the `invoice-service` of module 00, extended with payment reminders (section
  3), on a test layout that was run, not assumed (2.10).
- Every task.md carries a "Готово, когда" list equal to what its checks enforce (2.9).

## 1. Module outcomes (module.yaml `outcomes`, Russian, verbatim)
Each lesson's `outcomes[]` copies the full sentence of every outcome it serves. Every verb is mapped to a
check in section 6. Six outcomes (role rule: 3-6); O5 has two halves served by two lessons.
- O1: "Делает проверку работы агента детерминированной: пишет тесты, которые падают на неверной реализации, и Stop-хук, который сам запускает тесты и не даёт агенту закончить ход при красных тестах."
- O2: "Оформляет повторяемую процедуру как скилл (SKILL.md по открытому стандарту Agent Skills, с полями Claude Code только там, где они нужны), решает, может ли модель вызывать его сама, и оставляет в постоянно загружаемой памяти проекта только то, что нужно в каждой сессии."
- O3: "Составляет глоссарий предметной области в формате, который читает агент: термины с определениями без деталей реализации, запрещённые синонимы и связи контекстов через доменные события, разводит по контекстам слово, которое в разных частях системы значит разное, и отличает сущность от объекта-значения и границу агрегата."
- O4: "Превращает описание фичи и протокол интервью в спецификацию с проверяемыми требованиями, один ADR для решения, которое трудно отменить, и список вертикальных задач, где каждая задача ссылается на требования и команду проверки."
- O5: "Реализует задачи из готовой спецификации через TDD вместе с агентом так, что код проходит скрытые приёмочные тесты, а каждое требование покрыто тестом с его идентификатором, и находит в записи сессии агента подмену проверки: правку теста, тавтологичный тест, пропущенный красный шаг, заявление без вывода команды, горизонтальную задачу, действие до подтверждения решения."
- O6: "Автоматизирует контроль целостности артефактов: пишет детерминированную проверку согласованности спецификации, задач, тестов, ADR и глоссария, подключает её к Stop-хуку и вносит изменение требований так, что проверка остаётся зелёной."

module.yaml: keep `summary`, add outcomes, `lessons:` the seven dirs of section 5 in order, `status: ready`
once all lessons are ready.

## 2. Conventions
### 2.1 quiz.yaml: as 00 2.1
Delta: every quiz has 6 questions (4 single + 2 multiple), `passScore: 0.8` (5/6): random pass 0.1211% per
attempt, 0.3628% over the 3-attempt cap (recomputed exactly by the assessment judge, round 1). Questions grade a
mechanism or a habit, never a vendor number, a Matt Pocock skill name or a version. A scenario that depends on
Claude Code behaviour names "Claude Code 2.1.312"; a Codex scenario names Codex CLI 0.165.0.

### 2.2 bugs.yaml and findings.json: as 00 2.2 and 2.2.1
Delta: L6 categories and decision rule are defined in L6; decoy sizing is per accepted range (each accepted
range is a separate guessable block). `maxReports` and `maxDecoyHits` live in `bugs.yaml` (the schema's
bug-hunt check has only `answers` and `minFound`; zod drops unknown keys), as in 00 L4.

### 2.3 Command-check runtime: as 00 2.3
(`python3 -I "$ACADEMY_CHECKS_DIR/<script>.py"`, no "checks/" substring, read-only mount without `reference/`
and `data/reserve/`, expected values from `checks/` only, strict JSON with `parse_constant` rejecting
NaN/Infinity, messages name file/field/form, never the expected value.) Deltas:
- Process rule (revision 3, assessment B1'/B2'): every piece of learner code (tests, hook, linter,
  implementation) and every variant or mutant runs in its own subprocess, never in the grader's process
  and never in a process that also runs grader assertions. Each such process gets an environment built from
  scratch (fixed `PATH`, fresh `HOME` and `TMPDIR` in the run's private temp root, no `ACADEMY_CHECKS_DIR`),
  `python3 -I -B` (the processes the grader starts write no bytecode cache; a child that learner code starts,
  such as the Stop hook's unittest run, may write `__pycache__` inside the grader-created P, which is removed
  with P: accuracy round 3, N2), `start_new_session=True`, a per-process timeout,
  and its cwd in a private temp copy built by the grader; after each process the grader kills its process
  group. Run order (variants, probes, linter roots) is shuffled per run with `secrets.SystemRandom`. A
  result record is read only from a pipe the grader created for it, never from stdout, files or any other
  learner-writable output, and is accepted only with the run's nonce and the producing process's normal exit
  0 (2.6). On Linux the grader's own first statement is `prctl(PR_SET_DUMPABLE, 0)` (the 2.6 snippet), before it
  holds a nonce, an acceptance test or a variant source: learner code is a child of the grader and could
  otherwise read the grader's `/proc/<ppid>/mem` and `fd/` (assessment round 3, N2: observed before the fix,
  closed after it, 2.10 item 7); the grader's `cmdline` stays readable and names the checks mount (11.9).
  Grader-created files (temp copies, HOME, TMPDIR, server files) never survive the run or land in
  the workspace. Files that learner code itself writes elsewhere at the same uid (`/tmp`, the workspace) are
  outside the grader's control until runner isolation (section 11.9, 11.13).
- Every expected value, glossary and pristine spec included, is read from `checks/data/`, never from the
  editable workspace.
- Markdown artifacts are parsed with the grammar and resolver of 2.7 only.
- Frontmatter subset (SKILL.md in L2, MADR front matter in L4/L7; no stdlib YAML). Line endings are
  normalized (CRLF and CR to LF) before parsing. Accepted lines between line-1 `---` and the closing `---`:
  `key: value` (key `[a-z][a-z0-9-]*`, exactly one space after the colon; a second space is rejected as
  "one space after the colon"); `metadata:` alone, followed by two-space-indented `key: value` string pairs;
  whole-line comments starting with `#` (MADR-T line 2 is one). Scalar forms: `"double"` without backslash or
  inner `"`; `'single'` with `''` as the only escape; plain. A plain scalar is rejected with "quote the value"
  when it contains `: `, ends with `:`, starts with one of `` - ? : , [ ] { } # & * ! ' " % @ ` ``, or is a
  YAML 1.1 typed form (null `~`/`null` in any of its three casings, the 1.1 booleans incl. `y`/`n`/`yes`/`on`,
  integers incl. `0x`/`0b`/`017`/`1_000`/sexagesimal, floats incl. `1.0`/`.5`/`.inf`/`.nan`, and dates
  `YYYY-MM-DD` with an optional time), except in the two CC boolean fields below and, in MADR front matter,
  outside `status` (accuracy round 3, N1: the typed rule applies there to `status` only, so MADR-T's
  `date: 2026-10-29` filled in unquoted passes); trailing spaces of a plain value are stripped before the
  typed-form rule, as YAML strips them (assessment round 3, N6: `2026-10-29 ` is a date to PyYAML and is
  rejected like `2026-10-29`); a plain scalar starting
  with `|` or `>` (block scalar) is rejected with "write the value on one line"; rejected with "remove the
  trailing comment" when it contains ` #`; a tab, an empty value, a duplicate key or any other line shape is
  rejected as "outside this exercise". Every message is about the exercise, never a CC claim. Booleans (L2):
  the CC fields `disable-model-invocation`, `user-invocable` read an unquoted `true`, `yes`, `on`, `1` as true
  and `false`, `no`, `off`, `0` as false, any letter case (S: "Boolean fields accept `yes`, `no`, `on`, `off`,
  `1`, and `0` in any letter case, in addition to `true` and `false`"); a quoted value there fails as "outside
  this exercise: write the boolean unquoted" (how CC reads a quoted string is not documented, RA open
  question). Ran against PyYAML 6.0.3 (2.10 items 5 and 9): every form the subset accepts parses to a mapping
  with the same scalar text, and since typed plain scalars are now rejected outside the two boolean fields
  (which the subset reads per S), every accepted value outside those fields is a string in PyYAML too
  (`metadata: version: 1.0` must be written `"1.0"`, as SPEC's own example does); every form PyYAML rejects
  (`Use when: x`, trailing `:`, leading `-` or `*`, tab) the subset rejects; the subset also rejects four
  forms YAML accepts (trailing comment, flow sequence, duplicate key, empty value), each with its own message.
  The typed-form rule errs on the strict side: it also rejects four values PyYAML keeps as strings: `y`, `n`
  (YAML 1.1 booleans), `1.5e3` (a YAML 1.2 float) and `2026-1-2` (typed by neither; the rule's date pattern is
  broader), so quoting is always the fix (accuracy round 3, N4).
- Failure-message budget. No command check here reports an aggregate count over enumerable enum fields. The
  2.6 messages carry no structural information once the seam isolates variants (2.6, observed in 2.10 item
  7), but repeated submissions still allow a positional guess and a per-class probe guess, so revision 5
  (Stepan's decision) caps failed submissions of the five checks that grade hidden runs (2.5); the rates
  under the cap are in 2.6, 2.8 and section 11.13. Revision 2's "uncapped submissions learn nothing beyond
  behaviour" stays withdrawn.

### 2.4 Demonstration protocol: as 00 2.4
((1) empty starter fails, (2) reference passes, (3) wrong solutions fail, (4a) usercustomize and (4b) PATH shim
on the EMPTY starter, (4c) top-level `os._exit(0)` in learner code on the REFERENCE, (4d)
`$ACADEMY_CHECKS_DIR/reference` and `.../data/reserve` absent; quiz scorer and bug-hunt matcher as scratch;
rubric blind sets.) Deltas: (4c) applies to every check that executes learner code (L1, L5, L7); 2.6 and 2.8 add
their own must-fail attack items, each with its base copy stated; an attack whose pass rate is a positional
guess is run on a fixed list of logged seeds and must fail on every one, and its exact rate is recorded
(section 11.13); every grammar check gets the near-miss "must pass" set listed with it. The Linux-only items
(`/proc` attacks) run on the image, not on macOS. The demo records
`python3 --version` of the interpreter it ran, and is re-run on the image interpreter before `ready`.

### 2.5 Runner, caps, mentor, reserve: as 00 2.5 items 1-6 and plan W2/W3
Quizzes and the bug-hunt: 3 scored submissions, reveal closes as "не пройдено", mentor review records
`passedVia: mentor-review`, nothing reopens a closed check. Failed-submission cap (revision 5, Stepan's
decision; same footing as 00 2.5.6: a runner requirement for #08, state per learner and check on the
platform, never in the workspace): `late-fee-verified`, `stop-hook-tests` (L1), `reminders-accepted` (L5),
`change-request-applied`, `stop-hook-integrity` (L7) accept at most 10 failed submissions, then close as "не
пройдено" with a mentor review; the counter is never reset and nothing reopens the check. Stage 0 (revision
6, pedagogy round 4, B1): each capped check runs an explicit static stage 0 before any hidden run (2.6
variant or acceptance runs, 2.8 behaviour probes); its rules are listed in the check entry under "Stage 0",
it reads only the workspace files and the pristine data, it runs no learner code, and a failure there is
reported with its message and does not count. Every rule that can be checked statically is in stage 0; a
submission counts only if it passed stage 0 and then failed in the hidden runs. Some stage-0 rules are
checked again from the run record (for example skips added at run time); a failure found only there counts.
The UI suggests the mentor after 5 counted failures. Each affected task.md has a cap item that copies the
check's stage-0 list exactly and says when the mentor is offered. Demo: for each of the five checks, one
stage-0 must-fail (L1 `late-fee-verified`: the untouched starter, whose skipped test fails stage 0) leaves
the counter unchanged, and one submission that passes stage 0 and fails a hidden run raises it by exactly 1;
for `change-request-applied` the pair is an ADR numbering gap (stage 0, C4: counter unchanged) and a test
edited to fail on a correct version ((B): counter +1) (revision 7, pedagogy round 5, B1'). Mentor information rule as 00 2.5.6 (no key, no
per-item correctness). The mentor may discuss a surviving mutant or a failing test the check message already
named, never one it did not name. Reserve pools in `checks/data/reserve/<check-id>.yaml`: every quiz >= 6
unseen questions; the L6 bug-hunt a second authored excerpt with >= 3 planted mistakes, its own key, explicit
`minFound`, >= 1 decoy per planted category. Platform requirement (new, item 11.8): a lesson's workspace opens
only after its prerequisite lesson is done, because later starters ship earlier reference answers.

### 2.6 Mutation grading of learner tests ("M convention"; L1, L5, L7)
Purpose: observe "tests that fail on a wrong implementation" (R 1.5, 1.6; Böckeler names mutation testing as
the regression-quality signal) without a model.
- Data in `checks/data/<lesson>/`: `reference.py`; `mutants/<id>.py` (one deliberate defect each);
  `mutants.json` mapping each mutant id to the requirement id it violates and a one-line Russian description
  (the message text). Fixed counts (assessment N6, positional-guess denominator below): correct runs are
  exactly 6 per check, six copies of the reference (revision 4, assessment round 3, N4: behind the seam a
  structurally different equivalent can only differ from the reference in timing or resource usage, which
  would hand an attacker the equivalents' positions; revision 3's e1..e3 are dropped); mutants exactly 12 in
  L1 (>= 2 per REQ-01..05 plus 2 boundary mutants), exactly 12 in L5 (one per REQ-01..08 plus 4 boundary
  mutants), 14 in L7 (L5's 12 plus 2 dispute mutants).
- Validated domain D and surface. D is the seam's typed and bounded domain, stated with its numbers in the
  lesson's requirement document and task.md (assessment round 3, N5: the prototype's `LIMIT` was in no text):
  - L1 `late_fee(amount_cents: int, days_late: int)`: exact `int` (`bool` excluded), each argument with
    -1 000 000 000 <= x <= 1 000 000 000; `docs/late-fee.md` states the result for every value in that
    range, negative `days_late` and non-positive `amount_cents` included.
  - L5/L7 `plan_reminders(invoices, sent_reminders, today)`: `invoices` and `sent_reminders` lists of 0-50
    items of the dataclasses the L4 brief fixes in the pristine `invoices.models`; `today` and every date
    field a `date` from 2000-01-01 to 2099-12-31; every integer field (money in minor units, counts)
    0 <= x <= 1 000 000 000; every string field 1-64 characters of `[A-Za-z0-9-]`; enums by member; nested
    lists (invoice lines) 0-50 items; exact types throughout. The brief and task.md print this list.
  The surface, over D only: for each call, the return value (type and value, list order) or the raised
  exception (type and message). Every exception a requirement specifies carries the message the requirement
  document fixes (L1 REQ-05: `ValueError("amount_cents must be positive")`); the reference raises no other
  exception inside D (demo: the differential sampler draws each argument and field uniformly over its whole
  bounded range, plus its extremes and every requirement's boundary values, >= 100k calls). Outside D the
  server, before any variant code runs, answers every call with one fixed `TypeError("<seam name>: arguments
  outside the interface domain")`, identical for every variant (the proxy raises the same error locally
  first; the server check is the authoritative one, because learner test code can write to the seam pipe
  directly). So an honest test with a huge amount gets this documented `TypeError`, never an undocumented one.
  Revision 2's "identical for EVERY input" was unattainable (out-of-domain `TypeError` text names each
  variant's operator, assessment B1'.2) and is withdrawn. Money is integer minor units, so no float arises.
  Input mutation is not part of the surface (arguments are serialized across the seam).
- Mutant rules (asserted in the demo): every mutant differs from the reference on at least one input inside
  the domain the requirement document specifies, shown by one concrete witness input, and that difference is
  stated by the requirement it maps to; no two mutants are behaviourally identical; at least one mutant per
  requirement. The witness rule is not decoration: in the scratch toy (2.10 item 4) the obvious grace-period
  boundary mutant `<=` -> `<` was equivalent, because the fee formula already yields 0 on the boundary day;
  boundary mutants are designed against the formula, and the demo rejects any mutant without a witness.
- Out-of-process seam (revision 3; closes assessment B1' and B2'). Two processes per run, both started by the
  grader, neither of them the grader:
  - Server: `python3 -I -B <run>/srv/server.py` (server copied from `checks/fixtures/` into the run's 0700
    temp root), cwd an empty temp dir. Its argv and env carry nothing variant-specific: the env holds only
    `PATH`, `HOME`, `TMPDIR` and the numbers of its four inherited pipe fds. On Linux its first statement is
    `prctl(PR_SET_DUMPABLE, 0)` via `ctypes` (stdlib), which makes `/proc/<pid>/mem`, `fd/` and `environ`
    unreadable to a same-uid process (observed, 2.10 item 7); it then writes `armed` on its ready pipe, and
    only then does the grader write the variant source into the source pipe and close it. The server reads
    the source to EOF, runs `compile(src, "<seam>", "exec")` + `exec` into a fresh module object (no file on
    disk at any point, no bytecode cache, `__file__` = `"<seam>"`), drops the source, puts the pristine
    `invoices.models` copy on `sys.path` explicitly (`-I` ignores `PYTHONPATH`), and writes `ready` (or
    `broken` if the module failed to load). It answers JSON-line calls only for the lesson's seam names, only
    for arguments in D (else the fixed `TypeError`), and only with a return value of the declared return type
    (else a fixed `TypeError("<seam name>: return value outside the interface domain")`); exceptions are
    forwarded by type and message for a fixed list of builtin types, any other type as one fixed
    `RuntimeError`.
  - Test process: `python3 -I -B <run>/tst/bootstrap.py`, cwd a private project copy: pristine
    `src/invoices/__init__.py` and `models.py` from `checks/data/`, the grader proxy as the seam module
    (`src/invoices/late_fee.py` in L1, `src/invoices/reminders.py` in L5/L7; byte-identical for every
    variant; it validates D locally, forwards calls, re-raises forwarded exceptions, validates every answer
    strictly and rebuilds dataclasses from the pristine `invoices.models`), and `tests/__init__.py`. On Linux
    it also sets itself non-dumpable first. It reads a per-run nonce (`secrets.token_hex(16)`) from stdin, then
    the test source from an inherited pipe if the grader sends one, closes both, inserts `<proj>/src` and
    `<proj>` at the front of `sys.path`, loads the tests, writes `loaded` on an ack pipe, waits for one `go`
    byte, shuffles the suite order with `secrets`, runs it and writes one JSON record `{nonce, testsRun,
    failures:[ids], errors:[ids], skipped, expectedFailures, unexpectedSuccesses}` to the record pipe, then
    `os._exit(0)`.
  - Check (B), learner tests vs variants: V is a grader variant, sent as source to the server. The server
    starts first; after `ready` the grader starts the test process with the learner's single test file on
    disk in the private copy at the path the lesson states (imported normally, so `__file__` and relative
    helpers work; `-B` writes no cache), then sends `go`.
  - Check (A), acceptance: V is the learner's implementation file, sent as source to the server. The grader's
    acceptance tests are sent to the test process over its pipe (never on disk anywhere in the run, so server
    side learner code finds no file to read). The test process starts first and must ack `loaded` before the
    server, and with it any learner code, exists; then the server is started, and `go` follows `ready`. The
    test process imports only grader code and the proxy: the learner's module never shares a process with a
    grader assertion or the record pipe, so the round-2 forged record + `os._exit` and the monkeypatched
    `assertEqual` act on the server process only (observed: both FAIL, 2.10 item 7). Allowed imports for the
    learner's implementation are the stdlib and `invoices.models`, enforced by construction: nothing else is
    on the server's `sys.path`.
  - Record acceptance: the grader reads the record pipe until EOF or the per-run deadline (select-based, so a
    leftover writer cannot hang it) and accepts the record only if (1) the pipe holds exactly one JSON object
    (strict parse, `parse_constant` rejecting NaN/Infinity), (2) its `nonce` equals the run's nonce, and (3)
    the test process exited normally with code 0 within the deadline. Anything else is "no valid record".
    What the nonce protects (assessment round 3, N3): in (A) learner code runs only in the server, so the
    nonce and the exit-code rule keep it from writing or ending a record. In (B) learner test code shares the
    test process with the bootstrap and can read the real nonce and write a valid record (observed by the
    judge, 12/12); it gains nothing, because a record it writes still has to fail on the mutants it cannot
    tell apart. The (B) verdict rests only on the variants being unidentifiable, never on the nonce.
    Per-run timeout 10 s (honest runs took 0.04-0.1 s each in the prototype).
  - After each run the grader kills both process groups and removes the run's temp root; HOME and TMPDIR are
    fresh for every process.
- Allowed imports for learner tests (stated in task.md): the stdlib, the lesson's seam names, and in L5/L7
  `invoices.models` (L1's seam needs no model, so L1 allows the stdlib and `late_fee` only, in 2.6 and task.md
  alike: pedagogy N1). Importing any other name from the seam module raises `ImportError` through the proxy;
  the check reports it as "тест импортирует имя, которого нет в интерфейсе: <name>".
- Verdict: the runs (6 correct, the lesson's mutants) are executed in an order shuffled per run with
  `secrets.SystemRandom`; a run with no valid record (crash, `os._exit`, timeout, nonce or exit-code mismatch)
  fails, naming the variant class ("верная реализация" / "мутант") and the cause; on every correct run
  `testsRun >= 3`, no failures, no errors; in every run `skipped`, `expectedFailures`, `unexpectedSuccesses`
  are 0; every mutant killed (>= 1 failure or error). Traceability (L5, L7): a mutant counts as killed only if at least one failing test's
  method name carries the `req_NN` label of the requirement it violates, by the 2.7 resolver (method name =
  last dotted component of the record id before any space, so `subTest` ids work; only method names that the
  2.7 AST extraction also finds count, so generated tests carry no labels).
- Messages: a test failing on every correct run names the test ("тест <name> падает на верной реализации"); a
  test failing on some correct runs but not all: "тест <name> падает только в части запусков верной
  реализации: проверьте, что он не зависит от порядка запуска, времени или состояния вне теста" (all six are
  reference copies, so this needs an order, timing or shared-state dependence; the demo asserts it never
  fires for the reference tests); a
  surviving mutant is named by requirement id and description ("выжил мутант: REQ-03, граница льготного
  периода"). Information: the reference-failure message is an oracle for reference outputs, but the learner
  already holds one, their own implementation that passes (A); it adds no expected value the learner cannot
  compute, and choosing inputs that discriminate (the skill) stays with the learner. A surviving-mutant
  message says which requirement lacks a discriminating test, the intended feedback. Because the order is
  reshuffled every run, no message tells the position of any variant in the next run.
- What the test process can and cannot observe (revision 3; assessment B1'.f corrected the revision 2 claim
  "no structural fingerprint can tell variants apart"). Closed by the seam and observed closed in the
  prototype (2.10 item 7): server argv (no variant path; identical for every variant), files near the server
  (none variant-specific; no `.pyc` anywhere in the run), the source race (no file exists), the proxy's
  source and `co_*` (identical), out-of-domain error text (one fixed `TypeError` for every variant, also when
  the learner writes to the seam pipe directly), Linux `/proc/<pid>/mem`, `fd/`, `environ` of the three
  processes that hold secrets, the server, the test process and the grader (unreadable after
  `PR_SET_DUMPABLE` 0; before that fix the memory scan of the server told variants apart, and a scan of the
  grader found the acceptance source, nonce candidates and variant sources; assessment round 3, N2). Not
  closed by the seam, so stated as residuals with numbers (11.13): (i) run order through cross-process state
  that learner code keeps outside the grader-created dirs (a hard-coded `/tmp` path, the workspace, a `setsid`
  daemon that escapes the process-group kill); shuffling turns it into a positional guess; (ii) timing and
  resource usage (Linux `/proc/<pid>/stat` minflt and rss, `statm`, `status`; macOS `ps` rss), readable even
  after `PR_SET_DUMPABLE` 0, between the reference copies and the mutants (demo guard below); (iii) the
  `checks/data/` mount, whose path the grader's argv names (11.9: pass about 1 for a learner who reads it).
- Positional-guess residual (assessment B1'.d, recomputed). An attacker with cross-run memory that knows the
  counts passes only by committing to which positions are correct: 1/C(E+M, E). With E = 6 correct runs:
  L1 and L5 (M = 12) 1/C(18,6) = 1/18564 = 0.0054% per submission, 0.0539% within the cap of 10 failed
  submissions (2.5); L7 (M = 14) 1/C(20,6) = 1/38760 = 0.0026%, 0.0258% within the cap. Without memory (runner isolation of `/tmp` and uid, 11.13)
  the best independent guess passes with max over q of q^E (1-q)^M: 1/94585 for L1/L5 and 1/202255 for L7.
  For comparison, revision 2's counts (4 correct, 6 mutants in L1) gave the judge's 1/C(10,4) = 1/210
  (confirmed). In L5/L7 the guess must also carry the right labels, which "fail every labelled test" covers,
  so the rate is the same.
- Cheapest attackers and must-fail demo items, each with its base copy (the learner test file replaced by
  the attack file unless stated; L1 attacks on the REFERENCE implementation, so (A) passes and only (B)
  decides):
  - weak tests (one happy path): mutants survive;
  - source pinning and the 4096-test fingerprint bank of revision 1 (`inspect.getsource`, `co_code`, file
    size), one and two submissions: every variant shows the proxy's fingerprint;
  - the round-2 judge's `pyc_bank` / `pyc_pin` (server argv via `ps`, leftover `__pycache__/*.pyc`), its
    `race` (read the V copy before the unlink), its `err_bank` (fingerprint of out-of-domain error messages),
    and a `raw_pipe` variant writing non-seam names and out-of-domain arguments straight to the seam pipe:
    each sees the same view on every variant and fails;
  - a structure probe that hashes the server's argv, its directory listing, every `.pyc` under the run root
    and the proxy source: one view (modulo random temp names) on every variant, fails;
  - Linux only: a `/proc` probe reading the server's `cmdline`, `environ`, `fd/`, `mem`: fails (the last
    three unreadable);
  - `counter` (judge's: a counter under a hard-coded `/tmp` path keyed by the grader pid, tests fail iff the
    run index >= E): fails on every logged seed; the same attack with the shuffle disabled must PASS in the
    demo (the guard is watched going red);
  - `skipTest`/`@skip`/`@expectedFailure`: 0-skips rule; tautological expected values
    (`assertEqual(late_fee(a, b), late_fee(a, b))`): no mutant killed; top-level `os._exit(0)` in the test
    file: no record; the real-nonce forge (reads `sys.modules["__main__"].nonce` and `REC_FD`, writes a record
    claiming 3 passing tests, then `os._exit(0)`): the record is accepted, and the check still fails on the
    mutants, because it says the same on every run (replaces revision 3's guessed-nonce item, which proved
    nothing in (B)); one test named with every `req_NN` (L5/L7): 2-label cap (2.7).
  - Linux only, grader memory (judge's `grader_mem`, `grader_mem_b`): learner code in the server (A) and in
    the test process (B) opens `/proc/<ppid>/maps`, `mem` and lists `fd/` of the grader: PermissionError on
    each, fails (observed after the grader's `PR_SET_DUMPABLE` 0, 2.10 item 7).
  - Resource and timing probe (B): per call latency over 3000 calls and, between calls, the server's
    minflt, rss, `statm`, `VmRSS` (Linux) or `ps` rss/vsz (macOS); tests fail iff the run's statistics fall
    on the mutant side of a threshold learned in earlier runs: fails on every logged seed.
  - Check (A), base the learner implementation replaced as stated: a `return 0` implementation fails; the
    judge's forged record + `os._exit(0)` (writing to `sys.argv[2]` and to every fd 0-63): no `ready`,
    every acceptance test errors, fails; `unittest.TestCase.assertEqual` / `assertRaises` monkeypatched plus
    `return 0`: the patch lives in the server, the acceptance tests fail; bare `os._exit(0)`: fails; Linux
    only, a module that at import scans `/proc` for the bootstrap, reads its `mem` for the nonce, writes a
    forged record to each of its fds and kills it: `mem` and `fd/` unreadable, the kill leaves exit -9, fails.
  Residual (11.2, 11.13): a differential test against the learner's own correct re-implementation passes (it
  still needs the behaviour from the requirements); until runner 2.5.3 (separate uid, hidden `/proc`)
  exists, learner code can read `checks/data/<lesson>/`: the grader's argv (`ps`, `/proc/<pid>/cmdline`,
  readable even when non-dumpable) names the script under the mount, and the judge's `mount_diff` (B), which
  loads `reference.py` from there and compares the seam with it, passed 3/3 with no requirement knowledge
  (pass about 1, 11.13); in (A) learner code in the server can still kill the test process (the check then
  fails, never passes).
- Demo items: reference tests pass all six correct runs and kill every mutant; the reference over >= 100k
  calls of the differential sampler (uniform over the bounded D, plus extremes and boundary values) raises
  only the requirement-fixed exceptions with their messages; one witness input per mutant, inside the bounded
  D; every out-of-D input class (wrong type, `bool`, float, a value one past each bound, extra or missing
  argument, non-seam name, raw pipe write) gets the same fixed answer from every variant; every attacker above
  fails on its base copy; the proxy is byte-identical across variants (hash asserted); no file is created in
  the run's temp root that differs between variants other than random names; nothing remains in the temp
  root or workspace after a run. Side-channel guard (assessment round 3, N4), on the real-size variants: the
  resource and timing statistics above, 20 runs of each variant; for every statistic, the best single
  threshold separating the reference copies from each mutant must stay within 4 standard deviations of 0.5
  accuracy; a mutant that separates is redesigned (or padded) before `ready`, and the observed accuracies are
  recorded in 11.13.

### 2.7 Artifact grammar and the shared resolver (taught in L3-L4, implemented by the learner in L7)
Exercise conventions, stated as such in task.md (each a simplification of the cited source). Section
headings are English template keys; prose may be Russian.
- Glossary (Matt Pocock GLOSSARY-FORMAT, R 3): root `GLOSSARY-MAP.md` with `## Contexts` (a list of links to
  the context files) and `## Relationships` (list lines). Context files `docs/billing/GLOSSARY.md` and
  `docs/ledger/GLOSSARY.md`: `# <Context>`, optional prose lines (Matt's one-two sentence context
  description), `## Language`, entries `**Term**: <definition>` with an optional next line `_Avoid_: word,
  word`. Each `_Avoid_` entry is a single word `[A-Za-z]+`; a multi-word entry is a format error. Term
  names compare case-insensitively with spaces removed (`Credit Note` = `CreditNote` = `credit note`). A
  Relationships line "names both contexts" when it contains each context's `# <Context>` name as a whole
  word, case-insensitive, and at least one backticked PascalCase event (`` `PaymentReceived` ``).
- Spec `docs/spec.md` (Matt Pocock `to-spec` headings, R 3, plus Requirements): `## Problem Statement`,
  `## Solution`, `## User Stories` (numbered), `## Requirements`, `## Implementation Decisions`,
  `## Testing Decisions`, `## Out of Scope`, optional `## Further Notes`. Requirement lines:
  `- **REQ-NN** WHEN <condition> THE SYSTEM SHALL <behaviour>`. This is the WHEN...SHALL pattern Kiro
  documents (R 4: "WHEN [condition/event] THE SYSTEM SHALL [expected behavior]"); EARS has other patterns this
  exercise does not use, and theory says so. IDs `REQ-` + two digits, unique.
- ADR `docs/adr/NNNN-slug.md`. Nygard shape (R 5), the only one the learner's L7 linter must read: first
  heading `# ADR-NNNN: <title>` with NNNN equal to the file number; line `Status: proposed | accepted |
  deprecated | superseded by ADR-NNNN`; `## Context`, `## Decision`, `## Consequences`. Grader checks also
  accept the MADR 4.0.0 shape, copied from MADR-T: front matter per 2.3 with `status` as a plain, double- or
  single-quoted scalar from `proposed | rejected | accepted | deprecated | superseded by ADR-NNNN` (MADR-T:
  `status: "{proposed | rejected | accepted | deprecated | … | superseded by ADR-0123"`), other front-matter
  keys read for the 2.3 line shape only (the typed-form rule applies to `status` alone, so an unquoted
  `date: 2026-10-29` passes); headings `## Context and Problem Statement`, `## Decision Outcome` and `### Consequences`
  below `## Decision Outcome` (MADR-T order: Context and Problem Statement, Decision Drivers, Considered
  Options, Decision Outcome, `### Consequences`, `### Confirmation`, Pros and Cons of the Options, More
  Information); other MADR-T headings allowed. MADR-T marks the front matter "optional metadata elements" and
  Consequences "an optional element"; this exercise requires both, and task.md says it is the exercise's
  rule. Numbers start at 0001, are consecutive and never reused (Nygard).
- Tasks `docs/tasks.md` (Matt Pocock `to-tickets`, Spec Kit `tasks.md` as cases, R 3-4): blocks
  `## T-NN: <title>` with lines `Requirements: REQ-NN[, REQ-NN...]`, `Blocked by: none | T-NN[, ...]`,
  `Check:` followed by one backticked command, `Status: todo | done`. Blocking edges acyclic, pointing at
  existing tasks.
- Resolver (one definition used by every grader rule in L4, L5, L7; L7 task.md prints the first five bullets
  verbatim and, for the sixth, "the `_Avoid_` words are the union over every context file that
  `GLOSSARY-MAP.md` under `<root>` links" (revision 4, pedagogy round 3, N-e), because the leak guard fails any
  task.md containing the substring `checks/` and the sixth bullet names that directory):
  - Tokenizer, one for prose and test names alike: maximal runs of `[A-Za-z]+`, lower-cased. Cyrillic,
    digits, `_`, punctuation are boundaries, so `billing` is one token (does not match `bill`), `clientId` is
    the token `clientid` (does not match `client`), an English word inside a Russian sentence is a token
    (`клиент client` contains `client`), the Russian word `клиент` yields no token, and the test name
    `test_req_01_client2` yields `test`, `req`, `client`.
  - Match: a token matches an `_Avoid_` word `w` when it equals `w`, `w + "s"` or `w + "es"` (so `clients`
    matches `client`; `billing` still does not match `bill`).
  - Scanned regions for vocabulary (C6): in `docs/spec.md` and `docs/tasks.md` every line except heading lines
    (`#` at line start), `Check:` lines and lines inside fenced code blocks, plus the title part (after the
    first `:`) of every `## T-NN:` heading (L3 teaches vocabulary in issue titles); plus test method names.
    Fences (CommonMark): a line whose first non-space character, after at most 3 spaces, starts a run of >= 3
    backticks or >= 3 tildes opens a fence; a line of the same character, at least as long, closes it; an
    unclosed fence runs to the end of the file.
  - Test names: `ast.parse` of every `tests/test_*.py`; names of `def`/`async def` starting with `test` at
    module level and directly in the body of a module-level `class`.
  - Requirement labels in a test name: regex `(?:^|_)req_(\d{2})(?=_|$)`; at most 2 labels per name (a name
    with 3 or more is a finding: "слишком много требований в одном имени теста"). `REQ-NN` in spec and tasks:
    regex `\bREQ-(\d{2})\b`, whole id, so `REQ-1` never matches `REQ-10`.
  - `_Avoid_` words: the union over both contexts, read from the pristine glossary in `checks/data/` for
    grader rules; the learner's linter reads the workspace glossary (it is a tool for the project, not a
    grader). Consequence stated in L4, L5 and L7 task.md (assessment N2): billing avoids `account`, so the
    English word `account` cannot appear in spec, tasks or test names even in the ledger sense; write the
    ledger term as `LedgerAccount` (one token, `ledgeraccount`) or in Russian.
- Consistency rules C1-C6: C1 every REQ in the spec is listed by at least one task; C2 every REQ cited by a
  task or a test label exists in the spec; C3 every REQ listed by a `done` task has at least one test label
  for it; C4 ADR numbering and status as above, every `superseded by` target exists and differs from the
  file itself; C5 spec and tasks cite (`ADR-NNNN`) only ADRs that are neither superseded nor deprecated (the
  superseding ADR may mention the one it replaces); C6 no `_Avoid_` word occurs as a token in a scanned
  region. Linter CLI: `python3 scripts/check_artifacts.py <root>`, exit 0 clean, 1 findings (one line each on
  stdout: `<rule> <file>: <token>`), 2 usage or parse error with the message on stderr (argparse's convention;
  this repo's `scripts/design_tokens.py` convention for the codes, R 5). A parse error is a root the grammar
  cannot read: `docs/spec.md` or `GLOSSARY-MAP.md` missing, or a context file it links missing.
  Token per rule: C1 the unlisted REQ id; C2 the missing REQ id; C3 the untested REQ id; C4 the missing ADR
  number `ADR-NNNN` (gap or dangling `superseded by`) or the file name (bad status, self-supersede); C5 the
  cited ADR id; C6 the word.

### 2.8 Stop hook convention (L1, extended in L7). CC facts from R 1.3 and RA A1-A5, Claude Code 2.1.312
Test command, pinned and run (2.10): `PYTHONPATH=src python3 -m unittest discover -s tests -t .` from the
project root, with `tests/__init__.py` present. Every module-01 starter ships `tests/__init__.py` and
module 00's `tests/test_api.py` rewritten as a `unittest.TestCase` with `setUpModule` setting `APP_ENV=test`
(module 00's file is pytest-style, which unittest does not collect, and the image has no pytest). The hook
runs it in `$CLAUDE_PROJECT_DIR` with `PYTHONPATH=$CLAUDE_PROJECT_DIR/src` in the child's environment and
without `-I` on the child (`-I` ignores `PYTHONPATH`: observed, every test module then fails to import).
Registration (part (a) of each Stop-hook check), as 00 L6 (a) with these deltas:
- `.claude/settings.json` -> `hooks.Stop` -> exactly one group with exactly one hook object, no other Stop
  hook. A `matcher` on the group fails as outside this exercise because CC ignores it (H: "If you add a
  `matcher` field to an event without matcher support, it is silently ignored"); never called a CC error.
- Command forms: 00 L6 E1-E3 and the 12 shell spellings, path `/.claude/hooks/stop_tests.py`; shebang and
  exec bit as 00. Starter skeleton ships both.
- Hook-object keys: `type: "command"`; `"prompt"`/`"agent"` fail by name (paraphrasing BP: another model
  decides; BP: "For real enforcement, use a `command` or `http` hook"); `"http"`, `"mcp_tool"` outside the
  exercise. `command`, `args`; `timeout` absent or >= 30 (exercise floor, above the 20 s probe timeout, so a
  hook that passes the probes also finishes inside its registered timeout); `statusMessage`; `onFailure`
  either value (H: it "has no effect" on Stop). Rejected by name with the documented reason (H): `async`
  ("Async hooks can't block or control Claude's behavior"); `asyncRewake` (it "runs in the background and
  wakes Claude on exit code 2"; it does not hold the stop the probes model); `if` ("On other events, a hook
  with `if` set never runs"); `once` ("ignored in settings files"); `shell` ("Ignored when `args` is set";
  without `args` it changes the interpreter of the 00 L6 spellings); any other key outside the exercise.
  `disableAllHooks` other than `false` in `.claude/settings.json` or `.claude/settings.local.json` fails.
Behaviour (part (b)), revision 3 probe protocol (assessment B1'.c). Each probe gets a fresh P, a fresh copy
of the learner's hook inside it at `P/.claude/hooks/stop_tests.py`, fresh `HOME` and `TMPDIR`, and runs
`python3 -I -B P/.claude/hooks/stop_tests.py` with `CLAUDE_PROJECT_DIR=P`, cwd `P`, a Stop payload on stdin,
`start_new_session=True`, probe timeout 20 s; the grader kills the probe's process group afterwards and stops
at the first timeout with a message. Probe order is shuffled per run with `secrets.SystemRandom`. Payload
base: `session_id`, `transcript_path` (existing empty file), `cwd: P`, `hook_event_name: "Stop"`,
`stop_hook_active`, `last_assistant_message`, `background_tasks: []`, `session_crons: []` (RA A5).
Payload classes (the stdin a probe gets): `claim` (`stop_hook_active: false`, `last_assistant_message:
"Готово, все тесты проходят."`), `failmsg` (same with `"Тесты падают, надо разобраться."`), `minimal` (no
`last_assistant_message`, no `background_tasks`/`session_crons`; H: the arrays are present "when the task
registry is reachable"), `extra` (adds `permission_mode`, `prompt_id`, `effort`, RA A5), `nokey` (no
`stop_hook_active`), `nonjson` (stdin is not JSON). The class is chosen independently of P's state, so stdin
tells nothing about red or green (in revision 2 the stdin variant identified rows 8, 9 and 11).
P is a copy of the lesson's reference workspace layout (same `src/`, `tests/__init__.py`, `tests/test_api.py`)
plus grader-controlled files. Probe generator (revision 4, assessment round 3, B1''; revision 6, assessment
round 4, B1''' and Stepan's decision K = 1): one template for red and green, filled as follows, in this order,
all of it in grader memory before anything of P exists on disk:
1. Fresh random names, drawn the same way for every probe: test module names `<a>`, `<b>` = `x` +
   `secrets.token_hex(4)`, and method names `test_` + `x` + `secrets.token_hex(4)` (the `test` prefix is what
   unittest collects; pedagogy round 4, N-j).
2. Three constants drawn uniformly with `secrets.randbelow(10**4)`, independently of the state: `k` (the
   asserted value), `j` (the fixture file `tests/fixtures/f<j>.json`, written with `{}`), `m` (the attribute
   `_a<m> = 1` in `src/invoices/__init__.py`).
3. Seeds, with work independent of the state (revision 6): for each of `k`, `j`, `m` the generator samples
   BOTH a hitting seed and a missing seed on every probe, each `secrets.token_hex(8)` redrawn until
   `h(s) = int(sha256(s).hexdigest()[:8], 16) % 10**4` equals (hit) or differs from (miss) the constant. Only
   then does the state select, in one place, which seed of each pair is written: hits on green, misses on red.
   The state reaches nothing else that is written (demo assertion `state_flow`, below). Revision 5 sampled
   only the seed the state needed, so a green probe cost about 3 x 10^4 hashes and a red one about 3, and it
   created P's directories before the draw: the gap between file timestamps told the state (the judge's
   `mtime_off`, 20/20), and with the draw moved first the time between probes still told it (`gap_mem`, 7/10).
4. The template, the same text on red and green: `tests/test_<a>.py` defines `_h` with
   `int(hexdigest()[:8], 16) % 10**4`, methods `assertEqual(_h("<sa>", 10**4), <k>)`,
   `open(fixtures/f%d.json % _h("<sb>", 10**4))` and a plain pass; `tests/test_<b>.py` does
   `getattr(import_module("invoices"), "_a%d" % ...)` at import, plus one passing method. Revision 5's four
   templates are withdrawn (Stepan, revision 6): all four computed the same `h` and carried `j` and the seeds
   as plain literals, so one template-agnostic hook decided every one of them (`generic_eval`, 10/10), and
   the extra templates bought nothing against it.
5. Only after items 1-4: create P, write every file, copy the hook, start it.
So red and green have the same files, the same fixture count, the same literal `10**4`, constants and seeds
with the same distribution, the same generator work and the same order and timing of file creation: the
state lives only in whether `sha256` of a written seed hits its constant. No flag, offset or other literal
differs between red and green.
On red the assertion fails, the fixture read raises `FileNotFoundError`, and the import of `test_<b>` fails
(`AttributeError`); on green all pass (observed: red "FAILED (failures=1, errors=2)" with both method names,
`tests.test_<b>` and the missing-file phrase in the output; green "OK", 2.10 item 8). So every red probe
exercises all three failure kinds at once (a red reason must contain both failing method names and
`tests.test_<b>`, which also grades "every failing test name", pedagogy N1).
What a hook that runs no test can still do (revision 6 correction of revisions 3-5, which said deciding
statically "needs evaluating the `sha256` expressions" and that a hook not written for a template "is left
with a guess"): a hook can read P's files and decide red or green by evaluating them itself, for example by
hashing every 16-hex seed it finds and comparing with the plain-digit numbers in P (`f<j>.json`, `_a<m>`),
without parsing the template or running unittest. The judge's `generic_eval` does this and passes about 1
(2.10 item 8). It needs the generator's shape, which one submission can copy out of P. That is residual (iv)
in 11.13, accepted by Stepan on the same footing as (iii). What the generator aims at, as far as the three guards
below measure (a bound on the attackers they model, not a proof): a hook that neither runs the tests nor
evaluates what they compute is left with the per-class guess.
Generator guards (demo, all must hold before any probe rate is cited), each watched going red:
- Text guard: over >= 1000 red and 1000 green projects (a second, independent set for testing), (1) with
  every random name, seed and constant masked (the generator's output re-rendered with a sentinel for each
  random value, and checked to re-substitute to the real files; any other key, such as a state flag, is
  rendered as is), all projects are byte-identical; (2) for every static feature a non-running hook can
  compute (each token and literal, each line's length, file sizes and line counts, AST node-type counts,
  each integer literal's value, digit length, parity, residues mod 3, 7 and 10, leading digit and half of
  the range, order relations between the constants, and hash-free folds of the seeds, such as their first 8
  hex digits mod 10**4 or their digit-sum parity), the best per-value rule learned on the first set must
  stay within 4 standard deviations of 0.5 accuracy on the second. Controls: the revision-3 offset literal
  and a red constant drawn from the lower half of the range each make it fail.
- Metadata and timing guard (revision 6; the demo runs it at 1000 + 1000, never fewer: a 300-pair re-run
  spread to 0.5517, assessment round 5, 5): >= 1000 red and 1000 green probes built on disk through the
  grader's own code path up to the hook's start (learn and test sets as above), comparing the wall time and
  the grader's CPU time from the start of the probe to the hook's start, every pairwise mtime, ctime and
  birthtime gap among P's paths, and the inode order of P's files; continuous values cut into 10 quantile
  bins learned on the first set; the same 4-sd rule. Controls: revision 5's build order (directories before
  the draw, state-dependent work) and draw-first with state-dependent work each make it fail.
- State flow (revision 6, assessment round 4, non-blocking 1): an AST assertion over the generator source
  that the state is used in the seed sampler exactly once, as the selector between the hit and the miss
  seed, and never in the renderer or writer; outside the selector, `state` may appear only as the zero-tests
  branch test, as the argument of the one `draw(state)` call and in the expected-token computation, and none of
  these reaches the files (revision 7, assessment round 5, 1). Controls: the judge's `harness_genleak.py` (the
  `sum_leak` relation written after `draw` in `generate`) fails it; and the judge's `sum_leak` (red `m = (k + j) mod 10**4`,
  every constant still uniform on its own), which the text guard cannot see, fails it.
Observed results: 2.10 item 10.
Payload `cwd` equals `P` in every probe; theory says they diverge in a worktree or after `cd` (H:
`${CLAUDE_PROJECT_DIR}` "stays put", `cwd` "follows Claude") and the exercise picks the project root on
purpose.
Verdict model (every Stop probe of L1 and L7): the grader reproduces CC 2.1.312's outcome only for forms H/G
document; other forms fail as "outside this exercise" with their own reason.
1. Timeout: fail; H: CC cancels a timed-out hook, "discarding the hook's output".
2. Stdout, whitespace-stripped: empty, or exactly one JSON object (strict parse, one or several lines). Else
   outside the exercise: plain text, a JSON array or string, several objects, invalid JSON. Exercise policy,
   named in task.md: H documents exit 2 with plain-text or invalid-JSON stdout as "Blocking error. Your
   stderr is the reason" (RA A4), so these are documented block forms this exercise does not accept; reason:
   Codex treats plain text as invalid for Stop (R 1.4), keep the hook portable and its output unambiguous.
3. Object keys only `decision`, `reason`, `continue`, `systemMessage`, `suppressOutput`; any other fails
   naming it, incl. `hookSpecificOutput` (its `additionalContext` is not a block, yet "The conversation
   continues so Claude can act on it", H) and `stopReason`. `decision` absent or `"block"` (H: "The only
   value for `decision` is `"block"`"); `"approve"` and others outside the exercise (undocumented). A block
   needs a non-empty string `reason` (H: "Required when `decision` is `"block"`"). `continue: false` fails on
   every exit code: it "Takes precedence over any event-specific decision fields" and stops Claude entirely
   (H), while this hook keeps Claude working on red and lets the turn end on green.
4. Outcome (H outcome table and Stop rows; G for other codes):
   | Exit | Stdout | CC outcome | Reason the probe reads |
   |---|---|---|---|
   | 0 | empty, or object without `decision` | allow | - |
   | 0 | object with `decision: "block"` | block | `reason` |
   | 2 | object with `decision: "block"` | block; H: "uses that decision's reason instead" | `reason` |
   | 1 or other | object with `decision: "block"` | block; H: "the fields alone decide" | `reason` |
   | 2 | object without `decision` | block; fields "can't override the block" (H) | stderr |
   | 2 | empty, stderr without missing-file wording | block | stderr |
   | 2 | empty, stderr with missing-file wording | non-blocking error (H Stop exception) | none |
   | 1 or other | empty | non-blocking error; crash fails open, `onFailure` no effect on Stop | none |
5. Each block row states the token its reason must contain (a random failing test name, `Ran 0 tests`, or a
   random stub token). An allow row passes iff the outcome is allow with exit 0; another exit there is
   outside the exercise.
6. Failure message per failed probe (pedagogy round 3, N-f), Russian, one line each, at most the first 5
   failed probes plus a count: the stdin class (`claim`, `failmsg`, `minimal`, `extra`, `nokey`,
   `nonjson`, or `stop_hook_active: true`); the state (красные тесты, зелёные тесты, ноль тестов; in L7 also
   the linter stub's behaviour: нашёл нарушение, чисто, ошибка запуска); the expected outcome (block with
   the token kinds, or allow with exit 0); what was observed (allow, block, non-blocking error, timeout,
   or the rule 2-3 form outside the exercise, with the exit code); for a block without a token, the token
   kind missing (имя падающего теста, модуль, который не импортируется, `Ran 0 tests`, токен линтера).
   Never the probe's position in the run and never a seed; random test names may be printed (they are new
   every probe).
Missing-file exception, H: on Stop, "when your hook exits 2 with nothing on stdout and its stderr says a file
is missing, such as `No such file or directory`, Claude Code treats the run as a non-blocking error". One
example, not a rule: the grader matches the conservative case-insensitive list
`checks/data/missing_file_phrases.json` (`No such file or directory`, `FileNotFoundError`, `ENOENT`,
`does not exist`, `cannot find`); broader than CC, it can only turn a block into a fail. Where the phrase
really appears (observed, 2.10): (i) a typo in the registered script path under the `python3 <path>` shell
form: Python prints "can't open file '<path>': [Errno 2] No such file or directory" and exits 2, so CC treats
the hook as a non-blocking error and the hook silently does nothing; (ii) a red test whose error is a
`FileNotFoundError` (a test opening a fixture by a relative path): unittest prints "FileNotFoundError: [Errno
2] No such file or directory: ...", so a hook that forwards raw unittest output on stderr with exit 2 and
empty stdout is non-blocking exactly on such a red run. Unittest itself run from a wrong directory does not
print the phrase: it prints "ImportError: Start directory is not importable: 'tests'" and exits 1 (observed,
3.11 and 3.12); revision 1's claim to the contrary is dropped. In revision 3 every red P prints the phrase
(the fixture read), green P, the zero-tests P and the L7 stubs never do; the demo scans the reference hook's
stdout and stderr per probe.
Loop guard (exercise policy; task.md cites "avoid blocking on a condition that will never resolve"): with
`stop_hook_active: true` the hook does not block again; a missing key or unreadable stdin counts as `false`.
Theory adds the 8-consecutive-continuation cap, its reset on a tool call and `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`
(H, G).

### 2.9 Task text equals the checks (new; pedagogy B3)
Every task.md has a list "Готово, когда" that names every constraint the lesson's command checks enforce,
with the numbers (limits, counts, forms), and every rubric criterion by name. It requires nothing that no
check or rubric grades. Method advice (test-first, order of work, what to ask the agent) sits in a separate
block "Как работать (совет, не проверяется)". Each lesson in section 5 gives both lists; the lesson-author
copies them, and the content judges diff task.md against the check scripts.

### 2.10 Observed outputs (run 2026-10-29, scratch copy of module 00 `06-permissions-security/starter`)
Interpreters: `/opt/homebrew/bin/python3.11` (3.11.14) and `python3.12` (3.12.13); no 3.10 on this machine
(`/usr/bin/python3` is 3.9.6), so the demo re-runs every item on the image interpreter. Layout: module 00
`src/invoices/`, plus `src/invoices/late_fee.py` and a unittest `tests/test_late_fee.py` (3 tests).
1. Pinned command variants, both versions, from the project root:
   - no `tests/__init__.py`, `-s tests -t .`: "ImportError: Start directory is not importable: '<abs>/tests'".
   - no `PYTHONPATH=src` (with `tests/__init__.py`): "Ran 2 tests ... FAILED (errors=2)", the two test
     modules failing to import `invoices`.
   - pinned (`tests/__init__.py`, `PYTHONPATH=src`): "Ran 3 tests ... OK", exit 0. Module 00's pytest-style
     `test_api.py` contributes 0 tests; rewritten as a TestCase with `setUpModule` (`APP_ENV=test`): "Ran 6
     tests ... OK", no `invoices.db` created.
   - same with `python3 -I`: "Ran 2 tests ... FAILED (errors=2)", exit 1.
2. States: red (one failing assertion): "FAIL: test_zz_red_x7f3 (tests.test_red.R.test_zz_red_x7f3)", "FAILED
   (failures=1)", exit 1. Import error in `tests/test_imp_k2.py`: "ERROR: tests.test_imp_k2
   (unittest.loader._FailedTest.tests.test_imp_k2)", "ImportError: Failed to import test module:
   tests.test_imp_k2", exit 1. Zero tests (only `__init__.py`, or a file with no TestCase): 3.11 "Ran 0 tests
   ... OK" exit 0; 3.12 "Ran 0 tests ... NO TESTS RAN" exit 5. So a hook must read "Ran 0 tests", not the
   exit code, to behave the same on both.
3. Wrong cwd (an existing dir without `tests/`, or an empty dir): "ImportError: Start directory is not
   importable: 'tests'", exit 1, no missing-file phrase. Missing script `python3 <root>/hk/stop_test.py`:
   "can't open file '<path>': [Errno 2] No such file or directory", exit 2. `subprocess.run(..., cwd=
   "/nonexistent/proj")` inside a hook: uncaught "FileNotFoundError: [Errno 2] No such file or directory:
   '/nonexistent/proj'", exit 1. A test opening `tests/fixtures/absent.json`: "ERROR: test_fixture_m4p
   (tests.test_fx_q1.F.test_fixture_m4p)", "FileNotFoundError: [Errno 2] No such file or directory: ...".
4. 2.6 toy (reference, 2 equivalents, 2 mutants, server + proxy + bootstrap as specified, python3.12 `-I`):
   honest tests pass reference and equivalents, kill the cap mutant; the fingerprint-bank attack shows the
   same prefix `97f` on all five variants; the `<=` -> `<` grace mutant survived because it is equivalent (no
   witness exists), see 2.6 mutant rules.
5. Frontmatter subset prototype vs PyYAML 6.0.3 (`/usr/bin/python3`), 23 forms: results as stated in 2.3.
6. A minimal reference hook (JSON block on stdout, exit 0) on the scratch layout: green allow; red block with
   the test name in `reason`; `stop_hook_active: true` allow; non-JSON stdin block; the FileNotFoundError red
   run block (phrase only inside the JSON `reason`, stdout non-empty, so the exception does not apply); zero
   tests block with "Ran 0 tests" in `reason`.
7. Revision-3 seam prototype (scratch `m3/`: `server.py`, `bootstrap.py`, `proxy_late_fee.py`, `grader.py`
   as specified in 2.6; toy `late_fee` with reference, e1, e2, the reference three more times = 6 correct
   runs, and 6 witnessed mutants: grace, rate, rounding, cap, no cap, zero amount accepted). Run with
   python3.12 `-I -B` on macOS and, for `/proc`, in a local `python:3.12-slim` container (3.12.16, uid 1000,
   `--network none`, Yama absent). Shuffled order in every row unless stated.
   | Attack (base) | Observed |
   |---|---|
   | honest tests, 5 tests (B) | VERDICT PASS (3.11 and 3.12, macOS and Linux) |
   | judge's `pyc_bank`, `pyc_pin` (B) | FAIL; `ps` shows `<python> -I -B <run>/server.py` only, no `.pyc` exists |
   | structure probe: server argv, run-root listing, every `.pyc`, proxy source hash (B) | FAIL; 12 views identical except random temp names; `pyc=0` |
   | judge's `race` (poll `ps` for a V path in the server's argv) (B) | FAIL; 12/12 runs found no path (`none`) |
   | test file writes a forged record with a guessed nonce to fds 3-63, then `os._exit(0)` (B) | FAIL; "nonce mismatch" on every run |
   | judge's `err_bank` (B) | FAIL; 1 distinct signature over 12 runs, all `TypeError: late_fee: arguments outside the interface domain` |
   | `raw_pipe`: out-of-domain args, `bool`, `1.5`, 3 args, `__dict__`, `GRACE_DAYS` written to the seam pipe (B) | FAIL; 1 distinct answer set over 12 runs |
   | judge's `counter`, fixed order (control) | VERDICT PASS (guard watched going red) |
   | judge's `counter`, shuffled | 0/300 passes, fixed-order controls in the same loop 6/6 PASS; theory 1/C(12,6) = 1/924 for the toy's 6+6 |
   | Linux `/proc` probe: server `cmdline`, `environ`, `fd/`, `mem` (B) | before `PR_SET_DUMPABLE` 0: `mem` scan gave 4 distinct views over 12 runs (variant source text found in memory: a real fingerprint); after: `environ` and `mem` PermissionError, `fd/` not listable (the probe's `glob` returned nothing), 1 view, FAIL |
   | (A) reference implementation | PASS, 5 tests |
   | (A) `return 0` | FAIL, 4 failures |
   | (A) judge's forged record via `sys.argv[2]` + `os._exit(0)`; forged record to every fd 0-63 + `os._exit(0)` | FAIL: server not ready, 5 errors |
   | (A) monkeypatched `assertEqual`/`assertRaises` + `return 0` | FAIL, 4 failures (patch acts in the server only) |
   | (A) bare `os._exit(0)` | FAIL, 5 errors |
   | (A) Linux `/proc` forge: read bootstrap `mem` for the nonce, write a forged record to each fd, kill it | before `PR_SET_DUMPABLE` 0 in the bootstrap: `mem` read found a nonce and fd writes succeeded, only the exit-code rule (-9) stopped it; after: `mem` PermissionError, no fd reachable, exit -9, FAIL |
   | judge's real-nonce forge (B), round 3 | record accepted 12/12, FAIL on the mutants (no gain; 2.6 "What the nonce protects") |
   | judge's `grader_mem` (A) / `grader_mem_b` (B), grader dumpable (round 3) | grader `mem` readable: acceptance source, 2 nonce candidates, the record pipe in `fd/`; 5-8 variant source copies per run; FAIL only because no full exploit was built |
   | same, revision 4, grader `prctl(PR_SET_DUMPABLE, 0)` first (scratch `m3/linux_r4.sh`, `linux_r4.out`) | (A) `PermissionError` on `/proc/<ppid>/maps`, FAIL; (B) `PermissionError` on `/proc/<ppid>/mem` 12/12, FAIL; `cmdline` still readable (`python3 grader.py A ...`); honest (B) PASS, reference (A) PASS |
   | judge's `mount_diff` (B), round 3, macOS | VERDICT PASS 3/3: grader argv and cwd via `ps`/`lsof`, `variants/reference.py` loaded and compared with the seam (residual (iii), 11.13) |
   | judge's timing (3000 calls, median, 6 runs per variant) and resource stats (macOS `ps`; Linux `stat`, `statm`, `VmRSS`), round 3 | not separable in the toy: all 9 variants overlap (latency within ±2 us noise, modal stats equal, jitter ±2) |
   A first prototype read the server's `ready` line from the response pipe the test process also reads: the
   honest (A) run lost the race and failed; the design therefore uses separate `ready` and `go` pipes (2.6).
   The toy's e1 and e2 are kept here as the record of what ran; revision 4 grades with six reference copies.
8. L1 probe prototype (scratch `m3/probes/`: 20 probes as 2.8 and L1, python3.12 3.12.13, hook run as
   `python3 -I -B`). Revision 3's generator (`harness_r3.py`) wrote the state as `+ 1` / `+ 0`: the judge's
   `static_off` passed it 5/5, so revision 3's 0/150 measured a weaker attacker than the best one. Revision 4
   re-ran every row on its 2.8 generator (now `harness_r4.py`, `run_r4.py`, `run_static.py`, `mem_stats.py`):
   | Hook | Observed (revision 4 generator) |
   |---|---|
   | reference hook (unittest via `sys.executable`, whole stderr in a JSON `reason`, exit 0) | VERDICT PASS 3/3 with `-I`, 3/3 with `-I -B`; 54/54 red and green probes right |
   | raw unittest output on stderr, exit 2, empty stdout | FAIL, all 9 red probes (missing-file phrase) |
   | child run with `-I` | FAIL, all 8 green probes |
   | judge's `static_off` (greps the revision-3 literal `+ 1))`; base EMPTY skeleton) | 0/20 + 0/20 runs; it never blocks a red probe (190/190 red probes wrong in the second set) |
   | judge's `counter_grep`, fixed order (control) | VERDICT PASS 2/2 |
   | same, shuffled | 0/20 |
   | best per-class memory hook (`memory_guess`: per payload class, count probes under `/tmp`, commit to one pattern) | 0/300 full passes; per-class pattern hit 294/1800 = 0.163 (theory 1/6 = 0.167) |
   | architect's static attacker `static_ast` (ast-parses the files, reads `k`, `j` from the fixture name, `m` from `__init__.py`, folds the hash calls without hashing semantics, votes with 7 per-value rules learned offline on 2000 labelled generated projects) | 0/50 + 0/20 runs; red/green probes right 615/1260 = 0.488 |
   | `template_eval` (knows the template, evaluates the one `sha256` assertion expression, runs no unittest) | VERDICT PASS 5/5, 90/90 probes right: residual (iv), 11.13 |
   Revision 4 cited 1/46656 on this run; revision 6 re-cites it only on the revision-6 run below, after
   `mtime_off` and `gap_mem` (assessment round 4, B1''': the revision-4 and -5 generators leaked the state
   through timing, which none of these rows measured).
   Revision 5 (K = 4, withdrawn in revision 6, kept as the record), the same rows on the K = 4 generator (now
   `harness_r5.py`; `run_r5.sh`, `run_r5.out`). Smoke run per template, red and green: red "FAILED
   (failures=1, errors=2)" with both method names, `tests.test_<b>` and the missing-file phrase; green "OK".
   | Hook | Observed (K = 4 templates) |
   |---|---|
   | reference hook | VERDICT PASS 3/3; 54/54 probes right |
   | raw forward on stderr, exit 2 / child with `-I` | FAIL on all 9 red / all 11 green probes |
   | `static_off` | 0/20 (never blocks red: 182 red probes wrong) |
   | `counter_grep` fixed order (control) / shuffled | 2/2 PASS / 0/20 |
   | per-class memory hook | 0/300; per-class hit 323/1800 = 0.179 (theory 1/6) |
   | `static_ast` (written for T1) | 0/30; 75/540 probes right (it misreads T2-T4) |
   | `template_eval` knowing 1 template (guesses 1/2 on the others) | 0/100; 0.638 of probes right (theory 5/8) |
   | knowing 2 | 2/100; 0.746 (theory 3/4; full pass theory (3/4)^18 = 1/177) |
   | knowing 3 | 28/300 = 0.093; 0.874 (theory 7/8; full pass (7/8)^18 = 0.090) |
   | knowing all 4 (`template_eval_all`) | VERDICT PASS 10/10, 180/180 probes right (unrecorded in revision 5; re-run and recorded in revision 6, below) |
   Revision 6 (one template, draw first, both seeds sampled every probe; `harness.py`, `run_r6.sh`,
   `run_r6.out`). Smoke: red "FAILED (failures=1, errors=2)" with both method names, `tests.test_<b>` and the
   missing-file phrase; green "OK" (`smoke_r6.out`).
   | Hook | Observed (revision 6 generator) |
   |---|---|
   | reference hook | VERDICT PASS 3/3; 54/54 probes right |
   | raw forward on stderr, exit 2 / child with `-I` | FAIL on all 8 red / all 7 green probes (re-run in revision 7 with per-state totals printed, `per_state_r7.out`: 9 of 9 red failed / 10 of 10 green failed) |
   | judge's `mtime_off` (two `os.stat` mtimes, base EMPTY skeleton) | 0/20; 183/360 = 0.508 of probes right (it blocks every probe: the gap no longer differs) |
   | judge's `gap_mem` (previous hook's exit time under `/tmp`, 20 ms threshold) | 0/20; 175/360 = 0.486 (it allows almost every probe) |
   | `static_off` | 0/20 (182 red probes wrong) |
   | `static_ast` | 0/20; 183/360 = 0.508 |
   | `counter_grep` fixed order (control) / shuffled | 2/2 PASS / 0/20 |
   | per-class memory hook | 0/300; per-class hit 291/1800 = 0.162 (theory 1/6); 1/46656 re-cited on this run, as a bound for the modelled attackers |
   | judge's `generic_eval` (hashes every 16-hex seed in P, compares with the plain-digit numbers; no unittest) | VERDICT PASS 10/10, 180/180: residual (iv) |
   Revision-5 record re-run (accuracy round 4, N2; `r5rec/`, in `run_r6.out`): per-template smoke T1-T4 red
   "FAILED (failures=1, errors=2)" with every name and the missing-file phrase, green "OK";
   `template_eval_all` 10/10, 180/180.
9. YAML typed-scalar rule (2.3) vs PyYAML 6.0.3 (`/usr/bin/python3`), re-run in revision 4 with `safe_load` in a
   `try` (accuracy round 3, N4; the revision-3 run stopped at `=`, which PyYAML tags `tag:yaml.org,2002:value`
   and cannot construct) and with three trailing-space values (`2026-10-29 `, `1.0  `, `MIT `, stripped before
   the rule): 43 plain values, 0 misses (no value PyYAML types as null, bool, int, float or date is
   accepted; `=` is rejected and raises `ConstructorError` in PyYAML), 4 strict-side rejections (`y`, `n`,
   `1.5e3`, `2026-1-2`); `MIT`, `Apache-2.0`, `v1.0`, `1.0.0`, `None`, `nil`, `true-ish`, `MIT ` stay accepted.
10. Generator guards, revision 6 (one template, draw first, both seeds sampled every probe; `run_r6_guards.sh`,
    `run_r6_guards.out`; python3.12 3.12.13, macOS):
    | Guard | Grader (revision 6) | Watched-red controls |
    |---|---|---|
    | text (`dist_check_r6.py`, 1000 + 1000 pairs per set) | 1 masked text over 4000; best of 440 features 0.5245; band 0.5447; PASS | offset literal: masked distinct 2, 1.0, FAIL; red `k` in the lower half: 0.7717, FAIL (300 + 300) |
    | metadata and timing (`meta_guard.py`, 1000 + 1000 per set, built through `harness.prepare`) | best of 411 features 0.5265 (a birthtime gap); wall median 28.9 ms on red and on green; PASS | revision 5's order (directories before a state-dependent draw): wall and `mtime(src)` gaps 1.0 (wall median 0.9 ms red, 30.7 ms green), FAIL; draw first with state-dependent work: CPU 0.9967, wall 0.995, FAIL (300 + 300 each) |
    | state flow (`state_flow.py`) | PASS: `state` used once in `draw`, as the hit/miss selector | the judge's `sum_leak` (`harness_sumleak.py`): FAIL ("draw uses state 2 times"); the text guard does not see it (0.5500 against a 0.5816 band, PASS), which is why the AST assertion exists. Revision 7 (`state_flow_r7.out`): the check also covers `generate()`; grader PASS, `harness_sumleak.py` FAIL, the judge's `harness_genleak.py` FAIL ("generate uses state outside the zero-tests branch, draw(state) and tokens") |
    Revision 5 (K = 4, withdrawn), kept as the record: per-template guard (`dist_check_t.py`, `dist_check_r5.out`; sentinel masking): 1000
    + 1000 pairs to learn on and 1000 + 1000 to test, per template; masked distinct texts 1 over 4000 for each
    of T1-T4; best test accuracy T1 0.5225, T2 0.5180, T3 0.5185, T4 0.5245 (419-578 features; band 0.5447):
    GUARD PASS on all four. Watched red (`dist_check_t_leaky.py`, 300 + 300 pairs): the offset literal fails
    the guard on T1-T4 (masked distinct 2; accuracy 1.0 on T1, T2, T4), red `k` from the lower half fails it
    on T1-T4 (0.743, 0.765, 0.740, 0.752). Revision 4's single-template run below stays as the record.
    Revision 4 (2.8; scratch `m3/probes/dist_check.py`, `dist_check_r4.out`): 1000 red + 1000 green
    projects to learn on, another 1000 + 1000 to test. Masked: 1 distinct project text over 4000. 360 static
    features compared; best test accuracy 0.5165 (`k mod 3`), null sd 0.0112, 4 sd band 0.5447: GUARD PASS.
    Best hash-free fold or relation: 0.512 (digit-sum parity of `sb`), 0.5145 (`j < m`). Watched red
    (`dist_check_leaky.py`, 300 + 300 pairs each): the revision-3 offset literal reaches test accuracy 1.0
    (GUARD FAIL); red `k` drawn from the lower half reaches 0.747 (GUARD FAIL).

## 3. Practice domain
`invoice-service` from module 00 (Python stdlib package `src/invoices/`, tests in `tests/` with
`tests/__init__.py`, the pinned command of 2.8), extended with a ledger context (`src/ledger/`, two small
modules) and one feature: payment reminders, `plan_reminders(invoices, sent_reminders, today) ->
list[Reminder]` over dataclasses in `src/invoices/models.py`. Because: the learner knows the repo from module
00, so attention goes to the method; invoicing has a real polyseme ("account": customer account in billing,
ledger account in accounting), value objects (Money in minor units), aggregates (Invoice with lines) and a
process with domain events (`InvoiceIssued`, `PaymentReceived`, `ReminderSent`, `CreditNoteIssued`,
`InvoiceDisputed`); and it is far from module 04 (booking, TypeSpec, frontend). Every policy number is the
fictional company's rule, stated in the starter, never a legal or vendor fact. Each lesson's starter is its
own copy (no symlinks); later starters contain the reference artifacts of earlier lessons, so earlier
mistakes never block a later lesson (residual and platform requirement: 2.5, 11.8).

## 4. Concept dependency table
| Concept | Introduced in | Used in |
|---|---|---|
| plan mode, verification target, "loop until done" anti-pattern, plan in chat | 00 L4 | L1, L4 |
| PreToolUse exit 2, hooks fail open, `onFailure`, exec/shell form, CLAUDE_PROJECT_DIR, deny rules | 00 L6 | L1, L2, L7 |
| memory set: CLAUDE.md loading, `@` imports (no context saving), `.claude/rules/` `paths:` | 00 L5 | L2, L3 |
| subagent = own loop and context, returns a summary | 00 L2 | L1 (fresh reviewer), L2 |
| lethal trifecta, supply chain (LLM03) | 00 L6 | L2 |
| evidence vs claim; ladder prompt, `/goal`, Stop hook, fresh reviewer, CI/branch protection | L1 | L1, L5, L6, L7 |
| Stop semantics, `stop_hook_active`, block cap, crash fails open, two silent-failure traps | L1 | L1, L5, L7 |
| requirement with an id (inline in L1; WHEN...SHALL form in L4) | L1 inline | L1 feedback, L4-L7 |
| tautological test, independent expected value, red step, mutant ("copy of the code with one deliberate defect") | L1 | L1, L5, L6, L7 |
| what agents fake: hard-coding, editing tests, skipping red, claiming without running | L1 | L1 quiz, L6 |
| TDD with agents as contested practice | L1 | L5 |
| plugin = installable bundle of skills/hooks/commands, may auto-update | L2 (one line) | L2, L5 (optional install) |
| skill, SKILL.md, progressive disclosure, invocation control, agentskills.io vs CC vs upload surfaces, locations, lifecycle, third-party risk | L2 | L2, L5 |
| skill vs CLAUDE.md vs hook vs subagent | L2 | L2, L7 |
| ubiquitous language, glossary format, `_Avoid_`, bounded context, polyseme, entity/value object/aggregate, domain event | L3 | L3-L7 |
| grilling: design tree, frontier, recommended answer, "decisions are the user's" | L3 | L3, L4, L5, L6 |
| SDD levels, spec template, WHEN...SHALL, seam, ADR (Nygard, MADR, Matt's three criteria), vertical tasks, Spec Kit/Kiro/OpenSpec as cases, criticism | L4 | L4-L7 |
| Matt Pocock's `to-spec` and `to-tickets` (spec and ticket shape) | L4 | L4, L5, L6 |
| Matt Pocock's pipeline: user-invoked orchestrators vs model-invoked discipline, the skills in sequence, tdd | L5 | L5, L6, L7 |
| requirement-to-test labels (`req_NN` in test names), traceability | L5 | L5, L7 |
| interface domain of a seam (what the check sends; out-of-domain `TypeError`) | L1 (task.md) | L1, L5, L7 |
| bug-hunt categories and decision rule | L6 | L6 |
| integrity control: deterministic vs model-run (Spec Kit analyze/converge, reviewer); spec-anchored update, supersede | L7 | L7 |
Forward pointers only (never assessed before their lesson): L1 names skills ("procedure as a skill: L2") and
the `verify` skill bridge; L2 names glossaries as a typical model-invoked reference skill (L3).
Not used: agent teams, multi-agent pipelines, TypeSpec, Codex installs, Spec Kit `converge` before L7.

## 5. Lessons
Shared: `status: ready`; `workspace: { image: academy-workspace:dev, starter: starter }` on every lesson (all
have a command check or, L6, a findings file in the workspace; the image is assumed to ship python3 >= 3.10 and
bash only). Sources `checkedAt` 2026-10-29, authors re-check before `ready`. Theory: mechanisms first, Claude
Code 2.1.312 as the worked example named with version, Codex differences only where R verified them, no
single tool's rule presented as universal. Leak guard as 00. Each theory opens with the listed problem. Each
task.md has the two lists of 2.9, given per lesson below.

### L1 `01-verification`
- id `sdd-verification`, "Проверка результата работы агента", type `artifact`, 80 min (~55 hands-on),
  prerequisites [intro-permissions-security], outcome O1.
- Sizing (pedagogy B1, option (a)): closest shipped analogue 00 L6 (one PreToolUse path hook plus a settings
  fix), 80 min with ~50 hands-on (00 L6 task.md:3). L1 asks for more hands-on work than 00 L6 (tests against
  a requirement document plus a code fix plus a hook that runs and parses unittest), so per part: theory
  ~25 min (core ~20, "Справка" read as needed ~5); tests from `docs/late-fee.md`, seen red on the agent's
  code ~15; fixing the two defects ~5; hook plus registration ~25; iterating against the two checks ~10.
  Hands-on 15 + 5 + 25 + 10 = 55; total 80. task.md states the per-part minutes.
- Opening problem: "Агент написал функцию и тесты к ней и отчитался: 'все тесты проходят'. Тесты и правда
  зелёные, а функция считает неверно. Что именно вы проверили, поверив ему?"
- Theory, core (what writing the hook needs; short): "looks done" vs "is done", "you become the test
  suite", evidence = command plus output (R 1.1); the strictness ladder: prompt; `/goal` (reads the
  transcript, runs nothing, so a fabricated "tests pass" line can satisfy it, R 1.2); Stop hook (harness runs
  the check); fresh reviewer (pointer to module 03); CI and branch protection as "who has the last word" (R
  1.7). Stop block routes (the 2.8 table, compact), and inside that same paragraph, where exit codes are
  taught, the reconciliation with module 00 (accuracy B5; placement per pedagogy N7), naming the events: in
  00 L6 the PreToolUse hook's "exit 1 не блокирует" meant exit 1 without JSON; for this Stop hook, with a
  valid JSON `decision: "block"` on stdout Claude Code ignores the exit code and the fields alone decide (H).
  Then `stop_hook_active`, crash fails open (`onFailure` has no effect on Stop). The two silent-failure traps
  with their observed output (2.8 (i), (ii)):
  a mistyped script path makes Python exit 2 with "No such file or directory", which CC treats as a
  non-blocking error; a red test with a `FileNotFoundError` does the same to a hook that forwards raw
  output on exit 2; prefer the JSON block. `$CLAUDE_PROJECT_DIR` vs payload `cwd` in a worktree. Zero tests
  is not green; Python 3.11 exits 0 and 3.12 exits 5 on it (2.10). "A test must be able to fail" with Matt
  Pocock's tdd anti-pattern "the assertion recomputes the expected value the way the code does" (R 3). What
  agents fake and the countermeasures (R 1.6; test protection reuses 00 L6). TDD with agents as contested (R
  1.5: Böckeler's small experiment, TDD runs used 8.50x / 2.96x / 4.89x the tokens; many were cache reads, so
  the dollar cost is likely lower than the ratio (accuracy N1); vs CC best practices and `/tdd`): what
  survives both sides is a red test that can fail and independent expected values.
- Theory, "Справка" block at the end (read when needed): the full 2.8 outcome table; `continue: false`;
  matcher ignored on Stop; SubagentStop (matcher on agent type) and TaskCompleted in two lines; PostToolUse
  cannot block; self-check prompting is model-specific (one dated line); Codex Stop differences in three lines
  (R 1.4); the block cap and `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`.
- Starter: `invoice-service` (2.8 layout) with `docs/late-fee.md` (fictional policy, REQ-01..REQ-05: grace
  period, daily rate, rounding to minor units, cap, non-positive input), an agent-written
  `src/invoices/late_fee.py` with two defects, an agent-written `tests/test_late_fee.py` green on the defective
  code (one tautological test, one skipped test, one test that only checks the type), `agent-report.md` ("все
  тесты проходят" with no command output), `.claude/hooks/stop_tests.py` skeleton (shebang, exec bit, TODO),
  `.claude/settings.json` with no hooks. `docs/late-fee.md` states the interface domain (`int` arguments,
  `bool` excluded, each from -1 000 000 000 to 1 000 000 000; anything else raises `TypeError("late_fee:
  arguments outside the interface domain")`), the result for every value in that range (negative
  `days_late` and non-positive `amount_cents` included) and REQ-05's exact `ValueError` message (2.6).
- task.md section "Что в рабочей папке" (pedagogy N6) says, in two short paragraphs: tests are now a
  `unittest.TestCase` (module 00's `test_api.py` was pytest-style; the image has no pytest, and `unittest` is
  in the stdlib), with `tests/__init__.py` so that `discover -s tests -t .` can import the package; and the
  hook's child runs `python3 -m unittest ...` without `-I` and with `PYTHONPATH=src`, because `-I` ignores
  every `PYTHONPATH` entry, so `invoices` under `src/` stops importing and every test module errors (the
  observed "Ran 2 tests ... FAILED (errors=2)" line is quoted), while the checks and the E3 registration form
  use `-I` on purpose: they run one known script that imports nothing from the project.
- task.md "Готово, когда":
  1. `tests/test_late_fee.py` is one unittest file; it imports only the stdlib and `late_fee` from
     `invoices.late_fee`; it has >= 3 tests; no `skip`, `skipTest`, `expectedFailure`; its results do not
     depend on test order (the check runs the tests in a random order); the interface domain is two exact
     `int` arguments (`bool` excluded), each from -1 000 000 000 to 1 000 000 000; a call outside it (another
     type, or a value past a bound) raises the same `TypeError` on every version the check runs, so it can
     tell no versions apart.
  2. Your tests pass on a correct implementation and fail on implementations that break any requirement of
     `docs/late-fee.md` (the check runs them against several correct and several deliberately broken
     versions, through the same interface; it names a test that fails on a correct version and the
     requirement whose broken version your tests did not catch).
  3. `src/invoices/late_fee.py` (one file, stdlib only) passes the hidden acceptance tests of REQ-01..REQ-05.
  4. Stop hook registered in `.claude/settings.json` (pedagogy round 3, N-b: task.md prints every list below
     itself; the learner never sees section 2.8): exactly one Stop hook in one group, path
     `.claude/hooks/stop_tests.py`; `command`/`args` in one of the accepted forms, printed verbatim: exec
     forms E1-E3 of 00 L6 with the new path, and the 12 shell spellings (the four quoted path spellings of
     `$CLAUDE_PROJECT_DIR`/`${CLAUDE_PROJECT_DIR}`, each alone or after `python3 ` or `python3 -I `);
     shebang and exec bit kept when no interpreter is named; hook-object keys only `type: "command"`,
     `command`, `args`, `timeout` (absent or >= 30), `statusMessage`, `onFailure` (either value); rejected
     with a one-line reason each: `matcher` (Claude Code ignores it on Stop), `type` `"prompt"`/`"agent"`
     (another model decides) and `"http"`/`"mcp_tool"` (outside the exercise), `async` (cannot block),
     `asyncRewake` (runs in the background), `if` (the hook never runs on Stop), `once` (ignored in
     settings files), `shell` (ignored with `args`, changes the interpreter without); no `disableAllHooks`
     other than `false` in `.claude/settings.json` or `.claude/settings.local.json`.
  5. Hook behaviour: runs `PYTHONPATH=src python3 -m unittest discover -s tests -t .` in
     `$CLAUDE_PROJECT_DIR`; on red blocks with every failing test name in the reason (several tests and a test
     module that fails to import can be red at once); on "Ran 0 tests" blocks
     with that line in the reason; on green allows and exits with code 0; with `stop_hook_active: true`
     allows and exits with code 0; a missing key or unreadable stdin counts as `false`; finishes within
     20 s. Output forms, printed in task.md: stdout is empty or exactly one JSON object whose keys are only
     `decision`, `reason`, `continue`, `systemMessage`, `suppressOutput`; `decision` is absent or
     `"block"`, and `"block"` needs a non-empty string `reason`; a block is either that object (any exit
     code) or exit 2 with empty stdout (or an object without `decision`) and the reason on stderr; plain
     text or invalid JSON on stdout is not accepted here, even with exit 2; never `continue: false`; a red
     run must still block when its output says a file is missing: on the exit-2, empty-stdout route the
     check treats stderr containing any of `No such file or directory`, `FileNotFoundError`, `ENOENT`,
     `does not exist`, `cannot find` (any letter case) as Claude Code's non-blocking missing-file case
     (pedagogy round 4, N-h).
  6. Each of the checks `late-fee-verified` and `stop-hook-tests` accepts at most 10 counted failed
     submissions; after the 10th it closes as не пройдено with a mentor review; after the 5th the platform
     offers the mentor (pedagogy round 4, N-k). Each check first runs a static stage 0; a failure there is
     reported and does not count. Stage 0 of `late-fee-verified`: `tests/test_late_fee.py` and
     `src/invoices/late_fee.py` exist and parse as Python; the test file imports only standard-library
     modules and `late_fee` from `invoices.late_fee`; it contains no `skip`, `skipIf`, `skipUnless`,
     `skipTest` or `expectedFailure`; it defines at least 3 test methods; `late_fee.py` imports only
     standard-library modules. Stage 0 of `stop-hook-tests`: everything in item 4; `.claude/hooks/stop_tests.py`
     exists and parses as Python. Everything else in items 1-5 is checked in the hidden runs, and a failure
     there counts.
- "Как работать (совет)": write the tests from `docs/late-fee.md` before reading the code; see each new test
  fail on the agent's code first; the agent may help, you accept. For the hook: forwarding the whole unittest
  output in `reason` is enough; cutting it to a tail can drop the first failing names (pedagogy round 3,
  N-d). Before submitting (the check has a cap), try the hook locally: break a test, pipe
  `{"stop_hook_active": false}`, `{}` and a non-JSON line into it, and look at stdout, stderr and the exit code
  (pedagogy round 4, N-i).
- Check `late-fee-verified`: command, `run: python3 -I "$ACADEMY_CHECKS_DIR/verify_late_fee.py"`,
  `timeoutSec: 300`, weight 3. Stage 0 (2.5; static, uncounted, before any hidden run): `tests/test_late_fee.py`
  and `src/invoices/late_fee.py` exist and parse (`ast`); test-file imports (AST) only modules in
  `sys.stdlib_module_names` and `from invoices.late_fee import late_fee`; no `skip`, `skipIf`, `skipUnless`,
  `skipTest` or `expectedFailure` name or attribute anywhere in the test file (AST); at least 3 test methods
  by the 2.7 extraction; implementation imports (AST) only `sys.stdlib_module_names`. The run record re-checks
  skips and `testsRun >= 3` (a dynamic skip fails there and counts). Then (A) hidden acceptance tests (`checks/data/acceptance/`) against the learner's
  `src/invoices/late_fee.py` through the 2.6 seam, reversed: the learner's module is V in the server, the
  grader's acceptance tests run in the test process against the proxy, sent over a pipe: all pass. (B) 2.6 on
  the learner's test file: 6 reference copies, exactly 12 mutants (>= 2 per REQ, 2 boundary); no traceability
  in L1. Budget: 19 runs x 10 s = 190 s < 300 (assessment N6: the count is fixed, so it cannot overrun). Must
  fail: untouched starter (stopped at stage 0 by its skipped test, uncounted; its defects and tautology would
  fail (A) and (B)); reference code with starter tests;
  reference tests with starter code; every 2.6 attacker on its stated base; a test importing a private helper
  of `late_fee.py`. Near-miss must pass: reference tests renamed and reordered; tests asserting extra
  behaviour identical in all correct variants (the exact exception type and message for a negative amount,
  which `docs/late-fee.md` fixes); a test asserting the domain `TypeError` for `late_fee("x", 1)` and for
  `late_fee(1_000_000_001, 1)`; a test at both bounds (`late_fee(1_000_000_000, 1_000_000_000)`); a
  parametrised `subTest` loop; tests in two `TestCase` classes. Cheapest attacker: keep the agent's tests and
  fix the code: (B) fails; pass 0. Residuals: the positional guess, 1/18564 per submission (2.6, 11.13); the
  readable mount, about 1 for a learner who reads the grader's argv (11.13 (iii)).
- Check `stop-hook-tests`: command, `run: python3 -I "$ACADEMY_CHECKS_DIR/verify_stop_hook.py"`,
  `timeoutSec: 480`, weight 2. Stage 0 (2.5; static, uncounted): (a) registration per 2.8, whole (group,
  path, command form, keys, `timeout`, `disableAllHooks`, shebang and exec bit); the hook file exists and
  parses (`ast`). Then (b) 20 probes, 20 s each (20 x 20 = 400 < 480), run
  in an order shuffled per run, each with a fresh P, hook copy, HOME and TMPDIR (2.8):
  | Probes | P state | stdin | Expected; reason must contain |
  |---|---|---|---|
  | 18 | for each of the 6 payload classes (`claim`, `failmsg`, `minimal`, `extra`, `nokey`, `nonjson`), 3 probes whose states are one of the 6 red/green patterns with at least one red and one green, drawn uniformly and independently per class with `secrets.SystemRandom` every run (assessment round 3, N7) | the class | red: block; both failing method names of `test_<a>` and `tests.test_<b>`. Green: allow with exit 0 |
  | 1 | zero tests (`tests/` holds only `__init__.py` and a file without TestCase; `test_api.py` removed) | `claim` | block; `Ran 0 tests` |
  | 1 | red | `stop_hook_active: true` | allow |
  So every class has a red and a green probe in every run (each must-fail below fails deterministically),
  every red probe contains an assertion failure, a `FileNotFoundError` and an import error at once, and the
  stdin class carries no information about the state. Red and green P come from the 2.8 generator, each
  probe built by the 2.8 generator (one template, draw first, state-independent work); failure messages
  follow 2.8 rule 6. Cap: 10
  counted failed submissions (2.5).
  Near-miss must pass (reference hook with only the output form changed): JSON block on exit 0, one line and
  pretty-printed; JSON block on exit 2 with any stderr; JSON block on exit 1; exit 2 with empty stdout and
  only the failing names (no raw output) in stderr; exit 2 with `{"systemMessage": "..."}` on stdout and the
  names in stderr; allow as `{}`, `{"continue": true}`, or with `systemMessage`/`suppressOutput`; `onFailure`
  either value; exec and shell registration forms; a hook that runs the command via `sys.executable` or via
  `python3` on `PATH`; a hook that writes a temp file under `$TMPDIR`.
  Must fail, each on the REFERENCE hook with one change: exit 1 with names in stderr and empty stdout
  (non-blocking; every red probe); exit 2 with empty stdout and raw unittest output on stderr (every red probe:
  the H missing-file exception; observed, 2.10 item 8); a child run with `-I` (every green probe; observed);
  `PYTHONPATH` not set (same); JSON block with `"continue": false` (exit 0 and exit 2); `decision: "approve"`
  on green; `{"decision": "block"}` without `reason`; the names only in `systemMessage`; plain text, a JSON
  array or two objects on stdout, and exit 2 with plain-text stdout (exercise policy, 2.8 rule 2);
  `hookSpecificOutput` with `additionalContext` on green; exit 2 on a green probe; a reason with only the
  first failing name (every red probe); a hook that decides by the unittest exit code only (fails the
  zero-tests probe on 3.11, where the exit is 0; on 3.12 it blocks with "Ran 0 tests" in the forwarded output
  and passes, which is correct behaviour).
  Registration must fail: `matcher: "*"`, `if`, `once`, `shell: "bash"`, `async`, `asyncRewake`, `type:
  "agent"`/`"prompt"`/`"http"`, `timeout: 5`, `disableAllHooks: true`, each 00 L6 registration mistake with
  the new path, and a typo in the script path (`stop_test.py`).
  Cheapest attackers and must-fail demo items (base REFERENCE hook unless noted): always block (every green
  probe); always exit 0 (every red probe and zero tests; base EMPTY starter skeleton); parse
  `last_assistant_message` instead of running tests (the red `claim` probe and the green `failmsg` probe: the
  claim is false in both directions, the `/goal` trap); run tests but ignore "Ran 0 tests" on 3.11 (zero
  tests); block on red regardless of `stop_hook_active` (the active probe); treat a missing key as `true` (the
  red `nokey` probe); crash on non-JSON (the red `nonjson` probe); a hard-coded "Ran 0 tests" in every reason
  (still needs a decision per probe); the round-2 judge's attack, a hook that counts probes under a hard-coded
  `/tmp` path, greps `def test_` names and test file names and blocks by table index (base EMPTY starter
  skeleton): passes with the shuffle disabled (demo control) and fails with it (observed, 2.10 item 8); the
  best non-running attacker, which remembers per payload class how many probes it saw and commits to one
  pattern, putting every grepped name into every reason (base EMPTY starter skeleton): run on the logged
  demo seeds, must fail on each; its exact rate is (1/6)^6 = 1/46656 = 0.0021% per submission (0.0214% within the
  cap of 10, 2.5; 1/2^18 = 1/262144 once runner isolation removes cross-probe memory), recorded in 11.13
  (observed on the revision-4 generator: 0/300, per-class hit rate 294/1800 = 0.163 vs 1/6; on the revision-5
  4-template generator: 0/300, 323/1800 = 0.179; on the revision-6 generator: 0/300, 291/1800 = 0.162, the run
  1/46656 is re-cited on; 2.10 item 8);
  static attackers that read the generated files and run nothing (base EMPTY starter skeleton), each must
  fail on every logged seed: the judge's `static_off` (greps for a literal that differs between red and
  green) and `static_ast` (ast features, constants, hash-free folding of the seeds, rules learned on
  labelled generated projects); observed figures per generator revision in 2.10 item 8 (accuracy round 4,
  N1: revision 4 `static_off` 0/40 and `static_ast` 0/70, 0.488; revision 5 0/20 and 0/30, 0.139; revision
  6 as recorded there). Metadata and timing attackers (revision 6, assessment round 4, B1'''), each must
  fail on every logged seed: the judge's `mtime_off` (compares two `os.stat` mtimes of P, base EMPTY
  skeleton) and `gap_mem` (keeps the previous hook's exit time under a hard-coded `/tmp` path and reads the
  gap to its own start, the memory class); the 1/46656 rate is cited only after both runs (2.10 item 8).
  The three 2.8 guards (text, metadata and timing, state flow), each with its watched-red controls (2.10
  item 10). Recorded with its rate, not a must-fail: the judge's `generic_eval` (hashes every 16-hex seed in
  P and compares with the plain-digit numbers there, runs no unittest), which passes (residual (iv),
  11.13). Revision 2's "pass probability 0 without a hook that
  runs the tests" is withdrawn; the judge's 1/C(10,5) = 1/252 for revision 2's table is confirmed as a lower
  bound on the success rate of the attack on that table, since its stdin also identified three rows. Every accepted output form either blocks in CC with
  the tokens in the reason the model reads, or allows on green. Demo additions: every probe class and
  near-miss on the reference hook; every must-fail and attacker on its base; registration grounding as 00 L6
  (exec and shell forms started for real, path with a space); the reference hook run on the real L1
  reference workspace, green and with one test broken (assessment B7), raw output recorded; the reference
  hook's reason on the largest red P (the real L1 reference workspace with every reference test broken plus
  the probe files) contains every failing name (the reference hook forwards the whole output, pedagogy
  round 3, N-d); the phrase scan of 2.8; the 2.8 generator guard (it replaces revision 3's "red and green P
  of one seed diffed", which would have read `+ 1` vs `+ 0` as a computed value).
- Check `verification-quiz`: quiz, 2.1 shape. Topics: (1) `/goal` with "all tests pass": the agent prints a
  fabricated summary; does the goal clear, why (single); (2) which mechanisms make "done" deterministic
  (multiple: Stop command hook, CI required check; distractors `/goal`, a prompt or agent hook); (3) the agent
  edited a test to pass: which countermeasures enforce rather than ask (multiple: deny/PreToolUse on tests,
  held-out tests, re-run in CI; distractor a CLAUDE.md line); (4) a Stop hook keeps blocking on a condition that
  cannot resolve in CC 2.1.312: what limits it and what the hook should check (single; `stop_hook_active`; no
  number asked); (5) a Stop hook crashes on bad input; the module 00 hook had `onFailure: "block"`: what happens
  here (single; fails open); (6) a test written first is green on its first run: what do you conclude (single).
- Sources (URLs in R): R 1.1-1.7, R 3 (tdd), RA A1-A5.

### L2 `02-skills`
- id `sdd-skills`, "Скиллы: устройство и жизненный цикл в проекте", type `artifact`, 50 min (~30 hands-on),
  prerequisites [sdd-verification], outcome O2.
- Opening problem: "В CLAUDE.md 120 строк, из них 40 занимает процедура релиза, которая нужна раз в месяц, и
  25 строк описания, как проверять изменения. Всё это грузится в каждую сессию, а агент всё равно один раз сам
  запустил релиз."
- Theory: skill = directory with SKILL.md plus optional `scripts/`, `references/`, `assets/`; progressive
  disclosure; SKILL.md body "under 500 lines" (SPEC, PBP); references one level deep, meaning no chains of
  read files (SPEC: "Avoid deeply nested reference chains"; PBP: "All reference files should link directly
  from `SKILL.md`"; PBP's reason: "Claude might partially read files when they're referenced from other
  referenced files"), while a reference file may point at a script, which is run, not read (PBP: "The
  instruction file (`forms.md`) references the script, and Claude can run it without loading its contents
  into context"). Rule sets side by side, never merged (accuracy B1, S re-fetched): the agentskills.io spec;
  Claude Code 2.1.312 (all fields optional, `name` defaults to the directory, unknown fields ignored, booleans
  accept six more spellings besides `true`/`false`, any case); and the Anthropic upload surfaces: S, "Using
  skill frontmatter outside Claude Code": for "claude.ai skill uploads, the Skills API, and packaging with
  `package_skill.py` from anthropics/skills" only `name`, `description`, `license`, `compatibility`,
  `metadata`, `allowed-tools` are allowed, and "If you include any field the spec doesn't allow, packaging or
  upload fails with a hard error instead of ignoring the field". Other clients treat extra fields their own
  way: Cursor reads `disable-model-invocation` (R 2.3: Cursor "supports `paths`, `disable-model-invocation`,
  `metadata`"). Invocation table (default, `disable-model-invocation`, `user-invocable`); `allowed-tools`
  pre-approves for the invoking turn and restricts nothing. CC locations and precedence; `.agents/skills/` as
  the portable location for Codex, Cursor, Gemini CLI, Copilot, "not listed on the CC skills page"; Codex
  `allow_implicit_invocation: false` (R 2.3). Plugin in one line: an installable bundle of skills, hooks and
  commands; Matt Pocock's README: "A plugin updates itself" (R 3). Popular collections as cases, names not
  graded: anthropics/skills (R 2.4) and Matt Pocock's skills (R 3). When to use what (R 2.5). Bridge to L1 (R
  1.8, RA A6): a project skill named `verify` replaces the bundled one, and CC's commit instructions then tell
  Claude to run it before each commit, except for docs or tests changes (v2.1.286+): an instruction to the
  model, not a harness gate; the deterministic gate stays the L1 Stop hook and CI; the bundled `/verify`
  confirms a change "without falling back to tests or type checks", so a tests `verify` changes the name's
  meaning. Lifecycle (R 2.4): eval with and without the skill ("Seeing a skill trigger tells you Claude found
  it, not that it did what you intended"), tune the description, `/skill-doctor`, prune. Third-party risk (R
  2.6): audit files, `` !`cmd` `` runs before the model sees anything, skill hooks persist, auto-updating plugin
  vs vendored reviewed copy (00 L6 LLM03).
- Starter: L1 reference state plus a bloated `CLAUDE.md` (~120 lines: the test command, a 25-line "how to
  verify a change" procedure, a 40-line release procedure, filler) and `scripts/release.py` (bumps the version
  in `pyproject.toml`, prints the tag command).
- task.md "Готово, когда" (equal to `skills-structure`):
  1. `.claude/skills/verify/SKILL.md` and `.claude/skills/release/SKILL.md` exist (not only under
     `.agents/skills/`).
  2. Each starts with `---` on line 1 and closes it; frontmatter uses the 2.3 forms (quote a value that
     contains `: ` or starts with a special character; no trailing `#` comments; booleans unquoted).
  3. Both: `name` equals the directory, 1-64 chars of `a-z`, `0-9`, single hyphens inside; `description`
     20-1024 chars; body under 500 lines; every skill-relative path in the body exists in the skill dir; a
     Markdown or text file referenced from SKILL.md references no other Markdown or text file of the skill
     that SKILL.md does not reference directly (scripts are fine; this is the exercise's reading of "one level
     deep").
  4. `verify`: only the six spec keys; body contains `PYTHONPATH=src python3 -m unittest discover -s tests -t .`
     in backticks.
  5. `release`: `disable-model-invocation` true (unquoted `true`/`yes`/`on`/`1`, any case); keys only from
     Claude Code's field list or the spec; `user-invocable` absent or true; `scripts/release.py` inside the skill
     and referenced from the body; the old `scripts/release.py` at the repo root is gone.
  6. The memory set (every file Claude Code loads as project memory, at launch or on demand: CLAUDE.md files,
     `CLAUDE.local.md`, `.claude/rules/**/*.md`, and files they import with `@`) holds <= 20 non-empty lines in
     total, contains the test command, and shares <= 2 lines with the old verify and release procedures.
  7. No `.claude/commands/verify.md` or `.claude/commands/release.md`.
- "Как работать (совет)": a `verify` body that asks to report the command with its output and forbids editing
  tests to pass makes the skill useful (not graded: no deterministic check can judge it; future hidden-task,
  section 8.4).
- Check `skills-structure`: command, `run: python3 -I "$ACADEMY_CHECKS_DIR/verify_skills.py"`,
  `timeoutSec: 30`, weight 3, rules exactly the Готово list:
  - Location: if the files exist only under `.agents/skills/`, the message says the CC 2.1.312 skills page does
    not list that location.
  - Frontmatter: line 1 exactly `---` (CC reads frontmatter only then; broken YAML loads "with no fields set", R
    2.2); 2.3 subset. Names: `^[a-z0-9]+(-[a-z0-9]+)*$`, 1-64, equal to the dir: an ASCII subset of SPEC
    (skills-ref also accepts Unicode lowercase after NFKC, RA A6), so a non-ASCII name fails as "outside this
    exercise". `description` 20-1024 (20 is the exercise's floor, 1024 the spec's). Body <= 499 lines.
  - References: a skill-relative path is `${CLAUDE_SKILL_DIR}/<path>`, a Markdown link target without scheme, or
    `(scripts|references|assets)/<path>` preceded by line start, whitespace, `(`, a backtick or a quote, and not
    by `/`, `.`, `-` or an alphanumeric (so `src/scripts/x.py` and `../scripts/x` are not read); each must
    exist inside the skill dir (any depth). Chain: a referenced file with extension `.md` or `.txt` (a read
    file) contains a skill-relative path to another `.md` or `.txt` file of the skill other than SKILL.md
    that SKILL.md itself does not reference (accuracy N4: PBP's rule is "All reference files should link
    directly from `SKILL.md`", and its bad example is a file reachable only through another one); the
    message names both files and calls the rule the exercise's reading of SPEC/PBP, never a PBP quote.
    References to anything else (scripts, assets) from a read file are allowed.
  - `verify`: keys only {name, description, license, compatibility, metadata, allowed-tools}; any other key fails
    naming it: "не переносимо: при упаковке или загрузке в claude.ai или Skills API такое поле вызывает ошибку
    (S)", which also rejects `disable-model-invocation` and `user-invocable` (with `disable-model-invocation:
    true` the commit instructions no longer point at it, R 1.8); the body contains the pinned command in
    backticks.
  - `release`: `disable-model-invocation` present and true per 2.3; a false spelling fails as "the model can
    still invoke it"; quoted fails per 2.3; other values "not a documented boolean spelling". Keys only from S's
    20 fields plus the spec fields; unknown keys fail naming it ("Claude Code ignores unknown fields silently, so
    a typo such as `disable-model-invokation` leaves the skill model-invocable"); the CL 2.1.186 keys
    `display-name`, `default-enabled`, `fallback` count as unknown (not on S). `user-invocable` false in any
    spelling fails (S: "With `user-invocable: false`, you can't invoke the skill, but Claude still can").
    `scripts/release.py` exists in the skill and the body references it; `<root>/scripts/release.py` absent.
  - Memory set: resolved by module 00 L5's resolver (`verify_memory.py` `memory_set()`: discovered CLAUDE.md,
    CLAUDE.local.md, `.claude/AGENTS.md`, `.claude/rules/**/*.md`, plus `@` imports up to 5 hops); <= 20 non-empty
    lines summed; contains the test command; <= 2 normalized lines shared with `checks/data/procedures.orig`
    (the pristine verify and release blocks; normalization as 00 L5). No `.claude/commands/verify.md` or
    `release.md` (a same-named skill wins, R 2.2, but two sources drift).
  Must fail: untouched starter; `verify` with `disable-model-invocation: true` (and `yes`); `release` without it;
  `release` with `false`, `no`, `Off`, `0`; with `"true"` or `'yes'`; with `enabled`; `user-invocable: no` or `0`;
  the typo key; `name: Verify`; `verify-`, `ver--ify`; name not matching the dir; description 1025 chars;
  `description: Use when: tests fail` unquoted (YAML rejects it, CC would load the skill with no fields);
  `disable-model-invocation: true # human only` (trailing comment, message "remove the trailing comment");
  frontmatter after a blank line; a referenced path that does not exist; the chain SKILL.md ->
  `references/a.md` -> `references/b.md` with `b.md` not referenced from SKILL.md; release procedure kept in CLAUDE.md; procedure moved to
  `docs/release.md` and imported with `@docs/release.md`; procedure moved to `.claude/rules/release.md`
  (with or without `paths:`); root `scripts/release.py` left in place.
  Near-miss must pass: `disable-model-invocation` as each of `true`, `True`, `TRUE`, `yes`, `Yes`, `on`, `ON`,
  `1`; `user-invocable: yes` or `1`; a direct reference to `references/a/b.md`; `references/a.md` linking back
  to SKILL.md; SKILL.md -> `references/a.md` and `references/b.md` with `a.md` also linking `b.md`;
  SKILL.md -> `forms.md` -> `scripts/fill.py` (PBP pattern); `description: "Use when: tests fail"`
  and the single-quoted form; `metadata:` with two pairs; a whole-line `#` comment in the frontmatter;
  `license: MIT` on `verify`; `allowed-tools` on `release`; body prose "перенесено из `scripts/release.py`"
  while the skill's `scripts/release.py` exists; a memory set of CLAUDE.md (8 lines) plus
  `.claude/rules/style.md` (6 lines); the procedure kept in `docs/release.md` that nothing imports.
  Cheapest attacker: copy a generic SKILL.md: fails name/dir and field rules; deterministic. The 8 accepted
  true spellings all mean true in CC, so guessing a spelling is no shortcut past the decision. What the check
  cannot see: whether the description triggers on the right requests (future hidden-task, section 8.4).
- Check `skills-quiz`: quiz, 2.1 shape. Topics: (1) in CC 2.1.312, before any invocation, what is in context
  for a default skill vs one with `disable-model-invocation: true` (single); (2) `allowed-tools: Bash(git push
  *)`: what it does and does not do (single); (3) situations -> mechanism (multiple: "must hold on every edit"
  -> hook; "release checklist used monthly" -> user-only skill; distractor "team's test command" -> skill); (4)
  a marketplace skill with `` !`curl ...` `` that registers hooks: which risks are real (multiple; distractor
  "skills have no network access in CC"); (5) the skill fired in your test session: what does that prove, next
  step (single; baseline with and without); (6) the same SKILL.md works in CC and fails on upload to the Skills
  API (single; key and explanation: upload and packaging reject fields outside the spec's six, S; no claim
  about other clients).
- Sources: R 2.1-2.6, R 1.8, RA A6, S (re-fetched: "Using skill frontmatter outside Claude Code"), PBP.

### L3 `03-domain-ontology`
- id `sdd-domain-ontology`, "Онтология проекта: глоссарий, контексты, события", type `artifact`, 50 min (~30
  hands-on), prerequisites [sdd-skills], outcome O3.
- Opening problem: "В коде invoice-service одна и та же сущность называется customer, client и account, а в
  модуле бухгалтерии account означает совсем другое. Агент послушно плодит четвёртое название. Откуда ему
  знать правильное?"
- Theory: ubiquitous language; bounded context, polysemes, context map; entity vs value object, aggregate and
  root, "transactions should not cross aggregate boundaries" (now in O3, pedagogy N4); domain events,
  EventStorming named only (R 6). Matt Pocock case (v1.3.2, R 3): GLOSSARY "totally devoid of implementation
  details", `_Avoid_`, the context description line, GLOSSARY-MAP Relationships, vocabulary in issue titles
  and test names. Grilling (R 3): design tree, frontier, numbered questions with a recommended answer,
  "Finding facts is your job, never the user's", "The decisions are the user's", "Do not act on it until the
  user confirms". Feeding it to the agent (R 6, 00 L5): `@` import, `.claude/rules/` `paths:`, model-invoked
  skill (L2).
- Starter: `invoice-service` with mixed names in `src/invoices/` (customer/client/account, invoice/bill,
  payment/settlement), `src/ledger/` with ledger `Account` and `Entry`; `docs/interview.md`: a grilling
  transcript in which the expert states canonical terms, the words the team avoids, the two meanings of
  "account" and the events between billing and ledger; `GLOSSARY-MAP.md` and context files with headings only.
- task.md "Готово, когда": `GLOSSARY-MAP.md` has `## Contexts` linking exactly the two context files and
  `## Relationships` with >= 2 lines, each naming both contexts and a backticked PascalCase event; context files
  per 2.7 (single-word `_Avoid_` entries); billing defines Invoice, Customer, Payment, Credit Note, Reminder,
  Dispute, Outstanding Balance; ledger defines Account and Entry; <= 12 terms per context; each definition at
  least one sentence and without code markers (code fences, backticked paths, `.py`, `def `, `class `, SQL
  keywords); each `_Avoid_` line has <= 4 words and lists every word the interview says the team avoids for that
  term; no `_Avoid_` word is a term of the same context; `account` is avoided under billing's Customer and not
  in any ledger `_Avoid_`. Rubric criteria named (below). "Как работать (совет)": write definitions from the
  interview, not from the code.
- Check `glossary-structure`: command, `run: python3 -I "$ACADEMY_CHECKS_DIR/verify_glossary.py"`,
  `timeoutSec: 30`, weight 2, rules exactly the Готово list, key in `checks/data/glossary_key.json`, markers in
  `checks/data/impl_markers.json` (code-only tokens), term names normalized per 2.7. Must fail: empty starter;
  one flat GLOSSARY.md with both meanings; `account` avoided in ledger; a definition with
  `src/invoices/models.py`; `_Avoid_` with 6 words; a multi-word `_Avoid_` entry (`bill to`); a term missing.
  Near-miss must pass: extra terms up to 12; different order; `Credit note` and `CreditNote` spellings; a
  context description line under `# Billing`; a Relationships line writing `billing` lower-case; `_Avoid_`
  absent on terms the interview gives no synonym for; a definition using "таблица" in the everyday sense.
  Cheapest attacker: guessing common English synonyms for `_Avoid_` without reading the interview can pass the
  avoid part; the check is a structure filter, definition quality and the polyseme reasoning are rubric-graded
  (section 6).
- Check `glossary-rubric`: rubric, `rubric: checks/rubric-glossary.md`, `artifacts: ["GLOSSARY-MAP.md",
  "docs/billing/GLOSSARY.md", "docs/ledger/GLOSSARY.md"]`, `passScore: 0.7`, weight 2; criteria 0/1/2: (1)
  each definition says what the thing IS in the domain, opinionated, one or two sentences; (2) no
  implementation details; (3) the polyseme resolved by context with the reason from the interview; (4)
  relationships and events match the process in the interview. Sum/8; injection clause; blind demo per 00 2.4
  (weak, borderline, injection, keyword-stuffed glossary with circular definitions).
- Check `ontology-quiz`: quiz, 2.1 shape. Topics: (1) two `Money` objects with the same amount and currency:
  equal or not, why (single); (2) which changes belong in one transaction given an Invoice aggregate with
  lines (single); (3) "account" means different things to sales and accounting: what do you do (single); (4)
  test names and spec use `client` while the glossary avoids it: real consequences for an agent (multiple);
  (5) ways to give the glossary to Claude Code 2.1.312 and their loading cost (multiple; distractor "an `@`
  import saves context"); (6) during grilling the agent asks where the invoice table is defined (single).
- Sources: R 6, R 3 (domain-modeling, GLOSSARY-FORMAT, grilling), CC memory.

### L4 `04-spec-adr-tasks`
- id `sdd-spec-adr-tasks`, "SDD: от фичи к спецификации, ADR и задачам", type `artifact`, 70 min (~50
  hands-on), prerequisites [sdd-domain-ontology], outcome O4.
- Opening problem: "Есть фича 'напоминания об оплате' и час разговора с заказчиком. Хочется сразу сказать
  агенту 'сделай'. С чего начать, чтобы через неделю не переписывать половину?" Then the contrast (pedagogy
  N6): in 00 L4 the plan lived in the chat and died with the session; here it becomes a persistent spec that
  later lessons test and lint.
- Theory: SDD as a spectrum (spec-first, spec-anchored, spec-as-source, Böckeler 2025) and the shared skeleton
  intent -> design -> tasks -> implement -> check; Spec Kit v1.2.5 ("independent entry points, not mandatory
  phases"), Kiro (WHEN...SHALL, Requirements-First vs Design-First), OpenSpec v1.15.0 as cases (R 4);
  criticism: one workflow for every size ("sledgehammer"), markdown fatigue, false control, Matt's "owning the
  process" stance. CC's minimal form: interview into SPEC.md, then a fresh session (R 4). PRD vs spec (R
  contradiction 7). Spec template 2.7 with the WHEN...SHALL pattern (one pattern of EARS, not EARS as a whole) and
  the seam ("the ideal number is one"). ADR: Nygard, MADR 4.0.0 with Confirmation (headings as in MADR-T), Matt's
  minimal form and rule (hard to reverse AND surprising AND real trade-off); numbers never reused (R 5). Tasks
  per to-tickets: vertical tracer bullets sized for one fresh context, blocking edges; horizontal slicing as the
  anti-pattern; each task carries requirement ids and a check command (00 L4 bridge).
- Starter: `invoice-service` (L3 reference glossary), `docs/feature-brief.md` (payment reminders; the seam
  `plan_reminders(invoices, sent_reminders, today)`, the dataclasses and the bounded interface domain of 2.6
  fixed, with every bound as a number), `docs/grilling-transcript.md`
  (numbered questions with recommended answers ending in the user's confirmation; decisions D1-D5, exactly one
  hard to reverse AND surprising AND a trade-off: reminders derived from the sent-reminder history on every run
  instead of a stored schedule; each other visibly fails a criterion in the transcript's words), `docs/spec.md`
  with the 2.7 headings and empty bodies, `docs/tasks.md` with one commented example block,
  `docs/adr/template.md` (Nygard; ignored by the check, which counts only `NNNN-*.md`).
- task.md "Готово, когда": spec has all 2.7 headings in order; 6-12 requirement lines in the form
  `- **REQ-NN** WHEN ... THE SYSTEM SHALL ...`, ids unique; User Stories a numbered list of >= 3; Out of Scope
  >= 1 item; Testing Decisions names `plan_reminders`; Implementation Decisions without fenced code, `.py`,
  `src/`; no word the glossary avoids, by the 2.7 resolver (stated in task.md, with the `account` consequence
  of 2.7: write the ledger term as `LedgerAccount` or in Russian); exactly one ADR file
  `docs/adr/0001-<slug>.md`, Nygard or MADR shape (2.7, with the exercise's required status and Consequences),
  status `proposed` or `accepted`, Context, Decision and Consequences non-empty; tasks: 3-8 blocks in the 2.7
  form, all `Status: todo`, every spec REQ listed by a task, every cited REQ exists, edges acyclic, >= 1 task
  `Blocked by: none`, every `Check:` one backticked command. Rubric criteria named.
- "Как работать (совет)": spec first, then the ADR, then tasks; ask the agent to draft from the transcript and
  edit. Placed last in that block, after the graded work (pedagogy N5): optional, not graded, not in the time
  total (~15 min; pedagogy N3): grill yourself on a small feature of your own with the agent, using the L3
  grilling rules (it asks, recommends, you decide); take away one comparison: which of your decisions would
  pass Matt's three criteria the way D1-D5 of the transcript do or fail them, and whether you confirmed each
  before the agent acted on it; nothing is submitted.
- Check `sdd-artifacts`: command, `run: python3 -I "$ACADEMY_CHECKS_DIR/verify_sdd.py"`, `timeoutSec: 30`,
  weight 3, rules exactly the Готово list; C6 against the pristine glossary (`checks/data/`); messages name part,
  file, line; the ADR message for 0 or >= 2 files states Matt's three-criteria rule and that the transcript has
  one qualifying decision, without naming it. Must fail: empty starter; "the system should handle reminders
  correctly" lines; REQ-03 cited in tasks but absent; a REQ no task lists; a cycle T-02 -> T-03 -> T-02; two
  ADRs; status `approved`; `client` in a requirement; `client` inside a Russian sentence of a requirement;
  `clients` in a requirement (plural rule); `client` in a `## T-NN:` title; `account` in a task line; a
  MADR ADR with `## Consequences` missing everywhere. Near-miss must pass: REQ-01 and REQ-10 both present;
  `billing` when `bill` is avoided; the Russian word `клиент` in a requirement; `LedgerAccount` in a task line; the verbatim MADR-T template
  filled in (front matter with comment line, `status: "accepted"`, `date: 2026-10-29` unquoted as MADR-T
  writes it (accuracy round 3, N1), all headings incl. Decision Drivers,
  Considered Options, `### Consequences`, `### Confirmation`, the `<!-- This is an optional element -->` comments);
  MADR with `status: 'proposed'`; tasks listing several requirements; a `Check:` command with flags.
  Cheapest attacker: a structurally valid but meaningless set passes this filter by design; meaning,
  coverage, vertical slicing and the ADR choice are rubric-graded (section 6).
- Check `sdd-rubric`: rubric, `rubric: checks/rubric-sdd.md`, `artifacts: ["docs/spec.md", "docs/tasks.md",
  "docs/adr/*.md"]`, `passScore: 0.7`, weight 3; criteria 0/1/2 with PASS anchor and a FAIL example: (1) every
  requirement is testable behaviour, no implementation; (2) the spec covers the brief and every confirmed
  decision, out of scope explicit; (3) tasks are vertical slices, each fits one fresh session, edges match real
  dependencies (FAIL: "T-01 модели, T-02 репозиторий, T-03 API"); (4) the single ADR records the decision that
  meets all three criteria, with its negative consequences (FAIL: an ADR for "use dataclasses"); (5) glossary
  vocabulary for every domain term. Sum/10; injection clause; blind demo incl. a horizontal-slice task list and an
  ADR for a non-qualifying decision.
- Check `sdd-quiz`: quiz, 2.1 shape. Topics: (1) a one-line bug fix: full SDD flow or not (single); (2)
  spec-first vs spec-anchored for a team that deletes specs after merge (single); (3) which requirement lines are
  testable (multiple; options are WHEN...SHALL lines and vague "should be fast/correct" lines; no valid
  requirement in another EARS pattern is offered as untestable); (4) which decisions deserve an ADR under the
  three-criteria rule (multiple, scenarios outside the exercise domain); (5) a layer-sliced task list executed
  one task per session (single); (6) why start a fresh session after writing SPEC.md (single).
- Sources: R 4, R 5 (Nygard, MADR), MADR-T, R 3 (to-spec, to-tickets, ADR-FORMAT), Mavin's EARS page
  (alistairmavin.com/ears; accuracy N5) for the other EARS patterns theory names.

### L5 `05-pocock-pipeline`
- id `sdd-pocock-pipeline`, "Реальный кейс: конвейер скиллов Matt Pocock, реализация через TDD", type
  `project`, 65 min (~45 hands-on), prerequisites [sdd-spec-adr-tasks], outcome O5 (implementation half).
- Opening problem: "Спецификация и задачи готовы. Агент закрывает задачи одну за другой и каждый раз пишет
  'тесты зелёные'. Как принять работу, не перечитывая каждую строку?"
- Theory (Matt Pocock's skills at v1.3.2, names quoted with the version, never quizzed, R 3): four failure
  modes and fixes; user-invoked skills orchestrate, model-invoked hold discipline (`disable-model-invocation`,
  L2); pipeline grill-with-docs -> to-spec -> to-tickets -> implement, read from the vendored SKILL.md files;
  `tdd` rules (public interfaces, agreed seams, red before green, no tautologies, refactor in review).
  Accepting work: the L1 ladder per task (task `Check:`, Stop hook, hidden acceptance tests as the held-out set,
  R 1.6). Plugin install named as optional. No Spec Kit `converge` here (introduced in L7).
- Starter: `invoice-service` with the L4 reference artifacts (spec REQ-01..REQ-08, tasks T-01..T-05, ADR-0001,
  L3 glossary), L1 reference Stop hook and L2 reference skills, a stub `src/invoices/reminders.py`
  (`plan_reminders` raises `NotImplementedError`), `tests/test_reminders.py` with imports only, and
  `vendor/mattpocock-skills/` with `grill-with-docs`, `to-spec`, `to-tickets`, `tdd` SKILL.md files, upstream
  `LICENSE` (MIT) verbatim, and `UPSTREAM.md` pinning the repository URL, the tag (v1.3.2 on 2026-10-29, or the
  tag current at fetch) and the full commit SHA; reading material, not registered, no check reads it.
- task.md opens with one line under the outcome (pedagogy N4): "вторая часть результата (найти подмену
  проверки в записи сессии) отрабатывается в уроке 6".
- task.md "Готово, когда":
  1. `src/invoices/reminders.py` (one file; imports only the stdlib and `invoices.models`: the check runs it
     where nothing else is importable; another import is rejected before the runs, item 6) passes the hidden
     acceptance tests of REQ-01..REQ-08.
  2. `tests/test_reminders.py` is one unittest file importing only the stdlib, `plan_reminders` from
     `invoices.reminders` and `invoices.models`; tests are literal `def test_...` methods; no skips; results do
     not depend on test order (the check shuffles it); calls outside the interface domain raise the same
     `TypeError` on every version; task.md prints the domain with its numbers (2.6: lists of 0-50 items,
     dates 2000-01-01 to 2099-12-31, integers 0 to 1 000 000 000, strings 1-64 characters of
     `[A-Za-z0-9-]`, exact types).
  3. Test names are `test_req_NN_<words>` with at most two `req_NN` labels each.
  4. For every requirement, a deliberately broken version is caught by a test whose name carries that
     requirement's label (the check runs your tests on correct and broken versions through the same interface).
  5. Every task in `docs/tasks.md` has `Status: done`; and, spelled out in words in task.md (pedagogy N1; the
     rule ids C1-C6 are introduced only in L7): every requirement of the spec is listed by some task; every
     requirement a task or a test name cites exists in the spec; every requirement of a done task has a test
     whose name carries its label; no word the glossary avoids appears in spec, tasks or test names (one
     tokenizer, plurals with `s`/`es`, task titles included, `account` written as `LedgerAccount` or in
     Russian).
  6. `reminders-accepted` accepts at most 10 counted failed submissions; after the 10th it closes as не
     пройдено with a mentor review; after the 5th the platform offers the mentor. It first runs a static
     stage 0; a failure there is reported and does not count. Stage 0: `src/invoices/reminders.py` and
     `tests/test_reminders.py` exist and parse as Python; the implementation imports only standard-library
     modules and `invoices.models`; the test file imports only standard-library modules, `plan_reminders`
     from `invoices.reminders` and `invoices.models`; no `skip`, `skipIf`, `skipUnless`, `skipTest` or
     `expectedFailure`; item 3 (test names and at most two labels);
     item 5 (every task done, and its four rules). Items 1, 2 (order and domain) and 4 are checked in the
     hidden runs, and a failure there counts.
- "Как работать (совет)": one task at a time, test-first at the seam, see red before green. The L1 Stop hook
  blocks the agent's turn while a test is red; that is the hook doing its job at the red step; after one block
  `stop_hook_active` lets the next stop through, so a turn can end red once (pedagogy N7). Optional, ungraded:
  after reading the vendored `tdd` SKILL.md as an L2 audit, copy it into `.claude/skills/tdd/` and use it.
- Check `reminders-accepted`: command, `run: python3 -I "$ACADEMY_CHECKS_DIR/verify_reminders.py"`,
  `timeoutSec: 600`, weight 3. Stage 0 (2.5; static, uncounted, before any hidden run): both files exist and
  parse (`ast`); implementation imports (AST) only `sys.stdlib_module_names` and `invoices.models`; test-file
  imports (AST) only `sys.stdlib_module_names`, `from invoices.reminders import plan_reminders` and
  `invoices.models`; no skip construct (as L1); test names `test_req_NN_<words>` with <= 2 labels (2.7);
  all of (C) below. Then (A) hidden acceptance tests for REQ-01..REQ-08 against the learner's module
  through the reversed 2.6 seam (learner module in the server, grader tests over a pipe in the test process):
  all pass. (B) 2.6 with traceability on `tests/test_reminders.py`: 6 reference copies, exactly 12 mutants (one
  per REQ plus 4 boundary mutants); 19 runs x 10 s = 190 s. (C) C1-C3 and C6 (2.7, pristine glossary) on
  `docs/` and `tests/`; every task `done` ((C) runs in stage 0). Residual: positional guess 1/18564 per
  submission (11.13). Must fail: untouched starter; reference code with
  tests whose names lack `req_NN`; reference tests with labels swapped between two tests; one behavioural test
  named `test_req_01_req_02_req_03_req_04_req_05_req_06_req_07_req_08_all` (3+ labels); labels added only through
  generated tests (`setattr`), invisible to the AST; a task left `todo`; a `client` in a test name; the glossary's
  `_Avoid_` line for `client` deleted in the workspace (C6 still reads the pristine glossary); plus the 2.6
  attackers. Near-miss must pass: one test `test_req_02_req_05_...`; helper functions in the test file; two
  `TestCase` classes; a `subTest` loop inside a labelled test; `LedgerAccount` in a test name. Must fail
  (added): `test_req_03_clients_...` (plural); the 2.6 (A) attacks on this seam. Residual (11.2): a suite where
  every test asserts everything and labels are spread in pairs passes (the cheaper form the judge named, a
  single behavioural test plus labelled stubs failing through a flag set by the earlier test, is reduced to
  this by the per-run test-order shuffle of 2.6: assessment N4); a precision rule ("a test that kills a mutant of REQ-k must
  carry req_k") would fail honest cross-failures (a cap test also catches a daily-rate mutant), so it is not
  added; the demo records the reference tests' cross-kill matrix. Cheapest attacker: let the agent write code
  and tests and accept its claim: (A) passes if the code is right; tautological or unlabelled tests fail (B).
- Sources: R 3 (README, CHANGELOG, SKILL.md at v1.3.2), R 1.5-1.6.

### L6 `06-pipeline-bug-hunt` (new, split from revision-1 L5)
- id `sdd-pipeline-bug-hunt`, "Разбор сессии: где агент подменил проверку", type `bug-hunt`, 45 min (~33
  hands-on), prerequisites [sdd-pocock-pipeline], outcome O5 (finding half).
- Sizing from measured evidence: module 00 L4's 380-line transcript was budgeted 25-30 min of a 70-min lesson
  (00 L4 task.md). Here the transcript is 380-420 lines (at most 1.1x, so <= 33 min hands-on: transcript 28,
  findings file 5, as section 7), theory ~12 min, total 45 (pedagogy round 3, N-g: section 7 says 12).
- Opening problem: "Агент провёл фичу по конвейеру и отчитался, что всё зелёное. В записи сессии 400 строк.
  Где именно он сделал вид, что проверил?"
- Theory: the six categories with one example each, the decision rule, the anchor rule (as 00 2.2.1).
- Starter: `transcript.md`: synthetic CC-style session (labelled synthetic, own physical line numbers,
  380-420 lines) where an agent runs the pipeline on a different feature of the same repo (credit-note
  application), invoking skills by name; `findings.json` template.
- task.md "Готово, когда": `findings.json` valid per 00 2.2; <= 7 reports; each report a line range and one
  category from the list; at least 5 of the 6 planted mistakes found; at most 1 report on a correct step;
  3 scored submissions. "Как работать (совет)": read once end to end, then apply the decision rule to each suspect.
- Check `pipeline-bug-hunt`: bug-hunt, `answers: checks/bugs.yaml`, `minFound: 5` (of 6), weight 2; in
  `bugs.yaml`: `maxReports: 7`, `maxDecoyHits: 1`. Categories and decision rule (task.md; the first "yes"
  decides, so categories are mutually exclusive):
  1. Did the agent change a test (expected value, deletion, skip) so that a failing check passes? ->
     `test-tampering`.
  2. Is a test's expected value computed by the same logic the code uses? -> `tautological-test`.
  3. Was a new test green on its first run because the implementation already existed? -> `skipped-red`.
  4. Did the agent declare done or "tests pass" with no command and output in the transcript at that point? ->
     `claim-without-evidence`.
  5. Is a ticket sliced by layer instead of a vertical slice? -> `horizontal-ticket`.
  6. Did the agent write a spec, ticket or code from a decision the user had not confirmed? ->
     `acted-before-confirmation`.
  Anchor rule as 00 2.2.1. `skipped-red` has two accepted ranges (the implementation edit and the first green
  run are far apart); all other bugs one range. Decoys sized so every category's hit probability is 1/4: 3
  each for the five single-range categories, 6 for `skipped-red` (2/(2+6)); 21 decoys. Examples: the agent
  fixes a wrong expected value after asking the user and quoting the requirement; a table of literal expected
  values from the spec; a test run red, then green; a "done" message quoting command and output; a ticket
  touching model, logic and test in one slice; a recommended answer followed by waiting for "да".
  Cheapest attacker (knows the categories, one report per category): P(0 miss) = (1/4)^6 = 1/4096; P(1 miss) =
  6 x (3/4)(1/4)^5 = 18/4096; total 19/4096 = 0.4639% per attempt, 1 - (1 - 19/4096)^3 = 1.385% over the cap
  (assessment round 1 confirmed by exact enumeration; next best 1/512). Doubling up adds decoy hits; hedging
  pairs exceed `maxDecoyHits`; shotgun exceeds `maxReports`. Demo per 00 2.4: numbers equal physical lines;
  ranges non-overlapping; per-category k/(k+d) = 1/4; the 4^5 x 8 = 8192 report sets scored, exactly 38 pass;
  every allocation of <= 7 reports enumerated, none beats 19/4096; reference findings pass; the alternative
  `skipped-red` anchor passes; right lines with wrong categories fail.
- Sources: R 3, R 1.5-1.6.

### L7 `07-integrity-control`
- id `sdd-integrity-control`, "Автоматический контроль целостности и обновление артефактов", type
  `artifact`, 60 min (~40 hands-on), prerequisites [sdd-pipeline-bug-hunt], outcome O6.
- Opening problem: "Через месяц в спецификации 9 требований, в задачах ссылка на ADR, который уже заменён, а
  в тестах снова client. Никто не врал, просто всё разъехалось. Как поймать это до того, как агент начнёт
  работать по устаревшему документу?"
- Theory: deterministic integrity control (structure, numbering, statuses, links, traceability, vocabulary:
  OpenSpec `validate --strict`/`--archived`, MADR Confirmation, "deterministic custom linters and structural
  tests", this repo's `content:validate` and `design_tokens.py` in CI) vs model-run (Spec Kit
  `analyze`/`converge`, a reviewer against the spec, `/doctor prompt-audit`): the first in hooks and CI, the
  second produces findings a human decides on (R 5). Spec-anchored change: spec first (new id, never reused),
  then tasks, tests, code; a reversed decision gets a superseding ADR, the old one stays. Where it runs: Stop
  hook (L1) and CI. Closing paragraph: from a plan in chat (00 L4) to a spec that a linter keeps honest.
- Starter: L5 reference state (implemented feature, traced tests, all tasks done), `docs/change-request.md`
  (fictional: disputed invoices get no reminders; the glossary already defines Dispute),
  `scripts/check_artifacts.py` skeleton (CLI and exit codes from 2.7, `NotImplementedError`), and
  `docs/adr/0002-*.md` (a correct second ADR superseding nothing).
- task.md "Готово, когда":
  1. `scripts/check_artifacts.py <root>` implements C1-C6 with the 2.7 resolver (task.md prints its first five
     bullets verbatim and, for the sixth, "the `_Avoid_` words are the union over every context file that
     `GLOSSARY-MAP.md` under `<root>` links", pedagogy round 3, N-e; no text containing `checks/`, leak guard,
     assessment N1): exit 0 and no output on a clean root; exit 1 and exactly one line `<rule> <file>:
     <token>` per finding on stdout, with the 2.7 token per rule; exit 2 with a message on stderr and nothing
     on stdout on a usage error (no `<root>` argument) or a parse error (a root without `docs/spec.md`, a root
     without `GLOSSARY-MAP.md`, a root with a linked context file missing); it exits 0 on your workspace.
  2. Change request applied: REQ-01..REQ-08 lines unchanged; exactly one new WHEN...SHALL requirement with an id
     not used before, mentioning `Dispute` or `disputed`; a task listing it with `Status: done`; a test labelled
     with its id that catches a broken dispute rule; your edited tests still pass on every correct version in
     any order, and every L5 broken version is still caught by a test with that requirement's label; the code
     change passes the hidden acceptance tests; ADR-0001 and ADR-0002 keep their status.
  3. The Stop hook runs the tests, then the linter; a linter finding or a linter exit 2 blocks with the
     linter's output, both streams (findings come on stdout, usage and parse errors on stderr), in the reason;
     everything from L1 still holds (assessment N5).
  4. `change-request-applied` and `stop-hook-integrity` each accept at most 10 counted failed submissions;
     after the 10th each closes as не пройдено with a mentor review; after the 5th the platform offers the
     mentor. Each first runs a static stage 0; a failure there is reported and does not count. Stage 0 of
     `change-request-applied`: `src/invoices/reminders.py` and `tests/test_reminders.py` exist and parse as Python; the implementation
     imports only standard-library modules and `invoices.models`; the test file imports only
     standard-library modules, `plan_reminders` from `invoices.reminders` and `invoices.models`, contains
     no `skip`, `skipIf`, `skipUnless`, `skipTest` or `expectedFailure`, and its test names are
     `test_req_NN_<words>` with at most two labels; REQ-01..REQ-08 lines unchanged from the original spec
     (whitespace collapsed); exactly one new requirement line, in WHEN...SHALL form, with an id not used
     before, mentioning `Dispute` or `disputed`; the task that lists it has `Status: done`; spec, tasks,
     ADRs and test names pass rules C1-C6 (as your linter checks them) with the original glossary; ADR-0001
     and ADR-0002 keep their status. Stage 0 of `stop-hook-integrity`:
     the hook registration and file rules of L1 (item 4 there), and the hook file parses as Python. Checked
     in the hidden runs, where a failure counts: the hidden acceptance tests; your tests pass on every correct
     version in any order; every L5 broken version is caught by a test with its requirement's label, and the
     broken dispute rule by a test labelled with the new id; the hook behaviour of item 3.
- "Как работать (совет)": write the six rules test-first against small fixture roots of your own. Before
  submitting (two checks have a cap), run the linter on a root with one planted finding and run the hook
  locally on it, as in L1 (pedagogy round 4, N-i).
- Check `artifact-linter`: command, `run: python3 -I "$ACADEMY_CHECKS_DIR/verify_linter.py"`, `timeoutSec: 180`,
  weight 3. The grader generates roots from `checks/data/linter-base/` with a per-run seed (ids, words, file
  names randomized, seed logged per 00 2.5.5) and runs `python3 -I -B <copy of the linter> <root>` (2.3 rules:
  own process per root, fresh copy, HOME, TMPDIR, process group killed), roots in an order shuffled per run
  (assessment N7).
  Clean roots (exit 0, no output), each a near-miss: REQ-01 with REQ-10 present; `billing` when `bill` is
  avoided; `клиент` in a requirement while `client` is avoided; `clientId` in prose; `LedgerAccount` in a task
  line; `client` inside a fenced block of the spec; the superseding ADR mentioning the one it replaces; a `todo`
  task whose REQ has no test yet. Exit-2 cases (exit 2, stdout empty, stderr non-empty), all four of task.md
  item 1 (pedagogy round 3, N-a): no `docs/spec.md`; no `GLOSSARY-MAP.md`; a linked context file missing;
  the linter run with no argument (usage). Corrupted roots, 2 per rule plus one more for C6 = 13, exactly one
  violation each (the demo runs the reference linter on every root and asserts exactly one output
  line): C1 a REQ no task lists; C2 a test label for a REQ absent from the spec, a task citing one; C3 a done
  task's REQ without a test; C4 a numbering gap (token: the missing `ADR-NNNN`), a `superseded by` a missing ADR
  (token: the target); C5 spec citing a superseded ADR, tasks citing a deprecated one; C6 `clients` inside a
  Russian requirement sentence (English inside Russian, plural rule; token `clients`), `client` in the test name
  `test_req_01_client2` (one tokenizer for names), `client` in a `## T-NN:` title. Required: exit 1 and exactly one line starting with
  the planted rule id and containing the token. Plus exit 0 on the workspace. Message on fail: root class and
  rule ("не найдено нарушение C4"), never the root contents. Must fail: skeleton; exit 1 on everything; a
  dump-everything linter (more than one line); comparing to the workspace copy; `REQ-1` as a prefix; skipping
  test names; a tokenizer that drops English words inside Russian text. Cheapest attacker: deterministic; a
  linter missing any rule fails its two roots; pass 0 without all six rules.
- Check `change-request-applied`: command, `run: python3 -I "$ACADEMY_CHECKS_DIR/verify_change.py"`,
  `timeoutSec: 600`, weight 2. (A) hidden acceptance tests REQ-01..REQ-08 plus the dispute rule pass on the
  learner's code; (B) 2.6 with traceability where the dispute mutant must be killed by a test labelled with the
  new requirement's id (read from the learner's spec); (C) against the pristine L5 spec in `checks/data/`:
  REQ-01..REQ-08 lines present and unchanged after normalization (whitespace collapsed), exactly one new REQ
  line, its id not in the pristine set, in WHEN...SHALL form, containing `Dispute` or `disputed`; the task
  that lists the new requirement has `Status: done` (revision 7, pedagogy round 5, B1'); grader C1-C6 on
  the workspace with the pristine glossary; ADR-0001 and ADR-0002 statuses unchanged. Stage 0 (2.5; static,
  uncounted, before (A) and (B)), the list task.md item 4 copies verbatim ("original" = the pristine L5
  spec and glossary in `checks/data/`): `src/invoices/reminders.py` and `tests/test_reminders.py` exist and parse as Python; the implementation
  imports only standard-library modules and `invoices.models`; the test file imports only standard-library
  modules, `plan_reminders` from `invoices.reminders` and `invoices.models`, contains no `skip`, `skipIf`,
  `skipUnless`, `skipTest` or `expectedFailure`, and its test names are `test_req_NN_<words>` with at most two
  labels; REQ-01..REQ-08 lines unchanged from the original spec (whitespace collapsed); exactly one new
  requirement line, in WHEN...SHALL form, with an id not used before, mentioning `Dispute` or `disputed`; the
  task that lists it has `Status: done`; spec, tasks, ADRs and test names pass rules C1-C6 (as your linter
  checks them) with the original glossary; ADR-0001 and ADR-0002 keep their status. Counted (A) and (B): the hidden
  acceptance tests; the learner's tests pass on every correct version in any order, every L5 mutant is
  still killed by a test with its requirement's label, and the dispute mutant by a test labelled with the
  new id. Must fail: code changed but
  spec not; REQ-08's text replaced by the dispute rule (ids stay unique, so only the pristine comparison catches
  it); the new requirement reusing REQ-08's id; no task; test labelled for another REQ; the `_Avoid_` line for
  `client` deleted from the workspace glossary plus `client` in the new requirement. Near-miss must pass: the new
  requirement with id REQ-12 (gaps in REQ ids allowed); the new line placed between REQ-03 and REQ-04.
- Check `stop-hook-integrity`: command, `run: python3 -I "$ACADEMY_CHECKS_DIR/verify_stop_integrity.py"`,
  `timeoutSec: 600`, weight 2. Stage 0 (2.5; static, uncounted): registration as L1 stage 0 and the hook
  file parses. Then every L1 probe (regression, 20 probes, protocol and generator
  of 2.8, payload patterns drawn uniformly and independently per class) with `P/scripts/check_artifacts.py`
  replaced by a grader stub whose behaviour is "exit 0 silently", plus 5 linter probes, all 25 in one order
  shuffled per run (25 x 20 = 500 < 600); failure messages per 2.8 rule 6:
  | Tests | Stub | stdin | Expected; reason must contain |
  |---|---|---|---|
  | green | exit 1, prints `C1 docs/spec.md: <t>` on stdout | class drawn per run | block; `<t>` |
  | green | exit 0, silent | class drawn per run | allow |
  | red | exit 0, silent | class drawn per run | block; the red tokens of 2.8 |
  | green | exit 1 | `stop_hook_active: true` | allow |
  | green | exit 2, prints `usage: check_artifacts.py <root> (<t2>)` on stderr (assessment N5) | class drawn per run | block; `<t2>` |
  `<t>`, `<t2>` random per run. Stub generator (revision 4, the 2.8 rule applied, assessment round 3, B1'';
  revision 6, B1'''): one template for every stub of L7, the 20 regression stubs included, whose only literal
  that varies is `SEED = "<16 hex chars>"`; at run time it computes `d = sha256(SEED)` and takes its
  behaviour from `int(d[0], 16) % 4` (0 exit 0 silent, 1 exit 1 with a finding line, 2 exit 2 with the usage
  line, 3 exit 0 silent) and its token from the hex digits `d[1:9]`. The grader, before anything of P exists,
  samples one seed for every behaviour on every probe (each `secrets.token_hex(8)` redrawn until it lands on
  that behaviour), then the probe's row selects which seed is written; it reads the token the same way. So
  the work and the file timing do not depend on the behaviour, and reading the stub's source tells neither
  without evaluating `sha256`; the hook has to run it, or evaluate it (residual (iv)). The red linter probe takes its red P from the 2.8
  generator. The generator guard of 2.8 covers the stub too: all stubs masked are byte-identical, and the
  seed's static features stay within the null band (the seed is the only varying literal). Stub output never
  contains a missing-file phrase. The payload class of the linter probes is drawn uniformly and independently
  of their state, as in 2.8. Near-miss must pass: linter output forwarded in a JSON `reason` on exit 0; forwarded on
  stderr with exit 2 and empty stdout; tests and linter findings joined in one reason. Must fail: token only in
  `systemMessage` or as plain-text stdout; linter failure turned into `"continue": false`; linter exit 2
  treated as clean (the usage probe); only the linter's stdout forwarded (the usage probe: its token is on
  stderr); every L1 must-fail (regression). Cheapest attackers: linter called, exit code ignored (the finding
  and usage probes fail); token not passed to the reason (same); linter run before tests with early allow (the
  red probe); fixed usage text (token random); a hook that greps the stub's source (no token in it). A hook
  that runs the stub but not the tests is left with the L1 guess (1/46656 with cross-probe memory, a bound for
  the modelled attackers, 11.13), unless it evaluates P statically (11.13 (iv));
  revision 2's "pass probability 0" is withdrawn for the same reason as in L1. The test-state P of every probe
  come from the 2.8 generator (revision 6: one template, draw first, state-independent work). Must fail added
  in revision 4:
  the judge's `static_off` and the architect's `static_ast` adapted to L7 (base: the L5 reference hook with
  the linter call added, its test run replaced by the static decision), and `mtime_off` and `gap_mem` adapted
  the same way, on every logged seed; the L1 `generic_eval` residual applies here unchanged (11.13 (iv)).
- Check `integrity-quiz`: quiz, 2.1 shape. Topics: (1) which checks can run in a pre-commit hook or CI without a
  model (multiple: OpenSpec validate, a traceability linter; distractors Spec Kit analyze, a reviewer
  subagent); (2) a decision is reversed: what happens to the old ADR (single); (3) a new requirement replaces
  an old one: reuse the id or not (single); (4) the linter reports drift while the agent works: Stop hook vs CI,
  who has the last word (single); (5) Spec Kit `converge` reports "Converged": what that does and does not
  prove (single); (6) which drifts a deterministic linter cannot catch (multiple).
- Sources: R 5, R 1.3, RA A4-A5.

## 6. Assessment map (every outcome verb -> the check that observes it)
| Outcome | Verb | Check | Why it cannot pass without the skill |
|---|---|---|---|
| O1 | пишет тесты, которые падают на неверной реализации | L1 late-fee-verified (B) | mutants behind an out-of-process seam (2.6): the structural channels the judge found are closed and observed closed (2.10 item 7); correct runs are reference copies; order shuffled, positional guess 1/18564; mount about 1 (11.13); skips, tautologies fail |
| O1 | (implementation meets requirements) | L1 late-fee-verified (A) | hidden acceptance tests in a process without learner code (learner module behind the seam); starter code has two defects |
| O1 | пишет Stop-хук, который сам запускает тесты и не даёт закончить | L1 stop-hook-tests | 20 shuffled probes (2.8 generator: one template, draw first, state-independent work; text, metadata and timing, and state-flow guards), stdin independent of state, every red probe with a missing-file error; a hook that neither runs nor evaluates the tests: per-class guess, 0.0214% within the cap of 10 (a bound for the modelled attackers); a hook that evaluates the probe files statically: about 1 after one copying submission (11.13 (iv), accepted); registration allowlist |
| O1 | (mechanism) | L1 verification-quiz | random 0.12% (0.36% over 3) |
| O2 | оформляет процедуру как скилл по стандарту | L2 skills-structure | name/dir/fields/references/chain rules; YAML-safe subset; deterministic |
| O2 | с полями CC только там, где нужны; решает, кто вызывает | L2 skills-structure (`verify` spec-only, `release` `disable-model-invocation`) + skills-quiz Q1-Q3, Q6 | wrong invocation choice fails by name |
| O2 | оставляет в постоянно загружаемой памяти только нужное | L2 skills-structure (memory set via the 00 L5 resolver) + skills-quiz Q3 | `@` import and `.claude/rules/` moves fail |
| O3 | составляет глоссарий | L3 glossary-structure + glossary-rubric | structure filter; definition quality rubric-only (stated) |
| O3 | разводит по контекстам слово | L3 glossary-structure (polyseme) + rubric (3) + ontology-quiz Q3 | flat glossary and wrong-side avoid fail |
| O3 | отличает сущность от объекта-значения и границу агрегата | L3 ontology-quiz Q1-Q2 | random 0.12% |
| O4 | спецификация с проверяемыми требованиями | L4 sdd-artifacts (spec) + sdd-rubric (1)(2) + sdd-quiz Q3 | form, headings, vocabulary; meaning rubric-only |
| O4 | один ADR для трудно отменимого решения | L4 sdd-artifacts (exactly one ADR) + sdd-rubric (4) + sdd-quiz Q4 | which decision is rubric-only |
| O4 | вертикальные задачи со ссылками на требования и проверку | L4 sdd-artifacts (tasks, C1/C2, acyclic, Check) + sdd-rubric (3) | traceability deterministic; "vertical" rubric-only |
| O5 | реализует задачи через TDD так, что код проходит скрытые приёмочные тесты | L5 reminders-accepted (A) | hidden acceptance tests against the learner's module behind the seam, no learner code in the test process |
| O5 | каждое требование покрыто тестом с его идентификатором | L5 reminders-accepted (B)(C) | label-matched mutant kills, <= 2 labels per name, AST-only labels, C1-C3, C6 on pristine data |
| O5 | находит подмену проверки в записи сессии | L6 pipeline-bug-hunt | hit 1/4 per category; best attack 0.464% per attempt (1.385% over 3) |
| O6 | пишет детерминированную проверку согласованности | L7 artifact-linter | randomized clean near-misses, 12 corrupted roots, one-line rule |
| O6 | подключает её к Stop-хуку | L7 stop-hook-integrity | stub tokens computed at run time must reach the reason; shuffled regression probes |
| O6 | вносит изменение так, что проверка зелёная | L7 change-request-applied + integrity-quiz Q2-Q3 | pristine-spec comparison, traced dispute mutant, grader lint |
O5's "через TDD" (red step, order) is method, not observed; the check observes the result of it (tests that
kill mutants with the right labels). Revision 1 claimed the interview and acceptance steps; they are not in
O5 any more (pedagogy B1). Rubric-only parts (stated, as 00): glossary definition quality, spec meaning and
coverage, ADR choice, vertical slicing; until the mentor rubric exists (#11) they are graded only by the filter.

## 7. Time
L1 80, L2 50, L3 50, L4 70, L5 65, L6 45, L7 60 = 420 min (7 h); hands-on 55 + 30 + 30 + 50 + 45 + 33 + 40 = 283 min
(67.4%); every lesson >= 60% (L1 69%, L5 69%, L6 73%). Module 00 shipped 345. Sizing rule (curriculum-architect
mistakes, #41 round 2): each lesson names its closest shipped analogue with that analogue's task.md budget, and
gives per-part minutes; the student honest run records each part.
| Lesson | Closest shipped analogue (task.md budget) | Per part (hands-on in brackets) |
|---|---|---|
| L1 80 / 55 | 00 L6, one PreToolUse hook plus settings: 80 / 50 | theory 25; [tests from the requirement document 15; fix 5; hook and registration 25; iterate on checks 10] |
| L2 50 / 30 | 00 L5, memory and AGENTS.md: 50 / 30 | theory 20; [`verify` skill 8; `release` skill and script move 8; CLAUDE.md trimmed 9; iterate 5] |
| L3 50 / 30 | 00 L5: 50 / 30 | theory 20; [read the interview 8; billing glossary 12; ledger glossary and map 6; iterate 4] |
| L4 70 / 50 | 00 L4, planning and a 380-line transcript: 70 / 50 | theory 20; [spec 20; ADR 8; tasks 14; iterate 8]; optional grilling 15 outside the total |
| L5 65 / 45 | 00 L2, 40-70 lines of stdlib code: 60 / 40 (no shipped TDD loop with an agent) | theory 20; [read the vendored skills 5; five tasks test-first with the agent, 32 (~6-7 each); iterate 8] |
| L6 45 / 33 | 00 L4's transcript part: 25-30 min for 380 lines | theory 12; [transcript of 380-420 lines 28; findings file and submit 5] |
| L7 60 / 40 | 00 L2: 60 / 40 | theory 20; [linter test-first on own fixture roots, the agent drafting 22; change request 12; hook extension 6] |
Fallbacks where a lesson asks for more than its analogue and no past run measured it: L5, if the student
honest run exceeds 65 min, T-05 becomes optional in task.md (graded tasks stay T-01..T-04, the check's REQ set
shrinks with it) rather than the time growing; L7, if it exceeds 60 min, the starter ships the 2.7 tokenizer
and fence scanner as a helper module, and the learner writes the six rules. L1 was resized instead (pedagogy
B1): its analogue is measured and the lesson asks for more. L4's optional grilling (~15 min) is outside the
total.

## 8. Deviations from the reference program
1. Order. Reference: verification, skills, SDD artifacts and integrity, ontology, Matt Pocock cases. Here:
   verification, skills, ontology, spec/ADR/tasks, Matt Pocock pipeline (implementation, then the session
   bug-hunt), integrity and updates. Because: the spec, tasks and test names use the glossary vocabulary (L4
   lints it), Matt's own pipeline builds the glossary during grilling before to-spec (R 3), and the integrity
   linter needs a traced, implemented feature (L7 checks requirement -> task -> test).
2. "SDD from design to implementation" is split across L4 (artifacts), L5 (implementation), L6 (reviewing an
   agent's run of the pipeline) and L7 (integrity, updates), because each part has its own hands-on check.
3. "PRD" is taught as the spec (Matt Pocock's rename, R contradiction 7); no PRD standard is claimed.
4. Hidden-task deferred (no runner #13). Upgrades once #13 exists: L2 `verify` triggers on hidden positive
   prompts only (Skill `tool_use` in stream-json) and its body rules are judged; L1 the Stop hook makes a
   headless agent end a hidden task green; L4/L5 a fresh agent implements a hidden requirement from the
   learner's spec and glossary; L4 a graded learner-run grilling. The runner pins "no `--bare`" (it "skips
   hooks, skills, plugins, MCP servers, and CLAUDE.md files") and caps spend with `--max-budget-usd`,
   `--max-turns` (R 7).
5. Named tools (Spec Kit, Kiro, OpenSpec, Matt Pocock's plugin) are cases, not installs; graded artifacts are
   tool-neutral.
6. The interview (grilling) is read and judged in L3/L4/L6, practised only as an optional ungraded step in L4
   (orchestrator decision for revision 2); graded grilling waits for #13 (item 4).

## 9. Cost
No agent runs in any check. Future rubric mentor for 2 rubrics, ~5k in / 1k out per attempt, about
$0.02/attempt each (00 section 8 basis). The learner's in-workspace agent (L5 implementation, L7 linter and
change) spends from the learner's own key; expect L5 to be the largest spend (R 1.5: TDD runs used 8.50x /
2.96x / 4.89x the tokens in Böckeler's experiment; many were cache reads, so the dollar cost is likely lower
than the ratio).

## 10. What NOT to build
- No hidden-task, agent-eval, `budgetUsd`, agent CLI, model call, network or pip in checks; no `skills-ref`,
  PyYAML or `claude plugin validate`. No schema/ADR-0001 change, no new check kinds, no moving quiz keys.
- No required installs of Spec Kit, OpenSpec, Kiro or Matt Pocock's plugin; no TypeSpec, API contract, frontend
  or booking domain (module 04). No edit of module 00 (its L6 theory.md:95 follow-up is a separate issue).
- Module 02 keeps: code over rules, meta-skills, `retro`, `improve-codebase-architecture`, `codebase-design`,
  harness cost, mutation testing as a project practice (01 only grades with mutants). Module 03 keeps: reviewer
  subagents, fan-out, SubagentStop at handoffs. Module 05 keeps brownfield ontology and grilling.
- No re-teaching of module 00 (plan mode, PreToolUse, memory loading, permissions).
- No full YAML or Markdown parser (2.3 subset, 2.7 grammar only); no variant source transforms (the seam makes
  them unnecessary); no sandboxing in the grader beyond 2.3/2.6 (no `unshare`, namespaces, seccomp or uid
  switching: runner isolation is 00 2.5.3's job, and the residuals it closes are listed in 11.13); no EventStorming notation, Kiro paths or system-card claims; no graded names, versions or
  vendor numbers.

## 11. Risks / items for orchestrator or Stepan
1. Platform (#08, #10, #11, #13): caps, close-on-reveal, mentor rule and rubric grading are residual until
   built, as 00 section 10; rubric-only parts of O3/O4 rest on their filters until #11.
2. 2.6 residuals: a differential test against the learner's own correct re-implementation passes; a suite
   where every test asserts everything with labels spread in pairs passes traceability (no precision rule:
   honest cross-failures; the per-run test-order shuffle reduces the flag-based variant of it to this);
   positional guessing and timing are in 11.13.
3. Bug-hunt: 21 decoys, 0.464% per attempt; cumulative 1.385% over the 3-attempt cap is above the 1% bar,
   recorded, same footing as 00 section 10 item 10; alternatives 28 decoys (0.16% / 0.479%) or a 1-submission cap.
4. Unverified in RA, no check depends on them (each fails as outside the exercise): `decision: "block"` without
   `reason`; `decision: "approve"`; `continue: false` with exit 2; a quoted `"true"` in skill frontmatter. The
   missing-file wording is an example in H, handled by a conservative list.
5. Matt Pocock skills vendored in L5 (four SKILL.md, MIT LICENSE, tag and commit pinned); names re-checked at
   fetch; no check depends on them.
6. For Stepan: module total 420 min (revision 1: 385, accepted; revision 2: 405; module 00: 345). Revision 2
   split L5 into L5 (65) and L6 (45) on measured evidence; revision 3: 420 min (283 hands-on, 67.4%), because L1 grows from 65
   to 80 min (55 hands-on), sized from 00 L6 (pedagogy B1, option (a) approved by Stepan). L5 and L7 are the
   remaining time risks (fallbacks in section 7).
7. In-workspace agent may write tests, linter and code: accepted premise as 00; checks grade what the learner
   accepts.
8. Later starters ship earlier reference answers (L2 has L1's reference tests, L5 has L4's artifacts). Platform
   requirement (2.5): open a lesson's workspace only after its prerequisite is done; residual until #08/#10.
9. Mount readability: until runner 2.5.3 (separate uid, hidden `/proc`), learner code can read
   `checks/data/<lesson>/` (mutants, reference, acceptance tests). It finds the path without searching: the
   grader's argv (`ps`, or `/proc/<pid>/cmdline`, readable even when the grader is non-dumpable) names the
   check script under the mount. The judge's `mount_diff` (B) read it, loaded `reference.py` and compared the
   seam with it: VERDICT PASS 3/3 with no requirement knowledge (assessment round 3, N1). Pass probability
   about 1 for a learner who reads the grader's argv; observed. Revision 3's mitigation "the env carries no
   `ACADEMY_CHECKS_DIR`" is withdrawn: it does not hide the path. No variant or acceptance test is ever a file
   in the run, and the grader, server and test process are non-dumpable on Linux, so the mount is the only
   channel to the hidden material; the demo records the local attack, as 00. Learner code at the same uid
   can also write the workspace or `/tmp` (for example copy files it can read there); 2.3's "nothing
   survives" covers grader-created files only (assessment N8).
10. Python: commands verified on 3.11.14 and 3.12.13 only (2.10); the image's 3.10+ interpreter is re-run in
    the demo. Zero-tests exit codes differ (0 vs 5); the check reads the output, so its verdict does not depend
    on it beyond the stated zero-tests note (L1 must-fail list).
11. Follow-up issue (orchestrator): qualify module 00 L6 theory.md:95 ("Exit 1 ... не блокируют") with "без
    JSON"; outside #41.
12. W2 mentor-level exception carried over from module 00. Policy numbers in starters are fiction.
13. For Stepan: residuals of the seam and probe protocol that only runner isolation (00 2.5.3: a separate
    uid per check process, `/tmp` and HOME per process, hidden `/proc`, and every process of the run uid
    killed at the end of a check) closes. Rates per submission, with cross-run memory (today) and without it
    (after isolation); uncapped command checks, so the 100-submission figure is the practical one.
    Revision 5: the five hidden-run checks carry the cap of 10 counted failed submissions (2.5), so "within
    the cap" is the practical figure; the 100-submission figures of revision 4 no longer apply.
    | Residual | Checks | Per submission | Within the cap of 10 (today) | After isolation |
    |---|---|---|---|---|
    | positional guess on shuffled variants, cross-run state kept in a hard-coded `/tmp` path, the workspace or a `setsid` daemon that escapes the process-group kill | L1 (B), L5 (B) | 1/C(18,6) = 1/18564 = 0.0054% | 0.0539% | 1/94585 per submission, 0.0106% within the cap |
    | same | L7 (B) | 1/C(20,6) = 1/38760 = 0.0026% | 0.0258% | 1/202255, 0.0049% |
    | Stop hook that neither runs nor evaluates the tests and remembers probes per payload class (a bound for the attackers the 2.8 guards model; cited after the `mtime_off` and `gap_mem` runs, 2.10 item 8) | L1 stop-hook-tests, L7 stop-hook-integrity | (1/6)^6 = 1/46656 = 0.0021% | 0.0214% | 1/2^18 = 1/262144, 0.0038% |
    | (ii) timing and resource usage (latency, Linux `stat`/`statm`/`VmRSS`, macOS `ps` rss) between the reference copies and the mutants | L1, L5, L7 (B) | not separable in the toy (judge, round 3: all 9 variants overlap); demo guard on the real-size variants (2.6), accuracies recorded here; a separating mutant is redesigned before `ready` | same | same (isolation does not close it; the demo guard does) |
    | (iii) `checks/data/` mount readable, path from the grader's argv (11.9); same class as module 00's accepted mount residual, kept as recorded (Stepan, revision 5) | all command checks that hide material (L1, L5, L7 (A) and (B); L2-L4 expected values) | about 1 for a learner who reads the grader's argv; observed 3/3 (judge's `mount_diff`) | about 1 (one submission suffices; the cap does not change it) | closed (00 2.5.3: separate uid, hidden `/proc`) |
    | (iv) Stop hook that decides red or green by evaluating the probe files statically instead of running the tests (the judge's `generic_eval`: hash every 16-hex seed in P, compare with the plain-digit numbers there); needs the generator's shape, which one counted submission can copy out of P. Accepted by Stepan (revision 6), same footing as (iii) | L1 stop-hook-tests, L7 stop-hook-integrity | about 1 after one copying submission (observed: 2.10 item 8) | about 1 (two submissions: one to copy, one to pass) | copying out of P closed (no shared `/tmp` or workspace across the run uid); open to a cheater who knows the generator from elsewhere, for example the grader source |
    | learner code kills the test process, a probe's parent or the grader (same uid) | L1, L5, L7 | the check fails closed (no valid record, a crash counts as fail: platform requirement), never passes | same | closed |
    | Linux without `PR_SET_DUMPABLE` (a kernel or runtime that ignores it), or ptrace with Yama 0 and `CAP_SYS_PTRACE` | L1, L5, L7 | closed in the prototype on Docker's Linux for the server, the test process and (revision 4) the grader (2.10 item 7), re-run on the image in the demo | same | closed |
    Decisions (Stepan): the five hidden-run checks carry the cap of 10 (2.5, revision 5) with an uncounted
    stage 0 (revision 6); the probes use one template (revision 6; revision 5's four templates bought nothing
    against `generic_eval`); (iii) and (iv) stay recorded, accepted residuals until runner 2.5.3. What the
    cap buys: the guessing rows fall below the quizzes' 0.36% and the bug-hunt's 1.385% over their caps. The
    per-class memory row is a bound for the attackers the 2.8 guards model (a hook that neither runs nor
    evaluates the tests and reads no timing or metadata channel the metadata guard does not cover), cited
    after the `mtime_off` and `gap_mem` runs. What nothing here buys: (iii), and (iv) for a learner who copies
    P once and evaluates it, stay about 1 until runner isolation; both are deliberate cheating. Revision 2's
    "pass probability 0" claims for the hook checks and "no structural fingerprint" for the seam stay
    withdrawn; so do revision 3's "the env carries no `ACADEMY_CHECKS_DIR`" as a mitigation of (iii) and
    revision 5's S = 1-3 template rows (they held only against template-specific parsers, and were non-causal
    bounds: assessment round 4).

## 12. Self-review
Reference: all five topics, deviations in section 8. Contract: existing types and kinds only, workspace on every
lesson, no `checks/` in visible text (L7 task.md prints the resolver without its `checks/` bullet), reserve and
reference off the mount, `maxReports`/`maxDecoyHits` in `bugs.yaml`. Profile: verification as the spine,
decomposition in L4-L5, Python hooks and linter, one Linux lesson inside L1 (`-I` vs `PYTHONPATH`). Feedback
rules applied in revision 3 (all 13 entries, the two round-2 ones explicitly): the sizing rule applied to every
lesson with its analogue and per-part minutes (section 7), not only to the lesson the judge named; the
isolation boundary attacked from the untrusted side through every channel the judge listed (argv/`ps`, files
next to anything imported, shared writable dirs across runs, run order, out-of-domain error text, the record
fd) plus `/proc` on Linux and the server pipe written directly, each run against a prototype and recorded in
2.10 items 7-8 with the result observed, including the two places where the first prototype was wrong (the
`ready` race, the readable server memory); no grader assertion runs in a process that imports learner code;
run and probe order shuffled with `secrets`; every residual guess has a number (11.13). Earlier rules kept:
every pinned command run and its output quoted (2.10); MADR headings from MADR-T; vendor restrictions keep the
source's surface list; task.md lists equal check rules (2.9); expected values from `checks/data/` only; the
00 L5 resolver reused. Revision 4 applies the round-3 entry: the probe generator is specified (one template,
fresh values, state only by rejection sampling, 2.8), and its generated files were attacked statically (the
judge's grep, my own AST and hash-free folding attacker, a masked byte-identity check and a 360-feature
distribution comparison over 1000 + 1000 pairs, with the guard watched going red) before the 1/46656 rate was
cited again (2.10 items 8 and 10). The attack that still passes, a hook that evaluates the probe files
statically (`generic_eval`, residual (iv), accepted), is recorded
with its number, not hidden (11.13 (iv)).

## 13. Non-blocking items, round 1
Pedagogy: N1 applied (L1 core vs "Справка"); N2 applied (plugin row and line in L2, `converge` removed from L5,
L2 theory names the upload surfaces for Q6); N3 applied as optional ungraded steps (L4 grilling, L5 `tdd` copy);
N4 applied (O3 gains the entity/value-object/aggregate clause, observed by ontology-quiz Q1-Q2); N5 applied
(anthropics/skills and Matt Pocock's as cases in L2); N6 applied (L4 opening, L7 closing); N7 applied (L5 advice).
Accuracy: 1 applied (probe timeout 20 s below the registration floor 30); 2 applied (body <= 499 lines, "under
500"); 3 applied ("six more spellings"); 4 applied (WHEN...SHALL is one EARS pattern; sdd-quiz Q3 constraint); 5
applied (8.50x / 2.96x / 4.89x from R 1.5); 6 applied (context description line tolerated, near-miss added).
Assessment: 1 applied (11.9, cleanup requirement in 2.3, demo item); 2 applied (exactly one record); 3 applied
(surface defined; input mutation excluded because the seam copies arguments); 4 applied (>= 10 mutants); 5
applied (allowed imports, proxy error message; acceptance tests assert only what requirements pin, by the mutant
witness rule); 6 applied (20 s probes, stop at first timeout, `timeoutSec` 300/420 cover 13/18 probes); 7 applied
(rows 1-2, 6-9, 11; same file shape); 8 applied (named as policy in 2.8 rule 2, task.md and must-fail; section 12
no longer claims every documented form is accepted); 9 applied (token per rule, exactly one line); 10 applied
(stub exits 0 silently in regression rows); 11 applied (2.2); 12 applied as a platform requirement plus residual
(11.8); 13 applied (term normalization, Relationships meaning, near-misses); 14 applied (path boundary rule,
near-miss).

## 14. Changes in revision 2 (blocking items)
Sources quoted here were re-read for this revision; arithmetic and attacks were rerun (2.10).
- Pedagogy B1 (O5 verbs nobody observes): O5 rewritten to "реализует ... так, что код проходит скрытые
  приёмочные тесты, а каждое требование покрыто тестом с его идентификатором, и находит ... подмену проверки";
  the interview and "принимает по скрытым тестам" are gone; section 6 maps each verb; grilling stays an optional
  ungraded L4 step (8.6). Kept at six outcomes (role rule 3-6): the bug-hunt lesson serves O5's second half.
- Pedagogy B2 (L5 time): split into L5 implementation (65 min) and L6 bug-hunt (45 min, transcript 380-420
  lines, sized from 00 L4's measured 25-30 min for 380 lines); integrity becomes L7; totals 405 / 268 / 66.2%;
  new total is item 11.6 for Stepan.
- Pedagogy B3 (task and checks out of step): convention 2.9; every lesson has a "Готово, когда" list equal to its
  check rules and a separate method block; L2 `verify` body rules moved to advice (not gradable
  deterministically); "script moved" now checked (root `scripts/release.py` absent); L5 test-first is method.
- Accuracy B1 (hard error presented as universal): scope restored from S: "claude.ai skill uploads, the Skills
  API, and packaging with `package_skill.py` from anthropics/skills"; "packaging or upload fails with a hard
  error instead of ignoring the field"; Cursor reads `disable-model-invocation` (R 2.3). L2 theory, `verify`
  message and quiz Q6 changed.
- Accuracy B2 (MADR shape): headings copied from MADR-T with levels (`### Consequences` under `## Decision
  Outcome`), quoted status accepted (`status: "{proposed | ...`), optional status and Consequences required as
  the exercise's rule; verbatim filled MADR-T template added as L4 near-miss (L7's linter reads Nygard only).
- Accuracy B3 (chain rule vs PBP): chains count only read files (`.md`, `.txt`); a reference file pointing at a
  script is allowed (PBP: "The instruction file (`forms.md`) references the script, and Claude can run it
  without loading its contents into context"); near-miss SKILL.md -> `forms.md` -> `scripts/fill.py`.
- Accuracy B4 / assessment B7 (command does not run): ran the variants (2.10 items 1-3); pinned
  `PYTHONPATH=src python3 -m unittest discover -s tests -t .` with `tests/__init__.py` in every starter, P and
  2.6 project, module 00's `test_api.py` rewritten as a TestCase; bootstrap inserts `<tmp>/src` (`-I` ignores
  `PYTHONPATH`, observed); the false "wrong directory prints No such file or directory" removed (observed:
  "Start directory is not importable: 'tests'"); the trap rebuilt on observed output: a mistyped script path
  (Python exit 2, "[Errno 2] No such file or directory") and a `FileNotFoundError` red test (new probe row 4);
  demo item runs the reference hook on the real L1 workspace.
- Accuracy B5 (00 L6 contradiction): one reconciling sentence in L1 theory; module 00 untouched, follow-up
  issue in 11.11.
- Assessment B1 (fingerprints learnable from messages): variants run only in a server process behind a
  byte-identical proxy (2.6); ran the revision-1 fingerprint bank in a toy: the same prefix `97f` on all five
  variants. Message information recomputed: reference-failure names are an oracle the learner already has
  (own passing code); surviving-mutant names are the intended feedback; 2.3 "need no cap" reasoning replaced.
  Two-submission fingerprint attack added to the 2.6 demo as must-fail.
- Assessment B2 (one name carries every id): <= 2 labels per test name, labels only from AST-visible names; the
  all-ids name and `setattr` labels added to L5 must-fail; "labels spread in pairs" recorded as residual 11.2
  with the reason a precision rule is not added; near-miss `req_02_req_05` kept.
- Assessment B3 (YAML subset): rule in 2.3 (quote `: ` and indicator starts, reject trailing comments, tabs,
  duplicates, empty values), checked against PyYAML 6.0.3 on 23 forms (2.10 item 5); `Use when: x` unquoted and
  the trailing-comment boolean added to must-fail; quoted forms and a whole-line comment to near-miss.
- Assessment B4 (memory moves): line cap and overlap apply to the memory set resolved by 00 L5's
  `memory_set()`; `@docs/release.md` and `.claude/rules/release.md` moves added to must-fail; an unimported
  `docs/release.md` and a small rules file to near-miss; O2 says "постоянно загружаемой памяти проекта".
- Assessment B5 (no single resolver): 2.7 resolver (tokenizer `[A-Za-z]+`, scanned regions, single-word
  `_Avoid_`, AST test names, label regex, `REQ-NN` regex) used by every grader rule and printed in L7 task.md;
  contradiction resolved: an English word inside Russian prose is scanned, the Russian word is not; clean and
  corrupted roots for each boundary (`клиент`, `clientId`, `billing`, `client` inside Russian text).
- Assessment B6 (editable inputs): grader C6 reads the pristine glossary in L4, L5, L7; L7 (C) compares the
  pristine L5 spec (REQ-01..08 unchanged, one new id, mentions Dispute); "REQ-08 text replaced" and "`_Avoid_`
  word deleted" added to must-fail.
- Assessment B8 (unsatisfiable block rows): each block row names its token: zero tests `Ran 0 tests` (observed
  on 3.11 and 3.12), L7 usage row a random `<t2>` in the stub's usage line; attackers recomputed (hard-coded
  "Ran 0 tests", fixed usage text).

## 15. Changes in revision 3
Directions approved by Stepan for round 3. Every claim of a closed hole below rests on a run in 2.10 items 7-9.

### Blocking items
- Pedagogy B1 (L1 not sized from its analogue): option (a). L1 80 min, ~55 hands-on, per-part minutes in the
  lesson entry (theory 25; tests 15, fix 5, hook and registration 25, iterate 10); section 7 totals 420 / 283 /
  67.4%; section 7 now sizes every lesson against its closest shipped analogue with per-part minutes and adds a
  fallback for L7; item 11.6 updated for Stepan.
- Assessment B1' (variants distinguishable from the test process):
  - (a) the variant source goes to the server over a pipe after an `armed` handshake and is exec'd from memory:
    no file, no `.pyc` (`-B`), nothing variant-specific in argv or env; the server and the test process are
    non-dumpable on Linux; separate `ready` and `go` pipes, so the test process starts its tests only after
    the server is ready (2.6).
  - (b) arguments are validated against the typed domain D in the server (and in the proxy); every
    out-of-domain call gets one fixed `TypeError`, so every variant answers identically; in-domain exception
    messages are fixed by the requirement documents; "identical for EVERY input" replaced by "over D" (2.6).
  - (c) variant order (2.6), probe order (2.8, L1, L7) and linter root order (L7) are shuffled per run with
    `secrets`; HOME and TMPDIR are fresh per process; each process group is killed after its run; the L1 probe
    protocol is rebuilt so that the stdin class is independent of red/green and red/green needs executing the
    tests (2.8).
  - (d) positional-guess rates recomputed and recorded with the residuals only runner isolation closes (2.6,
    L1, 11.13): the judge's 1/210 and 1/252 confirmed for revision 2's counts; with the fixed counts of
    revision 3, 1/18564 (L1, L5), 1/38760 (L7) per submission for the mutation checks and 1/46656 for the hook
    probes, all with cross-run memory.
  - (e) must-fail demo items with base copies: `pyc_bank`/`pyc_pin`, `race`, `err_bank`, `raw_pipe`, a
    structure probe, a Linux `/proc` probe, `counter` (with a fixed-order control that must pass), the
    row-counting and per-class memory hooks (2.6, L1).
  - (f) "no structural fingerprint can tell variants apart" (2.6, section 6) and "uncapped submissions learn
    nothing beyond behaviour" (2.3, 2.6) replaced by what is closed, what is not, and the rates.
  - Ran (2.10 items 7-8): all structural attacks FAIL; `counter` 0/300 shuffled with 6/6 fixed-order controls
    passing; the per-class memory hook 0/150 with a per-class hit rate of 0.177 vs 1/6. Found by running, not
    by the judge: the server's memory on Linux told variants apart until `PR_SET_DUMPABLE` 0, and the first
    prototype's shared `ready` line made the honest (A) run fail.
- Assessment B2' ((A) runs learner code in the grader's test process): (A) uses the seam reversed in L1, L5
  and L7: the learner's module is V in the server, the grader's acceptance tests reach the test process over a
  pipe and are never on disk in the run, the test process is loaded and acked before any learner code
  exists, and the record is accepted only with the nonce and a normal exit 0 of the test process. Ran: the
  forged record + `os._exit` (both forms), the monkeypatched asserts, bare `os._exit` and a Linux `/proc` forge
  all FAIL; the reference passes and `return 0` fails (2.10 item 7). The residual that server-side learner
  code can find the acceptance tests now applies only to the `checks/data/` mount (11.9).

### Non-blocking items, round 2
Pedagogy:
- N1 applied: L1 allows the stdlib and `late_fee` only, in 2.6 and task.md alike; "every failing test name" is
  graded (two failing methods plus an import error per red probe); L7 has a parse-error root expecting exit 2;
  L5 item 1's import rule is enforced by construction (nothing else importable in the server) and says so;
  L5 item 5 spells the four rules out in words.
- N2 applied: the student run records L6 transcript time separately (section 7 per-part table); 11.3's
  28-decoy alternative would need a time recount, noted here.
- N3 applied: rows for `to-spec`/`to-tickets` (L4), requirement-to-test labels (L5) and the interface domain
  (L1) in section 4.
- N4 applied: L5 task.md line pointing the second half of O5 to L6; `outcomes[]` keeps the full sentence per
  the section 1 rule.
- N5 applied: optional grilling placed last in L4 advice, with the D1-D5 comparison as the takeaway.
- N6 applied: L1 task.md "Что в рабочей папке" explains the unittest layout and why the hook's child runs
  without `-I`.
- N7 applied: the reconciling sentence sits inside the block-routes paragraph and names PreToolUse (00 L6) and
  Stop.
Assessment:
- N1 applied: L7 task.md prints the resolver without its `checks/` bullet.
- N2 applied: one tokenizer for prose and test names; plural rule (`s`, `es`) with near-miss `billing` and
  corrupted roots `clients`; `## T-NN:` titles scanned; the `account` consequence and the `LedgerAccount`
  workaround stated in L4, L5, L7 task.md; CommonMark fence rule defined.
- N3 applied: YAML 1.1 typed plain scalars rejected outside the two boolean fields (checked against PyYAML,
  2.10 item 9); two spaces after the colon rejected; block scalars get "write the value on one line"; CRLF
  normalized; wording "same scalar text".
- N4 applied: per-run test-order shuffle in the bootstrap; 11.2 wording.
- N5 applied: findings on stdout, usage and parse errors on stderr; task.md says the hook forwards both.
- N6 applied: mutant counts fixed (L1 12, L5 12, L7 14); L1 budget 190 s < 300.
- N7 applied: linter roots shuffled per run.
- N8 applied: "nothing survives" scoped to grader-created files (2.3, 11.9).
Accuracy:
- N1 applied: "used 8.50x / 2.96x / 4.89x the tokens; many were cache reads, so the dollar cost is likely lower
  than the ratio" in L1 theory and section 9.
- N2 applied: "same scalar text" in 2.3 (with assessment N3).
- N3 applied: 2.10 item 1 bullet 2 now says "with `tests/__init__.py`".
- N4 applied: the chain rule exempts files SKILL.md also references directly; labelled the exercise's reading,
  never a PBP quote; near-miss added.
- N5 applied: Mavin's EARS page added to L4 sources.

### Unresolved, for Stepan
- 11.13: accept the residual rates or cap failed submissions of the five affected command checks.
- The prototype ran on macOS and in Docker Desktop's Linux (Yama absent); the image's kernel settings are
  re-checked in the demo. Timing between variants is unquantified.

## 16. Changes in revision 4
Round 4 approved by Stepan. Every claim below rests on a run recorded in 2.10 (scratch `m3/`, `m3/probes/`).

### Blocking item
- Assessment B1'' (probe generator leaked the state as a literal `+ 1` / `+ 0`):
  - (a) 2.8 now specifies the generator, not only the property: one template for red and green; names,
    constants `k`, `j`, `m` and seeds drawn fresh and uniformly before the state is known; the state chosen
    only by rejection sampling of the seeds on the evaluated `sha256` value; no flag, offset or other literal
    that differs. Applied to L1 and to L7 (regression probes and red linter probe from the 2.8 generator; one
    stub template whose only varying literal is the seed, behaviour and token derived from `sha256` at run
    time, seed rejection-sampled).
  - (b) Must-fail and guard items added to L1 and L7: the judge's `static_off`, the architect's `static_ast`,
    and the generator guard (masked byte-identity over >= 1000 + 1000 pairs plus a feature comparison of every
    token, literal, line length, size, line count, AST shape, literal residue and hash-free fold, held to 4 sd
    of 0.5 accuracy on an independent test set), with two watched-red controls. "Red and green P of one seed
    diffed" is replaced.
  - (c) Re-ran 2.10 item 8 on the corrected prototype: reference hook 3/3 (also with `-I -B`); raw forward and
    `-I` child fail as before; `static_off` 0/40; `counter_grep` fixed-order control 2/2, shuffled 0/20;
    per-class memory hook 0/300 (per-class hit 0.163 vs 1/6), so 1/46656 is cited on this run; own static
    attacker `static_ast` 0/70 (0.488 of probes right). Generator guard: 1 masked text over 4000 projects,
    best of 360 features 0.5165 on test (band 0.5447); controls reach 1.0 and 0.747 and fail.
  - Found by running, not by the judge: `template_eval`, a hook written for the probe template that evaluates
    its `sha256` assertion without unittest, passes 5/5. Recorded as residual (iv), about 1 once the template
    is copied out of P (11.13), with options.

### Non-blocking items, round 3
Assessment:
- N1 applied: 11.9 and 11.13 row (iii) state "about 1 for a learner who reads the grader's argv; observed
  3/3"; "no `ACADEMY_CHECKS_DIR`" dropped as a mitigation; the recommendation no longer compares the rates
  this row dominates with the quizzes.
- N2 applied: the grader's first statement on Linux is `prctl(PR_SET_DUMPABLE, 0)` (2.3); must-fail
  `grader_mem`/`grader_mem_b` added (2.6); ran in `python:3.12-slim` (uid 1000, Yama absent): both
  PermissionError and FAIL, honest (B) and reference (A) still PASS (2.10 item 7); "`/proc` closed" names the
  grader, the server and the test process.
- N3 applied: 2.6 says the nonce and exit-code rule protect (A) and the (B) verdict rests only on the
  variants being unidentifiable; the guessed-nonce demo item for (B) is replaced by the real-nonce forge,
  which must still fail on its mutants.
- N4 applied by its second option: the six correct runs are six reference copies (e1..e3 dropped), so no
  correct run can stand out by timing or resource usage; residual (ii) becomes "timing and resource usage
  between the reference and the mutants", with the judge's toy observation and a demo guard on the real-size
  variants (2.6, 11.13); the resource probe is a must-fail.
- N5 applied: numeric bounds of D in 2.6, `docs/late-fee.md`, the L4 brief, and L1/L5 task.md; the
  differential sampler covers the whole bounded range plus extremes; near-misses at and past the bounds.
- N6 applied: trailing spaces of a plain value are stripped before the typed-form rule (as YAML does), so
  `2026-10-29 ` is rejected like `2026-10-29` (2.3; run in 2.10 item 9).
- N7 applied: each class's pattern drawn uniformly and independently with `secrets.SystemRandom` (L1 table,
  L7).
Accuracy:
- N1 applied: in MADR front matter the typed rule applies to `status` only, other keys get the line-shape
  rules (2.3, 2.7); `date: 2026-10-29` unquoted added to the L4 near-miss.
- N2 applied: 2.8 runs the hook as `python3 -I -B`; 2.3's sentence scoped to the processes the grader starts,
  with the hook's unittest child named (it may write `__pycache__` inside P, removed with P).
- N3 applied: 2.10 item 7 says "`fd/` not listable (the probe's `glob` returned nothing)".
- N4 applied: 2.3 and 2.10 item 9 wording for `y`/`n`/`1.5e3`/`2026-1-2`; re-run with `safe_load` in a `try`:
  43 values (40 + 3 trailing-space), 0 misses, 4 strict-side; `=` raises `ConstructorError`.
Pedagogy:
- N-a applied: L7 grades all four exit-2 cases of task.md item 1 (no spec, no `GLOSSARY-MAP.md`, missing
  linked context file, no argument).
- N-b applied: L1 task.md items 4-5 print the command forms, hook-object keys, rejected keys with their
  reasons and the stdout keys and output forms themselves, without pointing at 2.8.
- N-c applied: allow requires exit 0, in task.md item 5 and the probe table.
- N-d applied: L1 advice "forward the whole output"; the reference hook forwards the whole stderr (re-run
  3/3); a demo item checks the reason on the largest red P.
- N-e applied: L7 task.md and 2.7 state the `_Avoid_` union over every linked context file.
- N-f applied: 2.8 rule 6 specifies the probe failure messages (class, state, expected, observed, missing
  token kind; never position or seed).
- N-g applied: L6 theory 12 min in the lesson entry; L5 "five tasks, 32 (~6-7 each)".

### Unresolved, for Stepan
- 11.13: rows (iii) mount and (iv) template evaluator are about 1 for a deliberate cheater until runner
  2.5.3 (and, for (iv), against anyone holding the grader source); accept, or add the submission cap
  (changes only the guessing rows) and/or several probe templates.
- The side-channel guard and the generator guard are demo items; their numbers on the real-size variants and
  the image interpreter are recorded before `ready`.

## 17. Changes in revision 5
Stepan's decisions on the round-4 residuals. Runs recorded in 2.10 items 8 and 10 (scratch `m3/probes/`).
- (iv) template evaluator: the Stop-hook probes of L1 and L7 are drawn from K = 4 structurally different
  templates (2.8 item 4: inline `assertEqual`; helper module; data file, digit loop and raised
  `AssertionError` with a missing submodule; import-time flag with `pathlib` and a dict lookup), one per probe
  with `secrets.randbelow(4)`, independent of state and class, each under the 2.8 generator rule. Why 4, and
  why not more, is stated in 2.8. Observed on the prototype: the reference hook 3/3; `static_off` 0/20;
  `static_ast` 0/30; `counter_grep` shuffled 0/20 with the fixed-order control 2/2; the per-class memory hook
  0/300; `template_eval` knowing 1, 2, 3 templates 0/100, 2/100, 28/300 (per-probe accuracy 0.638, 0.746,
  0.874 against 5/8, 3/4, 7/8); knowing all 4, 10/10. Generator guard per template: 1 masked text over 4000
  for each of T1-T4, best feature 0.5180-0.5245 against the 0.5447 band; both leak controls fail it on all
  four templates. The masking is now sentinel rendering (the revision-4 regex masked template literals such
  as `[:8]` when a constant happened to equal them, a false alarm found on the first run).
  Recomputed (11.13 (iv), exact with the per-class pattern memory): knowing 1, 2, 3 templates 1/926, 1/50,
  0.182 per submission; 1.07%, 18.3%, 86.5% within the cap; knowing all 4 about 1, and one copying submission
  shows all 4 with probability 0.983. More templates only buy copying submissions (K = 8: 0.478).
- Cap: `late-fee-verified`, `stop-hook-tests`, `reminders-accepted`, `change-request-applied`,
  `stop-hook-integrity` accept at most 10 failed submissions that reached their hidden runs, as 00 2.5.6
  (runner requirement, counter never reset, closed check stays closed, mentor suggested after 5); failures
  before the hidden runs do not count (2.5). "Готово, когда" gains the cap item in L1 (6), L5 (6) and L7 (4);
  the text names check ids only, never the checks directory. Guessing rows within the cap: positional
  0.0539% (L1, L5) and 0.0258% (L7); per-class memory hook 0.0214% (11.13; 2.3, 2.6, L1 updated).
- (iii) mount: kept as a recorded residual, about 1 for a learner who reads the grader's argv (observed
  3/3), same class as module 00's, closed by runner isolation 00 2.5.3; the cap does not change it; the
  withdrawn "no `ACADEMY_CHECKS_DIR`" mitigation stays withdrawn (11.9, 11.13).

## 18. Changes in revision 6
Stepan's decisions for the final round. Runs: 2.10 items 8 and 10 (`m3/probes/run_r6.out`,
`run_r6_guards.out`).
- Assessment B1''' (timing leak): 2.8 items 3 and 5 make the generator's work independent of the state (a
  hitting and a missing seed sampled for every value on every probe, the state selecting at the end, in one
  place) and draw everything before P exists; the same for the L7 stub (one seed per behaviour, then
  select). New guards: metadata and timing (pairwise mtime, ctime, birthtime gaps, inode order, wall and CPU
  time to the hook's start, built through the grader's own path) and state flow (AST: the state reaches only
  the seed selector), each watched red. Observed: metadata guard PASS (best 0.5265, band 0.5447; wall median
  28.9 ms on both states), its controls FAIL (revision-5 order 1.0, draw-first without constant work 0.9967);
  state flow PASS, `sum_leak` FAIL; text guard PASS (0.5245), offset and half-range controls FAIL. Must-fail
  added to L1 and L7: `mtime_off` 0/20 and `gap_mem` 0/20; reference hook 3/3. 1/46656 re-cited after both
  (memory hook 0/300, per-class 0.162), labelled a bound for the modelled attackers.
- K = 1 (Stepan): revision 5's four templates and their S = 1-3 rows are removed from 2.8, L1, L7, section 6
  and 11.13; the revision-5 tables in 2.10 stay as a labelled record.
- Residual (iv) rewritten: a hook that decides by evaluating the probe files statically (`generic_eval`
  10/10 on the revision-6 generator) passes at about 1 after one copying submission; runner isolation closes
  the copying, not a cheater who knows the generator; accepted by Stepan, same footing as (iii). 2.8 no longer
  says a static decision "needs evaluating `sha256`" in a way that implies a guess; it names the evaluator.
- Pedagogy B1: each capped check has an explicit stage 0 in its entry (`late-fee-verified`, `stop-hook-tests`,
  `reminders-accepted`, `change-request-applied`, `stop-hook-integrity`), copied into the task.md cap items
  (L1 item 6, L5 item 6, L7 item 4); 2.5 defines the counted/uncounted boundary and adds the demo item (a
  stage-0 failure leaves the counter unchanged, a hidden-run failure raises it by 1). N-h: L1 item 5 lists the
  five missing-file phrases. N-i: local hook and linter trial in L1 and L7 advice. N-j: method names
  `test_x<hex>` in 2.8 item 1. N-k: the cap items say the mentor is offered after the 5th counted failure.
- Accuracy round 4: N1 the `static_off`/`static_ast` figures are labelled by generator revision in L1; N2 the
  per-template smoke run and `template_eval_all` are re-run and recorded (`r5rec/`, `run_r6.out`); N3 (T3
  naming) is moot with K = 1.

## 19. Changes in revision 7
Text only; no mechanism changes. Round 5: assessment PASS, accuracy and pedagogy FAIL on text.
- Accuracy blocking / assessment 3: the L7 `stop-hook-integrity` entry now says its P come from the
  revision-6 2.8 generator (one template), and that the 1/46656 guess holds "unless it evaluates P
  statically (11.13 (iv))", labelled a bound for the modelled attackers (accuracy 2). `4-template` and
  `K = 4` remain only in labelled revision-5 records (2.10, sections 17-18).
- Pedagogy B1': L7 `change-request-applied` (C) gains "the task that lists the new requirement has
  `Status: done`" (static, stage 0); its stage-0 list is written once in the check entry and copied verbatim
  into task.md item 4, now naming rules C1-C6 with the original glossary (C4, C5 included); item 2 and item
  4's counted list add that edited tests still pass on every correct version in any order and still catch
  every L5 broken version with its label; 2.5's demo adds the L7 pair (ADR numbering gap: stage 0, counter
  unchanged; test failing on a correct version: counter +1).
- Stage-0 lists re-diffed against their task.md copies for all five capped checks: L1 `late-fee-verified`
  and `stop-hook-tests`, L5 (N-l: "tests are literal `def test_...` methods" dropped from the item 6 stage-0
  list; it stays in item 2 as an explanation), L7 both. N-n: L5 item 1 says a disallowed import "is rejected
  before the runs". N-m: same fix as accuracy blocking.
- Accuracy 1: L1 cites the revision-6 memory-hook run (0/300, 0.162). Accuracy 3: `run_r4.py` and
  `run_static.py` print per-state totals; re-run recorded in `per_state_r7.out` (raw forward 9 of 9 red
  failed, `-I` child 10 of 10 green failed).
- Assessment 1: 2.8's state-flow rule and `state_flow.py` cover `generate()`; `harness_genleak.py` is a third
  control and fails it (`state_flow_r7.out`). Assessment 2: section 12 names `generic_eval` and (iv).
  Assessment 4: the L1 untouched starter stops at stage 0 (skip), uncounted. Assessment 5: the metadata guard
  runs at 1000 + 1000 in the demo.

