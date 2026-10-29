# #26 GitHub texts (read by runbook steps G2 and G3)

## A4 pinned strings

| PR body line | string | course source file:line |
|---|---|---|
| 5 | "Введение в разработку с ИИ" | course/ai-for-developers/00-introduction/module.yaml:2 |
| 28 | "скелет" | course/ai-for-developers/00-introduction/01-models-and-effort/task.md:63 |
| 29 | - | none |
| 36 | - | none |

## Issue #21 body
~~~~text
### Problem / user story

As the orchestrator, I want to run two pipelines in parallel in different git worktrees (for example PROJECT #1 in the main checkout and MODULE #15 in `.claude/worktrees/...`), so that the hooks of each session read and write the state of their own worktree, not another one's.

Today the state drifts apart:
- `pipeline-advance.sh` finds the state through `SCRIPT_DIR` and writes `.claude/pipeline_state.json` of the worktree it was started from.
- The hooks (`phase-gate.sh`, `require-pipeline.sh`, `bash-code-guard.sh`, `judge-count.sh`, `judge-vote.sh`, `phase-complete.sh`, `pipeline-watchdog.sh`, `lib/hookio.py`) take `DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"`. In a session started in a worktree, `CLAUDE_PROJECT_DIR` points to the main checkout, so the hooks read the state of another pipeline.

What #15 shows:
- `init MODULE 15` wrote the state in the worktree, but `phase-gate` rejected curriculum-architect: "may run only in phases architect..judge_design (tier PROJECT). Current phase: researcher". It had read the state of #1.
- The judge votes of #15 would have been written to the state of #1.
- The Stop hook blocks stopping because of the phase of another pipeline.
- When the worktree was created, the app copied the main checkout's gitignored state file into it, and `init` refused: "pipeline still active".

### Acceptance criteria

- [ ] All hooks and `pipeline-advance.sh` compute the state file path the same way: from the git worktree root of the current working directory (`git rev-parse --show-toplevel` from the tool's cwd), not from `CLAUDE_PROJECT_DIR`.
- [ ] A pipeline in the main checkout and a pipeline in `.claude/worktrees/<name>` run at the same time and do not see each other's state (test: two inits in two worktrees, gate and judge-count in each read their own state).
- [ ] A judge vote is written to the state of the worktree where the session runs.
- [ ] A fresh worktree with a copied foreign state file counts as "No active pipeline" (for example, if `branch_at_init` does not match the current branch), or the copying is ruled out.
- [ ] The state file protection (no direct writes) works in every worktree.
- [ ] Behaviour in the main checkout without worktrees does not change (regression run of the current hook tests).

### Pipeline tier

TASK

### Area

pipeline

### Notes, links, ADRs

Blocks #15 (module 00-introduction), which runs in a separate worktree in parallel with #1. The researcher for #15 has already run. Pipeline core (`hooks/`, `settings.json`) changes only inside a pipeline.
~~~~

## PR #24 title
~~~~text
content(intro): add module "Introduction to AI-assisted development"
~~~~

## PR #24 body
~~~~text
Closes #15

## What

Module `course/ai-for-developers/00-introduction` "Introduction to AI-assisted development" ("Введение в разработку с ИИ"), status `ready`, 345 min, outcomes O1-O6, six lessons:

| Lesson | Practice | Checks |
|---|---|---|
| 01 models-and-effort | route 6 task cards to model and effort | `model-routing` (command, cap 10), quiz |
| 02 agent-loop | finish a minimal agent harness | `harness-behaviour` (command), mcp-quiz |
| 03 cost-economics | estimate three session costs from logs | `cost-estimate` (command, cap 10), cost-quiz |
| 04 context-and-planning | bug-hunt a transcript, write a plan | bug-hunt (6 bugs, 19 decoys), `plan-structure` (command), rubric |
| 05 memory-agents-md | restructure CLAUDE.md into AGENTS.md | `agents-md-structure` (command), rubric, quiz |
| 06 permissions-security | permission policy and a PreToolUse hook | `permissions-policy`, `hook-blocks-generated` (command), quiz |

Contract unchanged (`packages/lesson-schema`, ADR-0001). The mentor-only reserve pool lives in `checks/data/reserve/` and is never on the command-check mount.

## Pipeline (MODULE)

- **judge_design:** 3/3 PASS in round 5 (`plans/15-module-introduction-design-review-{1..5}.md`).
- **author:** lesson-author and practice-designer. The demo record is in `plans/15-module-introduction-demo.md`. Every command check fails on the empty starter and passes on the reference.
- **student:** three runs, honest and cheater (`plans/15-module-introduction-student.md`). Every cheat found was closed; none passes.
- **validate:** `pnpm content:validate` gives 1 course, 6 modules, 6 lessons, 0 issues.
- **judge_content:** 3/3 PASS in round 6 (`plans/15-module-introduction-content-review.md`). Rounds 3-6 were approved by Stepan; they all fixed L6 permissions text and checks.

## Flags for Stepan

1. **W2 exception to `docs/learning-process.md` section 3.** For keyed items, the skeleton ("скелет") and direct explanation ("скажи прямо") hints open only after the check is closed. Accept this or amend the doc.
2. **O2 "finds the lever".** Only quiz question `levers-for-scenario` grades it: the L3 lever was removed from autograding by your decision. Reword O2 or accept.
3. **Cumulative guess rates over 3 attempts.** mcp-quiz and cost-quiz: 1.31%. Bug-hunt: 2.75%. Each is under 1% per attempt. A blind guess on the L3 enums passes within 10 submissions 18.5% of the time.
4. **L6 known gap.** The check ignores settings keys outside `permissions`. A top-level `sandbox.enabled` with `autoAllowBashIfSandboxed` passes, and `make db-reset` would then run sandboxed without a prompt. This is recorded in the demo; not fixed by your decision.
5. **L6 strictness.** `--permission-mode=manual` and the restrictive keys `disableAutoMode` and `blockReadsOutsideWorkingDirectories` are rejected. That is too strict but safe.
6. **Design section 5** still lists the lever under `cost-estimate` (superseded by flag 2).
7. **C9, runner isolation:** out of scope here, belongs to #08.
8. **Non-blocking leftovers from the round-6 judges:**
   - theory 06:73-74 should use the docs' wording "request or refusal";
   - two wrap-width lines in 06/task.md;
   - the allow-rule and Makefile messages do not name the file.

## Python

The checks need Python 3.10+ (demo runs used python3.12; `/usr/bin/python3` on macOS is 3.9).
~~~~

## Notes for the judges

- In the A4 table the double quotes around a string are delimiters, not part of the string (the module
  title has no quotes at its `module.yaml:2` source). Sources come from `rg -nF --sort path -e "$s" course/`,
  first hit.
- Line 28 quotes two course strings, the skeleton and the direct explanation hint commands; the table has
  one row per line, so the row pins the first. Both are A3 words and stay in the English body in the pinned
  learner-command form.
- Lines 29 and 36 quote phrases with no exact source in `course/`, so they are marker rows and are
  translated: "finds the lever", "request or refusal".
- Issue #21: the error strings "may run only in phases architect..judge_design (tier PROJECT). Current
  phase: researcher", "pipeline still active" and "No active pipeline" are kept verbatim.
