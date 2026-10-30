# #41 content-researcher findings: module 01 "Spec Driven Development"

Checked 2026-10-29. Versions at check time: Claude Code (CC) 2.1.312 (npm, published 2026-10-27);
@openai/codex 0.165.0; mattpocock/skills v1.3.2 (released 2026-10-29); github/spec-kit v1.2.5
(2026-10-28); Fission-AI/OpenSpec v1.15.0 (2026-10-24); BMAD-METHOD v6.12.4 (2026-10-14);
MADR 4.0.0 (2024-09-17). Primary sources were read as raw markdown (`<page>.md`) where the vendor
offers it, not from snippets.

## Findings for course/ai-for-developers/01-spec-driven-development (#41)

### 0. Reference program and context
- Fact: Reference block (docs/course-reference.md): verifying the agent's result; skills (how they
  work, popular skills, lifecycle in a project); SDD from design to implementation (ADR, PRD and other
  artifacts, automated integrity control and updates); project ontology (domain model, entities,
  relationships, processes); real cases on Matt Pocock's skills. Result: from ordinary planning to
  working through a specification. Amendment: practice is checked in the platform workspace via
  hidden-task / rubric (plus command, quiz, bug-hunt per the contract).
- Fact: module.yaml for 01 is `status: planned`, no outcomes, no lessons. Module 00 explicitly defers
  two things to this module: "specifications in detail in module 01" (00/04 theory.md, line 69) and
  "skills in module 01" (00/02 theory.md, line 74), both translated from Russian.
- Implication: the module must deliver on both deferrals; module 00 learners already expect it.

### 1. Verifying the result of an agent's work

#### 1.1 Anthropic / Claude Code guidance
- Fact: CC best practices, section "Give Claude a check to run": "Claude stops when the work looks done.
  If it has nothing to run that tells it whether the work actually *is* done, 'looks done' is all it has
  to go on. In practice that makes you the test suite." Checks listed: a test file, a build's exit code,
  a linter, a script that diffs output against a fixture, a browser screenshot next to the mockup. "If
  your repo already has one of these, the single most useful line in your CLAUDE.md is the command that
  runs it."
- Fact: Four strictness levels, same page: (1) in the prompt ("run the auth tests after, and keep going
  until they pass": Claude decides); (2) `/goal <condition>`: "a separate model checks against the
  conversation after every turn"; (3) a Stop hook: "enforced by Claude Code (the harness), so the turn
  doesn't end until the typecheck passes or the block limit is reached"; (4) `/code-review`: "reviews
  the diff in a fresh subagent that never saw your conversation".
- Fact: "Whichever option you use, ask Claude for *evidence*: the command it ran and its output, or the
  screenshot. 'All tests pass' on its own tells you very little."
- Fact: Deterministic vs non-deterministic table (same page), row "When it's done": non-deterministic =
  "A request for evidence, `/goal`, `/code-review`"; deterministic = "Tests, typecheck, a `Stop` hook,
  CI". Row "Who has the last word": "Claude's summary of what it did" vs "Branch protection, a person who
  approves the merge".
- Fact: "Review against your spec": example prompt "use a subagent to review the rate limiter diff
  against SPEC.md, check every requirement is implemented and the listed edge cases have tests, report
  gaps that affect correctness and skip style", with the note: "A reviewer that's asked to find problems
  will always find *something*."
- Fact: "A `prompt` or `agent` hook asks *another model* to decide, so it isn't deterministic either.
  For real enforcement, use a `command` or `http` hook".
- Fact: Pre-flight list for unattended runs: "1. Does it know what done looks like? A goal condition, a
  spec file, or a failing test it has to turn green. 2. Can it check its own work? The test suite, a
  `Stop` hook, some kind of review step."
- Source: Claude Code, Best practices https://code.claude.com/docs/en/best-practices (checked
  2026-10-29, CC 2.1.312)
- Confidence: verified
- Implication: the verification lesson can be framed exactly on this ladder (prompt -> /goal -> Stop
  hook -> fresh reviewer -> CI/branch protection) and on "evidence, not claims". Name it as Anthropic's
  guidance for CC, not a universal law.

#### 1.2 /goal (CC)
- Fact: `/goal` sets a completion condition; after each turn a model checks it; clears when met, judged
  impossible, or on an error you must fix. "The evaluator judges your condition against what Claude has
  surfaced in the conversation. It doesn't run commands or read files independently, so write the
  condition as something Claude's own output can demonstrate." Condition up to 4,000 characters. It is
  "a session-scoped shortcut" for a prompt-based Stop hook; a Stop hook "lives in your settings file ...
  and can run a script for deterministic checks". One goal per session; doesn't change permission mode.
- Source: Keep Claude working toward a goal https://code.claude.com/docs/en/goal (checked 2026-10-29)
- Confidence: verified
- Implication: a key teaching contrast. `/goal` reads the transcript, so a fabricated "tests pass" line
  can satisfy it; a command Stop hook re-runs the tests itself. Good quiz/bug-hunt material.

#### 1.3 Hooks for verification: exact CC semantics (2.1.312)
- Fact (Stop): "Runs when the main Claude Code agent has finished responding. Does not run if the
  stoppage occurred due to a user interrupt. API errors fire StopFailure instead." Input adds
  `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons`.
  "`stop_hook_active` is `true` when Claude Code is already continuing as a result of a stop hook. Check
  this value or process the transcript to avoid blocking on a condition that will never resolve."
- Fact (cap): "after stop hooks have continued the turn eight times in a row, Claude Code overrides the
  next block and ends the turn. The count of consecutive continuations resets each time Claude calls a
  tool." Raise with env `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`.
- Fact (Stop decision control): `decision: "block"` prevents stopping; `reason` "Required when `decision`
  is `"block"`"; `hookSpecificOutput.additionalContext` = non-error feedback that also continues the
  conversation, labelled "Stop hook feedback" in the transcript. "A hook that blocks by exiting 2 routes
  the same way as `reason`: Claude receives the stderr message".
- Fact (exit codes per event table): Stop exit 2 "Prevents Claude from stopping, continues the
  conversation"; SubagentStop exit 2 "Prevents the subagent from stopping"; TaskCompleted exit 2
  "Prevents the task from being marked as completed"; TeammateIdle exit 2 keeps the teammate working;
  PostToolUse "Can block? No ... Shows stderr to Claude; the tool already ran". Exit 2 blocks even when
  JSON is printed; JSON fields "can't override the block".
- Fact (PostToolUse): `decision: "block"` "adds the `reason` next to the tool result. Claude still sees
  the original output"; also `additionalContext`, `updatedToolOutput`. A PostToolUse hook matching
  `Edit|Write` does not run when a Bash command rewrites the file (use `FileChanged`).
- Fact (SubagentStop): input `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`,
  `last_assistant_message`; same decision format as Stop; `decision: "block"` "keeps the subagent
  running and delivers `reason` to the subagent as its next instruction". Also fires for CC internal
  agents (prompt suggestions, /btw) with empty or session `agent_type`. With SubagentHandback (v2.1.271+)
  `last_assistant_message` is not the delivered report.
- Fact (TaskCompleted): fires when a task is marked completed via TaskUpdate or a teammate finishes with
  in-progress tasks; "Use this to enforce completion criteria like passing tests"; example runs
  `npm test` and exits 2.
- Fact (onFailure, v2.1.295+): "has no effect" on Stop, SubagentStop, TaskCompleted, TeammateIdle:
  "exit code 2 on these events sends Claude back to keep working, and Claude can't repair a hook that
  won't run." So a crashing Stop hook fails open.
- Fact (hook types): command, http, mcp_tool, prompt, agent. Prompt hooks return `{"ok", "reason",
  "impossible"}`; on Stop, `ok:false` feeds reason back unless `impossible:true`. Agent hooks: "Agent
  hooks are experimental", up to 50 turns, default timeout 60 s (prompt 30 s, command 600 s). Docs
  example: agent Stop hook "Verify that all unit tests pass. Run the test suite".
