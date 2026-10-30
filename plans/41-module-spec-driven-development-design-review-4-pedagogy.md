# #41 design review, round 4: judge-pedagogy

Design: `plans/41-module-spec-driven-development-design.md` (revision 5, 1837 lines). Scope as instructed: what
revisions 4-5 changed (sections 16, 17 and the places they point at); fixed items not re-opened.
Verdict: FAIL, 1 blocking item (attributed to curriculum-architect), 4 non-blocking.

## What I checked
- Inputs: `judge_mistakes.md`, `curriculum-architect_mistakes.md` (all headings, incl. the round-3 assessment
  entry), `learner/journal.md` (still empty), my round-3 report.
- N-a..N-g, each at its place:
  - N-a: L7 `artifact-linter` grades all four exit-2 cases of task.md item 1 (design:1331-1333; item 1 at
    1307-1310). Matches 2.7's parse-error definition (design:408-409). Applied.
  - N-b: L1 item 4 (design:808-819) prints E1-E3 "verbatim", the 12 shell spellings (4 path spellings x
    {alone, `python3 `, `python3 -I `} = 12), allowed keys with `timeout` floor 30, every rejected key with a
    one-line reason, `disableAllHooks`. Item 5 (design:820-830) prints the five stdout keys, the `decision`
    rule, the block forms, plain text/invalid JSON rejected, `continue: false`. Each line checked against 2.8
    (design:421-436, 524-541). Applied. Residual: N-h.
  - N-c: "allows and exits with code 0" for green and for `stop_hook_active: true` (design:823-824); probe
    table "allow with exit 0" (design:859); rule 5 covers the active row (design:543-544). Applied.
  - N-d: advice (design:835-838) and demo item on the largest red P (design:915-918). Applied.
  - N-e: L7 item 1 (design:1304-1306) and 2.7 (design:374-377) state the union over every linked context
    file; no `checks/` substring in the printed sentence. Learnable and honest: it is the rule the grader
    applies (pristine side) and the linter applies (workspace side). Applied.
  - N-f: 2.8 rule 6 (design:545-553): class, state, expected outcome, observed outcome with exit code, missing
    token kind; never position or seed; first 5 plus a count. Template id is not printed, which is right: an
    honest learner does not need it, and printing it would hand over residual (iv). The message gives enough
    to reproduce the failure on the learner's own workspace (break a test, send that stdin). Applied.
  - N-g: L6 "theory ~12" (design:1249) equals section 7; L5 "32 (~6-7 each)" (design:1440). Applied.
- Four probe templates (design:462-501), from the honest learner's side. The hook runs the pinned command and
  forwards the whole output in a JSON `reason` with exit 0. Per template, red:
  - T1: `assertEqual` fails (FAIL line with the method name); `open(f<j>.json)` raises FileNotFoundError
    (ERROR line with the method name); `getattr` at import of `test_<b>` raises AttributeError (ERROR line
    `tests.test_<b>`).
  - T2: the helper `tests/_<x>.py` is not collected (discover pattern `test*.py`) but imports fine through
    `-t .`; the assertion, the fixture and the `getattr` fail as in T1.
  - T3: a raised `AssertionError` counts as a failure; `open().close()` raises FileNotFoundError; the
    `ModuleNotFoundError` at import gives the `tests.test_<b>` line.
  - T4: `assertTrue(_OK)` fails; `read_text()` raises FileNotFoundError; the `KeyError` at import gives the
    `tests.test_<b>` line.

  All three token kinds are in unittest's own output, observed per template "FAILED (failures=1, errors=2)"
  with both method names and `tests.test_<b>` (design:494-497, 661-663); green "OK". Paths are relative to
  the cwd, and cwd = `$CLAUDE_PROJECT_DIR` = P (design:513-515), so a hook that runs in either directory
  behaves the same. So yes: an honest hook passes all four without knowing them (reference hook 3/3, 54/54,
  design:666). Corners walked: red and green per template; zero tests (unchanged row, design:860); the active
  row; 3.11 vs 3.12 exit codes (the honest hook reads "Ran 0 tests"). Nit N-j on method names.
- "Готово, когда" vs checks (2.9) for every item revisions 4-5 touched:
  - L1 items 4-5 vs registration and probe rules: equal, except the phrase list (N-h).
  - L7 item 1 vs the exit-2 roots: equal.
  - Cap items L1 (6), L5 (6), L7 (4): see B1.
