# Issue #23 plan: concurrent handback votes and v2 follow-ups (planner phase)

Design: `plans/23-pipeline-handback-race-design.md` (revision 3). Research: `plans/23-pipeline-handback-race-research.md`.
This file adds nothing to the design; it orders the work and collects the judges' non-blocking notes so the coder
does not miss them.

## Rules for this issue
- Follow the design's section 10.3 steps in order, each through the 10.1 live install procedure (P1-P7). Never
  edit a live `.claude/hooks/**` file in place; the only exception is the 10.2 row "S1 blocked, S3 succeeds".
- A smoke failure means: stop at once and follow 10.2. A lockout means: stop and report; Stepan runs 11.2.
- `.github/CODEOWNERS` has an unrelated uncommitted change in the working tree; leave it out of every commit.
- As in #21, each step ends with one commit by the coder (Conventional Commits, `Refs #23`, no AI attribution,
  never `.github/CODEOWNERS`), so P1 of the next step exports a known tree.
- Every new test row must be watched going red under its mutation (design 3.3) before the step is called done.

## Judges' non-blocking notes (design round 3)
1. 3.2 T15d mutation (a): dropping the `stop)` branch lands in `pl_fail`'s `*) exit 0` catch-all, so the result is
   rc 0 with empty stderr, not rc 2. The row goes red only through its stderr assertions (`not blocking`,
   `python3 not found or unusable`); keep those assertions and record the observed mechanism.
2. 3.3 T18 mechanism check, F16, F19: `/usr/bin/python3` 3.9.6 on this Mac has `sys.dont_write_bytecode=True`
   and the live `lib/` has no `__pycache__`. Run the "old chmod variant stays green" check in `ubuntu:24.04`
   (non-root) or on python3.12, where the cache effect is real. T18 (move aside) and the P5 `touch` stay as
   designed.
3. P6: after installing `phase-complete.sh` in step 1, add a smoke that pipes a Stop JSON with
   `stop_hook_active: true` into it and expects rc 0.
4. Section 12 and 11.2 step 0: the `lsof -c claude -a -d cwd` check passes only after the #15 session quits (an
   idle session keeps its cwd). Verified by the orchestrator: `lsof` lists Claude Code sessions on this Mac.
5. A Stop hook's stderr at exit 0 is not shown to the model: in a lockout the orchestrator learns it from the
   PreToolUse gates' rc 2 messages.
6. 2.8: if 10a narrows JSON through `pl_jsonshape`, `cfg` gains a lib import; name that edge in 2.8 (harmless:
   `pl_jsonshape` imports nothing from `lib/`).

## Before step 1 (Stepan)
- The #15 worktree session must not run hooks during installs (11.2 step 0).

## Phase log
| Phase | Result |
|---|---|
| researcher | done; root cause reproduced (BSD mktemp with a `.py` suffix), 14 follow-ups confirmed |
| architect | revision 1 -> 3 |
| judge_design | round 1: 0/3; round 2: 0/3; round 3 (approved by Stepan): security PASS, architecture PASS, operations PASS |
| planner | this file |
