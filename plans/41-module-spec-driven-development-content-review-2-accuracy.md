# #41 content review, round 2: judge-accuracy

Module: `course/ai-for-developers/01-spec-driven-development`. Reviewed 2026-10-30.
Verdict: PASS. B1 and B2 are fixed, and N1-N6 are applied correctly. None of the claims added since round 1 is wrong.
Two non-blocking notes on the L1 table follow.

## B1. L1 Stop outcomes, checked row by row

Source: the hooks reference (code.claude.com/docs/en/hooks), fetched today in full, including the Stop section at
offset 200000+. Each row is checked below against the source quote.

| # | Row (theory.md:163-172) | Source | OK |
|---|---|---|---|
| 1 | 0, empty or plain text -> ends | exit-code table: "Plain text, or nothing \| Success" | yes |
| 2 | 0, object without `decision` or `additionalContext` -> ends | `decision`: "Omit to allow Claude to stop" | yes |
| 3 | 0, object with `additionalContext` -> continues | "Non-error feedback for Claude. The conversation continues so Claude can act on it" | yes |
| 4 | 0/2/other, `decision: "block"` -> block, `reason` | exit 0 "The fields apply"; exit 2 "If your hook also printed JSON that makes a blocking decision, Claude Code uses that decision's reason instead"; other "Claude Code ignores the exit code, and the fields alone decide" | yes |
| 5 | 2, object without `decision` -> block, stderr | "still reads the fields, but they can't override the block"; "The message that comes with the block is your hook's stderr" | yes |
| 6 | 2, plain text or unparseable JSON -> block, stderr | "Blocking error. Your stderr is the reason" | yes |
| 7 | 2, empty, stderr not about a missing file -> block | same row | yes |
| 8 | 2, empty, stderr about a missing file -> non-blocking | "when your hook exits 2 with nothing on stdout and its stderr says a file is missing ... non-blocking error" | yes |
| 9 | 0/other, unparseable or schema-invalid JSON -> non-blocking | "Non-blocking error. The notice carries the parse or validation message" (onFailure has no effect on Stop) | yes |
| 10 | 1/other, empty or plain text -> non-blocking | "Non-blocking error. The notice carries the first line of your stderr" | yes |

The note at line 174 says a JSON array and a quoted string count as plain text. Source: "A JSON array and a
quoted JSON string are plain text by this rule".

Bullets below the table, also checked:

- `continue` "Takes precedence over any event-specific decision fields" and "stops processing entirely" match the source.
- The matcher is "silently ignored", which matches.
- The 8-continuation cap, the tool-call reset and `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` match.

The list "Как хук не даёт закончить ход" (lines 45-58) was checked as follows:

- Exactly one object: "only when you print one JSON object ... with nothing around it but whitespace".
- `reason` is required: "Required when `decision` is `"block"`".
- Exit 2 takes the reason from `reason`, other codes "ignores the exit code": both match the sources above.
- Exit 2 without a JSON block gives stderr. Exit 0 with empty output, plain text or `{}` ends the turn.
- `additionalContext` matches the quote.
- Exit 1 without valid JSON is a non-blocking error.

Line 60 on `stop_hook_active` matches "`true` when Claude Code is already continuing as a result of a stop hook".

## B2. L4 Spec Kit (theory.md:23-27)

- **README "Choose your process".** Rows: Spec-Driven Development, Bug fixing, Idea assessment, Your own process.
  "These are independent entry points, not mandatory phases." The lesson now attaches this sentence to the processes.
- **agentic-sdd.** It says verbatim: "The commands are designed to run in order, but only `/speckit.specify` is
  strictly required before `/speckit.plan`." The lesson's fragment is a verbatim substring of it. Fixed.

## N1-N6

- **N1 (L2 task.md:131-138).** "Проверка берёт набор с запасом". The text names "a maximum depth of four hops"
  (verbatim on the memory page) and the AGENTS.md default "только если `CLAUDE.md` и `CLAUDE.local.md` нет". This
  matches the row "`claude-md-or-agents-md` ... when you have no `CLAUDE.md` or `CLAUDE.local.md` ... This is the
  default". Applied.
- **N2.** The memory page was added to L7 sources (checkedAt 2026-10-30). The L7 wording "ищет устаревшие и
  противоречивые инструкции" matches "outdated or conflicting instructions". The version v2.1.283 matches. Applied.
