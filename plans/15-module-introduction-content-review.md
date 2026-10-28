# #15 judge_content round 1

## judge-pedagogy: PASS

Read: module.yaml; every lesson.yaml, theory.md, task.md; L3 and L5 quizzes in full; starters (L1 README,
cards.json; L2 README, harness.py docstring; L6 README, CLAUDE.md; L4-L6 file lists); plan, student
runs 1-3, learner/profile.md, journal (empty), learning-process.md, course-reference "Введение",
research-l6 matcher lines, judge_mistakes.md.

Checked: O1-O6 observable and covered (O2 see flag); concept order (forward references marked; P3 done);
every lesson opens with a concrete problem; no hidden requirements; L6 honest path (E1 + minimal hook
up front, closed rules in reference sections); L5 rules fair (starter has no other instruction files;
run-3 honest variants pass); "Попытки и подсказки" in all six tasks, matches W2; time 345 min, ~64%
practice, student estimates fit; student items D1-D11, C15 resolved.

Non-blocking fixes:
1. 06/task.md:36-39: "Менять можно только ..." paragraph at column 0 breaks the step list, repeats
   l.204-209 and contradicts itself (README editable). Delete or make it one indented pointer to
   "Справка: Makefile и другие файлы".
2. 06/task.md:88: indent the last line of the mentor bullet.
3. 05/theory.md:5 "200 строк" -> 162; L1 starter README.md:10 "класс размера модели" -> the task/theory
   wording (practice-designer).
4. L2: local/remote name clash unspecified; say which wins or that the check never uses one.
5. Quiz distractors with low discrimination (L3 `plan-or-api` three "Всегда ..."; L1, L2 similar).

Flags for Stepan:
1. W2 exception to learning-process.md section 3: "скелет"/"скажи прямо" open only after closure for
   keyed items; accept explicitly or amend learning-process.md.
2. O2 says "находит ... рычаг", but only quiz question `levers-for-scenario` (1 of 5) grades it. Reword
   O2 (e.g. "называет рычаг и обсуждает его с ментором") or add a graded lever field.

PASS

## judge-assessment: FAIL (owner: practice-designer)

Ran: every command check on `cp -Rp` starter and reference via `sh -c` (env -i, python3.12, grader copy
without reference/ and data/reserve/): all 7 fail on the empty starter, pass on the reference. L2 reference
15/15 random seeds. Attacker sample L2 (C1, C10, no permission, no max_turns, server left running) and L6
(C4, C5, G1, C11, C12) fail. C15 closed. Quiz rates recomputed from real keys (0.12% / 0.44% / 0.14% per
attempt) match demo; quiz authoring rules hold. Bug-hunt 64/6912 = 1/108 recomputed. Reserve never read by
checks. Hook files 755, untracked (check 100755 after add). No key leaks. validate 0 issues.

Blocking:
1. L5 `agents-md-structure` `check_hookup()` reads `@AGENTS.md` as plain text: `.claude/CLAUDE.md` with
   `@AGENTS.md` (imports the missing `.claude/AGENTS.md`) PASSES; `@AGENTS.md` inside a fence PASSES;
   correct `.claude/CLAUDE.md` = `@../AGENTS.md` FAILS. Fix: hookup passes only when the root `AGENTS.md`
   is among the files `imports_of()` returns for a present CLAUDE-type file; add the three cases to the demo.
2. L6 `permissions-policy`: broad allows are an open denylist: `Bash(uv run *)`, `Bash(npx *)`,
   `Bash(npm run *)`, `Bash(find *)`, `Bash(docker *)`, `Edit(//**)` PASS. Fix: closed allow set (Edit
   under `src/`, `Bash(make test)`, `Bash(make lint)`, optionally exact git status/diff); any other allow
   fails naming it; say so in task.md; demo cases.

Non-blocking: reserve file headers "Grader mount only" -> "mentor-review store, never on the command-check
mount"; L4 fence inside a blockquote not counted (rubric gate catches it).

FAIL

## judge-accuracy: FAIL (owner: content-researcher, fix by lesson-author)

Checked every lesson against primary sources (models overview, effort, CC model-config, best-practices,
how-it-works, costs, prompt-caching, memory, permissions, permission-modes, settings, hooks, sandboxing;
Codex models and AGENTS.md; agents.md; Ollama; OpenCode; MCP spec, changelog, security; Building effective
agents; Effective context engineering; claude.com/pricing; Willison; OWASP; arXiv 2601.20404). All quiz
keys correct; L1 routing key consistent with per-model effort guidance; L3 answers.json recomputed by hand
(a 0.72821, a@mid 0.161355, b 0.65317, c 0.92017, turn 21) match; checkedAt dates in range.

