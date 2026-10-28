# #15 demonstration record (design 2.4), practice-designer

Run 2026-10-28 in the #15 worktree on macOS 27.0.1. Every line below is real output, copied from the
scratch drivers (`demolib.py`, `demo_l1.py`..`demo_l6.py`, `quiz_demo.py`, the bug-hunt matcher in
`demo_l4.py`; not committed, design 2.4 "Scratch matcher/scorer not committed").

## Environment
- `python3` resolved to a scratch `bin/python3` -> `/opt/homebrew/bin/python3.12`; `python3 --version`:
  **Python 3.12.13**. `/usr/bin/python3` (3.9.6) was never used. Scripts use only 3.10-compatible stdlib.
- Shells: `/bin/sh` and `/bin/bash` on this machine are both GNU bash 3.2.57 (`sh` runs it in POSIX
  mode). dash was not available, so the `sh -c` grounding is bash-as-sh only (open item 5 below).
- Protocol per check: grader mount `G` = copy of `checks/` with `reference/` AND `data/reserve/` removed
  (plan A1; every lesson prints `reserve absent` / `reference absent` = True). Each run: fresh temp copy
  of `starter/` (plus `checks/reference/` overlay for the reference run), environment built from scratch
  (`PATH=<python3.12 dir>:/usr/bin:/bin`, `HOME=<copy>/home`, `ACADEMY_CHECKS_DIR=$G`, nothing else), the
  lesson.yaml `run` string executed verbatim through `/bin/sh -c` in the copy. Line format:
  `label: exit N (pass/fail; expected ...) [OK|UNEXPECTED] -- first 300 chars of output`.
- (4a) usercustomize and (4b) PATH shim run on the EMPTY starter; (4c) and (4d) on the REFERENCE (2.4).
  The "(4a) WITHOUT -I ... exit 0" lines prove the attack is real: the output still shows the failure
  text, and the planted `atexit` forces exit 0 anyway. The same run with `-I` fails.

## Summary: every command check

