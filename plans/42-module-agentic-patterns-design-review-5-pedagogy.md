# #42 judge_design round 5: pedagogy

Design reviewed: `plans/42-module-agentic-patterns-design.md`, revision 5 (1079 lines, read in full; section 15 and
section 11.2 checked against the body). Blocking rule of round 5 applied (Stepan, 2026-10-30): block only on (a) a
regression from the revision-5 fixes, learner-facing wording included, (b) an honest correct solution that a check
fails, (c) a bypass from the in-scope list of 2.8. Verdict: PASS. Nothing blocks.

## Round-4 non-blocking items: verification
1. NB1 (reason for the w1 module list, and the way out): landed. L2 item 4 (design:497-501) now says "each of these
   runs or compiles source, or loads code or objects that can run code, handed to it as text, bytecode or serialised
   data; for data use `json`; doctests and profiling belong in `tests/` or `scripts/`, which this rule does not cover".
2. NB2 (must-pass prefix neighbours and a first-party `profile`): landed. Must pass has `import traceback, codecs` in
   `api.py` and `from . import profile` of a first-party `src/ledger/profile.py` (484-485). w1 states whole-component
   matching (432-433). Row 18 shows PASS on both the r4 and the r5 rule.
3. NB3 (w1 message with line and item-4 group): landed. The format is `<path>:<line>: <form> (пункт 4: <group>)`
   (447-449). Item 4 ends "the message names the file, the line and the form" (506). Row 18 shows the real output.
4. NB4 (definition of a word, fence lines, s4 message with line numbers): landed. It appears in s4 (301-304) and in
   item 4 (360-362), word for word. Must pass has `[R03]` plus a fenced `make test` (332-333). Row 21 shows the
   message "строка 5: 16 слов" and 14/14 honest cases passing.
5. NB5 (editor-artefact demo case): landed. Must fail has `.DS_Store`, `export_json.py~` and `.export_json.py.swp`,
   each named in the message (592-594). Item 5 names them (619-620). Row 20 shows the path in the message.

## Revision-5 fixes from the learner's side (regression hunt)
- **L2 w2 `__file__` rule** (450-457, item 5 at 506-510). The task text states it plainly: "loads no code from
  `src/invoices/`, whatever name it is imported under (adding `src/invoices` to `sys.path` and importing `money`
  counts)". The theory introduces the `sys.path` evasion before the check needs it (390-392), so no concept is used
  before it is taught. The honest path is `format_cents` in `src/shared/money.py`, with `invoices.money` re-exporting
  it, or a copy in `ledger`. Neither loads a file under `src/invoices/` from `ledger`, and both are must-pass. Not a
  regression.
- **Runner tampering rule (2.3)**. The callable/descriptor identity rule fixes the round-4 honest failures (7 of 21
  in r4, 21/21 in r5, row 17). For an honest learner this is a strict improvement: `assertLogs`, `mock_open`,
  ResourceWarning and a returning test method all pass now. The task wording "replaces a function or class of
  `unittest`" is a little narrower than the rule, which also catches *added* and *removed* callables (NB2 below). An
  honest agent-written suite subclasses `TestCase` and does not monkeypatch it, so (b) does not apply.
- **w1 literal narrowed** (441-444, item 4 at 504-505). This is looser than revision 4, so an honest program cannot
  fail where it passed before. The docstring "do not shadow Python builtins such as sum" is now must-pass.
- **w1 module-list reason** (item 4). It is accurate enough for a learner, and it keeps the w1 list and item 4
  identical (13: 2.6 diff). The long sentence is a readability matter (NB4).
- **L3 OS and editor files**. These were already a failure in r4 (row 20: "(b) -> (b)"). What r5 adds is the named path
  and "delete it", so the learner gets more help and nothing becomes stricter. Item 5 states the rule. The workspace
  runs in a Linux image, where `.DS_Store` is rare.
- **L3 / L2 `make codegen` must-pass**. This removes a would-be honest failure: a learner who runs `make codegen`
  after the pristine set lists `generated/`. Good.
- **L1 starter CLAUDE.md is headings, tagged lines and blanks only** (252-254). The learner's 3-line s4 budget is no
  longer spent by the starter. Good.
- **L4 brief: uv config files at every level do not count** (667-669, G4 cell 688). It is stated in the brief, and the
  general rule says the check reads only `launcher.env` and the three settings files (736-738). It fits the existing
  "terminals read only `launcher.env`" logic. The sentence stacks three reasons in one line (NB5). There is no honest
  regression: the accepted forms in `launcher.env` are unchanged (row 19 must-pass).
