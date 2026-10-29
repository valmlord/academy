# Architect Mistakes

Methodology lessons for designing. Seeded with design-discipline lessons; append new
project-specific ones as they are found.

### Missed a deploy/packaging requirement

Designed a new module without accounting for how it gets packaged/imported/installed in the
target environment; the coder then hit a runtime "module not found".
Rule: Every design that adds a module, directory, or dependency must state how it reaches the
target environment (packaging, import path, install/symlink step). The design review checks this.

### Designed against assumptions instead of the researcher's facts

Produced a design based on how the system was assumed to work, not on what the researcher
actually found; the design contradicted the real runtime config.
Rule: Design against the researcher's findings. If a needed fact is missing, ask for it - don't
assume.

### Hand-derived a third-party tool's internal behavior from memory

Modeled a library's internal resource accounting from memory rather than its source/docs, and
the imprecise model sent a later fix at the wrong layer.
Rule: When you rely on a third-party tool's internal mechanics, flag the derivation as unverified
and prefer its DOCUMENTED external contract over guessing at internals. An imprecise internal
claim can send the next fix chasing the wrong layer even when the verdict was directionally right.

### 2026-10-27: .dockerignore secret patterns anchored to the context root only

Issue #1 design excluded `.env` and `.env.*` in a root-context `.dockerignore`. Docker anchors
these patterns at the context root, so `apps/web/.env*` (where Next.js loads env files from)
still entered `COPY . .`, and `next build` with `output: "standalone"` copies `apps/web/.env`
and `apps/web/.env.production` into `.next/standalone/apps/web/` (next/dist/build/index.js,
writeStandaloneDirectory) - i.e. into the shipped runner image. The tester check
(`ls -a /app`) only looked at the image root, so it could not fail on this leak.
Rule: Secret patterns in .dockerignore are always depth-agnostic (`**/.env`, `**/.env.*`),
and the image-leak check searches the whole image (`find / -name '.env*'`) after planting a
canary env file in the app directory, so it can actually go red.

### 2026-10-27: Claimed a test guard is "broken once" when the planned negative run cannot reach it

Issue #1 design: the Playwright smoke records same-origin responses >= 400 so it "catches missing
/_next/static", and the failure-mode table says every guard is broken once (tester checks 8, 12).
Check 12 only stops the web container. That turns the test red at `goto` before the >= 400
assertion runs, so it shows nothing about that assertion. A listener attached too late, or an
origin filter that never matches, would leave the static-asset guard always green while the table
reports it as verified.
Rule: For each assertion a test adds, the negative run must break exactly the thing that assertion
guards, with everything else still healthy. Example: the server is healthy but `.next/static` is
removed, and the run turns red on that assertion. Killing the whole service only proves the test
can reach the service.

### 2026-10-27: Negative-run cleanup restores a file with git when the file is part of the pending diff (#1)

Issue #1 design revision 2, tester check 18: `echo >> README.md`, run the dirty-tree script, then
`git checkout README.md`. The same design edits README.md (the "Web app" section), and the tester
runs before the commit phase, so the checkout silently throws away the coder's README work. Check
9b has the same shape: it edits `.dockerignore`, a new untracked file, then relies on `git status`
to prove it was restored; git cannot restore an untracked file and shows `?? .dockerignore` either
way, so the "restored" assertion cannot fail.
Rule: A check that mutates a file to force a red run must restore it from a backup copy taken just
before the mutation (or mutate a file outside the pending diff), and must prove the restore with
`cmp`/`diff` against that backup, never with `git checkout` / `git status` on files the change itself
adds or edits.

### 2026-10-27: Tester shell recipe assumes one persistent bash session (#1)

