# #41 design review, round 1: judge-pedagogy

Design: `plans/41-module-spec-driven-development-design.md` (revision 1), read in full (893 lines).
Verdict: FAIL, 3 blocking items. Attribution: curriculum-architect.

## What I checked
- Inputs: judge_mistakes, `_contract.md`, `docs/course-reference.md` (SDD block, "Our amendments"),
  `docs/learning-process.md`, `learner/profile.md`, `learner/journal.md` (empty, no gap to address),
  `curriculum-architect_mistakes.md` (8 entries), module 00 lesson.yaml files (real total 345 min,
  L4 70 min) and `plans/15-module-introduction-design.md` sections 3-6, 00 L4 task.md (bug-hunt size).
- Outcomes O1-O6: every verb walked against section 6 and against the lesson's starter and task. O1,
  O2, O3, O4, O6 are observable by the named checks. O5: see B1.
- Reference coverage: verification (L1), skills and lifecycle (L2), SDD with ADR/PRD and integrity
  control and updates (L4, L6; PRD-as-spec deviation 8.3 justified), ontology (L3), Matt Pocock cases
  (L3 grilling/glossary format, L4 to-spec/to-tickets, L5 pipeline and tdd). Order deviation 8.1 is
  justified by real dependencies (L4 lints glossary vocabulary; L6 lints a traced feature). "Popular
  skills" and the explicit "ordinary planning -> specification" result are thin (N5, N6).
- Concept dependency, per lesson (theory, task, quiz), not only the moved ones: L1 (all from 00 L4/L6
  or introduced in L1), L2 (plugin not introduced, N2), L3 (ok), L4 (ok; 00 L4 bridge for Check
  commands), L5 (Spec Kit `converge` used before L6 introduces it, N2), L6 (ok). Prerequisite chain
  is linear and matches.
- Hands-on: 255/385 = 66%; every lesson >= 60% (L1 61, L2 60, L3 60, L4 71, L5 72, L6 67).
- Theory starts from a concrete problem in all six lessons, posed as a question (fits Socratic).
- Learner fit: decomposition practised in L4 (spec -> vertical tasks) and L5; Python stdlib only;
  Linux load kept low (hook registration reused from 00 L6; the wrong-cwd "No such file" trap is a
  good, concrete Linux lesson). Interview/grilling never practised by the learner (B1, N3).
- Overlap with 00: hook registration, plan mode, memory loading, permissions reused by reference, not
  re-taught (section 10). Deferrals to 02 (mutation testing as practice, meta-skills), 03 (reviewer
  subagents, SubagentStop at handoffs), 04 (TypeSpec, booking domain), legacy (brownfield ontology)
  are consistent with the reference blocks.
- Lesson sizes against module 00 evidence (B2) and task text vs check content in both directions (B3).

## Blocking

### B1. O5 claims verbs no check observes (section 1 O5, section 5 L5, section 6 O5 rows)
Problem. O5: "Проводит фичу по конвейеру интервью, спецификация, задачи, TDD вместе с агентом,
принимает результат по скрытым приёмочным тестам ...". The L5 starter already contains the L4
reference spec, tasks, ADR and glossary, so in L5 the learner does only the TDD implementation. The
interview is never conducted by the learner anywhere in the module (L3 and L4 hand over finished
transcripts). "Принимает результат по скрытым приёмочным тестам" describes the grader, not the
learner: the learner cannot run hidden tests. Section 6 maps the whole phrase to `reminders-accepted`,
which observes code correctness, traced tests and task status only. Same pattern as the #15 O1
entry in the mistakes file.
Required change. Rewrite O5 to what L5 observes, e.g. "Реализует задачи из готовой спецификации
через TDD вместе с агентом так, что код проходит скрытые приёмочные тесты, а каждое требование
покрыто тестом с его идентификатором; находит в сессии агента подмену проверки: ...", and update the
section 6 rows. If the interview step should stay in the outcome, add a learner-run grilling artifact
with a check (see N3); do not keep the verb without one.

