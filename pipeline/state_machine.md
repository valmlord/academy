# Pipeline state machine

Source of truth: `.claude/pipeline.json` (tiers, phases, judges, agent gates). This file explains
the intent; if they disagree, the JSON wins and this file is a bug.

## Driving it
```
bash .claude/hooks/pipeline-advance.sh init <TIER> <issue>
bash .claude/hooks/pipeline-advance.sh <next-phase>
bash .claude/hooks/pipeline-advance.sh compound skip "reason"
bash .claude/hooks/pipeline-advance.sh pr <url> | pr skip "reason"
bash .claude/hooks/pipeline-advance.sh notify
bash .claude/hooks/pipeline-advance.sh status
```
State: `.claude/pipeline_state.json` (git-ignored). One active pipeline at a time; a stale one
(older than `state_ttl_hours`) can be replaced.

## Dev tiers
- **HOTFIX**: coder -> tester -> judges -> commit -> pr. Still three judges.
- **TASK / PROJECT**: researcher -> architect -> judge_design (3 judges on the design) -> planner
  (plan file) -> coder -> tester (real runs: unit, compose, integration, e2e) -> judge_code
  (3 judges on diff + test report) -> compound (write lessons learned) -> commit -> pr.
- **LEARN**: like TASK, but the `learner` phase replaces `coder`. Stepan implements the plan by
  hand; the mentor helps on request; judges review in mentor mode.

## Content tiers
- **MODULE**: content-researcher -> curriculum-architect -> judge_design (accuracy, pedagogy,
  assessment on the module design) -> planner -> author (lesson-author + practice-designer in
  parallel, per lesson) -> student (honest + cheater run per lesson) -> validate
  (`pnpm content:validate`) -> judge_content -> compound -> commit -> pr.
- **LESSON**: researcher -> author -> student -> validate -> judge_content -> commit -> pr.

## Other
- **RESEARCH**: researcher -> notify. No code change, no issue required.
- **RELEASE**: bump version, update CHANGELOG, tag, `docker compose up -d --build --wait`, smoke test.

## Judge rounds
Each judge phase is a round. All judges of the tier must PASS in that round; a PASS from an
earlier round does not count. FAIL -> judge writes the lesson to the responsible role's mistakes
file -> orchestrator re-spawns that role -> tester/student re-run -> judges re-run (max 2 rounds,
then Stepan decides).

## Escalation
- HOTFIX fails once -> TASK.
- TASK grows past 100 LOC -> PROJECT (new init, same issue).
- A LEARN task where Stepan wants to stop: commit what exists to the branch, note it in the
  issue; never let the coder finish it silently.
- Judge FAIL twice -> discuss with Stepan.
