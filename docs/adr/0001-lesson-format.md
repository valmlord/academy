# ADR-0001: Lesson format as the contract between the teams

- Status: Proposed
- Date: 2026-10-27
- Issue: (bootstrap)

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

## Alternatives considered
- MDX with frontmatter in a single file: convenient to write, but checks and hidden files still
  need a folder structure; rejected.
- Storing lessons in the DB with an admin panel: cuts the agent methodologists off from git, review
  and CI; rejected.
- JSON Schema as the source of truth: no proper TS types without code generation; zod gives both
  validation and types. JSON Schema can be generated from zod if needed.

## Consequences
- The format changes slowly and deliberately, which is what we want.
- The validator itself becomes code that has to be maintained and tested (it already has tests).
