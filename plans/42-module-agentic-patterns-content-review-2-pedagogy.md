# #42 judge_content round 2: pedagogy

Judge: judge-pedagogy. Module `course/ai-for-developers/02-agentic-patterns/`, worktree
`content-42-agentic-patterns-887a63`. Verdict: **PASS**. All round-1 items are fixed and I found no blocking regressions.
Two non-blocking notes are at the end.

## What I read
- Loaded: `.claude/feedback/judge_mistakes.md` (including the 2026-10-30 outcome-verb rule), my round-1 report, and
  the change logs `plans/42-module-agentic-patterns-demo-A.md` (section "judge_content round 1 fixes") and `-demo-B.md`
  (round 3).
- Shipped, read in full: `module.yaml`; L1 `theory.md`, `task.md`, `starter/CLAUDE.md`, `starter/tests/test_api.py`, the
  `quiz.yaml` `typed-boundary` item, and `checks/verify_pokayoke.py` (item 7-10 messages, marker probe); L2
  `lesson.yaml`, `theory.md`, `task.md`, `starter/CLAUDE.md`, `checks/rubric-remediation.md`, and
  `checks/verify_workspace.py` (static, probe and `make_problems`); L3 `task.md`, `theory.md:70-141`,
  `starter/incidents/I04.md`, `checks/data/failure_key.json`, `checks/reference/failure-log.json`,
  `checks/rubric-failure-fix.md`, and the four `rubric-demo/*-failure-log.json` I04 entries; L4 `task.md`,
  `theory.md:95-119`, the `quiz.yaml` `local-open-weight-model` item, and `checks/verify_contour.py:335-378`
  (`check_sandbox`); L5 `theory.md:80-109` and the effort lines in `checks/bugs.yaml` and `starter/transcript.md`.
- The estimatedMinutes and task.md breakdowns of all five lessons, summed.

## Round-1 items
1. **L3 I04 (blocking): fixed.** The key `failure_key.json:38-45` accepts `check`, `code` and `hook`. The reference
   `failure-log.json:17-21` is `layer: hook` with the fix "Stop hook runs `make check`", plus the `report_v0.py` deletion
   named as code. By the definitions in rubric F1 (`rubric-failure-fix.md:18-22`), "Stop hook that runs `make check` is
   `hook`", so the reference now sits at its own label. The task text (`task.md:59-60`, "choose the fix that prevents
   the repeat, not what the repo already has") leads to hook or code. Reading step 2 against the existing A2 still
   leads to check. All three answers are accepted, so the printed text and the key no longer disagree. I re-walked I02
   (reference now `hook`, deny `pip install`; the key has check/hook) and I05 (reference `check`; the key has
   check/hook). Both are consistent. The rubric-demo files use `hook` for I04, which matches.
2. **L2 time: fixed.** `lesson.yaml:6` is 85, which matches student A's 85-90. The task.md breakdown
   20+12+24+14+3+2+10 = 85, with 65 min of practice. The extra time is on the `lint` line (24). Module totals:
   60+85+70+60+50 = **325 min**; practice 38+65+48+35+38 = **224 min (68.9%)**. Every lesson is at 58% or more, and
   every breakdown sums to its lesson.yaml value.
3. **L1 R06 ambiguity: fixed.** The step-4 sentence is identical in L1 `theory.md:106-108`, L1 `task.md:65-67` and L3
   `task.md:82-84`: "Да" only when the change prevents this line's error; deleting a dead module fixes the line about
   that module, not the import rule. Walk R06: steps 1-4 no, 5 no, 6 yes, giving `check` (the key). R12 is still
   `code` and R04 is still `code`. No other L1 card changes.
4. **L3-only clarification of "ошибка этой строки": done.** It is in L3 `task.md:91-93` and `theory.md:93-94` and
   nowhere in L1. L3 theory's worked example (step 4 "нет") is consistent with it.
5. **M1 wording: fixed.** `task.md:175` "M1: сообщение говорит, что нарушено и какую границу это правило защищает"
   now matches the rubric M1 heading. "в одной фразе" is gone.
6. **make test / make check: addressed in theory.** L2 `theory.md:90-92` says that once `make check` exists, it is the
   command to name in CLAUDE.md instead of `make test`. The starter `CLAUDE.md:5` still names `make test`, and the
   text does not grade this. That is acceptable.
7. **typed-boundary explanation: fixed.** The last clause about the memory line has been dropped
   (`quiz.yaml:107-113`), so option d is no longer half-endorsed.

