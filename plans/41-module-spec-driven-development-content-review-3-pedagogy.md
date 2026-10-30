# #41 content review, round 3 (confirmation): judge-pedagogy

Scope (Stepan's decision): the strict `@` import resolver in L2 `02-skills/checks/verify_skills.py`
(demo-B record "Round 5") and the replaced import bullet in `02-skills/task.md` "Справка: что считается
памятью проекта". Nothing else is re-opened. Round-2 N9/N10 stay non-blocking as recorded.
Verdict: PASS. 0 blocking, 1 non-blocking note (N11).

## 1. Is the new bullet clear to the learner

`task.md:136-141` says: the set is every file reached by `@путь` from a memory file, up to 5 hops,
relative to the importing file; the check is stricter than Claude Code and takes every `@` not preceded
by a letter or digit, "в том числе внутри обратных кавычек и блоков кода"; it cuts `#...` and tries both
the whole path and its prefix up to a markup character; `user@example.com` is not an import.

A learner can predict from this the one fact that matters for an honest solution: writing `@` in front
of a path anywhere in a memory file, code span included, adds that file to the memory budget. The old
false parenthesis (code spans not counted, flagged as open in the Round 5 record) is gone, and no other
L2 page repeats it (`theory.md:98-100` and `:147` speak about `@`-imports in general only).

## 2. Rule 2.9: "Готово, когда" item 7 vs the check

| Text | Code | Holds |
|---|---|---|
| item 7: the set is defined in the reference block | `check_memory` uses `memory_set()` only (`verify_skills.py:526-527`) | yes |
| "каждый `@`, перед которым нет буквы или цифры", code included | `IMPORT_TOKEN` `(?<![A-Za-z0-9])@` over the whole text, no fence or span logic (`:119`, `:169`) | yes |
| "отрезает `#...`" | `token.split("#", 1)[0]` (`:147`) | yes |
| "весь путь, и его начало до знака разметки" | full path plus every prefix ending before `IMPORT_TOKEN_DELIMITERS` (`:122`, `:148`) | yes ("и подобных" covers `~ > [ ( ! \ , ; :`) |
| up to 5 hops, relative to the importer | `MAX_IMPORT_HOPS = 5`, `path.parent / candidate` (`:109`, `:175`, `:199`) | yes |
| `user@example.com` not an import | lookbehind rejects a letter before `@` | yes |
| item 7 bullet 4: `@~/...`, absolute outside, `@../` out of the repo rejected | `leaves_workspace` on the full path, message names importer and token (`:152-157`, `:529-533`) | yes |

Not stated: `\ ` is turned into a space (`:147`). An honest memory file does not contain it; accepted.

## 3. Can an honest learner still pass without surprise

Corners walked:
- Pointer lines without `@` (`скилл verify`, `/verify`, `.claude/skills/verify/SKILL.md` in a code span):
  no token, pass.
- `@verify` or `@.claude/skills/verify`: candidates are not files (`is_file()` false), ignored, pass.
- Python decorators in memory (`` `@unittest.expectedFailure` ``): candidates `unittest...` do not exist,
  ignored, pass. The starter memory files contain no `@` token at all (grep over `02-skills`).
- `` `@.claude/skills/verify/SKILL.md` `` in a code span (Claude Code would not import it): now counted,
  the skill body enters memory and the line/word/overlap limits fail. This is the case the scope names.
  It is not a surprise: the bullet says code spans count, and the failure message lists the memory set
  by file name (`:528`, `:542`), so the learner sees which file got pulled in. Rubric criterion 3
  already steers away from importing procedures, so an honest learner has no reason to write it.
- An out-of-repo path written as documentation in a code span (`` `@~/...` ``): reported, with the
  importer and token named. Consistent with item 7 plus the reference block; unlikely in an honest file.

Honest-solution evidence is the Round 5 record (L2 reference on 3.12 and 3.11, student B's solution,
student round-2 honest copies pass; 258 command cases, 0 mismatches). I did not run the grader; my code
reading agrees with the record on every corner above.

## Non-blocking (lesson-author)

- **N11. `task.md:139-140`, word order.** "пробует как файл и весь путь, и его начало до знака
  разметки" reads awkwardly ("как файл" before the pair). Suggested: "и пробует как файл и весь путь,
  и каждое его начало, которое кончается перед знаком разметки (...)". "каждое" also matches the code,
  which tries every such prefix, not one. Fix when the file is next touched.

## Exec bit

Merge condition handled by Stepan (L1 hook files `100755`). Note only, not reviewed.

## Checked

`02-skills/task.md` in full; `theory.md:94-100` and the `@`/импорт mentions in L2 (grep);
`verify_skills.py:100-210` (resolver) and `:500-583` (`check_memory`, messages); demo-B "Round 5";
starter memory files for `@` tokens; round-2 pedagogy review.

PASS
