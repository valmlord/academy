# #15 judge_design round 3 (design revision 2)

## judge-pedagogy: PASS

Checked: whole design rev 2, both earlier reviews, docs/learning-process.md, learner/profile.md,
learner/journal.md (empty).

- A-D all reflected. B solved better than asked: one range spanning dispatch call and returned result
  (no extra guessable block). C: compaction line in no range, demo asserts it. D: one binding
  constraint per L1 card; L6 shows `"ask": ["WebFetch(domain:*)"]`.
- 19 decoys: each a positive contrast to one clause of the decision rule; honest slack unchanged
  (maxReports 7, maxDecoyHits 1). L4 load: "keeps 60 min" is asserted, expect 65-75.
- 3-attempt cap fair; gap is what happens after closure (permanent not-passed conflicts with
  learning-process.md "повторная попытка при необходимости").
- Count-only cap of 10 generous.
- Section 10 item 10: reject bug-hunt cap of 1; 3 multiple questions in mcp-quiz/cost-quiz acceptable
  but not needed pedagogically.

Work items for the planner (non-blocking):
- E1 (practice-designer, orchestrator): student honest run records L4 time split bug-hunt/plan; if
  > 60 min raise L4 to 70 (module 345) rather than cut decoys; 15k dump as short placeholder.
- E2 (curriculum-architect, 2.5.6 + section 10): after closure, mentor review = Socratic walk through
  missed items, journal entry, re-assessment route not reusing the revealed key; pass recorded as
  `passedVia: mentor-review`, counts toward completion, visible on outcome.
- E3 (same place): mentor offered between failed attempts at hint levels question/direction, never
  anchors or keys; capped command checks suggest mentor after 5 fails.

PASS

## judge-assessment: PASS

All six round-2 items fixed, no regressions; arithmetic rerun with own scripts.
- Key reveal: max 3 scored submissions, reveal closes a failed check as "не пройдено", no attempt 4,
  `afterReveal: true` never counts; format-rejected bug-hunt submissions leak nothing.
- Bug-hunt: 6912 report sets, 64 pass = 1/108 = 0.926% per attempt (2.75% over 3); best other
  allocation 1/216; doubled categories 0.116% / 0.255%; 19 decoys (9+2+8) consistent.
- L1/L3 cap of 10 defined; adaptive figure checked at judge_content when the key exists.
- Demo 2.4(4) base copies correct; hook probes Edit/Write only.
- Quiz rates (multiple at 1/10): 0.121%/0.363% (6q), 0.438%/1.307% (5q), 0.141%/0.422% (8q).
  Adaptive simulation over 3 attempts: 0.40% / 1.47% / 0.45%.
- Registration regex tested; non-blocking items applied. `pnpm content:validate` exit 0.

Ruling on cumulative rate over the cap: acceptable, not blocking (bar is per attempt; quizzes are not
the only evidence for L2/L3). Advises against bug-hunt cap of 1. If Stepan wants cumulative < 1%:
quiz option B (0.64%), bug-hunt minFound 6/6 (~0.35%) or 2 submissions (1.84%).

Work items for authoring (practice-designer, checked at judge_content):
1. Accept `python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/protect_generated.py"` (whole path quoted) or
   list accepted registration forms verbatim in task.md.
2. task.md states the malformed-input requirement (non-JSON stdin / missing file_path blocks: exit 2
   or `onFailure: "block"`).
3. 2.5.6: a closed check cannot be reopened by a lesson/workspace reset, only by the mentor.

PASS

## judge-accuracy: FAIL (owner: curriculum-architect)

Verified correct (memory, effort, model-config pages live; permissions, permission-modes,
settings-reference, hooks, hooks-guide, tools-reference): round-2 conditions 1-6 and the WebFetch
form; new Edit/Write `tool_input` fields; shebang + exec bit rule.

Blocking:
1. design.md:786-797, 817-826, 1066-1069: the registration regex ignores `args` and is wrong both
   ways. It rejects the docs' preferred exec form (`"command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/
   protect_generated.py", "args": []`, or `"command": "python3", "args": ["${CLAUDE_PROJECT_DIR}/..."]`),
   accepts a broken exec-form registration (quoted `"$CLAUDE_PROJECT_DIR"` with `args` present: no shell,
   fails open) and accepts relative paths. Fix: branch on `args`; shell form = quoted placeholder path
   with optional `python3 [-I]` prefix; exec form = the two shapes above; quoted spelling with `args`
   fails; drop relative forms; shebang/exec bit when no python3; L6 theory shows exec form as preferred;
   demo: exec-form reference passes, quoted command with `args: []` fails.
2. design.md:624-625, 1093: `instructionFiles` has four values, add `claude-md` ("CLAUDE.md files only").

Non-blocking: line 332 "xhigh only for long agentic runs" is a simplification; per-model guidance:
Fable 5.1 steps up to xhigh/max for capability-sensitive agentic and coding work, Sonnet/Haiku 5.5 only
where evals show gain. Allow `xhigh` with `frontier` on the quality-bound refactor card.

FAIL
