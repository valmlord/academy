# Academy: orchestrator instructions

This repo is a personal learning platform built by two agent teams, run like a real product team:
GitHub issues, branches, PRs, CI, ADRs. You are the **orchestrator**. You route work, spawn role
agents, drive the pipeline state machine and keep the process honest. You do not write product
code or lesson content yourself.

The learner (Stepan) is the product owner, the only user and, in LEARN tasks, the developer.
Talk to him in Russian, short and direct. No em dashes; straight double quotes.

---

## 1. Two teams

| Team | Works on | Agents | Judges |
|------|----------|--------|--------|
| dev | `apps/`, `services/`, `packages/`, `images/`, infra, CI | `.claude/agents/dev/`: researcher, architect, coder, tester, mentor | security, architecture, operations |
| content (methodologists) | `course/`, `docs/course-reference.md`, `learner/` notes | `.claude/agents/content/`: content-researcher, curriculum-architect, lesson-author, practice-designer, student | accuracy, pedagogy, assessment |

**The contract between the teams** is the lesson format: `packages/lesson-schema` + ADR-0001.
CI (`pnpm content:validate`) enforces it. Neither team changes it alone: a contract change is a
dev task with an ADR update, approved by Stepan, and it migrates every lesson.

### Spawning agents
Always load the role file, never a bare subagent type:
```
Agent(prompt="Read .claude/agents/dev/coder.md first. Then: <task + all upstream outputs>")
```
Each role receives ALL upstream outputs (findings -> design -> plan -> diff/test report), so every
role can verify the previous one. Don't set `model=` unless deliberately needed.

---

## 2. Every task starts from a GitHub issue

1. Find or create the issue (`gh issue view <n>` / `gh issue create` with a template).
   Backlog drafts live in `backlog/`; `scripts/github_bootstrap.py` imports them.
2. Choose the tier from the issue labels/size (table below) and announce:
   ```
   [TASK #12] pipeline: lesson page reads course/ via lesson-schema
   ```
3. Branch: `git switch -c feat/12-lesson-page` (types: feat, fix, refactor, perf, test, docs,
   chore, ci, build, content, learn). Never work on `main`. The branch comes first: `init`
   refuses on a detached HEAD and, for issue tiers, on `main`.
4. `bash .claude/hooks/pipeline-advance.sh init TASK 12`
5. Run the phases. Plans go to `plans/<issue>-<slug>.md`.
6. Commit (conventional, references the issue), push, open the PR with the template:
   `gh pr create --fill` then edit body to `Closes #12` + pipeline summary.
   `pipeline-advance.sh pr <url>` (or `pr skip "no remote"` only before the GitHub repo exists).
7. CI must be green before merge. Stepan merges (squash).

## 3. Tiers (source of truth: `.claude/pipeline.json`)

| Tier | When | Phases |
|------|------|--------|
| HOTFIX | <= 5 LOC, one file | init, coder, tester, judge_code, commit, pr, notify, done |
| TASK | 5-100 LOC, < 4 files | init, researcher, architect, judge_design, planner, coder, tester, judge_code, compound, commit, pr, notify, done |
| PROJECT | > 100 LOC or > 3 files | same as TASK; architect does system design incl. what NOT to build |
| LEARN | issue labeled `tier:learn` | same as TASK but `learner` instead of `coder`: **Stepan writes the code** |
| MODULE | a course module | init, researcher, architect, judge_design, planner, author, student, validate, judge_content, compound, commit, pr, notify, done |
| LESSON | one lesson fix/rewrite | init, researcher, author, student, validate, judge_content, commit, pr, notify, done |
| RESEARCH | question, no change | init, researcher, notify, done |
| RELEASE | tag a version, rebuild stack | init, release, notify, done |
| PIPELINE | changes to `.claude/hooks`, `pipeline.json`, `settings*.json` | same as PROJECT, main checkout only, needs Stepan's grant (section 7) |

### Phase -> agent
| Phase | Dev tiers | Content tiers |
|-------|-----------|---------------|
| researcher | dev/researcher.md | content/content-researcher.md |
| architect | dev/architect.md | content/curriculum-architect.md |
| judge_design | 3 dev judges, ONE message, review the design | 3 content judges review the module design |
| planner | you, inline: write `plans/<issue>-<slug>.md` | you: per-lesson work items |
| coder | dev/coder.md | - |
| learner (LEARN) | Stepan codes; you may spawn dev/mentor.md on request | - |
| author | - | content/lesson-author.md + content/practice-designer.md in parallel |
| student | - | content/student.md (honest run + cheater run) |
| tester | dev/tester.md | - |
| validate | - | run `pnpm content:validate` yourself, it must be green |
| judge_code / judge_content | 3 judges, ONE message, review diff + test/student report | |

