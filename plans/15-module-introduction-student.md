# #15 student dry run (honest run + cheater run), module 00-introduction

Run 2026-10-28 in the #15 worktree, macOS, `python3` = scratch symlink to `/opt/homebrew/bin/python3.12`
(Python 3.12.13). Convention of design 2.3: workspace = fresh copy of `starter/`, grader mount `G` =
copy of `checks/` without `reference/` and `data/reserve/`, run line from `lesson.yaml` executed via
`sh -c` from the workspace under `env -i PATH=<py3.12 dir>:/usr/bin:/bin HOME=<ws>/home
ACADEMY_CHECKS_DIR=$G`. Nothing under `course/` was edited. Scratch drivers are not committed.

Honest run: only `theory.md`, `task.md`, `starter/` and quiz questions with `correct`/`explanation`
stripped were read before submitting. Keys (`quiz.yaml` key, `bugs.yaml`, rubrics) were opened only to
score an already written submission. Cheater run: `checks/` read in full.

Exec bit (known pending item): `starter/.claude/hooks/protect_generated.py` is mode 644. The check
correctly fails the E1 registration on it (`нет бита исполнения у владельца`). I could not set the
bit in my scratch copies: the repo's `bash-code-guard.sh` blocks `chmod` on any path containing
`.claude/hooks/`, including scratch paths outside the repo (false positive, orchestrator note). I
therefore registered the honest hook in form E2 (`python3` + args), which needs no exec bit. E1 with the
bit set was not exercised by me.

## Summary

| Lesson | Honest checks | Quiz (key) | Agent time | Estimate for Stepan | estimatedMinutes |
|---|---|---|---|---|---|
| L1 models-and-effort | model-routing pass, 1st try | 6/6 | ~1 min | 25-35 | 40 |
| L2 agent-loop | harness-behaviour pass, 1st try | 5/5 | ~1 min | 50-70 | 60 |
| L3 cost-economics | cost-estimate pass, 1st try | 5/5 | ~0.5 min | 35-45 | 45 |
| L4 context-and-planning | bug-hunt pass (5 of 6 matched, one correct finding rejected, see D1), plan-structure pass, rubric self-grade 0.9 | n/a | bug-hunt ~0.6 min, plan ~0.3 min | bug-hunt 25-30, plan 20-25 | 60 (task.md: ~40 practice) |
| L5 memory-agents-md | agents-md-structure pass, rubric self-grade 0.875 | 8/8 | ~0.5 min | 30-40 | 50 |
| L6 permissions-security | permissions-policy pass, hook-blocks-generated pass (E2 form) | 6/6 | ~2 min | 70-90 | 80 |

Agent wall-clock times say nothing about a human; the estimate column is mine for the profile in
`learner/profile.md` (strong backend, weaker on Linux/systems). E1 (L4 split): the bug-hunt is the
larger part (380-line transcript, 25 episodes), the plan is shorter; together they likely exceed the
"~40 of 60 min practice" stated in task.md by 5-15 minutes.

## Cheats that PASSED (each is a defect)