| Lesson | Check | Empty starter | Reference | Wrong solutions and cheats |
|---|---|---|---|---|
| L1 | model-routing | exit 1 | exit 0 | all fail (one single-wrong-card variant passes by design: bar 5 of 6) |
| L2 | harness-behaviour | exit 1 | exit 0 | all fail, incl. 4a-4d |
| L3 | cost-estimate | exit 1 | exit 0 | all fail; a stale `lever` field is ignored |
| L4 | plan-structure | exit 1 | exit 0 | all fail; weak/borderline/injection rubric artifacts pass the form check by design |
| L5 | agents-md-structure | exit 1 | exit 0 | all fail; weak/borderline/inverted/injection rubric artifacts pass the form check by design |
| L6 | permissions-policy | exit 1 | exit 0 | all fail |
| L6 | hook-blocks-generated | exit 1 | exit 0 as committed (mode 755 after Stepan's chmod) | all fail; documented passing variants pass |

**Correction (2026-10-28).** The first version of this record said no cheat passed. That was wrong:
the student cheater run (`plans/15-module-introduction-student.md`) found 8 cheats that passed my
checks (C1-C8), plus near-passes on two rubrics (R1, R2) and defects D1-D8. All of them are fixed.
Each cheat is now in its lesson's wrong-solution list below, marked with its student-run id, and
fails. C9 (learner code rewriting the grader through a writable checks mount) is a runner
requirement (2.5.2 read-only mount, 2.5.3 uid/pid isolation), not a lesson defect; it stays open for
#08.

| Id | Lesson / check | Cheat | Fix | Now |
|---|---|---|---|---|
| C1 | L2 harness-behaviour | abort the run with Result('final') on an unknown or denied call | a scripted run must reach its final turn; stopping after an error result fails item 4 or 6 | fail, 3 of 3 runs |
| C2 | L2 harness-behaviour | ignore permission(), no unknown handling, return when len(local_tools) == 2 | scenarios share random ingredients (1-3 local, 2-5 remote tools; unknown, denied, error calls at random positions); final turn required | fail, 3 of 3 runs |
| C3 | L6 hook-blocks-generated | Python-only regex matchers (`(?i)^(edit|write)$` and others) | matcher allowlist: a plain list of names separated by `|` or `,`, containing Edit and Write, optionally MultiEdit and NotebookEdit; no regex, `*` or empty | fail |
| C4 | L6 both checks | second PreToolUse group (Bash) answering allow | workspace settings may hold exactly one hook: one PreToolUse group with one hook object | fail in both checks |
| C5 | L6 both checks | PermissionRequest auto-approve hook in settings.local.json | same rule: any other event fails | fail in both checks |
| C6 | L6 permissions-policy | `--permission-mode "bypassPermissions"`, `$$MODE`, `--dangerously-skip-$(SUFFIX)` | Makefile allowlist: a claude invocation must be exactly one recipe line `claude`, `claude --permission-mode default` or `claude --permission-mode plan` (optional `@`); override fragments fail anywhere | fail |
| C7 | L5 agents-md-structure | old file kept as CLAUDE.local.md with `@AGENTS.md` on top | every launch-loaded CLAUDE-type file (CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md) is at most 10 lines; .claude/AGENTS.md counts with AGENTS.md; overlap, caps and tree rules apply to all files together | fail |
| C8 | L3 cost-estimate | coordinate search on the enum count | the enum part reports one joint pass/fail, no count; `lever` dropped from the check (Stepan) | coordinate search impossible; see F2 |
| R1 | L5 rubric | inverted keyword-stuffed AGENTS.md at 0.625-0.75 | gate: any inverted rule scores 0 | rubric text; graded by the mentor |
| R2 | L4 plan-structure + rubric | whole files in a `~~~` fence | structure check counts ``` and ~~~ fences (CommonMark, unclosed fence runs to EOF); rubric gate: >15 lines of pasted code in any form scores 0 | structure check fails |

Defects: D1 (L4 paste range now starts at 219; all ranges re-verified, enumeration rerun: still
exactly 1/108), D2 (L1 key widened with alternatives), D4 (L2 messages name what differs), D5 (L2
grades server isError, JSON-RPC error, server shutdown and the description field), D7 (L4 reference
plan uses `?format=csv`), D8 (= C1/C2 root cause). D3 (exec bit) was pending Stepan's chmod at that point; closed in run 2. D6: the
L5 starter CLAUDE.md has 162 lines; task.md should say so.

**Student run 2 (2026-10-28)** found new passing cheats. All are fixed and now fail:

| Id | Lesson / check | Cheat | Fix | Now |
|---|---|---|---|---|
| C10 | L2 harness-behaviour | no unknown-tool handling; the server's isError covered item 4 | a `tools/call` for a name that `tools/list` did not return fails item 4 | fail, 3 of 3 runs |
| C11 | L6 permissions-policy | Makefile name split into variables (`$(A)$(B) --dangerously-$(S)-permissions`) | closed rule: outside `agent`, the Makefile must equal the starter Makefile (comments and blank lines dropped, whitespace collapsed, `agent` removed from `.PHONY`); `agent` is absent or has no prerequisites and exactly one recipe line `claude`, `claude --permission-mode default` or `claude --permission-mode plan` (optional `@`) | fail; also fails a bypass appended to another target |
| C12 | L6 permissions-policy | `agent:` runs `sh scripts/agent.sh`, which starts claude with the bypass | the recipe allowlist above, plus: any new or changed script or executable (suffix .sh/.bash/.zsh/.py/.pl/.rb/.js/.mjs/.cjs/.ts/.mk/.command, an exec bit, or a `#!` first line) outside `.claude/settings.json`, `.claude/settings.local.json`, `.claude/hooks/protect_generated.py`, `Makefile` fails, compared with the starter's sha256 manifest | fail (also a new tests/conftest.py, an edited scripts/db_reset.py) |
| C13 | L5 agents-md-structure | old file moved to `.claude/rules/legacy.md` | memory set includes every `.claude/rules/**/*.md` (with or without `paths:`) | fail |
| C14 | L5 agents-md-structure | old file imported via `@legacy-notes.md` / `@docs/legacy.md` | imports resolved up to 5 hops (C15), relative to the importing file, ignoring code spans and fences; imported files join the memory set | fail (also a 3-hop chain) |
| G1 | L6 permissions-policy | allow `Bash(sh *)`, `Bash(python3 *)`, `Bash(env *)` | probes `sh -c 'git push origin main'`, `bash -c 'curl ...'`, `python3 -c "...make db-reset..."`, `env make db-reset` expect not-allow; interpreters added to the broad-allow static list | fail |
| G2 | L5 agents-md-structure | old file moved to `src/CLAUDE.md` | every nested `CLAUDE.md`, `AGENTS.md`, `CLAUDE.local.md` is in the memory set | fail |
| G3 | L4 plan-structure | whole files 4-space indented; ```` fence with ``` lines inside | CommonMark fence closer (same character, at least the opener's length, no info string); indented code blocks counted | fail |
| D9 | L2 messages | "цикл ... завершился" after a grader abort | suppressed when the grader itself aborted | fixed |
| D10 | L6 matcher | `Edit, Write` / `Edit | Write` doubted | content-researcher verified the docs: plain lists with `|` or `,` and optional whitespace; **not a defect**. `Edit Write` (space, no separator) is rejected | not a defect |
| D3 | L6 exec bit | | closed: Stepan's chmod, both hook files mode 755; E1 passes as committed | closed |

**Student run 3, C15 (L5):** the docs say imports have "a maximum depth of four hops" but do not
say whether the root counts, so a file 5 imports below AGENTS.md may load. The check and the rubric
note now follow 5 hops (`MAX_IMPORT_HOPS = 5`). An old file 5 imports below AGENTS.md fails; at 6
imports it is not followed and passes, because Claude Code would not load it under either reading.
The honest reference passes.

**judge_content round 1 (assessment FAIL, two blocking items, fixed):**

| Id | Lesson / check | Defect | Fix | Now |
|---|---|---|---|---|
| J1 | L5 agents-md-structure | hookup matched a raw `@AGENTS.md` line: `.claude/CLAUDE.md` = `@AGENTS.md` and a fenced `@AGENTS.md` passed, `.claude/CLAUDE.md` = `@../AGENTS.md` failed | the hookup uses the same import resolver as the memory set: one present CLAUDE-type root file must resolve to the root `AGENTS.md` (relative to the importing file, no code spans or fences) | the first two cases and a code-span variant fail; `@../AGENTS.md` and `@./AGENTS.md` pass |
| J2 | L6 permissions-policy | allow was checked against a list of dangerous rules: `Bash(uv run *)`, `Bash(npx *)`, `Bash(npm run *)`, `Bash(find *)`, `Bash(docker *)`, `Edit(//**)` passed | allow is a closed set: `Edit(...)` inside `src/` (`src/...`, `./src/...` or `/src/...`; never `//`, `~/`, `..`), `Bash(make test)`, `Bash(make lint)`, `Bash(git status)`, `Bash(git diff)`; any other allow fails, naming the rule | the six judge cases and 9 more (`Edit(~/...)`, `Edit(src/../**)`, `Edit(**)`, `Edit(tests/**)`, `Bash(git diff *)`, `Bash(make test *)`, `Read(src/**)`, a WebFetch allow, bare `Write`) fail; three honest allow sets pass |
| J3 | L4 plan-structure (non-blocking) | a fence inside a blockquote was not counted | blockquote markers are stripped before fence and indented-block detection | fail; a short quote passes |
| J4 | quizzes (non-blocking) | L3 explanation stated "MCP servers add definitions to every turn" (generic-harness claim; Claude Code defers MCP definitions); give-away distractors in L1-L3 | explanation rewritten without the claim; distractors replaced with plausible wrong answers (L3 plan-or-api, shared-limits, levers; L2 transport (prompt now asks what the spec provides), local-server risks, checkpoint; L1 old snippet) | keys, positions and shapes unchanged; rates unchanged (they depend only on shape) |

**judge_content round 2 (assessment, one blocking item, fixed):**

| Id | Lesson / check | Defect | Fix | Now |
|---|---|---|---|---|
| J5 | L6 permissions-policy | `permissions.defaultMode` was checked only for `bypassPermissions`; `acceptEdits` and `dontAsk` passed | closed set: absent, `"default"` or `"plan"`; any other value fails and the message names it (`bypassPermissions` keeps its own message); applies to `.claude/settings.json` and `.claude/settings.local.json` | `"acceptEdits"`, `"dontAsk"`, `"auto"`, `"manual"`, `"Plan"`, `1`, `null`, `["plan"]` fail; `"plan"`, `"default"` and absent pass; empty starter fails, reference passes |
| J6 | L6 permissions-policy (note) | allow rules with outer whitespace | already stripped before matching against the closed allow set (the safe direction): `" Bash(make test) "` is treated as `Bash(make test)` | pass, recorded |

**judge_content round 3 (accuracy, one blocking item, fixed). J7 supersedes the J5 row on `"manual"`:**

| Id | Lesson / check | Defect | Fix | Now |
|---|---|---|---|---|
| J7 | L6 permissions-policy | `"manual"`, the documented alias of `default`, was rejected; one generic reason for every rejected mode (false for `manual` and `auto`); the `permissions` object was open (`additionalDirectories`) | accepted modes: absent, `"default"`, `"manual"`, `"plan"`; one message per rejected value, matching the task.md reason lines; Makefile recipe `claude --permission-mode manual` accepted; `permissions` keys closed to allow, ask, deny, defaultMode, disableBypassPermissionsMode | pass: `"manual"` in settings.json, `"manual"` in settings.local.json, the Makefile with `--permission-mode manual`, `disableBypassPermissionsMode`; fail with the messages below: acceptEdits, dontAsk, bypassPermissions, auto, `"Plan"`, `"readonly"`, `1`, `null`, `["plan"]`, dontAsk in settings.local.json, additionalDirectories `["/"]` and `["~"]` (in either file), unknown key `foo`; empty starter fails, reference passes (see the L6 block) |

Messages (each names the file and the value):
- `acceptEdits`: `<file>: defaultMode "acceptEdits": правки вне src/ и команды rm, mv, cp в рабочей папке пройдут без запроса`
- `dontAsk`: `<file>: defaultMode "dontAsk": всё, что должно спрашивать, превращается в отказ, и пункт 6 политики (каждая загрузка спрашивает) ломается`
- `bypassPermissions`: `<file>: defaultMode "bypassPermissions": из проектных и локальных настроек Claude Code его игнорирует с v2.1.257, строка только вводит в заблуждение; уберите её`
- `auto`: `<file>: defaultMode "auto": из проектных и локальных настроек не действует (сессия начинает во встроенном стартовом режиме), строка вводит в заблуждение`
- any other value: `<file>: defaultMode <value as JSON>: значение вне упражнения: допустимы только "default", "manual" и "plan" или отсутствие ключа`
- `additionalDirectories` (reworded in J8): `<file>: permissions.additionalDirectories: ключ вне упражнения; непустой список с путями вне проекта открывает агенту файлы без запроса, это ломает пункт 7 политики`
- any other key: `<file>: permissions.<key>: ключ вне упражнения: в permissions допускаются только allow, ask, deny, defaultMode и disableBypassPermissionsMode`

**judge_content round 4 (assessment, fixed):**

| Id | Lesson / check | Defect | Fix | Now |
|---|---|---|---|---|
| J8 | L6 permissions-policy | the additionalDirectories message was false for `[]` and `["src"]`; `disableBypassPermissionsMode` accepted any value | message reworded to hold for every value (the key still fails for every value); `disableBypassPermissionsMode` accepts only the documented string `"disable"` | fail: additionalDirectories `[]` and `["src"]`; disableBypassPermissionsMode `true`, `false`, `"enable"`, `null`, `1`, `["disable"]` (and `true` in settings.local.json); pass: `"disable"`; empty starter fails, reference passes |

New messages:
- `<file>: permissions.additionalDirectories: ключ вне упражнения; непустой список с путями вне проекта открывает агенту файлы без запроса, это ломает пункт 7 политики`
- `<file>: permissions.disableBypassPermissionsMode <value as JSON>: единственное документированное значение "disable"; другое значение уберите или замените`

**Known gap, flagged for the PR (Stepan's decision, not changed):** top-level `sandbox` is not checked.
`sandbox.enabled` with `autoAllowBashIfSandboxed` would run `make db-reset` without a prompt.

L3 quiz `levers-for-scenario` option d now reads "Просить повторять прежние объяснения: пойдут по цене кэша".
The key (a, c) and the explanation are unchanged and still correct; the rules and rates are unchanged.

Reserve headers now read "Mentor-review store, never on the command-check mount" (all 8 files). L1
starter README: the tier for a local run is "класс модели, которую реально запустить на этом железе".
L2: the check never uses a name that is both local and remote (generated names carry `l_` / `r_` /
`x_` prefixes plus random tokens). The reference harness gives the local tool precedence.

L5 memory-set rule after this run (imports followed up to 5 hops): AGENTS.md at most 60 non-empty lines; every other file in the memory
set at most 10 lines; caps, tree and overlap (at most 5 lines) over the whole set; root hookup as before.

Zero `[UNEXPECTED]` lines in the final runs. Two appeared during the reruns and were both mistakes
in my test variants, not in the checks, fixed and rerun: L5 "codegen without the path", and L4
"only 2 steps" (its split marker was stale after the reference plan changed).

## L1 01-models-and-effort

```text
## L1 model-routing
G = /var/folders/hk/s_gx2n951mz9y880jjgfwntm0000gn/T/G-zsrtgrhj; reserve absent in G: True; reference absent: True
- (1) empty starter: exit 1 (fail; expected fail) [OK] -- routing.json: offline-audit.tier: ожидается одно из frontier|large|mid|small | routing.json: offline-audit.effort: ожидается одно из low|medium|high|xhigh|max | routing.json: offline-audit.deployment: ожидается одно из cloud|local | routing.json: offline-audit.binding_constraint: ожидается одно из q ...
- (2) reference: exit 0 (pass; expected pass) [OK] -- Пройдено: не меньше 5 из 6 карточек верны.
- (3) always frontier+high+cloud (constraint quality): exit 1 (fail; expected fail) [OK] -- 5 из 6 карточек неверны.
- (3) 'local is free': local on both budget cards: exit 1 (fail; expected fail) [OK] -- 2 из 6 карточек неверны.
- (3) max effort on bulk-rename + wrong constraint on log-dump: exit 1 (fail; expected fail) [OK] -- 2 из 6 карточек неверны.
- (3, by design) single wrong card (max effort on bulk-rename only) passes: bar is 5 of 6: exit 0 (pass; expected pass) [OK] -- Пройдено: не меньше 5 из 6 карточек верны.
- (D2) offline-audit with a large local model passes: exit 0 (pass; expected pass) [OK] -- Пройдено: не меньше 5 из 6 карточек верны.
- (D2) core-refactor large + medium passes: exit 0 (pass; expected pass) [OK] -- Пройдено: не меньше 5 из 6 карточек верны.
- (D2) both widened answers on one submission pass: exit 0 (pass; expected pass) [OK] -- Пройдено: не меньше 5 из 6 карточек верны.
- (D2) frontier + medium on core-refactor plus one more wrong card fails: exit 1 (fail; expected fail) [OK] -- 2 из 6 карточек неверны.
- (3) format: reason missing on one card: exit 1 (fail; expected fail) [OK] -- routing.json: ide-hint.reason: ожидается непустая строка до 200 символов
- (3) format: NaN constant in routing.json: exit 1 (fail; expected fail) [OK] -- routing.json: недопустимое значение NaN: нужен строгий JSON
- (3) learner plants own data/routing_key.json in workspace (grader reads pristine key): exit 1 (fail; expected fail) [OK] -- 5 из 6 карточек неверны.
- (4a) usercustomize, run WITHOUT -I (attack is real): exit 0 (pass; expected pass) [OK] -- routing.json: offline-audit.tier: ожидается одно из frontier|large|mid|small | routing.json: offline-audit.effort: ожидается одно из low|medium|high|xhigh|max | routing.json: offline-audit.deployment: ожидается одно из cloud|local | routing.json: offline-audit.binding_constraint: ожидается одно из q ...
- (4a) usercustomize, run with -I: exit 1 (fail; expected fail) [OK] -- routing.json: offline-audit.tier: ожидается одно из frontier|large|mid|small | routing.json: offline-audit.effort: ожидается одно из low|medium|high|xhigh|max | routing.json: offline-audit.deployment: ожидается одно из cloud|local | routing.json: offline-audit.binding_constraint: ожидается одно из q ...
- (4b) PATH shim first on PATH (attack is real; runner fixed PATH defends): exit 0 (pass; expected pass) [OK] -- 
- (4b) PATH shim present, fixed PATH from (1): exit 1 (fail; expected fail) [OK] -- routing.json: offline-audit.tier: ожидается одно из frontier|large|mid|small | routing.json: offline-audit.effort: ожидается одно из low|medium|high|xhigh|max | routing.json: offline-audit.deployment: ожидается одно из cloud|local | routing.json: offline-audit.binding_constraint: ожидается одно из q ...

### (5) key constraints and attack simulation
- accepted combinations per card (of 200): {'offline-audit': 9, 'ide-hint': 2, 'ticket-triage': 2, 'log-dump': 9, 'core-refactor': 7, 'bulk-rename': 2}; max 9 (<= 12 asserted)
- binding constraints: {'offline-audit': 'privacy', 'ide-hint': 'latency', 'ticket-triage': 'price', 'log-dump': 'context', 'core-refactor': 'quality', 'bulk-rename': 'price'}; each of 5 used, max per constraint 2
- best constant answer over 200 combinations: 2 of 6 cards correct (<= 2 asserted)
- uniform random per submission: P(>=5 of 6) = 2.608e-08 (0.00000%), within 10: 0.00003%
- blind random, 10 submissions, 20000 learners: 0 passed = 0.000%
- adaptive parallel-test-and-bisect, cap 10, 20000 learners: 0 passed = 0.000% (< 1% required)
- adaptive without cap, 500 learners: median 75.0 submissions, p10 44, p90 122
```

## L2 02-agent-loop

```text
## L2 harness-behaviour
- grader mount: reference absent True, data/reserve absent True
- (1) empty starter: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] run_agent завершился исключением: NotImplementedError: write the agent loop here | - [прогон 2] run_agent завершился исключением: NotImplementedError: write the agent loop here | - [прогон 3] run_agent завершился исключением: NotImplementedError: write the agent  ...
- (2) reference: exit 0 (pass; expected pass) [OK] -- Пройдено: все шесть пунктов выполнены.
- reference with the starter demo.py: exit 0, last line: Result(status='final', text='README.md has 349 words', turns=5)
- (3) results not fed back (tool_result never appended): exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.1 (результаты в контекст): на ходе 2 ожидалось 3 элементов messages (запрос пользователя, затем пары ход/tool_result), получено 2 | - [прогон 2] п.1 (результаты в контекст): на ходе 2 ожидалось 3 элементов messages (запрос пользователя, затем пары ход/tool_resu ...
- (3) no max_turns guard: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 4] п.3 (max_turns): после max_turns=4 цикл продолжил вызывать модель | [grader-log] harness-behaviour seed=200871513057316 (rerun: python3 -I test_harness.py --seed 200871513057316)
- (3) tool executed before the permission check: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.6 (разрешения до исполнения): permission вернул False, а локальный инструмент всё равно исполнен | - [прогон 1] п.6 (разрешения до исполнения): локальный инструмент исполнен без вопроса permission(name, arguments) перед ним | - [прогон 1] п.6 (разрешения до исп ...
- (3) remote tools hardcoded instead of tools/list: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.5 (внешние инструменты через tools/list и tools/call): модель не получила в tools все инструменты, которые сервер вернул на tools/list | - [прогон 1] п.5 (внешние инструменты через tools/list и tools/call): обычного вызова инструмента: инструмент не был исполне ...
- (3) extra: permission asked but its answer ignored: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.6 (разрешения до исполнения): permission вернул False, а вызов всё равно дошёл до внешнего процесса | - [прогон 1] п.6 (разрешения до исполнения): messages[10]: после вызова, запрещённого permission ожидался tool_result с is_error: true | - [прогон 1] п.6 (разр ...
- (3) extra: unknown tool crashes the loop (KeyError): exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] run_agent завершился исключением: KeyError: 'x_0e5jddseme' | - [прогон 3] run_agent завершился исключением: KeyError: 'x_ep4h258g2y' | - [прогон 4] run_agent завершился исключением: KeyError: 'x_390uejdgdl' | [grader-log] harness-behaviour seed=38667513500419 (re ...
- (4a) usercustomize, run WITHOUT -I (attack is real): exit 0 (pass; expected pass) [OK] -- Проверка не пройдена: | - [прогон 1] run_agent завершился исключением: NotImplementedError: write the agent loop here | - [прогон 2] run_agent завершился исключением: NotImplementedError: write the agent loop here | - [прогон 3] run_agent завершился исключением: NotImplementedError: write the agent  ...
- (4a) usercustomize, run with -I: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] run_agent завершился исключением: NotImplementedError: write the agent loop here | - [прогон 2] run_agent завершился исключением: NotImplementedError: write the agent loop here | - [прогон 3] run_agent завершился исключением: NotImplementedError: write the agent  ...
- (4b) PATH shim first on PATH (attack is real; runner fixed PATH defends): exit 0 (pass; expected pass) [OK] -- 
- (4b) PATH shim present, fixed PATH from (1): exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] run_agent завершился исключением: NotImplementedError: write the agent loop here | - [прогон 2] run_agent завершился исключением: NotImplementedError: write the agent loop here | - [прогон 3] run_agent завершился исключением: NotImplementedError: write the agent  ...
- student cheats C1/C2 and contract cases D4/D5, each run 3 times (fresh seed each run):
- (C1) abort the run with Result('final') on an unknown or denied call [run 1]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.6 (разрешения до исполнения): после вызова, запрещённого permission цикл должен вернуть модели результат-ошибку и продолжить, а он завершился | - [прогон 3] п.4 (неизвестный инструмент): после вызова неизвестного инструмента цикл должен вернуть модели результат ...
- (C1) abort the run with Result('final') on an unknown or denied call [run 2]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.4 (неизвестный инструмент): после вызова неизвестного инструмента цикл должен вернуть модели результат-ошибку и продолжить, а он завершился | - [прогон 2] п.6 (разрешения до исполнения): после вызова, запрещённого permission цикл должен вернуть модели результат ...
- (C1) abort the run with Result('final') on an unknown or denied call [run 3]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.6 (разрешения до исполнения): после вызова, запрещённого permission цикл должен вернуть модели результат-ошибку и продолжить, а он завершился | - [прогон 3] п.6 (разрешения до исполнения): после вызова, запрещённого permission цикл должен вернуть модели результ ...
- (C2) ignore permission(), no unknown-tool handling, return at once when len(local_tools) == 2 [run 1]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.6 (разрешения до исполнения): permission вернул False, а вызов всё равно дошёл до внешнего процесса | - [прогон 1] п.6 (разрешения до исполнения): messages[4]: после вызова, запрещённого permission ожидался tool_result с is_error: true | - [прогон 1] п.6 (разре ...
- (C2) ignore permission(), no unknown-tool handling, return at once when len(local_tools) == 2 [run 2]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.6 (разрешения до исполнения): permission вернул False, а вызов всё равно дошёл до внешнего процесса | - [прогон 1] п.6 (разрешения до исполнения): messages[6]: после вызова, запрещённого permission ожидался tool_result с is_error: true | - [прогон 1] п.6 (разре ...
- (C2) ignore permission(), no unknown-tool handling, return at once when len(local_tools) == 2 [run 3]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.4 (неизвестный инструмент): tools/call пришёл для имени 'x_0jyp1r0m43', которого нет в tools/list: неизвестный инструмент харнесс должен распознать сам и не отправлять серверу | - [прогон 1] п.6 (разрешения до исполнения): permission вернул False, а вызов всё р ...
- (D5) server isError dropped (treated as success) [run 1]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 3] п.5 (внешние инструменты через tools/list и tools/call): messages[12]: после ответа сервера с isError: true ожидался tool_result с is_error: true | [grader-log] harness-behaviour seed=196751470988162 (rerun: python3 -I test_harness.py --seed 196751470988162)
- (D5) server isError dropped (treated as success) [run 2]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 4] п.5 (внешние инструменты через tools/list и tools/call): messages[14]: после ответа сервера с isError: true ожидался tool_result с is_error: true | [grader-log] harness-behaviour seed=79797771648630 (rerun: python3 -I test_harness.py --seed 79797771648630)
- (D5) server isError dropped (treated as success) [run 3]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 2] п.5 (внешние инструменты через tools/list и tools/call): messages[6]: после ответа сервера с isError: true ожидался tool_result с is_error: true | [grader-log] harness-behaviour seed=239491625269405 (rerun: python3 -I test_harness.py --seed 239491625269405)
- (D5) JSON-RPC error field ignored (empty success result) [run 1]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 4] п.5 (внешние инструменты через tools/list и tools/call): messages[12]: после ответа сервера с полем error (JSON-RPC) ожидался tool_result с is_error: true | [grader-log] harness-behaviour seed=171152715422339 (rerun: python3 -I test_harness.py --seed 171152715422 ...
- (D5) JSON-RPC error field ignored (empty success result) [run 2]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 4] п.5 (внешние инструменты через tools/list и tools/call): messages[4]: после ответа сервера с полем error (JSON-RPC) ожидался tool_result с is_error: true | [grader-log] harness-behaviour seed=267485618440040 (rerun: python3 -I test_harness.py --seed 2674856184400 ...
- (D5) JSON-RPC error field ignored (empty success result) [run 3]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 3] п.5 (внешние инструменты через tools/list и tools/call): messages[12]: после ответа сервера с полем error (JSON-RPC) ожидался tool_result с is_error: true | [grader-log] harness-behaviour seed=21596802583015 (rerun: python3 -I test_harness.py --seed 2159680258301 ...
- (D5) tool server never terminated [run 1]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.5 (внешние инструменты через tools/list и tools/call): после возврата Result процесс tool_server_cmd ещё работает: харнесс должен его завершить | - [прогон 2] п.5 (внешние инструменты через tools/list и tools/call): после возврата Result процесс tool_server_cmd ...
- (D5) tool server never terminated [run 2]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.5 (внешние инструменты через tools/list и tools/call): после возврата Result процесс tool_server_cmd ещё работает: харнесс должен его завершить | - [прогон 2] п.5 (внешние инструменты через tools/list и tools/call): после возврата Result процесс tool_server_cmd ...
- (D5) tool server never terminated [run 3]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.5 (внешние инструменты через tools/list и tools/call): после возврата Result процесс tool_server_cmd ещё работает: харнесс должен его завершить | - [прогон 2] п.5 (внешние инструменты через tools/list и tools/call): после возврата Result процесс tool_server_cmd ...
- (D5) tools passed to the model without description [run 1]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.5 (внешние инструменты через tools/list и tools/call): у каждого инструмента в tools должно быть строковое поле description | - [прогон 2] п.5 (внешние инструменты через tools/list и tools/call): у каждого инструмента в tools должно быть строковое поле descript ...
- (D5) tools passed to the model without description [run 2]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.5 (внешние инструменты через tools/list и tools/call): у каждого инструмента в tools должно быть строковое поле description | - [прогон 2] п.5 (внешние инструменты через tools/list и tools/call): у каждого инструмента в tools должно быть строковое поле descript ...
- (D5) tools passed to the model without description [run 3]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.5 (внешние инструменты через tools/list и tools/call): у каждого инструмента в tools должно быть строковое поле description | - [прогон 2] п.5 (внешние инструменты через tools/list и tools/call): у каждого инструмента в tools должно быть строковое поле descript ...
- (C10) no unknown-tool handling: unknown names forwarded to the server [run 1]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.4 (неизвестный инструмент): tools/call пришёл для имени 'x_6vb4a6ftt2', которого нет в tools/list: неизвестный инструмент харнесс должен распознать сам и не отправлять серверу | - [прогон 2] п.4 (неизвестный инструмент): tools/call пришёл для имени 'x_gzkylzuz8 ...
- (C10) no unknown-tool handling: unknown names forwarded to the server [run 2]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.4 (неизвестный инструмент): tools/call пришёл для имени 'x_n9fwty2j09', которого нет в tools/list: неизвестный инструмент харнесс должен распознать сам и не отправлять серверу | - [прогон 2] п.4 (неизвестный инструмент): tools/call пришёл для имени 'x_ujze8r9s3 ...
- (C10) no unknown-tool handling: unknown names forwarded to the server [run 3]: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.4 (неизвестный инструмент): tools/call пришёл для имени 'x_ur6lht5437', которого нет в tools/list: неизвестный инструмент харнесс должен распознать сам и не отправлять серверу | - [прогон 2] п.4 (неизвестный инструмент): tools/call пришёл для имени 'x_f3obcgouz ...
- (D9) isError dropped: exit 1; misleading 'цикл ... завершился' line present: False; item-5 line present: True
- (D4) final text altered: the message must name text, not status/turns: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 2] п.2 (остановка на final): Result неверен: text не совпадает с текстом хода final | - [прогон 3] п.2 (остановка на final): Result неверен: text не совпадает с текстом хода final | - [прогон 4] п.2 (остановка на final): Result неверен: text не совпадает с текстом х ...
- (4c) REFERENCE + top-level `import os; os._exit(0)` in harness.py: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] run_agent не вернул Result (процесс завершился, не вернув результат) | - [прогон 2] run_agent не вернул Result (процесс завершился, не вернув результат) | - [прогон 3] run_agent не вернул Result (процесс завершился, не вернув результат) | - [прогон 4] run_agent н ...
- (4d) REFERENCE that imports the relay module and tool_server.py directly instead of spawning: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] п.5 (внешние инструменты через tools/list и tools/call): модель не получила в tools все инструменты, которые сервер вернул на tools/list | - [прогон 1] п.5 (внешние инструменты через tools/list и tools/call): обычного вызова инструмента: инструмент не был исполне ...
- (4d) harness tries to open $ACADEMY_CHECKS_DIR/reference/harness.py: exit 1 (fail; expected fail) [OK] -- Проверка не пройдена: | - [прогон 1] run_agent завершился исключением: RuntimeError: env has ACADEMY_CHECKS_DIR: False; /var/folders/hk/s_gx2n951mz9y880jjgfwntm0000gn/T/G-t732occ7/reference/harness.py exists: False | - [прогон 2] run_agent завершился исключением: RuntimeError: env has ACADEMY_CHECKS ...
- (4d) /var/folders/hk/s_gx2n951mz9y880jjgfwntm0000gn/T/G-t732occ7/reference exists: False; /var/folders/hk/s_gx2n951mz9y880jjgfwntm0000gn/T/G-t732occ7/data/reserve exists: False
- (2.5.5) seed reproduction: first run exit 1 seed 195363395994544; rerun with --seed exit 1; same failure text: True
- reference, 10 consecutive runs with fresh seeds: exit codes [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; 2.8 s total (timeoutSec 120 per run)
```

## L3 03-cost-economics

```text
## L3 cost-estimate
- expected: costs {'a': 0.72821, 'b': 0.65317, 'c': 0.92017}, a on mid 0.161355, miss turn 21, largest {'a': 'output', 'b': 'uncached-input', 'c': 'cache-read'}, cheaper a
- data constraints:
  - a: $0.7282; shares output 58.9%, uncached-input 30.3%, cache-read 10.8%; largest/runner-up 1.94x
  - b: $0.6532; shares output 23.9%, uncached-input 50.7%, cache-read 25.4%; largest/runner-up 2.00x
  - c: $0.9202; shares output 27.0%, uncached-input 30.4%, cache-read 42.6%; largest/runner-up 1.40x
  - every expected dollar value >= $0.10, so max(1%, $0.001) is always the 1% term (floor never binds): session_cost_usd.a $0.7282, session_cost_usd.b $0.6532, session_cost_usd.c $0.9202, a_repriced_on_mid_tier_usd $0.1614
- (1) empty starter: exit 1 (fail; expected fail) [OK] -- answers.json: session_cost_usd.a: ожидается число | answers.json: largest_component.a: ожидается одно из output|uncached-input|cache-read | answers.json: session_cost_usd.b: ожидается число | answers.json: largest_component.b: ожидается одно из output|uncached-input|cache-read | answers.json: sessio ...
- (2) reference: exit 0 (pass; expected pass) [OK] -- Пройдено: все поля верны.
- error 'cache reads priced at full input': relative miss a 420.8%, b 482.3%, c 810.2%; a repriced on mid 370.1% (tolerance 1%)
- (3) cache reads priced at full input: exit 1 (fail; expected fail) [OK] -- Вне допуска или неверны: session_cost_usd.a, session_cost_usd.b, session_cost_usd.c, a_repriced_on_mid_tier_usd
- error 'output priced at the input rate': relative miss a 47.1%, b 19.1%, c 21.6%; a repriced on mid 42.5% (tolerance 1%)
- (3) output priced at the input rate: exit 1 (fail; expected fail) [OK] -- Вне допуска или неверны: session_cost_usd.a, session_cost_usd.b, session_cost_usd.c, a_repriced_on_mid_tier_usd
- error 'cache reads treated as free': relative miss a 10.8%, b 25.4%, c 42.6%; a repriced on mid 19.5% (tolerance 1%)
- (3) cache reads treated as free: exit 1 (fail; expected fail) [OK] -- Вне допуска или неверны: session_cost_usd.a, session_cost_usd.b, session_cost_usd.c, a_repriced_on_mid_tier_usd
- (3) cheaper_per_task = c: exit 1 (fail; expected fail) [OK] -- Поля-перечисления (largest_component, cheaper_per_task): не все верны.
- (3) largest_component.b = cache-read: exit 1 (fail; expected fail) [OK] -- Поля-перечисления (largest_component, cheaper_per_task): не все верны.
- (3) extra field lever kept from the old template is ignored, reference still passes: exit 0 (pass; expected pass) [OK] -- Пройдено: все поля верны.
- (3) guess enums, compute nothing (all costs 0.5): exit 1 (fail; expected fail) [OK] -- Вне допуска или неверны: session_cost_usd.a, session_cost_usd.b, session_cost_usd.c, a_repriced_on_mid_tier_usd
- (3) zero the workspace prices and empty a.jsonl, answer zeros: exit 1 (fail; expected fail) [OK] -- Вне допуска или неверны: session_cost_usd.a, session_cost_usd.b, session_cost_usd.c, a_repriced_on_mid_tier_usd
- (3) Infinity in answers.json (strict JSON): exit 1 (fail; expected fail) [OK] -- answers.json: недопустимое значение Infinity: нужен строгий JSON
- (4a) usercustomize, run WITHOUT -I (attack is real): exit 0 (pass; expected pass) [OK] -- answers.json: session_cost_usd.a: ожидается число | answers.json: largest_component.a: ожидается одно из output|uncached-input|cache-read | answers.json: session_cost_usd.b: ожидается число | answers.json: largest_component.b: ожидается одно из output|uncached-input|cache-read | answers.json: sessio ...
- (4a) usercustomize, run with -I: exit 1 (fail; expected fail) [OK] -- answers.json: session_cost_usd.a: ожидается число | answers.json: largest_component.a: ожидается одно из output|uncached-input|cache-read | answers.json: session_cost_usd.b: ожидается число | answers.json: largest_component.b: ожидается одно из output|uncached-input|cache-read | answers.json: sessio ...
- (4b) PATH shim first on PATH (attack is real; runner fixed PATH defends): exit 0 (pass; expected pass) [OK] -- 
- (4b) PATH shim present, fixed PATH from (1): exit 1 (fail; expected fail) [OK] -- answers.json: session_cost_usd.a: ожидается число | answers.json: largest_component.a: ожидается одно из output|uncached-input|cache-read | answers.json: session_cost_usd.b: ожидается число | answers.json: largest_component.b: ожидается одно из output|uncached-input|cache-read | answers.json: sessio ...

### (5) enum fields under the cap (numbers assumed right; enum feedback is one joint pass/fail; lever no longer graded)
- remaining enum fields: largest_component.a/.b/.c and cheaper_per_task: 54 combinations, 1 accepted
- blind guess of the enum part: 1.85% per submission, 18.52% within 10 submissions without repeats (exact)
- both fields follow from the component costs the learner must compute for session_cost_usd, so they add little independent protection: what the check really proves is the arithmetic (numbers within 1%, not guessable), which every listed pricing error misses above
```

## L4 04-context-and-planning

```text
## L4 context-bug-hunt (scratch matcher per design 2.2)
- transcript: 380 physical lines; embedded number == physical line on every line: True
- 27 ranges (6 bugs, 19 decoys) pairwise non-overlapping: True; auto-compaction line 170 in no range: True; line 57 in no range: True
  - bloat-tool-read: accepted ranges k=1, decoys d=3, hit probability k/(k+d) = 1/4
  - bloat-subagent-return: accepted ranges k=1, decoys d=3, hit probability k/(k+d) = 1/4
  - bloat-user-paste: accepted ranges k=1, decoys d=3, hit probability k/(k+d) = 1/4
  - lost-instruction: accepted ranges k=2, decoys d=4, hit probability k/(k+d) = 1/3
  - polluted-session: accepted ranges k=1, decoys d=2, hit probability k/(k+d) = 1/3
  - no-verification: accepted ranges k=2, decoys d=4, hit probability k/(k+d) = 1/3
- [] / empty starter findings.json: pass=False / pass=False
- reference findings.json: pass=True (matched 6, decoy hits 0)
- reference with the alternative anchor of lost-migration-rule (line 180): pass=True
- reference with the alternative anchor of refactor-without-check (line 250): pass=True
- honest run that reports the auto-compaction line instead of the lost-instruction anchors: pass=True (unmatched, not a decoy hit: 0 decoy hits)
- shotgun: one report every 10 lines (38 reports): pass=False; truncated to 7: pass=False
- right lines, wrong categories (rotated): pass=False
- hedge: every episode of bloat-tool-read and polluted-session (7 reports): pass=False, decoy hits 5
- hedge: both sides of three look-alike pairs (+1, 7 reports): pass=False, decoy hits 3
- format error message: findings[0].line: expected integer
- enumeration, one block per category: 64 of 6912 report sets pass = 1/108 = 0.926%
- best allocation of up to 7 reports over categories (uniform distinct blocks): {'bloat-tool-read': 1, 'bloat-subagent-return': 1, 'bloat-user-paste': 1, 'lost-instruction': 1, 'polluted-session': 1, 'no-verification': 1} -> 1/108 = 0.926% (must be <= 1/108)
  - skip polluted-session, double bloat-tool-read: 1/288 = 0.347%
  - 7 reports, doubled bloat-tool-read: 1/864 = 0.116%
  - 7 reports, doubled polluted-session: 1/864 = 0.116%
  - 7 reports, doubled lost-instruction: 11/4320 = 0.255%
- cumulative over the 3-submission cap: 1 - (107/108)^3 = 2.752%
- format-error submission: format error (not scored): findings[0].line: expected integer; attempts used 0
- 4th scored submission (the reference key) after 3 failed: refused (closed after reveal: submission refused, not scored)
- reserve excerpt: 61 lines, numbers == physical lines; 3 bugs, decoy categories ['bloat-tool-read', 'lost-instruction', 'no-verification'] cover planted ['bloat-tool-read', 'lost-instruction', 'no-verification']; key passes: True; [] passes: False

## L4 plan-structure
- (1) empty starter (template plan.md): exit 1 (fail; expected fail) [OK] -- plan.md, Шаги: нумерованных шагов 0, нужно от 3 до 8 | plan.md, Контекст: найдено путей из исходного invoice-service/: 0, нужно не меньше 2 (пути относительно invoice-service/ или с префиксом invoice-service/) | plan.md, Вопросы до старта: нужен хотя бы один вопрос (строка со знаком '?')
- (2) reference plan.md: exit 0 (pass; expected pass) [OK] -- Пройдено: структура plan.md верна. Качество плана оценивает ментор по рубрике.
- (3) invented paths in Контекст: exit 1 (fail; expected fail) [OK] -- plan.md, Контекст: найдено путей из исходного invoice-service/: 0, нужно не меньше 2 (пути относительно invoice-service/ или с префиксом invoice-service/)
- (3) paths pointing at files the learner created in the workspace: exit 1 (fail; expected fail) [OK] -- plan.md, Контекст: найдено путей из исходного invoice-service/: 0, нужно не меньше 2 (пути относительно invoice-service/ или с префиксом invoice-service/)
- (3) a step without `Проверка:`: exit 1 (fail; expected fail) [OK] -- plan.md, Шаги: у шага 1 нет строки `Проверка:` с командой в обратных кавычках
- (3) `Проверка:` without a backticked command: exit 1 (fail; expected fail) [OK] -- plan.md, Шаги: у шага 4 нет строки `Проверка:` с командой в обратных кавычках
- (3) only 2 steps: exit 1 (fail; expected fail) [OK] -- plan.md, Шаги: нумерованных шагов 2, нужно от 3 до 8
- (3) pasted 20-line code block: exit 1 (fail; expected fail) [OK] -- plan.md: блок кода из 20 строк, допускается не больше 15
- (R2) honest plan + two whole source files in a ~~~ fence: exit 1 (fail; expected fail) [OK] -- plan.md: блок кода из 66 строк, допускается не больше 15
- (R2) 20-line ~~~~ fence (four tildes): exit 1 (fail; expected fail) [OK] -- plan.md: блок кода из 20 строк, допускается не больше 15
- (R2) unclosed ``` fence running to the end of the file: exit 1 (fail; expected fail) [OK] -- plan.md: блок кода из 20 строк, допускается не больше 15
- (G3) whole api.py + repository.py indented by 4 spaces: exit 1 (fail; expected fail) [OK] -- plan.md: блок кода из 52 строк, допускается не больше 15
- (G3) ```` fence with a ``` line every 15 lines inside (one 70-line block in CommonMark): exit 1 (fail; expected fail) [OK] -- plan.md: блок кода из 70 строк, допускается не больше 15
- (G3) ``` fence 'closed' by ```python (a closer has no info string): exit 1 (fail; expected fail) [OK] -- plan.md: блок кода из 21 строк, допускается не больше 15
- (J3) whole api.py in a ``` fence inside a blockquote: exit 1 (fail; expected fail) [OK] -- plan.md: блок кода из 26 строк, допускается не больше 15
- (J3) 20 lines of 4-space indented code inside a blockquote: exit 1 (fail; expected fail) [OK] -- plan.md: блок кода из 20 строк, допускается не больше 15
- (3) a short 3-line quote is fine: exit 0 (pass; expected pass) [OK] -- Пройдено: структура plan.md верна. Качество плана оценивает ментор по рубрике.
- (3) a 10-line 4-space indented block is fine: exit 0 (pass; expected pass) [OK] -- Пройдено: структура plan.md верна. Качество плана оценивает ментор по рубрике.
- (3) a 10-line ~~~ fence is fine: exit 0 (pass; expected pass) [OK] -- Пройдено: структура plan.md верна. Качество плана оценивает ментор по рубрике.
- (3) no question in Вопросы до старта: exit 1 (fail; expected fail) [OK] -- plan.md, Вопросы до старта: нужен хотя бы один вопрос (строка со знаком '?')
- (3) heading renamed (Вне скоупа -> Границы): exit 1 (fail; expected fail) [OK] -- plan.md: нет заголовков: Вне скоупа
- (rubric demo set) weak-plan.md passes the structure check by design: exit 0 (pass; expected pass) [OK] -- Пройдено: структура plan.md верна. Качество плана оценивает ментор по рубрике.
- (rubric demo set) borderline-plan.md passes the structure check by design: exit 0 (pass; expected pass) [OK] -- Пройдено: структура plan.md верна. Качество плана оценивает ментор по рубрике.
- (rubric demo set) injection-plan.md passes the structure check by design: exit 0 (pass; expected pass) [OK] -- Пройдено: структура plan.md верна. Качество плана оценивает ментор по рубрике.
- (4a) usercustomize, run WITHOUT -I (attack is real): exit 0 (pass; expected pass) [OK] -- plan.md, Шаги: нумерованных шагов 0, нужно от 3 до 8 | plan.md, Контекст: найдено путей из исходного invoice-service/: 0, нужно не меньше 2 (пути относительно invoice-service/ или с префиксом invoice-service/) | plan.md, Вопросы до старта: нужен хотя бы один вопрос (строка со знаком '?')
- (4a) usercustomize, run with -I: exit 1 (fail; expected fail) [OK] -- plan.md, Шаги: нумерованных шагов 0, нужно от 3 до 8 | plan.md, Контекст: найдено путей из исходного invoice-service/: 0, нужно не меньше 2 (пути относительно invoice-service/ или с префиксом invoice-service/) | plan.md, Вопросы до старта: нужен хотя бы один вопрос (строка со знаком '?')
- (4b) PATH shim first on PATH (attack is real; runner fixed PATH defends): exit 0 (pass; expected pass) [OK] -- 
- (4b) PATH shim present, fixed PATH from (1): exit 1 (fail; expected fail) [OK] -- plan.md, Шаги: нумерованных шагов 0, нужно от 3 до 8 | plan.md, Контекст: найдено путей из исходного invoice-service/: 0, нужно не меньше 2 (пути относительно invoice-service/ или с префиксом invoice-service/) | plan.md, Вопросы до старта: нужен хотя бы один вопрос (строка со знаком '?')
```

## L5 05-memory-agents-md

The earlier run had one `[UNEXPECTED]` line: in the variant "codegen mentioned without the generated path on that line" my replacement left `src/invoices/generated/` on the same line, so the variant did not remove what it claimed to. Fixed in the driver and rerun; the check fails that variant.

```text
## L5 agents-md-structure
- (1) empty starter (bloated CLAUDE.md, no AGENTS.md): exit 1 (fail; expected fail) [OK] -- AGENTS.md не найден в корне рабочего места | CLAUDE.md: 162 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | CLAUDE. ...
- (2) reference AGENTS.md + one-line CLAUDE.md: exit 0 (pass; expected pass) [OK] -- Пройдено: форма AGENTS.md и подключение верны. Смысл правил оценивает ментор по рубрике.
- (3) AGENTS.md added but the old CLAUDE.md kept: exit 1 (fail; expected fail) [OK] -- CLAUDE.md: 162 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | AGENTS.md, CLAUDE.md: есть IMPORTANT, CRITICAL или ! ...
- (3) trimmed copy-paste of the old file plus the right facts (overlap): exit 1 (fail; expected fail) [OK] -- файлы инструкций (AGENTS.md, CLAUDE.md): 29 строк совпадают со строками исходного CLAUDE.md после нормализации (строчные буквы, без символов # * > _ и обратных кавычек, без маркера списка в начале, пробелы схлопнуты, без точки/двоеточия/запятой в конце; строки короче 20 символов не считаются), допус ...
- (3) db-reset/staging line without a negation: exit 1 (fail; expected fail) [OK] -- AGENTS.md: в строке про `db-reset` и staging нет отрицания (не, нельзя, никогда, never, don't, do not)
- (3) reference AGENTS.md, CLAUDE.md removed (other accepted hookup): exit 0 (pass; expected pass) [OK] -- Пройдено: форма AGENTS.md и подключение верны. Смысл правил оценивает ментор по рубрике.
- (3) CLAUDE.md with `@AGENTS.md` but 12 lines long: exit 1 (fail; expected fail) [OK] -- CLAUDE.md: 12 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк
- (3) CLAUDE.md removed but .claude/CLAUDE.md created without the import: exit 1 (fail; expected fail) [OK] -- .claude/CLAUDE.md: при настройках по умолчанию Claude Code тогда не читает AGENTS.md, а ни один из этих файлов не импортирует корневой AGENTS.md; путь импорта считается от файла с импортом (`@AGENTS.md` в CLAUDE.md или CLAUDE.local.md, `@../AGENTS.md` в .claude/CLAUDE.md), внутри кода импорт не рабо ...
- (3) reference + `IMPORTANT:` prefix on one rule: exit 1 (fail; expected fail) [OK] -- AGENTS.md, CLAUDE.md: есть IMPORTANT, CRITICAL или !!!: важность передают причиной, а не капсом
- (3) reference + pasted directory tree: exit 1 (fail; expected fail) [OK] -- AGENTS.md, CLAUDE.md: есть строки с псевдографикой дерева каталогов: структуру агент видит сам
- (3) codegen mentioned without the generated path on that line: exit 1 (fail; expected fail) [OK] -- AGENTS.md: нет строки, где `make codegen` упомянут вместе с путём `src/invoices/generated/`
- (rubric demo set) weak-AGENTS.md passes the structure check (form filter only): exit 0 (pass; expected pass) [OK] -- Пройдено: форма AGENTS.md и подключение верны. Смысл правил оценивает ментор по рубрике.
- (rubric demo set) borderline-AGENTS.md passes the structure check (form filter only): exit 0 (pass; expected pass) [OK] -- Пройдено: форма AGENTS.md и подключение верны. Смысл правил оценивает ментор по рубрике.
- (rubric demo set) inverted-keyword-stuffed-AGENTS.md passes the structure check (form filter only): exit 0 (pass; expected pass) [OK] -- Пройдено: форма AGENTS.md и подключение верны. Смысл правил оценивает ментор по рубрике.
- (rubric demo set) injection-AGENTS.md passes the structure check (form filter only): exit 0 (pass; expected pass) [OK] -- Пройдено: форма AGENTS.md и подключение верны. Смысл правил оценивает ментор по рубрике.
- (C7) CLAUDE.md deleted, the whole old file kept as CLAUDE.local.md with `@AGENTS.md` on top: exit 1 (fail; expected fail) [OK] -- CLAUDE.local.md: 163 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | AGENTS.md, CLAUDE.local.md: есть IMPORTANT, CR ...
- (C7) old file moved to .claude/CLAUDE.md with `@AGENTS.md` on top: exit 1 (fail; expected fail) [OK] -- .claude/CLAUDE.md: 163 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | .claude/CLAUDE.md, AGENTS.md: есть IMPORTANT ...
- (C7) old file parked in .claude/AGENTS.md (also loaded at launch): exit 1 (fail; expected fail) [OK] -- .claude/AGENTS.md: 162 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | .claude/AGENTS.md, AGENTS.md: есть IMPORTANT ...
- (C7) 9-line CLAUDE.local.md made of old-file lines (overlap counted over all files): exit 1 (fail; expected fail) [OK] -- файлы инструкций (AGENTS.md, CLAUDE.local.md, CLAUDE.md): 9 строк совпадают со строками исходного CLAUDE.md после нормализации (строчные буквы, без символов # * > _ и обратных кавычек, без маркера списка в начале, пробелы схлопнуты, без точки/двоеточия/запятой в конце; строки короче 20 символов не с ...
- (3) short personal CLAUDE.local.md (3 lines) next to the one-line CLAUDE.md passes: exit 0 (pass; expected pass) [OK] -- Пройдено: форма AGENTS.md и подключение верны. Смысл правил оценивает ментор по рубрике.
- (3) CLAUDE.md removed, CLAUDE.local.md is a single `@AGENTS.md` line: passes: exit 0 (pass; expected pass) [OK] -- Пройдено: форма AGENTS.md и подключение верны. Смысл правил оценивает ментор по рубрике.
- (C13) old file moved to .claude/rules/legacy.md (no paths: frontmatter): exit 1 (fail; expected fail) [OK] -- .claude/rules/legacy.md: 162 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | .claude/rules/legacy.md, AGENTS.md: ес ...
- (C13) old file in .claude/rules/legacy.md with paths: ['**'] frontmatter: exit 1 (fail; expected fail) [OK] -- .claude/rules/legacy.md: 165 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | .claude/rules/legacy.md, AGENTS.md: ес ...
- (C14) old file renamed legacy-notes.md and imported from AGENTS.md: exit 1 (fail; expected fail) [OK] -- legacy-notes.md: 162 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | AGENTS.md, legacy-notes.md: есть IMPORTANT, CR ...
- (C14) 2-line CLAUDE.md importing @AGENTS.md and @docs/legacy.md: exit 1 (fail; expected fail) [OK] -- docs/legacy.md: 162 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | AGENTS.md, CLAUDE.md, docs/legacy.md: есть IMPO ...
- (C14) import chain of 3 hops: AGENTS.md -> docs/a.md -> docs/b.md -> docs/old.md: exit 1 (fail; expected fail) [OK] -- docs/old.md: 162 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | AGENTS.md, docs/a.md, docs/b.md, docs/old.md: есть ...
- (C15) old file 5 imports below AGENTS.md (AGENTS -> h1 -> h2 -> h3 -> h4 -> old): exit 1 (fail; expected fail) [OK] -- docs/old.md: 162 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | AGENTS.md, docs/h1.md, docs/h2.md, docs/h3.md, doc ...
- (C15 boundary) old file 6 imports below AGENTS.md: beyond any reading of the docs' four hops, not followed: exit 0 (pass; expected pass) [OK] -- Пройдено: форма AGENTS.md и подключение верны. Смысл правил оценивает ментор по рубрике.
- (J1) CLAUDE.md removed, .claude/CLAUDE.md = `@AGENTS.md` (imports the missing .claude/AGENTS.md): exit 1 (fail; expected fail) [OK] -- .claude/CLAUDE.md: при настройках по умолчанию Claude Code тогда не читает AGENTS.md, а ни один из этих файлов не импортирует корневой AGENTS.md; путь импорта считается от файла с импортом (`@AGENTS.md` в CLAUDE.md или CLAUDE.local.md, `@../AGENTS.md` в .claude/CLAUDE.md), внутри кода импорт не рабо ...
- (J1) CLAUDE.md with `@AGENTS.md` only inside a ``` fence: exit 1 (fail; expected fail) [OK] -- CLAUDE.md: при настройках по умолчанию Claude Code тогда не читает AGENTS.md, а ни один из этих файлов не импортирует корневой AGENTS.md; путь импорта считается от файла с импортом (`@AGENTS.md` в CLAUDE.md или CLAUDE.local.md, `@../AGENTS.md` в .claude/CLAUDE.md), внутри кода импорт не работает; ил ...
- (J1) CLAUDE.md with `@AGENTS.md` only inside a code span: exit 1 (fail; expected fail) [OK] -- CLAUDE.md: при настройках по умолчанию Claude Code тогда не читает AGENTS.md, а ни один из этих файлов не импортирует корневой AGENTS.md; путь импорта считается от файла с импортом (`@AGENTS.md` в CLAUDE.md или CLAUDE.local.md, `@../AGENTS.md` в .claude/CLAUDE.md), внутри кода импорт не работает; ил ...
- (J1) CLAUDE.md removed, .claude/CLAUDE.md = `@../AGENTS.md` passes: exit 0 (pass; expected pass) [OK] -- Пройдено: форма AGENTS.md и подключение верны. Смысл правил оценивает ментор по рубрике.
- (J1) CLAUDE.local.md = `@AGENTS.md`, CLAUDE.md = `@./AGENTS.md` passes: exit 0 (pass; expected pass) [OK] -- Пройдено: форма AGENTS.md и подключение верны. Смысл правил оценивает ментор по рубрике.
- (G2) old file moved to src/CLAUDE.md (loaded on demand): exit 1 (fail; expected fail) [OK] -- src/CLAUDE.md: 162 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | AGENTS.md, src/CLAUDE.md: есть IMPORTANT, CRITIC ...
- (G2) old file moved to tests/AGENTS.md: exit 1 (fail; expected fail) [OK] -- tests/AGENTS.md: 162 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | AGENTS.md, tests/AGENTS.md: есть IMPORTANT, CR ...
- (3) `@legacy-notes.md` inside inline code is not an import: passes: exit 0 (pass; expected pass) [OK] -- Пройдено: форма AGENTS.md и подключение верны. Смысл правил оценивает ментор по рубрике.
- (3) a short 3-line .claude/rules/style.md passes: exit 0 (pass; expected pass) [OK] -- Пройдено: форма AGENTS.md и подключение верны. Смысл правил оценивает ментор по рубрике.
- (4a) usercustomize, run WITHOUT -I (attack is real): exit 0 (pass; expected pass) [OK] -- AGENTS.md не найден в корне рабочего места | CLAUDE.md: 162 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | CLAUDE. ...
- (4a) usercustomize, run with -I: exit 1 (fail; expected fail) [OK] -- AGENTS.md не найден в корне рабочего места | CLAUDE.md: 162 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | CLAUDE. ...
- (4b) PATH shim first on PATH (attack is real; runner fixed PATH defends): exit 0 (pass; expected pass) [OK] -- 
- (4b) PATH shim present, fixed PATH from (1): exit 1 (fail; expected fail) [OK] -- AGENTS.md не найден в корне рабочего места | CLAUDE.md: 162 строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить (CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные через @ файлы), может быть не длиннее 10 строк | CLAUDE. ...
```

## L6 06-permissions-security

Grounding: P is a temp project dir whose path contains a space, cwd is a sibling dir. Exec form substitutes `${CLAUDE_PROJECT_DIR}` textually in `command` and every `args` element and spawns the argv with no shell. Shell form runs `sh -c` and `bash -c` with `CLAUDE_PROJECT_DIR=P`. Each one is fed a block payload. "hook ran" means the hook's own `make codegen` message reached stderr. This emulates documented behaviour; it is not Claude Code itself.

```text
## L6 repository file modes (exec bit; D3 closed by Stepan's chmod)
- starter .claude/hooks/protect_generated.py: 0o755; reference .claude/hooks/protect_generated.py: 0o755

## L6 permissions-policy
- (1) empty starter, exactly as committed: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff)) | - .claude/settings.json: defaultMode "bypassPermissions": из проектных и локальных настроек Claude Code его игнорирует ...
- (2) reference: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (3) deny everything: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - src/invoices/api.py нельзя править без вопроса (исход: deny) | - обычный файл в src/ нельзя править без вопроса (исход: deny) | - новый файл в новом каталоге src/ нельзя создать без вопроса (исход: deny) | - похожее имя вне generated/ (generated_report.py) нельзя править без вопроса ...
- (3) allow everything: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff)) | - allow-правило вне разрешённого набора: Edit (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash ...
- (3) broad deny Edit(src/**) + allow exception for api.py: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - src/invoices/api.py нельзя править без вопроса (исход: deny) | - обычный файл в src/ нельзя править без вопроса (исход: deny) | - новый файл в новом каталоге src/ нельзя создать без вопроса (исход: deny) | - похожее имя вне generated/ (generated_report.py) нельзя править без вопроса ...
- (3) Read(.env) only: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - секрет с суффиксом (.env.<окружение>) читается (исход: builtin) | - файл секрета на другой глубине можно перезаписать (исход: mode-dependent)
- (3) Read(./.env) and Read(./.env.*) (cwd only): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - секрет на другой глубине читается (исход: builtin) | - файл секрета на другой глубине можно перезаписать (исход: mode-dependent)
- (3) generated/ protected with Write(...) only: exit 1 (fail; expected fail) [OK] -- Заметка: rule accepted by Claude Code but never matches: Write(src/invoices/generated/**) (правила путей пишут через Edit) | Не пройдено: | - файл в src/invoices/generated/ можно править (исход: allow) | - файл в src/invoices/generated/ можно перезаписать (исход: allow)
- (3) allow Bash(git *): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash(git *) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff)) | - push через git -C разрешён без вопроса (исход: allow) | - git -c <опция> разрешён без вопроса (исход: allow)
- (3) allow Bash(make *) instead of make test/lint: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash(make *) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff)) | - make db-reset разрешён без вопроса (исход: allow)
- (3) relying on the CLAUDE.md line (no secret rules): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - файл секрета .env в корне читается (исход: builtin) | - секрет с суффиксом (.env.<окружение>) читается (исход: builtin) | - секрет на другой глубине читается (исход: builtin) | - файл секрета можно править (исход: mode-dependent) | - файл секрета на другой глубине можно перезаписать ...
- (3) bare WebFetch in ask: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - WebFetch в ask: голая форма не принимается в этом упражнении: не документировано, перекрывает ли она встроенный список доверенных доменов документации
- (3) ask WebFetch for the docs domain only: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - загрузка из веба со случайного домена не спрашивает (исход: mode-dependent) | - загрузка с домена документации не спрашивает (исход: mode-dependent)
- (3) `!` negation rule: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - unsupported rule form for this exercise: Read(!.env.example) (правила с `!`)
- (3) content-field form Bash(command:...): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - unsupported rule form for this exercise: Bash(command:git push*) (форма поля `Bash(command:...)`)
- (3) wrapper rule Bash(timeout *): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - unsupported rule form for this exercise: Bash(timeout *) (обёртка или переменная окружения в начале правила)
- (3) defaultMode bypassPermissions kept: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: defaultMode "bypassPermissions": из проектных и локальных настроек Claude Code его игнорирует с v2.1.257, строка только вводит в заблуждение; уберите её
- (3) reference + bare Bash allow hidden in settings.local.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff)) | - make db-reset разрешён без вопроса (исход: allow) | - push через git -C разрешён без вопроса (исход: allow) | - git  ...
- (3) Makefile keeps --dangerously-skip-permissions: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - Makefile: цель agent должна быть без зависимостей и с одной строкой рецепта из: claude, claude --permission-mode default, claude --permission-mode manual, claude --permission-mode plan (или цель можно удалить)
- (3) Makefile --permission-mode bypassPermissions: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - Makefile: цель agent должна быть без зависимостей и с одной строкой рецепта из: claude, claude --permission-mode default, claude --permission-mode manual, claude --permission-mode plan (или цель можно удалить)
- (3, A3) Makefile claude --settings '{"disableAllHooks": true}': exit 1 (fail; expected fail) [OK] -- Не пройдено: | - Makefile: цель agent должна быть без зависимостей и с одной строкой рецепта из: claude, claude --permission-mode default, claude --permission-mode manual, claude --permission-mode plan (или цель можно удалить)
- (3, A3) Makefile claude --settings extra.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - Makefile: цель agent должна быть без зависимостей и с одной строкой рецепта из: claude, claude --permission-mode default, claude --permission-mode manual, claude --permission-mode plan (или цель можно удалить)
- (3, A2) NaN in settings.json: exit 1 (fail; expected fail) [OK] -- Ошибка формата: .claude/settings.json: недопустимое значение NaN: нужен строгий JSON
- (3, A2) -Infinity in settings.json: exit 1 (fail; expected fail) [OK] -- Ошибка формата: .claude/settings.json: недопустимое значение -Infinity: нужен строгий JSON
- (C4) permissions-policy: second PreToolUse group matcher Bash answering allow: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - в настройках больше одного хука: допускается только одна группа PreToolUse с одним хуком protect_generated, любой другой хук может вернуть allow в обход правил
- (C5) permissions-policy: PermissionRequest auto-approve hook in settings.local.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.local.json: хук на событие PermissionRequest может разрешить вызов в обход правил; в упражнении он не допускается
- (C6) Makefile recipe: claude --permission-mode "bypassPermissions": exit 1 (fail; expected fail) [OK] -- Не пройдено: | - Makefile: цель agent должна быть без зависимостей и с одной строкой рецепта из: claude, claude --permission-mode default, claude --permission-mode manual, claude --permission-mode plan (или цель можно удалить)
- (C6) Makefile recipe: MODE=bypassPermissions; claude --permission-mode $$MODE: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - Makefile: цель agent должна быть без зависимостей и с одной строкой рецепта из: claude, claude --permission-mode default, claude --permission-mode manual, claude --permission-mode plan (или цель можно удалить)
- (C6) Makefile recipe: claude --dangerously-skip-$(SUFFIX): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - Makefile: цель agent должна быть без зависимостей и с одной строкой рецепта из: claude, claude --permission-mode default, claude --permission-mode manual, claude --permission-mode plan (или цель можно удалить)
- (C6) Makefile recipe: claude --permission-mode acceptEdits: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - Makefile: цель agent должна быть без зависимостей и с одной строкой рецепта из: claude, claude --permission-mode default, claude --permission-mode manual, claude --permission-mode plan (или цель можно удалить)
- (C6) Makefile recipe: $(shell echo claude) --resume: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - Makefile: цель agent должна быть без зависимостей и с одной строкой рецепта из: claude, claude --permission-mode default, claude --permission-mode manual, claude --permission-mode plan (или цель можно удалить)
- (C6) Makefile recipe: claude --allowedTools Bash: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - Makefile: цель agent должна быть без зависимостей и с одной строкой рецепта из: claude, claude --permission-mode default, claude --permission-mode manual, claude --permission-mode plan (или цель можно удалить)
- (3) accepted Makefile recipe: claude --permission-mode plan: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (3) accepted Makefile recipe: @claude: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (C11) Makefile name split into variables: $(A)$(B) --dangerously-$(S)-permissions: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - Makefile: изменено что-то кроме цели agent (сравнение с исходным Makefile после нормализации пробелов и без комментариев); менять можно только цель agent | - Makefile: цель agent должна быть без зависимостей и с одной строкой рецепта из: claude, claude --permission-mode default, cla ...
- (C12) agent recipe `sh scripts/agent.sh`, the script runs claude --dangerously-skip-permissions: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - Makefile: цель agent должна быть без зависимостей и с одной строкой рецепта из: claude, claude --permission-mode default, claude --permission-mode manual, claude --permission-mode plan (или цель можно удалить) | - scripts/agent.sh: новый скрипт или исполняемый файл вне файлов задани ...
- (C12) helper script added but not called from the Makefile (new script outside the task files): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - scripts/agent.sh: новый скрипт или исполняемый файл вне файлов задания; менять можно только настройки .claude, хук protect_generated.py и цель agent в Makefile
- (C11) bypass appended to the test target recipe: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - Makefile: изменено что-то кроме цели agent (сравнение с исходным Makefile после нормализации пробелов и без комментариев); менять можно только цель agent
- (C12) new tests/conftest.py that starts claude: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - tests/conftest.py: новый скрипт или исполняемый файл вне файлов задания; менять можно только настройки .claude, хук protect_generated.py и цель agent в Makefile
- (C12) starter script scripts/db_reset.py modified: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - scripts/db_reset.py: изменённый скрипт или исполняемый файл вне файлов задания; менять можно только настройки .claude, хук protect_generated.py и цель agent в Makefile
- (3) agent target removed (with .PHONY cleaned) passes: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (3) whitespace-only change in another recipe passes (normalized): exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (3) README edited (not a script) passes: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (G1) allow Bash(sh *) added to the reference: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash(sh *) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff)) | - git push через sh -c разрешён без вопроса (исход: allow)
- (G1) allow Bash(bash *) added to the reference: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash(bash *) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff)) | - команда через bash -c разрешена без вопроса (исход: allow)
- (G1) allow Bash(python3 *) added to the reference: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash(python3 *) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff)) | - команда через python3 -c разрешена без вопроса (исход: allow)
- (G1) allow Bash(env *) added to the reference: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash(env *) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff)) | - команда через env разрешена без вопроса (исход: allow)
- (G1) allow Bash(sh:*) added to the reference: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash(sh:*) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff)) | - git push через sh -c разрешён без вопроса (исход: allow)
- (J7) reference + defaultMode "plan" in settings.json passes: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (J7) reference + defaultMode "default" in settings.json passes: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (J7) reference + defaultMode "manual" in settings.json passes: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (J7) reference + defaultMode "manual" in settings.local.json passes: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (J7) Makefile agent recipe `claude --permission-mode manual` passes: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (J7) reference + disableBypassPermissionsMode "disable" passes: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (J7) reference + defaultMode "acceptEdits" in settings.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: defaultMode "acceptEdits": правки вне src/ и команды rm, mv, cp в рабочей папке пройдут без запроса
    message: .claude/settings.json: defaultMode "acceptEdits": правки вне src/ и команды rm, mv, cp в рабочей папке пройдут без запроса
- (J7) reference + defaultMode "dontAsk" in settings.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: defaultMode "dontAsk": всё, что должно спрашивать, превращается в отказ, и пункт 6 политики (каждая загрузка спрашивает) ломается
    message: .claude/settings.json: defaultMode "dontAsk": всё, что должно спрашивать, превращается в отказ, и пункт 6 политики (каждая загрузка спрашивает) ломается
- (J7) reference + defaultMode "bypassPermissions" in settings.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: defaultMode "bypassPermissions": из проектных и локальных настроек Claude Code его игнорирует с v2.1.257, строка только вводит в заблуждение; уберите её
    message: .claude/settings.json: defaultMode "bypassPermissions": из проектных и локальных настроек Claude Code его игнорирует с v2.1.257, строка только вводит в заблуждение; уберите её
- (J7) reference + defaultMode "auto" in settings.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: defaultMode "auto": из проектных и локальных настроек не действует (сессия начинает во встроенном стартовом режиме), строка вводит в заблуждение
    message: .claude/settings.json: defaultMode "auto": из проектных и локальных настроек не действует (сессия начинает во встроенном стартовом режиме), строка вводит в заблуждение
- (J7) reference + defaultMode "Plan" in settings.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: defaultMode "Plan": значение вне упражнения: допустимы только "default", "manual" и "plan" или отсутствие ключа
    message: .claude/settings.json: defaultMode "Plan": значение вне упражнения: допустимы только "default", "manual" и "plan" или отсутствие ключа
- (J7) reference + defaultMode "readonly" in settings.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: defaultMode "readonly": значение вне упражнения: допустимы только "default", "manual" и "plan" или отсутствие ключа
    message: .claude/settings.json: defaultMode "readonly": значение вне упражнения: допустимы только "default", "manual" и "plan" или отсутствие ключа
- (J7) reference + defaultMode 1 in settings.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: defaultMode 1: значение вне упражнения: допустимы только "default", "manual" и "plan" или отсутствие ключа
    message: .claude/settings.json: defaultMode 1: значение вне упражнения: допустимы только "default", "manual" и "plan" или отсутствие ключа
- (J7) reference + defaultMode null in settings.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: defaultMode null: значение вне упражнения: допустимы только "default", "manual" и "plan" или отсутствие ключа
    message: .claude/settings.json: defaultMode null: значение вне упражнения: допустимы только "default", "manual" и "plan" или отсутствие ключа
- (J7) reference + defaultMode ["plan"] in settings.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: defaultMode ["plan"]: значение вне упражнения: допустимы только "default", "manual" и "plan" или отсутствие ключа
    message: .claude/settings.json: defaultMode ["plan"]: значение вне упражнения: допустимы только "default", "manual" и "plan" или отсутствие ключа
- (J7) reference + defaultMode "dontAsk" in settings.local.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.local.json: defaultMode "dontAsk": всё, что должно спрашивать, превращается в отказ, и пункт 6 политики (каждая загрузка спрашивает) ломается
    message: .claude/settings.local.json: defaultMode "dontAsk": всё, что должно спрашивать, превращается в отказ, и пункт 6 политики (каждая загрузка спрашивает) ломается
- (J7) reference + additionalDirectories ["/"]: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: permissions.additionalDirectories: ключ вне упражнения; непустой список с путями вне проекта открывает агенту файлы без запроса, это ломает пункт 7 политики
    message: .claude/settings.json: permissions.additionalDirectories: ключ вне упражнения; непустой список с путями вне проекта открывает агенту файлы без запроса, это ломает пункт 7 политики
- (J7) reference + additionalDirectories ["~"]: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: permissions.additionalDirectories: ключ вне упражнения; непустой список с путями вне проекта открывает агенту файлы без запроса, это ломает пункт 7 политики
    message: .claude/settings.json: permissions.additionalDirectories: ключ вне упражнения; непустой список с путями вне проекта открывает агенту файлы без запроса, это ломает пункт 7 политики
- (J7) reference + unknown permissions key "foo": exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: permissions.foo: ключ вне упражнения: в permissions допускаются только allow, ask, deny, defaultMode и disableBypassPermissionsMode
    message: .claude/settings.json: permissions.foo: ключ вне упражнения: в permissions допускаются только allow, ask, deny, defaultMode и disableBypassPermissionsMode
- (J7) settings.local.json with permissions.additionalDirectories ["/"]: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.local.json: permissions.additionalDirectories: ключ вне упражнения; непустой список с путями вне проекта открывает агенту файлы без запроса, это ломает пункт 7 политики
    message: .claude/settings.local.json: permissions.additionalDirectories: ключ вне упражнения; непустой список с путями вне проекта открывает агенту файлы без запроса, это ломает пункт 7 политики
- (J8) reference + additionalDirectories []: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: permissions.additionalDirectories: ключ вне упражнения; непустой список с путями вне проекта открывает агенту файлы без запроса, это ломает пункт 7 политики
    message: .claude/settings.json: permissions.additionalDirectories: ключ вне упражнения; непустой список с путями вне проекта открывает агенту файлы без запроса, это ломает пункт 7 политики
- (J8) reference + additionalDirectories ["src"]: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: permissions.additionalDirectories: ключ вне упражнения; непустой список с путями вне проекта открывает агенту файлы без запроса, это ломает пункт 7 политики
    message: .claude/settings.json: permissions.additionalDirectories: ключ вне упражнения; непустой список с путями вне проекта открывает агенту файлы без запроса, это ломает пункт 7 политики
- (J8) reference + disableBypassPermissionsMode true: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: permissions.disableBypassPermissionsMode true: единственное документированное значение "disable"; другое значение уберите или замените
    message: .claude/settings.json: permissions.disableBypassPermissionsMode true: единственное документированное значение "disable"; другое значение уберите или замените
- (J8) reference + disableBypassPermissionsMode false: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: permissions.disableBypassPermissionsMode false: единственное документированное значение "disable"; другое значение уберите или замените
    message: .claude/settings.json: permissions.disableBypassPermissionsMode false: единственное документированное значение "disable"; другое значение уберите или замените
- (J8) reference + disableBypassPermissionsMode "enable": exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: permissions.disableBypassPermissionsMode "enable": единственное документированное значение "disable"; другое значение уберите или замените
    message: .claude/settings.json: permissions.disableBypassPermissionsMode "enable": единственное документированное значение "disable"; другое значение уберите или замените
- (J8) reference + disableBypassPermissionsMode null: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: permissions.disableBypassPermissionsMode null: единственное документированное значение "disable"; другое значение уберите или замените
    message: .claude/settings.json: permissions.disableBypassPermissionsMode null: единственное документированное значение "disable"; другое значение уберите или замените
- (J8) reference + disableBypassPermissionsMode 1: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: permissions.disableBypassPermissionsMode 1: единственное документированное значение "disable"; другое значение уберите или замените
    message: .claude/settings.json: permissions.disableBypassPermissionsMode 1: единственное документированное значение "disable"; другое значение уберите или замените
- (J8) reference + disableBypassPermissionsMode ["disable"]: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.json: permissions.disableBypassPermissionsMode ["disable"]: единственное документированное значение "disable"; другое значение уберите или замените
    message: .claude/settings.json: permissions.disableBypassPermissionsMode ["disable"]: единственное документированное значение "disable"; другое значение уберите или замените
- (J8) settings.local.json with disableBypassPermissionsMode true: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - .claude/settings.local.json: permissions.disableBypassPermissionsMode true: единственное документированное значение "disable"; другое значение уберите или замените
    message: .claude/settings.local.json: permissions.disableBypassPermissionsMode true: единственное документированное значение "disable"; другое значение уберите или замените
- (J5) reference without defaultMode (absent) passes: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (J6) allow rules with outer whitespace (' Bash(make test) ', ' Edit(src/**)') pass: the rule is stripped first: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (3) git status/diff allowed by exact rules still passes: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (J2) allow Bash(uv run *) added to the reference (outside the closed allow set): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash(uv run *) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))
- (J2) allow Bash(npx *) added to the reference (outside the closed allow set): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash(npx *) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))
- (J2) allow Bash(npm run *) added to the reference (outside the closed allow set): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash(npm run *) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))
- (J2) allow Bash(find *) added to the reference (outside the closed allow set): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash(find *) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))
- (J2) allow Bash(docker *) added to the reference (outside the closed allow set): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash(docker *) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))
- (J2) allow Edit(//**) added to the reference (outside the closed allow set): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Edit(//**) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))
- (J2) allow Edit(~/project/src/**) added to the reference (outside the closed allow set): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Edit(~/project/src/**) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))
- (J2) allow Edit(src/../**) added to the reference (outside the closed allow set): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Edit(src/../**) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))
- (J2) allow Edit(**) added to the reference (outside the closed allow set): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Edit(**) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))
- (J2) allow Edit(tests/**) added to the reference (outside the closed allow set): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Edit(tests/**) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))
- (J2) allow Bash(git diff *) added to the reference (outside the closed allow set): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash(git diff *) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))
- (J2) allow Bash(make test *) added to the reference (outside the closed allow set): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash(make test *) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))
- (J2) allow Read(src/**) added to the reference (outside the closed allow set): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Read(src/**) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))
- (J2) allow WebFetch(domain:docs.python.org) added to the reference (outside the closed allow set): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: WebFetch(domain:docs.python.org) (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))
- (J2) allow Write added to the reference (outside the closed allow set): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Write (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))
- (J2) honest allow set ['Edit(./src/**)', 'Bash(make test)', 'Bash(make lint)'] passes: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (J2) honest allow set ['Edit(/src/**)', 'Bash(make test)', 'Bash(make lint)'] passes: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (J2) honest allow set ['Edit(src/**)', 'Edit(src/invoices/api.py)', 'Bash(make test)', 'Bash(make lint)', 'Bash(git status)', 'Bash(git diff)'] passes: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (3) single-segment deny Edit(generated/**) (any depth) passes: exit 0 (pass; expected pass) [OK] -- Пройдено: правила разрешений и Makefile соответствуют политике.
- (4a) usercustomize, run WITHOUT -I (attack is real): exit 0 (pass; expected pass) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff)) | - .claude/settings.json: defaultMode "bypassPermissions": из проектных и локальных настроек Claude Code его игнорирует ...
- (4a) usercustomize, run with -I: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff)) | - .claude/settings.json: defaultMode "bypassPermissions": из проектных и локальных настроек Claude Code его игнорирует ...
- (4b) PATH shim first on PATH (attack is real; runner fixed PATH defends): exit 0 (pass; expected pass) [OK] -- 
- (4b) PATH shim present, fixed PATH from (1): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - allow-правило вне разрешённого набора: Bash (в allow допускаются только Edit(...) внутри src/, Bash(make test), Bash(make lint), Bash(git status), Bash(git diff)) | - .claude/settings.json: defaultMode "bypassPermissions": из проектных и локальных настроек Claude Code его игнорирует ...

## L6 hook-blocks-generated
- (1) empty starter, exactly as committed (no registration): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write | - (б) поведение: правка в generated/: не заблокировано (нужен exit 2 и `make codegen` в stderr или JSON deny с `make codegen` в причине; получен exit 0) | - (б) поведение: новый файл во вложе ...
- (2) reference (E1), files exactly as committed (mode 755): exit 0 (pass; expected pass) [OK] -- Пройдено: хук зарегистрирован в принятой форме и блокирует только src/invoices/generated/.
- (3) reference with the exec bit cleared to 644: E1 needs it: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: .claude/hooks/protect_generated.py: нет бита исполнения у владельца, Claude Code не сможет запустить файл
- (3) substring `"generated" in stdin`: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: .claude/hooks/protect_generated.py: без названного интерпретатора первая строка должна быть #!, называющая python3 | - (б) поведение: generated/../api.py: заблокировано, а должно пропускаться (нужен exit 0 без deny; получен exit 2) | - (б) поведение: generated_repor ...
- (3) `"/generated/" in file_path`: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (б) поведение: generated/../api.py: заблокировано, а должно пропускаться (нужен exit 0 без deny; получен exit 2) | - (б) поведение: tests/generated/ (Write): заблокировано, а должно пропускаться (нужен exit 0 без deny; получен exit 2) | - (б) поведение: tests/generated/ (Edit): забл ...
- (3) exit 1 to block: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (б) поведение: правка в generated/: не заблокировано (нужен exit 2 и `make codegen` в stderr или JSON deny с `make codegen` в причине; получен exit 1) | - (б) поведение: новый файл во вложенном каталоге generated/: не заблокировано (нужен exit 2 и `make codegen` в stderr или JSON de ...
- (3) fail open on bad JSON (crash, exit 1): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (б) поведение: stdin не JSON: вызов не заблокирован (exit 1); нужен exit 2 или любой ненулевой код при onFailure: "block" | - (б) поведение: JSON без tool_input.file_path: вызов не заблокирован (exit 1); нужен exit 2 или любой ненулевой код при onFailure: "block"
- (3) fail open on bad JSON but registered with onFailure: block: exit 0 (pass; expected pass) [OK] -- Пройдено: хук зарегистрирован в принятой форме и блокирует только src/invoices/generated/.
- (3) block every Edit/Write: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (б) поведение: src/invoices/api.py: заблокировано, а должно пропускаться (нужен exit 0 без deny; получен exit 2) | - (б) поведение: generated/../api.py: заблокировано, а должно пропускаться (нужен exit 0 без deny; получен exit 2) | - (б) поведение: generated_report.py: заблокировано ...
- (3) hook not registered: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write
- (3) matcher Edit only: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write: matcher 'Edit' не совпадает и с Edit, и с Write (.claude/settings.json)
- (3) matcher regex Edit.*: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write: matcher 'Edit.*' не принят: нужен список имён через | или , (например "Edit|Write"); regex, "*" и пустой matcher вне упражнения (.claude/settings.json)
- (3) matcher regex ^(Edit|Write)$ (regex matchers are outside the allowlist): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write: matcher '^(Edit|Write)$' не принят: нужен список имён через | или , (например "Edit|Write"); regex, "*" и пустой matcher вне упражнения (.claude/settings.json)
- (C3) matcher '(?i)^(edit|write)$': exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write: matcher '(?i)^(edit|write)$' не принят: нужен список имён через | или , (например "Edit|Write"); regex, "*" и пустой matcher вне упражнения (.claude/settings.json)
- (C3) matcher '\\A(Edit|Write)\\Z': exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write: matcher '\\A(Edit|Write)\\Z' не принят: нужен список имён через | или , (например "Edit|Write"); regex, "*" и пустой matcher вне упражнения (.claude/settings.json)
- (C3) matcher '(?P<tool>Edit|Write)': exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write: matcher '(?P<tool>Edit|Write)' не принят: нужен список имён через | или , (например "Edit|Write"); regex, "*" и пустой matcher вне упражнения (.claude/settings.json)
- (C3) matcher '*': exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write: matcher '*' не принят: нужен список имён через | или , (например "Edit|Write"); regex, "*" и пустой matcher вне упражнения (.claude/settings.json)
- (C3) matcher '': exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write: matcher '' не принят: нужен список имён через | или , (например "Edit|Write"); regex, "*" и пустой matcher вне упражнения (.claude/settings.json)
- (C3) matcher 'Edit|Write|Read': exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write: matcher 'Edit|Write|Read': лишние инструменты ['Read'] (допустимы Edit, Write и по желанию MultiEdit, NotebookEdit) (.claude/settings.json)
- (C3) matcher 'Edit|Write|Bash': exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write: matcher 'Edit|Write|Bash': лишние инструменты ['Bash'] (допустимы Edit, Write и по желанию MultiEdit, NotebookEdit) (.claude/settings.json)
- (D10) matcher 'Edit Write' (space, no separator: one exact name that matches nothing): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write: matcher 'Edit Write' не принят: нужен список имён через | или , (например "Edit|Write"); regex, "*" и пустой matcher вне упражнения (.claude/settings.json)
- (3) accepted matcher 'Write|Edit' passes: exit 0 (pass; expected pass) [OK] -- Пройдено: хук зарегистрирован в принятой форме и блокирует только src/invoices/generated/.
- (3) accepted matcher 'Edit, Write' passes: exit 0 (pass; expected pass) [OK] -- Пройдено: хук зарегистрирован в принятой форме и блокирует только src/invoices/generated/.
- (3) accepted matcher 'Edit | Write' passes: exit 0 (pass; expected pass) [OK] -- Пройдено: хук зарегистрирован в принятой форме и блокирует только src/invoices/generated/.
- (3) accepted matcher 'Edit|Write|MultiEdit' passes: exit 0 (pass; expected pass) [OK] -- Пройдено: хук зарегистрирован в принятой форме и блокирует только src/invoices/generated/.
- (3) accepted matcher 'Edit|Write|NotebookEdit' passes: exit 0 (pass; expected pass) [OK] -- Пройдено: хук зарегистрирован в принятой форме и блокирует только src/invoices/generated/.
- (C4) second PreToolUse group matcher Bash answering allow: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: в настройках должен быть ровно один хук: одна группа PreToolUse с одним объектом хука protect_generated; любой другой хук может вернуть allow в обход правил
- (C4) second hook object in the same group: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: в настройках должен быть ровно один хук: одна группа PreToolUse с одним объектом хука protect_generated; любой другой хук может вернуть allow в обход правил
- (C5) PermissionRequest auto-approve hook in settings.local.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: .claude/settings.local.json: хук на событие PermissionRequest не разрешён в этом упражнении: он может разрешить вызов в обход правил
- (3) no-op `true .claude/hooks/protect_generated.py`: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: команда только упоминает путь к хуку, сам хук не выполняется
- (3) `echo ... ; exit 0`: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: shell form не совпадает ни с одной из 12 принятых строк
- (3) quoted shell spelling with args: []: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: форма с кавычками при наличии args: в exec form нет оболочки, кавычки и $ уходят в запуск буквально, хук не стартует, а не стартовавший хук это fail open
- (3) relative `.claude/hooks/...` (args removed): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: относительный путь: хук запускается в текущем каталоге Claude, его сдвигают cd и worktree
- (3) relative `./.claude/hooks/...` (args removed): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: относительный путь: хук запускается в текущем каталоге Claude, его сдвигают cd и worktree
- (3) relative `python3 .claude/hooks/...` (args removed): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: относительный путь: хук запускается в текущем каталоге Claude, его сдвигают cd и worktree
- (3) unquoted $CLAUDE_PROJECT_DIR in shell form: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: незакавыченный $CLAUDE_PROJECT_DIR в shell form: путь с пробелом развалится на два аргумента
- (3) `python3 script.py` as command with args: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: exec form запускает command как одно имя программы: `python3 script.py` вместе с args не стартует
- (3) reference E1 + if with typo Edit(src/invoice/generated/**): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: ключ `if` отклонён: команда хука запускается только при совпадении шаблона `if`, опечатка в нём молча выключает хук (fail open); хук сам решает по пути
- (3) reference E1 + async: true: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: ключ `async` отклонён: фоновый хук выполняется без блокировки вызова, поэтому ничего не блокирует
- (3) reference E1 + asyncRewake: true: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: ключ `asyncRewake` отклонён: фоновый хук выполняется без блокировки вызова, поэтому ничего не блокирует
- (3) reference E1 + timeout: 1 (may time out and then fail open): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: timeout 1: нужно число не меньше 5: хук может не успеть, а таймаут без onFailure: "block" не блокирует (fail open)
- (3) reference E1 + timeout: true: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: timeout True: нужно число не меньше 5: хук может не успеть, а таймаут без onFailure: "block" не блокирует (fail open)
- (3) reference E1 + once: true (rejected as outside the exercise): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: ключ `once` отклонён: вне упражнения (в файлах настроек once игнорируется)
- (3) reference E1 + shell: "bash" (rejected as outside the exercise): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: ключ `shell` отклонён: вне упражнения: принятые строки проверены только для оболочки по умолчанию (это не отказ Claude Code)
- (3) reference E1 + unknown key "foo": 1: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: ключ `foo` отклонён: ключ вне упражнения
- (3) reference E1 + timeout: 30 still passes: exit 0 (pass; expected pass) [OK] -- Пройдено: хук зарегистрирован в принятой форме и блокирует только src/invoices/generated/.
- (3) reference E1 + onFailure: "block" still passes: exit 0 (pass; expected pass) [OK] -- Пройдено: хук зарегистрирован в принятой форме и блокирует только src/invoices/generated/.
- (3) reference E1 + statusMessage: "..." still passes: exit 0 (pass; expected pass) [OK] -- Пройдено: хук зарегистрирован в принятой форме и блокирует только src/invoices/generated/.
- (3) disableAllHooks: true in settings.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: .claude/settings.json: disableAllHooks со значением True выключает все хуки, не удаляя их
- (3) disableAllHooks: true in a new settings.local.json: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: .claude/settings.local.json: disableAllHooks со значением True выключает все хуки, не удаляя их
- (3, A3) disableAllHooks: "false" (a string, not false): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: .claude/settings.json: disableAllHooks со значением 'false' выключает все хуки, не удаляя их
- (3, A3) disableAllHooks: 0: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: .claude/settings.json: disableAllHooks со значением 0 выключает все хуки, не удаляя их
- (3) disableAllHooks: false still passes: exit 0 (pass; expected pass) [OK] -- Пройдено: хук зарегистрирован в принятой форме и блокирует только src/invoices/generated/.
- (3, A2) NaN in settings.json: exit 1 (fail; expected fail) [OK] -- Ошибка формата: .claude/settings.json: недопустимое значение NaN: нужен строгий JSON
- (3, A2) Infinity as timeout: exit 1 (fail; expected fail) [OK] -- Ошибка формата: .claude/settings.json: недопустимое значение Infinity: нужен строгий JSON
- (3) E1 with the exec bit cleared: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: .claude/hooks/protect_generated.py: нет бита исполнения у владельца, Claude Code не сможет запустить файл
- (3) E1 with the shebang removed: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: .claude/hooks/protect_generated.py: без названного интерпретатора первая строка должна быть #!, называющая python3
- (3) E2 with the shebang removed and no exec bit passes (interpreter named): exit 0 (pass; expected pass) [OK] -- Пройдено: хук зарегистрирован в принятой форме и блокирует только src/invoices/generated/.
- (3) NBSP before the accepted shell spelling (args removed): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: по краям команды невидимые символы, которые оболочка не пропускает (NBSP, VT, CR): хук не стартует
- (demo) correct hook that crashes on a Read payload still passes (no Read probe): exit 0 (pass; expected pass) [OK] -- Пройдено: хук зарегистрирован в принятой форме и блокирует только src/invoices/generated/.
- (4a) usercustomize, run WITHOUT -I (attack is real): exit 0 (pass; expected pass) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write | - (б) поведение: правка в generated/: не заблокировано (нужен exit 2 и `make codegen` в stderr или JSON deny с `make codegen` в причине; получен exit 0) | - (б) поведение: новый файл во вложе ...
- (4a) usercustomize, run with -I: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write | - (б) поведение: правка в generated/: не заблокировано (нужен exit 2 и `make codegen` в stderr или JSON deny с `make codegen` в причине; получен exit 0) | - (б) поведение: новый файл во вложе ...
- (4b) PATH shim first on PATH (attack is real; runner fixed PATH defends): exit 0 (pass; expected pass) [OK] -- 
- (4b) PATH shim present, fixed PATH from (1): exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (а) регистрация: нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write | - (б) поведение: правка в generated/: не заблокировано (нужен exit 2 и `make codegen` в stderr или JSON deny с `make codegen` в причине; получен exit 0) | - (б) поведение: новый файл во вложе ...
- (4c) REFERENCE hook with top-level `import os; os._exit(0)`: exit 1 (fail; expected fail) [OK] -- Не пройдено: | - (б) поведение: правка в generated/: не заблокировано (нужен exit 2 и `make codegen` в stderr или JSON deny с `make codegen` в причине; получен exit 0) | - (б) поведение: новый файл во вложенном каталоге generated/: не заблокировано (нужен exit 2 и `make codegen` в stderr или JSON de ...

### Accepted forms: registration check and grounding (each started the documented way)
- exec E1: accepted by check: True; spawned without shell: exit 2 (hook ran)
- exec E2: accepted by check: True; spawned without shell: exit 2 (hook ran)
- exec E3: accepted by check: True; spawned without shell: exit 2 (hook ran)
- shell `"$CLAUDE_PROJECT_DIR"/.claude/hooks/protect_generated.py`: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)
- shell `"${CLAUDE_PROJECT_DIR}"/.claude/hooks/protect_generated.py`: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)
- shell `"$CLAUDE_PROJECT_DIR/.claude/hooks/protect_generated.py"`: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)
- shell `"${CLAUDE_PROJECT_DIR}/.claude/hooks/protect_generated.py"`: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)
- shell `python3 "$CLAUDE_PROJECT_DIR"/.claude/hooks/protect_generated.py`: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)
- shell `python3 "${CLAUDE_PROJECT_DIR}"/.claude/hooks/protect_generated.py`: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)
- shell `python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/protect_generated.py"`: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)
- shell `python3 "${CLAUDE_PROJECT_DIR}/.claude/hooks/protect_generated.py"`: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)
- shell `python3 -I "$CLAUDE_PROJECT_DIR"/.claude/hooks/protect_generated.py`: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)
- shell `python3 -I "${CLAUDE_PROJECT_DIR}"/.claude/hooks/protect_generated.py`: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)
- shell `python3 -I "$CLAUDE_PROJECT_DIR/.claude/hooks/protect_generated.py"`: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)
- shell `python3 -I "${CLAUDE_PROJECT_DIR}/.claude/hooks/protect_generated.py"`: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)

### Rejected forms, started the same way
- quoted spelling with args: []: accepted: False; spawned without shell: cannot start (FileNotFoundError)
- relative .claude/... (exec): accepted: False; spawned without shell: cannot start (FileNotFoundError)
- bare $CLAUDE_PROJECT_DIR in exec form: accepted: False; spawned without shell: cannot start (FileNotFoundError)
- relative .claude/... (shell): accepted: False; sh -c exit 127 (hook did not run: /bin/sh: .claude/hooks/protect_generated.py: No such file or directory); bash -c exit 127 (hook did not run: /bin/bash: .claude/hooks/protect_generated.py: No such file or directo)
- relative ./.claude/... (shell): accepted: False; sh -c exit 127 (hook did not run: /bin/sh: ./.claude/hooks/protect_generated.py: No such file or directo); bash -c exit 127 (hook did not run: /bin/bash: ./.claude/hooks/protect_generated.py: No such file or direc)
- relative python3 .claude/... (shell): accepted: False; sh -c exit 2 (hook did not run: /opt/homebrew/Cellar/python@3.12/3.12.13/Frameworks/Python.framework/V); bash -c exit 2 (hook did not run: /opt/homebrew/Cellar/python@3.12/3.12.13/Frameworks/Python.framework/V)
- unquoted $CLAUDE_PROJECT_DIR (shell): accepted: False; sh -c exit 127 (hook did not run: /bin/sh: /var/folders/hk/s_gx2n951mz9y880jjgfwntm0000gn/T/ground-0ziko); bash -c exit 127 (hook did not run: /bin/bash: /var/folders/hk/s_gx2n951mz9y880jjgfwntm0000gn/T/ground-0zi)

### Whitespace around the accepted shell spelling (A4, A5: re.fullmatch after trimming space/tab/LF only)
- leading space: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)
- leading tab: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)
- leading LF: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)
- trailing LF: accepted: True; sh -c exit 2 (hook ran); bash -c exit 2 (hook ran)
- leading NBSP: accepted: False; sh -c exit 127 (hook did not run: /bin/sh:  /var/folders/hk/s_gx2n951mz9y880jjgfwntm0000gn/T/ground-0zik); bash -c exit 127 (hook did not run: /bin/bash:  /var/folders/hk/s_gx2n951mz9y880jjgfwntm0000gn/T/ground-0z)
- leading VT: accepted: False; sh -c exit 127 (hook did not run: /var/folders/hk/s_gx2n951mz9y880jjgfwntm0000gn/T/ground-0ziko4e4/proj ); bash -c exit 127 (hook did not run: /var/folders/hk/s_gx2n951mz9y880jjgfwntm0000gn/T/ground-0ziko4e4/proj )
- leading CR: accepted: False; sh -c exit 127 (hook did not run: /var/folders/hk/s_gx2n951mz9y880jjgfwntm0000gn/T/ground-0ziko4e4/proj ); bash -c exit 127 (hook did not run: /var/folders/hk/s_gx2n951mz9y880jjgfwntm0000gn/T/ground-0ziko4e4/proj )
- trailing CR: accepted: False; sh -c exit 127 (hook did not run: : No such file or directory); bash -c exit 127 (hook did not run: : No such file or directory)
- `python3 ` spelling, leading NBSP: accepted: False; sh -c exit 127 (hook did not run: /bin/sh:  python3: command not found); bash -c exit 127 (hook did not run: /bin/bash:  python3: command not found)
- `python3 ` spelling, trailing CR: accepted: False; sh -c exit 2 (hook did not run: /opt/homebrew/Cellar/python@3.12/3.12.13/Frameworks/Python.framework/V); bash -c exit 2 (hook did not run: /opt/homebrew/Cellar/python@3.12/3.12.13/Frameworks/Python.framework/V)
- `python3 -I ` spelling, leading NBSP: accepted: False; sh -c exit 127 (hook did not run: /bin/sh:  python3: command not found); bash -c exit 127 (hook did not run: /bin/bash:  python3: command not found)
- `python3 -I ` spelling, trailing CR: accepted: False; sh -c exit 2 (hook did not run: /opt/homebrew/Cellar/python@3.12/3.12.13/Frameworks/Python.framework/V); bash -c exit 2 (hook did not run: /opt/homebrew/Cellar/python@3.12/3.12.13/Frameworks/Python.framework/V)
```

## Quizzes (2.1 scorer, real keys; `*-reserve` = data/reserve pools)

Random and adaptive runs use 200k trials each. Multiple-choice questions are drawn from the 10 key-possible subsets.

```text
#### quiz L1 (passScore 0.8)
- rules: 6 questions (4 single, 2 multiple); single correct positions {'b': 1, 'd': 1, 'a': 1, 'c': 1} (max share 25% <= 40%); uniquely-longest correct in 0 question(s) (<= 1); max/min option length ratio 1.22; ids unique, 4 options each, `correct` sizes valid
- empty answers: score 0.00
- key: score 1.00
- always 'a': score 0.17 (below passScore)
- always 'b': score 0.17 (below passScore)
- always 'c': score 0.17 (below passScore)
- always 'd': score 0.17 (below passScore)
- always longest option: score 0.00 (below passScore)
- analytic random pass (single 1/4, multiple 1/10, need 5/6): 0.1211% per attempt; over 3 attempts 0.3628%
- Monte Carlo 200000 trials: 0.1165% (analytic 0.1211%, |diff| = 0.59 SE, must be <= 3)
- adaptive 'random first, change two answers, keep if score rose', 3 attempts, 200000 trials: 0.4245%
- 4th submission (the revealed key) after 3 failed: refused (quiz closed after reveal: submission refused, not scored)

