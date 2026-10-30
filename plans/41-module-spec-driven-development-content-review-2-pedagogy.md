# #41 content review, round 2: judge-pedagogy

Module: `course/ai-for-developers/01-spec-driven-development`. Scope: the round-1 items (B1, B2, M1,
N1-N8) and rule 2.9 for the "Готово, когда" items changed since round 1 (L2 items 7 and 9, L4 item 8).
Fixed items are not re-opened.
Verdict: PASS. 0 blocking, M1 is still open as a merge condition (Stepan), 2 new non-blocking notes.

## Round-1 items

| Item | Status | Evidence |
|---|---|---|
| B1 L2 `verify` trade-off | fixed | `02-skills/theory.md:112-116` names the trade-off: the commit instructions point to a project skill named `verify`, so tests run before each commit, and the cost is that `/verify` no longer means the built-in app check. A team that wants both uses another name and loses the commit hook-in. Uses only facts already on the page. |
| B2 L2 quiz option c / hook timing | fixed | `theory.md:132-134` quotes the source ("registers when the skill is invoked and keeps running for the rest of the session") and says "включаются при вызове скилла, а не при старте сессии". Every part of `quiz.yaml:61` option c is now on the page, and the explanation (`quiz.yaml:65-66`) matches. |
| M1 exec bit | open, merge condition | `01-verification/task.md:23-24` and `:87` still claim the owner exec bit. I cannot read file modes with my tools. Before the PR, Stepan checks that `git ls-files -s` shows `100755` for the five hook files. Not a FAIL. |
| N1 L2 item 9 | fixed | `02-skills/task.md:72-87`: the four rubric criteria are numbered, and the threshold ">= 70%, no criterion at 0" is stated. |
| N2 L2 item 7 | fixed | `task.md:61-70` lists only the numbers and rules, then points to the reference block. The word and invisible-character definitions moved to "Справка: что считается памятью проекта" (`task.md:140-150`). |
| N3 L3 | fixed | `03-domain-ontology/task.md:39` now reads "вторая строка описания под `# Ledger`". |
| N4 L4 ADR | fixed | `04-spec-adr-tasks/theory.md:86-87`: "В ADR называют и отвергнутый вариант, и почему его не взяли". |
| N5 L4 help flag | fixed | `04-spec-adr-tasks/task.md:77-81` gives the rejected forms with examples (`-h`, `--help`, the prefixes, `-vh`), says letters after `-k/-s/-p/-t` are the option's value (`-k test_req_05`, `-kh` accepted), and covers quotes. |
| N6 L6 bugs.yaml | fixed | `06-pipeline-bug-hunt/checks/bugs.yaml:19-26` has the mentor note for lines 340-345 (no range, no decoy, both readings defensible, discuss the Stop-hook continuation). Header rules 1 and 4 (`:9-16`) now match `task.md:24-33`, including the requirement-restoring exception and "a green run before the last edit does not count". |
| N7 section order | fixed | L5 (`task.md:120`, `:136`), L6 (`:84`, `:91`), L7 (`:220`, `:232`): "Как работать" comes before "Попытки и подсказки", the same order as L1-L4. |
| N8 L2 quiz dashes | fixed | `quiz.yaml:48` reads "Редкая процедура с последствиями это скилл". No " - " dash remains in the explanations. |

## Rule 2.9 re-check of the changed items

- **L2 item 7 vs `verify_skills.py:50-56, 508-570`.** The numbers match: 20 non-empty lines, 250 words,
  test command required, at most 20 shared 6-word sequences, out-of-repo `@` imports rejected, and any
  line with an invisible character fails, with a message that names the line and the code point. The
  reference block matches the checker too: words split on `_`, lower-to-upper case changes and
  letter/digit boundaries; case and punctuation are ignored; the test command is removed before the
  overlap count (`words_of`); the invisible set is Cf, the Hangul fillers incl. U+3164, U+034F and the
  variation selectors. Holds (one omission, see N9).
- **L2 item 9 vs `checks/rubric-skills.md` and `lesson.yaml:66-81`.** The four criteria match rubric
  sections 1-4: complete procedures beyond the item-6 markers; no copy of the script in any form, no
  dangling call, and `${CLAUDE_SKILL_DIR}`; no every-session channel by any mechanism, with short facts
  and one pointer line per skill allowed; Q1 to Q3 of who invokes each skill. The threshold matches
  `passScore: 0.7` and the rubric's "no criterion at 0". The "Как проверяется" artifact list
  (`task.md:158-159`) matches the new `skills-rubric` artifacts (`.claude/**`, CLAUDE/AGENTS at any
  level, `scripts/**`, `docs/**`, `**/*.py`, `**/*.txt`, root `*`). Holds (one mismatch on the rubric
  side, see N10).
- **L4 item 8 vs `verify_sdd.py:46-85` `is_help_option`.** Quotes are stripped, and the long forms are
  exactly `--h/--he/--hel/--help`. A short group is rejected only when `h` comes before the first
  `[kspt]`, so `-vh` is rejected and `-kh` and `-k test_req_05` are accepted, as the text says. The
  forbidden-character list matches `CHECK_COMMAND`. Holds.

## Non-blocking (new, practice-designer)

- **N9. L2 `task.md:140-141`, word rule.** `split_run` (`verify_skills.py:495`) also splits at the end of a
  capital run before a lower-case letter (`HTTPServer` -> `HTTP`, `Server`). The reference block does not
  say this. The word count changes by at most one per acronym, and no honest memory file gets near
  250, so the effect is minor. Either add "`HTTPServer` это два слова" or leave it as accepted.
- **N10. L2 `checks/rubric-skills.md:3-5`.** The rubric's own artifact sentence does not name `.txt`
  files outside `.claude/`, `scripts/`, `docs/` and the root. `lesson.yaml` (`**/*.txt`) and
  `task.md:159` both include them. The grader gets the files either way. Align the sentence when the
  file is next touched.

## Checked

Every round-1 item at its cited line. L2 theory, task and quiz in full. `lesson.yaml` checks.
`rubric-skills.md` in full. `verify_skills.py` constants and `check_memory`/`words_of`/invisible
logic. L4 task in full and `verify_sdd.py:40-85`. L3 task:39. L4 theory:84-88. L6 bugs.yaml header and
task.md:20-39. The section headings of all seven task.md files.

PASS
