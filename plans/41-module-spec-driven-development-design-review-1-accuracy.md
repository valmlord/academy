# #41 design review, round 1: judge-accuracy

Design: `plans/41-module-spec-driven-development-design.md` (revision 1). Inputs: research R and addendum RA.
Reviewed 2026-10-29. Verdict: FAIL, 5 blocking items.

## What I checked (primary sources fetched live on 2026-10-29)
- H, https://code.claude.com/docs/en/hooks.md: the exit-code output table; the Stop/SubagentStop/TaskCompleted
  missing-file exception; "Exit code 1 without valid JSON output is a non-blocking error"; the Stop input fields;
  the `stop_hook_active` sentence; the 8-consecutive-continuation cap, its reset on a tool call and
  `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`; the Stop decision table (`decision`, `reason` "Required when", `additionalContext`
  "The conversation continues so Claude can act on it"); "routes the same way as `reason`"; "uses that decision's
  reason instead"; `continue` "Takes precedence over any event-specific decision fields"; `onFailure` "has no effect"
  on Stop; the matcher table ("Stop | no matcher support", "silently ignored"); `async` "can't block or control";
  `asyncRewake` "wakes Claude on exit code 2"; `if` "never runs"; `once` "ignored in settings files"; `shell`
  "Ignored when `args` is set"; "discarding the hook's output"; command timeout default 600; the JSON-on-exit-0
  rule (array and string count as plain text); `${CLAUDE_PROJECT_DIR}` "stays put" and `cwd` "follows Claude";
  the type values; the exit-2 rows for Stop, SubagentStop, TaskCompleted and PostToolUse. Every 2.8 quote matches H.
- G, https://code.claude.com/docs/en/hooks-guide.md: "the JSON alone decides the outcome"; "eight times in a row with
  no tool call"; the `stop_hook_active` early-exit example; the unrecognized-keys debug line; the matcher row
  including `CwdChanged`. All match.
- BP, https://code.claude.com/docs/en/best-practices.md: "makes you the test suite"; the strictness levels; the
  deterministic/non-deterministic table; "asks *another model* to decide ... use a `command` or `http` hook"; the
  interview into SPEC.md and the fresh session; the release skill with `disable-model-invocation: true`. All match.
- https://code.claude.com/docs/en/goal.md: "It doesn't run commands or read files independently"; 4,000 characters;
  wrapper around a prompt-based Stop hook. Matches.
- S, https://code.claude.com/docs/en/skills.md: the 20 field names (counted); the boolean spellings sentence; "A field
  name must match the table exactly"; `---` on line 1 and "loads with no fields set"; the invocation table and the
  `user-invocable: false` sentence; `allowed-tools` pre-approves and does not restrict; `verify`/`simplify` before
  commits (v2.1.286, docs/tests exception, removed by `disable-model-invocation: true`); the bundled `/verify`
  description; a skill replacing the bundled command; skill over `.claude/commands/`; the 500-line rule;
  `/skill-doctor` 2.1.252, `/doctor prompt-audit` 2.1.283, `claude plugin validate` 2.1.233; "Seeing a skill
  trigger"; `.agents` absent from the page. Also the section "Using skill frontmatter outside Claude Code" (B1).
- SPEC, https://agentskills.io/specification.md: `name` rules, `description` 1-1024, `compatibility` 1-500, `metadata`,
  `allowed-tools` (Experimental), progressive disclosure, "under 500 lines", "one level deep ... Avoid deeply nested
  reference chains". Match.
- PBP, https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices: "All reference files should
  link directly from `SKILL.md`"; the too-deep example; "The instruction file (`forms.md`) references the script" (B3).
- mattpocock/skills: releases (v1.3.2 marked Latest, 29 Oct); README taxonomy and the "owning the process" line;
  `tdd`, `to-spec`, `to-tickets`, `grilling`, `domain-modeling`, `GLOSSARY-FORMAT.md` and `ADR-FORMAT.md` at tag v1.3.2.
  Quotes match. The three ADR criteria are confirmed as "All three must be true".
