# #15 plan: course/ai-for-developers/00-introduction "Введение в разработку с ИИ"

Tier MODULE. Source of truth for content and checks: `plans/15-module-introduction-design.md`
(revision 4, judge_design 3/3 PASS in round 5). This plan only splits the work and carries the
non-blocking judge items from rounds 2-5 that the design does not contain yet. Where this plan and the
design disagree, the later judge item listed here wins; report any conflict instead of guessing.

Judge reports: `plans/15-module-introduction-design-review-{1..5}.md`.

## Roles and files

| Role | Writes |
|------|--------|
| lesson-author | `module.yaml`, every `lesson.yaml`, `theory.md`, `task.md` |
| practice-designer | `quiz.yaml`, `starter/`, `checks/` (scripts, `bugs.yaml`, `data/`, `data/reserve/`, reference solutions), the demo record `plans/15-module-introduction-demo.md` |

Both read the whole design. They work in parallel; the lesson-author owns `lesson.yaml` check entries
but takes check ids, kinds and `run` lines from the practice-designer's section of the design verbatim.
Task text must name only what the check verifies (no hidden requirements) and must not contain the
substring `checks/` (leak guard).

## Module level (lesson-author)
- M1. `course/ai-for-developers/00-introduction/module.yaml`: outcomes O1-O6 verbatim from design
  section 1, the 6 lessons in design order, status `ready` only after validate is green and the student
  run is done.
- M2. Times per design section 6 (335 min total); adjust L4 only per item E1 below.

## Per lesson

### L1 `01-models-and-effort` (design section 4 L1)
- lesson-author: theory, task; P2: per-model effort guidance as one dated, sourced table framed as
  "check this page before you choose", not prose to memorize (accuracy round 4: Fable 5.1 steps up to
  xhigh/max for capability-sensitive agentic and coding work; Sonnet 5.5 and Haiku 5.5 only where evals
  show a gain; Opus 5.5 effort sweep).
- practice-designer: quiz.yaml, `model-routing` command check with the 6 cards; each card at most 12 of
  200 accepted combinations; refactor card accepts xhigh with frontier; demo 2.4 (5) records the
  adaptive-attack figure for the real key (< 1% within 10 submissions).
- reserve: 3 L1 cards, pass bar 3/3 (W3).

### L2 `02-agent-loop`
- lesson-author: theory incl. pedagogy A (local MCP servers run arbitrary code, tool descriptions are
  untrusted); task.
- practice-designer: starter harness, `harness-behaviour` check, mcp-quiz; reserve quiz >= 6 questions,
  same passScore.

### L3 `03-cost-economics`
- practice-designer: `cost-estimate` check (cap 10, names out-of-tolerance fields), cost-quiz; reserve:
  one session log, same tolerance.

### L4 `04-context-and-planning`
- practice-designer: transcript (~440 lines, 6 bugs, 19 decoys), `bugs.yaml`, `plan-structure` check,
  plan rubric; bug 5 one range from dispatch to end of result; the 15k-token dump as a short placeholder
  (E1); compaction line in no range.
- lesson-author: task.md states the anchor rule and that auto-compaction is an event, never an anchor (C).
- reserve: a second authored transcript excerpt with >= 3 mistakes, its own key, explicit `minFound`
  and >= 1 decoy per planted category (W3).
- E1: the student honest run records L4 time split bug-hunt / plan; if over 60 min, raise L4 to 70
  (module 345), do not cut decoys.

### L5 `05-memory-agents-md`
- lesson-author: P3: place the `instructionFiles` table (four values: `claude-md-or-agents-md` default,
  `claude-md-and-agents-md`, `claude-md`, `managed-only`) after managed scope, auto memory,
  `.claude/rules/` and path-scoped rules are introduced.
- practice-designer: AGENTS.md structure check, rubric, memory-precedence-quiz (scenarios fix "default
  settings"); keyword-stuffed and inverted-line demo.

### L6 `06-permissions-security`
- lesson-author, W1/P1: task.md steps show only exec form E1, the minimal hook object
  `{type, command, args}` and "the hook is one file, stdlib only". After the steps, a reference section
  holds all accepted and rejected registration forms, the key allowlist, rejected keys and the
  `disableAllHooks` rule, each with a one-line reason (why quotes matter: sh splits a path with a space).
  task.md states the malformed-input requirement (non-JSON stdin or missing `tool_input.file_path`
  blocks: exit 2 or `onFailure: "block"`).
- lesson-author, accuracy round 5: do not state a single default hook shell as fact (docs say both
  `sh -c` and bash).
- practice-designer, accuracy round 5: in the demo and wrong-solution lists, `once: true` and
  `shell: "bash"` are "rejected as outside the exercise", not fail-open; use a truly unknown key
  (`"foo": 1`) as the unknown-key example; `timeout: 1` "may time out and then fail open".
- practice-designer, assessment round 5:
  - A2: strict JSON in `verify_hook.py` and `verify_permissions.py`: `parse_constant` raises on
    `Infinity`, `-Infinity`, `NaN` (format error); add to wrong solutions.
  - A3: fail when `disableAllHooks` is present with any value other than `false` in
    `.claude/settings.json` or `.claude/settings.local.json`; the Makefile static check fails on
    `disableAllHooks` or `--settings` in a `claude` invocation.
  - A4: ground all 12 shell spellings and the whitespace cases under both `sh -c` and `bash -c`.
  - A5: shell-form pattern via `re.fullmatch` on the string trimmed of ASCII space, tab, LF only.
- reserve: security-quiz >= 6 questions, same passScore.

## Cross-cutting (practice-designer, recorded in design 2.4 / 2.5 as requirements for #08/#10/#11)
- A1: `checks/data/reserve/` is never on the command-check mount: strip it from `$G` like `reference/`;
  demo 2.4 (4d) asserts `$ACADEMY_CHECKS_DIR/data/reserve` does not exist. Mentor "lesson materials" are
  theory.md, task.md and starter/ only, never `checks/` or the quiz.yaml key.
- W2 (mentor scope, platform requirement #11, write into the demo record and the PR as a flagged item for
  Stepan): (a) the "never imply which item is wrong" rule covers keyed, enumerable items (quiz questions,
  bug-hunt reports, L1 cards, L3 enum fields); for code/artifact checks the mentor may point at the
  learner's own code at direction level within shown feedback; (b) after a pass the mentor may use the
  key and per-item results; (c) asked for "скелет"/"скажи прямо" before closure, the mentor says those
  levels open once the check is closed. This is an exception to `docs/learning-process.md` section 3.
- Every reserve file states its pass bar (W3).
- Demo runs use Python 3.10+ (`/opt/homebrew/bin/python3.12` first on PATH; `/usr/bin/python3` is 3.9.6);
  record `python3 --version`.
- Every command check: one recorded run fails on the empty starter, one passes on the reference;
  every attacker listed in the design is run and recorded with its result.

## Open decision for Stepan (not blocking, recorded in the PR)
- Cumulative guess rate over 3 attempts: 1.31% for mcp-quiz and cost-quiz, 2.75% for the bug-hunt
  (per attempt all < 1%). Judges recommend keeping as is; options are in design section 10 item 10.

## Done when
- `pnpm content:validate` green; demo record complete; student honest and cheater runs reported, no
  cheat passes; judge_content 3/3 PASS.