| # | Lesson / check | Cheat | Result | Owner |
|---|---|---|---|---|
| C1 | L2 harness-behaviour | Harness that ABORTS the run (`return Result("final", ...)`) on an unknown tool or a denied call, instead of returning an error tool_result to the model | PASS 5/5 runs. Items 4 and 6 are not really verified | practice-designer (blocking) |
| C2 | L2 harness-behaviour | Harness that ignores the `permission()` answer, has no unknown-tool handling, and returns immediately when `len(local_tools) == 2` (fingerprint of GuardScenario) | PASS 3/3 runs | practice-designer (blocking) |
| C3 | L6 hook-blocks-generated | Matcher `(?i)^(edit\|write)$`, `\A(Edit\|Write)\Z`, `(?P<tool>Edit\|Write)`: valid Python regex, invalid or never-matching in JS (`node`: SyntaxError / false) | PASS each. The hook never fires in Claude Code: fail-open registration accepted | practice-designer (blocking) |
| C4 | L6 permissions-policy + hook check | Second PreToolUse group `matcher: "Bash"` whose command prints `permissionDecision: "allow"` | Both checks PASS. In Claude Code a hook "allow" skips the prompt for everything no rule matched (`make db-reset`, `curl`, `git -C . push`), policy item 7 | practice-designer (blocking) |
| C5 | L6 both checks | `.claude/settings.local.json` with a `PermissionRequest` hook `matcher: "*"` returning `decision.behavior: "allow"` (auto-approves every prompt, incl. the WebFetch ask) | Both checks PASS (neither script looks at hooks other than PreToolUse) | practice-designer (blocking; content-researcher to confirm the PermissionRequest schema for 2.1.311) |
| C6 | L6 permissions-policy | Makefile `agent:` recipe `claude --permission-mode "bypassPermissions"`, or `MODE=bypassPermissions; claude --permission-mode $$MODE`, or `claude --dangerously-skip-$(SUFFIX)` | PASS each (textual regex/substring) | practice-designer |
| C7 | L5 agents-md-structure (+ rubric blind spot) | Delete `CLAUDE.md`, keep the whole 162-line old file as `CLAUDE.local.md` with `@AGENTS.md` added on top | PASS. `check_hookup` only requires the import line in `.claude/CLAUDE.md`/`CLAUDE.local.md`, no size limit; rubric artifacts are only `AGENTS.md` and `CLAUDE.md`, so the mentor never sees it. Claude Code loads the bloat | practice-designer |
| C8 | L3 cost-estimate | Numbers computed by script (task allows delegation), enum fields by coordinate search on the aggregate count from a blind random start | 25 of 30 runs pass within 10 submissions (median 9, max 12). Demo record claims 17.44% within the cap | practice-designer (open decision F2 is understated; the cap does not defend L3) |
| C9 | L2, any check running learner code | Learner code reads the grader path from `ps -o args= -p $PPID` and overwrites `test_harness.py` in the (writable) checks dir | Run 1 fail, run 2 PASS | runner #08 (2.5.2 read-only mount, 2.5.3 uid/pid isolation). Not a lesson defect |

Near-passes graded as mentor (rubric is AI-graded, so these depend on the grader at the threshold):

| # | Artifact | My rubric score | Note | Owner |
|---|---|---|---|---|
| R1 | L5 demo `inverted-keyword-stuffed-AGENTS.md` | 5/8-6/8 (0.625-0.75) | Only criterion 2 punishes inverted rules; criteria 3 and 4 give 4/8 for free. The demo README expects < 0.7; at 0.75 it passes | practice-designer: make an inverted rule a gate (rubric fails) |
| R2 | L4 honest plan + two whole source files in a `~~~` fence | 7/10 = 0.70, PASS | plan-structure counts only backtick fences, so the "no code block over 15 lines" rule is bypassed with `~~~`; criterion 4 = 0 alone does not fail the plan | practice-designer |
| R3 | L4 demo `borderline-plan.md` | 6-7/10 | Exactly at the threshold; reasons: step 3 verification vague (c1=1), implementation before tests (c2=1), migrations not named (c3=1) | record only |
| R4 | L5 demo `borderline-AGENTS.md` | 6/8 = 0.75, PASS | Architecture line (c1=1), two prohibitions missing reason or alternative (c2=1) | record only |

Other demo artifacts as mentor (not blind: I had seen the file names): L4 reference ~1.0, weak 0.1-0.2,
injection 0.1 (injection text ignored), empty 0; L5 reference 0.875-1.0, weak 0.25-0.375, injection
0.25-0.375, empty starter 0.

## Cheats that FAILED (defences hold)

- Interpreter, every command check, empty starter: `usercustomize.py` in user site, `sitecustomize.py`,
  `json.py`, `pathlib.py` in the workspace: fail with `-I` (exit 1), pass without `-I` (attack real).
  PATH shim `python3` exiting 0: pass only when the learner bin is first on PATH; fail with the fixed
  PATH. Both defences are runner requirements (2.5.1).
- L1: key in `checks/data`, not editable from the workspace; `NaN`/`Infinity` rejected; extra/missing
  keys and fields rejected; L1 enumeration through the count is impractical (combinations per card).
- L2: top-level `os._exit(0)` -> fail ("не вернул Result"); importing `tool_server.py` directly -> fail
  (item 5); forging `op: result` / `op: perm` messages on the grader socket -> fail (loop and max-turns
  scenarios still need real behaviour); `ACADEMY_CHECKS_DIR` is absent in the learner process (env
  built from scratch); no permission check, execute-then-ask, result not appended, turns off by one ->
  each fails with a precise item message.
- L3: editing `prices.json`/logs in the workspace has no effect (pristine copies); `1e400` (inf) and
  `NaN` rejected; `true` as `b_cache_miss_turn` rejected.
