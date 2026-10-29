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

### 2026-10-27: Reused a path-prefix list as a shell substring rule (#21)
bash-code-guard.sh built its core regex from `pipeline_core_files` verbatim. Those entries are
prefixes for relative file paths in the write gate, so `.claude/hooks/` carries a trailing slash.
In a shell command the directory is usually named without it. As a result `rm -rf .claude/hooks`,
`cp x.sh .claude/hooks`, `mv .claude/hooks .claude/hooks.bak` and `ln -sf /tmp/x .claude/hooks`
passed outside PIPELINE. Deleting or renaming the hooks dir makes every hook command exit 127,
which is a non-blocking error, so all the gates fail open. The design's 2.7 text listed the same
slash form, but D-4 ("core writable only in PIPELINE, shell writes too") is the requirement. The
D11 test only exercised the `.claude/hooks/x.sh` form, so it could not catch this.
Rule: When a prefix list for one matcher (relative paths) feeds another (free-form shell text),
match the bare directory name with a token boundary too, as well as any ancestor that contains it.
Add a test for the directory named without a trailing slash.

### 2026-10-27: A failed state write reported as success through `[ "$(cmd)" = x ]` (#21)
pipeline-advance.sh's vote branch ran `if [ "$(state_op vote ...)" = "vote-dup" ]` and otherwise
printed "Judge recorded" and exited 0. A failure inside a command substitution used as a `[`
argument is invisible to `set -e`, so state.py's lock timeout (75), phase race (3) or unreadable
state (1) became "Judge recorded ... exit 0". pl_record_vote then logged `vote-ignored:advance-rc-0`
with the wrong rc. This broke the design's rule that the CLI passes 1/3/4/75 through, and the
message misinforms. The A10 test called state.py directly, so it never ran this branch.
Rule: Capture a command's output and its rc separately (`out=$(cmd) || rc=$?`) before comparing.
Every error path of a CLI wrapper needs a test that goes through the wrapper, not just the library.

### 2026-10-28: A TypedDict cast justified by a comment that overstates the validation (#23)
`cfg._validate` ends with `cast(Config, data)` under the comment "The checks above are exactly what
Config declares", but `TierConfig` declares `team: str`, `requires_issue: bool`,
`edits_pipeline_core: bool`, `learner_writes_code: bool` and none of them is checked. A
`"edits_pipeline_core": "false"` passes `load()`, `has_flag` returns `bool("false")` = True, and
mypy, trusting the cast, sees a bool, so strict typing cannot flag it. The one cast in the hook
Python carried a false justification: exactly the hole the "no Any, casts justified" rule exists
to close, and a lying comment is a defect under the code-style rules.
Rule: Before casting to a TypedDict, check every declared field (nested ones included) or declare
the unchecked ones as `object`; the comment on the cast lists what was checked, and only that.

### 2026-10-28: A fix added an import edge and a behaviour change; the design record still denied both (#23)
The round-1 fix (58c1152) made `pl_gate.py` import `cfg` (for `cfg.ConfigError`) and made `cfg._validate`
reject wrong-typed tier keys. The design doc still said `pl_gate` "imports only the stdlib and
`pl_jsonshape`" (2.7) and listed `pl_gate imports pl_jsonshape` as its only lib edge in the 2.8 import
graph, the record used to order typing and to rule out cycles. 2.8 also still said `cfg.load()` checks
"the top-level types" and "Behaviour must not change" except AttributeError shapes, while a string or 0/1
flag in ANY tier now crashes every gate (fail closed). The fix to a lying comment left a lying design
record.
Rule: When a fix adds an import or changes behaviour, grep the design/ADR for the module name and update
every statement about its imports and behaviour in the same commit.

### 2026-10-28: A guard placed outside the try it was meant to sit behind became the only crash path (#23)
8aa48dd added `if not math.isfinite(parked_ts)` to `state._parked_at` BEFORE the
`try: time.localtime(...) except (OverflowError, ValueError, OSError)`. `math.isfinite` converts an
int to a float, so a JSON integer above ~1.8e308 (e.g. 10**309; 10**308 still converts; `json.load` returns it as an int)
raises `OverflowError: int too large to convert to float` outside the try: `parked` prints a traceback
and `status` (set -euo pipefail) exits non-zero. Without the isfinite line, `localtime` raises inside
the try for inf, NaN and that int alike, so the extra guard added the only uncaught path while design
2.3 claimed "instead of ... a traceback". The test row used 1e20, which converts to float fine, so the
boundary that breaks the guard was never exercised.
Rule: Every pre-check on untrusted input runs inside the same exception boundary as the call it
protects, and the test rows include the value that breaks the pre-check itself, not only the call.

### 2026-10-29: Added a code span in translation; V3 requires span multisets to be unchanged (#26)
Translating the last criterion of `backlog/20`-`25` ("отчёт агента-ученика приложен к PR, ...") as
"the report of the `student` agent ..." introduced a new inline code span that the original never had.
Design section 4, V3, requires the multiset of inline code spans of every translated file to equal
`main`'s, so the tester's span diff went red on all six files.
Rule: A translation neither adds nor removes code spans. Name a role in plain prose unless the original
already backticks it, and diff the span multiset against `git show main:<file>` before handing back.

### 2026-10-29: A test named for a check could not fail when that check was deleted (#27)
`test_color_token_missing_in_dark_is_an_error` removes `--accent`, a required token, so the required-token
check reports it and the separate theme-symmetry loop (`scripts/design_tokens.py:345-348`, "every colour token
present in one theme is a colour token in the other") is never what the test sees. Deleting that loop leaves all 44
tests green, although the design table names exactly that mutation for this row and the commit says every test was
watched going red. Custom tokens (the case the ui-designer seed warns about) are therefore unguarded.
Rule: Watch the named mutation go red for every row yourself; when two checks would report the same fixture, pick a
fixture only the guarded check can see (here a custom colour token in one theme only).
