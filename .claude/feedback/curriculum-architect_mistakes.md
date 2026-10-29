# curriculum-architect mistakes

Lessons appended by judges when this role caused a FAIL. Load before working. Let it grow.

Format:
### YYYY-MM-DD: Short description (#issue)

What happened and why it is wrong.
Rule: One-line rule that prevents this.

### 2026-10-27: Outcome verb that the check cannot observe; quiz testing volatile trivia (#15)

O1 said "выбирает ... и обосновывает выбор", but its only check was a quiz, which cannot observe a
justification. Three of its eight quiz topics (default effort per surface, budget_tokens on 5.x,
vendor effort names) were recall of facts on the stale watchlist, against the design's own rule
"every question is a scenario requiring the mechanism".
Rule: For every verb in an outcome, name the check that observes it; drop the verb or add an
artifact. Never grade recall of a dated default; grade the habit (name the surface, check it).

### 2026-10-27: Lesson uses concepts the sequence introduces later (#15)

L2 (cost) had prerequisite L1 only, yet its theory and quiz rely on "every turn resends the
context" (the agent loop, L3), subagent fan-out, MCP vs CLI (L3) and CLAUDE.md -> skills (L5,
module 01). The L3-before-L4 swap was justified by exactly this dependency, but not applied to L2.
Rule: For each lesson, list the concepts its theory, task and quiz use, and confirm each is
introduced in an earlier lesson or inside the lesson itself; apply a dependency argument to every
lesson it touches, not only to the one being swapped.

### 2026-10-27: Bug-hunt key format that an honest learner can fail (#15)

bugs.yaml allowed one line range per bug, but the planted "lost instruction" mistake has a cause
(rule said only in chat), a trigger (auto-compaction) and a symptom (migration edited) far apart in
the transcript, so a correct finding can miss the range. Three categories (context-bloat,
handoff-bloat, eager-loading) overlapped with no stated criterion separating them, while matching
requires the exact category.
Rule: When defining a matching format, walk every planted bug: one unambiguous anchor rule or
several accepted ranges, and categories that are mutually exclusive by a stated criterion.

### 2026-10-27: Anti-gaming claims not checked against the cheapest attack (#15)

The #15 design called its checks "not gameable" without computing the best attacker strategy:
bug-hunt with 6 bugs, 4 decoys (2 categories decoy-free) and maxReports 8 is passed
deterministically by reporting both sides of every look-alike pair (2 + 3 pairs = 5 = minFound);
every python command check exits 0 when the learner plants `~/.local/.../usercustomize.py` with
`atexit -> os._exit(0)` (verified), because run strings lacked `python3 -I`; the L6 hook allow/block
probes never include a path that contains "generated" but resolves elsewhere, so a raw-substring or
block-all-but-api.py hook passes; the quiz demo required "1000 random trials all below passScore"
while its own math gives 0.1-0.8% per trial (expected 1-8 passes); quiz explanations shown after a
failed submission reveal the key for attempt two; plan-structure validated paths against the
learner-editable workspace.
Rule: For every check, write down the cheapest attacker strategy (hedging, environment tampering,
over-blocking, retry-with-feedback) and its pass probability before calling it not gameable; every
probe set has both "must block/deny" and near-miss "must allow" cases; every check script runs with
`python3 -I` and takes expected values only from `checks/`.

### 2026-10-27: L6 check expectations contradicted documented Claude Code behaviour (#15)

The #15 design fixed L6 probe outcomes and hook semantics before the research addendum existed,
and several contradict code.claude.com/docs/en/permissions and /hooks: `Bash(git status)` and
`git diff` "allow" ignores that read-only git runs without a prompt in every mode with no rule;
"WebFetch ask" is undefined when no rule matches, since the built-in starting mode in an
interactive terminal is `auto` (v2.1.283+), not a prompt; "malformed stdin -> blocking exit"
did not say exit 2, while CC treats exit 1, crashes and timeouts as non-blocking (fail open)
unless `onFailure: "block"` (v2.1.295+); the generated-file protection relied on the hook alone
though the docs say to use permission rules for hard denies; wrong-solution `Bash(git *)` has no
probe that catches it (`git -C . push`, `git -c core.fsmonitor=...` are documented bypasses).
Rule: A check that emulates a vendor mechanism states, per probe, the documented outcome
including the no-rule/default-mode fallthrough and exact exit codes, and is written only after
the research for that mechanism exists; mark expectations "pending addendum" otherwise.

