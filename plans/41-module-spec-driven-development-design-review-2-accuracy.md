# #41 design review, round 2: judge-accuracy

Design: `plans/41-module-spec-driven-development-design.md` (revision 2). Inputs: R, RA, my round-1 report,
the architect's scratch evidence (`scratchpad/{runs,yaml,src,m01}`). Reviewed 2026-10-29. Verdict: PASS, no
blocking items, 5 non-blocking.

## Round-1 blocking items: re-verified against primary sources (fetched live 2026-10-29)

- B1 fixed. S, "Using skill frontmatter outside Claude Code": the table row reads "claude.ai skill uploads, the
  Skills API, and packaging with `package_skill.py` from anthropics/skills | `name`, `description`, `license`,
  `compatibility`, `metadata`, `allowed-tools`". The next sentence reads "If you include any field the spec doesn't allow, packaging or upload
  fails with a hard error instead of ignoring the field". The design quotes both verbatim (L2 theory, `verify`
  message, Q6). Cursor (cursor.com/docs/context/skills): `disable-model-invocation` "When `true`, the skill is
  only included when explicitly invoked via `/skill-name`", and `paths` and `metadata` are listed as well. So "Cursor reads
  `disable-model-invocation`" is correct. The design does not call R's list complete. The page also has `icon` and `color`.
