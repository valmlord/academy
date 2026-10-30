# #41 judge_content round 3: assessment (confirmation)

Judge: judge-assessment, 2026-10-30. Module `course/ai-for-developers/01-spec-driven-development`.
Scope (Stepan): confirm the fix for round-2 B2 in L2 `checks/verify_skills.py` (demo B "Round 5") and
nothing else. Stepan's decision taken as given: import forms beyond this strict resolver are graded by
the L2 mentor rubric (criterion 3), not blocking. Exec bit: merge condition, noted only.

Verdict: **PASS**. Every Claude Code import form I have, and every new one I derived from its walk,
is counted by the grader. `user@example.com` is not.

Runtime: Python 3.12.13 (`/opt/homebrew/bin/python3.12`), node + marked 17.0.6 (`gfm:false`) for the
model of Claude Code 2.1.267 `RDs` (`scratchpad/ja/r2/sim.mjs`, unchanged since round 2). Round-3
scripts and outputs are in `scratchpad/ja/r2/r3/`.

## 1. What changed
`IMPORT_TOKEN = (?<![A-Za-z0-9])@(?=((?:[^\s\\]|\\ )+))` over the whole file, code included. The
capture is inside a lookahead, so matches overlap: a second `@` inside a longer token starts its own
token. `import_candidates()` cuts at `#`, turns `\ ` into a space, and tries the full path plus each
prefix that ends before one of `` *_~`<>[]()!\.,;: ``. The per-line fence and code-span logic is gone.
This is the superset I asked for in round 2, plus overlapping matches. That is an improvement on my
prototype, which missed `**x**@a**y**@docs/procedures.md`.

## 2. Corpus: checker `imports_of` vs the Claude Code model
`cmp5.py` (workspace path resolved) on my round-2 corpus and the round-2 follow-ups:

| Set | Forms | Equal | Stricter | Missed (CC imports, checker does not) |
|---|---|---|---|---|
| `cases1.json` (round-2 corpus) | 36 | 34 | 2 (`&amp;@`, indented code) | **0** |
| `cases5.json` (trailing Markdown, email, scoped pkg) | 6 | 4 | 2 (`@x.md.`, `(see @x.md)`) | **0** |
| `cases6.json` (double `@`, chained glue) | 3 | 2 | 1 (`@@x.md`) | **0** |

All 22 forms that round 2 found missing are now equal. `user@docs/procedures.md`,
`Contact: user@example.com` and `Use @types/node` import nothing in either the model or the checker.

New forms derived from the walk (`r3/cases7.json`, 37 forms, `r3/cases7.out`). Claude Code runs the
regex on the start of a `text` token, after whitespace, or on the rest of an HTML-comment block once
the comments are removed. In every case below, the raw character before `@` is either whitespace or
the last character of a marked token. Escape, code span, strong/em, link, image, tag and autolink
tokens all end in punctuation, so a lookbehind that excludes only ASCII letters and digits cannot
miss any of them. I checked this on: escaped backslash `x\\@`, `\@`, an `&#64;` entity, link label
and title, image alt, a multi-line comment, two comments in a row, a comment followed by a tag, a
nested quote, ordered lists `1.` and `1)`, `***x***`, `__x__`, `~~x~~`, `</span>`, a double code span,
CRLF, a tight list item with a code span, a comment inside a list item, an HTML block, a reference
definition, a trailing `\`, `\ ` plus glue, an absolute path inside the workspace, `./`, `//` and
`../` segments, a heading and a setext heading with glue, U+001C and NBSP before or after, and a letter
or digit before `@`.
Result: 27 equal, 9 stricter, 1 equal up to representation (the absolute path: same file), **0 missed**.
The one JS/Python `\s` difference, U+FEFF, can end a token in Claude Code but not in the checker.
That path is closed separately: U+FEFF is category `Cf`, which `invisible_characters()` already
rejects in any memory file.

## 3. Full grader, L2 (`jrun.py`: mount = `checks/` without `reference/` and `data/reserve/`)
| Workspace | Exit |
|---|---|
| Untouched starter | 1 (skills missing) |
| Reference (root `scripts/release.py` removed, as the README says) | 0 |
| Round-2 overlays with `docs/procedures.md` = `procedures.orig`: comment glue, strong glue, `<b>` glue, `\:` glue, fence with a backtick info string, code span across a line break, list + strong glue, link glue | **1 each** (69-71 lines, 838-842 words) |
| Controls: plain `@docs/procedures.md`, round-1 `#steps` anchor | 1, 1 |
| Near-misses: `@docs/style.md#intro` (short file), `user@example.com` with the procedures in a root `example.com`, `@docs/my\ style.md` (short file) | 0, 0, 0 |
| Code span naming `docs/procedures.md`: short file / full procedures | 0 / 1 (stricter, by design) |
| New: `**hub**@docs/hub.md` -> hub `<!-- x -->@procedures.md` (transitive) | 1 |
| New: `.claude/rules/x.md` with `paths:` and `_rules_@../../docs/procedures.md` | 1 |
| New: `> > ***x***@`, `x\\@`, `**a**@` + CRLF | 1, 1, 1 |
| New near-miss: the same hub chain, short `docs/procedures.md` | 0 |

Honest variants: student B's L2 solution and student B round-2 copy exit 0. All 8 rubric-demo sets
(honest, weak, borderline, marker-only, session-hook, script-copy, subagent, output-style), assembled
per `rubric-demo/README.md`, exit 0. That matches the README: the command check is a form filter.
(`student-B2/G`, `student-B3/G` are bare starters without skills and exit 1 as expected.)

## 4. `pnpm content:validate`
`content: 1 course(s), 6 module(s), 13 lesson(s), 0 issue(s)`.

## 5. Notes (non-blocking)
1. task.md:135-140 now describes the stricter rule: `@` inside backticks and code blocks counts,
   `#` is cut, and prefixes are tried up to a Markdown mark. It no longer contradicts the check
   (demo B's "open for lesson-author" item is done).
2. Residual, per Stepan's decision: Claude Code's bundled marked version is unknown, and a live
   `claude -p` probe was not run. Any import form outside this resolver goes to rubric criterion 3.
3. Exec bit (merge condition, Stepan): all 8 `stop_tests.py` are still `-rw-r--r--`. Run
   `git update-index --chmod=+x` after `git add`.

## Attribution
None. B2 is closed. Nothing appended to the mistakes files.

PASS
