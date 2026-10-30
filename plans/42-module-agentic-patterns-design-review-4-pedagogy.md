# #42 judge_design round 4: pedagogy

Design reviewed: `plans/42-module-agentic-patterns-design.md`, revision 4 (966 lines, read in full, including section
15). Verdict: PASS. Nothing blocks. Round-3 NB1-NB4 have all landed. The new restrictions are stated to the learner
and do not fail the honest path in this domain. Five non-blocking items follow, about clarity and test coverage.

## Round-3 non-blocking items: verification
1. NB1 `UV_INDEX`: the L4 theory now names `UV_DEFAULT_INDEX` (replaces the default) next to `UV_INDEX` (only adds,
   the public default stays), side by side as `NODE_EXTRA_CA_CERTS` vs `SSL_CERT_FILE` are (design:592-594). Landed.
2. NB2 L1 scored submissions: item 6 says a submission counts only when items 1-5 pass, the check closes after the
   third counted "не пройдено", and neither the check nor the mentor names a card (341-343). "Как работать" adds both
   habits (350-351). Landed.
3. NB3 failure lines: "не выполнено: G5: ..." (645-646), repeated in "Как работать" (693-694). Landed.
4. NB4 G2 asymmetry: recorded in section 13 as intended (926-928). Landed.

## L2 w1: the new restrictions, from the learner's side
**Told in task.md?** Yes. Item 4 (452-458) lists every module, name, attribute and literal of w1 word for word (13
confirms the 2.6 diff), and gives the one `compile` rule with the way out ("`re.compile(...)` after `import re`, so
`from re import compile` fails"). The reason sits in the item's lead clause, "`src/` runs no code without importing
it", and in the theory (364-367): rules checked on import statements are evaded by dynamic execution, so the project
forbids it. The reason is given per group, not per module (NB1).

**Does any rule fail plausible honest code in this domain?** I walked what an honest learner (or the agent working for
them) writes in L2. That is the three fixes (move `format_cents` to `src/shared/`, `repository.ping()`, use
`format_cents`), plus the linter in `scripts/` and tests in `tests/`.
- The scope is `src/` only. Test and script code, where `doctest`, `timeit`, `cProfile` or `pickle` would most likely
  appear, is free.
- `pickle`, `marshal`: the invoice and ledger code has no cache or serialisation step. The starter uses JSON
  (`fixtures/invoices.json`, `export_json` in L3), and none of the three fixes needs persistence. Low risk.
- `doctest`: the risk is the `if __name__ == "__main__": import doctest; doctest.testmod()` idiom, which an agent
  sometimes adds to a new `src/shared/money.py`. It is plausible but rare, and item 4 names `doctest`, so the learner
  can find it with a search. NB1 gives the one-line way out.
- Log message containing "compile": passes. The literal rule is *equal to* `"__import__"`, `"exec"`, `"eval"`,
  `"compile"`, and only `builtins` is matched *containing* (413, 457). `log.info("compile step failed")`, docstrings and
  f-strings pass. The must-pass "no exec here" docstring next to `con.execute` (441-442) shows the equality rule. A
  string containing "builtins" has no use in invoice or ledger code.
- Bare `compile`, `.compile` except `re.compile`: only `import re as regex` / `from re import compile` are affected,
  and item 4 states both. No other `compile` attribute exists in this stack (sqlite3 has `execute`, not `exec`).
- `__loader__`, `__spec__`, `meta_path`, `path_hooks`, `path_importer_cache`: no honest use in this domain.
- Prefix neighbours: `traceback` (error logging in `api.py`) and `codecs` (a BOM in a CSV export) are plausible honest
  imports. They share a prefix with banned `trace` and `code`. The stated rule ("`m` or below") is component-wise, so
  they pass by the text. But no must-pass probe pins this down (NB2). The same goes for a first-party module whose
  name equals a banned one (`src/ledger/profile.py` imported as `from . import profile`), which resolves to
  `ledger.profile` and is not stdlib.

**Is the message enough to fix?** The 01 2.3 convention, inherited by 2.3 here, is "messages name file/field/form,
never the expected value". So a w1 failure names the file and the banned form. That is enough for an honest learner,
because the list is public and a search finds the line. Nothing would leak if the line number and the item-4 clause
were added (NB3).

## L1 s4: 15 words per untagged line, added headings counted
**Stated?** Yes. Item 4 (338-339): "at most 3 untagged lines, each at most 15 words; a heading you add counts as one
(the starter's headings do not)". The 65-word total is not stated, and need not be: it is the grader's derived bound,
not a rule.

**Fair for an honest learner with legitimate notes?** Yes. The honest CLAUDE.md holds the `[R03]` and `[R11]` lines
(each may grow by 10 words) plus up to 3 short lines. For example, "## Commands" (1 added heading) and "Partner contract
PS-2024-07: `legacy_format.py` stays as it is." (9 words, no 6-word run of R07). That fits with room left over. The
outcome is "убирает из памяти всё, что ушло", so a tight budget serves the outcome. The must-passes (an untagged line of
15 words, the starter heading kept, an e-mail address, a paraphrased line) cover the honest corners. Two honest
Markdown habits spend the budget without the learner expecting it: a code fence (```` ``` ```` lines count as untagged
lines, so a fenced `make test` uses 2-3 of the 3) and a list marker counted as a word. Stage 0 is free and names the
item, so this costs a retry, not a submission (NB4).

## L3: new directory under `src/`, egg-info named
Fair. Item 5 (564-566) says "no new file of any extension and no new directory", names the `__pycache__/` exception,
and tells the learner to delete the `src/*.egg-info/` that `pip install -e .` leaves. It gives the reason, too: a
vendored stand-in is incident I02 itself. The message names the path (532-533). The honest fix of `export_json.py`
(stdlib `json`) needs no new file. The other tools a learner may run (`uv sync`, `.venv`, `.pytest_cache`, `build/`)
write at the root, not under `src/`. The one stray honest case would be an editor swap file or `.DS_Store` inside
`src/`. The path in the message makes it a one-step fix (NB5).

## Blocking
None.

## Non-blocking
1. [design:452-458, L2 task.md item 4] lesson-author: add one clause after the module list: "each of these runs code
   handed to it as text, bytecode or serialised objects (`pickle`, `marshal` included); for data use `json`, for
   doctests and profiling use `tests/` or `scripts/`, which this rule does not cover". This turns the list from
   arbitrary into a reason, and it gives the honest `doctest`/`pickle` case its way out.
2. [design:425-442, `arch-workspace-clean` must pass] practice-designer: add must-pass probes `import traceback` and
   `import codecs` in `src/invoices/api.py`, plus a first-party `src/ledger/profile.py` imported as `from . import
   profile`. These pin the component-wise "`m` or below" matching that item 4 promises. A prefix matcher would fail
   honest error-logging code and nothing would catch it.
3. [design:406-416] practice-designer: specify the w1 failure line as `<path>:<line>: <form>` plus the item-4 clause it
   breaks, for example "src/shared/money.py:40: import doctest (пункт 4: модуль, исполняющий код)". The rule is
   public, so nothing leaks, and the learner does not have to search.
4. [design:281-283, 338-339, L1 task.md item 4] lesson-author: add "a word is any run of non-space characters, a list
   marker included; every non-blank line counts, a code-fence line included". practice-designer: the s4 message gives
   the line numbers and word counts of the offending lines. The `[R03]` line carries the command, so a fence is never
   needed.
5. [design:531-533] practice-designer: add one must-fail demo case with an editor artefact (`src/invoices/.export_json.py.swp`
   or `.DS_Store`). This shows that the message names that path, so an honest learner sees what to delete.

## Checked
- Loaded: the role file, `judge_mistakes.md` (applied the 2026-10-30 pedagogy entry: I read item 4 and the w1 message
  as the learner sees them), `learner/profile.md` (Python developer, weak in networking), `learner/journal.md` (no
  entries), and my round-3 report. I re-read `plans/41-...design.md` 2.3 for the inherited message convention ("messages
  name file/field/form"). `_contract.md`, `docs/learning-process.md` and `docs/course-reference.md` were not re-read:
  revision 4 changes no lesson type, check kind or topic mapping (sections 8, 13, 15).
- Round-3 NB1-NB4 against the cited lines (above).
- L2 w1 (406-416) against item 4 (452-458), word for word, both ways. Each banned module, name, attribute and literal
  against the honest L2 path (three fixes in `src/`; linter in `scripts/`; tests in `tests/`) and against the brief's
  examples: `pickle`, `doctest`, a log message with "compile" (passes: equality rule), `re.compile` (passes),
  `import re as r` (fails, stated), prefix neighbours `traceback` and `codecs` (pass by the text, no probe: NB2).
- L1 s4 (281-283) against item 4 (338-339), the must-fail and must-pass lists (300-311), and section 11 rows 7-9. I
  wrote an honest CLAUDE.md variant with R03 and R11 kept, one added heading and one note: within the budget, and no
  s5 run against R07.
- L3 (b) new-file and new-directory rule (531-533) against item 5 (564-566) and row 13. The honest tools: `pip install
  -e .` (named), `uv`, `.venv`, `.pytest_cache`, `__pycache__/` (excepted).
- Time: the new restrictions add no step to the honest path (the starter `src/` has none of the w1 forms, 372-373).
  The totals are unchanged at 315/214 (67.9%), every lesson >= 58%.
- Threat model of record (2.8) applied. No item above asks for machinery against RS1-RS8.

PASS
