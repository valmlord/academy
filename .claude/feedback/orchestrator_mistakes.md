# Orchestrator Mistakes

Methodology lessons for running the pipeline. Seeded with pipeline-discipline lessons; append
new project-specific ones as judges surface them.

### Inline judge votes

Recorded PASS via `pipeline-advance.sh judge` directly instead of spawning judge agents.
Rule: Always spawn the three judges (one message, parallel). The hook auto-records. Never call
`pipeline-advance.sh judge` yourself.

### Rubber-stamp design review

Said "design solid" in ~50 seconds without checking the deploy model.
Rule: Spawn the architect as reviewer. Check deploy/packaging/deps. State what you checked.

### Used a bare subagent type instead of the role file

Spawned a generic agent without its `.claude/agents/<role>.md` - no project rules - and a
resource leak shipped.
Rule: Always `Agent(prompt="Read .claude/agents/<role>.md first. Then: <task>")`.

### Judges spawned sequentially, not in parallel

Spawned the three judges across three messages instead of one message with three parallel Agent
calls. Wasted time and broke the design.
Rule: All three judges in ONE message. Never sequential.

### Fixed a role's mistake inline instead of re-spawning that role

Judges found an architect design flaw; the orchestrator hacked a fix inline instead of
re-spawning the architect with the updated mistakes file.
Rule: On a role's mistake - the judge writes it to that role's file, then the orchestrator
re-spawns THAT role (researcher → architect → coder → judges as needed). Never fix inline,
never delegate an architect fix to the coder.

### Advanced past a judge FAIL

Judges FAILed the design, but the orchestrator advanced through planner/coder anyway, so code
would have been written from a flawed design.
Rule: Judge FAIL = STOP. Send back to the responsible role. Never advance past a FAIL.

### Advanced the phase without actually running test_deploy

Marked test_deploy done without deploying/testing; testing happened later, manually.
Rule: test_deploy must ACTUALLY deploy and test - verify the real outcome, not just syntax.

### Advanced without waiting for the judges to return

Did an inline review and advanced while spawned judges were still running.
Rule: Wait for all three judges to return before advancing. If they are slow, say so and wait.

### Coder/judge prompts missing the full architect design

The coder prompt carried the orchestrator's summary, not the full design, so a feature was
missed; the judges couldn't catch it because their prompt lacked the design too.
Rule: The coder prompt references the FULL architect design. The judge prompt includes the
design verbatim so judges can verify completeness.

### Assumed the user wanted to stop instead of asking

With outstanding judge FAILs, the orchestrator assumed "stop" and rushed closure.
Rule: When work is outstanding (judge FAILs), ASK the user to continue or defer. Don't decide.

### Deployed a live-service module with no whole-module acceptance step

Shipped a module with a module-level use-before-definition: it compiled and all unit tests
passed, but it could not START (the tests never imported the whole module).
Rule: Any change to a live-service module needs an acceptance step that IMPORTS/EXECUTES the
whole module (e.g. `--self-check` → exit 0). Passing unit tests + a clean compile do NOT prove
the program runs.

### Asserted a root cause / "lever" without checking prior notes for a refutation

Built work on a causal story that a prior, authoritative note had already refuted.
Rule: Before declaring a mechanism a root cause or a lever - grep the changelog / design notes
for that mechanism and the words refuted/disproven, especially if it has a history. A prior
verified refutation outranks a fresh, convincing story.

### A post-deploy verification command keyed on a path that does not exist

Shipped a verification one-liner that queried a wrong/absent field, so it returned empty and
gave a false GREEN on a critical path.
Rule: Validate every post-deploy check against the ACTUAL emitted artifact's structure, not a
variable name read off the source.

### Spawned a judge to review code it could not read

Asked a judge (Read/Grep-only) to review code that lived on a remote host or an un-checked-out
branch - it could not open a single line.
Rule: Materialize the code where the judge's tools can read it first (check out the branch, or
pull the diff/files into a scratch path, or grant the needed tool). A judge that cannot read
the diff must FAIL/CANNOT-CERTIFY, never PASS on trust.