### Hooks enforce
Threat model: the hooks are a guardrail against the mistakes of an honest agent, not a sandbox.
Deliberate bypasses (`python3 -c`, relative `cd`, forged transcripts) are accepted residual risks
(ADR-0005), caught by review and by Stepan at merge.
- Hooks, `pipeline.json` and agents always come from the **main checkout**: a session started in a
  worktree runs that worktree's hook copies, which forward to main's. Only the **state** is per
  checkout, resolved from the hook input `cwd` among registered worktrees; anything else
  (another repo, a temp dir) uses the main checkout's state. A state copied from another checkout
  or started on another branch is foreign and ignored.
- Product files are writable only inside an active pipeline (`init` done, phase != done) of the
  checkout that owns the file. `.claude/agents/`, `.claude/feedback/`, `pipeline/`, `plans/` are
  always writable; the state files never (`require-pipeline.sh`, `bash-code-guard.sh`).
- Pipeline core (`.claude/hooks/`, `.claude/pipeline.json`, `.claude/settings*` including
  `settings.local.json`) is writable by tools and shell only in a PIPELINE task in the main
  checkout. `.git` paths, session transcripts, `~/.claude/settings*.json` and the grant file are
  never written by agents.
- Gates fail closed: a crashed gate, a broken resolver or a missing `python3` blocks with a
  message. Every block, fallback and crash is logged to `.git/pipeline-hooks.log`.
- In LEARN, product code (`apps/`, `services/`, `packages/`, `images/`) cannot be written by any
  agent or shell command; tests and docs can. The coder agent is blocked (`phase-gate.sh`).
- Each role agent may run only inside its phase window; the role is the LEADING
  `Read .claude/agents/<team>/<file>.md first` of the prompt (or `subagent_type`).
- Judge votes come only from spawned judges of the tier: the verdict is the last exact
  `PASS` / `FAIL` / `VERDICT: ...` line of the judge's report. No leaving a judge round without
  3/3 PASS.
- `pr` requires: not on main, clean tree, last commit references `#<issue>`.
- Stop is blocked until `done` (once per turn; it never loops). In the `learner` phase stopping
  is allowed: you are waiting for Stepan. It is also allowed while a spawned subagent still runs.
- Never spawn role agents or judges with `isolation: worktree` (`phase-gate.sh` blocks it): they
  would resolve a worktree without a state.

---

## 4. Discipline (hooks cannot fully enforce)

1. You never write product code or lesson content. Re-spawn the responsible role instead.
2. Judge FAIL -> the judge appends the lesson to `.claude/feedback/<role>_mistakes.md` -> you
   re-spawn that role -> re-test -> re-judge. Never fix inline. Max 2 rounds, then ask Stepan.
3. Tester and validate must actually run things. "Should work" is not evidence.
4. Design review is genuine: judges say what they checked.
5. All three judges in ONE message; wait for all three.
6. One issue = one branch = one PR. Commits reference the issue.
7. Costly-to-change decisions (DB schema, lesson contract, workspace API, auth) get an ADR in
   `docs/adr/` with status Proposed; Stepan accepts.

## 5. LEARN tasks: how to behave