Issue #1 design revision 3, section 11. The recipe keeps `SCRATCH` and the `fp`/`fp_check` helpers
as shell variables/functions and chains "backup; mutate" with `;`. The tester runs through the Claude
Code Bash tool, which starts a fresh zsh per call: variables and functions are gone in the next call.
With `SCRATCH` empty, check 9b's `cp .dockerignore "$SCRATCH/dockerignore.bak"; awk ... > .dockerignore`
fails the backup and then truncates the untracked `.dockerignore` to 0 bytes (reproduced), the exact
data loss revision 3 set out to prevent; check 8 breaks course-list.tsx with no backup the same way.
Checks 7/10 start `pnpm dev` with `(set -m; ...)`, which zsh rejects ("can't change option: -m"),
so the dev server never starts.
Rule: Write tester shell steps for the shell that will actually run them (one fresh zsh per call):
persist helpers and paths in a file at a fixed path and source it each call, guard with
`: "${SCRATCH:?}"`, chain backup and mutation with `&&`, and run job-control snippets under an explicit
`bash -c`. Execute every non-trivial snippet once in that shell before handing it over.

### 2026-10-27: Delegated gate code to a checkout without bounding whose code may decide (#21)

Issue #21 design, section 2.2: the dispatcher runs the resolved checkout's OWN hook scripts, and the
resolver accepts any directory whose `git rev-parse --git-common-dir` equals main's `.git`. That check
is passed by a bare directory holding a `.git` file `gitdir: <main>/.git` (reproduced: it reports the
same common dir and is absent from `git worktree list`), and by any registered worktree checked out at
an old commit (`git worktree add <p> c66e1a0`), whose pre-v2 require-pipeline computes REL against the
worktree, so main's `.claude/pipeline_state.json` and `.claude/hooks/*` become plain writable paths once
that worktree has any active tier. A `cd` (or an inherited `PIPELINE_CHECKOUT`) then puts every gate of
the session under scripts the agent chose, defeating decision 4 and state protection with no PIPELINE
tier and no gated write. Separately, `.claude/settings.local.json` stayed outside `pipeline_core_files`,
so a Write to it (`disableAllHooks`, `env`) is always allowed by the `.claude/*` rule.
Rule: When gate code is chosen from data an agent can influence (cwd, env, checkout contents), state
the trust bound explicitly and enforce it in code the agent cannot swap: accept only registered
worktrees, let a checkout's scripts decide only about files inside that checkout, keep a floor check
in the dispatcher for every checkout's state/core/settings files, and list every file that can switch
hooks off as pipeline core.

### 2026-10-27: Real-state migration designed against the wrong branch's code (#21)

Issue #21 design 2.8: park live #1 in main, "later, on feat/1-web-bootstrap, `resume 1` restores it".
feat/1-web-bootstrap (4cda2ba) branches off 5c4d853, before v2. Hook scripts run from the checkout's
own working tree (decision 1), so on that branch `pipeline-advance.sh resume` does not exist, and its
old `.gitignore` leaves `.claude/pipeline_state.parked/` untracked, which trips the dirty-tree gates.
The same design also claimed "every row has a mutation in section 11" while D1, D4, D7, D9, D12, B1,
B4, B8, B12, A4, A5 had none, and made `init` refuse on a renamed branch although scope C says a
differing `branch_at_init` must not block init and parking would have lost nothing.
Rule: For every step that touches real state, name the branch/commit it runs on and check that the
code and ignore rules it needs exist there (`git merge-base`, `git show <branch>:<path>`). Every
"each test has a negative run" claim lists the mutation per row, and every deviation from a scope
item is stated as a deviation with its reason.

### 2026-10-27: Rollout, rollback and verification steps not tied to what is actually on disk (#21)