Blocking:
1. 05/theory.md:34-36, lesson.yaml:26: Gloaguen et al. cited with v1 abstract phrasings and as ICLR main
   conference. v3 (2026-09-29): context files do not generally improve success and add >20% cost;
   repository overviews not helpful; model-generated files drop success in 5/8 settings by ~0.5-2% (not
   significant); developer-written beat model-generated (p=0.038); "extra requirements make the task harder"
   is a hypothesis (sec. 4.3); venue MemAgents workshop @ ICLR 2026. Fix text and lesson.yaml title.

Non-blocking:
- 01/theory.md:117: Ollama "model that supports tools" merges cloud and local sections; local says 64k+
  context and tools with compatible models.
- 02/theory.md:72: "Codex and OpenCode follow the same loop" unsourced.
- 03/quiz.yaml:33-34, 02/theory.md:51-52: in Claude Code MCP definitions are deferred (names + server
  instructions); say "add their tool list".

FAIL

# #15 judge_content round 2

## judge-pedagogy: PASS

Round-1 fixes 1-5 landed (L6 pointer instead of column-0 paragraph, mentor bullet indent, 162 vs docs'
200, L1 README wording, L2 name clash, plausible distractors in L1-L3 whose explanations correct the
misconception). New texts clear: L6 closed allow set (task.md:79-89, `/src` vs `//` explained in theory
l.35-37), L5 relative hookup with honest path first, L2 loop generalization sourced, MCP deferral. No
regressions; 345 min, ~64% practice. Honest path checked by reading, not by a student run.

Non-blocking: 02/task.md:90 "раньше они выдали бы ключ." at column 0 (cosmetic); 06/task.md:30 step 1
could point to the closed allow set.

Flags for Stepan: W2 exception; O2 "находит рычаг" graded only by one quiz question.

PASS

## judge-accuracy: PASS

Blocking fix verified: arXiv 2602.11988v3 (2026-09-29) abstract and HTML sections 4.2-4.3 back every
statement; venue confirmed on the MemAgents ICLR 2026 schedule. Non-blocking fixes correct (Ollama Claude
Code integration page; Building effective agents; CC costs MCP deferral; L3 levers explanation; memory and
costs pages on "under 200 lines"). L5/L6 rule texts match memory and permissions pages. Replaced L1-L3
distractors: none accidentally correct, explanations true. No regressions; checkedAt in range.

Non-blocking: 04/theory.md:60 add "и инструкции сервера" (match L2); 03/quiz.yaml:28 option d reword to
"попросить модель повторять прежние объяснения, чтобы они шли по цене кэша".

PASS

## judge-assessment: FAIL (owner: practice-designer)

Round-1 blockers fixed and verified with many cases (L5 hookup via import resolver: 15 fail cases, 7 pass
cases as expected; L6 closed allow set: Bash/Edit variant tricks fail, honest forms pass). L4 blockquote
counting works. Every command check: empty starter exit 1, reference exit 0. Quizzes parsed: authoring
rules hold, new distractors plausible. No leaks. validate 0 issues.

Blocking:
1. L6 `permissions-policy`: `permissions.defaultMode` is an open list; only `bypassPermissions` fails.
   Reference + `"acceptEdits"` and + `"dontAsk"` pass, while the Makefile check rejects
   `--permission-mode acceptEdits`. acceptEdits lets `cp .env.staging x` and edits outside src/ run
   without a prompt; dontAsk turns ask into deny (policy item 6). Fix: accept only absent, `"default"` or
   `"plan"`; fail anything else by name; state in task.md; demo cases for acceptEdits and dontAsk.

Non-blocking: L5 task.md say "напрямую" (an import chain to AGENTS.md fails); L4 task.md "в том числе
внутри цитаты"; outer whitespace on allow rules stripped (safe direction).

FAIL

# #15 judge_content round 3

## judge-pedagogy: PASS

Round-2 items landed: L6 defaultMode rule next to the closed allow set (task.md:92-100), step 1 points to
both (30-33), static-checks bullet no longer repeats it; L5 "напрямую" (60-65); L4 "в том числе внутри
цитаты" (95-97) and theory "инструкции сервера" (59-62); L2 indent (87-90); L3 option d plausible, explanation
corrects it. Honest path unchanged (removing bypassPermissions leaves the key absent, which passes). 345 min,
~64% practice. Checked by reading, no new student run.

Non-blocking: 04/theory.md:60-62 stray line break; 06/theory.md:60-62 one clause each on what acceptEdits and
dontAsk do.