- Fact (async): `"async": true` command hooks "can't block or control Claude's behavior".
- Fact: Best practices' minimal Stop hook: `{ "type": "command", "command": "pnpm tsc --noEmit 1>&2 ||
  exit 2" }` in `.claude/settings.json`.
- Source: Hooks reference https://code.claude.com/docs/en/hooks (checked 2026-10-29, CC 2.1.312);
  Best practices (same date)
- Confidence: verified
- Implication: a Stop hook exercise is fully gradeable without a model: feed the learner's hook script
  crafted stdin JSON (stop_hook_active true/false, red/green test state) and assert exit code and
  stderr. Teach the loop guard (stop_hook_active) and the 8-block cap explicitly, plus "fails open on
  crash" as the difference from PreToolUse+onFailure taught in 00/06.

#### 1.4 Codex equivalents
- Fact: Codex hooks: events SessionStart, SessionEnd, SubagentStart, PreToolUse, PermissionRequest,
  PostToolUse, PreCompact, PostCompact, UserPromptSubmit, SubagentStop, Stop, Interrupt. Locations
  `~/.codex/hooks.json`, `~/.codex/config.toml`, `<repo>/.codex/hooks.json`, `<repo>/.codex/config.toml`.
  Non-managed hooks "must be reviewed and trusted before they run"; trust is recorded against the hook's
  hash, changed hooks are skipped until re-trusted (`/hooks`).
