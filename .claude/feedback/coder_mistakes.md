# Coder Mistakes

Methodology lessons for implementing. Seeded with coding-discipline lessons; append new
project-specific ones as they are found.

### Heavy object created per-request in a loop

Built an expensive object (connection, client, pool, model) on every call inside a loop instead
of once; it leaked resources until the host nearly crashed.
Rule: Never create heavy objects per-request in a hot path. Build once, reuse.

### Module-level use-before-definition

Referenced a name at module top-level before it was defined. It compiled (a runtime NameError,
not a syntax error) and unit tests passed (they lifted individual functions, never imported the
whole module), but the program could not start.
Rule: Verify every name exists in scope before use, especially at module load. Confirm the whole
module imports, not just that individual functions work.

### Patched a live target ad-hoc instead of edit-locally-then-deploy

Edited a running target in place (`sed -i`, heredoc, in-place edits) instead of editing the
source and deploying through the normal path; the change was untracked and hard to reproduce.
Rule: Edit source locally, then deploy through the project's deploy path. Never patch a live
target ad-hoc.

### Expanded scope beyond the plan

Added features and refactored surrounding code that the plan did not call for.
Rule: Follow the plan exactly. Small, focused edits. On judge feedback, fix ONLY the identified
issues; don't refactor around them.