Flags for Stepan: W2 exception; O2 graded by one quiz question.

PASS

## judge-accuracy: FAIL (owner: practice-designer, text by lesson-author)

Checked live 2026-10-28: permission-modes (modes, `manual` alias, acceptEdits, dontAsk, starting mode from
project/local settings, built-in default `auto` from v2.1.283), settings ("auto and bypassPermissions don't
take effect from project or local settings"; bypass before v2.1.257), permissions (acceptEdits row incl. `cp`;
which Bash commands Read/Edit deny covers). acceptEdits, dontAsk, bypassPermissions, auto reason lines correct;
L5, L4, L2, L3 changes correct.

Blocking:
1. `"manual"` is a documented alias of `default` ("defaultMode": "manual", `--permission-mode manual`) but is
   rejected (verify_permissions.py:41, 425-430; task.md:92-100, :214) with the generic reason "другие режимы
   пропускают вопросы", false for manual and for auto. Fix: accept manual in defaultMode and in the Makefile
   recipe; list it in task.md; per-value messages matching the task reason lines; demo cases.
2. task.md:94 `cp .env.staging x` claims an undocumented bypass of the `Read(.env*)` deny. Fix: documented
   example ("правки вне src/ и команды rm, mv, cp в рабочей папке пройдут без запроса"), no deny-bypass claim.

Non-blocking: bypassPermissions message in English (verify_permissions.py:422); absent defaultMode falls back to
built-in `auto` which also auto-approves edits (mentor note or theory line); 04/theory.md line break.

FAIL

## judge-assessment: PASS

Ran (python3.12, env -i, grader copy without reference/ and data/reserve/, cp -Rp starters, sh -c): all 7
command checks empty starter exit 1, reference exit 0. L6 defaultMode: 47 cases, 0 unexpected (modes, case and
whitespace variants, lookalikes, non-strings, local-only, duplicate keys last-wins, non-read placements, BOM;
10 seeds stable). Earlier L6 cheats still fail. L5 direct import vs chain behaves as stated. Quiz rates
recomputed (L1 0.121%, L2/L3 0.4375%, L5 0.141%, L6 0.121% per attempt). No leaks. validate 0 issues.

Rejecting `manual`: too strict but safe; the message is the defect (non-blocking 1).

Non-blocking (practice-designer):
1. Accept `manual` as alias of `default`, or a dedicated message; one sentence in task.md.
2. Other `permissions` keys unchecked: `additionalDirectories: ["/"]` passes, contradicting policy item 7 and the
   docstring; allow only allow/ask/deny/defaultMode (optionally disableBypassPermissionsMode).
3. verify_permissions.py:39-40 comment contradicts the docstring and is wrong for plan; reword.

PASS

# #15 judge_content round 4

## judge-pedagogy: PASS

Starter permissions keys (allow, defaultMode, deny) are all in the closed set; honest path unchanged (remove
bypassPermissions; `claude` recipe accepted, `--permission-mode manual` listed). Modes introduced in theory
58-74 before the task; six one-clause bullets, no overload. No regressions; 345 min, ~64% practice.

Non-blocking: 06/task.md:218-219 line wrap; 06/task.md:100 "любые другие значения" as its own sentence.

Flags for Stepan: W2 exception; O2 graded by one quiz question.

PASS

## judge-accuracy: FAIL (owner: lesson-author)

Checked live 2026-10-28: permission-modes, settings, permissions. task.md:92-103 and :216-219, verify_permissions.py
messages and comment, theory default/manual, acceptEdits, plan, auto, dontAsk, absent-defaultMode sentence: correct.

Blocking:
1. 06/theory.md:70 "bypassPermissions: выполняется всё, кроме ask-правил и немногих защищённых действий" implies
   deny rules do not apply in bypass; docs: "Deny rules block in every mode, including bypassPermissions".
   Contradicts the lesson and reserve security-quiz. Fix: no prompts; only deny rules, ask rules and the few
   actions no mode auto-approves stop a call.

Non-blocking: theory.md:64-65 "остальной Bash вне набора только для чтения спрашивает"; built-in start mode is
default under disableAutoMode (covered by "unknown"); disableAutoMode could be allowed; task.md:218-219 wrap.

FAIL

## judge-assessment: PASS

Ran 103 L6 round-4 cases (python3.12, env -i, grader copy without reference/ and data/reserve/, sh -c): manual
passes in both files and the Makefile; additionalDirectories (all forms), unknown and lookalike keys, case and
whitespace variants, Makefile variants, duplicate-key and BOM tricks fail; seeds stable. All earlier cheats fail,
honest variants pass; all 7 command checks empty exit 1, reference exit 0; quiz rates unchanged; no leaks;
validate 0 issues.

