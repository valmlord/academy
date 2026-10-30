# #41 content-researcher addendum: Stop hooks and SKILL.md, checked against the design

Scope: the four Stop-hook items in design section 11.4 and every per-probe expectation in design 2.3,
2.8, L1 `stop-hook-tests`, L2 `skills-structure`/`skills-quiz`, L6 `stop-hook-integrity`.
All pages fetched live on 2026-10-29 as Markdown (`<page>.md`). Claude Code version: npm
`@anthropic-ai/claude-code` latest = **2.1.312** (npm `time.modified` 2026-10-27; CHANGELOG top entry
2.1.312). Codex CLI npm latest 0.165.0. Doc pages carry no per-page version; facts below are "docs as of
2026-10-29, CC 2.1.312".

Sources (all checked 2026-10-29):
- H = Hooks reference https://code.claude.com/docs/en/hooks
- G = Automate actions with hooks (guide) https://code.claude.com/docs/en/hooks-guide
- S = Extend Claude with skills https://code.claude.com/docs/en/skills
- BP = Claude Code best practices https://code.claude.com/docs/en/best-practices
- SPEC = Agent Skills specification https://agentskills.io/specification
- REF = skills-ref validator source https://github.com/agentskills/agentskills/tree/main/skills-ref/src/skills_ref (last commit on that dir 2025-12-18, 547831f)
- PBP = Skill authoring best practices https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- CL = CC CHANGELOG https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
- CX = Codex hooks https://learn.chatgpt.com/docs/hooks

## Findings for 01-spec-driven-development (#41), addendum

### A1. Does a matcher apply to Stop / SubagentStop? (design 11.4 a)
- Fact (Stop: no). H matcher table: "`UserPromptSubmit`, `PostToolBatch`, `Stop`, `TeammateIdle`,
  `TaskCreated`, `TaskCompleted`, `WorktreeCreate`, `WorktreeRemove`, `MessageDisplay` | no matcher
  support | always fires on every occurrence". H: "If you add a `matcher` field to an event without
  matcher support, it is silently ignored." G repeats the row (and adds `CwdChanged` to it).
- Fact (SubagentStop: yes). H: "`SubagentStop` | agent type | same values as `SubagentStart`";
  "The `agent_type` field is the value used for matcher filtering." "A `matcher` that names agent types
  doesn't match an empty `agent_type`. A hook whose matcher is omitted, `""`, or `"*"`, or is a regular
  expression that matches an empty string, runs for events with an empty `agent_type` too."
- Fact (`"*"`, `""`, omitted = match all, H). StopFailure matches on `error` with a narrower exact-match
  charset.
- Fact (Codex): CX Stop: "`matcher` isn't currently used for this event."
- Confidence: verified (H, G, CX).
- Implication: a `matcher` on the Stop group is harmless in CC 2.1.312 (ignored). Rejecting it is an
  exercise choice; the message must not say CC rejects it. Correct reason to cite: "CC ignores a matcher on
  Stop silently, so it suggests a filter that does nothing".

