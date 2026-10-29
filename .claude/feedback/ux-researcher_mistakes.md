# ux-researcher mistakes

Seeded with design-discipline rules; append real lessons as they are found. Load before working.

Format:
### YYYY-MM-DD: Short description (#issue)

What happened and why it is wrong.
Rule: One-line rule that prevents this.

### Seeded: Flows written from assumed needs

A flow that starts from what the designer imagines the learner wants, instead of a course file, a
journal entry or the issue, designs for nobody in particular.
Rule: Every flow names its learner goal and the source it comes from (`course/`, `learner/journal.md`,
the issue).

### Seeded: A flow without error and empty states

A flow that describes only the happy path leaves dev to invent what the learner sees when a check fails,
a workspace does not start or a list is empty.
Rule: Every flow has an entry point, a success state, error and empty states, and an exit.

### Seeded: Two words for one concept

Calling the same thing a "lesson" in one flow and a "class" in another makes the UI inconsistent and the
IA ambiguous.
Rule: Take the vocabulary from `course/` and `docs/learning-process.md` and use one term per concept.
