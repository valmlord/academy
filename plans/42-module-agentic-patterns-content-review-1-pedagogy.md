# #42 judge_content round 1: pedagogy

Judge: judge-pedagogy. Module `course/ai-for-developers/02-agentic-patterns/` (5 lessons), worktree
`content-42-agentic-patterns-887a63`. Verdict: **FAIL, 3 issues** (1 blocking, 2 must-fix), plus non-blocking notes.

## What I read
- Loaded first: `.claude/feedback/judge_mistakes.md` (including the #42 round-1 lesson on outcome verbs), `_contract.md`,
  `docs/learning-process.md`, `learner/profile.md`, `learner/journal.md` (empty: no LEARN gaps yet),
  `docs/course-reference.md` block "Паттерны агентной разработки".
- Upstream: design rev 5 (sections 0-8 and 10 in full; 2.3, 2.5-2.8 against the shipped text), plan (M1-M2, P1-P6, A1-A4,
  S1-S3), demo records A and B including their round-2 fix tables, student reports A-D.
- Shipped: `module.yaml`; per lesson `lesson.yaml`, `theory.md`, `task.md`; L1 `quiz.yaml`; L2 starter `CLAUDE.md`,
  `scripts/check_architecture.py`, `checks/rubric-remediation.md`; L3 all 8 `incidents/*.md`, `checks/data/failure_key.json`,
  `checks/reference/failure-log.json`, `checks/rubric-failure-fix.md`; L4 `docs/contour-brief.md`; L5 `snapshot/CLAUDE.md`.

## Checklist
- Outcomes observable: OK. O1-O5 verbatim in `module.yaml` and each `lesson.yaml`; verbs (раскладывает, убирает, меняет,
  пишет, подключает, приводит, разбирает, называет, формулирует, реализует, находит, исправляет, выбирает, отличает) each
  map to a check (design section 6).
- Outcome verbs vs what the task text hands over (judge_mistakes 2026-10-30 rule): L4 task.md and the check name only the
  brief requirement, never file/key/value, so "Находит" is left to the learner; L5 says only "не пройдено"; L1 and L3 are
  binary on the key. OK.
- Simple to complex, no concept before introduction: OK. L1 defines the ladder, guides/sensors, poka-yoke; L2 uses AST and
  remediation; L3 reuses L2's walk and adds step 0; L4 is self-contained with a reference block; L5 consolidates and glosses
  `claude -p` before the hunt. Pointers back to 00 L4/L5/L6 and 01 L1/L4/L6/L7 are one line each, not re-taught.
- Theory starts from a concrete problem: OK in all five (opening questions from the design, followed by the concrete
  failure).
- Hands-on share: 214 of 315 min (67.9%), every lesson >= 58%. Task.md breakdowns sum to lesson.yaml. OK, except the L2
  realism item below.
- Learner fit: profile says "freeze where to start" -> every task.md has "Первый шаг"; weak networking -> L4 theory defines
  gateway/proxy/CA/mirror/allowlist before using them and gives a laptop-gateway-mirror diagram. OK.
- Reference program: four topics in order, deviations 8.1-8.4 justified in the design. OK.
- Messages and task text: P1-P4, A2, S2 lines present (L1 item 10, L2 items 4 and 7, L3 item 7); English `seed` line replaced
  (demo A #8); L4 N4 message equals task.md. OK.
- Accepted deviations confirmed as stated: L3 binary failure-log feedback (task.md item 2); L3 key follows the printed "code"
  definition (I01 memory only, I10 delete/memory; theory.md:88 and task.md:66-68 say a Makefile target is not code); L4 G7
  includes `allowUnsandboxedCommands` (theory.md:104-110 teaches it, so G7's "никакой запрос разрешения" is now delivered);
  L5 decoys replaced (the two "must win" judgement lines at `snapshot/CLAUDE.md:50,53`; L5 theory.md:57-59 adds the D4
  sentence that an LLM-only guard keeps a rule `prose-rule`; L5 theory no longer lists "preference with exceptions" as a
  good twin of prose-rule, it is now memory-bloat/`delete`, consistent with L1 step 3).

## Placement ladder across L1, L3, L5 and the rubrics
Walked every L1 card (key equals student A's walk), every L3 incident against `failure_key.json`, the reference log and
rubric F1, and every instruction-file line of the L5 snapshot against L1 steps 1/2/3/7.
- L1 theory.md:87-109 and task.md:46-70: same seven steps, same "code"/"hook"/"check" definitions. L3 task.md:57-90 repeats
  them verbatim and adds step 0 and "the line is your proposed fix; the repo is the incident's repo". L5 theory.md:18-23
  summarises the same steps correctly. L3 rubric F1 uses the same definitions.
- L5: every instruction-file decoy (`:5`, `:50`, `:52`, `:53`, `:54`, `:59-61`) ends at step 1 or 7; planted `:49`, `:51`,
  `:55`, `:7` fit their families. Consistent.
- L3 I04: **inconsistent**, see issue 1.

## Issues

### 1. BLOCKING. L3 I04: key, reference fix, rubric F1 and the task text disagree on the layer (practice-designer A)
- `03-failure-analysis/starter/incidents/I04.md:6-9,18,31`: A2 already exists in `make check`; "Stop-хук запускает только
  тесты"; the agent ran only `make test`; CI caught it. The natural fix that prevents the repeat is "the Stop hook runs
  `make check`" (and/or delete `report_v0.py`).
- `task.md:59-60` and `theory.md:92-93`: "Сначала выберите исправление, которое предотвратит повтор (а не то, что в том
  репозитории уже есть)". `task.md:68-69` and `rubric-failure-fix.md:18-22`: "Stop-хук, который запускает `make check`, тоже
  `hook`".
- `checks/data/failure_key.json:38-43`: I04 layers `check`, `code`; **`hook` is rejected**.
- `checks/reference/failure-log.json:17-21`: I04 `layer: check`, fix "make `make check` ... the command ... the Stop hook
  runs; also delete the dead report_v0.py". By the lesson's own definitions that fix is `hook` (+ `code`), so the mentor's
  reference fails rubric F1 ("at the layer it names") on itself.
- Origin: design L3 table row I04 "2 Y: A2 already exists" predates the round-2 sentence "not what the repo already has";
  the two now contradict. An honest learner who follows the printed text lands on `hook` (or `check` only by reading step 2
  against the existing A2, which the same paragraph tells them not to pick). With binary feedback, a key that rejects the
  text's own answer spends the learner's single tolerated miss invisibly; combined with any one other doubt it fails and
  nothing says where.
- Fix target: the key, the reference fix and the text name the same layer for the same fix. E.g. I04 layers {`hook`, `code`}
  (Stop hook runs `make check`; delete the dead module), or keep `check` only if a *new* check is the intended fix and the
  incident text makes that the natural reading; rewrite the reference I04 fix to sit at its declared layer; re-run the
  failure-log rates (accepted counts change) and the demo rows; re-read I02/I05 the same way (they are consistent today).

### 2. L2 time estimate not reconciled with the student run (lesson-author A; practice-designer A if the fallback is chosen)
`02-architecture-checks/lesson.yaml:6` 75 min, `task.md:3-11` "lint вместе с агентом: около 20 минут". Student A estimated
85-90 min for this learner (relative-import resolution via `level`, per-statement dedup, exit codes, a long item 4 to read).
Design section 7 names the fallback for exactly this case ("L2 ships the relative-import resolver"); it was not applied, the
estimate was not raised, and neither demo record nor the plan records a conscious acceptance. Fix: apply the fallback, or
set L2 to 85-90 min with the extra time on the `lint` line of the breakdown (module total and hands-on share stay above
50%), or record why 75 stands.

### 3. L1 R06 ambiguity left open (lesson-author A)
Student A: R06 ("Only repository.py may use sqlite3") can be read as `code` at step 4, because step 4 says "убрать то, что
вводит в заблуждение (... удаление мёртвого модуля ...)" and the only other sqlite3 user is the dead `old_api.py`. The key is
`check`. The ambiguity is not fixed in `theory.md`/`task.md` and not recorded as accepted (demo A's fix table has no row
for it). With 3 binary submissions and an 11-of-12 threshold this costs an honest learner. The os.environ walk
(`theory.md:118-126`) is close but does not address the "remove the misleading thing" reading. Fix: one sentence, e.g. in
step 4 or after the second walk: step 4 is "yes" only when the code change prevents *this line's* mistake; deleting one
example of a forbidden import (R06) removes a copy source (that is R12's line), but any file can still import `sqlite3`, so
R06 goes on to step 6.

## Non-blocking
- L2 `task.md:167` M1 still says "в одной фразе"; `rubric-remediation.md:19` dropped "in one clause" after student D. Align
  the criterion name (2.6: rubric criteria by name).
- L2 `theory.md:90-91` says CLAUDE.md names `make check`; the L2 starter `CLAUDE.md:5` still names `make test`, and the task
  does not ask to update it. A one-line "Как работать" hint or nothing; not graded.
- L1 quiz `typed-boundary`: explanation's last sentence ("строка памяти о статусах больше не нужна") sits close to option d;
  consider "строку о статусах можно удалить" so d is not half-endorsed.
- L4: the "Осторожно: это живые настройки" block (task.md:27-38) resolves demo B open item 7 for the learner. Good.

## Attribution
- Issue 1: practice-designer A (key, reference); appended to `.claude/feedback/practice-designer_mistakes.md`.
- Issues 2, 3: lesson-author A; appended to `.claude/feedback/lesson-author_mistakes.md`.

FAIL
