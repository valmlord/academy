# Issue #21 plan: pipeline v2 (planner phase)

Design: `plans/21-pipeline-v2-design.md` (revision 3.1). Research and Stepan's decisions 1-7: `plans/21-pipeline-v2-research.md`. This file adds nothing to the design; it orders the work and collects the judges' non-blocking notes so the coder does not miss them.

## Bootstrap rules for this issue
- Hooks are disabled locally (`.claude/settings.local.json`, untracked, Stepan's file). Do not touch it.
- The orchestrator keeps the phase log below instead of `pipeline_state.json`.
- `.github/CODEOWNERS` has an unrelated uncommitted change in the working tree; leave it out of every commit.

## Work items
Follow the design's section 7 coder steps in order; each step ends with `bash tests/pipeline/run.sh` green (plus `shellcheck -S error` on changed shell files and `python3 -m py_compile` on changed Python) and one commit referencing `#21`. Every new test row must be watched going red under its mutation from section 2.13 before the step is called done.

## Judges' non-blocking notes for the coder
From the design reviews (all rounds), still to honour in code:
1. B22: keep the test's process cwd at `$WORK`; pass the worktree only through the JSON `cwd` field. Never `cd "$WT"` with empty stdin (the mutation would stay green).
2. Implement resume as one `state.py resume <key|issue> <code_root> <gitdir> <branch>` op inside one transaction (validation first, then park, then restore), not separate park/unpark calls.
3. B18a/B18b: restore the original branch after `git checkout --detach`, or later inits in the same test group hit the detached-HEAD refusal.
4. D5: also assert that a refused resume leaves a stale slot unchanged.
5. Grant validation: reject booleans with `type(x) is int`; a non-list value for `pipeline_init` / `learn_pause` is invalid.
6. Write the PIPE_BUF-free reasoning for single O_APPEND log writes as in the design; open the log with O_NOFOLLOW.
7. CLAUDE.md: add the exact command to delete a parked PIPELINE file next to the grant commands.
8. Step 2 (scaffold-like steps): run `pnpm format` / `pnpm lint` only if a step touches files Biome covers; hook files are shell/Python and are not in Biome's includes.
9. Keep every message, comment, log string and doc in English; Cyrillic check per the design.

## Phase log (bootstrap, hooks off)
| Phase | Result |
|---|---|
| researcher | done, `plans/21-pipeline-v2-research.md` |
| architect | revision 1 -> 3.1 |
| judge_design | round 1: 0/3; round 2: 0/3; round 3: security PASS, architecture FAIL, operations FAIL (B18 only); focused review of 3.1: architecture PASS, operations PASS. Stepan approved rounds 3 and the focused review. |
| planner | this file |
| coder | done, 08bf4ce..56db68c (10 commits); suite 169/169 re-run by the orchestrator; 92/93 mutations red (B19b filter-only green as designed); shellcheck not run locally |
| tester | PASS: 169/169, shellcheck -S error clean (docker), 40 mutations re-run red; minor findings: core guard misses `.claude/hooks` without trailing slash, design wording (status/parked log, absolute paths in logs), pre-existing Cyrillic in feature.yml |
| judge_code | round 1: security FAIL (core dir without trailing slash and `.claude` ancestor pass the shell guard; deleting hooks fails every gate open), architecture FAIL (same; `pipeline-advance.sh` vote path reports success on a failed write; dead `cli` branch in run_hook), operations PASS. Fixes 6eda336..a577d25 (all 6 items), 187/187 re-run by the orchestrator, shellcheck clean. Re-test PASS (187/187, all new rows red under mutation, 14 old mutations red); tester found `rm -rf .claude/*` and `git checkout <ref> -- .claude/hooks` still pass: fixed in 0c52d28, fdd2da9; 200/200 re-run by the orchestrator. Round 2 at fdd2da9: security PASS, architecture PASS, operations PASS (3/3; CI job replayed in ubuntu:24.04, 200/200 in 38 s) |

## Follow-ups from the code review (non-blocking)
All addressed in #23 (`plans/23-pipeline-handback-race-design.md`).
- `op_parked` crashes on a parked file that is valid JSON but not an object; `status` then exits 1.
- `TOKEN_END_OR_SLASH` and `CLAUDE_DIR_TOKEN` define token end differently (`.claude/{hooks,}`, `.claude,` pass); use one `(?![\w./-])` rule.
- `issue.isdigit()` accepts Unicode digits; use `isascii() and isdigit()`.
- ADR-0005 item 7: name write verbs outside the guard's list (`find -delete`, `rsync`, `tar -C`, `git clean`) as residual.
- Header of `bash-code-guard.sh` and design 2.7 still describe `.claude/hooks/` and `git checkout --` only.
- Core-write block message lists the core files even for a stray `.claude` token (`node_modules/.claude`).
- Design R3 L4 (`printf > "/tmp/fake co/.git"`) is blocked for agents; Stepan creates the fake checkout by hand.
- Kill switch reach in worktree sessions; volume of foreign-state log lines.
- Inline gate Python into `lib/`, watchdog duplicating `last_activity`, type annotations for hook libs, design 2.3 vs 2.6 wording.