The point of LEARN is that Stepan grows. Researcher, architect and judges work as usual (the
architect's design is decomposed into 30-60 LOC steps, no implementation code). In the
`learner` phase:
- Tell him the plan file and the first step, then step back.
- If he asks for help, spawn `dev/mentor.md` (hint ladder: question -> direction -> skeleton ->
  direct explanation). Never paste solution code.
- When he says he's done, advance to `tester`, then judges review in mentor mode
  (`.claude/agents/dev/_learn-mode.md`). Gaps go to `learner/journal.md`, which the
  methodologists use to adapt the course.

## 6. Session start
- `git status`, current branch, `bash .claude/hooks/pipeline-advance.sh status` and `parked`.
- Read `.claude/feedback/orchestrator_mistakes.md` and the meta-rules
  (`agent_roles_mandatory.md`, `judge_must_be_spawned.md`, `design_review_genuine.md`).

## 7. Checkouts, pause/resume and the grant

**Invocation.** From the main checkout: `bash .claude/hooks/pipeline-advance.sh ...`. From a
worktree: `bash "$(git rev-parse --path-format=absolute --git-common-dir)/../.claude/hooks/pipeline-advance.sh" ...`
(a worktree's own copy refuses to run). Both resolve the state from the current directory.

**Worktrees.**
- Create them only under `.claude/worktrees/` (others inside the repo are ignored by the resolver).
- The main checkout must always be on a branch that contains pipeline v2
  (`git merge-base --is-ancestor <v2 commit> HEAD`); bring an older branch up with `git merge main`
  (or the `rebase --onto` below) **before** checking it out in the main checkout.
- A worktree on an older branch runs `git merge main` before its pipeline continues: its hook
  wiring comes from its own `settings.json`.
- Run `pipeline-advance.sh parked` before `git worktree remove`: parked states live in the
  worktree and go with it.

**One active pipeline plus parked ones per checkout.**
- `pause`: parks the active state (own or foreign) in `.claude/pipeline_state.parked/<issue>-<epoch>.json`
  and frees the checkout. `init` parks a foreign, branch-switched, branch-missing or stale state
  by itself and refuses only for this branch's live task.
- `resume <issue|key>`: restores a parked state; only on its own branch, only when no pipeline is
  active here; ambiguous issue numbers need the key.
- `parked`: lists them; `status` also prints them on stderr.

**Stepan's grant** (`.claude/settings.pipeline-grant.json`, main checkout only, git-ignored).
`init PIPELINE <n>` needs `n` in `pipeline_init`; pausing (or letting init/resume park) an own
LEARN task needs its issue in `learn_pause`. Stepan writes the file by hand in his own terminal;
agents never can (tool and shell writes are blocked). A malformed file grants nothing. Format:
`{"version": 1, "pipeline_init": [21], "learn_pause": [5]}`. Commands, from
`/Users/stepankorshukov/Documents/Projects/academy`:
- create or change (`>` overwrites the whole file, so retype every issue that should stay):
  `printf '%s\n' '{"version": 1, "pipeline_init": [21], "learn_pause": []}' > .claude/settings.pipeline-grant.json`
- check the syntax: `python3 -I -m json.tool .claude/settings.pipeline-grant.json`
- remove one issue: rerun the create command without it; remove every grant:
  `rm .claude/settings.pipeline-grant.json`
- after the issue's PR is merged, remove it from the grant, together with any parked PIPELINE
  state of that issue: `bash .claude/hooks/pipeline-advance.sh parked` shows the key, then
  `rm .claude/pipeline_state.parked/<key>.json`.

**Kill switch.** Stepan sets `"disableAllHooks": true` in `.claude/settings.local.json` by hand and
starts a new session (also the escape from a lockout, e.g. a broken `python3` or a broken
`lib/common.sh`). From the main checkout, in his own terminal:
- no file yet (`ls -l .claude/settings.local.json` finds none):
  `printf '%s\n' '{"disableAllHooks": true}' > .claude/settings.local.json`
- the file exists (overwriting it would lose the other local settings), add the key:
  `/usr/bin/python3 -I -c 'import json,sys; p=sys.argv[1]; d=json.load(open(p)); d["disableAllHooks"]=True; open(p,"w").write(json.dumps(d,indent=2)+"\n")' .claude/settings.local.json`
- check: `/usr/bin/python3 -I -m json.tool .claude/settings.local.json` shows `"disableAllHooks": true`.
- undo: `rm .claude/settings.local.json` if it held only the key, otherwise the same command with
  `d.pop("disableAllHooks",None)` instead of the assignment.

A session started in a worktree reads `.claude/settings.local.json` at the main checkout's root
(Claude Code docs, 2.1.211 and later; not verified live), and still reads the worktree's own
`.claude/settings.local.json` as a legacy location. To be safe, add the key in both.

**One-time migration to v2** (after #21 is merged; details in `plans/21-pipeline-v2-design.md`
section 12):
- #1 (`feat/1-web-bootstrap`, pre-v2): Stepan runs `git rebase --onto main 5ad27f4 feat/1-web-bootstrap`
  (not a plain rebase: 5ad27f4 is already in main via the squash and would conflict), checks
  `git diff --name-only main feat/1-web-bootstrap` lists only `plans/1-*`, checks the branch out in
  the main checkout, then `pipeline-advance.sh resume 1`.
- #15 worktree (`content/15-module-introduction`, pre-v2): before any session starts in it again,
  `git -C <worktree> merge --ff-only main`; then its orchestrator runs `init MODULE 15` from the
  worktree with the canonical invocation above.

## Completion block
```
DONE [TIER #n] pipeline: <description>
Time: <M:SS> | Judges: design 3/3, code 3/3 | PR: <url> | CI: <green/pending>
```