Issue #21 design (operations review). Section 12 creates the live-check worktree with
`git worktree add ... -b chore/998-live-wt` from HEAD but never says v2 must be committed first, while
"Step 11" runs "after the tester and judges", i.e. before the commit phase: the worktree would get the
pre-v2 tree and L2/L3 would certify the dispatcher's fallback, not v2. Rollback is only "re-disable
hooks"; reverting v2 leaves `.claude/pipeline_state.parked/` untracked under the old `.gitignore` (Stop
and PR dirty-tree gates block), strands parked #1 with no `resume`, and leaves a never-deleted
`.lock` that the old O_EXCL vote path waits 5 s on. The F1 mutation cannot go red: the tester's `mut`
helper itself excludes worktrees/settings.local.json/state from the copy, so run.sh's filter has
nothing to filter. `dispatch.sh` reads `root<TAB>source<TAB>gitdir` with default IFS, which splits
the test repo's deliberate "work dir" path. "Never fail open" is false when python3 is missing: every
gate exits 0 and nothing is logged.
Rule: Every operational step names the commit it runs against and its precondition (committed,
rebased, ignored); every design ships a rollback section (kill switch, revert, leftover runtime
files); every mutation is checked against the harness that will run it (does the copy still contain
the condition the guard detects?); pseudo-code that parses paths is checked against the test suite's
own paths; a "never fail open" claim is walked through "interpreter missing".

### 2026-10-27: Mutation table rows whose mutation misses the test, or whose test cannot pass (#21, round 2)

Issue #21 design rev 2, table 2.13. A9 "concurrent advance and vote lose nothing" is paired with the
mutation "set_artifact bypasses transaction()", but neither `advance` nor `vote` calls set_artifact
(2.4), so the mutated run stays green. C1 "init parks a state copied from another checkout" with the
mutation "treat any gitdir_at_init as matching" falls through to the next init row, `branch-switched`,
which also parks: green unless the test asserts `parked_reason == foreign`, which the row does not say.
S8 (PATH holds only `cat`) cannot pass on the design itself: 2.11 sources common.sh via
`$(dirname "$0")` and common.sh computes CODE_ROOT with `realpath`; both are external binaries
(/usr/bin/dirname, /bin/realpath), so sourcing fails before the python3 probe and the gate exits 1,
i.e. fails open. S5 is scheduled in coder step 3 but its setup "PIPELINE active" needs the tier added
in step 7. F1's copy check exits 1 without saying it prints the `FAIL <name>` line step 11.1/6 greps.
Rule: For every mutation row, trace the mutated code path through the exact test setup and name the
assertion that distinguishes it (reason field, count, message text), checking that no later branch
(next table row, fallback) produces the same observable; walk "tool missing from PATH" for every
external command a hook runs before its own probe; check each test's setup only uses features added
in or before the step that adds the test.

### 2026-10-27: Treated "registered worktree" as trusted and let tier switches bypass the tier rules (#21)

Issue #21 design revision 2. The resolver and the write gate trust any root listed by
`git worktree list` ("the only source an agent cannot fake"), but registering one is a single
unguarded shell command: `git worktree add <main>/.claude/hooks/lib/json <orphan-branch>` (no write
verb, no blocked string). `checkout_of` then picks that nested root as the owner (longest prefix), so
REL is no longer `.claude/hooks/...` and the core rule does not apply to tool writes there; worse,
hook Python runs with `lib/` as `sys.path[0]`, so the nested `json/__init__.py` shadows the stdlib
module and runs inside main's gates (reproduced). Separately, `pause` + `init PIPELINE <n>` (or
`pause` of a LEARN state + `init TASK`) turns the "core only in PIPELINE" and "learner writes the
code" rules into two unauthenticated commands, where v1's init at least refused while a state was
active. And the absolute always-blocked zones omit `~/.claude/settings*.json`, the user-level
equivalent of the `settings.local.json` kill switch that D-5 made core.
Rule: Any trust anchor an agent can create with one command (worktree registry, branch, state via a
documented CLI) is not a trust anchor: evaluate main's core/state/git paths as absolute zones before
any ownership mapping, accept only worktrees outside main's tree or under `.claude/worktrees/`, and
for every tier rule ask "which command switches the tier, and who may run it?".

