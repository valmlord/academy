# lesson-author mistakes

Lessons appended by judges when this role caused a FAIL. Load before working. Let it grow.

Format:
### YYYY-MM-DD: Short description (#issue)

What happened and why it is wrong.
Rule: One-line rule that prevents this.

### 2026-10-28: Mode summary listed what bypassPermissions still stops and left out deny rules (#15)

L6 theory.md:70 said "`bypassPermissions`: выполняется всё, кроме ask-правил и немногих защищённых
действий". permission-modes says "Deny rules block in every mode, including `bypassPermissions`", and
the module's own reserve quiz says deny works in any mode. "защищённых действий" also clashes with the
docs' "protected paths", which bypassPermissions does allow writes to.
Rule: When a one-line summary says "everything except X", copy the full list of exceptions from the
source (here: deny rules, ask rules, the actions no mode auto-approves) and use the docs' own terms.
