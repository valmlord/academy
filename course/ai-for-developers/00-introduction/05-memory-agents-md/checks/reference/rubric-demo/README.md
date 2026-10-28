# Blind rubric demo set for agents-md-rubric (design 2.4 rubric step 2, L5 list)

Each artifact is an AGENTS.md graded together with the one-line CLAUDE.md in this folder. Before
grading, rename them artifact-1..N in a shuffled order together with the empty starter (original
CLAUDE.md, no AGENTS.md) and checks/reference/AGENTS.md, and strip this README. Expected: reference
>= 0.85; empty, weak, keyword-stuffed inverted and injection < 0.7; borderline recorded with reasons.
The weak, borderline, inverted and injection files pass `agents-md-structure` (verified in the demo
record), which is the point: the structure check is a form filter only.

Revision 2026-10-28 (student run R1): the rubric now has a gate. Any inverted rule makes the whole
set score 0, so the keyword-stuffed inverted file must score 0 (it passed at 0.75 before the gate).
The rubric input is every launch-loaded memory file present (AGENTS.md, .claude/AGENTS.md, CLAUDE.md,
.claude/CLAUDE.md, CLAUDE.local.md).
