# #41 content review, round 1: judge-accuracy

Module: `course/ai-for-developers/01-spec-driven-development` (7 lessons). Reviewed 2026-10-30.
Verdict: FAIL, 2 blocking items. Both are attributed to the lesson-author, because the research had the
facts right. A lesson was appended to `.claude/feedback/lesson-author_mistakes.md`.

## What I checked

I read every theory.md, task.md, quiz.yaml (including explanations) and lesson.yaml in L1-L7, and the
vendored `UPSTREAM.md`. I also read the research, the addendum, and my design round 6 report. Primary
sources were fetched on 2026-10-30:

- **CC hooks reference** (code.claude.com/docs/en/hooks), Stop section, exit-code table, `onFailure`,
  command-hook fields and exec/shell form. Quotes I confirmed:
  - "Does not run if the stoppage occurred due to a user interrupt"
  - `stop_hook_active` / `last_assistant_message`
  - "8-consecutive-continuation cap ... resets each time Claude calls a tool ... `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`"
  - `reason` "Required when `decision` is `"block"`"
  - exit-2 JSON: "still reads the fields, but they can't override the block"
  - other exit code + JSON: "ignores the exit code, and the fields alone decide"
  - the "No such file or directory" exception for Stop
  - `onFailure` "has no effect" on Stop
  - `if`: "On other events, a hook with `if` set never runs"
  - `once`: "ignored in settings files"
  - `shell`: "Ignored when `args` is set"
  - matcher: "silently ignored"
  - `continue` "Takes precedence over any event-specific decision fields"
  - `CLAUDE_PROJECT_DIR` "stays put" / `cwd` "follows Claude"
  - SubagentStop block and TaskCompleted exit 2
- **CC best-practices.** Quotes confirmed:
  - "Claude stops when the work looks done..."
  - the four-option strictness ladder
  - "\"All tests pass\" on its own tells you very little"
  - "A `prompt` or `agent` hook asks *another model* to decide"
  - the "write a failing test that reproduces it, then fix it" line
  - SPEC.md interview and fresh session
  - "will always find *something*"
- **CC /goal:** "It doesn't run commands or read files independently". The evaluator does not call tools.
- **CC skills.** Confirmed:
  - 20 frontmatter rows, counted: name, description, when_to_use, argument-hint, arguments,
    disable-model-invocation, user-invocable, allowed-tools, disallowed-tools, model, effort, context,
    agent, background, hooks, paths, shell, metadata, license, compatibility
  - booleans "`yes`, `no`, `on`, `off`, `1`, and `0` in any letter case"
  - unknown fields are ignored
  - "you can't invoke the skill, but Claude still can"
  - "every tool remains callable"
  - precedence "Enterprise over personal, and personal over project"; a skill wins over a `.claude/commands/` file with the same name
  - the verify/simplify commit instruction (v2.1.286) and that `disable-model-invocation` removes it
  - a project skill replaces the bundled command
  - `/verify` "without falling back to tests or type checks"
  - `/skill-doctor` v2.1.252
  - `${CLAUDE_SKILL_DIR}` and `$ARGUMENTS`
  - frontmatter outside CC: six fields and "hard error"
  - skill hooks last "for the rest of the session"
  - "Seeing a skill trigger tells you Claude found it..."
  - "Claude skipped a rule that must hold every time: move the rule into a hook"
- **CC memory.** Confirmed:
  - "Imported files are expanded and loaded into context alongside the CLAUDE.md"
  - "a maximum depth of four hops"
  - imports skip code spans and code blocks
  - `.claude/rules` with and without `paths`
  - AGENTS.md is read by default only when there is no CLAUDE.md
  - `/doctor prompt-audit` "requires Claude Code v2.1.283 or later"
- **CC features-overview:** "third time" trigger; "Fires on its event without Claude deciding".
- **agentskills.io specification:**
  - name rules
  - description 1-1024, compatibility 1-500
  - allowed-tools "(Experimental)"
  - about 100 tokens / < 5000 tokens
  - "Keep your main `SKILL.md` under 500 lines"
  - "Avoid deeply nested reference chains"
- **Platform Agent Skills overview:**
  - "Use Skills only from trusted sources"
  - tool misuse
  - Claude Code skills have "Full network access"
- **Anthropic prompting best practices:**
  - "It is unacceptable to remove or edit tests..."
  - self-check "catches errors reliably"
  - "Claude Opus 5 is the exception ... can cause over-verification"
  - the hard-coding line
- **Codex:**
  - hooks: Stop "Plain text output is invalid for this event"; a block creates a continuation prompt; trust is tied to the hook's hash
  - build-skills: `.agents/skills`, `allow_implicit_invocation: false`
- **Other tools' skill folders:**
  - Cursor reads `.agents/skills/` and supports `disable-model-invocation`
  - Gemini CLI reads the `.agents/skills/` alias
  - Copilot reads `.agents/skills`