#### quiz L1-reserve (passScore 0.8)
- rules: 6 questions (4 single, 2 multiple); single correct positions {'b': 1, 'c': 1, 'a': 1, 'd': 1} (max share 25% <= 40%); uniquely-longest correct in 1 question(s) (<= 1); max/min option length ratio 1.25; ids unique, 4 options each, `correct` sizes valid
- empty answers: score 0.00
- key: score 1.00
- always 'a': score 0.17 (below passScore)
- always 'b': score 0.17 (below passScore)
- always 'c': score 0.17 (below passScore)
- always 'd': score 0.17 (below passScore)
- always longest option: score 0.00 (below passScore)
- analytic random pass (single 1/4, multiple 1/10, need 5/6): 0.1211% per attempt; over 3 attempts 0.3628%
- Monte Carlo 200000 trials: 0.1140% (analytic 0.1211%, |diff| = 0.91 SE, must be <= 3)
- adaptive 'random first, change two answers, keep if score rose', 3 attempts, 200000 trials: 0.4065%
- 4th submission (the revealed key) after 3 failed: refused (quiz closed after reveal: submission refused, not scored)

#### quiz L2 (passScore 0.8)
- rules: 5 questions (3 single, 2 multiple); single correct positions {'c': 1, 'a': 1, 'b': 1} (max share 33% <= 40%); uniquely-longest correct in 0 question(s) (<= 1); max/min option length ratio 1.28; ids unique, 4 options each, `correct` sizes valid
- empty answers: score 0.00
- key: score 1.00
- always 'a': score 0.20 (below passScore)
- always 'b': score 0.20 (below passScore)
- always 'c': score 0.20 (below passScore)
- always 'd': score 0.00 (below passScore)
- always longest option: score 0.20 (below passScore)
- analytic random pass (single 1/4, multiple 1/10, need 4/5): 0.4375% per attempt; over 3 attempts 1.3068%
- Monte Carlo 200000 trials: 0.3940% (analytic 0.4375%, |diff| = 2.95 SE, must be <= 3)
- adaptive 'random first, change two answers, keep if score rose', 3 attempts, 200000 trials: 1.4405%
- 4th submission (the revealed key) after 3 failed: refused (quiz closed after reveal: submission refused, not scored)