Non-blocking (practice-designer): additionalDirectories message false for [] and ["src"]; any
disableBypassPermissionsMode value passes (only "disable" is documented); top-level `sandbox` with
autoAllowBashIfSandboxed passes and runs `make db-reset` without a prompt (same class as additionalDirectories);
disableAutoMode / blockReadsOutsideWorkingDirectories rejected (safe); Makefile and allow-rule messages do not
name the value/file; task.md:100 separate line.

PASS

# #15 judge_content round 5

## judge-pedagogy: PASS

Theory flow (58-78) intact, modes before the task; round-4 layout items fixed; honest path unchanged; checker
messages match the task text; 345 min holds. Read only, no student run.

Non-blocking: task.md:103-104 say disableBypassPermissionsMode takes only "disable"; theory.md:71-72 clarify
whether an ask rule prompts or refuses in bypass.

Flags for Stepan: W2 exception; O2 graded by one quiz question.

PASS

## judge-accuracy: FAIL (owner: lesson-author; the wording came from the round-4 judge fix)

Checked live 2026-10-28: permission-modes, permissions, settings, settings-reference. acceptEdits (64-66),
line 74, the rest of theory.md, task.md layout, both new checker messages: correct.

Blocking:
1. 06/theory.md:71-72 "bypassPermissions: запросов нет; не выполняется ... совпадает с ask-правилами". Docs:
   bypass "Skips permission prompts, except for the actions no mode auto-approves"; "Even in bypassPermissions
   mode, each of the actions no mode auto-approves gets a prompt or a denial", first item "Tools matched by an
   explicit ask rule"; in -p they are denied. So ask-rule matches still prompt; as written bypass reads like
   dontAsk. Suggested: "правила allow не нужны, запросы остаются только для ask-правил и немногих действий,
   которые не одобряет ни один режим (в -p они отклоняются); deny-правила блокируют".

Non-blocking: acceptEdits exceptions (protected paths, critical rm, touch with options); task.md:104-105 align
additionalDirectories wording with the check message.

FAIL

## judge-assessment: PASS

Ran 143 L6 cases (python3.12, env -i, grader copy, sh -c): every disableBypassPermissionsMode value other than
"disable" fails in both files (types, case, whitespace, NUL, lookalikes, duplicates last-wins, cross-file);
"disable" passes; additionalDirectories [] and ["src"] fail with a true message. All round 1-4 cheats fail,
honest workspaces pass; all 7 command checks empty exit 1, reference exit 0; quiz rates unchanged; no leaks;
validate 0 issues. Sandbox known gap recorded (demo.md:124-125), reproduced, not a blocker per Stepan.

Non-blocking: task.md:103-104 and docstring mention "disable" only; allow-rule and Makefile messages do not name
the file; top-level keys outside permissions unchecked (same class as sandbox).

PASS

# #15 judge_content round 6

## judge-pedagogy: PASS

Round-5 items fixed: bypassPermissions bullet (theory.md:71-75) contrasts with dontAsk, covers ask matches,
-p denial and deny; standalone line merged; task.md:103-104 `"disable"` matches the checker. Honest path
unchanged; no regressions; 345 min holds. Read only, no student run.

Non-blocking: theory.md:72-73 parenthetical repeats "allow-правила не нужны"; task.md:104 wrap width.

Flags for Stepan: W2 exception; O2 graded by one quiz question.

PASS

## judge-accuracy: PASS

Checked live 2026-10-28 (permission-modes, permissions): every clause of theory.md:71-75 quoted ("Allow rules
have no effect in bypassPermissions"; "Skips permission prompts, except for the actions no mode auto-approves";
-p "denied instead"; "Deny rules block in every mode, including bypassPermissions"); dontAsk contrast; task.md
`"disable"`; whole theory.md, quiz.yaml and reserve consistent.

Non-blocking: theory.md:73-74 use the source verb "запрос или отказ" (some unapprovable actions are refused even
interactively); the imprecision came from the round-5 judge suggestion.

PASS

## judge-assessment: PASS

Checks byte-identical to round 5 (cmp/diff -r, mtimes); all 7 command checks empty exit 1, reference exit 0;
L6 matrix 143 cases identical to round 5; no leaks in the changed lines; text matches the check; validate 0
issues.

Non-blocking: task.md:103 wrap; round-5 items (messages not naming the file, top-level keys) still open.

PASS