### 2026-10-27: TAB-separated read with IFS=$'\t' collapses empty fields; precondition grep on the wrong field (#21)

Issue #21 design revision 2, 2.1/2.2: the context line `state_root, source, gitdir, branch, main_root,
tool_name, state_status` is read with `IFS=$'\t' read -r`. TAB is IFS whitespace in bash, so consecutive
TABs collapse (reproduced: `a\tb\tc\t\te\t\tg` gives 5 fields, the last two empty). `tool_name` is empty on
every Stop/SubagentStop event and for pipeline-advance's empty-stdin call; `branch` is empty on a detached
HEAD. The fields shift and STATE_STATUS reads empty, i.e. "no state": phase-complete allows Stop (fails
open) and the LEARN shell rule is lifted. The fix for "paths with spaces" introduced it. Section 12 R1
checks `git log -1 --format=%s | grep -q '#21'`, but the convention (and a58679d itself) puts `Refs #21`
in the body, and the v2 PR gate reads `%B`: as written R1 never prints R1_OK and the rollout halts silently.
Rule: Machine-readable lines between scripts use a non-whitespace separator (`\x1f`) or a placeholder for
empty fields, and the test suite includes a row with every optional field empty. Every precondition
command is run once against the real commit it will check before it is handed to Stepan.

### 2026-10-27: A new fail-closed check silently absorbed an older test row's mutation (#21, round 3)

Issue #21 design revision 3 added to common.sh step 5 "STATE_STATUS empty -> gate exits 2 `pipeline
resolver failed`" (for S9). B18 (`context line keeps empty fields`) still asserts only "phase-complete
blocks, rc 2" and claims its TAB mutation makes Stop "allowed". Under that mutation the fields collapse
(reproduced on bash 3.2.57: `[r][s][g][m][own:PROJECT:coder][][]`), STATE_STATUS is empty, and the new
check blocks with rc 2: the row stays green, so it cannot fail. B18 is also scheduled in coder step 2,
while `gitdir_at_init` arrives in step 6: with the legacy branch rule a state on a detached HEAD is
foreign, so Stop is allowed and B18 is red on the correct code in step 2.
Rule: After adding any fail-closed branch, re-trace every existing mutation row whose broken path now
reaches that branch, and assert the message, not just the exit code, whenever two code paths share
an exit code. A row whose setup depends on a field (here `gitdir_at_init`) goes in the step that adds the field.

### 2026-10-27: B18 cannot fail, confirmed by operations; human-run steps without commands (#21, round 3)

Operations judge, independently of the entry above: simulated common.sh step 5 plus phase-complete for the
B18 setup with both separators. `\x1f` blocks with phase-complete's own reason; the TAB mutation blocks
with `pipeline resolver failed`; both rc 2, so the row as written stays green. The real hazard of the
mutation is spurious blocking (every Stop and every detached-HEAD call fails closed), not "Stop allowed".
Separately, 2.9a tells Stepan to write and later trim the grant file "by hand in an editor" but gives no
exact command to create it, validate it, or remove an issue, while every other Stepan step in section 12
has one.
Rule: A mutation row asserts the distinguishing message, and its stated failure mechanism is reproduced
before it is written down. Every step a human performs gets copy-paste commands plus a check command.

## 2026-10-27: Wrote a path-prefix list that the shell guard reused as a substring rule (#21)
Design 2.7/2.12 listed pipeline core as `.claude/hooks/` with a trailing slash, and D11 tested only
`.claude/hooks/x.sh`. The shell guard matched that string verbatim, so `rm -rf .claude/hooks`,
`mv .claude/hooks x` and `rm -rf .claude` passed outside PIPELINE; removing the hooks directory makes
every hook exit 127 (non-blocking), so all gates fail open. Design 2.3 (logs carry only relative
paths) also contradicted 2.6 step 4 (REL is absolute when no checkout owns the path).
Rule: A protected directory is specified for both matchers: as a path prefix for tools and as a
directory token (with and without a trailing slash, plus its ancestors) for shell commands, with a
test row for each spelling. Cross-check every "only"/"never" claim against the steps that produce it.

### 2026-10-27: Residual-risk list written from the old regex; moved gate code got an exit-code collision (#23)

Issue #23 design 2.9 has ADR-0005 item 7 say `.claude//hooks` passes the shell guard. Under the new
2.4 rule, `.claude/` followed by `/` matches `/(?![\w.-])`, so that spelling is now blocked. Spellings
that still pass are not listed: `.claude/./hooks`, `.claude/h{ooks,}`, `.claude/h""ooks`. The 2.4
header also claims braces are covered, but a brace after the first character of the component is not
(alt 3 knows only `*?[`). Separately, 2.7 moves the gate code into `lib/*.py` but keeps the contract
"exit 2 = block, stdout `<reason>\x1f<message>`". CPython itself exits 2 when it cannot open the
script (a missing or unreadable `lib/write_gate.py` or `lib/shell_guard.py`). The wrapper then
denies with an empty message and an empty log reason, not as `gate-crash`. The wrapper still blocks,
so this does not fail open. But this failure mode is new with the refactor and appears in neither
section 7 nor section 3.
Rule: Derive every "still passes" or "now blocked" spelling in a residual-risk list by running it
against the NEW pattern, never the old one. When code moves out of a wrapper into a file the
interpreter opens, check the interpreter's own exit codes against the wrapper's contract. Add a row
that makes the new file unreadable and asserts the crash message.