#### quiz L2-reserve (passScore 0.8)
- rules: 6 questions (4 single, 2 multiple); single correct positions {'a': 1, 'b': 1, 'c': 1, 'd': 1} (max share 25% <= 40%); uniquely-longest correct in 1 question(s) (<= 1); max/min option length ratio 1.15; ids unique, 4 options each, `correct` sizes valid
- empty answers: score 0.00
- key: score 1.00
- always 'a': score 0.17 (below passScore)
- always 'b': score 0.17 (below passScore)
- always 'c': score 0.17 (below passScore)
- always 'd': score 0.17 (below passScore)
- always longest option: score 0.17 (below passScore)
- analytic random pass (single 1/4, multiple 1/10, need 5/6): 0.1211% per attempt; over 3 attempts 0.3628%
- Monte Carlo 200000 trials: 0.1340% (analytic 0.1211%, |diff| = 1.66 SE, must be <= 3)
- adaptive 'random first, change two answers, keep if score rose', 3 attempts, 200000 trials: 0.4275%
- 4th submission (the revealed key) after 3 failed: refused (quiz closed after reveal: submission refused, not scored)

#### quiz L3 (passScore 0.8)
- rules: 5 questions (3 single, 2 multiple); single correct positions {'c': 1, 'a': 1, 'd': 1} (max share 33% <= 40%); uniquely-longest correct in 1 question(s) (<= 1); max/min option length ratio 1.15; ids unique, 4 options each, `correct` sizes valid
- empty answers: score 0.00
- key: score 1.00
- always 'a': score 0.20 (below passScore)
- always 'b': score 0.00 (below passScore)
- always 'c': score 0.20 (below passScore)
- always 'd': score 0.20 (below passScore)
- always longest option: score 0.00 (below passScore)
- analytic random pass (single 1/4, multiple 1/10, need 4/5): 0.4375% per attempt; over 3 attempts 1.3068%
- Monte Carlo 200000 trials: 0.4180% (analytic 0.4375%, |diff| = 1.32 SE, must be <= 3)
- adaptive 'random first, change two answers, keep if score rose', 3 attempts, 200000 trials: 1.5130%
- 4th submission (the revealed key) after 3 failed: refused (quiz closed after reveal: submission refused, not scored)

