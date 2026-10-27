# Issue #21 research findings (pipeline v2, researcher phase)

Verbatim in substance from the researcher. Scope table A-G: `gh issue view 21 --comments`.
Claude Code 2.1.308 (transcript) / 2.1.267 (CLI on PATH). Docs read 2026-10-27: code.claude.com/docs/en/hooks.md, worktrees.md. No repo files written by the researcher.

## A. Judge votes and the unexplained 12:15 failure

Verified:
- Live main-checkout state: PROJECT #1 at `judge_design`, no `judge_votes`, mtime 10:16:10. No hook wrote it since `judge_design` began: every round failed to record, 10:18-10:47 (pre-fix) and 12:15 (post-fix).
- The fix was on disk before the 12:15 judges spawned (5ad27f4 at 12:13:07; `grep -c _block_text` = 2 at 12:13:32; spawns 12:13:55-12:14:03; handbacks 12:15:09.8 / 12:15:11.9 / 12:15:12.0).
- Replaying the three 12:15 transcripts through current `hookio.py judge_vote` (no `last_assistant_message`, `agent_type=general-purpose`) yields `architecture|PASS`, `security|PASS`, `operations|PASS`.
- All judges ran as `agentType: general-purpose` (subagents/*.meta.json): `agent_type` never identifies the role; role comes only from the transcript's first user record.
- Hook scripts are NOT snapshotted: judge-vote.sh edited 12:19:28, diag line at 12:19:31 in the same session. Docs hooks.md:716: direct edits are picked up by the file watcher.
- Live SubagentStop payload (diag log): session_id, transcript_path (main), cwd, scratchpad_dir, prompt_id, permission_mode, agent_id, agent_type, effort, hook_event_name, stop_hook_active, agent_transcript_path, background_tasks, session_crons. No `last_assistant_message`. `background_tasks` lists the stopping agent itself as `status: "running"`.

Candidate causes for 12:15:
1. Strongest: transcript not flushed at hook time. Docs: the transcript "is written asynchronously and may lag ... may not yet include the current turn's most recent messages when a hook fires". Without `last_assistant_message`, the verdict comes only from `agent_transcript_path`; if the SubagentHandback line was not on disk yet -> UNKNOWN -> silent exit 0 (judge-vote.sh:16). The 12:19 probe does not disprove this (not a judge, `parsed=|`). JSONL timestamps are record-creation, not flush, times. Verifiable by logging transcript line count + presence of SubagentHandback at hook time.
2. SubagentStop did not fire for those three agents (it did fire for the probe). Not checkable for 12:15 (no `~/.claude/debug`, silent success leaves no trace).
3. Concurrency in pipeline-advance.sh: not the cause (nothing written), but a real risk: only the vote path locks (184-203); `write_state`, `set_artifact`, `append_history` (39-76) are unlocked read-modify-write; on lock timeout the lock is deleted and the write proceeds without holding it (190-192).
4. Errors swallowed: `2>/dev/null` (judge-vote.sh:12) and silent `exit 0` on every early path (10, 15, 16).

More reliable source (verified that it fires): docs hooks.md SubagentStop section: on v2.1.271+ the report is the SubagentHandback call's `message`, "which a PreToolUse or PostToolUse hook matched on SubagentHandback receives as tool_input.message". Judge transcript a3e68aae... has an attachment `hook_success` with `hookName: "PreToolUse:SubagentHandback"` (watchdog `*` matcher), so PreToolUse fires on SubagentHandback inside the judge; no transcript-flush dependency. Role still needs the spawn prompt: read the subagent transcript's first user record (written at spawn, no flush race), path `<dirname(transcript_path)>/<session_id>/subagents/agent-<agent_id>.jsonl` (verified layout), or map agentId -> prompt from the PostToolUse(Agent) `async_launched` response (docs: carries agentId and prompt). Could not verify which `transcript_path` a PreToolUse inside a subagent receives.

## B. Every place that computes the project/state directory

| File:line | Today | Controls |
|---|---|---|
| settings.json:9,18,27,36,47,57,67 | `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/X.sh"` | which copy of the scripts runs: always main |
| bash-code-guard.sh:7 | `DIR=${CLAUDE_PROJECT_DIR:-$(pwd)}` | :8 cfg, :10/:12 hookio, :23 STATE_FILE |
| judge-count.sh:6 | same | :7 STATE, :10/:13 hookio, :20 `$DIR/.claude/hooks/pipeline-advance.sh` |
| judge-vote.sh:8 | same | :9 STATE, :12 hookio, :19 pipeline-advance |
| phase-complete.sh:9 | same | :10 cfg, :12 STATE, :15 hookio, :61 `cd "$DIR"` for git status, :66 branch, :72 rm state |
| phase-gate.sh:6 | same | :7 cfg, :9/:12 hookio, :15 STATE |
| pipeline-watchdog.sh:5-7 | SCRIPT_DIR from $0; DIR from env | :7 STATE from DIR; :39 cfg from SCRIPT_DIR; :42 MARKER `${TMPDIR}/pipeline_watchdog_sent` global across checkouts/sessions |
| require-pipeline.sh:9 | same | :10 cfg, :12/:15/:16 hookio, :17 REL = relpath(file, DIR), :26 STATE, :51 `$DIR/.claude/pipeline.json` |
| pipeline-advance.sh:18-22 | SCRIPT_DIR from $0; STATE=$SCRIPT_DIR/../pipeline_state.json; REPO_DIR=$SCRIPT_DIR/../.. | state; `git -C $REPO_DIR` at :135 (branch_at_init), :226, :232, :235 (PR gate) |
| lib/cfg.py:18-19 | pipeline.json relative to cfg.py | always the pipeline.json next to the script that ran |
| lib/hookio.py:26-27 | `CLAUDE_PROJECT_DIR or getcwd()` | :33 agents dir, :71 pipeline.json (judge keys) |
| tests/pipeline/run.sh:16 | `export CLAUDE_PROJECT_DIR=$WORK` | no test sends `cwd` |

Invocation: the orchestrator runs `bash .claude/hooks/pipeline-advance.sh` relative to its tool cwd (in a worktree: the worktree's copy and state); hooks run `$DIR/.claude/hooks/pipeline-advance.sh` (main's copy and state). Verified in the #15 transcript: at 05:09:02 main state = PROJECT/architect, worktree state = MODULE/architect; hooks only ever saw main.

Verified: `git -C <worktree> rev-parse --show-toplevel` returns the worktree root (also from a subdirectory); `--git-common-dir` returns main `.git`; outside git exits 128, no output (fallback needed). Docs hooks.md:595-598: `CLAUDE_PROJECT_DIR` "stays put"; `cwd` "is the worktree root after Claude enters a worktree, and the new directory after Claude runs cd". `cwd` is a common input field on every event (PreToolUse, PostToolUse, Stop, SubagentStop), confirmed live for SubagentStop.

New finding: require-pipeline is bypassed for any file in a nested worktree. Worktrees live under `.claude/worktrees/`, so REL = `.claude/worktrees/<n>/...`, matching the `.claude/*` always-writable rule (require-pipeline.sh:39) and never equal to `protected_files`. Verified: writing `<worktree>/.claude/pipeline_state.json` through the hook returns rc=0.

Risks:
1. `cwd` follows `cd`: a Bash call that cds into a temp git repo could make later hooks resolve to that repo. Partly mitigated by the Bash tool resetting cwd after a command; whether PreToolUse's `cwd` reflects the pre-reset dir: could not verify.
2. Version skew: scripts always come from main (settings.json); cfg.py reads the pipeline.json next to the script; the resolved checkout may run different hooks (the #15 worktree is at 5c4d853, pre-fix). Decide whether config, agents and pipeline-advance come from the script's checkout or the resolved one.
3. Every hook reads stdin once (`INPUT=$(cat)`) except judge-vote.sh (hookio reads stdin directly, :12); resolving `cwd` there needs stdin buffered first.

## C. init with an existing state
- pipeline-advance.sh:123-134: state with phase != done and age (now - session_ts) < state_ttl_hours (8) -> init exit 1; otherwise "Auto-resetting stale state" and overwrite.
- `branch_at_init` from `git -C $REPO_DIR rev-parse --abbrev-ref HEAD` (:135), written at :140. Nothing reads it. Detached HEAD stores `HEAD`; empty on error.
- Observed in #15: at 04:57:49 the new worktree held a `.claude/pipeline_state.json` with PROJECT #1 at researcher, `branch_at_init: feat/1-web-bootstrap`; worktree branch `claude/15-module-introduction-7cf70d`; `init MODULE 15` failed at 04:58:23, succeeded at 04:59:30. How it was copied: could not verify (no `.worktreeinclude`; docs say only gitignored files matching it are copied; desktop app behaviour unknown). The worktree state later disappeared (05:09:29 "No active pipeline"): unexplained.
- Design input: branch rename after init (`git branch -m`) and detached HEAD both affect a branch comparison.

## D. pause/resume and a PIPELINE tier
- pipeline.json: tiers are data (:6-122; new tier needs team, requires_issue, phases, judges). `coder.md` window applies to any tier with those phases. `pipeline_core_files` = `.claude/pipeline.json`, `.claude/settings.json`, `.claude/hooks/`. `human_wait_phases` = `["learner"]`.
- cfg.py: no hardcoded tier names; per-tier booleans via `tier_flag`, top-level keys via `get`.
- require-pipeline.sh:34-45: core files writable in ANY active tier; LEARN also can (`learn_tier_editable_paths` includes `.claude/`, :47-50).
- bash-code-guard.sh: blocks only the string `pipeline_state` (:14) and `JUDGE_HOOK_CALLER` (:18); shell writes to `.claude/hooks/` or pipeline.json are unguarded in every tier.
- Gates a pause must handle: phase-gate.sh (role windows :41-50; judges only in judge_* :58-61), require-pipeline.sh (ACTIVE = tier set and phase != done, :31), phase-complete.sh (already has a human-wait early allow :19-24), pipeline-watchdog.sh, pipeline-advance.sh (init blocking; transitions; vote branch :165 records only when CURRENT == PHASE).
- Docs/templates listing tiers: `pipeline/state_machine.md:15-16` ("One active pipeline at a time"), CLAUDE.md, `.github/pull_request_template.md:7`, `.github/labels.yml:9-14`, `.github/ISSUE_TEMPLATE/feature.yml:24`.

## E. phase-complete.sh
- Reads stdin once (:11); uses only `stop_hook_active` (:15). No state -> allow (:13); human-wait -> allow (:19-24); else blocks once per turn (`block()` :26-33) when phase != done, any judge round lacks unanimous PASS (:37-56), notify not run (:58-59), dirty tree (:61-62), protected branch (:64-70). On success `rm` state (:72).
- Docs hooks.md:2734-2800: Stop input has `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons`; task entries `id, type (shell|subagent|monitor|workflow|teammate|cloud session|MCP task), status, description` + type-specific fields; arrays "present when the task registry is reachable" (may be absent). 8-consecutive-continuation cap.
- Live Stop payload: could not verify (only SubagentStop logged).
- Risks: a long-lived shell task or cron would allow stop forever if any entry counts: filter `type == subagent` and `status == running`. SubagentStop's own list shows the stopping agent as running.

## F. tests/pipeline/run.sh
- Copy step `cp -r "$SRC/.claude" "$WORK/.claude"` (:10) copies `.claude/worktrees/*` and `settings.local.json`; only the top-level state file is removed (:12), not the `.lock`. `.claude/worktrees/` is ignored only via `.git/info/exclude`, so CI never has it.
- Mechanism (reproduced): the copied worktree has a `.git` FILE pointing at the real repo's `.git/worktrees/15-...`; `git add -A` (:15) adds it as an embedded repo; `git status --porcelain` reports ` M .claude/worktrees/15-...`; `pr skip` fails the dirty-tree check (pipeline-advance.sh:232); cascade into notify/done/stop/cleanup; leftover state breaks LEARN init and checks -> exactly the 10 failures. Side risk: the test's git status reaches into the real repo's worktree gitdir.
- Coverage today: no-pipeline, init, ordering, judges (leading-role attribution, pass-through prose, transcript fallback, PostToolUse fallback, SubagentHandback), PR gate, LEARN, MODULE, off-tier vote.
- Gaps: `cwd` in hook JSON; linked worktree with its own state; nested `.claude/worktrees` path in require-pipeline; fallback when cwd is not a git repo; init with foreign `branch_at_init`; pause/resume across every gate; PIPELINE tier editing core vs other tiers; Stop with background_tasks running/empty/absent/non-subagent; end-to-end judge vote with the exact live SubagentStop shape (no `last_assistant_message`, `agent_type=general-purpose`, real-shaped transcript with attachment records and first user record as prompt); concurrent votes; watchdog per checkout.
- CI (ci.yml:47-55): `shellcheck -S error .claude/hooks/*.sh tests/pipeline/run.sh`, then run.sh on ubuntu-24.04; `lib/*.py` not linted.

## G. Architect and plans/
- architect.md frontmatter `tools: Read, Glob, Grep` (:4-7); body "You do NOT write code" (:3, :13). Frontmatter applies only when spawned as `subagent_type: architect`; every architect run today was general-purpose (has Write). No architect transcript tried a Write; designs came via SubagentHandback and the orchestrator wrote the plan file. The blocker is role text and habit, not a tool or hook.
- require-pipeline.sh:38-40: `plans/*` always writable by anyone. No per-role write gating exists or is possible today (PreToolUse inside a subagent has agent_id/agent_type, but agent_type is general-purpose; role only from the subagent transcript).

## Constraints
- Scripts that run are always main's (settings.json); cfg.py follows the script; hookio follows the env.
- `cwd` can point outside any repo, or at another repo after `cd`.
- `last_assistant_message` absent on this harness; transcript can lag at hook time (documented).
- Hooks fail silently; no persistent log.
- Hooks disabled locally (settings.local.json, mtime 13:13:42); nothing verifiable live until re-enabled.

## Open questions (for Stepan)
1. In a worktree, does the gate use the worktree's own (possibly older) hooks/pipeline.json/agents or main's?
2. Does `background_tasks` allow stop for subagents only, or shell tasks and crons too?
3. Can a paused pipeline coexist with a new `init` on the same checkout, or must init refuse?
4. Core files writable only in the PIPELINE tier (LEARN included)?
5. G: restrict the architect to `plans/<issue>-*.md` (needs role-aware write gating, which does not exist), or role text + Write in frontmatter is enough?

## Stepan's decisions on the open questions (2026-10-27)
1. In a worktree, the resolved checkout's own hooks, pipeline.json and agents apply: main's hook entry point only resolves the checkout from `cwd` and dispatches to that checkout's script.
2. Stop is allowed mid-phase only while a `background_tasks` entry with `type == subagent` and `status == running` exists.
3. Pause: one active pipeline plus parked ones per checkout. `pause` parks the state under its issue, freeing the checkout for a new `init`; `resume` restores it only when no pipeline is active and the branch matches. Issue #1 is the first to park.
4. Pipeline core (hooks, pipeline.json, settings.json) is writable only in the PIPELINE tier (LEARN included in the restriction), shell writes too. The architect gets Write and the role rule "writes only `plans/<issue>-*.md`" (no role-aware gate).

## Stepan's revised decisions after design review round 1 (2026-10-27)
1 (REPLACES decision 1 above). Hooks, pipeline.json and agents always come from the main checkout (`CLAUDE_PROJECT_DIR`, the entry point in settings.json). Only the pipeline STATE (and parked states) is per checkout, resolved from hook input `cwd`. No dispatcher to another checkout's scripts. Reason: security judge showed that delegating to a checkout's own scripts lets an old-commit worktree or a fake `.git`-file directory govern writes to main's state and core. Cost accepted: an older branch is checked by the current rules (fixed with `git merge main`), and new hooks are exercised only after they are in the main checkout's working tree.
5 (new). `.claude/settings.local.json` is pipeline core: core prefix becomes `.claude/settings` (tool and shell paths). Agents cannot write it outside the PIPELINE tier; Stepan edits it by hand.

## Stepan's decisions after design review round 2 (2026-10-27)
6. Threat model: the pipeline is a guardrail against the MISTAKES of an honest, cooperating agent (wrong phase, wrong role, direct writes to state/core via ordinary tool or shell paths, forged votes by plain text, foreign state), NOT a sandbox against an agent that deliberately subverts it (nested worktrees inside .claude/hooks, Python module shadowing, crafted shell evasion). Deliberate bypasses are recorded in ADR-0005 as accepted residual risk, caught by review and by Stepan at merge. Judges evaluate against this model. Cheap hardening that also prevents accidents may stay.
7. PIPELINE tier only in the main checkout (accepted). `init PIPELINE <n>` and `pause` of a LEARN-tier state require a grant written by Stepan: `.claude/settings.pipeline-grant.json` naming the issue (it falls under the core prefix `.claude/settings`, so agents cannot write it outside PIPELINE).