### 2026-10-27: Live-edit rollout claimed "one gate per step" while steps edit code both gates share (#23)

Issue #23 design, F1 and section 10: the hooks are edited live in the main checkout, and the stated
mitigation is "at most one gate changes per step, repair a broken gate through the other one". Steps
2 and 5 edit `lib/checkout.py` (`LOG_FIELDS`, `_context`) and step 2 edits `lib/common.sh`; step 9
re-annotates `cfg.py`, `checkout.py`, `state.py`, `hookio.py` and adds a raising validation to
`cfg.load()`. `common.sh` runs `checkout.py context` for every hook, and both gates import `cfg` and
`checkout`. One NameError, one 3.10-only annotation evaluated on a 3.9 Mac, or a `ConfigError` on the
real pipeline.json makes `require-pipeline.sh` and `bash-code-guard.sh` fail closed together. No Write
or Bash can then repair the file, and only the kill switch plus a new session gets out. The section 10
procedure ("make the change, then run run.sh") puts every change live before any test has run.
Rule: In a live-edit rollout, list for each step every file that more than one gate executes
(common.sh, resolver, config loader, shared lib). For those steps, apply the change to a scratch
export and run the suite there first. Only then copy the change into the live tree, as one write per file.

### 2026-10-27: Assumed a broken shared hook file always fails closed (#23)

Issue #23 design, F1: the recovery story assumes a broken gate blocks, so the other gate or the kill
switch can repair it. Checked on a scratch export: a syntax error in `lib/checkout.py` or `lib/cfg.py`
makes both gates exit 2 for every command, `ls` included (lockout). But a syntax error in
`lib/common.sh` (edited live in step 2) leaves `run_hook` undefined, and both gates exit 127. Claude
Code treats 127 as a non-blocking error, so every guard is silently off for the rest of the session.
The same design also told the coder to build the local mypy venv with `python3 -m venv`. On this Mac
that is 3.9.6, which cannot install the only mypy line that still targets 3.9 (1.19.x/1.20.x need >= 3.10).
Rule: For each live-edited shared file, establish what the hooks do when that file is broken (exit 2,
exit 127, or a traceback) by breaking a scratch copy. Do not assume "fail closed". Name the interpreter
that each tool command actually runs on the target machine.