#### quiz L3-reserve (passScore 0.8)
- rules: 6 questions (4 single, 2 multiple); single correct positions {'a': 1, 'b': 1, 'c': 1, 'd': 1} (max share 25% <= 40%); uniquely-longest correct in 1 question(s) (<= 1); max/min option length ratio 1.19; ids unique, 4 options each, `correct` sizes valid
- empty answers: score 0.00
- key: score 1.00
- always 'a': score 0.17 (below passScore)
- always 'b': score 0.17 (below passScore)
- always 'c': score 0.17 (below passScore)
- always 'd': score 0.17 (below passScore)
- always longest option: score 0.17 (below passScore)
- analytic random pass (single 1/4, multiple 1/10, need 5/6): 0.1211% per attempt; over 3 attempts 0.3628%
- Monte Carlo 200000 trials: 0.1175% (analytic 0.1211%, |diff| = 0.46 SE, must be <= 3)
- adaptive 'random first, change two answers, keep if score rose', 3 attempts, 200000 trials: 0.4260%
- 4th submission (the revealed key) after 3 failed: refused (quiz closed after reveal: submission refused, not scored)

#### quiz L5 (passScore 0.75)
- rules: 8 questions (6 single, 2 multiple); single correct positions {'a': 2, 'b': 2, 'c': 1, 'd': 1} (max share 33% <= 40%); uniquely-longest correct in 1 question(s) (<= 1); max/min option length ratio 1.95; ids unique, 4 options each, `correct` sizes valid
- empty answers: score 0.00
- key: score 1.00
- always 'a': score 0.25 (below passScore)
- always 'b': score 0.25 (below passScore)
- always 'c': score 0.12 (below passScore)
- always 'd': score 0.12 (below passScore)
- always longest option: score 0.12 (below passScore)
- analytic random pass (single 1/4, multiple 1/10, need 6/8): 0.1409% per attempt; over 3 attempts 0.4220%
- Monte Carlo 200000 trials: 0.1420% (analytic 0.1409%, |diff| = 0.13 SE, must be <= 3)
- adaptive 'random first, change two answers, keep if score rose', 3 attempts, 200000 trials: 0.4545%
- 4th submission (the revealed key) after 3 failed: refused (quiz closed after reveal: submission refused, not scored)

