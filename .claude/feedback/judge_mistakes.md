# Judge Mistakes

Methodology lessons for reviewing. Seeded with review-discipline lessons; append new
project-specific ones as they are found.

### Rubber-stamp PASS without reading the code

Returned PASS without actually reading the changed files; a resource leak shipped.
Rule: Always read the actual changed files. Check resource management explicitly. If you cannot
read the code (it lives on a remote host or an un-checked-out branch), FAIL / CANNOT-CERTIFY -
never PASS on the description.

### Wrong attribution - blamed the coder for the architect's flaw

The architect designed something unworkable; the coder implemented it faithfully; the judge
blamed the coder for the resulting workaround.
Rule: When you find a FAIL, trace design vs implementation. If the coder followed the design
correctly, it is an ARCHITECT mistake, not a coder mistake.

### Missed a broken import / missing file

A new package imported a module that was never added; every judge PASSed; the program would
have crashed on startup with an import error.
Rule: Every review includes a basic "do all imports resolve to real files?" check.

### Accepted a self-referential guardrail as proof of safety

A change validated its output by re-deriving it with the SAME code that produced it, and the
comment claimed this made an outage "impossible". PASS on that trust would have been wrong.
Rule: Do not accept a guardrail's self-comparison as a correctness guarantee. Independently
enumerate everything downstream re-derives from the changed data and confirm each is handled or
provably not affected - from the real consuming code, not the author's comment.

### A decision rule safe at one corner, harmful at another

A rule was correct at the single state the reviewers happened to walk, but harmful at the
opposite end of another axis.
Rule: For any decision/threshold rule, walk BOTH ends of every state axis it depends on before
PASS. Name the corners you checked. A PASS that only exercised one corner is incomplete.

### An acceptance test that cannot fail on the old behavior tests nothing

A test named to guard a fix passed on both the fixed AND the broken version - it started from a
state where correct and incorrect behavior coincide.
Rule: For every test that claims to verify a constraint, ask "can this fail on the OLD/broken
behavior?" Require a negative run: a starting state where correct and incorrect behavior
DIVERGE, so the assertion distinguishes them.

### Green tests + clean compile ≠ the program runs

A module with a module-level use-before-definition compiled and passed all unit tests, but
could not start - the tests never imported the whole module.
Rule: When the tests do not import the module as a whole, do not treat passing tests as proof
it runs. Require at least one whole-module import/self-check. If none exists, FAIL on acceptance
completeness regardless of how many unit tests pass.

### Asserted a mechanism/symptom not verified in the actual source

A round-1 FAIL described the wrong failure mechanism (a call that "raises" actually failed
silently on a background thread), which sent the next fix chasing the wrong layer - and told
reviewers to watch for a symptom that could never appear.
Rule: Before asserting HOW something fails, read the actual call and confirm the failure mode
(synchronous vs silent/threaded). A wrong symptom is a wrong detector.

### FAILed a hunk on an unverifiable direction-of-drift claim

FAILed an out-of-scope edit as "pushes a new value onto a shared surface" when it was actually
reconciling a stale mirror toward the already-live value - reverting it would have re-introduced
the drift.
Rule: An edit to a shared surface is only a "live change" if it differs from what is ALREADY
there. Establish the direction of drift first. If you cannot check, state the conditional
instead of issuing a FAIL whose severity hinges on the unknown.

### 2026-10-28: PASSed a design whose post-merge step was impossible on the real repo (#23)
The operations judge passed #23's design, including "Stepan adds pipeline-types to required
checks", without checking that the private free-plan repo supports branch protection (it does
not: 403). The flaw surfaced only in code review.
Rule: For every "Stepan does X after merge" step, run the read-only check of X against the real
repo/host during design review.