### 2026-10-28: Generic "gates exit 2" fallback breaks the Stop hook's no-loop rule (#23)
Design rev 2 section 2.10 gave every HOOK_KIND=gate script the same fallback when lib/common.sh
does not load: print BLOCKED and exit 2. phase-complete.sh is a gate on the Stop event, where its
own contract (header line 4, run.sh row "stop not blocked twice (stop_hook_active)") is to block at
most once per turn. An unconditional exit 2 blocks every Stop, so in exactly the lockout where the
orchestrator must stop and hand over to Stepan, the session is re-prompted again and again until a
human interrupts it. T15 did not cover phase-complete.sh, so no row would notice.
Rule: When one fallback is applied to all scripts of a kind, walk each script's event (PreToolUse,
Stop, SubagentStop, PostToolUse) and check that the fallback still honours that script's own
invariants; give each event its own test row.

### 2026-10-28: "Unreadable imported module = crash" ignores the bytecode cache (#23, round 2)
Design rev 2 T18/F16 says `chmod 000 lib/pl_gate.py` makes both gates crash with rc 1, because
the import fails. In fact `pl_gate` is imported, not run as a script. Earlier suite rows have
already written `lib/__pycache__/pl_gate.cpython-39.pyc` into the `$WORK` copy, and `python3 -I`
does not stop bytecode writes. CPython's SourceLoader only stats the source (stat works on a
mode-000 file), finds a pyc whose mtime and size match, and loads that without ever reading the
source. So the gates keep working and T18 is red on correct code. Under its own mutation the row
cannot distinguish anything either. The existing chmod rows (`run.sh:402`, `:424`) and T16/T17
only work because they make a script that CPython opens directly unreadable, and directly run
scripts are never cached.
Rule: When a test makes an *imported* Python module unreadable or broken, account for
`__pycache__`. Remove the cache directory first, or make it unreadable too, or change the
source's mtime/size. Then confirm the crash on a scratch run before the row goes into the table.

### 2026-10-28: Rows that contradict the design's own code path, and a typing order that cannot pass (#23, round 2, architecture)
Design rev 2: (1) T16/T17 assert "last log line `gate-no-verdict`", but 2.7 has the wrapper log
`gate-no-verdict` and then `return 70`, after which `run_hook` (`common.sh:111`) logs `gate-crash`.
The last line is always `gate-crash`, so both rows are red on correct code. (2) 2.5 has the marker
helper catch `UnicodeError` and log. T11(c) still claims that a strict `encode("utf-8")` crashes
`_context`. If the encode sits inside that try, the mutation is absorbed and the row stays green.
If it sits outside, the `UnicodeError` handler is dead code. The design does not say which.
(3) Step 10b types `hookio` before 10c types `checkout`, and requires "mypy on that module clean".
But `hookio.py:45` calls `checkout.code_root()`, and `--strict` reports `no-untyped-call` in
hookio itself until checkout is annotated. So 10b's gate is unreachable.
Rule: Trace every assertion through the full wrapper chain, including the trailing `run_hook`
mapping and its log line, before writing it down. A mutation must not land inside a handler the
same design adds. Order strict-typing steps by the import graph, callees first.

### 2026-10-28: Post-merge step relied on a GitHub feature the repo plan does not have (#23)
The #23 design (section 12, F20, line 260) told Stepan to make `pipeline-types` a required status
check on `main`, and the coder echoed it in the ci.yml comment ("the name the required-checks rule
uses"). `valmlord/academy` is a private repo on the free plan: both
`gh api repos/valmlord/academy/branches/main/protection` and `.../rulesets` return 403 "Upgrade to
GitHub Pro or make this repository public". No required-checks rule exists or can exist, so the
step is unexecutable and the comment describes a rule that is not there. The real merge guard is
Stepan checking `gh pr checks` before he merges.
Rule: Before a design relies on a platform feature (branch protection, rulesets, required checks,
environments), call its API on the real repo and quote the answer; a 403/404 means the design
needs another enforcement point.
