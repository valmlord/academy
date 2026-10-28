# #15 content-researcher findings (2026-10-27, verbatim summary of the researcher report)

## 0. Reference program (docs/course-reference.md, Hexlet "ИИ для разработчиков", July 2026)
Short synchronizing block, outcome "единая база у всех". Topics in order:
1. Choosing a model and reasoning level. Local models.
2. Overview of assistants and pricing. Price/quality economics.
3. Context engineering. Planning and execution.
4. How agents work: loop, harness, tools, MCP, how they relate.
5. Memory, AGENTS.md and using it well.
6. Security and permission control.
Existing course/ai-for-developers/00-introduction/module.yaml: status planned, no outcomes, no lessons. No lesson dirs.

## 1. Models, effort, local models
- Anthropic lineup (platform.claude.com/docs/en/about-claude/models/overview): Fable 5.1 `claude-fable-5-1` $10/$50 per MTok default effort high; Opus 5.5 `claude-opus-5-5` $4/$20 medium; Sonnet 5.5 `claude-sonnet-5-5` $2/$10 high; Haiku 5.5 `claude-haiku-5-5` from $0.10/$0.50 medium. All 1M context, 128K output, cutoff Jun 2026, adaptive thinking; thinking always on for Fable/Opus 5.5. Batch 50% off; cache reads 10% of input (5% Opus/Sonnet 5.5, 2.5% Fable). Teach ratios, date any price.
- effort levels low|medium|high|xhigh|max via output_config.effort; affects all output tokens incl. tool calls; "behavioral signal, not a strict token budget". budget_tokens deprecated (4.6) / not accepted later. low for simple tasks/subagents, xhigh for >30 min agentic runs; Sonnet 5.5 agentic coding start medium. (platform.claude.com/docs/en/build-with-claude/effort)
- Claude Code: aliases default/best/fable/opus/sonnet/haiku/sonnet[1m]/opus[1m]/opusplan; default = Opus 5.5; effort via /effort, --effort, CLAUDE_CODE_EFFORT_LEVEL, CC default medium on 5.5 models (API default for Sonnet 5.5 is high: name the surface). `ultrathink` = one-turn deeper reasoning; "think hard" is plain text. (code.claude.com/docs/en/model-config, /best-practices)
- Codex (learn.chatgpt.com/docs/models): gpt-6-astra, gpt-6.1-sol, gpt-6.1-terra (CLI >= 0.159.0), gpt-6-luna; reasoning Light/Low, Medium, High, Extra High, Max, Ultra (parallel subagents). GPT-5.x retired from ChatGPT-sign-in Codex (5.5 on 2026-10-14). Custom providers need Responses API. @openai/codex 0.164.0. Effort names differ per vendor.
- Local: Ollama serves Claude Code (ANTHROPIC_BASE_URL=http://localhost:11434, ANTHROPIC_AUTH_TOKEN=ollama, ANTHROPIC_API_KEY="", or `ollama launch claude`), advice tool-capable model, 64k+ context. OpenCode via @ai-sdk/openai-compatible (Ollama :11434/v1, LM Studio :1234/v1, llama.cpp :8080/v1); warns tool calls fail with small num_ctx (start 16-32k). Typical local failures: small context, weak tool calling. No verified benchmark parity claim. Codex --oss unverified.

## 2. Pricing / economics
- Claude plans (claude.com/pricing): Free $0 no CC; Pro $20/mo ($17 annual) CC yes, >=5x Free per 5h + weekly limits; Max from $100 (5x/20x Pro); Team Standard $25/$20, Premium $125/$100 per seat; Enterprise $20/seat annual + API-rate usage. Limits shared across chat/desktop/CC, rolling 5h.
- CC costs (code.claude.com/docs/en/costs): ~$13/dev/active day, $150-250/mo, 90% under $30/day. Drivers: resent context (cached), cache misses after idle, subagents, agent teams (~7x in plan mode), compaction. Levers: /clear, model choice, lower effort, CLI over MCP, CLAUDE.md -> skills. /usage, /context.
- Cursor (cursor.com/pricing, undated): Free, Plus $8 (Grok only), Premium $30, Super $100, Ultra $200, Teams $30+/user. Single source; re-check.
- npm: @anthropic-ai/claude-code 2.1.311 (2026-10-26), @openai/codex 0.164.0, opencode-ai 1.19.4.
- Checkable exercise idea: estimate task cost from token counts and list prices / compare model+effort combos.

## 3. Context engineering, planning/execution
- Anthropic "Effective context engineering for AI agents" (2025-09-29): curate system prompt, tools, data, history; context rot; attention budget, smallest high-signal set; just-in-time retrieval by reference, compaction, notes outside context, subagents returning ~1-2k summaries; minimal non-overlapping tools.
- CC: auto-compaction can lose early instructions -> persistent rules in CLAUDE.md; /compact <focus>, "Compact Instructions" section; /context; MCP tool defs deferred (tool search); skills on demand; plan mode (Shift+Tab). Best practices: verification target, interview -> SPEC.md, /clear after two failed corrections, Esc early.
- "Stop doing" (CC best practices): context window anxiety (1M + auto compaction), "subagents protect context"/"delegate for a better answer" (fresh reviewer helps, delegation itself not), IMPORTANT/ALL CAPS, "loop until done", describing architecture/file layout in CLAUDE.md. Anthropic-specific guidance.

## 4. Agent anatomy
- CC loop: gather context, take action, verify results, repeat, user can interrupt. Model reasons, tools act. "Claude Code is the layer around the model that provides the tools and manages the context... what the term agentic harness refers to." Tool categories: files, search, execution, web, code intelligence, subagents, asking the user. Extensions: skills, MCP, hooks, subagents. Sessions JSONL in ~/.claude/projects/. Checkpoints cover file edits only, not remote side effects. (code.claude.com/docs/en/how-claude-code-works)
- "Building effective agents" (2024-12-19): workflows = predefined paths; agents = LLM directing its own tool use in a loop with env feedback; augmented LLM; patterns chaining/routing/parallelization/orchestrator-workers/evaluator-optimizer; ACI, poka-yoke tools. Cite as 2024.
- MCP spec 2026-07-28 (modelcontextprotocol.io/specification/latest + changelog): stateless, no initialize handshake, no Mcp-Session-Id, version/capabilities in each request _meta; server/discover; subscriptions/listen; Multi Round-Trip Requests (resultType input_required) replace server-initiated requests; Roots, Sampling, Logging deprecated; HTTP+SSE deprecated; Tasks moved to extension; extensions formal (Tasks, Skills over MCP, MCP Apps); DCR deprecated for Client ID Metadata Documents. Core: server Tools/Resources/Prompts, client Elicitation, JSON-RPC 2.0, roles host/client/server, transports stdio vs Streamable HTTP. HIGH stale risk. CC docs: CLI tools like gh more context-efficient than MCP.

## 5. Memory, AGENTS.md
- agents.md: open Markdown "README for agents", Agentic AI Foundation (Linux Foundation), 60k+ projects; Codex, Jules, Cursor, Gemini CLI, Copilot agent, Aider, goose, opencode, Zed, Warp, VS Code, Devin, Junie, Amp, Windsurf. Nearest file wins; chat prompt overrides.
- Codex (learn.chatgpt.com/docs/agent-configuration/agents-md.md): global ~/.codex (CODEX_HOME) AGENTS.override.md then AGENTS.md, first non-empty; project: git root down to cwd, one file per dir (override, AGENTS.md, fallbacks), concatenated root-to-leaf (deeper later wins); project_doc_max_bytes 32 KiB.
- CC (code.claude.com/docs/en/memory): reads AGENTS.md only if no CLAUDE.md/CLAUDE.local.md in cwd or above, else only CLAUDE.md unless it imports @AGENTS.md. Scopes: managed, ~/.claude/CLAUDE.md, ./CLAUDE.md or ./.claude/CLAUDE.md, CLAUDE.local.md. Ancestors at launch, subdirs on demand. @imports up to 4 hops, no context saving. .claude/rules/*.md with paths: frontmatter. Auto memory MEMORY.md first 200 lines/25KB. Target <200 lines. Memory is "context, not enforced configuration": to block an action use a hook/permission rule. Include only non-inferable things.
- Precedence differs per tool; never present one as universal.
- Research: Gloaguen et al. arXiv:2602.11988 (ICLR 2026): unnecessary requirements make tasks harder, LLM-generated files reduced success, recommend minimal human-written (from snippets, no exact figures). Lulla et al. arXiv:2601.20404 efficiency gains. Khatri arXiv:2607.27250 no correctness effect (unverified, alphaxiv only). Lesson point: short and specific beats long; no percentages.

## 6. Security, permissions
- CC permissions (code.claude.com/docs/en/permissions): deny -> ask -> allow, first match wins; specificity irrelevant, allow cannot carve exception from deny; deny in any scope beats allow; managed not overridable. Modes default ("Manual"), acceptEdits, plan, auto (classifier; default start for interactive terminal/VS Code from v2.1.283), dontAsk, bypassPermissions (containers/VMs only). "Permission rules are enforced by Claude Code, not by the model". CLAUDE.md doesn't change permissions. Bash deny gaps: other path to same program, sh -c; Read/Edit deny doesn't cover scripts opening files. OS-level -> sandbox.
- Sandbox (code.claude.com/docs/en/sandboxing): Seatbelt macOS, bubblewrap + netns Linux/WSL2, not native Windows; writes cwd+temp, reads most disk incl ~/.ssh unless restricted; network via proxy, empty allowedDomains default; off by default (/sandbox, sandbox.enabled); doesn't cover Read/Edit/WebFetch/MCP or hooks; dangerouslyDisableSandbox retry unless allowUnsandboxedCommands false; no Docker inside.
- Deterministic vs not: prompt/CLAUDE.md/skills model-decided; hooks, deny rules, managed settings, tests, CI harness-enforced. "If you keep adding emphasis to a CLAUDE.md line... that line belongs in a hook." Central idea linking 5 and 6.
- Lethal trifecta (Simon Willison 2025-06-16): private data + untrusted content + external communication; only fix is never combining all three; 95% guardrails a failing grade.
- OWASP LLM Top 10 2025: LLM01 Prompt Injection, 02 Sensitive Info Disclosure, 03 Supply Chain, 04 Data/Model Poisoning, 05 Improper Output Handling, 06 Excessive Agency, 07 System Prompt Leakage, 08 Vector/Embedding Weaknesses, 09 Misinformation, 10 Unbounded Consumption. Agentic Top 10 date unverified.
- MCP security best practices: annotations/descriptions untrusted unless server trusted; consent before tool invocation; local server = arbitrary code with client privileges (show full command, sandbox, prefer stdio); no token passthrough; SSRF in OAuth discovery; state-handle hijacking; scope minimization.

## Contract facts
- Lesson types theory|quiz|artifact|agent-eval|bug-hunt|project. ready lessons >=1 source; ready non-theory >=1 check. id unique course-wide kebab; dirs NN-kebab; estimatedMinutes <=600; prerequisites not cross-checked.
- Files: planned lesson.yaml; draft + theory.md; ready + task.md. ready module requires all lessons ready; every dir listed and vice versa. outcomes default [] (issue requires them).
- Checks: quiz {file, passScore 0..1} (file may be outside checks/); command {run, timeoutSec<=1800} needs workspace, exit 0 = pass; rubric {rubric under checks/, artifacts[] >=1 globs, passScore} graded by mentor agent; hidden-task {task, verify under checks/, timeoutSec<=3600, budgetUsd<=20} headless agent in copy of learner workspace with learner settings, deterministic verify, needs workspace; bug-hunt {answers under checks/, minFound>=1}. Common id/title/weight.
- workspace {image default academy-workspace:dev, starter default "starter"}; starter must exist, not inside checks/, no checks dir in it; no symlinks; starter visible to learner; reference in checks/reference/ (convention); ADR-0002 checks/ mounted read-only only into grader.
- Leak guard: theory.md and task.md must not contain substring "checks/" at all.
- pnpm content:validate checks schema/files/order/ids/sources/leaks; NOT quiz.yaml/bugs.yaml contents, NOT that run commands work, NOT fail-on-starter/pass-on-reference (must be shown manually). Needs pnpm install (done in worktree). Node 22.

## Risks
1. No runtime (apps/services/images unbuilt; workspace image #07, runner #08, quiz UI #10, rubric mentor #11, hidden-task runner #13). Command checks run locally by practice-designer; hidden-task/rubric dry-run by hand/student.
2. quiz.yaml / bugs.yaml formats undefined in schema (prose: question, options, correct, explanation; 4-8 questions). May need migration later.
3. quiz.yaml at lesson root not leak-guarded; answers in non-hidden file; OK only if platform never ships it to workspace/browser.
4. academy-workspace:dev doesn't exist; don't depend on unpinned tools in command checks.
5. hidden-task costs money, <=$20/check.

## Stale watchlist
MCP 2026-07-28 changes; budget_tokens -> adaptive + effort; Opus 5.5 default medium; CC auto mode default since 2.1.283, 1M context, ultrathink only, no architecture in CLAUDE.md, no ALL CAPS; Codex GPT-6.x, docs on learn.chatgpt.com; AGENTS.md under Linux Foundation; Cursor pricing new; never present CC specifics as universal, name tool+version (CC 2.1.311 as of 2026-10-26).

## Learner
profile: ~7.5y fullstack (Python/FastAPI, Node/TS, Vue 3, Postgres, Docker, K8s), already codes via agent harness at work; goal: understand what the agent does and check it; weak: "build the whole thing" decomposition, limited Linux/networking/systems; prefers Socratic, short direct text. journal empty. Skip "what is an LLM"; value in mechanisms: harness-enforced vs model-decided, context costs, permission order; sandbox touches weak spot (explain briefly, don't gate on deep Linux); plan vs execute maps to "where to start".

## Open questions
1. Which agent CLI(s) the workspace image ships. 2. Fix quiz/bugs format in contract first? (dev task + ADR). 3. How to demonstrate fail-on-starter/pass-on-reference for rubric/hidden-task without runner. 4. Exact prices vs dated ratios.
