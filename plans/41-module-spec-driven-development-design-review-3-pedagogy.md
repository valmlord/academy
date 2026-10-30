# #41 design review, round 3: judge-pedagogy

Design: `plans/41-module-spec-driven-development-design.md` (revision 3, 1493 lines), read in full.
Verdict: PASS, no blocking items. Non-blocking items below go to the lesson-author (task.md wording) unless
marked for the architect.

## What I checked
- Inputs loaded: `judge_mistakes.md`, `curriculum-architect_mistakes.md` (headings, incl. the two round-2
  entries), `learner/journal.md` (still empty, so no journal gap to address), my round-2 report.
- B1 (L1 time): fixed.
  - L1 entry (design:588-595): 80 min, ~55 hands-on, per-part minutes theory 25 (core ~20, Справка ~5),
    tests 15, fix 5, hook and registration 25, iterate 10; 15+5+25+10 = 55, 25+55 = 80. task.md states them.
  - Section 7 totals recomputed: 80+50+50+70+65+45+60 = 420; 55+30+30+50+45+33+40 = 283; 283/420 = 67.38%.
    Per lesson: L1 68.75%, L2 60, L3 60, L4 71.4, L5 69.2, L6 73.3, L7 66.7; all >= 60%. Section 0 and
    item 11.6 carry the same figures.
  - Analogue budgets re-read from the shipped files, not from the design: 00 L2 task.md:3 60/40, 00 L4
    70/50 (25-30 transcript), 00 L5 50/30, 00 L6 80/50; `lesson.yaml` estimatedMinutes match. Every row of
    the section 7 table cites a real budget, and each row's per-part minutes sum to its lesson figures
    (L2 20+30, L3 20+30, L4 20+50, L5 20+45, L6 12+33, L7 20+40).
  - Fallbacks: L5 (T-05 optional) kept; L7 added (starter ships tokenizer and fence scanner); L1 resized
    instead. The sizing rule is now applied to every lesson, as the round-2 mistakes entry asks.
- N1-N7 of round 2, each verified at its place:
  - N1: L1 imports "stdlib and `late_fee`" in both 2.6 (design:208-210) and task.md item 1; "every failing
    test name" now graded (each red probe has two failing methods plus an import error, design:403-405);
    L7 parse-error root with exit 2 (design:1120-1121); L5 item 1 import rule enforced by construction and
    said so; L5 item 5 spells the four rules out in words. Applied. Residual slip: N-a below.
  - N2: L6 transcript minutes separate in section 7. Applied (the 11.3 recount note lives only in 15, nit).
  - N3: rows for `to-spec`/`to-tickets` (L4), `req_NN` labels (L5), interface domain (L1). Applied.
  - N4: L5 task.md pointer line to L6 (design:995-996). Applied.
  - N5: optional grilling last in L4 advice with the D1-D5 comparison (design:941-946). Applied.
  - N6: L1 "Что в рабочей папке" (design:629-635). Applied; content checked below.
  - N7: reconciliation inside the block-routes paragraph, naming PreToolUse (00 L6) and Stop
    (design:602-605). Applied.
- Rebuilt L1 probe set (design:383-407, 671-721), from the learner's side:
  - Is the hook still learnable in 25 + 10 min? Yes. Random file and method names, computed fixtures and
    shuffled order only defeat non-running hooks; an honest hook that runs the pinned command and forwards
    the whole unittest output inside a JSON `reason` (exit 0) satisfies every block row, because the
    output carries every `FAIL:`/`ERROR:` id, `tests.test_<b>` and `Ran 0 tests`. The FileNotFoundError on
    every red probe punishes only the raw-stderr-on-exit-2 form, which theory teaches as trap (ii). The
    six payload classes cost an honest hook nothing if it reads only `stop_hook_active` with a default.
    Both corners walked: green probe (all three files pass, allow with exit 0) and red probe (assertion,
    fixture, import at once, block with all names); zero-tests on 3.11 (exit 0, text needed) and 3.12
    (exit 5).
  - task.md "Готово, когда" item 5 vs the 20 probes (2.9): red/green/zero/active/missing key/non-JSON
    stdin/20 s/stdout forms/`continue: false`/missing-file phrase all named. Two gaps, N-b and N-c.
- L1 "Что в рабочей папке": correct and at the right level. `-I` implies ignoring `PYTHON*` variables, so
  `PYTHONPATH=src` is dropped and both test modules fail to import ("Ran 2 tests ... FAILED (errors=2)"
  matches the two modules in the workspace); the hook itself may run under `-I` (E3, and the probe runs it
  that way) while its child must not. This is the small Linux lesson the profile needs, placed before the
  learner writes the hook. Suggestion N-d.
- L7 resolver in task.md (design:321-323, 1098-1103): five bullets verbatim plus "the linter reads the
  glossary under `<root>`"; leak guard holds (no `checks/` substring in bullets 1-5). One fact of the
  dropped sixth bullet is lost: N-e.
- Sequence: no concept moved; L1 still introduces the interface domain in task.md before L5/L7 use it.
  Theory openings unchanged (concrete problems). Reference deviations 8.1-8.6 unchanged.

## Blocking
None.

## Non-blocking
- N-a (lesson-author/architect). L7 task.md item 1 defines exit 2 for three parse errors and usage; only
  "no `docs/spec.md`" is graded. Either add two cheap roots (missing `GLOSSARY-MAP.md`, a linked context
  file missing) or keep the wording as "for example" so 2.9 holds.
- N-b (lesson-author). L1 items 4-5 say "per 2.8 (a)", "accepted command forms", "allowed keys", "only the
  2.8 keys": the learner never sees section 2.8. task.md must spell them out: the stdout keys `decision`,
  `reason`, `continue`, `systemMessage`, `suppressOutput`; `decision` only `"block"` and then a non-empty
  `reason`; the registration keys and the rejected ones with their one-line reasons; the E1-E3 forms.
- N-c (lesson-author). The check accepts an allow only with exit 0 (rule 5, design:435-436); item 5 says
  only "on green allows". Add "и завершается с кодом 0".
- N-d (lesson-author). In "Как работать (совет)" for L1: forwarding the whole unittest output in `reason`
  is enough, and cutting it to a tail can drop the first failing names. The prototype's reference hook uses
  a "stderr tail" (design:525); the demo must show its tail keeps every name on the largest red P.
- N-e (lesson-author). L7 task.md must keep the substance of the sixth resolver bullet without the
  directory: `_Avoid_` words are the union over every context file linked from `GLOSSARY-MAP.md` under
  `<root>`. Without "union" a learner may scan billing's words only (the graded C6 roots happen to use
  billing words, so this would pass the check and still be a wrong linter).
- N-f (architect). Stop-hook probe failure messages are not specified. Iteration time (10 min) depends on
  them: the message should name the stdin class, the state (red/green/zero/active), the expected outcome
  and what was observed (allow vs block, exit code, which token kind was missing), never the probe's
  position. Random names are safe to print.
- N-g (nits). L6 theory is "~10 min" in the lesson entry (design:1043) and 12 in section 7; L5 "five tasks
  ~6 each, 32" (5 x 6 = 30). Align.
