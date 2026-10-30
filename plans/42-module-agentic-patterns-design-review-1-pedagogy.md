# #42 judge_design round 1: pedagogy

Design reviewed: `plans/42-module-agentic-patterns-design.md` (revision 1, 680 lines, read in full).
Verdict: FAIL, 2 blocking issues, both attributed to curriculum-architect.

## Blocking

### B1. [design:101-121, 192-213] L1 placement: the ordered rule does not give one answer per card to a literal reader, and the L1 starter lacks the files two cards point at. Binary feedback leaves an honest learner no way back.

2.7 says "the first yes wins" and the key claims "the ordered rule leaves one answer". Read literally, step 2
("Can the agent learn it by reading the repo (code, config, tests, ADRs) ...") already says yes for several
cards that the key places later:
- R04 (key `code`). The shipped `late_fee(amount_cents: int, days_late: int)`
  (`course/.../01-spec-driven-development/07-integrity-control/starter/src/invoices/late_fee.py:8`) states the
  order in the signature, so step 2 gives `delete`. Nothing in step 2 excludes "a fact the agent can read but
  still gets wrong".
- R08 (key `hook`). The generated files carry a DO NOT EDIT header and the PreToolUse hook sits in
  `.claude/settings.json`. Both are in the repo (code and config), so step 2 gives `delete` before step 4 is reached.
- R10 (key `hook`). The Stop hook is in `.claude/settings.json` (config), so step 2 gives `delete` in the same way.
  The ladder never says whether a rule that an existing mechanism already enforces belongs to "where the guarantee
  lives" (`hook`) or to "what I do with the line" (`delete`). In both cases the tag leaves CLAUDE.md, so stage 0
  cannot tell them apart. Only the hidden key does.
- R12 (key `code`). `old_api.py` is "imported by nothing", which the repo shows, so step 2 is a defensible yes.
  The design itself names it borderline.

The starter is also missing things two cards need. The design asks the learner to "check each rule against the
repo before placing it":
- R07 names `invoices.legacy_format`, `invoices.money.format_cents` and the partner CSV export. The L1 starter
  (design:192-197) does not contain `money.py`, `legacy_format.py` or `export_csv.py`: they arrive in the L2
  starter (design:266-268). A learner who checks the repo finds a rule about modules that do not exist, which the
  module's own I10 logic calls a stale line (`delete`). The key's reason, "cannot delete (partner)", rests on a
  docstring the learner cannot see.
- R08 says "regenerate it with `make codegen`". The L1 starter's Makefile is listed as "`test`" only, and the 01 L7
  Makefile it is built from has no `codegen` target. Section 3 also says the 01 L7 reference has the 00 L6
  PreToolUse hook and `generated/`, but the 01 L7 starter has neither (settings.json holds only the Stop hook).

That gives four or five literal deviations against a tolerance of one, with "не пройдено" as the only feedback, no
cap, and a mentor who may not reveal per-item correctness (2.5). An honest learner who applies the printed rule
exactly is stuck. The only way out is a single-flip search, which is not learning.

Fix (curriculum-architect, design 2.7 and the L1 entry):
1. Rewrite the ladder so a literal reading lands on the key. For example, limit step 2 to descriptive lines that
   guard against no mistake ("the line describes something; nothing goes wrong if the agent ignores it"), and add
   the explicit tie-break "a rule that an existing hook or check already enforces is placed at that layer". The
   wording is the architect's choice, but it must survive item 2.
2. Add a per-card table to the design: for each of R01-R12, the answer of every step in order (no / no / yes), each
   "no" justified from a starter file. The content judges then walk the ladder against that table.