- **N3 (L4:82-84).** The three conditions are now attributed to the skill `domain-modeling`. SKILL.md at v1.3.2 says
  "Only offer to create an ADR when all three are true" (hard to reverse, surprising without context, real
  trade-off). ADR-FORMAT.md is the title plus 1-3 sentences. Applied.
- **N4 (L1:22-24).** Item 5 is now marked as the course's addition. Applied.
- **N5 (L5 theory:107-109, task:127-131).** The wording is "Само поле ничего не пропускает: ваш хук ... пропускает",
  with the docs quote verbatim. Applied.
- **N6 (L7:35-37).** The text now describes a manual cycle. "Each pass finds fewer items; repeat until it reports
  converged" is verbatim. "может лишь дописывать задачи" matches "its only possible write is adding tasks to
  `tasks.md`". "It never edits files" (analyze) is verbatim. Applied.

## New claims since round 1

- **L2 theory: the `verify` trade-off (lines 104-116).** Checked against the skills page:
  - "When a session starts with a skill named `verify` or `simplify` in place ..." is verbatim.
  - `disable-model-invocation` -> "Claude doesn't get the instruction".
  - The bundled `/verify` is "Build and run your app ... without falling back to tests or type checks".
  - A project skill replaces the bundled one ("Your skill replaces the bundled command").

  The trade-off sentences follow from these facts.
- **L2 skill `hooks` (theory:132-134, quiz option c and explanation).** The table row is verbatim: "Hooks that Claude
  Code registers when the skill is invoked and keeps running for the rest of the session".
- **L2 imports.** "Imported files are expanded and loaded into context alongside the CLAUDE.md". "Relative paths
  resolve relative to the file containing the import". "Import parsing skips Markdown code spans and fenced code
  blocks". The task.md statements match.
- **L2 quiz explanations.**
  - Network: platform overview "Skills have the same network access as any other program on the user's computer".
  - allowed-tools: "The grant clears when you send your next message"; "every tool remains callable"; it writes
    nothing to settings.
  - `disable-model-invocation`: the description is not in context.
- **L2 `@` regex from the CC 2.1.267 binary (demo-B Round 4).** Learner text states no binary-derived detail: no
  fragment cut and no escaped spaces. It states only documented behaviour: relative to the importing file, and code
  spans and blocks skipped. The extra behaviour of the binary stays in the grader. Nothing to verify in learner text.
- **L1 quiz `enforce-not-ask`, key [a, c].**
  - a: the harness executes the deny rule or the PreToolUse hook.
  - c: the agent cannot see or edit hidden tests.
  - b and d stay requests or transcript readers.
  - The explanation's CI remark is correct: CI re-runs the already-edited test.
- **L4 Nygard.** "All consequences should be listed here, not just the "positive" ones." Statuses, "Numbers will not
  be reused", superseded: all verbatim.
- **L4 "В ADR называют и отвергнутый вариант".** This is a course norm, not attributed to a source. It is consistent
  with MADR Considered Options and with the third `domain-modeling` condition ("genuine alternatives"). OK.
- **L7.** The converge quotes are above. The cap wording "после восьми продолжений подряд без вызова инструментов"
  matches "eight times in a row ... resets each time Claude calls a tool".

## Non-blocking

- **N1. [01-verification/theory.md:168] Exit 2 with schema-invalid JSON is missing from the table.**
  - Source: "JSON that fails schema validation: the hook still blocks. Claude Code uses your stderr as the blocking
    reason".
  - Row 6 lists only JSON that cannot be parsed. Row 9 covers schema-invalid JSON for exit 0 and other codes only.
  - No row is wrong, but this cell is missing. Suggested change: "обычный текст или JSON, который не разбирается или
    не проходит схему".
  - Also not shown: another exit code with a valid object that has no `decision` ("the fields alone decide", so the
    turn ends). Line 49 covers this in prose.
- **N2. [01-verification/theory.md:58] "`continue: false` в любом объекте останавливает Claude целиком".**
  - Under exit 2 the docs say only that the fields "can't override the block". Whether `continue: false` still stops
    Claude on exit 2 is not documented (addendum: "could not verify").
  - The table header already excludes `continue: false`, and line 177 tells the learner not to combine it with a
    block.
  - Optional: "при exit 0 или другом коде".
- **N3.** The versions moved on (CC 2.1.314, Codex 0.166.0). The lessons pin 2.1.312 and 0.165.0 as the versions
  checked. Re-check before release if the module ships after about 2026-12.

PASS
