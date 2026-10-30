# #42 judge_content round 2: accuracy

Verdict: FAIL, 2 blocking issues (both in L4, both cheap), 3 non-blocking.

Both round-1 blockers are fixed. The two new findings are in text added since round 1.

## Blocking

### B1. [L4 theory.md:185-187; quiz.yaml:89-92 (the `local-open-weight-model` explanation and the key for option d)] The WebFetch preflight claims rest on a page that is not in `sources`

The text says: "Перед загрузкой WebFetch отправляет имя хоста на `api.anthropic.com`, куда бы ни шли запросы к модели: через
шлюз, к облачному провайдеру или на локальный сервер. Её не отключает даже `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`".
The quiz explanation repeats both parts, and option d is keyed false because of them.

What the listed sources say (all fetched 2026-10-30):
- network-config, the source the lesson cites for the preflight: "When using Amazon Bedrock, Google Cloud's Agent
  Platform, Microsoft Foundry, or a signed-in Claude apps gateway session, model traffic ... go[es] to your provider or
  gateway ... The WebFetch tool still calls `api.anthropic.com` for its domain safety check unless you set
  `skipWebFetchPreflight: true`". It names cloud providers and the Claude apps gateway only. It says nothing about a
  custom `ANTHROPIC_BASE_URL` or a local server, and nothing about `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`.
- env-vars, the `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` row: no mention of WebFetch or its check.
- settings-reference, `skipWebFetchPreflight`: "Skip the WebFetch hostname check when Anthropic is unreachable."

