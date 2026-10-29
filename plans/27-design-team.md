# Issue #27 plan: design (UX/UI) agent team and DESIGN tier (planner phase)

Design: `plans/27-design-team-design.md` (revision 2). Research: `plans/27-design-team-research.md`.
This file adds nothing to the design; it orders the work and collects the judges' round-2 conditions and
non-blocking notes so the coder does not miss them.

## Rules for this issue
- Follow the design's section 9.3 steps 1-9 in order, each core step (2-6) through the 9.1 live install procedure
  (P1-P7). Never edit a live `.claude/hooks/**` file or `.claude/pipeline.json` in place; the only exception is the
  9.2 row "S1 blocked, S3 succeeds".
- A smoke failure means: stop at once and follow 9.2. A lockout means: stop and report; Stepan uses the kill switch.
- `.github/CODEOWNERS` has Stepan's uncommitted change in the working tree; leave it out of every commit
  (`git add <explicit paths>`, never `-A`). Step 10 (plans and feedback) is the orchestrator's, after compound.
- Each step ends with one commit by the coder (Conventional Commits, body ends `Refs #27`, no AI attribution).
- Every new test row (run.sh T/D/S rows and validator unit tests) is watched going red under its mutation before
  the step is called done; report the observed red for each.
- When a fix contradicts a design or ADR statement, update that statement in the same step.

## Binding conditions from the judges (round 2)
1. Security, step 7: protocol-relative URLs in later `srcset`/`imagesrcset` candidates are missed by the
   `["'`(=]\s*//` regex. Split those attribute values on commas and flag any candidate starting with `//` or a
   scheme; do not add `,` to the global character class (JS `f(a, // comment` false positive). Add a
   second-candidate fixture to `test_protocol_relative_srcset_is_an_error`.
2. Security, steps 3 and 6: S1a and `agent_index` must also fail on any `.md` at the top level of
   `.claude/agents/`, in a nested directory, or in a directory whose name does not match `[a-z0-9-]+` (files starting
   with `_` excepted), because Claude Code registers agents recursively. S1a is the CI check; `agent_index` skips
   non-directories at the top level (operations note 6) rather than crashing on them.

## Non-blocking notes to apply (cheap, recommended)
3. Architecture 1, step 7: ERROR when a scanned prototype `--x:` redeclares a `tokens.css` `:root`/`.dark` name;
   one test.
4. Architecture 2, step 7: run the flow checks (2.8 step 7) independently of `tokens.css`, so a DESIGN
   `judge_design` round gets computed flow checks before tokens exist. Write in 2.3 / CLAUDE.md phase table that the
   orchestrator runs the validator and passes its output to the design judges.
5. Architecture 3, step 7: tests for missing `tokens.css` exits 1, unterminated comment exits 2, translucent surface
   is an ERROR, short hex `#rgb` expands, duplicate step id, a step with no heading.
6. Architecture 4, step 3/4: add an `Explore` subagent_type assertion to T19 (broken tree blocks it, documented).
7. Architecture 5: recovery row 5 reads "after any hook step: restore the file installed last". Operations 5: add a
   row "P7 red on the live tree after P4 green: restore the file installed last".
8. Architecture 6: page-scoped `--x` in a `style=""` attribute counts only for that page (or document the false
   negative in the validator README).
9. Architecture 7, step 1: the ui-designer checklist says current shadcn `globals.css` puts `@theme inline` before
   `:root`, so the copy is reordered to `:root`, `.dark`, `@theme inline`; soften "exactly the shape" in 1.1 item 4.
10. Security pre-existing, step 9: `.claude/feedback/agent_roles_mandatory.md:10,13,21` uses
    `.claude/agents/judge-security.md` without the team dir; fix to `.claude/agents/dev/...`.
11. Operations 1-4, docs only (design 11.2): run `pipeline-advance.sh parked` with the worktree invocation before
    `git worktree remove`; name the bring-up step-2 precondition; stash pop by `"stash^{/codeowners-27}"`; give the
    `/design/` CODEOWNERS line as an exact command.

## Before step 2 (Stepan)
- 11.1: no Claude Code session open in `.claude/worktrees/keen-blackwell-7013a8` during steps 2-6.

## Before `pr` (Stepan)
- 11.2: the CODEOWNERS path (preferred: own PR, then bring-up merge; alternative: stash). The orchestrator stops and
  asks.

## Phase log
| Phase | Result |
|---|---|
| researcher | done; two hardcoded team spots in hookio.py, phase windows keyed by phase name |
| architect | revision 1 -> 2 |
| judge_design | round 1: 0/3 (team from prompt claim; tokens contract; thresholds; CODEOWNERS path); round 2: 3/3 PASS |
| coder | steps 1-9, one commit each (6d2de6a..af78873); live installs without a recovery |
| tester | 7/7 PASS; run.sh 268/0 live and on a HEAD export; 44 validator tests on 3.9 and 3.12 |
| judge_code | round 1: 2/3 (validator lines parsed as a verdict; symmetry test could not fail); fix 10f643e, a0cbba9; re-test 6/6; round 2: 3/3 PASS |
| compound | two orchestrator lessons (pasted tool output vs VERDICT_RE; plan the unrelated uncommitted file) |