### 2026-10-27: anti-gaming fixes that reopened the hole they closed (#15, design round 2)

Revision 1 of the #15 design fixed round-1 gaming findings but introduced or missed new ones:
the quiz and bug-hunt show the answer key after 3 failed attempts and never say what happens to
attempt 4, so failing three times on purpose and copying the key passes with certainty; the
bug-hunt "cheapest attack 0.93%" counts each bug as one episode, but lost-instruction and
no-verification accept two anchor ranges each, so a per-category guesser sees 2 accepted blocks
out of 4 and passes at 14/768 = 1.82%, above the design's own 1% bar (the demo would assert the
wrong analytic number and "pass"); L1 routing claims retry enumeration is "bounded by the attempt
cap in 2.5.6" while 2.5.6 defines no cap for command checks; demo 2.4(4) applies the PATH-shim
cheat to the reference solution, where it cannot fail; the hook check feeds a Read payload that
a hook registered `Edit|Write` never receives, failing an honest hook.
Rule: When a fix adds a reveal, a cap or a multi-anchor key, recompute the attack against the
new rule itself: say what the learner can do after the reveal, count every accepted range as a
separate guessable episode, and cite only caps that the design actually defines. Every cheat
probe states the base copy (starter vs reference) on which it must fail.

### 2026-10-27: Hook registration pattern rejects the documented preferred form (#15, design round 3)

Revision 2 tightened the L6 hook registration check to one shell-form regex over `command` and
ignored `args`. code.claude.com/docs/en/hooks says "Prefer exec form for any hook that references
a path placeholder", and its own project-script examples are
`"command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/x.sh", "args": []` (unquoted placeholder, exec
form), or `"command": "node", "args": ["${CLAUDE_PROJECT_DIR}/..."]`. Both fail the regex, so a
learner who copies the vendor's example fails. The reverse also holds: with `args` present the
docs-quoted shell spelling `"\"$CLAUDE_PROJECT_DIR\"/..."` is spawned literally (exec form has no
shell, quotes and bare `$VAR` pass through verbatim), the hook cannot start and fails open, yet the
regex accepts it. The regex also accepts relative `./.claude/...` and bare `.claude/...` forms
although the docs say "Use absolute paths" for hook scripts.
Rule: When a check pins how a vendor config must be written, enumerate every documented form
(here shell vs exec form, decided by the presence of `args`) and verify each accepted string
actually runs under that form; never accept or reject a form by text alone.

### 2026-10-27: A pedagogy add-on silently reopened the attempt-cap arithmetic (#15, design round 4)

Revision 3 added a mentor between failed attempts ("question and direction only, never anchors,
options, field values or the key") but did not forbid the mentor from saying WHICH question, card or
report item is wrong. The quiz and L1 caps were certified on score-only / aggregate-count feedback;
per-item correctness lifts a 6-question quiz from 0.36% to 19.9% within 3 attempts and L1 routing
(12 combos per card) from about 0.2% to 8.3% within 10 submissions.
Rule: Every new feedback channel (mentor, UI hint, log line) is checked against the feedback rule
the rates were computed under. State what it may NOT reveal in terms of that rule (per-item
correctness, counts), and say whether it receives the key at all.

### 2026-10-27: A registration allowlist that pins command/args but not the other fields (#15, design round 4)

Revision 3 pinned the L6 hook `command`/`args` exactly but left the other documented fields open:
`"if": "<rule that never matches>"` (e.g. a typo `Edit(src/invoice/generated/**)`), a tiny `timeout`,
or `"disableAllHooks": true` in the same settings file all pass registration while the hook never
blocks in Claude Code (fail open). The "after trimming" step with Python `str.strip()` also removes
NBSP/VT, so ` "$CLAUDE_PROJECT_DIR"/...` matches yet `sh` exits 127 (verified).
Rule: When a check claims "exactly one accepted form", allowlist every key of the object (and the
settings keys that switch the mechanism off), give allowed values for each, and trim only the
characters the consuming shell also ignores.
