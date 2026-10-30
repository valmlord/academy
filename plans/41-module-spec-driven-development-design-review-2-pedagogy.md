# #41 design review, round 2: judge-pedagogy

Design: `plans/41-module-spec-driven-development-design.md` (revision 2), read in full (1119 lines).
Verdict: FAIL, 1 blocking item. Attribution: curriculum-architect.

## What I checked
- Inputs loaded: `judge_mistakes.md`, `curriculum-architect_mistakes.md` (11 entries, incl. the two #41
  round-1 entries), `docs/learning-process.md`, `learner/profile.md`, `learner/journal.md` (still empty),
  my round-1 report. Module 00 evidence re-read from the shipped files, not from the design's citation:
  `00-introduction/*/lesson.yaml` (40, 60, 45, 70, 50, 80 = 345), 00 L4 `task.md:3` (70 min, ~50
  hands-on, "25-30 минут на транскрипт"), 00 L4 `starter/transcript.md` (380 lines, confirms the design's
  figure; my round-1 "~440" was wrong), 00 L6 `task.md` (80 min, ~50 hands-on, one PreToolUse path hook
  plus settings).
- Round-1 B1 (O5): fixed. New O5 (design:38) names only what L5 and L6 observe; the L5 starter leaves
  implementation and tests to the learner (stub raises `NotImplementedError`, test file has imports only,
  design:772-777); the six bug-hunt categories in O5 equal the L6 categories (design:826-834); section 6
  maps every verb (design:947-949); interview and "принимает по скрытым тестам" are gone; 8.6 records
  grilling as optional. Not re-opened.
- Round-1 B2 (L5 time): fixed. L5 65/45, L6 45/33. Recomputed section 7: 65+50+50+70+65+45+60 = 405;
  40+30+30+50+45+33+40 = 268; 268/405 = 66.2%; per lesson L1 61.5%, L2 60, L3 60, L4 71, L5 69, L6 73,
  L7 67. L6 sizing: 380-420 lines vs 00 L4's 380 lines at 25-30 min; suspects rise from 21 to 27 (see
  N2). L5 has a stated fallback (T-05 optional). Not re-opened.
- Round-1 B3 (task vs checks): fixed as a convention. 2.9 exists; every lesson L1-L7 has a "Готово,
  когда" list and a separate "Как работать (совет)" block. Diffed each list against its check: L2
  (items 1-7 vs `skills-structure` rules, `verify` body rules now advice, root `scripts/release.py`
  absence checked), L3 (<= 12 terms, `_Avoid_` <= 4 words, >= 2 Relationships lines stated), L4 (6-12 REQ,
  >= 3 stories, 3-8 tasks, exactly one ADR stated), L5 (test-first is method) all match. Three small
  slips remain (N1); none reopens B3.
- Sequence and concept dependency after renumbering, per lesson (theory, task, quiz): L1 (00 L2/L4/L6 or
  introduced inline: REQ ids, mutant, held-out tests), L2 (plugin row added, upload surfaces named for
  Q6), L3 (grilling, ontology), L4 (glossary resolver, seam, `Check:` bridge to 00 L4, optional grilling
  uses L3 rules), L5 (L1 ladder, L2 invocation control, L3 grilling, L4 artifacts; `converge` removed),
  L6 (categories built from L1 skipped-red/tautology/claims, L3 confirmation, L4 horizontal slicing, L5
  skill names), L7 (`analyze`/`converge` introduced here, quiz Q5 after it). Prerequisite chain linear
  L1 -> L7 and consistent with the 2.5 workspace-opening requirement (L7 starter ships L5 reference, L6
  prerequisite makes L5 done transitively). Table gaps: N3.
- Theory starts from a concrete problem: all seven openings are concrete questions (design:410, 528,
  647, 699, 764, 814, 853).
- L1 theory load: core vs "Справка" split applied (N1 round 1); see B1 and N4.
- Optional grilling (L4) and optional `tdd` copy (L5): ungraded, outside the total, labelled; addresses
  the profile's "where to start" freeze. See N5.
- Test layout change (2.8, 2.10): pinned command observed; pedagogical exposure: N6.
- Reconciling sentence vs module 00 (design:417-419): content and placement checked; N7.
- Reference closeness: deviations 8.1-8.6 unchanged in substance and justified; 8.2 updated for the split.
- Self-review (section 12) claims "L6 sized from 00 L4's measured budget" under the round-1 sizing rule;
  checked whether the same rule was applied to every lesson: B1.

## Blocking