### A2. JSON output shape for Stop (design 11.4 b)
- Fact (Stop decision control, H): "`decision` | `"block"` prevents Claude from stopping. Omit to allow
  Claude to stop"; "`reason` | Required when `decision` is `"block"`. Tells Claude why it should
  continue"; "`hookSpecificOutput.additionalContext` | Non-error feedback for Claude. The conversation
  continues so Claude can act on it, but unlike `decision: "block"` it is shown in the transcript as hook
  feedback rather than a hook error". Example shape: `{"hookSpecificOutput": {"hookEventName": "Stop",
  "additionalContext": "..."}}`. "It keeps the conversation going through the same loop protections as
  `decision: "block"`, namely the `stop_hook_active` input and the 8-consecutive-continuation cap".
- Fact (H, decision table): Stop uses "Top-level `decision`"; "The only value for `decision` is
  `"block"`. To allow the action to proceed, omit `decision` from your JSON, or exit 0 without any JSON at
  all". `hookSpecificOutput` "requires a `hookEventName` field set to the event name".
- Fact (universal fields, H): "`continue` | `true` | If `false`, Claude stops processing entirely after
  the hook runs. Takes precedence over any event-specific decision fields"; "`stopReason` | Message shown
  to the user when `continue` is `false`. It stays in the conversation, so Claude sees it if the
  conversation continues"; "`systemMessage` | Warning message shown to the user"; "`suppressOutput` |
  Has no effect"; `terminalSequence`. Caps: "A hook's `additionalContext`, `systemMessage`, and
  `initialUserMessage` strings, and its plain stdout, are capped at 10,000 characters" (no cap stated for
  `reason` or stderr: could not verify).
- Fact (G, wrong level): fields placed at the wrong level are ignored silently ("Hook JSON output had
  unrecognized keys" in the debug log).
- Fact (what counts as JSON, H "Exit code 0"): stdout is JSON "only when you print one JSON object, on one
  line or several, with nothing around it but whitespace". "Output that doesn't start with `{`, or that
  starts with `{` and doesn't end with `}`: plain text. A JSON array and a quoted JSON string are plain
  text by this rule." Several lines each parsing as JSON: plain text unless one sets a field, then "a
  parse failure". "Anything else that starts with `{` and ends with `}` but isn't valid JSON: a parse
  failure."
- Could not verify: whether `{"decision":"block"}` without `reason` fails schema validation (docs only say
  "Required"), and what CC does with a legacy `decision: "approve"` on Stop (validation failure =
  non-blocking error, or ignored). Either way the stop proceeds.
- Confidence: verified (H, G).
- Implication: (i) a block JSON that also sets `"continue": false` does NOT keep Claude working:
  `continue:false` "takes precedence". The design's block form must require `continue` absent or `true`.
  (ii) Multi-line pretty-printed JSON is valid; an array is plain text. (iii) `systemMessage`,
  `suppressOutput`, `terminalSequence` are harmless on allow.

### A3. `CLAUDE_PROJECT_DIR` and cwd for a Stop hook (design 11.4 c)
- Fact (env, H "Exec form and shell form"): "Both forms support the same path placeholders, and both
  export them as the environment variables `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, and
  `CLAUDE_PLUGIN_DATA` on the spawned process". Not event-specific, so it applies to Stop command hooks.
- Fact (meaning, H): "`${CLAUDE_PROJECT_DIR}`: the project root where the session started." Worktrees:
  "`${CLAUDE_PROJECT_DIR}` stays put: it still points at the project root where the session started";
  "`cwd` follows Claude: the `cwd` field in the hook's input JSON is the worktree root after Claude
  enters a worktree, and the new directory after Claude runs `cd`."
- Fact (process cwd, H "Hook handler fields"): "Handlers run in the current directory with Claude Code's
  environment. If the current directory no longer exists ... Claude Code runs command hooks from the
  first of these that still exists: the directory the session started in, the project root, your home
  directory, or the system temp directory." Common input: "`cwd` | Current working directory when the
  hook is invoked". Env: "A hook process inherits the parent environment, apart from the `OTEL_*`
  exporter variables ... and, when `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is set to `1`, the variables it
  strips."
- Fact: `CLAUDE_ENV_FILE` is only for SessionStart, Setup, CwdChanged, FileChanged (H), not Stop.
- Confidence: env var verified; that the process cwd equals the payload `cwd` is inferred from the two
  sentences above (single source, not stated as one sentence).
- Implication: probes setting `CLAUDE_PROJECT_DIR=P`, process cwd `P`, payload `cwd: P` are faithful to the
  default case. Theory should say the two can diverge (worktree, `cd`): `$CLAUDE_PROJECT_DIR` runs the
  tests of the checkout where the session started, payload `cwd` follows Claude. The design's fixed
  choice ("run in `$CLAUDE_PROJECT_DIR`") is defensible; name the trade-off.

### A4. Exit codes and stdout/stderr on Stop (design 11.4 d)
- Fact (outcome table, H "Exit code output"; framed "on an event such as `PreToolUse`", no Stop
  exception except the one below):
  | Stdout | Exit 0 | Exit 2 | Other |
  |---|---|---|---|
  | valid JSON object | "Success. The fields apply" | "Blocking error. Claude Code still reads the fields, but they can't override the block" | "Success. Claude Code ignores the exit code, and the fields alone decide" |
  | unparseable / schema-invalid JSON | "Non-blocking error" | "Blocking error. Your stderr is the reason" | "Non-blocking error" |
  | plain text or nothing | "Success" | "Blocking error. Your stderr is the reason" | "Non-blocking error. The notice carries the first line of your stderr" |
- Fact (Stop-specific exception, H): "`Stop`, `SubagentStop`, `TaskCompleted`, and a plugin's
  `UserPromptSubmit` hook: when your hook exits 2 with nothing on stdout and its stderr says a file is
  missing, such as `No such file or directory`, Claude Code treats the run as a non-blocking error."
- Fact (plain stdout on exit 0): "For most events, Claude Code writes stdout to the debug log and doesn't
  show it in the transcript. The exceptions are `UserPromptSubmit`, `UserPromptExpansion`,
  `SessionStart`, and `PostModelSwitch`". So on Stop, plain text + exit 0 = success, stop allowed, text
  only in the debug log. "Claude never sees stderr from a hook that exits 0."
- Fact (exit 2 message source, H): "The message that comes with the block is your hook's stderr. If your
  hook also printed JSON that makes a blocking decision, Claude Code uses that decision's reason
  instead." Stop: "A hook that blocks by exiting 2 routes the same way as `reason`".
- Fact (exit 2 per event, H): Stop "Yes | Prevents Claude from stopping, continues the conversation";
  SubagentStop "Prevents the subagent from stopping".
- Fact (other codes, H): "Exit code 1 without valid JSON output is a non-blocking error unless the hook is
  one whose failure blocks the action". G: with another exit code and "A parsed object that passes schema
  validation: Claude Code ignores the exit code, the JSON alone decides the outcome, and the hook isn't
  reported as an error."
- Fact (failure, H): `onFailure` "has no effect" on "`Stop`, `SubagentStop`, `TaskCompleted`, and
  `TeammateIdle` hooks: exit code 2 on these events sends Claude back to keep working, and Claude can't
  repair a hook that won't run". Timeout: Claude Code "cancels a `command` ... hook that reaches its
  `timeout`, discarding the hook's output, so on most events a timed-out hook renders no decision".
  Default command timeout 600 s (H common fields).
- Fact (Codex, CX): "`Stop` expects JSON on `stdout` when it exits `0`. Plain text output is invalid for
  this event." and (common output) "Exit `0` with no output is treated as success and Codex continues."
- Confidence: verified (H, G, CX).
- Implication: a Stop hook in CC 2.1.312 blocks in THREE documented ways: exit 2 (+stderr); exit 0 +
  valid JSON `decision:"block"` + `reason`; ANY other exit code + valid JSON `decision:"block"`. And exit 2
  does not block when stdout is empty and stderr reads like a missing file.

### A5. Other Stop-hook registration facts the design relies on
- `type` values: "`"command"`, `"http"`, `"mcp_tool"`, `"prompt"`, or `"agent"`" (H). BP: "A `prompt` or
  `agent` hook asks *another model* to decide, so it isn't deterministic either. For real enforcement,
  use a `command` or `http` hook". The design's quote is verbatim from BP (not R 1.3/H): cite BP.
- `if` (H): "Only evaluated on tool events: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`,
  `PermissionRequest`, and `PermissionDenied`. On other events, a hook with `if` set never runs".
  So `if` on Stop disables the hook. Stronger reason than "outside the exercise".
- `once` (H): "Only honored for hooks declared in skill frontmatter; ignored in settings files and agent
  frontmatter".
- `shell` (H): "Accepts `"bash"` or `"powershell"`. ... Ignored when `args` is set".
- `async` (H): "Async hooks can't block or control Claude's behavior: response fields like `decision`,
  `permissionDecision`, and `continue` have no effect". `asyncRewake` (H): "runs in the background and
  wakes Claude on exit code 2. The hook's stderr, or stdout if stderr is empty, is shown to Claude as a
  system reminder". So asyncRewake can make Claude act after a stop; "can't block" is precise only for
  `async`.
- `onFailure` values (H): "`"continue"` or `"block"`", v2.1.295+.
- `timeout` default for command 600 s; `statusMessage` "Custom spinner message".
- `disableAllHooks` (H): "Claude Code reads the value left after settings precedence applies, so a
  `"disableAllHooks": false` in a project's `.claude/settings.json` overrides a `true` in your user
  settings"; `--settings '{"disableAllHooks": true}'` "takes precedence over project and local
  settings"; cannot disable managed hooks from lower levels.
- Loop guard and cap (H, G): "after stop hooks have continued the turn eight times in a row, Claude Code
  overrides the next block and ends the turn. The count of consecutive continuations resets each time
  Claude calls a tool"; G: "eight times in a row with no tool call from Claude in between";
  `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`. G's own example: `stop_hook_active` true -> `exit 0`. Matches 2.8.
- Stop input (H): common fields + `stop_hook_active`, `last_assistant_message`, `background_tasks`,
  `session_crons`. H's Stop example also carries `permission_mode`; common fields may add `prompt_id`,
  `scratchpad_dir`, `effort` ("Present for events ... such as ... `Stop`"). Both arrays "are present when
  the task registry is reachable" (so they can be absent).
- Subagent frontmatter: "Claude Code converts a `Stop` hook here to `SubagentStop`" (H).
- Confidence: verified.

### A6. SKILL.md: every documented form (CC 2.1.312 vs spec)
- CC booleans (S): "Boolean fields accept `yes`, `no`, `on`, `off`, `1`, and `0` in any letter case, in
  addition to `true` and `false`." CL 2.1.218: "Added `yes`/`no`/`on`/`off`/`1`/`0` (case-insensitive) as
  accepted values for skill and plugin frontmatter booleans". Whether a quoted `"true"` counts: could not
  verify.
- CC fields (S table, 20): `name`, `description`, `when_to_use`, `argument-hint`, `arguments`,
  `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`,
  `context`, `agent`, `background`, `hooks`, `paths`, `shell`, `metadata`, `license`, `compatibility`.
  Same as R 2.2. "A field name must match the table exactly, hyphens included: Claude Code ignores a field
  it doesn't recognize without reporting an error." CL 2.1.186 also mentions `display-name`,
  `default-enabled`, `fallback` keys (not on the S page; undocumented today).
- CC `name` (S): optional, "Defaults to the directory name"; "The directory name also invokes the skill";
  no length/charset rule except refused characters (zero-width, control, private-use, bidi, irregular
  blanks, `<`, `>`) and reserved folder names `synced`, `anthropic-skills`.
- CC `allowed-tools` / `disallowed-tools` / `arguments` / `paths`: "a space- or comma-separated string,
  or a YAML list". `metadata`: CC "drops a value that isn't a map". `compatibility` up to 500 chars.
  `description` + `when_to_use` truncated at 1,536 chars in the listing.
- CC frontmatter (S): "reads the frontmatter only when the opening `---` is the file's first line";
  unparseable YAML: "the skill still loads with no fields set". Validator: `claude plugin validate
  .claude/skills` (v2.1.233+).
- Outside CC (S): only "`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`",
  other keys: "Unexpected key(s) in SKILL.md frontmatter: ...". PBP adds for API: name "Cannot contain XML
  tags", "Cannot contain reserved words: `anthropic`, `claude`"; description "Cannot contain XML tags".
- SPEC `name`: "Must be 1-64 characters"; "May only contain unicode lowercase alphanumeric characters
  (`a-z`, `0-9`) and hyphens (`-`)"; no leading/trailing hyphen; no `--`; "Must match the parent
  directory name". REF implements "i18n characters (Unicode letters)": NFKC-normalised, `name ==
  name.lower()`, `c.isalnum() or c == "-"`, strips surrounding whitespace, and accepts `skill.md` as well
  as `SKILL.md`; parses with strictyaml (all scalars strings).
- SPEC `description` 1-1024, non-empty; `compatibility` 1-500; `metadata` string->string;
  `allowed-tools` "Space-separated string ... (Experimental)".
- "One level deep" (SPEC): "Keep file references one level deep from `SKILL.md`. Avoid deeply nested
  reference chains." PBP: "All reference files should link directly from `SKILL.md`", bad example is
  SKILL.md -> advanced.md -> details.md. It is about link chains, not directory depth. S's own example
  puts `reference.md`, `examples.md` at the skill root.
- Invocation (S): table default / `disable-model-invocation: true` ("Description not in context") /
  `user-invocable: false` ("You can invoke: No"). "If Claude tries anyway, Claude Code blocks the call".
  Same-name precedence: "A skill and a file in `.claude/commands/` | The skill". `.agents/skills/` is not
  mentioned on S (grep, 2026-10-29).
- `verify` before commits (S): "When a session starts with a skill named `verify` or `simplify` in place,
  Claude Code's commit instructions tell Claude to run it right before each commit, except for changes to
  docs or tests" (v2.1.286+); not with `disable-model-invocation: true`. It is an instruction to the
  model, not a harness gate. The bundled `/verify` is described as confirming a change "without falling
  back to tests or type checks", so a tests-only project `verify` changes its meaning.
- Confidence: verified (S, SPEC, REF, PBP, CL).

## Design statements that contradict or overstate the sources
1. 2.8 Block: "Exit 2 blocks "even when JSON is printed", so stdout is ignored on exit 2." H: "Claude Code
   still reads the JSON output fields, but they can't override the block" and "If your hook also printed
   JSON that makes a blocking decision, Claude Code uses that decision's reason instead." Stdout is not
   ignored; with a JSON block the reason comes from JSON, not stderr, and a `continue:false` there is read
   too (its effect on exit 2: could not verify).
2. 2.8 "Any other exit code fails the probe: exit 1, a crash or a timeout is non-blocking in CC" and L1
   attacker "`exit 1` to block (fails, non-blocking)". H: other exit code + valid JSON = "Success. Claude
   Code ignores the exit code, and the fields alone decide"; G: "the JSON alone decides the outcome".
   Exit 1 is non-blocking only "without valid JSON output". Rejecting it is fine as exercise policy; the
   CC claim must be qualified.
3. 2.8 Block form "exit 0 with stdout one JSON object whose `decision` is `"block"`" (no condition on
   `continue`). H: `continue:false` "Takes precedence over any event-specific decision fields" and makes
   Claude stop. A block object with `"continue": false` must fail the red rows.
4. 2.8 Block form "exit 2 with stderr containing the random failing test name". H: on Stop, exit 2 "with
   nothing on stdout and its stderr says a file is missing, such as `No such file or directory`" is a
   non-blocking error. Fixtures and stub output must never produce that text, or the grader must treat it
   as not blocking; and a JSON block on exit 2 moves the reason from stderr to `reason`.
5. 2.8 registration: "The group has no `matcher` key (... CC matcher semantics for Stop are not in the
   research ...)". Now known: H "Stop | no matcher support"; "it is silently ignored". Keep the rejection
   as exercise policy; the message should say CC ignores it, not that it is unknown or invalid.
6. 2.8 "`async` and `asyncRewake` (R 1.3: async hooks "can't block")". H: `asyncRewake` "wakes Claude on
   exit code 2" and shows stderr as a system reminder. The reason holds for `async`, not literally for
   `asyncRewake`.
7. 2.8 "`if`, `once`, `shell` ... (outside the exercise)": not a contradiction, but H gives stronger
   reasons: `if` on Stop means the hook "never runs"; `once` is "ignored in settings files"; `shell` is
   "Ignored when `args` is set".
8. 2.8 "`hookSpecificOutput.additionalContext` (that field "also continues the conversation", R 1.3)":
   the quote is not verbatim in H. H: "The conversation continues so Claude can act on it"; decision
   table: "non-error feedback that continues the conversation". Quote one of those.
9. 2.8 "`type` ... `"prompt"` and `"agent"` fail by name: R 1.3 "asks another model to decide, so it isn't
   deterministic"". The sentence is from BP, not H; cite BP.
10. 2.3 parser "`true`/`false` as booleans" and L2 `release`: "`disable-model-invocation` with the boolean
    `true` (a quoted `"true"` fails as "a string, not a boolean" ...)". S: booleans accept "`yes`, `no`,
    `on`, `off`, `1`, and `0` in any letter case, in addition to `true` and `false`" (CL 2.1.218). As
    designed, `disable-model-invocation: yes`, `True`, `on` or `1` fail although CC treats them as true;
    and `user-invocable: no`/`off`/`0` must fail like `false`. Either accept every documented spelling
    or reject them with an exercise-only reason, never as a CC error.
11. L2 "every relative path in the body matching `(scripts|references|assets)/<file>` ... is exactly one
    level deep" and must-fail "reference to `references/a/b.md`". SPEC: "Keep file references one level
    deep from `SKILL.md`. Avoid deeply nested reference chains"; PBP: "All reference files should link
    directly from `SKILL.md`". The rule is about chains (SKILL.md -> a.md -> b.md), not folder depth; a
    direct link to `references/a/b.md` is one level deep. Rename the check as exercise layout policy or
    test chains instead.
12. L2 name rule "`^[a-z0-9]+(-[a-z0-9]+)*$` (spec: lowercase, digits, hyphens ...)". SPEC text agrees
    ("(`a-z`, `0-9`)") but also says "unicode lowercase alphanumeric", and REF accepts Unicode lowercase
    letters after NFKC. Not wrong for the exercise; say "ASCII subset, stricter than skills-ref".
13. L2 must-fail list vs CC fields: `release` keys "only from the CC 2.1.312 field list" is consistent
    with S; note CL 2.1.186 lists `display-name`, `default-enabled`, `fallback` that S omits (rejecting
    them is defensible: undocumented on S).
14. L1/L2 theory "a project skill named `verify` replaces the bundled one and CC runs it before commits":
    S says the commit instructions "tell Claude to run it": a model instruction (non-deterministic), and
    it is skipped "for changes to docs or tests". Phrase it so it is not presented as a harness gate.

Consistent with the sources (checked, no change): no `matcher` on TaskCompleted/TeammateIdle;
`onFailure` no effect on Stop (fails open); 8-block cap, reset on tool call, env var; `stop_hook_active`
guard; `decision`/`reason` top level; `reason` required; exit 2 Stop row; Stop payload fields;
`additionalContext` on a green state keeps Claude working (so rejecting it on allow is grounded);
plain text + exit 0 allowed in CC, invalid in Codex (design cites Codex only: correct); empty stdout +
exit 0 is success in both CC and Codex; CC frontmatter needs `---` on line 1; unknown CC fields ignored
silently; CC-only fields are a hard error outside CC; `user-invocable: false` keeps model invocation;
`allowed-tools` pre-approves for the turn and restricts nothing; skill wins over a same-named
`.claude/commands/` file; `.agents/skills/` absent from S; skill hooks persist for the session; spec
`name` 1-64, `description` 1-1024, `compatibility` 1-500, name must match directory.

## Contradictions between sources
- SPEC `name` wording "unicode lowercase alphanumeric characters (`a-z`, `0-9`)" vs REF accepting any
  Unicode lowercase letter. PBP (Anthropic API) says "lowercase letters, numbers, and hyphens" and adds
  reserved words and no XML tags.
- SPEC `allowed-tools` "Space-separated string" vs CC "space- or comma-separated string, or a YAML list".
- G's "no matcher support" row includes `CwdChanged`; H lists it on its own row. Same meaning.

## Things that changed recently
- CC 2.1.218: extended boolean spellings in skill frontmatter (design 2.3 predates this view).
- CC 2.1.295: `onFailure`; 2.1.286: `verify`/`simplify` before commits; 2.1.309: added-directory skill
  prefixes. No Stop-hook semantic change found in CL entries up to 2.1.312 beyond those in R 1.3.

## Learner-specific notes
- Profile: Python, little Linux. The `No such file or directory` exception (A4) and `$CLAUDE_PROJECT_DIR`
  vs payload `cwd` in worktrees (A3) are exactly the "hook silently does nothing" traps worth one theory
  paragraph each; Stepan works in worktrees in this very repo.

## Open questions
- Whether `decision:"block"` without `reason`, or `decision:"approve"`, fails schema validation on Stop.
- Effect of `continue:false` printed alongside exit 2 on Stop.
- Whether CC coerces a quoted `"true"` in skill frontmatter.
- A live CC run would settle these; none is needed if the grader rejects those forms as exercise policy
  with non-CC reasons.
