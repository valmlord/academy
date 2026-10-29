# #15 judge_design round 2

## judge-pedagogy: PASS (work items for planner, not blocking)
All round-1 items fixed: O1 "называет ограничение" observed via `binding_constraint` enum in
`model-routing`; L1 artifact 40 min; quiz habits; new order models -> loop -> cost -> context -> memory
-> security with concept table walked; bug-hunt list of ranges, anchor rule, ordered decision rule
walked against all 6 bugs. 15 decoys help; hook/deny split clearer; 335 min, ~63% hands-on; outcomes
observable; opening problems present.

Work items:
- A. L2 `mcp-quiz` Q4 (local MCP server risks) needs one line in L2 theory: "a local MCP server runs
  arbitrary code with client privileges; tool descriptions are untrusted". Owner: lesson-author.
- B. Bug 5 (`bloat-subagent-return`) single range: list two ranges, dispatch call and returned result.
  Owner: practice-designer.
- C. Bug 2 (`lost-instruction`): honest learner may point at the auto-compaction line: task.md says
  compaction is an event not an action, or accept that line as a third range. Owners: practice-designer,
  lesson-author.
- D. L1 cards: each card's text makes exactly one constraint binding (avoid quality/price ambiguity in
  "costly multi-file refactor", "simple bulk rename"); accuracy judge reviews `routing_key.json`. L6
  theory/task shows the accepted `WebFetch(domain:*)` ask form. Owners: practice-designer, lesson-author.

## judge-accuracy: PASS (authoring conditions, enforced at judge_content)
All six round-1 items resolved, checked against local doc copies (permissions, tools-reference,
permission-modes, settings-reference, hooks) and live pages (platform effort, CC model-config, CC
memory, MCP 2026-07-28 server/tools: tools/list and tools/call unchanged, "MCP has no protocol-level
session"). Makefile `--dangerously-skip-permissions` flaw real; project bypass line correctly ignored;
MCP names correct.

Conditions:
1. L5 setting: in `/config` "Project instructions"; in settings file
   `pluginConfigs["cc-plugin-agents-md@builtin"].options.instructionFiles` (ID before v2.1.285
   `agents-md@builtin`); values `claude-md-or-agents-md` (default), `claude-md-and-agents-md`,
   `managed-only`; read from `~/.claude/settings.json`, a `--settings` file or managed, ignored in
   project/local; reading AGENTS.md directly needs v2.1.277+; at launch CC loads `AGENTS.md` and
   `.claude/AGENTS.md` from working dir and above: launch-files quiz must account for `.claude/AGENTS.md`.
2. L6 "since v2.1.257" applies only to bypassPermissions ("Before v2.1.257, `bypassPermissions` took
   effect from any file"), not auto. bypassPermissions in project/local -> session starts in Manual mode
   (not built-in auto); auto in project/local -> falls back to built-in default. Security-quiz Q4 key:
   "starts in Manual (default) mode"; "starts in auto as if unset" only a distractor.
3. Security-quiz Q6 (hook exits 1 on Edit into `generated/`): under the module policy the deny rule still
   blocks; failed hook falls through to normal permission flow. Scenario must state no deny rule, or key
   is "blocked by the deny rule; the hook alone would fail open; `onFailure: "block"` makes it fail closed".
4. L1: "same model, different default on CC vs API" works only for Sonnet 5.5 (API high, CC medium);
   Opus/Haiku 5.5 medium on both. `routing_key.json`: 700k-token card binding constraint is context,
   rules out local; all tiers have 1M so tier set must not imply a tier is required for context. Effort
   guidance: Haiku 5.5 start medium, low for simple high-volume; Sonnet 5.5 agentic coding medium, high
   for harder; Fable 5.1 high; xhigh only long agentic runs.
5. Read-only set: hedge "every mode": in Manual, `git` with unquoted glob and `cd`+`git` into another dir
   still prompt; in auto may wait for classifier. Probes unaffected.
6. `!` negation: "documented for deny and ask" (not "not allow").

## judge-assessment: FAIL (owner: curriculum-architect)
Resolved: B2 (`-I`, scratch env, fixed PATH; demo 4a), B3 (oracle, tool results, observation log and
verdict in grader; pipe-backed proxies; learner exit code ignored; runner-only items honestly listed),
B4 (both L6 probe sets two-sided; near-misses defeat substring attacks; exit 2 asserted), B5 (>=2
multiple per quiz; analytic + Monte Carlo; caps hold "always a"/"always longest" to <=2 of 6), L1
`model-routing` (constant answer <=2 of 6 cards, random ~0.003%), clarifications, fail-on-starter /
pass-on-reference plausible for all 8 command checks, bug-hunt, quizzes; contract fit OK.

Blocking:
1. Key reveal after 3 failed attempts makes quiz and bug-hunt passable with certainty (B6 regression):
   attempt 4 after copying the key. Fix: once revealed, check closed as not passed and goes to mentor
   review, or a later pass is flagged "passed after reveal" and doesn't count; record as #10/#08
   requirement.
2. Bug-hunt attack rate miscounted: `lost-instruction` and `no-verification` accept 2 anchor ranges, so
   one block per category hits 2 of 4 there (1/2, not 1/3). Best attack 6 reports one per category passes
   14/768 = 1.82% (> 1% bar); demo would assert wrong 0.93%. "0.27% doubling up" is 0.12% (harmless).
   Fix: 4 decoys each for two-range categories (19 decoys total) -> 0.926% verified, or one range per bug.
   Demo must count every accepted range as a separate episode.

Should fix:
3. L1 cites an attempt cap in 2.5.6 that doesn't exist; "N из 6 карточек неверны" allows enumeration in
   ~hundreds of submissions. Define cap/throttle or list as residual risk.
4. Demo 2.4(4): header says cheats go onto the reference, contradicting 4a (empty starter); 4b PATH shim
   on reference passes either way. State 4a/4b on empty starter, 4c/4d on reference.
5. Hook check feeds a `Read` payload expecting allow, but a hook registered `Edit|Write` never receives
   Read: apply that row only when matcher covers Read, or require a `tool_name` check in task.md.
6. Quiz random rate: 1/11 not "conservative" (key-aware attacker picks among 10 subsets); at 1/10 rates
   0.12% (L1, L6), 0.44% (L2, L3), 0.14% (L5): wording only.

Not blocking: hook registration check accepts a no-op command (`true .claude/hooks/...`) or a file
without shebang/exec bit: stricter command pattern. No must-allow probe for a `generated/` dir outside
`src/invoices` (e.g. `P/tests/generated/<r>.py`).