## Regressions: changed items, task text against the checks, both directions
- **L1 item 8** (`task.md:107-113` against `verify_pokayoke.py:233-245, 317-320`): the text promises named-only calls,
  correct fees on hidden invoices, the fee taken from the `late_fee` call (the check swaps it in), and no other
  `late_fee.py` function reached from outside. The check enforces each of these: static call/import/attribute rules,
  the statement grid, and the 424242 marker. It enforces nothing the text does not say. The messages are Russian,
  name the item, and say what to do ("пеню считайте только через late_fee с именованными аргументами").
- **L1 item 10** (`task.md:118-126`): the pristine overlay exception for `test_late_fee.py` is stated, and it is the
  file item 7 asks the learner to edit. The other starter test files (`test_api.py`, `test_statement.py`) are
  overlaid. `test_api.py` does not touch `old_api.py`, so item 9's deletion does not break a pristine test.
- **L2 item 7 / L3 item 7**: the same pristine-overlay sentence is in both. It matches demo A B2.
- **L2 item 8** (`task.md:147-154` against `verify_workspace.py:232-269`): the six variants in the code (as is; a
  clean ledger module whose docstring and comment mention `import invoices`, plus a passing test; a new A1 file; an
  A1 import appended to `src/ledger/accounts.py`; a failing test; a regression in `src/invoices/late_fee.py`)
  correspond one to one to the text's two exit-0 cases and four non-zero cases. The 30 s limit and "стартовые тесты
  из копий проверки" are stated. The messages are Russian, name the variant, and give the expected exit code.
- **L4 excludedCommands** (`task.md:77-78` against `verify_contour.py:355-361`): the text says the list stays empty in
  every settings file, and the check fails on any non-empty or non-list value in local, project or user settings. The
  two match. Theory `:110-112` explains why. The starter has no such key, so naming it in the brief constraints guards
  a form and gives no answer away. "Находит" still needs the learner to find the G1-G7 defects; the check prints only
  the id line. `allowUnsandboxedCommands` is still unnamed in task.md and taught in theory `:104-110`, user `false`
  wins as theory says.
- **L4 quiz option d**: "WebFetch перестанет отправлять имя хоста на `api.anthropic.com`" is false per theory
  `:185-187`, which the learner has read before the quiz. The explanation teaches `skipWebFetchPreflight`. Correct set
  {a, c}, and both are taught.
- **L5 effort/ultrathink** (`theory.md:90-93, 102`): the planted `transcript.md:98` "Подумай над этим очень-очень
  тщательно" stays `session-steering`. The decoy `/effort high` (`:177`) is the good twin named in theory `:102`.
  There is no `ultrathink` anywhere in the snapshot, so the exception sentence cannot create a new ambiguity.
- **Threat model of record** (design 2.8): the changed checks stay inside the IN list (pristine tests against edited
  tests, stub `make check`, special-casing visible starter files). Nothing in the changed task text promises
  detection of an OUT item (RS1-RS8).

## Checklist
- Outcomes observable: unchanged, OK.
- Simple to complex, no concept before it is introduced: the new step-4 sentence uses only L1 terms. L3's
  clarification reuses L3's own "строка = proposed fix". OK.
- Practice serves the outcome, at least half hands-on: 68.9%, OK.
- Theory starts from a concrete problem: unchanged, OK.
- Learner gaps (`learner/journal.md`): none recorded yet. The "Первый шаг" hints are still in every task.md.
- Student report items: R06 (student A) is fixed; the L2 time (student A) is fixed; the I04 doubt is resolved by the
  key. No student re-run after round 1: the changes are wording, key and check changes, re-demoed by practice-designer
  A/B on 3.11 and 3.12 (demo A round-1 table, demo B round 3). I accept that consciously.
- Time realistic: L2 85 against the student's 85-90, OK.
- Reference program: unchanged, OK.

## Non-blocking
- L2 `verify_workspace.py:258-261`: if a learner deleted `src/ledger/accounts.py`, the "A1 appended to an existing
  file" variant appends nothing, and the message reads "выходит с кодом 0, а должен упасть" even though the learner's
  `make check` is fine. This is unlikely, because `entry_lines` behaviour (item 6) depends on the ledger package, so
  it is information only.
- L5 `bugs.yaml:114` explanation "Фразы 'подумай как следует' не управляют рассуждением" is a little blunter than
  theory `:90-92` ("сдвигает поведение только в пределах настройки effort"). It does not contradict the key.

PASS