- Nygard 2011 (sections, statuses, "Numbers will not be reused", superseded ADRs kept), MADR 4.0.0
  `template/adr-template.md` (status values, heading levels: B2), Böckeler SDD (15 Oct 2025, the three levels,
  sledgehammer, markdown review), Böckeler TDD memo (finding, 8.5x/3.0x/4.9x, mutation testing, stopped asking
  for test-first, small sample), Kiro feature-specs (EARS WHEN/SHALL, Requirements-First/Design-First, updated
  2026-08-04), Spec Kit README ("independent entry points, not mandatory phases") and its agentic-sdd reference
  (`analyze` read-only, `converge` append-only, "Converged"), OpenSpec `docs/cli.md` (`validate` flags,
  `--archived` "handy in a pre-commit hook"), Codex hooks (Stop: JSON on exit 0, plain text invalid, matcher
  unused, `continue:false` precedence), Fowler bliki Aggregate and BoundedContext.
- CPython 3.12 `Lib/unittest/loader.py` `discover()` (B4). CC CHANGELOG: top entry 2.1.312. I did not reach the
  2.1.218 or 2.1.186 entries in the 1.1 MB file; S confirms the boolean rule itself.
- Module 00: `00-introduction/06-permissions-security/theory.md:95` and its starter layout (B4, B5).

Corners walked for the 2.8 verdict model: exits 0, 2 and 1 against empty stdout, an object with and without
`decision`, and `continue:false`. For exit 2 I took stderr with and without the missing-file wording, and with
non-empty stdout, where the exception does not apply. Every row matches H/G. Every unverified form (block without
`reason`, `approve`, `continue:false`+exit 2, a quoted boolean) is rejected as outside the exercise, and no CC claim
is made about it. The 2.8 vendor emulation is accurate.

## Blocking items

### B1. A rule for Anthropic upload surfaces is presented as universal: "a hard error outside Claude Code"
- Design: L2 theory "CC-only fields a hard error outside CC"; L2 check `verify` message "not portable: a hard error
  outside Claude Code"; skills-quiz Q6 key "CC-only field is a hard error outside CC".
- Source: S, section "Using skill frontmatter outside Claude Code". The table scopes the six-field limit to
  "claude.ai skill uploads, the Skills API, and packaging with `package_skill.py` from anthropics/skills". Then: "If
  you include any field the spec doesn't allow, packaging or upload fails with a hard error instead of ignoring the
  field". R 2.3 (in this design's own inputs): Cursor "supports `paths`, `disable-model-invocation`, `metadata`".
  So such a field is no hard error in Cursor.
- Required change: say "a hard error when the skill is packaged or uploaded to claude.ai or the Skills API (S)". Say
  in theory that other clients treat extra fields their own way (Cursor reads `disable-model-invocation`, R 2.3).
  The Q6 scenario ("fails on upload to the API") is correct already. Only its explanation must keep that scope.

### B2. The "MADR 4.0.0 shape" the grader accepts is not the MADR 4.0.0 template
- Design 2.7: the grader accepts "front matter `status:` ... and `## Context and Problem Statement`,
  `## Decision Outcome`, `## Consequences`". L4 near-miss: "MADR-shaped ADR with front matter" must pass.
- Source: the MADR 4.0.0 `template/adr-template.md` headings, in order, are `## Context and Problem Statement`,
  `## Decision Drivers`, `## Considered Options`, `## Decision Outcome`, `### Consequences`, `### Confirmation`,
  `## Pros and Cons of the Options`, `## More Information`. In the template, Consequences is a level-3 subsection
  under Decision Outcome. The front matter is marked "optional metadata elements" and writes the status in quotes
  (`status: "{proposed | rejected | ...}"`).
- Required change: accept `### Consequences` under `## Decision Outcome`. Accept a status scalar in double or single
  quotes. If the exercise requires `status` (MADR makes it optional), say it is the exercise's rule. Add the
  verbatim MADR 4.0.0 template, filled in, to the L4 and L6 near-miss must-pass sets.

### B3. The L2 chain rule rejects a pattern PBP shows as correct
- Design L2 check: "a Markdown file referenced from SKILL.md contains no relative reference (same patterns, or a
  Markdown link) to another file of the skill except SKILL.md itself". The "same patterns" include `scripts/<path>`
  and `${CLAUDE_SKILL_DIR}/<path>`. The check cites PBP "All reference files should link directly from `SKILL.md`".
- Source: PBP, "Provide utility scripts": "The instruction file (`forms.md`) references the script, and Claude can
  run it without loading its contents into context". PBP's chain warning is about files Claude reads ("Claude might
  partially read files when they're referenced from other referenced files"). Scripts are run, not loaded (S:
  "executed, not loaded", R 2.2).
- Required change: a chain is a reference from a referenced Markdown file to another file that is read (Markdown or
  text: `.md`, `.txt` and similar, under `references/` or the skill root). A reference to `scripts/...` from a
  reference file is allowed. Add a near-miss must-pass: SKILL.md -> `forms.md` -> `scripts/fill.py`.