### B1. L1 is not sized from its closest measured exercise (design:408-409, section 7, 11.6)
Problem. The round-1 sizing rule (now in `curriculum-architect_mistakes.md`: "size each lesson from the
measured time of the closest past exercise") was applied to L6 only. L1's closest shipped analogue is
00 L6: one PreToolUse hook that filters a path, plus a settings fix, at 80 min with ~50 hands-on
(`00-introduction/06-permissions-security/task.md:3`). L1 asks, in 40 hands-on minutes, for three
things, each graded by a strict command check:
- tests that kill >= 6 mutants and pass 3 equivalents (read `docs/late-fee.md`, five requirements, write
  discriminating tests, see them red on the agent's code): ~10-15 min;
- fixing two defects to pass hidden acceptance tests: ~5 min;
- a Stop hook harder than 00 L6's: run a subprocess with `PYTHONPATH` and without `-I`, parse unittest
  output for every failing test name and "Ran 0 tests", emit a JSON block, honour `stop_hook_active`,
  treat bad stdin as `false`, plus registration, then iterate against 13 probes: ~25-35 min.
That is ~45-55 hands-on before submission iterations, against 40, with ~25 min of the densest theory in
the module (revision 2 added the reconciliation sentence, the two traps with observed output and the
3.11/3.12 exit-code note to the core). The design's own L5 fallback logic shows the architect knows a
lesson can overrun; L1 has none.
Required change (either):
- (a) Size L1 from 00 L6: ~80 min, ~55 hands-on, with per-part minutes in the lesson entry; update
  section 7 (420 min, 283 hands-on, 67.4%) and item 11.6 for Stepan; or
- (b) keep 65 min only with numbers: per-part minutes that fit 40 hands-on after a stated scope cut
  (e.g. move "TDD with agents as contested" and its token figures to L5, where TDD is practised, and
  "what agents fake" detail to L6, cutting core theory to ~15 min, giving ~50 hands-on in 65), plus a
  fallback rule like L5's for the student run.

## Non-blocking
- N1. 2.9 slips (task requires what no check grades, or the reverse); fix in task.md or the check:
  - L1 item 1 allows only `late_fee` and the stdlib, while 2.6 also allows `invoices.models`: say the
    same thing in both.
  - L1 item 5 "every failing test name": every probe has exactly one failing test, so "every" is
    ungraded; reword to "the failing test name" or add a two-failure row.
  - L7 item 1 "exit 2 on usage or parse error": no `artifact-linter` root expects exit 2 (rows test only
    0 and 1). Add one malformed root (e.g. a requirement line with `REQ-1A`, or a missing `docs/spec.md`)
    expecting exit 2, or move it to advice. It matters: `stop-hook-integrity` row 5 depends on the
    learner knowing what exit 2 means.
  - L5 item 1 "imports the stdlib and `invoices.models`" for the implementation is not checked; drop it
    or check it.
  - L5 item 5 says "rules C1-C3 and C6 of the 2.7 resolver": the rule ids are introduced in L7; the
    lesson-author must spell the four rules out in words in L5 task.md.
- N2. L6 suspects rise from 00 L4's 21 (6 bugs + 15 decoys) to 27 (6 + 21), +29%, with transcript lines
  +0-10%. 25-30 min x ~1.2 = 30-36 min against 33. Acceptable; the student run should record transcript
  time separately, and 11.3's 28-decoy alternative would need a time recount.
- N3. Dependency table (section 4): to-spec/to-tickets are used and explained in L4 theory (design:711)
  but the row says introduced in L5; requirement-to-test labels (`req_NN`, traceability) have no row
  (introduced L5, used L5, L7). Fix the rows.
- N4. L5 `outcomes[]` copies the full O5 sentence, so the L5 page promises the session bug-hunt that L6
  does. Either allow a lesson to copy the half it serves, or add one line in L5 task.md "вторая часть
  результата: урок 6".
- N5. Optional grilling (L4): place it after the graded work in "Как работать", and say what to take
  away (e.g. compare your decisions with the D1-D5 of the transcript), so it is a practice of the freeze
  point, not a detour. Good addition otherwise.
- N6. Test layout change: the learner wrote/read pytest-style `test_api.py` in module 00 and uses pytest
  at work. L1 "Что в рабочей папке" should say in one line why it is now a `unittest.TestCase` (no pytest
  in the image) and why the hook's child runs without `-I` while every check and the E3 form use `-I`
  (observed: `-I` ignores `PYTHONPATH`, every test module fails to import). Without it the learner will
  copy `-I` from module 00 and fail rows 6-9 and 13 with no idea why; it is also a good small Linux
  lesson for the profile's weak spot.
- N7. Reconciling sentence: right content, and it should sit inside the block-routes paragraph (where
  exit codes are taught), not as a standalone aside, and name the event (00 L6 was PreToolUse, here
  Stop) so it does not read as a general rule change.