- **Matt Pocock skills:**
  - the GitHub API shows tag v1.3.2 = tag object `85cbec97...`, which points to commit `d1478fcb...`, tagged 2026-10-29. This matches UPSTREAM.md.
  - README at the commit: four failure modes, "owning the process", "small, easy to adapt, and composable", the user-/model-invoked rule, "A plugin updates itself".
  - CHANGELOG: `to-prd` renamed to `to-spec`; `to-issues` "merged into one `to-tickets`"; spec.md "(not `PRD.md`)".
  - v1.3.0 release: CONTEXT.md renamed to GLOSSARY.md (04 Oct).
  - `domain-modeling`: "totally devoid of implementation details".
  - `GLOSSARY-FORMAT.md`: "Be opinionated", `_Avoid_`, Language, Relationships.
  - `productivity/grilling`: all six quotes.
  - `implement`: `disable-model-invocation: true`, tdd at pre-agreed seams, code-review, commit.
  - The vendored `tdd`, `to-spec` and `to-tickets` texts match the quotes used.
- **Böckeler.**
  - SDD tools article (2025-10-15): three levels, "sledgehammer", 4 user stories / 16 criteria, "I'd rather review code...", false sense of control.
  - TDD article: 8.50x/2.96x/4.89x, cache hits, no discernible quality difference, mutation testing as a way to monitor regression tests, tautological tests even test-first, "skipped or faked the red step".
  - Harness memo (2026-02-17): "deterministic custom linters and structural tests", under architectural constraints.
- **Fowler:** "polysemes like 'Customer' and 'Product'" (2014-01-15). Aggregate: definition, "Transactions should not cross aggregate boundaries", order/line items (2013-04-23).
- **EARS (alistairmavin.com):** five patterns plus complex.
- **Kiro feature-specs:** "WHEN [condition/event] THE SYSTEM SHALL [expected behavior]", Requirements-First and Design-First.
- **Nygard:** sections, statuses, "not just the \"positive\" ones", sequential numbers that are never reused, superseded.
- **MADR 4.0.0 template:**
  - optional front matter (status, date, decision-makers, consulted, informed)
  - headings in order
  - Consequences and Confirmation marked as optional elements
  - Confirmation suggests a test (ArchUnit)
- **Spec Kit:**
  - latest release v1.2.5 (2026-10-28)
  - agentic-sdd: analyze "read-only", "It never edits files"; converge "append-only", repeat implement and converge "until it reports converged"
  - README sentence context (see B2)
- **OpenSpec:** latest release v1.15.0 (2026-10-24). cli.md: `--archived` exits non-zero on unchecked tasks, "handy in a pre-commit hook"; `--strict` "Enable strict validation mode".
- **EvilGenie** (arXiv 2511.21654 v2, revised 17 May 2026): three detection methods, "only minimal improvement from the use of held out test cases", "hardcoding test cases", "editing the testing files".
- **Versions today (npm):**
  - Claude Code 2.1.314 and Codex 0.166.0. The lessons name 2.1.312 and 0.165.0 as the versions checked, which is acceptable.
  - checkedAt is 2026-10-29 on every source (1 day old).
- **Graders spot-checked against task.md:**
  - L1 `sdd_stophook.py`: allowed keys, rejection reasons for `if`/`once`/`shell`/`asyncRewake`/`matcher`, `disableAllHooks`, probe timeout 20, the five missing-file phrases in `missing_file_phrases.json`.
  - L2 `verify_skills.py`: MAX_IMPORT_HOPS = 5, see N1.
  - L5 `verify_reminders.py`: stage 0 = imports, skips, names, tasks done plus C1/C2/C3/C6, matching "четыре правила"; MIN_TESTS = 3 in `sdd_seam.py`.
  - `scripts/design_tokens.py` exit codes 0/1/2 match the L7 claim.
- **Python claims:** 3.12 "NO TESTS RAN" with exit 5 versus 3.11 "OK" with exit 0; `-I` ignores PYTHONPATH and does not put the script directory on sys.path; argparse usage errors exit 2.
- **Quiz keys:** all 37 questions read against the sources and theory. No wrong key found. No volatile fact is graded without a version in the prompt.

## Blocking

### B1. [01-verification/theory.md:157] Stop outcomes table, row `0 | пусто или объект без `decision` | ход заканчивается`

- **Source.** Hooks reference, Stop decision control:
  > `hookSpecificOutput.additionalContext` | Non-error feedback for Claude. The conversation continues so Claude can act on it, but unlike `decision: "block"` it is shown in the transcript as hook feedback rather than a hook error

  and
  > It keeps the conversation going through the same loop protections as `decision: "block"`, namely the `stop_hook_active` input and the 8-consecutive-continuation cap