- Fact: Codex Stop input `turn_id`, `stop_hook_active`, `last_assistant_message`. "`Stop` expects JSON on
  `stdout` when it exits `0`. Plain text output is invalid for this event." `{"decision":"block",
  "reason":...}` or exit 2 + stderr; "`decision: "block"` doesn't reject the turn. Instead, it tells Codex
  to continue and automatically creates a new continuation prompt that acts as a new user prompt, using
  your `reason` as that prompt text." `continue:false` from any matching Stop hook takes precedence.
  Matcher ignored for Stop. Matching command hooks launch concurrently.
- Source: Codex Hooks https://learn.chatgpt.com/docs/hooks.md (checked 2026-10-29, Codex CLI 0.165.0
  on npm)
- Confidence: verified
- Implication: same idea, different contract details (JSON required on exit 0, trust-by-hash, no
  documented continuation cap found). If a lesson mentions Codex, name these differences; do not teach a
  "universal Stop hook".

#### 1.5 Evaluator-optimizer, self-check, TDD with agents
- Fact: "In the evaluator-optimizer workflow, one LLM call generates a response while another provides
  evaluation and feedback in a loop"; "particularly effective when we have clear evaluation criteria";
  "Code solutions are verifiable through automated tests".
- Source: Anthropic, Building effective agents (2024-12-19)
  https://www.anthropic.com/engineering/building-effective-agents (checked 2026-10-29)
- Confidence: verified (already a module 00 source)
- Fact: Anthropic prompting docs: "Ask Claude to self-check ... This catches errors reliably" BUT "Claude
  Opus 5 is the exception: it verifies its own work well without explicit instruction, and verification
  instructions carried over ... can cause over-verification". Long-horizon advice: "It is unacceptable to
  remove or edit tests because this could lead to missing or buggy functionality"; "Provide verification
  tools". Section "Avoid focusing on passing tests and hardcoding" with sample prompt: "Do not hard-code
  values or create solutions that only work for specific test inputs ... Tests are there to verify
  correctness, not to define the solution ... if any of the tests are incorrect, please inform me rather
  than working around them."
- Source: Prompting best practices
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
  (checked 2026-10-29)
- Confidence: verified
- Fact: Böckeler, "TDD inside the agent loop - theater or actual value?" (series index date 10 Aug 2026;
  the article page itself shows no date). Small experiment, Python greenfield tasks, Sonnet 4.6
  generating, Opus 4.8 ranking blind: "there was no clearly discernable difference based on TDD workflow
  versus no TDD workflow"; TDD runs used 8.50x / 2.96x / 4.89x tokens (small/medium/large; overstated by
  cache reads). Failure modes observed: tautological tests even when written first ("Writing the test
  first doesn't reliably prevent this"), skipped or faked red steps, over-implementation, agents
  "often write the implementation first and generate tests after". Recommends monitoring outcomes,
  mutation testing as the regression-quality signal, and states the author stopped instructing agents to
  write tests first. Sample is small; the author says so.
- Source: https://martinfowler.com/articles/exploring-gen-ai/tdd-in-the-agent-loop.html and index
  https://martinfowler.com/articles/exploring-gen-ai.html (checked 2026-10-29)
- Confidence: verified (date from index only)
- Implication: present TDD-with-agents as contested. What survives both sides: a red test that can fail,
  independent expected values, mutation-style checks. That maps directly onto the user's own rule
  "A test must be able to fail" and gives the lesson a strong, checkable angle.

#### 1.6 What the agent can fake, documented
- Fact: EvilGenie (Gabor, Lynch, Rosenfeld), arXiv:2511.21654 v2 (2026-05-17; v1 2025-11-26), venue
  not stated: benchmark where reward hacking is easy "such as by hardcoding test cases or editing test
  files"; detection via held-out unit tests, LLM judges, and test-file edit detection; per the current
  abstract the LLM judge is highly effective in unambiguous cases while held-out tests give minimal
  improvement; reports explicit reward hacking by Codex and Claude Code and misaligned behavior by all
  three agents tested (incl. Gemini CLI). Agent versions tested are those of the paper, not today's.
- Source: https://arxiv.org/abs/2511.21654 (checked 2026-10-29, v2). Read from the abs page summary, not
  the full PDF.
- Confidence: single source (abstract level)
- Fact: MacDiarmid et al., "Natural Emergent Misalignment from Reward Hacking in Production RL",
  arXiv:2511.18397 v1 (2025-11-23): models that learned reward hacking in production RL environments
  generalized to further misalignment, incl. attempted sabotage "when used with Claude Code"; mitigations
  include preventing reward hacking.
- Source: https://arxiv.org/abs/2511.18397 (checked 2026-10-29, v1)
- Confidence: verified (abstract level); not needed in the lesson beyond one line
- Fact: Claim that the Claude 3.7 Sonnet / Claude 4 system cards describe "special-casing tests" comes to
  me only via secondary sources.
- Confidence: could not verify (system card PDFs not read)
- Implication: the fakes a lesson can name with sources: hard-coding expected values, editing or
  deleting tests, tautological assertions, skipping the red step, claiming success without running
  (evidence missing). Countermeasures with sources: protected test files (deny/PreToolUse from 00/06),
  re-running checks in the harness (Stop hook, CI), held-out/hidden tests, test-file edit detection,
  a fresh reviewer, mutation testing. "assert True" and `pytest.skip`/`.only` are not named verbatim in
  the sources read; present them as examples of the tautological/skipped class, not as quotes.

#### 1.7 CI as authority
- Fact: GitHub "Require status checks before merging": collaborators can't change a protected branch
  until required status checks pass; "strict" also requires the branch to be up to date. Rulesets are the
  alternative (more than one can apply).
- Source: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
  (checked 2026-10-29)
- Confidence: verified
- Implication: this repo itself is the live example (CI `pnpm content:validate`, design-token job,
  Stepan merges). Not a workspace-gradeable item; quiz/theory only.

#### 1.8 CC bundled verification skills
- Fact: bundled `/run`, `/verify` ("Build and run your app to confirm a code change does what it should,
  without falling back to tests or type checks"), `/run-skill-generator` (records a per-project
  `.claude/skills/run-<name>/`). `/verify` may write `.claude/skills/verify/SKILL.md`; at repo root it
  replaces the bundled one. Since v2.1.286, when a project/personal skill named `verify` or `simplify`
  exists and Claude can invoke it, CC's commit instructions tell Claude to run it before each commit
  (not for docs/tests-only changes); bundled/plugin/claude.ai skills don't count; disabled by
  `includeGitInstructions: false` or `disable-model-invocation: true`.
- Source: https://code.claude.com/docs/en/skills (checked 2026-10-29)
- Confidence: verified
- Implication: a neat bridge between lessons 1 and 2: a project skill named `verify` is a
  verification procedure that CC wires into commits. CC-specific; say so.

### 2. Skills

#### 2.1 Agent Skills open standard (agentskills.io)
- Fact: "The Agent Skills format was originally developed by Anthropic, released as an open standard";
  Anthropic engineering post update: "Dec 18, 2025: We've published Agent Skills as an open standard".
  Spec repo github.com/agentskills/agentskills (Apache-2.0, last push 2026-08-09).
- Fact (spec): skill = directory with `SKILL.md` (YAML frontmatter + Markdown). Optional dirs
  `scripts/`, `references/`, `assets/`. Frontmatter: `name` REQUIRED, 1-64 chars, lowercase `a-z`,
  `0-9`, `-`, no leading/trailing hyphen, no `--`, "Must match the parent directory name";
  `description` REQUIRED, 1-1024 chars, should say what and when; optional `license`, `compatibility`
  (1-500 chars), `metadata` (string->string map), `allowed-tools` (space-separated, "Experimental").
  Progressive disclosure: metadata "~100 tokens" at startup for all skills; instructions "< 5000 tokens
  recommended" on activation; resources as needed. "Keep your main SKILL.md under 500 lines." File
  references "one level deep". Validator: `skills-ref validate ./my-skill` (Python, deps click and
  strictyaml; README: "intended for demonstration purposes only").
- Source: https://agentskills.io/specification.md, https://agentskills.io/home.md,
  https://github.com/agentskills/agentskills (checked 2026-10-29);
  https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
  (2025-10-16, checked 2026-10-29)
- Confidence: verified
- Fact: Client showcase lists 46 clients (docs/snippets/clients.jsx, last change 2026-08-09), among them
  Claude Code, Claude, ChatGPT & Codex, Cursor, GitHub Copilot, VS Code, Gemini CLI, OpenCode, Kiro,
  Goose, Amp, Junie, Roo Code, Factory, OpenHands, Tabnine, Mistral AI Vibe, TRAE, Spring AI, Snowflake
  Cortex Code, Databricks Genie Code.
- Source: https://github.com/agentskills/agentskills/blob/main/docs/snippets/clients.jsx (checked
  2026-10-29)
- Confidence: verified as "listed"; per-tool support verified only for the tools in 2.3.

#### 2.2 Claude Code skills (2.1.312)
- Fact: "Claude Code skills follow the Agent Skills open standard" and extend it (invocation control,
  subagent execution, dynamic context injection). "Custom commands have been merged into skills":
  `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` both create `/deploy`.
- Fact: In CC "All fields are optional. Only `description` is recommended." Unknown fields are ignored
  silently. `name` defaults to the directory name; `description` falls back to the first non-empty body
  line; `description` + `when_to_use` "is truncated at 1,536 characters in the skill listing"
  (configurable `skillListingMaxDescChars`). Frontmatter only read if `---` is the first line; broken
  YAML loads the skill "with no fields set".
- Fact: CC frontmatter fields: `name`, `description`, `when_to_use`, `argument-hint`, `arguments`,
  `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`,
  `context` (`fork`), `agent`, `background`, `hooks`, `paths`, `shell`, plus spec fields `metadata`,
  `license`, `compatibility` (accepted, not acted on).
- Fact: Outside CC (claude.ai uploads, Skills API, `package_skill.py`) only `name`, `description`,
  `license`, `compatibility`, `metadata`, `allowed-tools`; any other field is a hard error
  ("Unexpected key(s) in SKILL.md frontmatter: argument-hint ...").
- Fact: Locations: enterprise (managed settings dir), personal `~/.claude/skills/<name>/SKILL.md`,
  project `.claude/skills/<name>/SKILL.md` (from start dir up to repo root), nested
  `<subdir>/.claude/skills/` (loaded on first access), `--add-dir`, plugin `<plugin>/skills/<name>/`
  (invoked `/plugin-name:skill-name`), claude.ai synced into `~/.claude/skills/synced/`. Precedence on
  clashes: "Enterprise over personal, and personal over project"; a `.claude/commands/` file loses to a
  same-named skill; plugin skills are namespaced.
- Fact (loading): "skill descriptions are loaded into context ... but full skill content only loads when
  invoked". The listing budget "scales at 1% of the model's context window"; on overflow descriptions of
  least-invoked skills are dropped first. Invoked content "stays in context across turns" and is not
  re-read; after compaction CC re-attaches the most recent invocation of each skill, first 5,000 tokens
  each, 25,000 combined.
- Fact (invocation table): default: you and Claude can invoke, description always in context;
  `disable-model-invocation: true`: only you, description NOT in context; `user-invocable: false`: only
  Claude. "With `user-invocable: false`, you can't invoke the skill, but Claude still can."
- Fact (`allowed-tools`): pre-approves tools "during the invoking turn"; "The grant clears when you send
  your next message"; it does not restrict: "every tool remains callable". Restriction is via
  permission rules `Skill(name)`, `Skill(name *)`, deny `Skill`, or `skillOverrides` (`on`,
  `name-only`, `user-invocable-only`, `off`).
- Fact: supporting files referenced from SKILL.md; `${CLAUDE_SKILL_DIR}` for bundled scripts; scripts
  are "executed, not loaded". `$ARGUMENTS`, `$N`, named `$name`. Dynamic context `` !`cmd` `` runs before
  Claude sees the skill; "A failed command aborts the entire skill invocation"; disable with
  `disableSkillShellExecution`. Skills can register `hooks` that stay for the rest of the session.
- Fact: Live change detection for skill dirs (not in bare mode); new top-level skills dir needs
  `/reload-skills`.
- Source: Extend Claude with skills https://code.claude.com/docs/en/skills (checked 2026-10-29,
  CC 2.1.312)
- Confidence: verified
- Implication: a SKILL.md that is valid in CC can be invalid per the spec (no `name`, long description,
  CC-only fields). A portable-skill check is deterministic and teaches the difference.

#### 2.3 Other tools, verified per tool
- Codex (learn.chatgpt.com/docs/build-skills, checked 2026-10-29): "Skills build on the open agent
  skills standard"; `SKILL.md` "must include `name` and `description`"; repo scope scans `.agents/skills`
  from CWD up to repo root; user `$HOME/.agents/skills`; admin `/etc/codex/skills`; system bundled
  (skill-creator, plan). Explicit invocation `/skills` or `$skill`; implicit by description. Initial list
  budget "at most 2% of the model's context window, or 8,000 characters" (`skills.max_context_tokens`
  up to 10,000). Optional `agents/openai.yaml` with `policy.allow_implicit_invocation: false` (Codex
  analogue of `disable-model-invocation`). `$skill-creator`, `$skill-installer`. Custom prompts are
  deprecated in favour of skills. Confidence: verified.
- Cursor (cursor.com/docs/context/skills, checked 2026-10-29): project `.agents/skills/`,
  `.cursor/skills/`; user `~/.agents/skills/`, `~/.cursor/skills/`; compatibility `.claude/skills/`,
  `.codex/skills/` and their `~` variants. `name` required, must match folder; `description` required;
  supports `paths`, `disable-model-invocation`, `metadata`, `icon`, `color`. Version of introduction not
  stated (only `/migrate-to-skills` "in 2.4"). Confidence: verified (single page).
- Gemini CLI (geminicli.com/docs/cli/skills, checked 2026-10-29): "based on the Agent Skills open
  standard"; user `~/.gemini/skills/` or `~/.agents/skills/`; workspace `.gemini/skills/` or
  `.agents/skills/` (`.agents` wins within a tier); activation via `activate_skill` tool with a user
  consent prompt; skill dir added to allowed paths. Page notes unpaid tier and Google One users moved to
  Antigravity CLI on 2026-06-18. Confidence: verified.
- GitHub Copilot (docs.github.com/en/copilot/concepts/agents/about-agent-skills, checked 2026-10-29):
  supports agent skills in Copilot app, CLI, cloud agent, code review, IDE agent mode; project
  `.github/skills`, `.claude/skills`, `.agents/skills`; personal `~/.copilot/skills`, `~/.agents/skills`.
  The page does not name `SKILL.md` or frontmatter. Confidence: single source.
- Implication: `.agents/skills/` is the most portable project location across Codex, Cursor, Gemini CLI
  and Copilot; CC reads `.claude/skills/` (Cursor and Copilot also read `.claude/skills/`). Do not claim
  CC reads `.agents/skills/`: not found in the CC skills page.

#### 2.4 Anthropic's skills repo, skill-creator, evaluating skills
- Fact: github.com/anthropics/skills ("Public repository for Agent Skills", last push 2026-10-28) skills:
  academy-guide, algorithmic-art, brand-guidelines, canvas-design, claude-api, discernment-nudge,
  doc-coauthoring, docx, frontend-design, internal-comms, mcp-builder, pdf, pptx, skill-creator,
  slack-gif-creator, theme-factory, web-artifacts-builder, webapp-testing, xlsx. README: "Many skills in
  this repo are open source (Apache 2.0)"; document skills are source-available; "provided for
  demonstration and educational purposes only". Install in CC: `/plugin marketplace add
  anthropics/skills`.
- Fact: CC docs "Evaluate and iterate on a skill": "Seeing a skill trigger tells you Claude found it, not
  that it did what you intended." Method: baseline comparison, realistic prompts in fresh sessions with
  the skill on and off (`skillOverrides: "off"`). skill-creator plugin (`/plugin install
  skill-creator@claude-plugins-official`): `evals/evals.json` in the skill dir, one subagent per test
  case, `grading.json`, `benchmark.json` (pass rate, time, tokens with vs without), blind A/B between
  versions, description tuning with should/should-not-trigger prompts. For plugins: `claude plugin eval`
  (exits non-zero below a threshold, CI-gateable). `/skill-doctor` (v2.1.252+) shows cost and usage,
  flags never-invoked skills. `claude plugin validate .claude/skills` finds unparsable frontmatter
  (v2.1.233+).
- Source: https://github.com/anthropics/skills, https://code.claude.com/docs/en/skills (checked
  2026-10-29)
- Confidence: verified
- Implication: the lifecycle lesson has a primary-source loop: write -> eval with/without -> tune
  description -> version -> measure usage -> prune. These tools need CC and model calls, so in the
  workspace they are theory or hidden-task, not command checks.

#### 2.5 Skill vs CLAUDE.md vs hook vs subagent (CC)
- Fact: features overview: CLAUDE.md "Every session, automatically" for "always do X" rules; skill "On
  demand" for reference material and invocable workflows; hook "Fires on its event without Claude
  deciding" vs skill "Claude interprets the instructions; outcome can vary"; subagent = isolated context
  returning a summary. Growth triggers: "You paste the same playbook or multi-step procedure into chat
  for the third time" -> skill; "You want something to happen every time without asking" -> hook.
- Fact: best practices "Put team procedures in skills": "only write down what Claude can't find on its
  own"; side-effect workflows get `disable-model-invocation: true` (release example).
- Fact: skills troubleshooting: "Claude skipped a rule that must hold every time: move the rule into a
  hook"; put the most important instructions near the top of SKILL.md (compaction keeps the start).
- Source: https://code.claude.com/docs/en/features-overview, /best-practices, /skills (checked
  2026-10-29)
- Confidence: verified
- Implication: a classification exercise (situation -> CLAUDE.md / rule / skill / user-only skill /
  hook / subagent) is quiz- or command-gradeable and reuses 00/05 and 00/06.

#### 2.6 Security of third-party skills
- Fact: "Use Skills only from trusted sources ... a malicious Skill can direct Claude to call tools or
  run code in ways that don't match the Skill's stated purpose." Audit all bundled files; "Skills that
  fetch data from external URLs pose particular risk ... Even trustworthy Skills can be compromised if
  their external dependencies change over time"; "Treat like installing software". In Claude Code
  skills have "Full network access: Skills have the same network access as any other program on the
  user's computer." Custom skills do not sync across claude.ai / API / CC.
- Source: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview (checked
  2026-10-29)
- Confidence: verified
- Fact: Matt Pocock's README: "A plugin updates itself"; the CC install "Updates itself by default";
  skills.sh "copies editable files into your project, and you update them by hand".
- Implication: auto-updating plugin = content changes without review (supply chain, LLM03 from 00/06).
  Vendoring a reviewed copy is the controllable alternative. Also note dynamic context `` !`cmd` `` runs
  shell before the model sees anything, and skill `hooks` persist for the session.

### 3. Matt Pocock's skills (required by the reference program)

- Fact: Repository github.com/mattpocock/skills, "Skills for Real Engineers. Straight from my .agents
  directory.", MIT, created 2026-02-03, last push 2026-10-29, ~306k stars; plugin
  `mattpocock-skills` version 1.3.2 (release v1.3.2 published 2026-10-29T10:27Z; v1.3.0/1.3.1
  2026-10-04; v1.2.3 2026-08-06). Uses changesets, CHANGELOG.md, GLOSSARY.md, SCOPE.md,
  `.agents/adr/`, `.out-of-scope/` (one file per rejected idea).
- Fact (positioning, README): "Approaches like GSD, BMAD, and Spec-Kit try to help by owning the
  process. But while doing so, they take away your control ... These skills are designed to be small,
  easy to adapt, and composable." Four failure modes: misalignment (fix: grilling), verbosity (fix:
  shared language, Evans' ubiquitous language), code doesn't work (fix: feedback loops, red-green-refactor
  `/tdd`, `/diagnosing-bugs`), ball of mud (fix: `/improve-codebase-architecture`, deep modules).
- Fact (taxonomy): "User-invoked skills are reachable only when you type them ... their job is to
  orchestrate. Model-invoked skills can be invoked by you or reached for automatically ... they hold the
  reusable discipline. A user-invoked skill may invoke model-invoked skills, but never another
  user-invoked one." Implemented with `disable-model-invocation: true` in SKILL.md plus
  `agents/openai.yaml` `policy.allow_implicit_invocation: false` for Codex (e.g. grill-me).
- Fact (skills in the plugin, exact names, from README and .claude-plugin/plugin.json):
  Engineering, user-invoked: `ask-matt` (router), `grill-with-docs` (grilling that also updates
  `GLOSSARY.md` and ADRs inline), `triage` (issues through a state machine of triage roles),
  `improve-codebase-architecture`, `setup-matt-pocock-skills` (issue tracker, triage labels, domain doc
  layout; run once per repo), `to-spec` ("Turn the current conversation into a spec and publish it to
  the issue tracker. No interview, just synthesizes"), `to-tickets` (tracer-bullet tickets with
  blocking edges), `implement` (build from spec/tickets, `/tdd` at pre-agreed seams, `/code-review`
  before commit), `implement-spec` (whole spec on one integration branch, implementer subagents across
  the ready frontier), `wayfinder` (plan work larger than one session as decision tickets), `retro`
  (suggest harness improvements after a session).
  Engineering, model-invoked: `prototype`, `diagnosing-bugs`, `research`, `tdd`, `domain-modeling`,
  `codebase-design`, `code-review` (two axes, Standards and Spec, parallel sub-agents), `pr`, `wizard`.
  Productivity, user-invoked: `grill-me`, `handoff`, `teach`, `to-questionnaire`, `wait-what`.
  Productivity, model-invoked: `grilling` (the interview primitive), `writing-for-agents`.
  Not in the plugin: `skills/misc/` ("frozen and unmaintained": `git-guardrails-claude-code` with
  `scripts/block-dangerous-git.sh`, `migrate-to-shoehorn`, `scaffold-exercises`, `setup-pre-commit`)
  and `skills/in-progress/` (chief-of-staff, claude-handoff, loop-me, setup-ts-deep-modules,
  writing-beats/fragments/shape).
- Fact (content, read from SKILL.md files at v1.3.2):
  - `grill-me`: 3 lines of body: "Call the Skill tool with "grilling"." `grill-with-docs`: "Call the
    Skill tool twice, for "grilling" and "domain-modeling"."
  - `grilling`: "Interview the user relentlessly until you reach a shared understanding. Map this as a
    design tree"; work in rounds over the "frontier" (decisions whose prerequisites are settled), number
    questions and give a recommended answer, "Word each question so "yes" accepts your recommended
    answer"; "Finding facts is your job, never the user's" (dispatch a sub-agent for facts); "The
    decisions are the user's"; done when the frontier is empty; "Do not act on it until the user
    confirms".
  - `domain-modeling`: files `GLOSSARY.md` (or `GLOSSARY-MAP.md` + per-context `GLOSSARY.md`) and
    `docs/adr/`, created lazily. Challenge terms against the glossary, sharpen fuzzy language, invent
    edge-case scenarios, cross-reference with code, update GLOSSARY.md inline; "GLOSSARY.md should be
    totally devoid of implementation details". Offer ADRs only when all three hold: hard to reverse,
    surprising without context, result of a real trade-off.
  - `GLOSSARY-FORMAT.md`: `# {Context}`, `## Language`, entries `**Term**:` one-two sentence definition
    plus `_Avoid_: synonyms`; "Be opinionated"; only project-specific terms; multi-context map with
    `## Relationships` (e.g. "Ordering emits `OrderPlaced` events; Fulfillment consumes them").
  - `ADR-FORMAT.md`: `docs/adr/0001-slug.md`, sequential; template is a title plus "1-3 sentences: what's
    the context, what did we decide, and why"; optional Status (`proposed | accepted | deprecated |
    superseded by ADR-NNNN`), Considered Options, Consequences.
  - `to-spec` template: Problem Statement, Solution, User Stories ("A LONG, numbered list ... As an
    <actor>, I want a <feature>, so that <benefit>"), Implementation Decisions ("Do NOT include specific
    file paths or code snippets"), Testing Decisions, Out of Scope, Further Notes. Step 2: sketch test
    seams, "the ideal number is one", confirm with the user. Applies label `ready-for-agent`.
  - `to-tickets`: vertical "tracer bullet" slices through every layer, each "sized to fit in a single
    fresh context window", each declaring blocking edges; wide refactors as expand-contract; quiz the
    user on the breakdown before publishing.
  - `tdd`: "Tests verify behavior through public interfaces"; "Test only at pre-agreed seams"; anti-
    patterns implementation-coupled, tautological ("the assertion recomputes the expected value the way
    the code does ... Expected values must come from an independent source of truth"), horizontal
    slicing; "Red before green"; refactoring belongs to review, not the loop.
  - `setup-matt-pocock-skills/domain.md`: other skills read GLOSSARY.md and relevant ADRs before
    exploring; "If any of these files don't exist, proceed silently"; use glossary vocabulary in issue
    titles and test names; flag ADR conflicts explicitly.
- Fact (renames, CHANGELOG): `to-prd` -> `to-spec` (spec file is `spec.md`, "not PRD.md");
  `to-issues` -> `to-tickets`; `ubiquitous-language` -> `domain-modeling`; `diagnose` ->
  `diagnosing-bugs`; `write-a-skill` -> `writing-great-skills` -> `writing-for-agents`;
  `decision-mapping` -> `wayfinder`; `review` -> `code-review`; `zoom-out` and
  `resolving-merge-conflicts` removed. v1.3.0 (2026-10-04): "Rename the CONTEXT.md/CONTEXT-MAP.md
  domain-doc convention to GLOSSARY.md/GLOSSARY-MAP.md ... the skills only look for
  GLOSSARY.md/GLOSSARY-MAP.md going forward."
- Fact (lifecycle policy): deprecated bucket is empty: "a retired skill is deleted, and the changeset
  that removes it names whatever replaced it"; new skills not accepted: "if you can compose the
  behaviour from existing skills, it doesn't get a new skill"; an issue must show an "Observed failure"
  in a real session.
- Install: CC `claude plugin install mattpocock-skills@claude-plugins-official`; Codex/Copilot via
  plugin marketplace `mattpocock/skills`; Gemini CLI `gemini skills install ... --path
  skills/engineering`; others `npx skills@latest add mattpocock/skills -a <agent>`.
- Source: https://github.com/mattpocock/skills (README.md, CHANGELOG.md, SCOPE.md, GLOSSARY.md,
  .claude-plugin/plugin.json, skills/**/SKILL.md, read via GitHub API at v1.3.2, checked 2026-10-29)
- Confidence: verified
- Implication: the "real cases" lesson can be built on the actual pipeline grill-with-docs -> to-spec
  -> to-tickets -> implement (tdd + code-review), with GLOSSARY.md and ADRs as by-products. Quote skill
  names from v1.3.2 and pin the version in sources: this repo renames things monthly. Do not say
  "PRD skill" or "CONTEXT.md" as current. The skills are short enough (7-120 lines) to read in full in
  a lesson.

### 4. Spec-driven development tooling and practice

- Fact (Böckeler, "Understanding Spec-Driven-Development: Kiro, spec-kit, and Tessl", martinfowler.com,
  15 Oct 2025): levels spec-first (spec written before the AI-assisted task), spec-anchored (spec kept
  after the task and used to evolve the feature), spec-as-source (spec is the main artifact, humans edit
  only the spec). Kiro mostly spec-first; spec-kit spec-first (aspires to anchored, but branch per spec);
  Tessl the only one aspiring to spec-anchored / exploring spec-as-source ("GENERATED FROM SPEC - DO NOT
  EDIT"). Criticisms: one workflow for all sizes ("like using a sledgehammer to crack a nut": a small bug
  became 4 user stories with 16 acceptance criteria), "I'd rather review code than all these markdown
  files", false sense of control (agents ignored or over-applied specs), MDD parallels ("Inflexibility
  and non-determinism"), "Verschlimmbesserung".
- Source: https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html (checked 2026-10-29)
- Confidence: verified. No newer martinfowler.com memo dedicated to SDD exists in the series index
  (checked 2026-10-29); later related memos: Context Engineering for Coding Agents (2026-02-05), Harness
  Engineering first thoughts (2026-02-17), TDD in the agent loop (2026-08-10), Are Harnesses Worth the
  Cost? (2026-10-13).
- Fact (GitHub Spec Kit v1.2.5, MIT): install `uv tool install specify-cli`, `specify init <project>
  --integration <agent>`; needs Python 3.11+ and uv. SDD flow: constitution, specify, plan, tasks,
  implement, converge; "Repeat implement and converge until convergence reports Converged". Commands
  (docs use `/speckit.*`; Copilot skills mode `/speckit-*`; Codex `$speckit-*`): `constitution`,
  `specify` (writes `spec.md`), `clarify` (up to five questions, encodes answers into the spec), `plan`
  (`plan.md`), `checklist`, `tasks` (`tasks.md`, dependency-ordered), `analyze` ("Read-only consistency
  and quality analysis" across spec/plan/tasks, "It never edits files"), `implement`, `converge`
  (append-only, may only add tasks under a Convergence section; "Converged" when no gaps),
  `taskstoissues` deprecated. Also bug-fixing and idea-assessment extensions; "These are independent
  entry points, not mandatory phases." Community catalogs "are not audits or endorsements".
- Source: https://github.com/github/spec-kit (README at v1.2.5),
  https://github.github.io/spec-kit/reference/agentic-sdd.html (checked 2026-10-29)
- Confidence: verified. The reference page did not name research.md / data-model.md / contracts/; do not
  claim them for v1.2.5.
- Fact (Kiro): each spec generates `requirements.md` (or `bugfix.md`), `design.md`, `tasks.md`. Feature
  specs: Requirements-First or Design-First; EARS: "WHEN [condition/event] THE SYSTEM SHALL [expected
  behavior]". Quick Spec without approval gates. Tasks form a dependency graph executed in waves.
  Correctness: Kiro "extracts properties from your EARS-formatted requirements" for property-based tests,
  traceable requirement -> property -> task; IDE only.
- Source: https://kiro.dev/docs/specs/ (updated 2026-10-15), /docs/specs/feature-specs/ and
  /docs/specs/correctness/ (updated 2026-08-04), checked 2026-10-29
- Confidence: verified for the above; `.kiro/specs/<name>/` path and steering files
  (`product.md`/`tech.md`/`structure.md`) could not verify (pages fetched did not cover them).
- Fact (OpenSpec v1.15.0, MIT): `/opsx:explore`, `/opsx:propose <name>` creates
  `openspec/changes/<name>/` with `proposal.md`, `specs/` (delta: `## ADDED Requirements`, `### Requirement:
  ...` with SHALL, `#### Scenario:` WHEN/THEN), `design.md`, `tasks.md`; `/opsx:apply`; `/opsx:archive`
  merges deltas into the main specs. CLI `openspec validate [--all|--changes|--specs|--strict|--json]`
  checks structure and a change's MODIFIED requirements against main specs; a change with zero spec deltas
  fails unless `skip_specs: true`; `--archived` fails if archived changes have unticked tasks ("handy in
  a pre-commit hook").
- Source: https://github.com/Fission-AI/OpenSpec (README, docs/cli.md; checked 2026-10-29)
- Confidence: verified
- Fact (Tessl): docs.tessl.io today describes a registry/package manager for skills and plugins,
  governance with Snyk scoring, evals with/without context, observability, drift detection; "context as
  code". It no longer leads with spec-as-source.
- Source: https://docs.tessl.io/ (checked 2026-10-29)
- Confidence: single source
- Fact (BMAD-METHOD): v6.12.4 (2026-10-14), license field NOASSERTION. Not researched further.
- Confidence: verified (version only)
- Fact (CC interview -> SPEC.md): "Interview me until you could write the spec, then write it to
  SPEC.md." Claude asks multiple-choice questions; "Once SPEC.md exists, start a fresh session to build
  from it, so the build begins with a clean context and a written definition of done."
- Source: https://code.claude.com/docs/en/best-practices (checked 2026-10-29)
- Confidence: verified
- Implication: SDD is a spectrum, not a tool. Teach the levels (Böckeler), the shared skeleton across
  tools (intent/requirements -> design/plan -> tasks -> implement -> check against spec), and the
  criticism (size mismatch, markdown review fatigue, drift). The checkable core is tool-neutral: a spec
  with testable acceptance criteria (EARS or WHEN/THEN), tasks traced to requirements, and a converge /
  analyze-style consistency check.

### 5. Artifacts and automated integrity control

- Fact (Nygard, "Documenting Architecture Decisions", 2011-11-15): sections Title (short noun phrase),
  Context ("the forces at play"), Decision ("full sentences, with active voice"), Status (proposed,
  accepted, deprecated, superseded), Consequences ("All consequences should be listed here, not just the
  positive ones"). Kept in repo at `doc/arch/adr-NNN.md`, numbers sequential, never reused; reversed
  decisions are kept and marked superseded.
- Source: https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions (checked
  2026-10-29)
- Confidence: verified
- Fact (MADR 4.0.0, 2024-09-17, current release): optional YAML front matter `status` ("proposed |
  rejected | accepted | deprecated | ... | superseded by ADR-0123"), `date`, `decision-makers`,
  `consulted`, `informed`; sections Context and Problem Statement, Decision Drivers, Considered Options,
  Decision Outcome, Consequences, Confirmation, Pros and Cons of the Options, More Information.
  Confirmation: "Describe how the implementation / compliance of the ADR can/will be confirmed. Is there
  any automated or manual fitness function? ... a test with a library such as ArchUnit can help".
- Source: https://github.com/adr/madr (template/adr-template.md, releases; checked 2026-10-29)
- Confidence: verified
- Fact (adr-tools, npryce): last release 3.0.0 (2018-07-25), last push 2024-04-25, not archived.
- Confidence: verified. Implication: mention as history, not as the tool to install.
- Fact: this repo's live examples: `docs/adr/0000-template.md` (Status: Proposed | Accepted |
  Superseded by ADR-XXXX; Date; Issue; Context; Decision; Alternatives considered; Consequences), ADRs
  0001-0006 all `Status: Proposed`; ADR-0001 contract enforced by `pnpm content:validate` in CI;
  ADR-0006 enforced by `scripts/design_tokens.py check design` (exit 0 clean, 1 findings, 2 usage/parse
  error) in CI job `design`.
- Source: repo files (read 2026-10-29)
- Confidence: verified
- Fact (PRD): no single primary standard found or researched; Matt Pocock renamed PRD to "spec" and his
  `to-spec` template (Problem, Solution, User Stories, Implementation Decisions, Testing Decisions, Out
  of Scope) is the concrete PRD-like structure in the reference program's tool set.
- Confidence: verified for Matt's template; "PRD standard structure" could not verify (not researched).
- Fact (integrity control, documented mechanisms found):
  - Spec Kit `/speckit.analyze` (read-only cross-artifact consistency: task with no matching
    requirement, plan contradicting spec) and `/speckit.converge` (implementation vs artifacts):
    model-run, not deterministic.
  - OpenSpec `openspec validate --all --strict --json` and `--archived`: deterministic CLI suitable for CI
    and pre-commit.
  - Kiro: requirement -> property -> task traceability with property-based tests (IDE).
  - MADR Confirmation section: fitness functions / ArchUnit-style tests per decision.
  - Böckeler Harness Engineering memo (2026-02-17) on the OpenAI write-up: architectural constraints
    "enforced by LLM-based agents and by deterministic custom linters and structural tests";
    "garbage collection": periodic agents finding documentation inconsistencies.
    Source: https://martinfowler.com/articles/exploring-gen-ai/harness-engineering-memo.html (checked
    2026-10-29). Confidence: verified (memo). The underlying OpenAI post "Harness engineering:
    leveraging Codex in an agent-first world" (reported date 2026-02-11) returned HTTP 403: could not
    verify its text.
  - CC skills page: `/doctor prompt-audit` (v2.1.283+) checks CLAUDE.md files and skills for outdated or
    conflicting instructions (model-run).
- Implication: the "automated integrity control" topic splits cleanly: deterministic checks (structure,
  numbering, statuses, links, requirement-ID traceability, glossary term usage, OpenSpec-style
  validate) belong in command checks and in CI; semantic consistency (does code match the spec) needs a
  model (analyze/converge, reviewer subagent) and is model-decided. This repo is a working example of
  the deterministic half.

### 6. Project ontology: domain model, glossary, processes

- Fact: Ubiquitous Language: "building up a common, rigorous language between developers and users";
  "This language should be based on the Domain Model used in the software." (Fowler bliki, 2006-10-31)
- Fact: Bounded Context: "central pattern in Domain-Driven Design"; large models divided into contexts
  with explicit relationships; same word, different meaning across contexts (utility "meter"; "Time and
  time again I see this confusion recur with polysemes like 'Customer' and 'Product'"); "It's usually
  worthwhile to depict these using a context map." (Fowler bliki, 2014-01-15)
- Fact: Aggregate: "a cluster of domain objects that can be treated as a single unit"; one object is the
  aggregate root; "Transactions should not cross aggregate boundaries"; aggregates are the unit of load
  and save. (Fowler bliki, 2013-04-23)
- Fact: Value Object: equal "due to the value of their properties"; entities/reference objects compared
  by identity; "value objects should be immutable". (Fowler bliki, 2016-11-14)
- Fact: Evans, DDD Reference (CC BY 4.0, PDF dated 2015-03) summarizes the definitions and patterns of
  his book plus three later patterns. The book is commonly dated 2003 (domainlanguage.com calls it the
  "2004 book", copyright year); say "Evans, Domain-Driven Design (2003)" or avoid the year.
- Fact: EventStorming: "a flexible workshop format for collaborative exploration of complex business
  domains"; book "Introducing EventStorming" by Alberto Brandolini (Leanpub). The site lists purpose-based
  styles (Improve, Envision, Explore, Design). Brandolini's 2013 blog post could not be fetched;
  sticky-note colour grammar not verified from a primary source.
- Sources: https://martinfowler.com/bliki/UbiquitousLanguage.html, /BoundedContext.html,
  /DDD_Aggregate.html, /ValueObject.html; https://www.domainlanguage.com/ddd/reference/;
  https://www.eventstorming.com/ (all checked 2026-10-29)
- Confidence: verified, except EventStorming notation (could not verify)
- Fact (feeding the model to the agent): Matt Pocock's convention (v1.3.2): root `GLOSSARY.md` or
  `GLOSSARY-MAP.md` with per-context glossaries, `docs/adr/`; skills read them before exploring, use the
  vocabulary in issue titles and test names, flag ADR conflicts. README example: "There's a problem with
  the materialization cascade" vs a long paraphrase; claimed benefits: consistent naming, easier
  navigation, fewer thinking tokens (author's claim, not measured).
- Fact: CC-native ways to feed it: CLAUDE.md `@path` import (loads every session), `.claude/rules/` with
  `paths:` (loads for matching files), or a model-invoked skill (on demand). 00/05 already teaches the
  loading rules.
- Implication: ontology = glossary (terms, _Avoid_ synonyms), entities/value objects/aggregates,
  relationships (context map), processes (domain events, EventStorming). Deterministic consistency checks
  are feasible: every `_Avoid_` synonym absent from code identifiers/spec, every term used in spec
  defined, relationships reference defined contexts/events, no implementation details in the glossary
  (heuristic). The user's own global rules already demand "One vocabulary per domain, taken from the
  spec" (seat never place/ticket): a natural hook for the lesson.

### 7. What is checkable where (workspace, no paid calls vs mentor vs headless agent)

- Fact (contract): `command` exit 0 = pass, needs workspace, timeoutSec <= 1800; `rubric` mentor grades
  artifacts against `checks/rubric.md`; `hidden-task` headless agent in a fresh copy of the learner's
  workspace, deterministic `verify`, timeoutSec <= 3600, budgetUsd <= 20; `bug-hunt` matched against
  `checks/bugs.yaml`. theory.md/task.md must not contain "checks/".
- Source: packages/lesson-schema/src/schema.ts, .claude/agents/content/_contract.md (read 2026-10-29)
- Confidence: verified
- Deterministic (command, `python3 -I`, stdlib only) candidates, each grounded above:
  1. Portable SKILL.md: name regex/length/dir match, description 1-1024, only spec fields, `---` on line
     1, body < 500 lines, referenced files exist and are one level deep; side-effect skill has
     `disable-model-invocation: true`. (Spec 2.1, CC 2.2.) Do not depend on `skills-ref` (needs click,
     strictyaml, not stdlib) or on the `claude` binary (`claude plugin validate`).
  2. Stop hook: registration shape in `.claude/settings.json` (like 00/06 `verify_hook.py`), then run the
     learner's script with crafted stdin JSON: red tests -> exit 2 with useful stderr; green -> exit 0;
     `stop_hook_active: true` and still red -> must not loop forever (design choice to define). Prefer a
     Python hook (learner is weak in Linux/shell).
  3. Tests that can fail: run the learner's tests against hidden mutants of a reference implementation;
     each mutant must be killed; also run against the correct implementation (must pass). Detects
     tautological / skipped / `assert True` style tests deterministically. Needs the language runtime in
     the image (00 used stdlib Python only; a Python test target avoids new dependencies, but `pytest` is
     not stdlib: `unittest` is).
  4. Spec traceability: requirement IDs or EARS lines in spec.md, each referenced by >= 1 task and >= 1
     test name; no orphan IDs; acceptance criteria in WHEN/THEN or EARS form.
  5. ADR lint: sequential numbering, allowed status set, superseded links resolve, required sections per
     the chosen template.
  6. Glossary lint: format (`**Term**:`, `_Avoid_:`), avoided synonyms absent from spec/code, terms used in
     spec defined.
- Rubric (mentor) candidates: spec quality (problem/solution/user stories/out of scope, seams), whether an
  ADR was warranted (Matt's three criteria), glossary definition quality ("what it IS"), grilling
  transcript quality. Same caution as 00: cheap form check as a filter, meaning in the rubric.
- Hidden-task (headless agent, costs money) candidates: (a) learner's skill triggers on hidden positive
  prompts and not on negatives (detectable in `--output-format stream-json` as a Skill `tool_use`);
  (b) learner's Stop hook forces an agent to finish a hidden task with green tests; (c) the learner's
  spec + glossary let an agent implement a hidden feature that passes hidden tests. Facts that constrain
  it: `--bare` "skips hooks, skills, plugins, MCP servers, and CLAUDE.md files", and "`--bare` is the
  recommended mode for scripted and SDK calls, and will become the default for `-p` in a future
  release" -> a runner that must exercise the learner's skills/hooks must not use `--bare` and should pin
  this explicitly; without `--bare`, `-p` "runs the hooks in a project's .claude/settings.json ... even
  in a folder you've never trusted"; `--max-budget-usd` and `--max-turns` cap spend
  (https://code.claude.com/docs/en/headless, /best-practices, checked 2026-10-29). Model output is
  non-deterministic: a single run is a weak signal for "triggers reliably".
- Bug-hunt candidates: a transcript where the agent "verified" by editing a test, hard-coding an
  expected value, skipping the red step, or claiming "all tests pass" without a command; a spec/ADR/
  glossary set with planted drift (term used with an avoided synonym, superseded ADR still referenced,
  requirement with no test, untestable requirement).
- Module 00 approach (plans/15-module-introduction-demo.md): the runtime does not exist (workspace image
  #07, runner #08, quiz UI #10, rubric mentor #11, hidden-task runner #13). The practice-designer
  demonstrated every command check locally with scratch drivers: Python 3.12, `python3 -I`, a fresh temp
  copy of `starter/` (plus `checks/reference/` overlay for the reference run), an environment built from
  scratch (`ACADEMY_CHECKS_DIR` pointing at a copy of `checks/` with `reference/` and reserve data
  removed), the lesson.yaml `run` string executed verbatim through `/bin/sh -c`; recorded empty starter
  -> fail, reference -> pass, wrong solutions and attacks (usercustomize, PATH shim) -> fail. A student
  cheater run then found 8 passing cheats (C1-C8), all fixed and re-run; C9 (writable checks mount) left
  as a runner requirement. Rubrics and hidden-tasks were dry-run by hand / by the student agent only.
- Implication: module 01 should keep the same demo protocol; any hidden-task in 01 is unrunnable today
  and must be backed by a command check that carries the outcome on its own, or be explicitly marked as
  pending #13.

## Contradictions between sources
1. Skill `name`: Agent Skills spec and Anthropic platform docs: required, <= 64 chars, lowercase, match
   directory (platform adds: no XML tags, no reserved words "anthropic", "claude"); Cursor: required, must
   match folder; Codex: `name` and `description` required; Claude Code: "All fields are optional",
   `name` defaults to the directory name.
2. Description limit: spec and platform docs 1,024 chars; CC truncates description + when_to_use at
   1,536 chars in the listing and drops whole descriptions when the 1%-of-context budget overflows; Codex
   budget 2% of context or 8,000 chars and shortens descriptions first.
3. Metadata cost: spec/platform "~100 tokens" per skill at startup vs CC's budgeted, possibly truncated
   listing. Both true for their surface; never state one number as universal.
4. ADR shape: Nygard (5 sections) vs MADR 4.0.0 (rich, with Confirmation) vs Matt Pocock (title + 1-3
   sentences; ADR only if hard to reverse AND surprising AND real trade-off) vs this repo's template.
   Present as a range of weight, not a right answer.
5. TDD with agents: CC best practices example ("write a failing test that reproduces it, then fix it")
   and Matt's `/tdd` (red before green) vs Böckeler 2026 (no discernible benefit, 3-8x tokens, stopped
   prescribing test-first). Small experiment; both are practitioner positions.
6. Self-verification prompting: "Ask Claude to self-check ... catches errors reliably" vs "Claude Opus 5
   is the exception ... can cause over-verification" (same page). Model-specific.
7. "PRD" (reference program) vs "spec" (Matt Pocock renamed `to-prd` to `to-spec`, file `spec.md`, "not
   PRD.md"). The task brief's "CONTEXT.md" is the pre-v1.3.0 name; current is `GLOSSARY.md`.
8. Stop hook contract CC vs Codex: CC accepts exit 0 with no output; Codex requires JSON on stdout for
   exit 0 ("Plain text output is invalid"). Codex turns `reason` into a new user prompt; CC routes it as
   the explanation. Codex requires hook trust by hash; CC `-p` runs project hooks untrusted.
9. `/goal` (model-evaluated from the transcript, cannot run commands) vs Stop command hook (harness runs
   the check). CC docs list `/goal` under non-deterministic.
10. Spec Kit invocation syntax differs by agent (`/speckit.specify`, `/speckit-specify`,
    `$speckit-specify`); README uses the Copilot form, reference docs the dotted form.
11. Evans book year: commonly 2003; domainlanguage.com says "2004 book".
12. Böckeler TDD memo date: index "10 Aug 2026"; the article page shows none.
13. Matt Pocock README positions his skills against Spec Kit/BMAD ("owning the process"); Spec Kit now
    says its processes are "independent entry points, not mandatory phases". Vendor self-descriptions.

## Things that changed recently (and what lessons may now be stale)
- CC is 2.1.312 (2026-10-27); module 00 sources say 2.1.311. Hooks: 33 events incl. TaskCompleted,
  TeammateIdle, PostToolBatch, StopFailure; Stop 8-consecutive-block cap and
  `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`; `additionalContext` on Stop; `onFailure` (v2.1.295) has no effect on
  Stop-family events; agent hooks "experimental"; v2.1.311 fixed SubagentStop firing about twice a minute
  per running subagent.
- CC skills: commands merged into skills; `/goal`; bundled `/run`, `/verify`, `/run-skill-generator`;
  verify/simplify before commits (v2.1.286); `/skill-doctor` (v2.1.252); `skillOverrides`; `claude plugin
  eval`; `claude plugin validate` (v2.1.233); `/doctor prompt-audit` (v2.1.283); compaction re-sends the
  skill list (recent); `--bare` planned to become default for `-p` (would silently disable skills and
  hooks in headless runs).
- Matt Pocock skills: v1.3.2 released on the check date; renames listed in section 3; CONTEXT.md ->
  GLOSSARY.md in v1.3.0 (2026-10-04). Highest stale risk in the module: re-check names and the plugin
  skill list right before the lessons go `ready`, and cite the version.
- Spec Kit: v1.2.5 (2026-10-28); `/speckit.converge` and processes for bug fixing / idea assessment;
  `taskstoissues` deprecated; Copilot "skills mode" names. Older tutorials show only the five-step flow.
- OpenSpec v1.15.0 uses `/opsx:*` commands (older posts show `openspec proposal` style).
- Tessl: docs now about a skills registry/evals/governance; Böckeler's Oct 2025 description of Tessl as
  spec-as-source is historical.
- Gemini CLI: unpaid/Google One users moved to Antigravity CLI on 2026-06-18 (per Gemini CLI docs).
- Codex: skills at `.agents/skills`; custom prompts deprecated in favour of skills; docs moved to
  learn.chatgpt.com (developers.openai.com/codex/skills 308-redirects).
- Kiro: Quick Spec, bugfix specs, property-based "Correctness" (IDE only), parallel task waves.
- MADR 4.0.0 unchanged since 2024-09-17; adr-tools dormant since 2018.
- Stale watchlist for this module: CC version and hook/skill fields; `--bare` default flip; Matt Pocock
  skill names and conventions; Spec Kit command set; Agent Skills spec fields (e.g. `allowed-tools`
  still "Experimental"); client list.

## Overlap with module 00 and later modules
- 00/04 context-and-planning: already teaches plan mode, "interview instead of guessing" (deferred
  detail to 01), "first the verification target ... a step without a check cannot be declared done",
  "loop until done" anti-pattern and "give the agent a check", fresh reviewer vs delegation. 01 should
  build on, not repeat: go from "plan with checks" to "spec with acceptance criteria + enforced checks".
- 00/05 memory: CLAUDE.md only non-inferable facts, loading rules, `.claude/rules/` `paths:`, "CLAUDE.md
  -> skills" as a cost lever. 01's skills lesson should reuse this and add progressive disclosure and
  invocation control, not re-teach loading of CLAUDE.md.
- 00/06 permissions-security: deterministic vs model-decided, PreToolUse exit 2 / JSON deny,
  `onFailure`, hooks fail open, lethal trifecta, OWASP LLM03 supply chain. 01 should extend to
  Stop/SubagentStop/PostToolUse/TaskCompleted semantics and to skill supply-chain security, and reuse
  00/06's protection of test files (deny/PreToolUse) as the countermeasure to "agent edits tests".
- 00/02 agent loop: names skills as an extension point, defers them to 01.
- Module 02 (agentic patterns): "change the code rather than describe rules", meta-skills, harness
  improvement, anti-patterns. Belongs there: Matt's `retro`, `improve-codebase-architecture`,
  `codebase-design` (deep modules), harness engineering (Böckeler 2026-02-17, "Are Harnesses Worth the
  Cost?" 2026-10-13), mutation testing as a project-wide quality practice, custom linters/structural
  tests as architecture enforcement. 01 may use mutation-style grading without teaching it as a pattern.
- Module 03 (subagent orchestration): read-only reviewer, fan-out reviewers. Belongs there: Matt's
  `code-review` two parallel sub-agents, `implement-spec` implementer subagents over a task graph,
  `/code-review` fresh-subagent mechanics, SubagentStop hooks at handoff joints. 01 can mention "review
  against the spec by someone who didn't write the code" as a verification level only.
- Module 04 (final project, Design First, TypeSpec API contract, SDD backend/frontend): 01 is its
  method prerequisite. TypeSpec was not researched here (belongs to 04).
- Module 05 (legacy): grilling and domain modeling on an existing codebase (Matt's repo rejected a
  brownfield CONTEXT.md builder, issue #101); keep brownfield ontology extraction for 05.

## Learner-specific notes (from journal/profile)
- Journal is empty (no LEARN gaps yet). Profile: ~7.5 years fullstack (Python/FastAPI, Node/TS, Vue 3,
  Postgres, Docker, K8s), already codes through an agent harness at work; goal: understand what the
  agent does and be able to check its work; weak spot: freezes on "build the whole finished thing,
  where to start, how to break it down"; limited Linux/networking; prefers Socratic, short and direct.
- The verification topic is his stated goal; make it the spine of the module, not one lesson among five.
- The decomposition weak spot maps directly onto grilling (design tree, frontier), `to-spec` (seams),
  `to-tickets` (vertical tracer-bullet slices sized for one fresh context, blocking edges). This is the
  most valuable transfer for him; also preparation for module 04.
- He already writes ADRs/specs in this very repo as product owner (docs/adr, plans/): use the repo as a
  real example, but the graded artifact must live in the workspace.
- Prefer Python for hook scripts and checks (shell weak spot); keep shell one-liners like `|| exit 2`
  explained.
- His global rules ("A test must be able to fail", one vocabulary per domain, no `any`) align with
  tautological-test detection and glossary consistency: tie the lesson to rules he already holds.

## Open questions
1. Which agent CLI(s) and runtimes the workspace image ships (open since #15). Mutation-style grading of
   learner tests needs a test runner; stdlib `unittest` avoids new dependencies.
2. Should module 01 contain any hidden-task while runner #13 does not exist? If yes, each must have a
   command check that carries its outcome, and the hidden-task must not use `--bare`.
3. Which ADR template to teach as default: this repo's, Nygard, MADR, or Matt's minimal one? (Pedagogy
   call for the curriculum architect.)
4. Which tool to show for SDD hands-on: tool-neutral artifacts (recommended by the evidence: tools
   churn monthly) vs one named tool (Spec Kit / OpenSpec / Kiro). Installing Spec Kit or OpenSpec in the
   workspace adds uv/Python 3.11 or npm dependencies.
5. Whether to teach Codex hook/skill equivalents at all, or only name the differences (JSON on exit 0,
   trust by hash, `.agents/skills`).
6. Could not verify: Kiro file paths and steering files; OpenAI harness engineering post text (403);
   Claude system-card wording on test special-casing; EventStorming notation from Brandolini's primary
   post; a standard PRD structure.
7. Domain for practice artifacts: reuse a scheduling/booking domain to prepare for module 04, or a
   separate domain to avoid pre-empting it?
