# ADR-0001: Lesson format as the contract between the teams

- Status: Proposed
- Date: 2026-10-27
- Issue: (bootstrap)
- Amended: 2026-11-04, #68 (Decision 8: per-check attempt limits and mentor threshold).
  Status stays Proposed until Stepan accepts.

## Context
The methodologists produce lessons; the platform displays and checks them. If the format is not
fixed, the teams will drift apart: the methodologists invent a new field and the platform does not
read it, or the other way round. Agents on both sides confidently "fill in" the format, so the
agreement must be checked by a machine, not by text.

## Decision
1. The single definition of the format: `packages/lesson-schema/src/schema.ts` (zod). The platform
   imports its types from the same place and defines no lesson types of its own.
2. Structure: `course/<course>/course.yaml` -> `<NN-module>/module.yaml` -> `<NN-lesson>/`
   with `lesson.yaml`, `theory.md`, `task.md`, `starter/`, `checks/`, `quiz.yaml`.
3. Check types: `quiz`, `command`, `rubric`, `hidden-task`, `bug-hunt`.
4. Statuses: `planned`, `draft`, `ready`. The learner sees only `ready`.
5. Everything for the grader lives in `checks/` and never gets into `starter/`, `theory.md`, `task.md`
   or the browser.
6. `pnpm content:validate` checks the schema, the presence of files, the order, id uniqueness, sources
   of `ready` lessons and leaks of `checks/`. It is a required CI check.
7. Changing the format: a dev team task that updates this ADR and migrates all lessons
   in the same PR. Owner (CODEOWNERS): Stepan.
8. Attempt limits (amended 2026-11-04, #68). Any check may carry an optional `attempts` object holding
   two optional positive integers and no other keys:
   - `limit`: the check accepts at most this many counted failed results; the result that reaches it
     closes the check as not passed. Absent (no block, or a block without `limit`): no cap, on every
     kind.
   - `mentorAfter`: once the learner has this many counted failed results on the check and has not
     passed it, the platform suggests the mentor. Absent: no suggestion by count (the mentor stays
     available on request, and a closed check always gets a mentor review).
   The counter of a check is the number of this learner's counted results of that check that did not
   pass. Never counted: format errors, stage-0 rejections, platform errors, and any result after the
   check's first pass. A format error or stage-0 rejection is decided before any comparison with
   grader material (key, hidden tests), and before the check's first pass an uncounted result,
   platform errors included, shows the learner no score, count or message derived from that material;
   a check of that material that runs later is counted (as module 01 lesson 01 task.md says for its
   stage 0). Every other result is counted or not as ADR-0007 records it (this includes timeouts and
   exhausted hidden-task budgets). Nothing resets the counter (not a lesson or workspace
   reset, not a mentor review).
   Rules: `mentorAfter` is below `limit` when both are set. A `quiz` or `bug-hunt` check has a `limit`
   of at most 3: score-only feedback was shown safe only within 3 scored submissions (module 00 design,
   #15 section 2.5.6), so a higher value needs a new analysis and a change of this ADR.
   A command check whose failure message reports something enumerable (an aggregate count over enum
   fields, as `model-routing` and `cost-estimate` in module 00) carries the `limit` its design computes;
   the schema cannot tell such a check from another, so review checks it.
   The values repeat what the learner reads in task.md (its section on attempts and hints): the two
   agree, and lesson.yaml never states a limit or threshold the task text does not.

## Alternatives considered
- MDX with frontmatter in a single file: convenient to write, but checks and hidden files still
  need a folder structure; rejected.
- Storing lessons in the DB with an admin panel: cuts the agent methodologists off from git, review
  and CI; rejected.
- JSON Schema as the source of truth: no proper TS types without code generation; zod gives both
  validation and types. JSON Schema can be generated from zod if needed.
- Attempt limits as per-kind fields, or a mentor threshold per lesson: one counting rule serves every
  kind, and the course text states the threshold per check; rejected (#68).

## Consequences
- The format changes slowly and deliberately, which is what we want.
- The validator itself becomes code that has to be maintained and tested (it already has tests).