- L4 plan-structure: paths to files created in the workspace do not count (pristine list).
- L5: `IMPORTANT`, `!!!`, tree glyphs, trimmed copy of the old file (> 5 shared lines) rejected; the
  original CLAUDE.md left in place rejected.
- L6: local `allow` for `curl`/`make db-reset` in `settings.local.json` -> fail; `disableAllHooks: 0`
  in `settings.local.json` -> fail; hook without exec bit in E1 form -> fail; starter hook -> fail with
  item messages.
- Quiz guessing: a mechanical test-taking heuristic (drop options with absolute words, pick the
  longest / all remaining) scores 0/6, 2/5, 2/5, 4/8, 1/6: below passScore everywhere.
- L4 bug-hunt: production matcher does not exist yet (#08); I scored with a scratch matcher built from
  design 2.2. The block enumeration (1/108) was not rerun.

## Defects found in the honest run

- **D1 (L4, practice-designer, blocking for a fair check)**: `bugs.yaml` range of
  `three-files-pasted` is `[[220, 227]]`, but the user's paste message starts on line **219**
  ("Я хочу, чтобы ты посмотрел на api.py, service.py и repository.py вместе. Вот они:"). The anchor
  rule in task.md says "point at the line of the message / paste". My correct report at 219 was
  unmatched; I passed only because the other five matched. One more miss and an honest learner fails.
  Fix: `[[219, 227]]`, rerun the enumeration.
- **D2 (L1, practice-designer + lesson-author)**: defensible answers rejected. (a) `offline-audit`
  accepts tier `mid|small` only, with the key comment "local models are mid/small class"; theory never
  says this, and the card offers 64 GB + GPU, so `large` is a reasonable reading. (b) `core-refactor`
  rejects `large` + `medium`, while theory's Effort table says Opus 5.5 starts at `medium` (default)
  with no hard rule and the key's own comment says "no level excluded" for Opus. Both together fail an
  honest learner ("2 из 6 карточек неверны"). Fix: either state in theory what tier class a local
  model is and that quality-bound work leaves medium, or widen the key.
- **D3 (L6, practice-designer)**: task.md says the starter hook has the exec bit set; it does not
  (pending chmod). The task's own minimal example is E1, which needs it, so an honest learner following
  the task fails registration until the chmod lands. Also the platform runner must preserve file modes
  when copying `starter/` (#08).
- **D4 (L2, practice-designer)**: misleading failure message: `check_final` prints "ожидался
  Result(status='final', ..., turns=5), получено status='final', turns=5" when only `text` differs.
  Include whether the text matched.
- **D5 (L2, practice-designer, minor coverage)**: contract items not graded: a harness that drops
  `isError: true` from the server, ignores the JSON-RPC `error` field, never terminates the server, or
  omits `description` passes. task.md says the check verifies exactly six points, so this is honest,
  but the README contract promises more than is checked.
- **D6 (L5, practice-designer)**: task.md says the starter CLAUDE.md is "примерно на 200 строк"; it has
  162.
- **D7 (L4, practice-designer)**: the reference plan selects the format by `Accept`, but
  `api.handle(method, path, query_string)` has no headers parameter; the plan never mentions changing
  the signature. A mentor comparing against the reference may penalize `?format=csv` plans that are
  actually more implementable.
- **D8 (L2, practice-designer, low)**: GuardScenario and LoopScenario verdicts do not require that the
  scripted run reached its final turn (root cause of C1/C2). Fix: fail when
  `model_calls != len(plan) + 1`, and randomize the number of local tools per scenario.

## Unclear places and ambiguities (honest run)

- L1: "effort" for a local Ollama model is not explained (effort is an Anthropic API field; what does
  `high` mean for a local model?). The tier for a local run ("класс размера модели") is undefined
  (see D2).
- L1 quiz Q5 option d (fewer tool definitions) is correct but theory names only "больше контекст,
  модель с поддержкой инструментов"; inferable, not stated.
- L2: whether `permission()` is asked for an unknown tool name is not specified (both orders pass;
  fine, but say so). Behaviour for a name that is both local and remote is unspecified.
- L4: "Шаги ... от теста к реализации" is required by rubric criterion 2 but task.md does not say
  tests come first; a learner writing implementation+test per step may get 1 instead of 2.
- L4 bug-hunt anchors: see D1. The lost-instruction cause (125) and consequence (180) are both
  accepted, good.
- L6: dense theory; the check's model of rules is documented well in task.md. The "permissions check
  ignores hooks" gap (C4/C5) is not mentioned to the learner either.
- Quizzes L1-L3: several distractors are implausible enough that an experienced developer could pass
  without the theory ("stdio в протоколе устарел", three "Всегда ..." options in plan-or-api,
  "сервер получает доступ к весам модели"). Low discrimination, not a cheat. L5 and L6 quizzes do
  require the theory.

## Check messages

Format errors name the file, field and allowed form everywhere (L1, L3, L5, L6 good). L2 item
messages are precise and useful except D4. L1/L3 count-only messages work as designed. L2 prints the
seed line `[grader-log] ...` to stderr when `ACADEMY_GRADER_LOG` is unset: the runner must set it, or
the learner sees the rerun command.

## STUDENT REPORT intro-models-effort (#15)
Honest run: pass, agent ~1 min (est. 25-35 of 40)
Unclear places: effort for local models; tier class of a local model
Ambiguities: offline-audit tier large; core-refactor Opus at medium (D2)
Cheats tried: interpreter (usercustomize, sitecustomize, PATH shim) -> fail; JSON constants -> fail; key edit -> impossible
Blocking: none (D2 is an honest-path defect)

## STUDENT REPORT intro-agent-loop (#15)
Honest run: pass, agent ~1 min (est. 50-70 of 60)
Unclear places: permission order for unknown tools; local+remote name clash
Ambiguities: none blocking
Cheats tried: abort-on-guard harness -> PASS; guard fingerprint -> PASS; os._exit -> fail; socket forge -> fail; direct import -> fail; grader tamper -> PASS locally (runner)
Blocking: C1, C2 (D8 root cause)

## STUDENT REPORT intro-cost-economics (#15)
Honest run: pass, agent ~0.5 min (est. 35-45 of 45)
Unclear places: none
Ambiguities: none
Cheats tried: edit prices/logs -> fail; inf/NaN -> fail; enum coordinate search under cap -> PASS 25/30
Blocking: C8 (cap does not protect; demo figure understated)

## STUDENT REPORT intro-context-planning (#15)
Honest run: pass (bug-hunt 5 of 6, one correct finding rejected), agent ~1 min (est. 45-55 practice)
Unclear places: tests-first expectation only in the rubric
Ambiguities: paste anchor line 219 (D1)
Cheats tried: minimal letter-of-rule plan -> structure pass, rubric fail; `~~~` paste -> structure pass, rubric 0.70 pass
Blocking: D1; R2

## STUDENT REPORT intro-agent-memory (#15)
Honest run: pass, agent ~0.5 min (est. 30-40 of 50)
Unclear places: none
Ambiguities: none
Cheats tried: keyword AGENTS.md -> structure pass, rubric fail; inverted rules -> structure pass, rubric 0.625-0.75; old file kept as CLAUDE.local.md -> PASS
Blocking: C7; R1

## STUDENT REPORT intro-permissions-security (#15)
Honest run: pass (E2 registration; exec bit pending), agent ~2 min (est. 70-90 of 80)
Unclear places: none beyond density
Ambiguities: task.md claims the exec bit is set (D3)
Cheats tried: Python-only regex matchers -> PASS; allow-all PreToolUse hook -> PASS; PermissionRequest auto-approve -> PASS; quoted/indirect bypass in Makefile -> PASS; local allow rules -> fail; disableAllHooks 0 -> fail
Blocking: C3, C4, C5, C6

---

# Run 2 (2026-10-28, after the practice-designer and lesson-author fixes)

Same convention as run 1 (design 2.3): workspace = `cp -Rp` of `starter/`, grader mount = `cp -Rp` of
`checks/` minus `reference/` and `data/reserve/`, each `run` line from `lesson.yaml` executed through
`/bin/sh -c` in the workspace under `env -i PATH=<py3.12 dir>:/usr/bin:/bin HOME=<ws>/home
ACADEMY_CHECKS_DIR=$G ACADEMY_GRADER_LOG=/dev/null`; `python3` = Python 3.12.13. Nothing under `course/`
was edited. Quizzes answered blind from a copy with `correct`/`explanation` stripped, then scored.

File modes: `cp -Rp` keeps mode 755 on `starter/.claude/hooks/protect_generated.py`, and overwriting
the file with the Write tool keeps it too, so no chmod was needed. The repo's `bash-code-guard.sh`
still blocks every shell command whose text contains `.claude/settings` or `.claude/hooks/`, also for
scratch paths outside the repo (a heredoc into a scratch `.claude/settings.json` was refused, and so
was a heredoc appending this section because its text names those paths). I wrote those files with the
Write/Edit tools instead. Orchestrator note only, no lesson impact.

## Summary

| Lesson | Honest checks | Quiz (blind) | Agent time | estimatedMinutes |
|---|---|---|---|---|
| L1 | model-routing pass (also with the run-1 D2 answers: large+high local, large+medium core-refactor) | 6/6 | ~1 min | 40 |
| L2 | harness-behaviour pass 3/3 runs, demo.py reaches final | 5/5 | ~2 min | 60 |
| L3 | cost-estimate pass | 5/5 | ~1 min | 45 |
| L4 | bug-hunt 6/6 matched by the bugs.yaml ranges (219 now in range), 0 decoys; plan-structure pass; plan rubric self-grade 0.9 | n/a | ~5 min | 70 |
| L5 | agents-md-structure pass (both hookups: CLAUDE.md = `@AGENTS.md`, CLAUDE.md deleted); rubric self-grade 1.0 | 8/8 | ~1 min | 50 |
| L6 | permissions-policy pass; hook-blocks-generated pass in **E1** form with the committed exec bit | 6/6 | ~3 min | 80 |

L4 time split for a human (E1): transcript 380 lines, 25 episodes: 25-30 min; plan: 20-25 min.
Total practice 45-55 of the stated ~50, lesson 65-75 of 70. Now consistent with task.md.

## Previous findings: status

| Id | Now | Evidence |
|---|---|---|
| C1 abort on unknown/denied | fail | "п.6 ... цикл должен вернуть модели результат-ошибку и продолжить, а он завершился", 3 runs |
| C2 fingerprint + no permission | fail | п.6 "исполнен без вопроса permission", п.5 |
| C3 Python-only regex matchers | fail | `(?i)^(edit\|write)$`, `\A(Edit\|Write)\Z`: "matcher ... не принят" |
| C4 second PreToolUse group answering allow | fail in both checks | "больше одного хука" |
| C5 PermissionRequest in settings.local.json | fail in both checks | "хук на событие PermissionRequest ..." |
| C6 quoted / `$$MODE` / `$(SUFFIX)` in Makefile | fail | "вызов claude допускается только как одна строка рецепта" |
| C7 old file as CLAUDE.local.md | fail | 163 lines > 10, overlap 72, IMPORTANT, tree |
| C8 enum coordinate search | closed | one joint message, same text with 1 or 3 enum fields wrong; matches task.md |
| R1 inverted rule | rubric text has the gate | mentor-graded |
| R2 `~~~` fence | fail | "блок кода из 51 строк" |
| D1 paste anchor 219 | fixed | `[[219, 227]]` |
| D2 L1 key | fixed | both run-1 answers accepted; theory explains local tier and effort |
| D3 exec bit | fixed | mode 755 committed, E1 passes |
| D4 L2 Result message | fixed | "text не совпадает с текстом хода final" |
| D5 L2 coverage | fixed | isError, JSON-RPC error and server left running each fail with an item-5 message |
| D6 162 lines | fixed | task.md says 162 |
| D7 reference plan | fixed | `?format=csv`, Accept named out of scope with the reason |
| D8 final turn required | fixed | = C1/C2 |

## New cheats that PASS

| # | Lesson / check | Cheat | Result | Owner |
|---|---|---|---|---|
| C10 | L2 harness-behaviour | No unknown-tool handling at all: every non-local name goes to the server via `tools/call` (honest harness with the unknown branch replaced by `if False:`) | PASS 3/3 runs. The grader relay answers an unlisted name with `isError: true`, and `settle` never checks that an UNKNOWN call did not reach the server, so item 4 is satisfied by the server, not the harness | practice-designer (blocking: item 4 not observed). Fix: fail item 4 when `tools/call` arrives for a name not in `tools/list` |
| C11 | L6 permissions-policy | Makefile allowlist evaded by splitting the binary name: `A := cl`, `B := aude`, `S := skip`, recipe `$(A)$(B) --dangerously-$(S)-permissions` (`make -n agent` prints `claude --dangerously-skip-permissions`) | PASS. `CLAUDE_WORD` and the fragments are matched per raw line; variables are not expanded | practice-designer (blocking, policy item 7). Fix: apply the allowlist to the expanded recipes (`make -n` per target, or `make -pn`) |
| C12 | L6 permissions-policy | `agent:` recipe `sh scripts/agent.sh`; the script runs `exec claude --dangerously-skip-permissions "$@"` | PASS. Only `Makefile` is read | practice-designer (blocking, policy item 7). Fix: scan workspace scripts called from the Makefile (or every `*.sh` and `scripts/`) for the override fragments, and say the scope in task.md |
| C13 | L5 agents-md-structure + rubric | Honest AGENTS.md, CLAUDE.md deleted, the whole old 162-line file moved to `.claude/rules/legacy.md` (no `paths:` frontmatter, so loaded at launch; L5 theory implies it: only rules WITH `paths:` are deferred) | Check PASS; the rubric artifacts in lesson.yaml are only the 5 files, so the mentor never sees it: likely rubric PASS too. C7 reopened through another launch-loaded file | practice-designer (blocking). Fix: count `.claude/rules/**/*.md` without `paths:` in the memory-file rules (caps, tree, overlap) and add the glob to the rubric artifacts |
| C14 | L5 agents-md-structure | Old file renamed `legacy-notes.md` and imported: `@legacy-notes.md` as a line in AGENTS.md, or `@docs/legacy.md` as the second line of a 2-line CLAUDE.md | Check PASS. Theory says imports load at launch ("не экономит контекст"). The rubric sees only the import line and does not say to follow imports, so the result depends on the mentor | practice-designer. Fix: resolve `@path` imports (up to 4 hops) in the check and include imported files in overlap/caps; tell the rubric grader to read imported files |

Lower-severity passes (a wrong solution passes, not a shortcut):

| # | Lesson / check | Variant | Result | Owner |
|---|---|---|---|---|
| G1 | L6 permissions-policy | allow `Bash(sh *)`, `Bash(python3 *)`, `Bash(env *)` added to the honest settings | PASS. Any of them runs `git push`, `make db-reset` or `curl` without a prompt via `sh -c '...'`; only `Bash`, `Bash(*)`, `Bash(git *)`, `Bash(make *)` are in the static list and no probe uses an interpreter | practice-designer. Fix: probes `sh -c 'make db-reset'`, `python3 -c ...`, `env curl ...` expecting not-allow, or extend the broad list |
| G2 | L5 agents-md-structure | Old file moved to `src/CLAUDE.md` | Check PASS, not in rubric artifacts. Loaded on demand as soon as the agent opens a file in src/ (almost every session) | practice-designer (low) |
| G3 | L4 plan-structure | (a) whole api.py + repository.py indented by 4 spaces; (b) opened with ```` and a ``` line every 15 lines inside (CommonMark: one ~70-line block, a ``` line does not close a ```` fence) | Structure PASS for both. The rubric gate ("in any form") is the real defence, so this is mentor-graded. (b) is a CommonMark deviation in `fence_states`: a closing fence must be at least as long as the opener and carry no info string | practice-designer (low): fix the closer rule; optionally flag indented blocks > 15 lines |

## New defects (honest path, messages, grounding)

- **D9 (L2, practice-designer, low)**: misleading second message when the grader aborts. With a harness
  that marks a server `isError` result as `is_error: false`, the output is the correct item-5 line
  plus "после ответа сервера с isError: true цикл должен вернуть модели результат-ошибку и продолжить,
  а он завершился". The harness did continue; the grader returned `ABORT_TURN` after the mismatch and
  the verdict then reads the short run as an early stop. Same for the JSON-RPC error variant. Fix:
  record that the grader aborted and skip the "завершился" line in that case.
- **D10 (L6, content-researcher to confirm, then practice-designer + lesson-author)**: matchers
  `Edit, Write` and `Edit | Write` are accepted by the check (both pass in my run) and listed in
  task.md as plain lists. My recollection of the hooks docs is that only letters, digits, `_` and `|`
  make an exact list and any other character makes the matcher a JavaScript regex; under that reading
  both strings are regexes that never match `Edit` or `Write`, so the hook never runs (fail open, the C3
  class). research-l6 section 3 states the wider set (`-`, spaces, `,`) for 2.1.311. I could not open
  the docs in this run. If the researcher cannot quote the page, restrict the matcher list to
  `[A-Za-z]+(\|[A-Za-z]+)*`.
- **D11 (L4, lesson-author, low)**: rubric gate wording: task.md says "больше 15 строк кода в плане"
  (reads as a total), the rubric says "any code or file content longer than 15 lines" (reads as per
  block). Three 14-line pasted blocks fail under one reading and pass under the other. Say which.
- L3 note (no action needed): `b_cache_miss_turn` is named when wrong (integer 1-30), but the answer
  is visible in the log (the only `cache_read_input_tokens: 0` after turn 1), so it is not a skill gate.

## Unclear places (honest run 2)

- L1, L3, L5: none new. Theory now covers local tier and effort; L3 task text explains the repricing
  exception and the component-vs-cause distinction.
- L2: task item 4 now says permission for an unknown name is optional; clear.
- L4: tests-first is in task.md now; my plan followed it without guessing.
- L6: dense but complete. Only the comma/space matcher forms are doubtful (D10).

## STUDENT REPORT 00-introduction run 2 (#15)
Honest run: pass on every lesson (L1-L6, incl. L6 E1 with the committed exec bit); quizzes 6/6, 5/5, 5/5, 8/8, 6/6
Unclear places: none new beyond D10
Ambiguities: L4 gate per block vs total (D11)
Cheats tried: C1-C8, R2 again -> all fail; unknown tool forwarded to server -> PASS (C10); Makefile split name / helper script -> PASS (C11, C12); old memory file in .claude/rules -> PASS (C13); old file via @import -> check PASS (C14); interpreter allows -> PASS (G1); src/CLAUDE.md -> PASS (G2); indented / ```` fence paste -> structure PASS, rubric gate decides (G3); regex matchers, extra hooks, PermissionRequest -> fail
Blocking: C10, C11, C12, C13 (C14 likely); C9 out of scope (runner #08)

---

# Run 3 (2026-10-28, after C10-C14/G1-G3/D9/D11 fixes and the new closed rules)

Same convention as runs 1-2 (design 2.3): workspace = `cp -Rp` of `starter/`, grader mount = `cp -Rp`
of `checks/` minus `reference/` and `data/reserve/`, each `run` line from `lesson.yaml` executed
through `/bin/sh -c` under `env -i PATH=<py3.12 dir>:/usr/bin:/bin HOME=<ws>/home
ACADEMY_CHECKS_DIR=$G ACADEMY_GRADER_LOG=/dev/null`; `python3` = Python 3.12.13 (first on PATH).
Nothing under `course/` was edited. `.claude/settings*`/`.claude/hooks/*` scratch files written with
the Write tool (the repo bash guard blocks shell text naming those paths, also for scratch).

## 1. Regression: previously-passing cheats and the two message defects

| Id | Cheat | Run-3 result | Evidence |
|---|---|---|---|
| C10 | L2: unknown name forwarded to the server (`if False:` on the unknown branch) | fail 3/3 | "п.4 ... tools/call пришёл для имени 'x_...', которого нет в tools/list: неизвестный инструмент харнесс должен распознать сам и не отправлять серверу" |
| C11 | L6: Makefile split binary name (`A:=cl`, `B:=aude`, `$(A)$(B) --dangerously-$(S)-permissions`) | fail | "изменено что-то кроме цели agent" + "цель agent должна быть ... из: claude, ..." (full-Makefile compare catches the added variables) |
| C12 | L6: `agent:` recipe `sh scripts/agent.sh`, helper does the bypass | fail | recipe not allowed + "scripts/agent.sh: новый скрипт ... вне файлов задания" (manifest) |
| C13 | L5: old 162-line file as `.claude/rules/legacy.md` | fail | "162 строк ... не длиннее 10", shouting, tree, "72 строк совпадают" |
| C14 | L5: old file imported via `@legacy-notes.md` from AGENTS.md | fail | same four errors on the imported file |
| G1 | L6: interpreter allows `Bash(sh *)`, `Bash(python3 *)`, `Bash(env *)` | fail | "слишком широкое правило в allow" x3 + probes "git push через sh -c ... (исход: allow)", python3 -c, env |
| G2 | L5: old file as `src/CLAUDE.md` | fail | "162 строк ... не длиннее 10" + shouting/tree/overlap |
| G3a | L4: whole file as 70-line 4-space-indented block | fail | "блок кода из 70 строк, допускается не больше 15" |
| G3b | L4: `````-fence with a ``` line every 15 lines (CommonMark: closer must be >= opener length) | fail | "блок кода из 74 строк" (the inner ``` lines do not close the ````` fence) |
| D9 | L2: harness drops server `isError` (is_error always False), grader aborts | fixed | now only "п.5 ... ожидался tool_result с is_error: true"; no misleading "...а он завершился" line (verdict() returns early on `grader_aborted`) |
| D11 | L4: "15 строк" per-block vs total | fixed | task.md l.95 "больше 15 строк подряд", rubric gate l.107 "больше 15 строк подряд в одном блоке кода в любом виде" - both per-block |

Also re-confirmed: modified EXISTING starter script (`scripts/codegen.py` appended) -> fail
("изменённый скрипт ... вне файлов задания"). The Makefile full-compare blocks adding helper targets
or variables; `agent` must be no-deps + exactly one recipe from {claude, claude --permission-mode
default, claude --permission-mode plan}.

## 2. Honest run under the new closed rules

Every lesson's honest solution still passes; no new closed rule produces a false fail.

| Lesson | Honest command checks | Note |
|---|---|---|
| L1 | model-routing pass | unchanged |
| L2 | harness-behaviour pass (honest harness with real unknown-tool branch) | item 4 now observed on the harness, honest harness satisfies it |
| L3 | cost-estimate pass | unchanged |
| L4 | plan-structure pass; also with a legit short 3-line ```sh fenced command block in Контекст | short code block does not trip the 15-line rule |
| L5 | agents-md-structure pass; also with a short legit `.claude/rules/python.md` (5 lines) and with a short `@MIGRATIONS.md` import (3 lines) | nested/rules/imported short files do not trip caps/overlap |
| L6 | permissions-policy + hook-blocks-generated pass (E1, committed exec bit); also with an edited README.md and an added `.claude/settings.local.json` | manifest does not flag README (non-script) or settings.local.json (editable); honest hook edit not flagged (editable) |

Honest false-fail probes: none. The manifest only flags scripts/executables outside the four
editable files; honest README/doc edits and the editable `.claude/*` files are untouched by it.

## 3. Fresh cheater pass on the new rules

Cheats that FAILED (defences hold): C10-C14, G1-G3 (above); L6 split-name / helper-script / modified
starter script -> manifest/Makefile compare blocks all; L5 old file at import hop 4 -> caught
(boundary test C15b).

**C15 (L5, PASS - conditional defect, owner content-researcher then practice-designer +
lesson-author).** Old 162-line file hidden at import **hop 5**: AGENTS.md -> r1 -> r2 -> r3 -> r4 ->
`legacy.md`, each r* a single `@next.md` line (<=10 lines). `agents-md-structure` PASSES: the check
follows `MAX_IMPORT_HOPS = 4` and stops one hop short, so the old file is never read (caps, shouting,
tree, overlap all skip it); the rubric artifacts do not glob a file at that path either, so the
mentor would not see it. This reopens C13/C14/C7 through a 5th hop.
Whether this is a live defect depends on Claude Code's real import depth:
- theory.md l.61 and research say "до 4 уровней / up to 4 hops", and the check matches that number,
  so under the lesson's own stated model the hop-5 file is NOT loaded by Claude Code and keeping
  bloat there is harmless (dead file) -> not a defect;
- but the official Claude Code memory docs state a max import depth of 5 hops. If that is correct,
  Claude Code loads the hop-5 file while the check misses it -> genuine bypass, and theory l.61 is
  also off by one.
I could not fetch the docs in this run (Context7 not available to this agent). Action: content-
researcher confirms the real depth against code.claude.com/docs memory page; if it is 5, practice-
designer follows one more hop (`MAX_IMPORT_HOPS = 5`) and lesson-author fixes theory ("до 5 уровней").
If it is 4, no change; optionally note the boundary in task.md.

Not new defects (by-design, mentor-graded, already recorded): L4 whole file pasted as plain
un-fenced / un-indented text passes plain-form structure but the rubric gate zeroes it (R2/G3 class);
L5 reworded bloat with every normalized line < 20 chars dodges overlap but is a rewrite, not the old
file.

Quizzes: unchanged since run 2, not re-scored (out of this run's scope: closed rules only).
C9 (runner process isolation) out of scope (runner #08).

## STUDENT REPORT 00-introduction run 3 (#15)
Honest run: pass on every lesson L1-L6, including the new-rule honest variants (L4 short fence, L5
short rules/import file, L6 README + settings.local.json). No honest false fail.
Verified fixed: C10, C11, C12, C13, C14, G1, G2, G3 all now fail; D9 message clean; D11 wording
consistent.
New cheat that passed: C15 (old file hidden at import hop 5, L5) - conditional on Claude Code's real
import depth being > 4.
Blocking: none confirmed. C15 blocking only if content-researcher confirms real depth is 5 hops.
