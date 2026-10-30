# #41 judge_content round 2: assessment

Judge: judge-assessment, 2026-10-30. Module `course/ai-for-developers/01-spec-driven-development`.
Inputs: my round-1 report, demo B "Round 4", the current module files. Stepan's decisions (cap 10 +
uncounted stage 0, K = 1, residuals (iii), (iv), 11.2, L2/L4 obfuscation classes graded by mentor
rubrics) were taken as given and not re-opened. Fixed items were not re-opened.

Verdict: **FAIL, 1 blocking issue** (B1 is closed for the forms I named, but the same class is still
open through the Markdown token walk Claude Code applies before its regex).

Runtime: my round-1 driver `scratchpad/ja/jrun.py` (mount = `checks/` without `reference/` and
`data/reserve/`, asserted; fresh starter, plus reference and overlays), Python 3.12.13
(`/opt/homebrew/bin/python3.12`). Round-2 scripts are in `scratchpad/ja/r2/`.

## 1. `pnpm content:validate`
`content: 1 course(s), 6 module(s), 13 lesson(s), 0 issue(s)`.

## 2. Starter must fail, reference must pass (re-run, all 9 command checks)
| Check | Untouched starter | Reference |
|---|---|---|
| L1 late-fee-verified | exit 3 | exit 0, 1.3 s |
| L1 stop-hook-tests | exit 3 | exit 0, 1.8 s |
| L2 skills-structure | exit 1 | exit 0 (root `scripts/release.py` removed, as README says) |
| L3 glossary-structure | exit 1 | exit 0 |
| L4 sdd-artifacts | exit 1 | exit 0 |
| L5 reminders-accepted | exit 3 | exit 0, 1.4 s |
| L7 artifact-linter | exit 1 | exit 0 |
| L7 change-request-applied | exit 3 | exit 0 |
| L7 stop-hook-integrity | exit 1 | exit 0, 2.5 s |

## 3. Round-1 cheats against the fixed grader (L2 reference + `procedures.orig` overlay)
- `Team conventions: @docs/procedures.md#steps`: exit 1 (69 lines, 840 words). Closed.
- `See @docs/proc\ edures.md`: exit 1 (69 lines, 839 words). Closed.
- Control, plain `@docs/procedures.md`: exit 1.
- Near-misses: `@docs/style.md#intro` (short file) exit 0; `user@example.com` with a root `example.com`
  holding the procedures exit 0; `` `@docs/procedures.md` `` in a code span exit 0; `@docs/my\ style.md`
  (short file) exit 0.

## 4. Blocking

**B2 (L2 `skills-structure`, practice-designer B): Claude Code runs the import regex on Markdown
`text` tokens, not on raw lines. Eight forms that Claude Code imports pass the check.**

Source: the installed binary 2.1.267 (`strings`). `eRr` lexes the file with `new Tv({gfm:!1}).lex(p)`
(marked); `RDs` walks the tokens, skips `code` and `codespan`, runs the regex on `y.text` of every
`text` token, recurses into `tokens`/`items`, and for an `html` token that starts with `<!--` runs the
regex on the raw text with the comments removed. Consequences:
- A `text` token starts right after a strong/em span, an HTML tag, an escape, a link or image, so
  `(?:^|\s)@` matches at `^` of that token even though the raw line has no whitespace before `@`.
- `<!-- c -->@x`: the comment is removed, and `@x` is then at the start of the string. The round-4
  record lists "HTML comments in memory are not stripped" as stricter-only; here it is the opposite.
- The checker's per-line `INLINE_CODE` and `FENCE` toggles disagree with CommonMark: a backtick fence
  whose info string contains a backtick is not a fence; a shorter fence inside a longer one does not
  close it; a code span can cross a line break and needs an equal-length closer.

I compared the checker's `imports_of` against a re-implementation of `RDs` on marked 17.0.6
(`gfm:false`) over 39 forms (`r2/sim.mjs`, `r2/chk.py`, `r2/cmp.py`): 22 forms are imported by Claude
Code and missed by the checker. I ran 8 of them through the full `verify_skills.py` on the L2 reference,
with `docs/procedures.md` = `procedures.orig`. **Every one exits 0** ("Пройдено"), and the plain control
exits 1:

