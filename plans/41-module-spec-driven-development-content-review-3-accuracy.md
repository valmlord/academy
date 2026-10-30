# #41 judge_content round 3 (confirmation): accuracy

Scope, as Stepan decided: the new L2 import resolver in
`course/ai-for-developers/01-spec-driven-development/02-skills/checks/verify_skills.py` and the replaced
Справка bullet in `02-skills/task.md:136-141`, plus whether any other L2 theory or task sentence
contradicts the new rule. Nothing else was reviewed.

## Checked

1. Quote "a maximum depth of four hops": fetched https://code.claude.com/docs/en/memory on 2026-10-30.
   It says verbatim: "Imported files can recursively import other files, with a maximum depth of four
   hops." The same paragraph says "Relative paths resolve relative to the file containing the import,
   not the working directory", which matches "путь относительно импортирующего файла".
2. "до 5 переходов ... проверка идёт на один шаг дальше": `MAX_IMPORT_HOPS = 5` (verify_skills.py:109).
   `memory_set()` (193-210) runs 5 frontier expansions, so it follows 5 hops. Correct.
3. "Проверка строже Claude Code": the docs say "Import parsing skips Markdown code spans and fenced code
   blocks". `IMPORT_TOKEN` (119) runs over the whole file, code included, with only a letter or digit
   lookbehind. The docs-level behaviour is therefore a subset of what the check takes, so the sentence "в
   том числе внутри обратных кавычек и блоков кода" correctly describes the check as stricter, not
   Claude Code. The glued-Markdown forms (Claude Code's `(?:^|\s)@` on marked text tokens) are covered
   because every `@` not after an alphanumeric starts a token. Overlapping matches come from the
   lookahead capture. The round-5 corpus comparison in demo-B shows 0 missed forms. I did not re-run the
   marked simulation myself.
4. "отрезает `#...`" and "весь путь, и его начало до знака разметки (`*`, `_`, `` ` ``, `)`, `]`, `<`,
   `.` и подобных)": `import_candidates()` (144-149) splits at `#`, turns `\ ` into a space and tries the
   full path plus every prefix that ends before a character in `IMPORT_TOKEN_DELIMITERS`
   (`*_~`<>[]()!\.,;:`). Every listed character is in the set. Correct.
5. "`user@example.com` импортом не считается": the `(?<![A-Za-z0-9])` lookbehind rejects an `@` after
   `r`. In Claude Code, GFM turns a valid email into a link token, and in a text token the `@` is not
   at `^` or after whitespace, so it is not an import there either. The round-5 corpus marks it "equal".
   Correct.
6. Contradictions in the rest of L2: I grepped theory.md, task.md and rubric-skills.md for
   `@`, импорт, кавычк, блок кода and переход. theory.md:98 and :147 ("the import loads together with
   CLAUDE.md"; moving to an import does not slim memory) agree with the docs ("imported files load with
   the CLAUDE.md importing them") and with the rule. task.md:66-67 (no import outside the repository)
   is consistent: an outside `@` path now counts even inside a code span, which is what the new bullet
   announces. The round-5 open item, the old parenthesis "`@` внутри обратных кавычек или блока кода
   импортом не считается", has been removed. No remaining sentence says code-span `@` is ignored by
   the check, and none presents the check's strictness as Claude Code behaviour.

## Note (not a defect)

task.md:139-140 "пробует как файл и весь путь, и его начало" reads a little awkwardly ("как файл" is
redundant). The meaning is clear and correct, so I leave it to pedagogy.

PASS
