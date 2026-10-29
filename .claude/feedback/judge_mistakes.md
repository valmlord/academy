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

### 2026-10-27: A judge condition listed an incomplete value set (#15)

Round-2 accuracy condition 1 gave the L5 `instructionFiles` values as three
(`claude-md-or-agents-md`, `claude-md-and-agents-md`, `managed-only`); the memory page lists four
(also `claude-md`). The architect copied the condition verbatim, so the omission reached the design.
Rule: When a condition dictates an enumeration (values, scopes, versions), copy the full table
from the source and say "complete list" only after counting its rows.

### 2026-10-28: A judge's prescribed fix wording was itself inaccurate (#15)

Round-4 accuracy FAIL on L6 theory.md:70 prescribed "no prompts; only deny rules, ask rules and the
few actions no mode auto-approves stop a call". The lesson-author copied it. permission-modes says
those actions "get a prompt or a denial" even in bypassPermissions, and the permissions mode table
says bypass "Skips permission prompts, except for the actions no mode auto-approves". So "запросов
нет" was false, and the round-5 text was wrong because of the judge.
Rule: A fix wording in a FAIL is a factual claim too. Check it against the source sentence by
sentence before writing it, and quote the source's own verb (prompt or deny, block, skip).

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

### 2026-10-29: Accessibility judge missed 2.5.7 on the pane split in rounds 1-2 (#50)
F9.3 "drag, or focus the handle and use arrow keys" was in the design from round 1; the accessibility
judge reviewed keyboard paths only and did not check WCAG 2.2's new pointer criteria, so the gap surfaced
in round 3 and cost a review round.
Rule: In judge_design, check every WCAG 2.2 addition (2.4.11, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8) against
every flow in round 1, not only the checklist's design items.

### 2026-10-29: Usability judge checked `?tab=` on arrival only (#50, judge_ux round 1)
Round 1 U3 asked the lesson to honour `?tab=` on arrival but did not check the other half of the same
control row ("`?tab=` updated" when a tab is selected), which F2.4 depends on. It surfaced in round 2.
Rule: When a finding concerns URL state, check every control row that reads or writes it, and click the
control to see the URL change, in the same round.

### 2026-10-29: Usability judge never ran simulated actions from a non-default tab (#50, judge_ux rounds 1-2)
Rounds 1-2 clicked "Проверить" and the status actions only from the default Теория state, so nobody saw
that every `data-goto-state` transition resets the left tab to Теория, against A17 and AC7. It surfaced in
round 3, once `?tab=` made the reset visible in the URL.
Rule: In judge_ux, run each state-changing control from every left-pane tab and compare the selected tab
and URL before and after against the acceptance notes.