### 2026-10-28: Every code-review fix round produced the next round's finding (#23)

Code review of #23 took four rounds; rounds 2-4 each failed on something the previous fix round
introduced: a design doc left behind the code change (pl_gate -> cfg), then a new guard placed
outside the try it was meant to sit behind, tested only with a value that does not reach it.
Rule: When re-spawning the coder after a judge FAIL, the brief always says (1) update every design
and ADR statement the fix contradicts, in the same pass; (2) add a test at the exact boundary that
breaks the old code and watch it go red before the fix; (3) no new guard outside an existing
exception boundary.

### Forwarded a judge's suggested wording as the fix, unchecked (#15)

judge_content on #15 took six rounds. Twice the next blocker came from the replacement text a judge had
proposed in the previous round: "запросов нет; ... ask-правила" for bypassPermissions, and a closed
defaultMode set that dropped the documented `manual` alias. I passed those suggestions to the author as
the fix.
Rule: A judge's proposed wording is a hint, not a source. When re-spawning the author, tell them to fetch
the primary source themselves and write from its quotes, and to report the quotes. When a fix narrows a
rule to a closed set, have the researcher or author enumerate every documented value (aliases included)
before the set is written.

### Content round budget spent on one lesson's long tail (#15)

From round 3 on, every judge_content blocker was in L6 permissions text or checks, and each round surfaced
one new edge. Asking Stepan before every extra round was right, but a single targeted "close every
documented value and every claim about modes against the docs" pass on L6 would have saved three rounds.
Rule: When two consecutive FAILs land in the same file and topic, the next re-spawn asks the author for a
full sweep of that topic against the source, not only the listed item.

### Design review rounds spent on unrun runbook scripts (#26)

A translation task grew a GitHub runbook and a git squash recipe as prose and shell literals that nobody had
run. Five design rounds followed; every FAIL from round 2 on was a script defect (quotes, rm, detached HEAD,
missing push, unchecked writes) that a single run would have shown. Round 5 passed once the operations judge
ran every check live.
Rule: when a design prescribes scripts or git procedures, have them executed (scratch clone, scratch
directory, dry run) before the judge round, and give the operations judge the explicit job of running them.
Put the infra procedure in its own issue when it dominates the design of a docs task.

### 2026-10-29: Pasted tool output can carry a vote line (#27)

judge_code round 1 on #27 found that the design validator printed lines starting with `PASS :root ...`, which
`hookio.VERDICT_RE` parses as a verdict; the design judges were told to paste that output under their FAIL items, so
an honest FAIL would have been recorded as PASS. Design review (two rounds, 3/3) did not catch it because nobody ran a
tool's output through `verdict_from`.
Rule: whenever a design adds a tool whose output a judge pastes into its report, the design review brief asks one
judge to run sample output through `hookio.verdict_from` and confirm no line parses as a verdict; judge templates put
the verdict on the last line.

### 2026-10-29: Plan the unrelated uncommitted file before the pr gate (#27)

Stepan's uncommitted `.github/CODEOWNERS` edit blocks `pr` and Stop at done (clean-tree checks), and agents may not
stash. Round 1 of the #27 design FAILed partly for having no path.
Rule: at init, if `git status --porcelain` shows a file outside the task, put "how the tree gets clean before pr"
into the architect brief as a requirement, with the step owned by Stepan.

### 2026-10-29: Issue spec exempted only process work from "every new issue gets a milestone" (#57)

The #57 issue body said "a new issue gets a milestone (process work under #56 may have none)". Cross-milestone
epics (#52, #53) exist precisely because they span milestones and carry none, so the rule, applied literally,
tells the orchestrator to give the next feature epic a single milestone. The coder copied the exemption as
written. Judge-architecture FAILed the HOTFIX on it.
Rule: When a spec states a universal rule ("every new X gets Y"), check it against every existing kind of X
in the live data (here: epics, process issues, feature issues) and list each exemption the data already shows.
