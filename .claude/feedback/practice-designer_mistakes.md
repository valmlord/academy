# practice-designer mistakes

Lessons appended by judges when this role caused a FAIL. Load before working. Let it grow.

Format:
### YYYY-MM-DD: Short description (#issue)

What happened and why it is wrong.
Rule: One-line rule that prevents this.

### Seed: a check that could not fail

A command check passed on the untouched starter, so it proved nothing.
Rule: Run every check on the untouched starter (must fail) and on the reference solution (must pass).

### 2026-10-27: Grader environment and probe sets are part of the check (#15, design review)

Found at #15 design review: python checks can be forced to exit 0 via a learner-written
usercustomize.py unless run with `python3 -I`; learner code running in the same uid can find the
grader mount via /proc/<ppid>/cmdline and exec `checks/reference/`; a hook/permission check whose
probes are all "must block" passes a block-everything solution.
Rule: Run every python check as `python3 -I`, keep the oracle (scripted model, recorder log, verdict)
outside the learner process, add near-miss "must allow" probes, and try the usercustomize and
read-the-reference cheats in the demonstration.

### 2026-10-28: One file-loading model, implemented twice and inconsistently (#15, judge_content)

L5 `verify_memory.py` resolves `@path` imports correctly in `imports_of()`: the path is relative to
the importing file, and an `@` inside code spans or fences does not count. `check_hookup()` ignores
that and only looks for a raw `@AGENTS.md` line. So `.claude/CLAUDE.md` = `@AGENTS.md` passes,
although it imports `.claude/AGENTS.md`. A `@AGENTS.md` inside a ``` fence passes too, and that
imports nothing. The correct `.claude/CLAUDE.md` = `@../AGENTS.md` fails. The rubric does not grade
the hookup, so in these cases AGENTS.md never loads and the solution still passes.
Rule: When a check models how a tool loads or resolves something, every rule in the check goes
through that one resolver. Then add demo cases where a raw text match and the real resolution give
different answers.

### 2026-10-28: A closed list of dangerous allow rules is never closed (#15, judge_content)

L6 `permissions-policy` rejects broad allow rules from a fixed list (`Bash(sh *)`, `Bash(python3 *)`,
...). `Bash(uv run *)`, `Bash(npx *)`, `Bash(npm run *)`, `Bash(find *)`, `Bash(docker *)` and
`Edit(//**)` are not on it, and each one passes. Each lets the agent run db-reset, curl or anything
else on the host with no prompt (`uv run python -c`, `find -exec`, `docker run -v /:/h`), which
breaks policy item 7. The Makefile was fixed the right way (C11/C12: compare against the pristine
copy). The allow list kept the deny-list approach.
Rule: When the policy names exactly what may run without a prompt, make allow a closed set: accept
only rules from that set and fail any other rule by name. Do not try to list the dangerous ones.

### 2026-10-28: Closing the allow list but not the other keys that grant without a prompt (#15, judge_content round 2)

L6 `permissions-policy` made `permissions.allow` a closed set, but `permissions.defaultMode` is
still a deny list with one entry (`bypassPermissions`). The reference settings plus
`"defaultMode": "acceptEdits"` (or `"dontAsk"`) pass. The same lesson's Makefile check rejects
`claude --permission-mode acceptEdits` (C6), so the check accepts in settings the mode it rejects in
the Makefile. In acceptEdits, edits outside `src/` and `cp`/`mv`/`rm`/`sed` in the working dir run
without a prompt (research-l6, modes table), and `cp .env.staging x` is not covered by the Read deny.
Rule: When you close one channel that grants actions without a prompt, list every other channel the
model knows (allow rules, starting mode, launch flags, hooks) and close each one the same way. Use
one accepted set for one concept, for example the same mode set for `defaultMode` and the Makefile
recipe.

### 2026-10-28: A closed set that drops a documented alias, with one reason line for every value (#15, judge_content round 3)

L6 `permissions-policy` closed `defaultMode` to absent / `"default"` / `"plan"`, but the
permission-modes page says the CLI accepts `"defaultMode": "manual"` (and `--permission-mode manual`)
as an alias of `default`, research-l6 lists it, and the lesson's own theory.md:60 names `default`
"Manual". The check fails `"manual"` with the generic reason "другие режимы пропускают вопросы, на
которых стоит политика", which is false for `manual` (it is `default`) and for `auto` (ignored from
project settings, as task.md:99 itself says). The reason line for `acceptEdits` also claims
`cp .env.staging x` runs without a prompt despite the learner's `Read(.env*)` deny; the permissions
page lists Bash file commands the deny covers only as "such as `cat`, `head`, `tail`, `sed`, `tee`",
so whether `cp` is covered is undocumented.
Rule: When you close a value set, take the full list of accepted spellings from the source, including
aliases, and accept every alias of an accepted value. Give each rejected value its own failure
message that matches the reason stated in task.md. Do not put in a reason line a bypass that the
source does not document; use an example the source states outright.