The claims are true, but only an unlisted page says so. data-usage (https://code.claude.com/docs/en/data-usage),
"WebFetch domain safety check": "This check runs regardless of which model provider you use and is not affected by
`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`". The "Default behaviors by API provider" section says the same: "This
variable doesn't affect the WebFetch check ...". So "куда бы ни шли запросы к модели" is a fair paraphrase of
"regardless of which model provider you use". The generalisation is supported, but not from the cited page.

This is the round-1 B2 pattern again: a graded key whose deciding fact a reader cannot find in the lesson's sources.
Fix: add `{ title: "Claude Code: Data usage (WebFetch domain safety check: идёт при любом провайдере, NONESSENTIAL_TRAFFIC
на неё не влияет, skipWebFetchPreflight)", url: https://code.claude.com/docs/en/data-usage, checkedAt: "2026-10-30" }`
to L4 lesson.yaml. No text change is needed. Optional: "какой бы провайдер модели ни стоял" follows the source's wording
more closely than "куда бы ни шли запросы". Owner: lesson-author B (theory and sources); practice-designer B repeated it in
the explanation without a source.

### B2. [L4 theory.md:110-112] "Команды из `sandbox.excludedCommands` всегда идут вне песочницы ... даже при `false`" is false for two of the three scopes named in the sentence before it

The sentence before it says: "`false` из пользовательских, managed настроек или `--settings` держится". The sandboxing page
(fetched 2026-10-30), "Repository settings under an admin-required sandbox", says otherwise:
- "The sandbox is admin-required while one of these settings is in effect: `allowUnsandboxedCommands` set to `false` in
  managed settings, or with the `--settings` flag unless managed settings set it to `true` ..."
- "While the sandbox is admin-required, Claude Code takes the settings that loosen it only from managed settings, the
  `--settings` flag, and each developer's `~/.claude/settings.json`. It ignores these settings in a repository's
  `.claude/settings.json` and `.claude/settings.local.json`: `excludedCommands` ... Every entry".
- "If you or your administrator disable the retry in managed settings or with the `--settings` flag, the sandbox becomes
  admin-required. Claude Code then ignores the settings in a repository's files that loosen the sandbox,
  `excludedCommands` entries included." (v2.1.285+.)
- "A `false` in your user settings doesn't make the sandbox admin-required, so a project's other sandbox settings still
  apply."

So "всегда" holds when the `false` comes from user or repository settings (the practice's case). When it comes from managed
settings or `--settings`, the repository's `excludedCommands` entries are ignored, and only entries from managed settings,
`--settings` or `~/.claude/settings.json` still run outside the sandbox. The task rule (keep the list empty in every file)
is still right, and so is the G7 check. Only the theory sentence states a universal rule that the cited page contradicts.

Suggested wording (checked against the quotes above): "Команды из `sandbox.excludedCommands` идут вне песочницы, без
ограничений файлов и без сетевого прокси, и `false` этого не отменяет. Исключение: если `false` задан в managed
настройках или через `--settings`, Claude Code игнорирует `excludedCommands` из файлов репозитория, но записи из
`~/.claude/settings.json` действуют. В контуре, где из песочницы нельзя выходить, список должен оставаться пустым."
Owner: lesson-author B.

## Non-blocking

1. [L4 task.md:69] "Действующее значение настройки: первое из локальных, проектных и пользовательских." The check
   (verify_contour.py:349-354) correctly lets a user `false` for `allowUnsandboxedCommands` hold over a repository `true`,
   and `strictAllowlist` counts only from user settings. Both exceptions are taught in theory.md:98-110, and the "любая
   форма ... даёт нужный эффект" clause covers them. One clause in the rule ("кроме ключей, для которых документация
   задаёт своё правило, например `strictAllowlist` и `false` в `allowUnsandboxedCommands` у пользователя") would remove
   the apparent contradiction. The check is only more lenient than the rule's text, never stricter, so no learner is
   failed wrongly.
2. [L4 theory.md:189] "Codex CLI 0.166.0": the Codex config reference does not state that version (it mentions only
   0.137.0 and 0.138.0 for managed profiles). The research (plans/42-...-research.md:5) took it from npm,
   `@openai/codex` 0.166.0 published 2026-10-29, and the #41 judges confirmed it the same day. It is a pin of the version
   checked, and every key in the table was confirmed at the config page (below). Adding the npm page as a source would
   close it.
3. [L4 theory.md:107-109] "пока песочница работает, команды Claude идут в ней (кроме `excludedCommands`)" is verbatim in
   meaning. The same paragraph of the source also says "To keep Claude Code from running commands unsandboxed when the
   sandbox can't start, also set `failIfUnavailable`". For a closed environment, that is the remaining way out of the
   sandbox, and the module does not mention it. Not graded, optional.

## Round-1 items: status

- **B1 (L1 Böckeler guides): fixed.** theory.md:30-32 now lists "файл памяти (AGENTS.md), скиллы, документация об
  архитектуре и how-to, языковой сервер и CLI, инструмент с рецептами codemod (OpenRewrite)". Re-fetched
  martinfowler.com/articles/harness-engineering.html: AGENTS.md and Skills (inferential feedforward), the OpenRewrite
  codemod tool (computational), LSPs ("computational feedforward guides" in the text), CLIs and how-tos/ref docs (overview
  figure). CLI appears only in the figure, but it is hers. Sensors: tests, linters, type checkers (computational), AI code
  review (inferential), as in theory.md:33-34. Types and names moved to the module's own sentence (line 41-42, "это наше
  расширение её списка"). Correct.
- **B2 (L4 quiz option d): fixed.** The new d, "WebFetch перестанет отправлять имя хоста на `api.anthropic.com`", is
  refuted by data-usage ("regardless of which model provider you use"). See B1 above for the missing source entry. The
  explanation no longer claims anything about the 2.1.312 prompt change. Its other sentences check out: the llm-gateway
  quote is verbatim (round 1), and the five `CLAUDE_CODE_USE_*` providers match env-vars. The reserve quiz has no such
  option; its `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT` distractor (`shell-export-background-agents` c) is plainly wrong, as the
  demo says.
- **N1 (OpenAI "falls short"): fixed** in L1 theory.md:51-52 and L5 theory.md:55 ("когда документации не хватает").
- **N2 (L1 `typed-boundary` clause): fixed.** quiz.yaml:107-113 no longer says the memory line is not needed.
- **N3 (G7 user false holds): fixed.** verify_contour.py:349-354: user `false` passes whatever the repository says;
  otherwise the first of local, project, user decides. The source sentence says "holds even when a project's settings set
  `true`". The page never defines "a project's settings", but it pairs `.claude/settings.json` and
  `.claude/settings.local.json` as "a repository's" files throughout, and calls the local file "your project's local
  settings". So reading it to cover a local `true` is reasonable. The demo B round-3 matrix covers both corners (user
  false over project true and over local true, pass; project false under local true and user true, fail).
- **N4 (version strings): L2 done, L4 kept.** Ruff 0.17.3 and import-linter 2.15 are gone from L2 lesson.yaml. Codex
  0.166.0 stays in L4 (non-blocking 2 above).
- **N5 (`ultrathink`): fixed.** L5 theory.md:92-93: "`ultrathink` по-прежнему работает и просит более глубоких
  рассуждений на один ход, не меняя настройку effort". best-practices row: "`ultrathink` still works: it asks for deeper
  reasoning on that single turn without touching your effort setting." Verbatim in meaning.

## New facts since round 1: what I checked

All fetched 2026-10-30.

**L4 sandboxing (sandboxing page, all 107k characters read in two parts).**
- "You can disable the unsandboxed retry by setting `"allowUnsandboxedCommands": false` ... Claude Code ignores the
  `dangerouslyDisableSandbox` parameter. While the sandbox is running, commands Claude runs are then sandboxed unless they
  match an `excludedCommands` entry." This matches theory.md:106-109.
- "A `false` in your user settings, `--settings`, or managed settings holds even when a project's settings set `true`"
  and "Before v2.1.285, a project's `true` overrode a `false`". Matches theory.md:109-110.
- `excludedCommands`: "run matching commands outside the sandbox, which means no filesystem restrictions and no network
  proxy"; "commands that match an `excludedCommands` entry keep running outside the sandbox". Matches "без ограничений
  файлов и без сетевого прокси". The universal "всегда" does not hold (B2).
- The retry prompts per mode ("Bash command (unsandboxed)" in Manual and acceptEdits, none in bypassPermissions) and
  "hooks run outside" the sandbox: unchanged, correct.
- task.md:77-78 (`excludedCommands` stays empty "в любом файле настроек": the commands listed there bypass the sandbox) is
  correct for the practice's scopes. verify_contour.py:355-361 fails any non-empty or non-list value in local, project and
  user settings, and passes `[]` and an absent key. That is consistent with the task text and with the documented
  user-scope behaviour: a user `excludedCommands` entry applies even under admin-required.
- G7 reference (checks/reference/.claude/settings.json:12) sets `allowUnsandboxedCommands: false` in project settings,
  with no user or local `true`, so the effective value is `false`. Valid.

**L4 WebFetch preflight.** network-config, data-usage, env-vars and settings-reference as quoted in B1. The "куда бы ни
шли запросы к модели" generalisation is correct per data-usage and unsupported by network-config, the page cited.

**L4 other.** cli-reference: `--setting-sources` takes "Comma-separated list of setting sources to load (`user`,
`project`, `local`)". So `claude --setting-sources user` in task.md:37-38 loads only user settings, as stated. Managed
settings are not in that list and load regardless; task.md does not claim otherwise. Codex config reference: `wire_api`
"`responses` is the only supported value"; `oss_provider` `lmstudio | ollama` with `--oss`; `web_search` default
`"cached"`; `sandbox_workspace_write.network_access`; `analytics.enabled`. All match the table.