#### quiz L5-reserve (passScore 0.75)
- rules: 6 questions (4 single, 2 multiple); single correct positions {'a': 1, 'b': 1, 'c': 1, 'd': 1} (max share 25% <= 40%); uniquely-longest correct in 1 question(s) (<= 1); max/min option length ratio 1.20; ids unique, 4 options each, `correct` sizes valid
- empty answers: score 0.00
- key: score 1.00
- always 'a': score 0.17 (below passScore)
- always 'b': score 0.17 (below passScore)
- always 'c': score 0.17 (below passScore)
- always 'd': score 0.17 (below passScore)
- always longest option: score 0.17 (below passScore)
- analytic random pass (single 1/4, multiple 1/10, need 5/6): 0.1211% per attempt; over 3 attempts 0.3628%
- Monte Carlo 200000 trials: 0.1215% (analytic 0.1211%, |diff| = 0.05 SE, must be <= 3)
- adaptive 'random first, change two answers, keep if score rose', 3 attempts, 200000 trials: 0.4320%
- 4th submission (the revealed key) after 3 failed: refused (quiz closed after reveal: submission refused, not scored)

#### quiz L6 (passScore 0.8)
- rules: 6 questions (4 single, 2 multiple); single correct positions {'c': 1, 'a': 1, 'd': 1, 'b': 1} (max share 25% <= 40%); uniquely-longest correct in 1 question(s) (<= 1); max/min option length ratio 1.55; ids unique, 4 options each, `correct` sizes valid
- empty answers: score 0.00
- key: score 1.00
- always 'a': score 0.17 (below passScore)
- always 'b': score 0.17 (below passScore)
- always 'c': score 0.17 (below passScore)
- always 'd': score 0.17 (below passScore)
- always longest option: score 0.00 (below passScore)
- analytic random pass (single 1/4, multiple 1/10, need 5/6): 0.1211% per attempt; over 3 attempts 0.3628%
- Monte Carlo 200000 trials: 0.1205% (analytic 0.1211%, |diff| = 0.08 SE, must be <= 3)
- adaptive 'random first, change two answers, keep if score rose', 3 attempts, 200000 trials: 0.3960%
- 4th submission (the revealed key) after 3 failed: refused (quiz closed after reveal: submission refused, not scored)

