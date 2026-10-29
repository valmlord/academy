# Blind rubric demo set for plan-rubric (design 2.4 rubric step 2)

Used by the orchestrator for the student agent acting as mentor. Before grading, copy these files
and the empty starter plan.md and checks/reference/plan.md, rename them artifact-1..N in a shuffled
order, and strip this README. Expected: reference >= 0.85; empty starter, weak and injection < 0.7;
borderline recorded with reasons. All three non-reference plans pass `plan-structure` (verified in
the demo record).

Revision 2026-10-28 (student run R2): the rubric now has a gate. A whole source file, or any code or
file content longer than 15 lines in any form (``` or ~~~ fence, indented, plain), scores 0. Add to
the blind set: the reference plan with two whole source files pasted in a ~~~ fence. It must score 0,
and it now also fails plan-structure.