**L1.** The Böckeler re-fetch above. theory.md:36-39 "computational ... inferential (медленнее, дороже и менее
детерминированы)" and harnessability ("A codebase written in a strongly typed language naturally has type-checking as a
sensor; clearly definable module boundaries afford architectural constraint rules"): correct. quiz.yaml
`computational-sensors` (a, c; d is an inferential sensor) matches her taxonomy.

**L2 task.md item 8 against verify_workspace.py:232-269.** Six `make -s check` variants, each copy with the pristine
starter tests overlaid first, each at most 30 s (`MAKE_TIMEOUT_SEC = 30`):
1. as is: 0;
2. a clean new `src/ledger/m<hex>.py`, whose comment says "import invoices", plus a passing new test: 0;
3. a new file with `import invoices.money`: non-zero;
4. an A1 import appended to `src/ledger/accounts.py`: non-zero;
5. a failing new test: non-zero;
6. a regression appended to `src/invoices/late_fee.py`: non-zero.

task.md:147-154 lists exactly these six, "Стартовые тесты здесь тоже берутся из копий проверки". task.md:167-170 says "на
шести копиях ... не дольше 30 секунд". Consistent. Item 7 (pristine overlay, learner-added tests still run) matches
`run_suite(..., DATA / "pristine_tests")` and `overlay_pristine_tests` (copy over `tests/`, added files kept).

**L3 task.md.** Item 7 has the same pristine-tests sentence. The demo says L3 has no `make` part, and task.md item 4-7 and
"Как проверяется" name none. Consistent. The key changes (I04 check/code/hook) and the `failure-log` binary message match
task.md:140-143 and :168-170.

**L5.** theory.md:55 (OpenAI) and :90-93 (`/effort`, `ultrathink`) against best-practices lines quoted above.

**Demo records.** demo-A "judge_content round 1 fixes" lists the L2 B1 make variants, the B2 pristine overlay, B3 (I04),
N1 and the quiz clause. demo-B "Round 3" lists the quiz option d and its explanation, G7 precedence and G7
`excludedCommands`. The theory edits (L1 guides list, L4 sandbox paragraph and preflight block, L5 wording) are
lesson-author changes and are not in the practice-designer records, as expected. I did not run the harnesses; I read the
check code for the items above.

**Threat model.** Nothing in this round's accuracy findings touches the design 2.8 scope.

**Not done.** No shell in this run, so no snippet or check was executed. The reserve quizzes were read only for the
B2-related option.

FAIL