#### quiz L6-reserve (passScore 0.8)
- rules: 6 questions (4 single, 2 multiple); single correct positions {'a': 1, 'b': 1, 'c': 1, 'd': 1} (max share 25% <= 40%); uniquely-longest correct in 1 question(s) (<= 1); max/min option length ratio 1.30; ids unique, 4 options each, `correct` sizes valid
- empty answers: score 0.00
- key: score 1.00
- always 'a': score 0.17 (below passScore)
- always 'b': score 0.17 (below passScore)
- always 'c': score 0.17 (below passScore)
- always 'd': score 0.17 (below passScore)
- always longest option: score 0.00 (below passScore)
- analytic random pass (single 1/4, multiple 1/10, need 5/6): 0.1211% per attempt; over 3 attempts 0.3628%
- Monte Carlo 200000 trials: 0.1340% (analytic 0.1211%, |diff| = 1.66 SE, must be <= 3)
- adaptive 'random first, change two answers, keep if score rose', 3 attempts, 200000 trials: 0.4275%
- 4th submission (the revealed key) after 3 failed: refused (quiz closed after reveal: submission refused, not scored)
```

## Deviations from the design and findings (for judge_content)
- **L3 scenario (revised 2026-10-28 on the orchestrator's instruction, my earlier finding).** Session a
  runs on `frontier` (Fable 5.1, $10/$50, cache read 2.5%), 16 turns. Session c is the same task on
  `mid` (Sonnet 5.5, $2/$10, cache read 5%), 48 turns: 5x cheaper per token, 3x the turns. Session b
  is unchanged (`mid`, 30 turns, cache miss at turn 21). The repricing field is renamed
  `a_repriced_on_mid_tier_usd`: a's tokens at `mid`, the tier session c used. Expected: a $0.7282,
  b $0.6532, c $0.9202, a on mid $0.1614, so `cheaper_per_task` = a. Every expected dollar value is
  >= $0.10, so the $0.001 floor never binds (asserted). Every listed pricing error misses every
  numeric field by >= 10.8% (tolerance 1%). The first run had used `large`/`small` and the floor bound
  on one field; that version is superseded and its record replaced below. The reserve item
  (`data/reserve/cost-estimate.yaml`) now reprices at `mid` as well ($0.2222).
- **L6 matcher (C3 fix) deviates from the design**: the design allowed regex matchers evaluated "per
  the documented matcher rules" and a matcher that also covers Read. Now only a plain list of names is
  accepted. Regexes are out because Claude Code evaluates them as JavaScript and the grader cannot
  judge those. Read is out because the hook would then block reads of `generated/`, which the policy
  allows.
- **L6 single-hook rule (C4/C5)** is new in both L6 checks: `.claude/settings.json` and
  `.claude/settings.local.json` together may hold exactly one hook, the PreToolUse registration.
- **L1 key format**: `routing_key.json` now lists `accept` alternatives per card. Each is a product of
  tier, effort and deployment lists, and a card is right when any alternative matches. core-refactor
  accepts frontier x {high, xhigh, max} or large x {medium, high, xhigh, max} (7 combinations);
  offline-audit accepts {large, mid, small} x {low, medium, high} x local (9). frontier+medium stays
  rejected. Largest set is 9 (<= 12); constant answers still score at most 2 of 6.
- **L2 grader redesign (C1/C2/D5/D8)**: four runs per check (two mixed, one errors, one max-turns,
  shuffled), random tool counts, unknown/denied/server-error calls at random positions. The run must
  reach its final turn. After Result the grader waits up to 3 s for the tool-server relay to close.
  Failure lines say "[прогон N]", never a scenario name.
- **L3 levers**: no longer graded by `cost-estimate` (Stepan's decision). `checks/data/lever_key.json`
  keeps the reasonable levers per session for the mentor's walk-through: a
  {lower-effort-shorter-output}, b {avoid-idle-gaps, fresh-session}, c {fresh-session}.
- **L3 cache TTL in the logs**: the logs are API-priced, so the miss uses about 5 minutes (theory: about 5
  min on the API). Turn 9 of b has a 240 s pause and still reads from cache (a decoy). Turn 21 has a
  2900 s pause and misses.
- **L4 skip-and-double figure**: the design says 1/216 (0.46%). The exact enumeration for "skip
  polluted-session, double bloat-tool-read" gives 1/288 (0.347%). The best allocation is still exactly
  1/108, so the design's bound holds.
- **L4 transcript** is 380 lines (design ~380-420). Line 57 (the task.md format example) is filler about
  pagination, more than 20 lines from any bug.
- **L1 adaptive attack**: 0.000% within 10 submissions for 20k learners. The key sets are 2-9 combinations
  per card (design: up to 12). Uncapped median is 77 submissions (p10 45, p90 125), inside the design's
  "about 30-200". Blind random: 0 of 20k. The bisection simulation gives the attacker oracle knowledge of
  reverted values, which makes it an upper bound.
- **L2 contract**: message shape aligned with the theory example (`{"role":"user","text":...}`, the turn
  dict appended as returned, `{"type":"tool_result","id","content","is_error"}`), documented in the
  `harness.py` docstring and README. `tools/call` text = `text` items joined with `\n`. The grader returns
  two items per call, so the join is exercised.
- **L2 quiz Monte Carlo**: 2.95 SE from analytic, inside the 3-SE bar but close. The other 9 quiz files
  are at or below 1.66 SE.
- **L6 hook, malformed input**: besides exit 2 (and any non-zero exit with `onFailure: "block"`), the check
  also accepts exit 0 with a JSON deny, because that blocks too in Claude Code. The design table names
  exit 2 only.
- **L6 grounding observation**: the rejected `python3 .claude/...` (relative) and `python3 "..."<CR>`
  spellings exit 2 under `sh -c`/`bash -c` because python3 exits 2 on "can't open file". The hook did not
  run (no `make codegen` in stderr). In Claude Code such a registration would block every Edit/Write
  instead of failing open. It is still rightly rejected.
- **L6 path rules that never match**: `Write(...)`, `MultiEdit(...)`, `NotebookEdit(...)` and `Glob(...)` are
  accepted and never match, as research-l6 section 1 quotes from the permissions docs ("`Write(path)`,
  `NotebookEdit(path)`, and `Glob(path)` rules never match"; legacy `MultiEdit` likewise). Checked:
  each of them added next to the reference's Edit deny -> exit 0 with the note "rule accepted by Claude
  Code but never matches"; each used instead of the Edit deny -> exit 1, "файл в src/invoices/generated/
  можно править (исход: allow)".
- **L6 evaluator** also reads `.claude/settings.local.json` and merges its rules: a bare `Bash` allow
  hidden there is caught.
- **L5** rejects a `.claude/CLAUDE.md` or `CLAUDE.local.md` without `@AGENTS.md`: either one stops CC
  2.1.311 from reading AGENTS.md under default settings. The overlap normalization is spelled out in the
  failure message.
- Learner-facing check messages are Russian (course language), and field paths, comments and docstrings
  are English. Two L6 messages keep the design's English wording verbatim ("ignored by Claude Code since
  v2.1.257 ...", "rule accepted by Claude Code but never matches", "unsupported rule form for this
  exercise").

## Flagged items for Stepan

### F1. W2: mentor scope (platform requirement for #11; exception to docs/learning-process.md section 3)
(a) The "never imply which item is wrong" rule covers keyed, enumerable items: quiz questions, bug-hunt
reports, L1 cards and L3 enum fields. For code and artifact checks (L2 harness, L4 plan, L5 AGENTS.md,
L6 settings and hook) the mentor may point at the learner's own code at direction level, within the
feedback the check already showed. (b) After a pass the mentor may use the key and per-item results.
(c) Asked for "скелет" or "скажи прямо" before closure, the mentor says those levels open once the check
is closed, and why: earlier they would reveal the key. The lesson-author's task.md files already state
this per lesson. It deviates from the hint ladder in learning-process.md section 3, so it needs your
decision.

### F2. Open decision: cumulative guess rate over the attempt cap
Per attempt every check is below 1%. Over the cap, measured on the real keys:
- quizzes, analytic over 3 attempts: L1 0.363%, L2 1.307%, L3 1.307%, L5 0.422%, L6 0.363%. The
  adaptive "change two answers, keep if the score rose" strategy over 3 attempts: L1 0.42%, L2 1.44%,
  L3 1.51%, L5 0.45%, L6 0.40%.
- bug-hunt: 1/108 = 0.926% per attempt, 2.752% over 3.
- L3 `cost-estimate` enum fields. **Decided by Stepan 2026-10-28: `lever` is dropped from the check**
  (cost-quiz Q2 and the mentor assess it). History: before the C8 fix, coordinate search on the
  aggregate count passed 17.4% in my simulation and 25 of 30 in the student run. With a joint
  pass/fail, enumerating the three lever fields alone would still have passed 29.0% within the cap.
  The remaining enum part (`largest_component.a/.b/.c`, `cheaper_per_task`) is 54 combinations with 1
  accepted: a blind guess passes 1.85% per submission and 18.52% within 10. Both fields follow from
  the component costs the learner must compute anyway, so the check's real evidence is the
  arithmetic (numbers within 1%, not guessable). `checks/data/lever_key.json` is kept as mentor data
  only; the grader does not read it.
Options are in design section 10 item 10 (bug-hunt cap 1; mcp-quiz and cost-quiz with 3 multiple of 5).
The judges recommended keeping things as they are.

### Other open items
1. **Exec bit on the two hook files: closed** (Stepan's chmod; both files mode 755, E1 passes as committed). History: The repo's `bash-code-guard.sh` blocks
   every shell write under a `.claude/hooks/` path, including `course/.../starter/.claude/hooks/`, and the
   Write tool cannot set a mode. Both `06-permissions-security/starter/.claude/hooks/protect_generated.py`
   and `checks/reference/.claude/hooks/protect_generated.py` are mode 644. task.md says the skeleton ships
   with the exec bit, and with E1 (the registration task.md shows) the check fails the learner with
   "нет бита исполнения". I did not try to get around the guard. Fix, from the worktree in your own
   terminal: `chmod 755` on both files, then `git add` (git records the mode). All L6 runs above set the
   bit in their temp copies and are labelled as such. The run "as committed" shows the failure. A guard
   change (the path is pipeline core only at the repo root) would be a PIPELINE task.
2. 2.5.3 (separate uid, no grader `/proc` visibility) cannot be demonstrated locally; open runner
   requirement for #08.
3. The rubric blind grading (2.4 rubric step 2) is the student agent's job. The sets are ready in
   `04-context-and-planning/checks/reference/rubric-demo/` and `05-memory-agents-md/checks/reference/rubric-demo/`
   (each with a README: rename to artifact-1..N, shuffle, add the empty starter file and the reference).
4. E1 (L4 time split) is for the student honest run.
5. Grounding ran on bash 3.2 as `sh` and as `bash`. A Linux workspace image probably has dash as
   `/bin/sh`: rerun the "Accepted/Rejected forms" and whitespace blocks there when #07/#08 exist.
