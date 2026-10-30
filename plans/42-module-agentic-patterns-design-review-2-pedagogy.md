# #42 judge_design round 2: pedagogy

Design reviewed: `plans/42-module-agentic-patterns-design.md`, revision 2 (778 lines, read in full, including section 14).
Verdict: FAIL, 1 blocking issue, attributed to curriculum-architect. Both round-1 blocking items are resolved.

## Round-1 blocking items: verification

### R1-B1 (L1 ladder, starter, feedback): resolved
I walked the ladder (2.7, lines 99-117) literally over R01-R12 against the starter the design now ships (section 3 and
lines 188-199) and the 01 L7 starter on disk. In each row the first "yes" lands on the key:
- R01, R02: step 2 no (settings hold Stop + PreToolUse, Makefile `test` and `codegen`). Step 3 yes, because the tree and
  Makefile show it. -> delete.
- R03: step 1 yes. -> memory.
- R04: step 2 no (no test covers call sites; the swap in `statement.py` is green, prototype row 11). Step 3 no: the
  question's first clause, "would an agent that ignores the line still do the right thing", fails because the opening
  question and the planted swap show the harm. Step 4 yes. -> code.
- R05, R06: steps 2-5 no, step 6 yes. -> check.
- R07: step 3 no (new code on `legacy_format` is the harm). Step 4 no, because the `legacy_format.py` docstring, now in
  the L1 starter, forbids moving or changing it. Step 6 yes. -> check. Every file the card names now ships in L1.
- R08: step 2 yes (PreToolUse `protect_generated.py`). -> hook. The starter now carries `generated/`, the header,
  `make codegen` and the hook (section 3).
- R09: step 3 yes (a preference). -> delete.
- R10: step 2 yes (Stop hook `stop_tests.py`, confirmed in
  `course/.../01-spec-driven-development/07-integrity-control/starter/.claude/settings.json:15`). -> hook.
