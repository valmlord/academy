# #41 student run B: L2 `02-skills`, L3 `03-domain-ontology`, L4 `04-spec-adr-tasks`

Student agent, 2026-10-29, macOS, `python3` = `/opt/homebrew/bin/python3.12` through a shim. Each check run
as in demo record B: `env -i PATH=<shim>:/usr/bin:/bin HOME=<copy>/.home ACADEMY_CHECKS_DIR=$G python3 -I
"$G/<script>"` in the copy, `$G` = `checks/` without `reference/` and `data/reserve/`. Work copies:
`scratchpad/student-B/<lesson>/` (honest), `scratchpad/cheats/<case>/` (cheats), driver `scratchpad/runcheck.sh`.
Times are learner-equivalent estimates (the agent's wall clock is not meaningful).

Summary of blocking findings:

1. L2 `skills-structure` passes when the whole old verify and release procedures are pasted into
   CLAUDE.md as two single long lines (memory check is line-based: 4 non-empty lines, no line equal
   to an old line).
2. L2 `skills-structure` passes with the procedures deleted, not moved: skill bodies of one line,
   release body referring to `scripts/release.py` only inside an HTML comment.
3. L3 `glossary-rubric`: circular keyword-stuffed definitions + correct map + one reason sentence
   score 6/8 = 0.75 and pass. One zeroed criterion never fails the rubric.
4. L4 `sdd-rubric`: the demo sets `horizontal-slices` and `non-qualifying-adr` each score 8/10 = 0.8
   and pass; the demo README expects < 0.7. Same cause: 5 equal criteria, pass 0.7, no gate.

---

```
STUDENT REPORT sdd-skills (#41)
Honest run: pass, time ~45 min (estimatedMinutes 50; practice ~25 vs 30 planned)
```

Honest artifacts: `scratchpad/student-B/02-skills/.claude/skills/{verify,release}/SKILL.md`, 9-line
CLAUDE.md, script moved to `.claude/skills/release/scripts/release.py` (invoked as
`python3 ${CLAUDE_SKILL_DIR}/scripts/release.py $ARGUMENTS`; run from repo root it bumps 0.4.0 -> 0.4.1;
unit suite still OK). `skills-structure` passed on the first run. Quiz from theory alone: 6/6.

Unclear places:
- theory.md "Булевы поля принимают `yes`, `no`, `on`, `off`, `1`, `0` в любом регистре, кроме `true`
  и `false`": "кроме" reads as "except true/false" (i.e. true/false are not accepted). Meant
  "помимо". Rephrase.
- task.md says CLAUDE.md is "примерно на 120 строк"; the starter file has 110. Minor.
- `${CLAUDE_SKILL_DIR}` and `$ARGUMENTS` are not explained in theory; the learner moving the script
  has to guess how the skill body should call it (cwd = repo root vs skill dir). The script's
  `--project-dir` defaults to cwd, which works, but nothing in theory says so.
- Theory says a test-based `verify` changes the meaning of the built-in `/verify` name, then the task
  requires exactly that name with a test-based body. No sentence on why that is the right choice here.
- Quiz Q4 option c "регистрируются при вызове": theory only says skill hooks "остаются до конца
  сессии", not when they register. Answerable, but not from theory text.

Ambiguities:
- Item 6: "делит со старыми процедурами не больше 2 строк" can be read as "content" or "lines";
  the check counts lines only (see cheat 1).

Cheats tried -> result:
1. Both procedures pasted into CLAUDE.md as one long line each (4 non-empty lines) -> PASS (blocking).
2. Procedures behind `@docs/procedures.md` import -> fail (103 lines, 61 shared). Good.
3. Procedures in `.claude/rules/procedures.md` -> fail. Good.
4. Absolute-path `@/abs/.../docs/procedures.md` import -> fail. Good.
5. `@~/.claude/procedures.md` import (home file) -> PASS; resolver skips `~` by design. Procedure
   leaves the repo and still loads each session for this user. Minor, not blocking; worth one line.
6. Stub skills: verify body = the test command only, release body = `<!-- scripts/release.py -->`,
   CLAUDE.md 2 lines -> PASS (blocking: the procedure is deleted, not moved; nothing checks that the
   release skill carries the old steps).
7. Copy of the script kept at root as `scripts/release_tool.py` + `.claude/commands/ship.md` -> PASS
   (minor: "перенос" only checks the exact old path).
8. Frontmatter tricks: quoted `"true"` -> fail; `y` -> fail; duplicate key -> fail;
   `user-invocable: false` -> fail; typo `disable-model-invokation` -> fail; `&anchor` -> fail;
   `hooks: {}` -> fail; `name: Release` -> fail; UTF-8 BOM before `---` -> fail; `TRUE` -> pass
   (allowed by task). Grammar is solid. Note: the typo case also prints "quote the value" for the
   typo line, which nudges toward quoting rather than fixing the name.

Blocking: cheats 1 and 6. Suggest (a) count shared content by normalized sentences or by a token
overlap ratio against `procedures.orig`, not whole lines, or cap line length; (b) require the
release body to share a minimum of the old release steps (e.g. >= N normalized sentences) and count
references outside HTML comments only.

---

```
STUDENT REPORT sdd-domain-ontology (#41)
Honest run: pass, time ~40 min (estimatedMinutes 50)
```

Honest artifacts: `scratchpad/student-B/03-domain-ontology/{GLOSSARY-MAP.md,docs/billing/GLOSSARY.md,
docs/ledger/GLOSSARY.md}`. `glossary-structure` passed first run. Quiz: 6/6.

Unclear places:
- Language of definitions is not stated (interview Russian, theory example English, L4 starter
  glossary Russian). Either passes; say it.
- Where the polyseme reason goes is not stated. Rubric C3 needs it for 2, "Готово, когда" has no
  item for it; the format allows only 1-2 description lines per context file. I put a free paragraph
  after `## Relationships` in the map; the check accepted it, but the format section does not
  mention free prose there.
- Whether the non-crossing events (`ReminderSent`, `InvoiceDisputed`) belong on the map. A line
  "`ReminderSent` and `InvoiceDisputed` stay inside Billing; Ledger does not see them" counts as a
  relationship line for the check (names both contexts and a PascalCase event).

Ambiguities: as above (language; reason location).

Rubric, blind self-grade (mentor view): own set C1 2, C2 2, C3 2, C4 2 = 8/8.
Demo sets graded against `rubric-glossary.md`:
- reference: 2, 2, 1 (no reason for the polyseme anywhere), 2 = 7/8 = 0.875. Passes the >= 0.85
  target, but the reference is not an exemplar for C3.
- weak: 0, 2, 1, 0 = 3/8. injection: same 3/8, injection ignored. empty starter: 0, 2, 0, 0 = 2/8.
- borderline: 1, 1 (or 0: two details, "справочник контрагентов" and "в центах"; rubric has no level
  for two), 1, 0 (`ReminderSent` crossing is a listed 0 example) = 2-3/8. Not borderline: fails hard.
  The set does not probe the 0.7 boundary.
- keyword-stuffed-circular: 0, 2, 1, 2 = 5/8, fails only because its map has no reason sentence.

Cheats tried -> result:
1. Guessed `_Avoid_` lists (extra guesses up to 4 words), circular "The X in billing." definitions,
   `ReminderSent` shown crossing -> structure PASS (documented as a form filter); rubric 0,2,1,0 = 3/8 fail.
2. Implementation detail without markers ("A row in the customers table, see the ClientAccount
   model in the invoices clients module.") -> structure PASS; rubric C2 catches (1).
3. `account` avoided in Ledger / Billing term `Acc ount` -> fail. Good.
4. Stuffed circular definitions from the demo + correct map + one reason sentence -> structure PASS,
   rubric 0, 2, 2, 2 = 6/8 = 0.75 PASS (blocking).

Blocking: cheat 4. C2 "no implementation details" is free 2 points for empty or circular definitions.
Suggest a gate (any criterion at 0 fails the rubric), or make C2 conditional on C1 > 0, or a structure
rule against a definition that contains its own term name before the first verb / starts with "Это <Term>".

---

```
STUDENT REPORT sdd-spec-adr-tasks (#41)
Honest run: pass, time ~70 min (estimatedMinutes 70)
```

Honest artifacts: `scratchpad/student-B/04-spec-adr-tasks/docs/{spec.md,tasks.md,adr/0001-derive-next-reminder-from-history.md}`
(10 requirements, Nygard ADR on D2, 4 vertical tasks). `sdd-artifacts` passed first run. Quiz: 6/6.

Unclear places:
- Dispute: "пока не трогаем: сделаем отдельным изменением" has two readings: disputed ISSUED Invoices
  get Reminders as today, or their behaviour is left undefined. The glossary says "пока Dispute
  открыт, оплату не требуют", which argues against reminding. Rubric C2 gives 0 for "Disputed invoices
  get no reminders" (an unconfirmed rule) but is silent about "planned like any other", which I wrote.
  A learner who follows the glossary loses C2 entirely. Say in the transcript which one is meant.
- Outstanding Balance: glossary = Invoice minus Payments and Credit Notes; transcript Q8 = lines minus
  `paid_cents`; the model has no Credit Notes. Not addressed anywhere.
- How to write `Check:` for a test file that does not exist yet: theory shows `-m unittest
  tests.test_orders`; the reference uses `-k test_req_NN` with a naming convention the learner never
  sees. Fine, but a hint would help.

Ambiguities:
- Item 8 "ровно одна команда": `rm -rf build && true; echo ok` passes; only "one backtick span" is
  enforced. Either reword or check for `&&`, `;`, `|`.
- Nothing requires the Check to be a test command: `Check: \`true\`` passes. The outcome ("каждая
  задача ссылается на ... команду проверки") and module 00 L4 imply a real check; no rubric criterion
  covers it either.

Rubric, blind self-grade: own set C1 2, C2 2, C3 2, C4 2, C5 1-2 (I wrote "letters" next to Reminder)
= 9-10/10. Demo sets against `rubric-sdd.md`:
- reference: 2, 2, 2, 2, 2 = 10/10.
- weak: 0, 0, 0-1, 0, 2 = 2-3/10. injection: same, injection ignored. empty starter: ~0-2/10.
- borderline: 1 (REQ-05 without the number), 1-2, 2, 1 (negatives removed), 2 = 7-8/10 -> passes at
  the boundary; a real borderline. Good.
- horizontal-slices: 2, 2, 0, 2, 2 = 8/10 = 0.8 PASS (README expects < 0.7; blocking).
- non-qualifying-adr: 2, 2, 2, 0, 2 = 8/10 = 0.8 PASS (README expects < 0.7; blocking).

Cheats tried -> result:
1. Minimal stub (6 x "WHEN a THE SYSTEM SHALL b", user stories "a b c", empty Implementation
   Decisions, `Check: \`true\``, ADR sections "x") -> structure PASS; rubric ~0-2/10 fail.
2. Avoided words (client, account, debt, bill) in `###` headings or in a fenced block -> PASS
   (documented exclusions); rubric C5 at most -2, so overall still passes.
3. Cyrillic homoglyphs ("сlient", "аccount", "dеbt") in prose -> PASS (structure); rubric C5 only.
4. Avoided words after the backticks on a `Check:` line -> fail (Check line form). Good.
5. `Check: \`rm -rf build && true; echo ok\`` -> PASS (see ambiguity above).
6. REQ coverage via heading or HTML comment only -> fail. Good.
7. Two ADR files / ADR named `1-derive.md` -> fail. Good.
8. Minimal MADR (front matter + three one-letter sections) -> structure PASS; rubric C4 0.
9. My honest spec + ADR on frozen dataclasses (D4) -> rubric 8/10 PASS. My honest spec + layer-sliced
   tasks -> 8/10 PASS. Same defect as the demo sets.

Blocking: rubric defect (cheat 9, demo `horizontal-slices` and `non-qualifying-adr` pass). Suggest
a gate: any criterion at 0 fails the rubric (C3 and C4 are the lesson's core skills), or pass >= 0.9.
Non-blocking: Check-command quality (`true`, chained commands) unchecked by both check and rubric.

---

Quizzes (all three, answered from theory before reading the key): 6/6, 6/6, 6/6.

---

## Round 2 (2026-10-29, after the demo-B "Round 2" fixes)

Fresh copies: `scratchpad/student-B2/<lesson>/` (honest), `scratchpad/student-B2/cheats/<case>/`, graders
copied to `scratchpad/student-B2/G/<lesson>/` without `reference/` and `data/reserve/`, driver
`scratchpad/student-B2/run.sh` (same `env -i ... python3 -I` call as round 1, python3 = 3.12).

Summary of blocking findings:

1. L2 memory budget evaded by gluing words: the whole of `procedures.orig` pasted into CLAUDE.md with
   every non-word run replaced by `_` (2 extra lines, 128 words in total, 0 shared 6-word sequences)
   -> PASS. Same with CamelCase (`HowToVerifyAChangeFollowTheseSteps...`) and with U+3164 HANGUL FILLER
   (a blank-looking letter) as the separator -> PASS. `\w+` treats `_`, letters glued together and
   any Unicode letter as one word. The text stays perfectly readable to the model.
2. L2 skills still pass with the procedures deleted: bodies of 1-2 lines that only carry the 5 marker
   strings (`L2-stub-markers`), markers inside a Markdown comment `[//]: # (...)` (`L2-mdcomment-markers`),
   markers in `references/old.txt` that the body says not to read (`L2-ignored-ref`) -> PASS. task.md
   admits "перенесена ли процедура целиком" is not checked and L2 has no rubric, so round-1 blocking #2
   is narrowed (5 strings now required) but not closed: the lesson still passes with no procedure moved.
3. L2 script copy evaded: copy of `release.py` at `tools/bump.py` with `  # keep` appended to every line
   (one `sed`; it still runs and bumps the version) -> PASS, 0 of 25 significant lines shared; copy with
   7 identifiers renamed (runs) -> PASS, 9 of 25.
4. L2 SessionStart hook in `.claude/settings.json` that runs `cat docs/procedures.txt` (the whole old text)
   -> PASS. That loads the procedures into every session, the reason the task gives for banning
   out-of-repo imports, and the memory resolver does not look at hooks.
5. L4 `Check: \`python3 -m unittest -h\`` (and `--help`) -> PASS; exits 0 and runs no tests, the same
   as the rejected `true`.
6. L4 avoided-word scan: look-alikes outside the fold table pass: `clıent` (U+0131 dotless i),
   `ɑccount` (U+0251), `bӏll` (U+04CF palochka), `ʙill`, `clɩent`, `clᴉent`, `debт`, and invisible
   non-Cf marks `cli͏ent` (combining grapheme joiner) and `cli︀ent` (variation selector) ->
   PASS. Cyrillic/Greek in the table, ZWSP, ZWJ, WJ, U+180E, tag chars, fullwidth, roman numerals fail.
7. L4 rubric C4 levels overlap under the new gate: level 1 "negative consequences are missing" and
   level 0 "an ADR that lists only benefits" both describe the `borderline` ADR (D2, consequences "always
   consistent" and "no schedule table" only). README expects 1 (pass at 7-8/10); reading the 0 example
   literally fails it. With "any 0 fails", this split decides the verdict. Same overlap in C2: level 1
   "one decision ... contradicts the transcript" vs level 0 "a rule that contradicts the transcript".

```
STUDENT REPORT sdd-skills (#41) round 2
Honest run: pass, time ~40 min (estimatedMinutes 50)
```

- Honest memory: kept project facts, layout, commands, code style -> 14 non-empty lines, 126 words, first
  run PASS. Budget fits naturally with room to spare. Deleting only the two procedures from the starter
  leaves 31 lines; the message ("31 непустых строк ... не больше 20") says exactly what to do.
- Markers feel fair: an honest verify skill carries the command, "Ran 0 tests" and expectedFailure
  (from the never-skip step) on its own; release carries the push command and `pyproject.toml`. item 6
  lists them, so a learner who paraphrases knows what to keep.
- Unclear: item 6 "точные строки" does not say case-sensitive (`ran 0 tests` fails). Minor.

Cheats (round 1 re-run): giantline, import, rules, homeimport, absimport, stub, keepscript, all
frontmatter tricks fail as in the demo record; `fm-TRUEcase`, `fm-trailingspace`, `symlink` pass by design.
New cheats: underscore / CamelCase / Hangul-filler glue PASS (blocking 1); zero-width space, hyphen,
dot-padding fail (more words); condensed synonym paraphrase of both procedures (~110 words) in CLAUDE.md
PASS (non-blocking: indistinguishable from project facts by form; only a rubric could judge it); markers
only / Markdown comment / ignored reference PASS (blocking 2); markers inside a code fence or link text
PASS (fine, the model reads them); script copy with trailing comments or renamed identifiers PASS
(blocking 3); SessionStart hook PASS (blocking 4).

Suggested fixes: count words as `[^\W_]+` runs after splitting CamelCase and treat any non-ASCII letter
next to ASCII letters as a separator, or simpler, cap characters (for example 1800 characters of memory)
next to words; strip `[//]: #` comment lines like HTML comments; add a small rubric check for L2 ("each
skill carries the old steps") or raise the marker set per skill; compare the script copy after removing
`#` comments and with identifiers normalized (`ast.dump` with names blanked, or tokenize and compare token
types); reject hook entries in `.claude/settings*.json` other than the starter's Stop hook, or include
hook commands that read files in the memory budget.

```
STUDENT REPORT sdd-domain-ontology (#41) round 2
Honest run: pass, time ~35 min (estimatedMinutes 50)
```

- Reason line: moved the polyseme reason into the Ledger description (second description line) and
  removed the map paragraph: PASS. The new format line answers round 1's question.
- Unclear: "вторая строка под `# Ledger`" can be read literally as the line right after the heading
  (usually blank). Say "вторая строка описания". The check accepts 3 description lines and a free map
  paragraph, so the format rule is not enforced (form filter; rubric C3 accepts both places). Minor.
- Rubric, own set: 2, 2, 2, 2 = 8/8.

Rubric cheats (rubric-glossary.md, no-zero gate): `L3-stuff` (circular + correct map + reason) 0, 2, 2, 2
= 6/8, FAIL by the gate (round-1 blocking 3 closed). `L3-impl` (one definition names a table, a class and
a module) 2, 0, 2, 2 -> FAIL (0 example "definitions that name tables ... classes or modules").
`L3-guess` 0, 2, 1, 0 -> FAIL. Structure check unchanged: these three still pass it (form filter, as
documented).

Demo sets regraded: reference 2, 2, 2, 2 = 8/8 pass; empty 0, 2, 0, 0 fail; weak 0, 2, 1, 0 = 3/8 fail;
injection same as weak, injection ignored; keyword-stuffed-circular 0, 2, 2, 2 = 6/8 fails only by the
gate; borderline 1, 1, 2, 1 = 5/8 fail (C1 could be 2: Credit Note and Dispute are thin but not vague,
which gives 6/8 pass; README names this split). All match README.

```
STUDENT REPORT sdd-spec-adr-tasks (#41) round 2
Honest run: pass, time ~60 min (estimatedMinutes 70)
```

- Q7 now states Dispute is ignored and Q8 that `paid_cents` holds every Payment and Credit Note; both
  round-1 ambiguities are gone. I removed my old "Credit Notes out of scope" line, which now contradicts
  Q8. Check: forms in task item 8 are clear; my `PYTHONPATH=src python3 -m unittest tests.test_reminders`
  lines pass.
- Rubric, own set: 2, 2, 2, 2, 1-2 = 9-10/10.

Cheats: round-1 L4 set re-run matches the demo record (min, twocmds, reqheading, reqfield-comment,
checkline-vocab, homoglyph, twoadr, adr-lower fail; fence-vocab, heading-vocab, madr pass by design;
madr fails the rubric at C4 0). New: `python3 -m unittest -h` / `--help` PASS (blocking 5);
`PYTHONPATH=fake python3 -m unittest`, `... tests.does_not_exist`, `-k zzz_no_match` PASS (non-blocking:
Check commands are never run in L4 and no rubric criterion reads them; add "Check runs the task's tests"
to C3 if L5+ executes them); `make test` passes and the starter Makefile target is the real suite.
Look-alikes: see blocking 6. Suggested fix: after NFKC, remove every default-ignorable code point and
every combining mark (categories Cf, Mn, Me), then flag any `\w` run that mixes ASCII letters with
non-ASCII letters as a disguised word, instead of extending the fold table.

Demo sets regraded (rubric-sdd.md, gate): reference 10/10 pass; empty fail; weak 0, 0, 0-1, 1, 2 fail;
injection same, ignored; horizontal-slices 2, 2, 0, 2, 2 fails by the gate; non-qualifying-adr 2, 2, 2,
0, 2 fails by the gate (round-1 blocking 4 closed); borderline 1, 1-2, 2, 0-or-1, 2: pass at 7-8/10 with
C4 = 1 as README says, fail with C4 = 0 under the literal 0 example (blocking 7). Fix: make level 0 of C4
"wrong decision, or no consequences at all" and move "lists only benefits" to level 1, or keep it at 0
and change README and the borderline set; separate C2 levels the same way ("one decision contradicted"
= 1, "an invented rule the transcript rejects" = 0, or the reverse, but not both).

## Round 3 (2026-10-30, blind grading of the L2 rubric `checks/rubric-skills.md`)

Scratch: `scratchpad/student-B3/` (current `checks/` copied to `G/02-skills/` without `reference/`;
new cheats in `cheats/`). Demo sets graded from the files alone, README opened afterwards.

### 1. Blind grades of `checks/reference/rubric-demo/` vs README

| Set | Mine (C1-C4, sum, verdict) | README | Match |
|-----|----------------------------|--------|-------|
| honest | 2,2,2,2 = 8/8 pass | same | yes |
| weak | 0,2,1,1 = 4/8 fail (V6-V8 missing; R1+R3 leaked; Q1 no) | same | yes |
| marker-only | 0,2,2,1 = 5/8 fail | same | yes |
| borderline | 1,2,1,2 = 6/8 pass (V7+R10 missing; R1 leaked) | same | yes |
| session-hook | 2,1,0,2 = 5/8 fail (hook rule; `python3 scripts/release.py patch` in procedures.txt = dangling) | same | yes |
| script-copy | 2,0,2,2 = 6/8 fail by the gate | same | yes |

No disagreement in grades. Wording points that made me stop and think (none changed a score):

- Overlay base: without the README I assumed `script-copy` and `session-hook` sit on `checks/reference/`
  rather than `honest/`; grades are the same either way. Blind graders get assembled workspaces, so
  this matters only for anyone reading the demo directory by hand.
- C3 "any part is present" is not bounded outside `description`/`when_to_use`. The honest memory says
  "Line length 100 (see `pyproject.toml`)"; a literal grader could call that a part of R6 and give
  C3 = 1. Suggest: "a part means one of the specifics listed in the step (command, flag, path, day,
  never/always rule), used as a release or verify instruction".
- C3 exempts "one line that names the skill and who starts it" (singular); honest/borderline name both
  skills in one line, fine, but two pointer lines (one per skill) read literally as one exempt line +
  one leak. Suggest "one pointer line per skill".
- C2 "a file that does what the old script did": the demo `script-copy/tools/bump.py` (same as my
  round-2 `L2-script-renamed`) crashes with `NameError: name 'major' is not defined` for `minor` and
  `major`; only `patch` works. README says "it still bumps the version". A literal grader could argue
  it is not a working copy. Fix the demo file (rename consistently) so the example is unambiguous;
  my round-2 report "runs" was true only for `patch`.

### 2. Round-2 artifacts against the rubric

Re-ran the current `skills-structure` on every L2 cheat first: underscore, camel, hangul-filler,
hyphen, zwsp, punct, onlydelete and all r1 frontmatter/import/rules/stub/keepscript cheats now FAIL
the command check. Still passing the command check, graded with the rubric:

- honest `student-B2/02-skills`: 2,2,2,2 = 8/8 PASS.
- `L2-stub-markers`, `L2-mdcomment-markers`, `L2-ignored-ref`, `L2-fence`, `L2-linktext`:
  0,2,2,1 = 5/8 FAIL (C1 far over 3 missing; verify description has no trigger).
- `L2-synonym-condensed` (condensed paraphrase of both procedures in CLAUDE.md): 2,2,0,2 = 6/8 = 0.75,
  FAIL by the gate (C3: 8+ leaked steps).
- `L2-sessionhook`: 2,1,0,2 FAIL. `L2-script-renamed`, `L2-script-trailcomment`: 2,0,2,2 FAIL by the gate.
- `L2-description-proc`: identical to the honest workspace (the cheat was never applied in round 2);
  not a finding, the rubric's description rule covers the idea.
- `r1-L2-fm-TRUEcase`, `r1-L2-fm-trailingspace`, `r1-L2-symlink` (pass by design, round-1 honest bodies):
  2,2,2,2 PASS, correct.

Every cheat fails, the honest solution passes.

### 3. New rubric-gaming attempts (both PASS `skills-structure`)

- `L2-subagent`: honest workspace plus `.claude/agents/shipper.md` whose `description` says "Use
  proactively after every merged change" and carries R1-R4, R6-R8, R10 in short form; its body runs
  `python3 .claude/skills/release/scripts/release.py patch` and pushes. Subagent descriptions sit in
  context every session and the model can delegate to it on its own, so release is model-started in
  practice. Letter of the rubric: C1 2, C2 2 (path exists, no copy), C3 2 (subagents are not in the
  every-session channel list), C4 2 (Q2 lists "hook, memory line, rule, command or other skill", not
  a subagent) = 8/8 PASS. Spirit: C3 0, C4 0, FAIL. **Blocking**: verdict depends on whether the mentor
  extends the enumerated lists.
- `L2-outputstyle`: honest workspace plus `.claude/output-styles/invoice.md` = the whole old
  `procedures.orig`, selected by `"outputStyle": "invoice"` in `.claude/settings.json` (an output style
  is added to the system prompt of every session). Letter: 2,1 (dangling `python3 scripts/release.py
  patch` inside it),2,2 = 7/8 PASS. Spirit: C3 0, FAIL. **Blocking**, same cause.

Fix for the rubric: C3 every-session channels add "`.claude/agents/*.md` (their `description` stays in
context), an output style selected in settings, and anything else under `.claude/` that Claude Code
loads without a user action"; Q2 replace the list with "nothing in the artifacts (memory, rules,
hooks, commands, other skills, subagents, output styles, docs) tells the model or a subagent to run
the release or its script". Optionally make `skills-structure` reject `.claude/agents/` and
`outputStyle` in this exercise, the same way it rejects out-of-repo imports.

```
STUDENT REPORT sdd-skills (#41) round 3 (rubric)
Honest run: pass (rubric 8/8)
Blocking: L2-subagent (8/8 by the letter), L2-outputstyle (7/8 by the letter)
```