- **Bypass list (c)**. No in-scope class lost its must-fail probe. w1 keeps every r4 probe (row 18 re-run, 57 cases),
  plus three literal-key probes. w2 adds the three `sys.path` forms. The suite runner keeps its attack corpus with the
  same verdicts (row 17). L3 (b) adds three new-file probes.

## Blocking
None.

## Non-blocking for practice-designer / lesson-author
1. [design:447-449, row 18] practice-designer: the observed w1 message starts with `(w1) `, a grader-internal label
   that the learner never sees in task.md. Drop the prefix, or print "пункт 4", which the message already carries.
   Also take each group label verbatim from item 4's own phrases. Then `import pickle` is labelled with "loads code or
   objects that can run code", not with "исполняет или компилирует код". Define one label for each item-4 group:
   modules, names, attributes, literals, `compile`.
2. [design:77-78, L1 item 10, L2 item 7, L3 item 7] lesson-author: the 2.3 task.md line ("a test marked skipped or
   expected-failure counts as not passed; a test that replaces a function or class of `unittest` itself fails the
   run") is not written into those three "Готово" items. Carry it into all three (2.6). Say "adds, replaces or
   removes", to match the `tampered` rule.
3. [design:497-501, L2 item 4] lesson-author: "a name is matched whole" may read as if a first-party
   `ledger/profile.py` were banned. Add "relative imports are resolved, so your own `from . import profile` is fine".
   One more honest case is not covered by the way-out sentence: `importlib.metadata.version(...)` or
   `importlib.resources` for a version string or a data file in `src/`. Add "for a version or a data file, use a
   constant or a path next to `__file__`".
4. [design:497-506] lesson-author: item 4 is one 10-line sentence. In task.md, set it as a sub-list: modules (with
   the reason and the way out), names, attributes, literals, the `compile` rule, the message. The wording stays as it
   is.
5. [design:667-669] lesson-author: split the brief's uv sentence. One sentence for "terminals read only
   `launcher.env`". A second for "uv config files (`pyproject.toml`, `uv.toml`, project, user or system) do not count
   on the team's machines".
6. [row 21] practice-designer: the s4 message in the harness is half English ("untagged line over 15 words"). The
   shipped message is Russian, as in 01 2.3.

## Checked
- Loaded: the role file, `.claude/feedback/judge_mistakes.md` (applied the 2026-10-30 pedagogy entry: I read item 4,
  item 5 and the w1/w2/L3 messages as the learner sees them, and for each outcome verb checked that the work stays
  with the learner), `learner/journal.md` (no entries) and my round-4 report. `learner/profile.md`, `_contract.md`,
  `docs/learning-process.md` and `docs/course-reference.md` were not re-read. Revision 5 changes no lesson type,
  check kind, weight, duration or topic mapping (section 15 opening). I confirmed that sections 7, 8 and 13 are
  unchanged against the reference mapping.
- Round-4 NB1-NB5 against the cited lines and rows 18, 20 and 21 (above).
- Each item of section 15 (assessment B1, B2, NB1-NB5; accuracy NB1-NB4; pedagogy NB1-NB5) against the body. All are
  present where cited. 103 L4 cases = 98 + 4 (r4) + 1 (r5).
- The 2.6 diff, both ways, for the revision-5 rules. w1 against item 4: modules, whole-component matching, names,
  attributes, narrowed literals, `compile`, the message. They agree; the only gap is the first-party `profile` note
  (NB3). w2 against item 5. L1 s4 against item 4. L3 (b) against item 5. The L4 brief against the general rule. The
  2.3 tampering line is missing from the lesson items (NB2; it predates r5).
- The honest path per lesson under the r5 rules. L1: `[R03]` with a fence. L2: `shared/money.py` re-export,
  `repository.ping()`, `re.compile`, `traceback`/`codecs`, `make codegen`. L3: `json.dumps` fix, `make codegen`,
  `__pycache__/`. L4: `UV_DEFAULT_INDEX` in `launcher.env`. Suite: the 21-case honest corpus (row 17).
- In-scope bypass classes (2.8) against the must-fail lists of L1, L2 and L3. No probe was dropped.
- Time: no new honest step. The totals are unchanged at 315/214 (67.9%), and every lesson is >= 58%.
- Threat model of record applied. No item above asks for machinery against RS1-RS8.

PASS