- Times: L1 80/55 (15+5+25+10); L5 20 + [5 + 32 + 8] = 65/45; L6 12 + [28 + 5] = 45/33; totals
  80+50+50+70+65+45+60 = 420, 55+30+30+50+45+33+40 = 283, 67.4%; per-lesson figures in section 7 hold. The
  longer L1 item 4 adds perhaps 2-3 min of reading, absorbable in the 25-min theory part (no change asked).

## Blocking
- B1 (curriculum-architect). The counted/uncounted boundary of the new cap is not defined per check, so the
  task.md cap items cannot equal the checks (2.9). The cap is irreversible: "never reset, nothing reopens"
  (design:138-139). 2.5 says a submission counts only if it reached the hidden runs, "so honest iteration on
  the static parts is free" (design:138-140). No capped check defines a static stage that runs before its
  hidden runs, except L7 `change-request-applied` (design:1351-1353).
  - L1 `late-fee-verified`: task.md item 6 (design:831-834) promises that an "item 1 import rules" failure
    does not count. But the check entry (design:839-853) defines no pre-run stage. The only import
    enforcement it describes is the proxy's `ImportError`, reported from inside the variant runs
    (design:239-242). Nothing at all enforces "stdlib only" for a test that imports, say, `invoices.models`,
    which is present in the test process. The other item 1 rules (no `skip`/`skipTest`/`expectedFailure`,
    >= 3 tests) are read from the run record (design:245-247), so they are counted failures. The untouched
    starter's skipped test therefore costs a counted failure, and task.md does not say so.
  - L5 `reminders-accepted`: item 6 (design:1216-1218) names only "item 2 import rules, a missing file" as
    free. The check (design:1223-1228) lists (A), (B), (C) with no order. If (C) runs last, a `todo` task, a
    `client` in a test name or a 3-label name (items 3 and 5, all static) burns one of 10 irreversible
    attempts. If (C) runs first, task.md understates what is free. Either way 2.9 cannot be verified.
  - L7: item 4 (design:1318-1321) calls the free part "the spec comparison of item 2". But (C) also runs
    grader C1-C6 and the ADR status check before the hidden runs (design:1348-1353), so task.md again
    understates the free part.
  - Fix: give each of the five capped checks an explicit stage 0 (static, uncounted, runs before any hidden
    run), listed in its check entry, and copy exactly that list into the task.md cap item. Suggested
    contents:
    - L1 `late-fee-verified`: both files present, one test file; AST import allowlist (stdlib, `late_fee`
      from `invoices.late_fee`); AST: no skip decorators, `skipTest` calls or `expectedFailure`; >= 3
      `test*` methods; the implementation imports the stdlib only.
    - `stop-hook-tests` and `stop-hook-integrity`: registration (a), and the hook file present with
      shebang and exec bit.
    - L5: items 2, 3 and 5 entirely (AST imports, name format and label cap, C1-C3, C6, every task `done`).
    - L7 `change-request-applied`: the whole (C).

    Add the stage 0 must-fail/near-miss pairs to the demo (for example the starter's skip fails in stage 0
    and does not increment the counter).

## Non-blocking
- N-h (lesson-author). L1 item 5 (design:829-830) names only "No such file or directory". The grader's list
  also has `FileNotFoundError`, `ENOENT`, `does not exist`, `cannot find` (design:556-558). Take a learner on
  the exit-2/stderr route who filters raw output down to names plus error types: they leave
  `FileNotFoundError` in stderr and fail on a rule task.md never stated. Print the five phrases (the
  phrases, not the data path), or say "any wording that a file is missing, for example ...".
- N-i (lesson-author). With a cap, L1 advice should add one line: before submitting, try the hook locally.
  Break a test, pipe `{"stop_hook_active": false}`, `{}` and non-JSON into it, and check stdout, stderr and
  the exit code. The probe failure messages (rule 6) make this reproduction possible; the advice makes it
  the habit. The same for L7 (call the linter on a root with a planted finding).
- N-j (architect, nit). 2.8 item 1 says method names are "`x` + `secrets.token_hex(4)`" (design:454-455).
  unittest collects only methods with the `test` prefix, so the generated names must start with `test`.
  The prototype evidently did this (both names in the output), so only the text is off.
- N-k (architect, nit). 2.5 says the UI suggests the mentor after 5 counted failures (design:141). task.md
  cap items do not mention it. That is not required by 2.9 (it is not a check rule), but one clause there
  would tell the learner when help is offered.
FAIL