### B2. L5 time is not realistic (section 5 L5, section 7, section 11 item 6)
Problem. L5 packs two full exercises into 90 min (~65 hands-on): five TDD tasks with the agent,
graded by >= 8 traced mutants, plus a bug-hunt on a 450-500-line transcript with 6 bugs, 7 accepted
ranges and 21 decoys, plus reading four vendored SKILL.md files in theory. Module 00 already measured
the bug-hunt alone: 00 L4 (~440-line transcript, 15 decoys, plus a short plan artifact) had to grow
from 60 to 70 min (shipped lesson.yaml; module total 345). A bigger transcript with more decoys is at least 35-40
min on its own, leaving ~25 min for five TDD tasks. The design defers the split to the student run,
but the evidence that forces it already exists.
Required change. Split now: L5 `05-pocock-pipeline` (implementation, `reminders-accepted`, ~60-65 min)
and a separate bug-hunt lesson (~40 min) with its own outcome sentence (the "находит подмену проверки"
half of O5), renumber L6, recount section 7 totals and hands-on share, and put the new module total in
section 11 as an item for Stepan (it changes the accepted 385). Alternative only with numbers: shrink
the transcript and decoy count and show the per-part minutes that still fit 90.

### B3. Tasks and checks do not name the same requirements (L2, L3, L4, L5; new convention in section 2)
Problem, both directions.
- Task asks what no check verifies: L2 `verify` body "requires reporting the command and its output,
  forbids editing tests to pass", while `skills-structure` checks only the test command in backticks;
  L2 "script moved" (the old `scripts/release.py` is not checked to be gone); L5 "test-first at the
  seam" and "in order" (the red step is not observable).
- Check enforces what the task, as designed, does not state: L2 CLAUDE.md <= 20 non-empty lines and
  <= 2 lines shared with the procedures; L3 <= 12 terms per context, `_Avoid_` <= 4 words and must
  contain every avoided word the interview states, >= 2 Relationships lines; L4 6-12 REQ lines, >= 3
  user stories, >= 1 out-of-scope item, Testing Decisions names `plan_reminders`, no `.py`/`src/` or
  fences in Implementation Decisions, 3-8 tasks all `todo`, >= 1 `Blocked by: none`, exactly one ADR.
  An honest learner who writes 22 good CLAUDE.md lines or 13 REQ lines fails without having been told.
Required change. Add a convention to section 2: "task.md lists every constraint the lesson's command
checks enforce, as a 'Готово, когда' list; it requires nothing a check or rubric does not grade;
method advice (test-first, order) is labelled as method, not as a done criterion." Then, per item:
either add the two `verify` body rules to the check (a filter plus mentor rubric) or drop them from
the requirements; state or drop the "moved" requirement; L5 phrases test-first as method.

## Non-blocking
- N1. L1 theory density (section 5 L1). ~14 topics in ~25 min, much of it vendor edge cases driven by
  the 2.8 probe table (exit 1 with JSON, `continue: false`, matcher, SubagentStop, TaskCompleted,
  PostToolUse, Codex differences, self-check prompting). The learner asks for short, direct text.
  Keep in theory what writing the hook needs (block routes, `stop_hook_active`, fails open, the two
  traps); move the rest to a "Справка" block at the end or to task.md's accepted-forms list. Watch L1
  time in the student run: it has two command-checked artifacts.
- N2. Dependency table gaps (section 4): "plugin" is used in L2 (auto-updating plugin vs vendored
  copy) and L5 (optional install) and is not introduced in 00 (only a passing mention of skills in 00
  L2/L6); add one line in L2 theory and a table row. L5 compares with Spec Kit `converge`, which the
  table introduces in L6; define it inline in L5 or drop it from L5. L2 quiz Q6 needs the theory to
  name the API upload surface explicitly ("outside CC" alone is too vague for the question).
- N3. The freeze point is "where to start". The method's answer is grilling, and the learner only
  reads transcripts of it. Offer one short learner-run grilling session (own small feature, agent asks,
  learner decides), as an optional ungraded step in L4 or graded by structure if B1 keeps the verb.
  Also consider letting L5 task.md offer copying the vendored `tdd` skill into `.claude/skills/` after
  reading it: it practises L2's third-party audit on a real skill.
- N4. L3 quiz Q1-Q2 grade value object and aggregate, which O3 does not name and no practice uses.
  Either add a clause to O3 or accept consciously in section 8 (reference says "entities").
- N5. Reference "popular skills": L2 theory should name a couple of collections as cases
  (anthropics/skills, Matt Pocock's) without grading names.
- N6. Reference result "from ordinary planning to working through a specification": state the
  contrast explicitly once (00 L4 plan in chat vs a persistent, linted spec), e.g. in L4's opening or
  L6's closing paragraph.
- N7. L5 friction: the registered L1 Stop hook blocks the agent's turn while tests are red, which
  meets TDD's red step. task.md should say this is expected and what happens on the second stop
  (`stop_hook_active`), so the learner does not read it as a broken hook.