- B2 fixed. MADR-T (`adr/madr` 4.0.0 `template/adr-template.md`, raw, plus the architect's copy `src/madr.md`).
  Line 2 is the comment `# These are optional metadata elements. Feel free to remove any of them.` The status line is
  `status: "{proposed | rejected | accepted | deprecated | … | superseded by ADR-0123"` (with no closing quote in
  the template). The headings, in order, are `##` Context and Problem Statement, Decision Drivers, Considered Options,
  Decision Outcome, then `### Consequences` and `### Confirmation`, then `##` Pros and Cons of the Options and More Information.
  `<!-- This is an optional element. Feel free to remove. -->` comes before Decision Drivers, Consequences and
  Confirmation. The design's heading list, levels, quoted status and "exercise's rule" labelling all match. The
  filled-template near-miss passes the 2.3 subset: the comment line is a whole-line `#`, and the filled values are
  plain or quoted. The template has no blank line inside its front matter.
- B3 fixed. PBP "Provide utility scripts": "The instruction file (`forms.md`) references the script, and Claude
  can run it without loading its contents into context". "Avoid deeply nested references": "Claude might
  partially read files when they're referenced from other referenced files". The chain rule now counts only
  `.md`/`.txt`, and the near-miss SKILL.md -> `forms.md` -> `scripts/fill.py` was added. PBP's directory listing
  marks scripts "(run, not loaded)".
- B4 fixed. The CPython 3.12 `Lib/unittest/main.py` has `_NO_TESTS_EXITCODE = 5`, and
  `if self.result.testsRun == 0 and len(self.result.skipped) == 0: sys.exit(_NO_TESTS_EXITCODE)`. The docs say "An exit code of 5
  indicates that no tests were run or skipped". The CPython 3.11 `runner.py` writes only "FAILED"/"OK", with no "NO
  TESTS RAN". So "3.11 Ran 0 tests ... OK exit 0; 3.12 NO TESTS RAN exit 5" is correct.
  I read the scratch outputs:
  - `zero_tests*.err`: "Ran 0 tests ... NO TESTS RAN".
  - `wrong_cwd_existing.err`: the traceback ends in `loader.py ... raise ImportError('Start directory is not importable:
    %r')` with "'tests'".
  - `missing_script.err`: "can't open file '.../stop_test.py': [Errno 2] No such file or directory". CPython exits 2 there.
  - `subprocess_bad_cwd.err`: "FileNotFoundError: [Errno 2] No such file or directory: '/nonexistent/proj'".
  - `with_I.err`: "No module named 'invoices'", "Ran 2 tests ... FAILED (errors=2)".
  - `green.err`: "Ran 3 tests ... OK".
  - `importerr.err`: "ERROR: tests.test_imp_k2 (unittest.loader._FailedTest.tests.test_imp_k2)".
  - `h.out`: the reference hook's JSON block with "Ran 0 tests".

  The pinned command, the `-I` note and the trap mechanisms all match the outputs. The missing-file exception
  (H): "when your hook exits 2 with nothing on stdout and its stderr says a file is missing, such as `No such file
  or directory`, Claude Code treats the run as a non-blocking error". It applies to Stop. Trap (i), under the
  `python3 <path>` form, and trap (ii), raw output with exit 2, both meet its conditions. The row-3 token
  `tests.test_<r>` is in the ERROR line on 3.10 through 3.12 as well.
- B5 fixed. In H, the "Any other exit code" column for a valid JSON object reads "Claude Code ignores the exit code, and the fields alone
  decide. For hooks whose failure blocks the action, the run counts as a failure instead". Also "Exit code 1
  without valid JSON output is a non-blocking error unless the hook is one whose failure blocks the action".
  On Stop, `onFailure` has no effect, so the L1 sentence is correct for Stop. Follow-up 11.11 is recorded. 00 L6
  theory.md:95-97 already says that fail-closed needs `onFailure: "block"`.

## New and changed claims checked
- Booleans: S, "Boolean fields accept `yes`, `no`, `on`, `off`, `1`, and `0` in any letter case, in addition to `true`
  and `false`". "Six more spellings" and the 8 near-miss spellings are correct. `user-invocable: false`: S says Claude
  "doesn't run it when you type `/name`", so only Claude invokes it. That is consistent with the fail message. Unknown
  fields: S, "Claude Code ignores a field it doesn't recognize without reporting an error". `name` "Defaults to the
  directory name".
- Body "under 500 lines" (PBP, three places) -> `<= 499`: correct.
- EARS: Mavin's EARS page (alistairmavin.com/ears) lists ubiquitous, WHILE, WHEN ("When <trigger>, the <system
  name> shall <system response>"), IF/THEN, WHERE and complex. "WHEN...SHALL is one pattern of EARS" is correct. The Q3
  constraint holds.
- Böckeler (martinfowler.com/articles/exploring-gen-ai/tdd-in-the-agent-loop.html): "8.50x", "2.96x", "4.89x". "there
  was no clearly discernable difference based on TDD workflow versus no TDD workflow". Both quotes match. See N1 on
  "overstated".
- YAML subset vs PyYAML: I read `yaml/cases.json` and `subset.json` (23 forms). The rejects match the 2.3 list:
  colon, trailing colon, `*`, `[`, `-`, tab, duplicate, empty, trailing comment, `name:release`. See N2.
- Probe timeout 20 s < the registration floor of 30 s: this fixes round-1 N1. The context description line under
  `# Billing` is a near-miss: this fixes round-1 N6.

## Blocking
None.

## Non-blocking (lesson-author applies when writing; no re-design needed)
1. L1 theory and section 9 say "8.50x / 2.96x / 4.89x tokens, overstated by cache reads". Böckeler says the token
   counts are what they are. What cache reads distort is cost: the measure "weights cheap cache-read tokens the same as expensive fresh
   tokens, so it likely overstates TDD's true dollar cost", and "the 3x or more factor of tokens aren't a direct
   representation of how much more costly it is". Write: "used 8.50x / 2.96x / 4.89x the tokens; many were cache
   reads, so the dollar cost is likely lower than the ratio".
2. 2.3/2.10 item 5 say "every form the subset accepts parses to a mapping with the same string". That is false for
   the plain boolean and number forms. PyYAML resolves `True`, `yes`, `On` and `1` (cases `bool_*`) to `True`/`1`, and a
   plain `2026-10-29` to a date. The subset keeps the text, which is the intended behaviour. Reword to "the same
   scalar text; YAML 1.1 types plain booleans, numbers and dates, which the subset keeps as text and reads per S
   for the two CC boolean fields". No check depends on it.
3. 2.10 item 1, bullet 2 says "no `PYTHONPATH=src` (with or without `__init__.py`): Ran 2 tests ... errors=2". Without
   `tests/__init__.py`, under `-s tests -t .`, discovery raises "Start directory is not importable" before it imports
   any module (bullet 1, and the 3.12 `loader.py` `discover()`). Drop "or without" so the record does not contradict
   itself.
4. L2 chain rule: as written it also fails `SKILL.md -> a.md, b.md` when `a.md` cross-links `b.md` and both are linked
   directly from SKILL.md. PBP's rule ("All reference files should link directly from `SKILL.md`") is met there,
   and PBP's bad example is a file reachable only through another one. Either exempt targets that SKILL.md also
   references, or keep the stricter rule and label it as the exercise's rule in task.md and the message. Do not
   attribute it to PBP.
5. L4 theory, when it names the other EARS patterns: add Mavin's EARS page to `sources`. R cites only Kiro's
   WHEN...SHALL line.

Attribution: none required (PASS). No feedback appended.

PASS