- R11: `tests/fixtures/invoices.json` exists in the 01 L7 starter, so the line is not stale. Step 4 no (data, not code,
  per 2.7's definition). Step 6 no. Step 7. -> memory.
- R12: step 3 no (agents copy patterns). Step 4 yes. -> code.

The step-2 tie-break ("the guarantee lives there") closes the R08/R10 hook-or-delete ambiguity from round 1. Step 3's
first clause closes R04 and R12. Moving the files into L1 closes R07. A literal reader now has at most one weak spot
(R08 step 1, non-blocking 1), and the tolerance is one. The section 3 description of 01 L7 is corrected.
Not done: B1 item 4 asked for the L1 prototype to run on the new starter. Section 11 says the L1-L3 prototype starters
still carry revision 1's `.claude/` (Stop hook only). `verify_placement.py` does not read it, so the verdict stands,
but the walk for R08 depends on a file nobody has yet put in a starter (non-blocking 2).

### R1-B2 (task text vs checks): resolved
I diffed each "Готово, когда" against its check entries in both directions:
- L1 (273-282): items 1-5 match stage 0 s1-s5, item 6 matches the key, items 7-10 match `poka-yoke-applied` (stage 0,
  hidden grids, suite), and item 11 matches the quiz. No check rule is missing from the text, and no text item lacks a
  check. Item 2 says "no `@` imports" while s2 allows them inside backticks. The text is stricter than the check, so no
  honest learner is failed by it.
- L2 (357-364): items 1-2 match `arch-linter`, items 3-8 match (a), (w1), (w2), (b), (c), (d), and item 9 matches the
  rubric. Item 3 now says that the grader runs its own A1-A3 and that the learner's linter is not run. That was the
  round-1 fix.
- L3 (448-454): items 1-2 match `failure-log`, item 3 matches (a), items 4-7 match (b), and item 8 matches the rubric.
  Item 4 names the pristine allowlist and the pristine first-party set and says the learner's edits are not read. Item 6
  states the behaviour, not "uses the stdlib".
- L4 (539-542): matches G1-G7 and N1-N4 one to one. This match is the cause of the new blocking item below: the text
  prints the answers.
- L5 (574-576): matches `bugs.yaml` (`maxReports`, `maxDecoyHits`, `minFound`, feedback, cap).

## Blocking

### B1. [design:523-524, 539-544, 604] L4: the task text and the check's messages hand the learner the seven defects and their fixes, so the hands-on part does not practise O4's "Находит".

Revision 2 reshaped L4 to "repair seven planted defects". The shape itself is good: each defect is one transferable
principle (gateway URL, a secret's scope, presence-only variables, the uv index, per-tool CA trust, removing web tools,
the scope of a strict allowlist), and "any documented form passes" is fair. But two decisions remove the finding:
- task.md "prints the 'Gone when' and 'Accepted forms' columns" (539). These columns name the key and the file for every
  defect: G5 "`launcher.env` sets `SSL_CERT_FILE=/etc/corp/ca-bundle.pem`", G7
  "`home/.claude/settings.json` `sandbox.network.strictAllowlist` is JSON `true` ... every entry is `pypi.corp.local`".
  They also list the traps the theory teaches: G3 "`0`, `false` pass (presence-only)", G6 "`0|false|no|off` turns it on",
  G7 "the repository's `allowedDomains` ... are ignored".
- `contour-config` reports "every failing rule ... with its id, file and field" with no cap (523-524). A first run on
  the starter therefore lists all seven defects with their files and fields.

Together these make "Как работать" ("the seven gaps you find are the task", 543) and the time row "find 7 defects 8"
(604) fiction. The 35 hands-on minutes turn into copying the printed values into four files. The learner never has to
map a brief line to a key, a scope and a tool, and that mapping is what transfers to a real bank contour. The weak-spot
argument in the profile ("little experience with networking") supports finding over copying: copying teaches nothing
the theory has not already printed.

Fix (curriculum-architect, L4 entry, section 6 row O4, section 7 row L4):
1. task.md "Готово, когда" states each G/N rule as the brief requirement it protects, in the brief's own terms, without
   naming the key, the file or the trap. Examples: G1 "every Claude Code request goes to the brief's gateway"; G3
   "non-essential traffic is off"; G5 "uv in the team's terminals trusts the bank CA"; G7 "sandboxed commands can reach
   the mirror and no other host, and no prompt can widen this". The text then gives the general acceptance rule once
   (the definition of "effective value" with its precedence, the files the check reads, "any form the vendor
   documentation gives this effect passes; a form the documentation says has no effect or another effect fails"). It
   also lists the brief's own constraints that narrow a form (terminals read only `launcher.env`; the mirror only, port
   443; only the helper prints tokens). This keeps 2.6 honest: no rule is hidden, because every rejected form follows
   from a documented semantic the theory teaches.
2. The `contour-config` message names the rule id and its brief requirement, for example
   "G5: uv в терминалах не доверяет CA банка". It does not name the file, the key or the expected value. The check stays
   uncapped: per-requirement feedback is fair, and finding the key and the scope stays the learner's work.
3. Keep the "Gone when / Accepted forms" table as the grader's specification and the mentor's reference, as L1's
   per-card walk is, off the learner's text. Re-time L4 hands-on for the find step. 35 minutes is plausible with the
   existing fallback (G5 hint in the brief) held ready. Record which defects the student run finds unaided.

## Non-blocking

1. [design:100-101, 209] R08 step 1. "regenerate it with `make codegen`" puts a build command in the line. A literal
   reader can answer step 1 "yes, the line is a command that builds" and place it `memory`. That uses the learner's only
   deviation. Narrow step 1 to "the command an agent runs to build, test or check the whole project", or drop the clause
   from R08. Also give the step-1 "n" for R08 a reason in the walk table.
2. [design:214-229, 640-641] Several "n" cells in the walk table carry no reason: R06 every step, R07 step 3 and step 5,
   R02/R09 step 2. Round-1 fix 2 asked for a reason for each "no", and the mentor will use this table. R05 step 5 says
   "`make test` before merge finds it in time", but no import check exists in L1. Rewrite it as "a forbidden import
   found after the turn costs one edit; nothing irreversible happens". The author must ship the PreToolUse hook files in
   the L1 starter, and the student run should confirm the R08 walk on that starter.
3. L1 feedback: recommendation on "N из 12" (12.2, asked for Stepan). I recommend count feedback ("N из 12 совпадают"),
   with the cap of 3 and the pass threshold of >= 11 unchanged. Reasons:
   - With binary feedback and cap 3, an honest learner who misapplies the ladder on three cards closes the check 69% of
     the time and never learns how far off they were. The mentor may not reveal per-item correctness, so "не пройдено"
     is the whole signal. "9 из 12" tells them to re-walk their doubtful cards. That re-walk is the learning loop the
     lesson exists for.
   - It matches the module's own L3 `failure-log` and 00 L1, which both use count feedback. A learner meeting two
     feedback styles for the same kind of task in adjacent lessons gets no benefit from the difference.
   - The cost is a higher search pass rate for partial knowledge. The architect should recompute the table (sure of
     10/9/8 within 3 submissions, count feedback) and keep count only if "sure of 8" stays at or below about 10-15%.
     Above that, keep binary.
   This is Stepan's call, not a blocker.
4. [design:337-338, 360] L2 (w1) bans the name or attribute `compile` anywhere in `src/`, which also rejects
   `re.compile`. The text item 4 says "no ... `compile`" without "attribute". Either restrict (w1) to bare names and
   `builtins.` attributes, or say in task.md "as a name or an attribute, so `re.compile` also fails". The rule is stated,
   so it is fair. Without the explanation it reads arbitrary.
5. [design:452-453] L3 item 5 ("no new `.py` file under `src/`") is stated but not motivated. Add one clause: "a vendored
   stand-in for a missing package is exactly incident I02". The learner then reads it as the lesson's point, not as a
   grader quirk.
6. [design:142-170, 567] Concept table: L5 plants a Stop hook calling `claude -p`. Headless mode is introduced nowhere in
   modules 00-01 (grep: no `claude -p`, `--print` or "headless" in `course/`). Gloss it in the snapshot comment or the L5
   theory in one line. `PostToolUse` is in 01 L1 theory (`01-verification/theory.md:181`), and `/effort` is in 00 L1.
   Add both to the table's "introduced" rows for completeness.
7. [design:544] "run `/status` in your head" is unclear for a learner with no networking practice. Say "for each variable,
   write which file's value wins (the effective value as defined above)".

## Checked
- Loaded: role file, `judge_mistakes.md`, `learner/profile.md` (weak in networking, "where to start"),
  `learner/journal.md` (no entries), and the round-1 pedagogy report. `_contract.md`, `docs/learning-process.md` and
  `docs/course-reference.md` were not re-read: I read them in round 1, and revision 2 does not change the lesson types,
  the check kinds or the topic mapping (sections 8 and 13).
- R1-B1: literal walk of all 12 cards (above). On-disk confirmation of the 01 L7 starter's Stop hook
  (`settings.json:15`) and `tests/fixtures/invoices.json`. Section 3's corrected L1 additions.
- R1-B2: both-ways diff for L1-L5 (above).
- L3 incident walks (391-400) against step 0 and 2.7: I01 (step 1 memory, code accepted), I02 (step 5 hook, check
  accepted), I03 (step 5 "too late" no, step 6 check), I04, I05 (both accepted), I07 (step 0), I08 (step 5), I10
  (widened). The round-1 non-blocking 2 is resolved.
- L4 reshaping: the transferability of the seven defects (each is one principle), fairness (every rejected form rests on
  a quoted vendor sentence in 12.9 or on the brief), density (theory 25 with a collapsed "Справка", SOCKS present). This
  gave blocking B1: the answers are printed and echoed by the check.
- L1 cap: the 3-submission cap, the search table (84.0/31.2/8.2%), the mentor rule, the reserve of 6 cards with walks;
  recommendation in non-blocking 3.
- L2/L3 new constraints: stated in "Готово, когда" (L2 items 4-5, L3 items 4-5) and motivated in L2 theory (298-299);
  wording gaps in non-blocking 4-5.
- Time: 60+75+70+60+50 = 315; hands-on 38+55+48+35+38 = 214 (67.9%). The per-part sums of section 7 add up for every
  lesson. Lowest share L4 at 58%. Plausibility per analogue as in round 1. L4's find step needs re-timing after B1.
- Concept table (142-170): every row walked against the theory, quiz and starter of each lesson. Round-1 items 4-5 are
  fixed (L3 "без доступа в интернет", SOCKS in L4 theory). One gap remains (`claude -p`, non-blocking 6).
- Round-1 non-blocking 1, 6, 7, 8, 9: resolved (O3 "класс причины" with the class-to-mechanism map, "Справка" from the
  start, "Как работать" in every lesson, the planted swap, the pointers back).
- Grading threat model 2.8 applied as the orchestrator default. B1 does not rest on a grader attack: it concerns what the
  visible task text and the check's normal feedback reveal.
