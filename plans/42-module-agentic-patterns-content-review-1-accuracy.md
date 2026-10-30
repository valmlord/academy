# #42 judge_content round 1: accuracy

Verdict: FAIL, 2 blocking issues, 5 non-blocking.

## Blocking

### B1. [L1 theory.md:27-33] The guide examples attributed to Böckeler are not hers

The text says: "Böckeler ... делит её на два вида: **guides** (feedforward) ...: файл памяти, документация, типы,
понятные имена". What the article actually says (martinfowler.com/articles/harness-engineering.html, fetched
2026-10-30):
- Her guide examples are AGENTS.md and Skills ("Coding conventions | feedforward"), a skill with a bootstrap script,
  "A tool with access to OpenRewrite recipes" (code mods), LSPs and CLIs as computational feedforward, and
  architecture.md, how-tos and ref docs.
- Types and naming are not on her guide list. Type checkers appear only as computational sensors. The harnessability
  section says strongly typed languages give type checking *as a sensor*, and the lesson repeats that on line 37
  ("Строгие типы делают проверку типов сенсором").

So a claim the lesson attributes to a source is not in that source, and it pulls against the lesson's own next
paragraph. Fix: list her examples ("файл памяти (AGENTS.md), скиллы, документация и how-to, языковой сервер и
codemod"). If you want types and names as guides, put them into the sentence the module already owns
(line 40, "В терминах этого модуля ...") and do not attribute them to her. Owner: lesson-author A.

### B2. [L4 quiz.yaml:83, 89-90] Option d is keyed false, but no source says so

The option reads "Claude Code сам перейдёт на короткий системный промпт для незнакомой модели" (Ollama behind
`ANTHROPIC_BASE_URL`). It is keyed false in a "выберите все верные" question. The explanation gives the reason:
"Короткий промпт для незнакомых имён моделей в 2.1.312 включили только для Bedrock, Vertex, Foundry и Mantle, не для
шлюза и не для локальной модели". The sources say this:
- changelog 2.1.312 (fetched 2026-10-30): "Changed Bedrock, Vertex, Foundry and Mantle to use the shorter system
  prompt for model names Claude Code doesn't recognize ...". This says which providers *changed*. It does not say
  what an unrecognised name gets behind `ANTHROPIC_BASE_URL`. It may already have been the shorter prompt there.
- env-vars `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT`: "When unset, Haiku 4.5, Sonnet 5, Opus 4.7, and earlier models in those
  families use the full prompt by default, and newer models use the shorter one." A local open-weight model is in
  none of the families that get the full prompt. A learner who reads this row literally can call d true.
- The lesson's own theory.md:180-181 says the docs are silent on this: "Про шлюз и локальную модель это изменение
  ничего не говорит".

The key grades a claim the primary sources neither confirm nor refute, and the env-vars row arguably supports it.
Third-party write-ups (unverified) also claim that unrecognised IDs get the shorter prompt. Fix: replace d with a
decoy the docs clearly refute. Two examples:
- "С `ANTHROPIC_BASE_URL` на локальный сервер WebFetch перестаёт обращаться к `api.anthropic.com`"
  (network-config: the domain safety check still calls `api.anthropic.com` unless `skipWebFetchPreflight: true`);
- "Anthropic поддерживает такую схему, если модель отвечает в формате Messages API" (llm-gateway: "doesn't support
  routing Claude Code to non-Claude models through any gateway").

Also rewrite the explanation sentence so it claims no more than theory.md:180-181 does. Check the reserve file
`checks/data/reserve/closed-environments-quiz.yaml` for the same option. Owner: practice-designer B.

## Non-blocking (fix if cheap)

1. [L1 theory.md:49-50, L5 theory.md:55] The OpenAI quote "When documentation falls short, we promote the rule into
   code" (research addendum, primary read) is translated as "Там, где документации мало" / "когда документации мало".
   "Falls short" means the documentation is not enough, not that there is little of it. "Когда документации не
   хватает" keeps the meaning.
2. [L1 quiz.yaml:113] The `typed-boundary` explanation ends "а строка памяти о статусах больше не нужна". That makes
   the "wrong" option d ("Строку в CLAUDE.md про допустимые статусы теперь можно не обновлять") look half right. Either
   say the line is deleted (ladder step 2/3) or drop the clause.
3. [L4 checks/verify_contour.py:347-350] G7 takes `allowUnsandboxedCommands` as the first value among local, project
   and user settings. sandboxing (fetched 2026-10-30) says: "A `false` in your user settings, `--settings`, or managed
   settings holds even when a project's settings set `true`" (since v2.1.285). theory.md:109-110 teaches exactly this.
   So user `false` plus a project or local `true` is a documented working form, but the checker fails it. That breaks
   the task.md promise "Проходит любая форма, которой документация ... даёт нужный эффект". The starter sets no
   `true`, so only a learner who adds one hits this. Suggested fix: user `false` passes regardless of the
   repository's value.
4. Version strings in source titles not found on the fetched pages: Ruff 0.17.3 (L2), import-linter 2.15 (L2),
   Codex CLI 0.166.0 (L4 theory.md:186). The facts they label were confirmed (TID251 `msg`, no third-party plugins,
   the contract types, `wire_api` only `responses`, `oss_provider`, `web_search` default `"cached"`, `network_access`,
   `analytics.enabled`). Re-check the version strings or drop them.
5. [L5 theory.md:90-91] "глубину задаёт `/effort`" is right. The same best-practices row adds "`ultrathink` still
   works: it asks for deeper reasoning on that single turn". The transcript uses neither, so the graded item is
   unaffected; one clause would make the summary complete.

## What I checked

All fetched 2026-10-30. Quotes were compared verbatim. I had no shell, so the Python snippets were checked by
reading them against CPython behaviour, not by running them (see the end of this file).

**L1.**
- best-practices: "Claude (the model) reads", "Claude Code (the harness) *has* to execute", "if you have hooks for
  things that are only preferences, delete them and let Claude decide", "the single most useful line in your
  CLAUDE.md", "mostly makes Claude over-apply the rule". All verbatim.
- memory: AGENTS.md is read only when there is no CLAUDE.md, `.claude/CLAUDE.md` or CLAUDE.local.md (default
  `claude-md-or-agents-md`). "Import parsing skips Markdown code spans and fenced code blocks." Files over 200 lines
  reduce adherence, and a file is skipped only above 4 MiB (quiz option d is correctly false).
- Böckeler: date 2026-04-02; guides and sensors; computational vs inferential ("slower and more expensive; results
  are more non-deterministic"); harnessability examples. Exception: B1.
- Hashimoto: 2026-02-05, the two forms of fix.
- Building effective agents: "Change the arguments so that it is harder to make mistakes", absolute filepaths,
  2024-12-19.
- Gloaguen v3: 2026-09-29, "well followed".
- OpenAI, via the research addendum: ~100-line AGENTS.md as a map, "too much guidance becomes non-guidance", agents
  replicate patterns.
- Python: a keyword-only signature raises `TypeError: discount() takes 0 positional arguments but 2 were given`;
  `sqlite3.Connection`'s `with` block does not close the connection; `InvoiceStatus("sent")` raises `ValueError`; mypy
  rejects a `str` where an enum is expected.

**L2.**
- Böckeler: "a positive kind of prompt injection" (verbatim, sensors bullet); "Keep quality left" is a section
  heading, and the cost-earlier reading is correct.
- Writing tools for agents: 2025-09-11, "prompt-engineer your error responses to clearly communicate specific and
  actionable improvements" (verbatim).
- OpenAI remediation sentence (addendum).
- Ruff: banned-api `msg`; FAQ "does not yet support third-party plugins".
- ESLint: "The custom message is appended to the default error message".
- import-linter contract types; the lesson hedges the custom-message point correctly.
- The `ast.walk` example prints `3 ImportFrom` (the source string starts with a newline). `module` is None for
  `from . import x`; `level` is the number of dots.
- `python3 -I` puts no script directory on `sys.path`. `ast.parse` raises `SyntaxError`, or `ValueError` on null
  bytes before 3.12.

**L3.**
- Chroma Context Rot: Hong, Troynikov, Huber, 2025-07-14; "Even a single distractor reduces performance"; four
  distractors compound it.
- GitChameleon 2.0 v2: "48-51%".
- Spracklen v3, USENIX Security 2025: 5.2% commercial vs 21.7% open-source.
- METR reward hacking: o3 on Optimize LLM Foundry, 80% baseline and 80% with "Please do not cheat", "nearly
  negligible effect". This also backs the L5 80% figure.
- METR time horizons: "no longer actively updated", 2026-09-08; only 50% and 80% are reported, the 99% horizon is
  explicitly not; task length is human expert time.
- best-practices: the four failure reasons and "almost always one of these".
- Böckeler: the steering-loop quote is verbatim.
- `sys.stdlib_module_names`: 3.10+, top-level packages only.
- Key deviations: I01 is `missing-fact`/`memory` (the PYTHONPATH fact is in no file; the fix is the whole-project
  command, ladder step 1, and a Makefile target is not code). I10 is `repo-misled`/`delete|memory` (a stale memory
  line; delete it, or replace it with `make check`). Both are consistent with the printed definitions.
- Learner messages in verify_failure_log.py match task.md items 1-2.

**L4.**
- env-vars: the boolean rule; the presence-only list incl. NONESSENTIAL_TRAFFIC ("Setting it to `0` or `false` still
  disables this traffic"); DISABLE_WEB_FETCH ("The WebSearch tool stays available", v2.1.285); the five `USE_*`
  providers; the SIMPLE_SYSTEM_PROMPT row.
- settings-reference `env`: overwrites the shell; the Desktop app and self-hosted runners ignore file `env` for
  variables the launch environment sets; project/local `env` waits for trust, except safe variables (model, timeouts,
  feature toggles).
- settings: precedence managed > `--settings` > local > project > user.
- apiKeyHelper: five-minute cache; not run from project or local settings before trust.
- allowedProviders: `customEndpoint` requires a managed `env` pin, v2.1.285.
- permissions: a bare-name deny removes the tool from context; a tool-name glob must match the full name (`"*"`,
  `"mcp__*"`); the `WebFetch(domain:*)` deny row ("keeps the tool and refuses each fetch, and sandboxed commands can't
  reach any host"); deny from any scope beats allow.
- sandboxing: shell only, hooks outside; allowlist = `allowedDomains` + `WebFetch(domain:)` allow rules; the per-mode
  table for an unlisted host; strictAllowlist in user/managed/`--settings` only, no effect from a repository file,
  v2.1.219; allowManagedDomainsOnly; the v2.1.285 lock row; the `dangerouslyDisableSandbox` retry and "Bash command
  (unsandboxed)"; `allowUnsandboxedCommands: false` incl. `excludedCommands` and the user-false-holds rule.
- llm-gateway-connect: the `"$ANTHROPIC_BASE_URL/v1/messages"` curl; "Don't put the credential in a project's
  `.claude/settings.json`. That file is committed and shared"; shell exports don't reliably reach background agents.
- network-config: "Claude Code does not support SOCKS proxies"; NTLM/Kerberos -> gateway; NODE_EXTRA_CA_CERTS;
  settings are the only configuration that reaches every background session; the WebFetch preflight to
  `api.anthropic.com` and `skipWebFetchPreflight`.
- llm-gateway: the "non-Claude models through any gateway" quote is verbatim.
- changelog: latest 2.1.314 (2026-10-30); the 2.1.312 line is verbatim.
- uv env: UV_DEFAULT_INDEX, UV_INDEX, the deprecated synonyms UV_INDEX_URL and UV_EXTRA_INDEX_URL, UV_FIND_LINKS
  ("additional locations"), SSL_CERT_FILE/SSL_CERT_DIR PEM, UV_SYSTEM_CERTS; NODE_EXTRA_CA_CERTS is absent.
- Jain: 2026-10-13, Codex at low effort, Java BFF, 10 paired runs; Sol 10/10 and 10/10 (harnessed ~6.6x cost); Luna
  3/10 -> 10/10; the open-weights models are untested.
- Codex config rows.
- Reference solution and checker against the docs: the G7 reference puts strictAllowlist and allowedDomains in user
  settings and `allowUnsandboxedCommands: false` in the project, which is valid. G1-G6 and N1-N4 match the documented
  effective-value rules. The edge case is non-blocking item 3.

**L5.**
- best-practices: "Claude reads the repo itself. Only write down what isn't in there." "works most of the time, not
  every time". "Effort is the control for that". "more likely to cause over-work than fix a stall". `/clear` after
  two failed corrections. All verbatim apart from the capital E.
- Agent READMEs v2: 2,303 files, architecture 68.1%.
- Böckeler, context engineering, 2026-02-05: "build context like rules files up gradually".
- Jain: the cost ratio behind "в несколько раз дороже".
- `claude -p` is non-interactive.
- bugs.yaml titles and explanations read against these sources: consistent.

**Cross-lesson.**
- The ladder text is identical in L1 theory, L1 task, L3 theory and L3 task (code = Python in `src/` or `scripts/`;
  hook incl. a Stop hook running `make check`).
- L3 and L5 use the L1 vocabulary consistently.
- No vendor-specific behaviour is presented as universal: L4 states its version (2.1.314) and its session scope, and
  the Codex table says the keys do not map one to one.
- All `checkedAt` dates are 2026-10-30.

**Not done.** I had no shell in this run, so no snippet was executed. Prerequisite cross-references to modules 00
and 01 (lesson numbers) were not opened.

FAIL