3. Make the L1 starter contain everything a card names: `money.py`, `legacy_format.py` (with the partner docstring)
   and `export_csv.py` (moved from L2 to L1, so L2's "plus" list shrinks), the `generated/` header file, the
   PreToolUse hook and a `make codegen` target. Alternatively, rewrite R07 and R08 so they name only what L1 ships.
   Correct section 3's description of the 01 L7 state.
4. Re-run the L1 prototype (section 11 rows 1-3) on the new starter and record the result.

### B2. [design:330-333, 430-433] Task text names things the checks do not verify, and omits what they do (2.6 broken).

- L2 "Готово, когда" says "`scripts/check_architecture.py .` finds nothing in your workspace". No check runs the
  learner's linter on the workspace: `arch-workspace-clean` (a) runs the grader's own `checks/arch_rules.py` on
  `src/`. A learner whose linter misses a form sees a green local run and a red check, and the text never says why.
  Fix: state the verified rule, as 01 L7 task.md item 4 does ("проверка применяет свою реализацию правил A1-A3 к
  `src/` рабочей папки; ваш линтер здесь не запускается").
- L3 "Готово, когда" says "the allowlist stays empty". `deps-gate` (b) reads the pristine allowlist from
  `checks/data/`, so the workspace allowlist is never read, and adding `httpx` to it passes. Fix: drop the clause
  and state what is checked: "проверка применяет свою реализацию правила D1 с исходным (пустым) списком
  `allowed-imports.txt` из стартовой папки; `export_json.to_json` выдаёт результат стандартного `json`". Also
  replace "uses the stdlib" with that behavioural statement.

Then diff each lesson's "Готово, когда" against its check entries both ways, as 2.6 requires, and record the diff
in the self-review.

## Non-blocking

1. [design:31, 543] O3 says "называет механизм ошибки модели", but `failure-log` grades a cause class
   (`gamed-check` ... `no-self-check`), and two mechanisms (sycophancy, horizon) only appear in the quiz. Change
   the wording to "называет класс причины" or map the classes to mechanisms in theory.
2. [design:371-380] L3 keys that a literal ladder reader can break. I10 (stale `make lint` in CLAUDE.md): step 1
   "the command ... -> memory" gives `memory` (correct the line), which the key set {delete, code} does not accept.
   I03: a Stop hook running the suite on the pinned interpreter gives `hook`. I07: the "overdue = past grace" fact
   is non-derivable, which gives `memory`. With count feedback and a cap of 10 this is recoverable, but apply the
   B1 per-card walk to the incidents as well, and widen the key sets or the wording.
3. [design:221] `rule-placement` says "2.0e-6 over 10" but has no cap. With binary feedback and unlimited attempts,
   the realistic path is a single-flip search from a near-key state (at most 48 submissions from 10/12). State it
   as the threat-model residual instead of a capped rate.
4. [design:428, 4] The L3 quiz scenario "agent in a contour without web" uses the closed-contour notion from L4.
   Say "без доступа в интернет" instead. The section 4 claim "no lesson uses a concept from a later lesson"
   then holds.
5. [design:486-490 vs 440-455] The L4 quiz asks about SOCKS ("corporate proxy uses SOCKS"), but "Claude Code does
   not support SOCKS proxies" (R C4, research:351) is not in the L4 theory concept list. Add it.
6. [design:440-455, 659] The L4 theory carries about 15 concepts plus a Codex table in 25 minutes for a learner the
   profile marks weak in networking. Put the Codex contrast table, `allowedProviders` and the WebFetch preflight in
   a "Справка" block from the start, not only after the student run.
7. [design:249-250, 335-336] L3, L4 and L5 have no "Как работать (совет, не проверяется)" with a first step. The
   profile's weak spot is "where to start", and L3 has three deliverables (log, gate, fix). Give each lesson one.
8. [design:192-193] The L1 starter's `statement.py` calls `late_fee` in the right order, positionally, so the
   learner never sees the failure the opening question describes. Plant one swapped positional call that no
   starter test catches, so that making the parameters keyword-only surfaces a real bug (the hidden grid already
   covers behaviour). The learner then hits the problem the lesson solves.
9. [design:200-211] Half of the L1 cards (R01-R03, R11; R08, R10) re-practise 00 L5/L6 outcomes. This is acceptable
   because the ladder builds on them, but L1 theory should point back to 00 L5/L6 in one line each and not
   re-explain them (section 10 already says so for Gloaguen).

## Checked
- Role file, `judge_mistakes.md`, `_contract.md`, `docs/learning-process.md`, `learner/profile.md`,
  `learner/journal.md` (no entries: nothing to adapt; the profile's weak spots of networking and "where to start"
  were checked per lesson).
- `docs/course-reference.md` block 3: all four topics map to L1-L2 / L3 / L4 / L5 in reference order. The result
  ("almost every task ends with code that needs no rework") is measured by proxy only. That deviation is justified
  in 8.3 with an upgrade path (12.5); deviations 8.1, 8.2 and 8.4 are justified.
- Research overlap map (research:450-464) against the design: test tampering, Stop hook mechanics, Gloaguen
  numbers, PreToolUse and /clear are referenced, not re-taught (sections 4 and 10). L2 extends 01 L7's linter
  conventions (exit 0/1/2, one line per finding) to code imports with fix text: it builds on 01 L7 rather than
  repeating it.
- Modules 00 and 01: both `module.yaml` outcomes; tasks of 00 L1 (count feedback with cap 10, the precedent
  for L3), 00 L5, 00 L6 and 01 L7; the 01 L7 starter tree, `settings.json`, `Makefile`, `CLAUDE.md` and
  `late_fee.py` (the basis of B1).
- Outcomes O1-O5: every verb is observable, there is no "understands", and the section 6 map gives a check per
  verb. O4's "выбирает" rests on a quiz, which is acceptable for a choice. O3 wording: see non-blocking 1.
- Sequence and concept table (section 4): walked every row against each lesson's theory, quiz and task. Found the
  L3 contour wording and the L4 SOCKS gap (non-blocking 4, 5). L5 after L4 (Jain) and L3 before L4 hold.
- Hands-on 214/315 = 67.9%; each lesson is at least 58% (L4 is lowest at 35/60). Per-part minutes against
  analogues: L2 75 and L3 70 are plausible with plumbing given and fallbacks named. L4 theory is dense
  (non-blocking 6).
- Starters versus the problem each lesson solves: L2 (R05 gone, three silent violations), L3 (`fastjsonx`, red
  import), L4 (leaked token, public base URL) and L5 all make the learner meet the problem. L1 does not
  (non-blocking 8, B1).
- Feedback fairness: L1 binary with no cap and a per-item ambiguous key is unfair (B1). L3 aggregate count, cap
  10, free stage 0 listed in task.md: fair, per the 00 L1 precedent (key fragility in non-blocking 2). L5
  bug-hunt: minFound 6 of 9, with one disagreement absorbed, as in 00/01. The quizzes follow 00/01 conventions.
- Task text versus checks for L1-L5 "Готово, когда": the L2 and L3 mismatches (B2); L1, L4 and L5 match their
  check entries.
- Grading threat model 2.8 is applied as the orchestrator's default. No blocking item rests on a grader
  reverse-engineering attack.