- **Why it is wrong.** An exit-0 object without `decision` that carries `hookSpecificOutput.additionalContext` does not end the turn. The row is broader than the rule. The prose at line 52 ("пусто или `{}`") is correct.
- **Required change.** Narrow the row, for example to `0 | пусто, обычный текст или объект без `decision` и без `hookSpecificOutput.additionalContext` | ход заканчивается | нет`. Then either add a row such as `0 | объект с `hookSpecificOutput.additionalContext` | не блок, но ход продолжается ("The conversation continues so Claude can act on it") | `additionalContext``, or add a bullet under the table saying the same.
- **Sources for the plain-text cell.** The hooks exit-code table says "Plain text, or nothing | Success" for exit 0. Addendum line 111 says that on Stop, plain text with exit 0 lets the stop proceed.
- **Full sweep (orchestrator rule #15, Stop semantics is a repeat topic).** The author must re-check every row and bullet of the L1 Stop table and the "Как хук не даёт закончить ход" list against the hooks reference: `additionalContext`, `continue: false`, plain text, schema-invalid JSON with exit 0/2/other, and exit-2 JSON with `decision`. The author reports the quote for each row.

### B2. [04-spec-adr-tasks/theory.md:23-25] Spec Kit: "команды `constitution`, `specify`, `plan`, `tasks`, `implement` и другие ... Сам проект пишет: "These are independent entry points, not mandatory phases.""

- **Source.** In the Spec Kit README ("Choose your process"), this sentence follows a table of processes: Spec-Driven Development, Bug fixing, Idea assessment, Your own process. The next sentence is "SDD ships in core; bug fixing and assessment are bundled extensions you install when needed". The sentence is about the processes, not the commands.
- **What the agentic-sdd reference says about the commands.** They "are designed to run in order, but only `/speckit.specify` is strictly required before `/speckit.plan`". The research (line 718) had it right: "its processes are ...".
- **Why it is wrong.** Placed after the command list, the quote tells the learner that the SDD commands are independent entry points. The source says the opposite about the commands.
- **Required change.** Attach the quote to the processes, for example: "Spec Kit предлагает несколько процессов (Spec-Driven Development, исправление багов, оценка идеи) и пишет о них: "These are independent entry points, not mandatory phases."". If the commands' order is mentioned, quote agentic-sdd ("designed to run in order, but only `/speckit.specify` is strictly required before `/speckit.plan`").
- **Check before writing.** The author re-fetches both pages and copies the exact sentences. I read the agentic-sdd sentence through a summarising fetch, so verify its exact wording.

## Non-blocking

- **N1. [02-skills/task.md:128-133] "что считается памятью проекта".**
  - Problems:
    - The list says "до 5 переходов", but the memory page says "a maximum depth of four hops".
    - It lists `CLAUDE.md` and `AGENTS.md` together, but by default CC reads AGENTS.md only when there is no CLAUDE.md or CLAUDE.local.md (`claude-md-or-agents-md`, "This is the default").
  - Item 7 introduces the list as files "который Claude Code грузит". The grader deliberately takes a superset (`verify_skills.py:103-106` says so), so grading is safe, but the sentence over-states CC.
  - Suggested change: "проверка берёт с запасом: ... до 5 переходов (документация называет четыре) и AGENTS.md вместе с CLAUDE.md (по умолчанию Claude Code читает AGENTS.md, только если CLAUDE.md нет)".
- **N2. [07-integrity-control/theory.md:39 and lesson.yaml]** "`/doctor prompt-audit` ... (с версии 2.1.283)". The version and the description are on the memory page ("run a prompt audit", "requires Claude Code v2.1.283 or later"). L7 sources cite only the skills page for it. Add the memory page to L7 sources.
- **N3. [04-spec-adr-tasks/theory.md:80-82]** The three ADR conditions are in `domain-modeling` ("Offer ADRs only when all three hold", research line 425). `ADR-FORMAT.md` is the template (title plus 1-3 sentences). Attribute the conditions to `domain-modeling`, or name both.
- **N4. [01-verification/theory.md:22-33]** "Те же рекомендации ... по тому, кто решает". Best practices lists four options: prompt, `/goal`, Stop hook, `/code-review`. Item 5 (CI and branch protection) comes from the deterministic table ("Tests, typecheck, a `Stop` hook, CI") and from GitHub docs, not from the ladder. Optionally mark item 5 as the course's addition.
- **N5. [05-pocock-pipeline/theory.md:107-108, task.md:134-136]** "После одной блокировки `stop_hook_active` пропускает следующую остановку". The field does not skip anything. The learner's hook passes when it is true (docs: the field is "`true` when Claude Code is already continuing as a result of a stop hook"). Suggested wording: "ваш хук при `stop_hook_active: true` пропускает следующую остановку".
- **N6. [07-integrity-control/theory.md:36]** "`implement` и `converge` повторяют, пока `converge` не скажет "Converged"". agentic-sdd describes a manual cycle: you run `/speckit.implement` and "`/speckit.converge` once more ... until it reports converged". Optionally say "вы повторяете", and do not present "Converged" as an exact token unless it is quoted from the page.
- **N7. Versions moved on 2026-10-30:** CC 2.1.314 and Codex 0.166.0 on npm. The lessons correctly pin 2.1.312 and 0.165.0 as checked versions. Re-check the hooks and skills pages before release if the module ships later than about 2026-12.

## Proposed fixes checked as claims

- **B1 fix.** The wording uses the docs' own sentences: `additionalContext` "The conversation continues", and exit-0 plain text "Success". `continue: false` objects still end Claude's processing, so they stay in the "ends" row.
- **B2 fix.** Both sentences are quoted from the pages fetched today. The second one must be re-verified verbatim by the author.

FAIL
