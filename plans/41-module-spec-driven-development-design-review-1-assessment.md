# #41 design review, round 1: judge-assessment

Reviewed 2026-10-29: design revision 1 (`plans/41-module-spec-driven-development-design.md`, read in full),
R, RA, schema.ts, ADR-0001 contract summary, `plans/15-module-introduction-design.md` 2.1-2.5 and L6, module 00
check scripts (`02-agent-loop/checks/test_harness.py`, `06-permissions-security/checks/verify_hook.py`,
`05-memory-agents-md/checks/verify_memory.py`), module 00 starter layout. Verdict: FAIL, 8 blocking items.

## What I checked and ran
- `pnpm content:validate` (after an offline `pnpm install` in this worktree): `1 course(s), 6 module(s), 6 lesson(s), 0 issue(s)`.
  Nothing of module 01 is built (module.yaml `status: planned`), so no starter/reference runs are possible yet.
- Inventory: command x9 (L1 2, L2 1, L3 1, L4 1, L5 1, L6 3), quiz x5 (L1, L2, L3, L4, L6), rubric x2 (L3, L4),
  bug-hunt x1 (L5). Matches section 0. Every quiz has exactly 2 `multiple` topics. Lesson types and check kinds
  are all in the schema; every lesson with a command check has `workspace`.
- Empty starter fails, as specified, for all 9 command checks (defective L1 code and agent tests, unregistered
  skeleton hook, no skill dirs, heading-only glossary/spec, `NotImplementedError` stubs, L6 starter hook that
  does not call the linter). Reference passes as specified except B8.
- Quiz arithmetic (Fraction, exact): 4 single + 2 multiple, pass 5/6: 0.1211% per attempt, 0.3628% over 3. Correct.
- Bug-hunt arithmetic, exact enumeration of every allocation of <= 7 reports (distinct blocks per category,
  1 range + 3 decoys x5, 2 ranges + 6 decoys for `skipped-red`): best is one report per category, 19/4096 =
  0.4639% per attempt, 1.3852% over 3; next best (one category doubled, one skipped) 1/512 = 0.195%. Full product
  4^5 x 8 = 8192 sets with 38 passing: confirmed. Alternative 28 decoys: 0.16% / 0.479%. All design figures correct;
  the cumulative 1.39% is recorded as an open item (11.3), same footing as 00.
- Vendor quotes in 2.8 and L2 against RA A1-A6: matcher "silently ignored", BP "For real enforcement...", `async`,
  `asyncRewake`, `if`, `once`, `shell`, `continue` "Takes precedence...", `decision` only `"block"`, `reason`
  "Required...", `additionalContext`, timeout "discarding the hook's output", exit 2 + JSON "uses that decision's
  reason instead", other exit + JSON "the fields alone decide", the missing-file exception, `stays put` / `follows
  Claude`, Stop payload fields, S boolean spellings, 20 CC fields, PBP chain rule. All match the addendum verbatim.
- unittest behaviour (scratch, CPython 3.11 and 3.12): see B7.
- PyYAML 6.0.3 on the frontmatter forms the 2.3 subset accepts: see B3.
- 2.6 attack simulation (scratch toy: reference, 3 structurally different equivalents, 6 mutants, a bootstrap
  writing the record to a `pass_fds` pipe, a grader that names failing tests on correct variants): see B1.
- Leak guard: no visible artifact in the design needs the substring "checks/"; bootstrap in `checks/fixtures/`
  copied to a private temp dir (00 L2 precedent). See N12 for answers visible through later starters.

## Blocking items

### B1. 2.6: the correct variants' fingerprints are learnable through the failure messages (source pinning passes)
Attack (run in scratch, PASS): submission 1 is a test file with 4096 generated tests `test_h_<xyz>`, each failing
iff the first 3 hex digits of sha256 of `late_fee.__file__` equal `<xyz>`. The message "тест падает на верной
реализации" names the failing tests on the reference and every equivalent, so one run reveals all four
fingerprints (`811 bf7 e27 fa5` in the toy). Submission 2: three tests, one asserting the hash prefix is in that
set. Result: passes reference and equivalents, kills every mutant, `testsRun >= 3`, no skips, no behavioural
assertion. Command checks have no cap, so two submissions suffice. The design's "source pinning fails
equivalents" and 2.3's "messages that name a surviving mutant need no cap" both assume fingerprints cannot be
learned; the per-test messages make them learnable. File size works the same way.
Required change: (1) every variant (reference, equivalents, mutants) is rewritten per run by a
behaviour-preserving transform (rename every non-public identifier, random comment and blank-line padding, a random
dead module constant), so no source, size, hash or `co_*` fingerprint is stable across runs; (2) add the two-submission
fingerprint attacker above to the 2.6 demo items as must-fail; (3) correct the 2.3 "need no cap" reasoning.

### B2. Traceability (L5 (B), L6 (B), C3) is bypassed by one test name carrying every id
2.7 allows "several `req_NN` parts" per name with no limit; 2.6 counts a mutant killed if "at least one failing test
name contains `req_NN`". One behavioural test named `test_req_01_req_02_req_03_req_04_req_05_req_06_req_07_req_08_all`
fails on every mutant and satisfies every label, C2 and C3. The must-fail "REQ labels swapped" is then unreachable
in principle for such a suite. This is the cheapest attacker for the traceability part and the design does not list it.
Required change: cap `req_NN` parts per test name (<= 2, consistent with the `req_02_req_05` near-miss), add the
all-ids name to the L5 and L6 must-fail lists, and either add a precision rule (demonstrated on the reference tests
and the student honest run, tolerant of honest cross-failures) or record "each test asserts everything, labels spread"
as a named residual in section 11.

### B3. 2.3 frontmatter subset passes files Claude Code cannot parse, and fails valid ones
PyYAML 6.0.3: `description: Use when: tests fail` -> ScannerError ("mapping values are not allowed"); S says
unparseable frontmatter loads "with no fields set", so a `release` skill with such a description and
`disable-model-invocation: true` is model-invocable in CC, yet the subset (split on the first `: `) passes it. That is
the O2 decision silently lost. Conversely `disable-model-invocation: true # human only` is `True` in YAML, but the
subset reads `true # human only` and fails it as "not a documented boolean spelling".
Required change: the subset rejects a plain scalar that contains `: ` or ` #`, or starts with a YAML indicator
(`[ { & * ! | > ' " % @` backtick), with "quote the value" (never a CC claim), or strips ` #` comments as YAML does;
add `description: Use when: ...` unquoted to the L2 must-fail list and the comment form to near-miss or must-fail,
whichever the rule picks.