### B4. The fixed test command does not run on the module's layout, and the "wrong directory" trap is misdescribed
- Design 2.8: the hook runs `python3 -m unittest discover -s tests -t .` in `$CLAUDE_PROJECT_DIR`. The 2.6 bootstrap
  uses `discover(<tmp>/tests, top_level_dir=<tmp>)`. The starter is module 00's `invoice-service` (`src/invoices/`,
  `tests/` with no `__init__.py`; tests do `from invoices.api import handle`). L1 row 3 expects "Ran 0 tests". task.md
  and the L1 must-fail say that tests run from a wrong directory print "No such file or directory".
- Source: CPython 3.12 `unittest/loader.py` `discover()`: `if start_dir != top_level_dir: is_not_importable = not
  os.path.isfile(os.path.join(start_dir, '__init__.py'))` ... `raise ImportError('Start directory is not
  importable: %r' % start_dir)`. A missing start dir goes through `__import__(start_dir)`, and the same ImportError
  follows. So:
  (a) without `tests/__init__.py` every run, green ones included, ends in that ImportError, and row 3 never reports
  "Ran 0 tests";
  (b) `-t .` puts the project root on `sys.path`, not `src/`, so `import invoices` fails unless something adds `src`;
  (c) from a wrong but existing directory the output is "Start directory is not importable", not "No such file or
  directory".
  The missing-file wording appears only in other cases, for example a subprocess `cwd` that does not exist
  (FileNotFoundError "[Errno 2] No such file or directory") or `python3 missing.py` ("can't open file ...
  [Errno 2] No such file or directory").
- Required change: pin a layout and command that run. Ship `tests/__init__.py` in every starter, fixture P and
  2.6 temp project. Make `invoices` importable under the exact command, for example `PYTHONPATH=src` in the hook's
  subprocess environment (not under `-I`, which ignores it), or path setup in the bootstrap and `tests/__init__.py`.
  Add a demo item that runs the reference hook on green, red and zero-test fixtures and records the raw unittest
  output. Rewrite the task.md trap and the L1 must-fail around a mechanism that really prints the phrase, such as a
  non-existent `cwd` or a missing script path, and name it. Drop the claim about unittest.

### B5. L1 contradicts module 00 L6 on exit 1 and does not reconcile it
- `00-introduction/06-permissions-security/theory.md:95`: "Exit 1, падение, таймаут не блокируют", with no
  qualifier. Design L1: "exit 1 blocks only with a JSON block" (correct per H: other exit code + valid JSON =
  "Claude Code ignores the exit code, and the fields alone decide"; "Exit code 1 without valid JSON output is a
  non-blocking error").
- Required change: L1 theory adds one sentence: module 00 meant exit 1 without JSON, and with a valid JSON decision
  the exit code is ignored. Record a follow-up issue to qualify 00 L6 theory.md:95 the same way (outside #41's diff).

## Non-blocking items
1. 2.8: the probe timeout is 60 s, but registration accepts `timeout` >= 30. A hook registered with `timeout: 30`
   that takes 40 s passes the grader, while CC "cancels ... discarding the hook's output". Use
   min(60, registered timeout) as the probe timeout.
2. L2: "body <= 500 lines". SPEC and PBP say "under 500 lines". Use < 500, or label 500 as the exercise's bound.
3. L2 theory: "booleans in six spellings any case": there are eight spellings in total (S: six "in addition to
   `true` and `false`"). Word it as "six more spellings". The "since 2.1.218" and CL 2.1.186 claims come from RA;
   I did not re-read those changelog entries. None is graded, so the author re-checks before `ready`.
4. EARS: the only primary source in R is Kiro's single WHEN...SHALL pattern. Theory must not equate that pattern
   with EARS as a whole (EARS has other patterns, unresearched here). sdd-quiz Q3 must not offer a valid non-WHEN
   requirement as "untestable".
5. Section 9: "3-8x tokens". Böckeler's figures are 8.5x/3.0x/4.9x, and the article notes the cache-read overstatement.
6. 2.7 glossary: Matt's format also has a one-two sentence context description under `# {Context Name}`. The
   exercise grammar should tolerate that prose line (near-miss), since it is labelled a simplification.

Attribution: curriculum-architect for B1-B5. R scoped B1 correctly (R 2.2 "claude.ai uploads, Skills API,
package_skill.py") and the design dropped the scope. The research was not wrong.

FAIL