| Line added to the reference `CLAUDE.md` | Grader |
|---|---|
| `<!-- team conventions -->@docs/procedures.md` | exit 0 |
| `**Team conventions:**@docs/procedures.md` | exit 0 |
| `Team conventions: <b>@docs/procedures.md` | exit 0 |
| `Team conventions\:@docs/procedures.md` | exit 0 |
| ```` ```oops` ```` / `@docs/procedures.md` / ```` ``` ```` (three lines) | exit 0 |
| ``Run `make`` / `` ` @docs/procedures.md ` `` (code span across a line break) | exit 0 |
| `- **Team conventions:**@docs/procedures.md` | exit 0 |
| `See [team](https://example.com)@docs/procedures.md` | exit 0 |

The comment form follows from the binary's own code with no marked subtlety: an HTML block that starts
with `<!--` is the whole line, the comment is removed, and `@docs/procedures.md` matches at `^`.
Caveat: a live `claude -p` probe was not possible (OAuth session expired), and CC's bundled marked
version is not known; the token-boundary forms rely on standard marked behaviour (consecutive `text`
tokens are merged, `strong`/`em`/`html`/`escape`/`link` are not), which the binary's `inlineText` and
`escape` tokenizers match.

This is the same class as round-1 B1: task.md (Справка, "каждый файл, до которого доходит импорт
`@путь`") promises the count and the check enforces it itself. It is not an accepted obfuscation class.

Fix (sketch, verified on the 39-form corpus, `r2/proto.py`): stop trying to reproduce marked and use a
superset that is stricter by construction. Match `(?<![A-Za-z0-9])@((?:[^\s\\]|\\ )+)` anywhere in the
file, code included. Cut at `#`, turn `\ ` into a space, and try the token and every prefix that ends
before a Markdown delimiter (`` *_~`<>[]()!\ `` and `.,;:`) as a file. The prototype covers all 22
forms plus `@docs/procedures.md**now**` and `@docs/procedures.md[x](y)`; `user@...` still does not
import. Two consequences for the designer: task.md's "`@` inside backticks or a code block is not
counted" sentence must go (the check would count it, stricter), and the code-span near-miss becomes a
fail, which only matters if the learner keeps a big file at that path. Add the 8 rows above as
must-fail cases. If the designer keeps a parser instead, every form in `r2/cmp.py` must be covered.

## 5. Non-blocking items from round 1
1. **Exec bit: still open (merge condition, Stepan).** All 8 `stop_tests.py` are `-rw-r--r--` and
   untracked, so `git ls-files -s` shows nothing yet. `git update-index --chmod=+x` after `git add`.
2. **L2 rubric artifacts: fixed.** `lesson.yaml` now lists `.claude/**`, `CLAUDE.md`, `**/CLAUDE.md`,
   `**/AGENTS.md`, `scripts/**`, `docs/**`, `**/*.py`, `**/*.txt`, `*`; this matches the rubric's
   "everything under `.claude/`".
3. **L1 `enforce-not-ask`: fixed.** The CI option is gone; d is now "/goal ...", a plausible distractor
   that theory.md:27 and :143 rule out ("он читает разговор и ничего не запускает"). Key `[a, c]`, both
   in the options; the explanation covers every option.
4. **L2 `third-party-skill-risks` option c:** the text matches theory.md:132-134 (hooks registered on
   invocation, kept for the rest of the session). Key `[a, c, d]` is valid; b is false per theory
   ("тот же доступ к сети"). Quiz audit re-run on all 5 graded quizzes: 6 questions each (4 single + 2
   multiple), single keys at positions a/b/c/d once each, every key inside its options, an explanation
   on every question, 5/6 bar. The "uniquely longest" counts are as in round 1.

## Attribution
B2: practice-designer B (owner of L2 `verify_skills.py`); the fix followed my round-1 prescription
("tokenize exactly as Claude Code does"), and the gap is in what the regex is run on, which the
designer's own record names ("walks Markdown text tokens") but did not model. Lesson appended to
`.claude/feedback/practice-designer_mistakes.md`.

FAIL