### B4. L2 CLAUDE.md check reads only CLAUDE.md; moving the procedures into an always-loaded file passes
"<= 20 non-empty lines; <= 2 normalized lines shared with the pristine procedure blocks" applies to `CLAUDE.md`
alone. Putting the 40-line release procedure in `docs/release.md` imported with `@docs/release.md`, or in
`.claude/rules/release.md` without `paths:`, passes, although both load every session (00 L5 taught "`@` imports, no
context saving"; 00 `verify_memory.py` already resolves the memory set with `@` imports up to 5 hops).
Required change: apply the line limit and the overlap rule to the 00 L5 memory set with the same resolver; add both
moves to the must-fail list.

### B5. C6 and test-name extraction have no single resolver; the stated cases contradict each other
2.7: "Russian prose is not scanned"; C6: "no `_Avoid_` word ... occurs as a whole word, case-insensitive, in spec,
tasks or test names". L6 clean root (must exit 0): "an avoided word ... inside Russian prose"; L4 must-fail:
"`client` in a requirement" (a REQ line can be Russian prose with English terms). An English avoided word inside a
Russian sentence is a whole word to any tokenizer, so the two rules give opposite verdicts and an honest learner
linter cannot satisfy both. Also undefined: which regions are scanned (headings, REQ lines, task titles, `Check:`
commands), the word tokenizer next to Cyrillic, multi-word `_Avoid_` entries (never match a `_`-split test name),
and how test names are found (static AST `def test_*` for C2/C3/C6 vs `TestCase.id()` from the 2.6 record; they
differ for generated or `subTest` tests).
Required change: write one resolver spec in 2.7 (scanned regions, tokenizer `[A-Za-z]+` with its boundary rule,
single-word `_Avoid_` entries, test-name extraction by AST over `tests/test_*.py` at module and class level, the
`req_NN` regex), use it in every grader rule L4-L6, put it verbatim in L6 task.md, and give each boundary a clean and a
corrupted root.

### B6. Grader integrity rules read files the learner may edit
L5 (C) and L6 (C) run C6 "on the workspace": the glossary is editable, so deleting `client` from an `_Avoid_` list
makes C6 clean (00 2.3: expected values never from editable workspace files). L6 must-fail "the new requirement reusing
REQ-08's id" has no rule that catches it: replacing REQ-08's text with the dispute rule keeps ids unique, C1-C6 clean,
the dispute mutant killed by `req_08` tests, and (A) still green if REQ-08's behaviour is kept in code.
Required change: C6 in L5/L6 reads the pristine glossary from `checks/data/`; L6 compares against the pristine L5
spec: REQ-01..REQ-08 lines present and unchanged (normalized), exactly one new REQ line, id not in the pristine set,
mentioning `Dispute`/`disputed`; add "REQ-08 text replaced" and "`_Avoid_` word deleted" to must-fail.

### B7. The test command and the 2.6 bootstrap do not import the `src/` layout (concurs with accuracy B4)
Scratch run on a module-00-shaped project (`src/invoices/`, `tests/` without `__init__.py`):
`python3 -m unittest discover -s tests -t .` -> "ImportError: Start directory is not importable" (3.11, 3.12);
with `tests/__init__.py` -> "ModuleNotFoundError: No module named 'invoices'"; module 00's `tests/test_api.py` is
pytest-style and not collected by unittest; the image has no pytest. For assessment this means: the reference hook
on the real workspace is red forever, while the grader's fixture P may be built importable, so the check would pass a
hook that never works in the learner's repo; `discover(<tmp>/tests, top_level_dir=<tmp>)` cannot import
`invoices.late_fee` unless the bootstrap adds `<tmp>/src`.
Required change: fix the layout and command (accuracy B4), state the bootstrap's `sys.path`, build P and the 2.6 temp
project with the workspace's exact layout, and add a demo item running the reference hook on the real L1 reference
workspace (red and green).

### B8. Block rows without a failing test have an unsatisfiable pass rule
2.8 rule 5: a block row passes "iff ... its reason contains the random failing test name". L1 row 3 (`Ran 0 tests`)
and L6 row 5 (stub exit 2, usage line) have no failing test, so the reference cannot pass them as written.
Required change: state each such row's reason requirement (e.g. a random token in the fixture's empty-suite marker or
in the stub's usage line that must reach the reason), and add an attacker for it.

## Non-blocking items
1. Mutation data in the mount: `checks/data/<module>/reference.py`, equivalents and mutants are readable by learner
   test code until 00 2.5.3 (separate uid, hidden `/proc`) exists; reading them is a zero-skill pass. Name it in
   section 11 and record the local attack in the demo. Also require that nothing a check run writes (temp copies, HOME)
   survives into the learner's workspace or later runs (stashing hidden acceptance tests or mutants).
2. Exactly one record: the grader reads the whole pipe and accepts exactly one JSON object; two records or trailing
   bytes = no valid record.
3. Equivalence surface: define it as return value with type and list order, exception type and message, and input
   mutation; reference and equivalents use integer arithmetic; the differential demo compares all of these (100k random
   inputs alone can miss rounding-edge float differences).
4. L5: ">= 8 mutants (one per REQ at least, plus two boundary mutants)" with 8 REQs means >= 10.
5. (A)/(B) copy one learner module: task.md states the single-file implementation and the names tests may import (the
   seam and models only); near-miss: a private helper in the same file; must-fail: a test importing a non-seam name
   gets a clear message. Hidden acceptance tests assert only what the requirement document pins (exception type,
   rounding).
6. Timeouts: 8 probes x 60 s > 120 s (L1), 13 x 60 s > 120 s (L6); make per-probe timeout x probes fit `timeoutSec`
   or stop at the first timeout with a message; use min(registered `timeout`, probe timeout).
7. Stop probes: pair both red and green states with a claiming and a non-claiming `last_assistant_message`; give
   green fixtures random names and the same file shape as red ones (defeats static fixture-shape heuristics); add one
   payload without `background_tasks`/`session_crons` (H: present only "when the task registry is reachable"), one with
   `permission_mode`, `prompt_id`, `effort`, and one without `stop_hook_active`.
8. 2.8 rejects documented block forms: exit 2 + plain-text stdout (H table: "Blocking error. Your stderr is the
   reason") and exit 2 + invalid JSON. Defensible as exercise policy, but section 12's "every documented form" is
   overstated; name both in task.md and in the must-fail list.
9. L6 linter: define the expected token per corrupted root (C4 gap: which number; dangling `superseded by`: target or
   file) and require exactly one finding line naming the planted rule (a dump-all linter otherwise matches the token).
10. L6 `stop-hook-integrity`: state the stub's behaviour in the L1 regression rows (exit 0, silent).
11. `maxReports`/`maxDecoyHits` belong in `bugs.yaml` (schema bug-hunt has only `answers`, `minFound`; zod drops unknown
    keys silently), as in 00 L4.
12. Later starters ship earlier reference answers (L2 starter has the L1 reference tests, which kill every mutant;
    L5 ships L4's artifacts): require the platform to open a lesson's workspace only after its prerequisite is done, or
    record the residual in section 11.
13. L3: term-name normalization (`Credit Note` / `CreditNote` / `Credit note`) and what "naming both contexts" means
    in a Relationships line; add near-misses.
14. L2 reference-path regex: define boundaries so prose like "moved from `scripts/release.py`" (repo root) is not read
    as a skill-relative path.

Checked: content:validate green on current tree; quiz rate 0.1211%/0.3628% (exact); bug-hunt enumeration 19/4096,
38/8192, best allocation confirmed, 1.385% cumulative; 2.6 fingerprint attack PASS in a toy grader (B1); unittest
discover on the src layout (B7); PyYAML on subset forms (B3); vendor quotes vs RA A1-A6.

FAIL
