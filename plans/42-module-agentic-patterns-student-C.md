# #42 student run C: L5 bug-hunt, L2/L3 blind rubric grading

Scratch: `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/student-c/`
(`l5/findings.json` honest submission, `cheats/*.json`, `mk_cheats.py`, `grade_l5.py` = an independent
re-implementation of the 00 2.2 rule: exact `file`, `line` in range, `category` equal, maximum bipartite
matching, decoy hit by range whatever the category, pass = matched >= 6, decoy hits <= 1, reports <= 10).
Python 3.12.13 (`/opt/homebrew/bin/python3.12 -I`).

```
STUDENT REPORT patterns-anti-patterns (#42)
Honest run: pass on attempt 1 (matched 9/9, decoy hits 0, 9 reports); estimated learner time 45-55 min vs 50
Cheats tried: 7 -> 6 fail, 1 PASS (lexical grep of theory phrases)
Blocking: lexical-grep cheat passes (7 matched, 1 decoy hit)
```

## Part 1. L5 `05-anti-patterns`

### Honest run
Read `theory.md`, `task.md`, the L1 placement ladder (L1 theory, "Лестница размещения"), then every starter file.
Findings committed before opening `checks/`:

| file:line | category |
|---|---|
| snapshot/CLAUDE.md:7 | memory-bloat (tree) |
| snapshot/CLAUDE.md:49 | prose-rule (ledger imports) |
| snapshot/CLAUDE.md:51 | prose-rule (typecheck) |
| snapshot/CLAUDE.md:55 | memory-bloat (caps) |
| snapshot/.claude/hooks/no_print.py:14 | over-harness |
| snapshot/scripts/review.sh:8 | over-harness |
| snapshot/.claude/hooks/stop_import_review.py:21 | over-harness |
| transcript.md:98 | session-steering |
| transcript.md:120 | session-steering |

Result against `checks/bugs.yaml`: PASS on the first scored attempt, 9/9 matched, 0 decoy hits. The reference
`checks/reference/findings.json` also passes (9/9, 0). The `transcript.md` prefix numbers equal the physical
lines (checked for all 229 lines). `task.md` and `theory.md` do not contain the substring `checks/`.

Lines I considered and rejected, which a beginner could plausibly report: CLAUDE.md:50 (migration), :53
(vertical tasks), transcript 133/144 (corrections 1 and 2, not 3), 95-96 (a consequence of :55), 78 (a
consequence of :51), spec-review.yml (an LLM run, but for meaning). Two of these are decoys that the module's own
ladder points at (D2, D3 below).

Time: my wall time is not comparable. For a learner: theory ~12 min; snapshot (61-line CLAUDE.md, 5 hooks,
2 scripts, a Makefile, a workflow) plus a 229-line transcript ~25-30 min; file and submit ~8 min. 45-55 min,
consistent with 50.

### Cheater run (within maxReports 10, key not read)
| Cheat | Result |
|---|---|
| c1 `[]` | fail (0) |
| c2 hedge: 5 confident places x 2 categories each (10 reports) | fail (matched 5) |
| c3 right lines, swapped categories | fail (0) |
| c4 every CLAUDE.md rule line 49-55 as prose-rule + 3 sure ones | fail (5 matched, 4 decoy hits) |
| c5 every hook as over-harness + 4 sure ones | fail (7 matched, 3 decoy hits) |
| c6 one line repeated 10 times | fail (1, the matching is one-to-one) |
| c7 **lexical**: grep the starter for phrases from theory.md examples (`Think (really )?hard`, `жульнич`, `^- Always`, `claude -p`, `## Project structure`, a run of ALL-CAPS words, `we prefer`), category by file kind (transcript -> session-steering, hook/script/CI -> over-harness, CLAUDE.md -> prose-rule if it contains `Always`/`must not`, else memory-bloat) | **PASS: 7 matched, 1 decoy hit (spec-review.yml:17), 9 reports** |

c7 is mechanical, needs no judgement about any line, and is produced by `mk_cheats.py` in scratch. It passes
because six of the nine planted items reuse the surface wording of the theory's own examples almost verbatim
("Always typecheck before you finish" / "Always run the type checker ... before you finish"; "Think hard" /
"Think really hard"; "Не жульничай, не трогай тесты" / "Не жульничай и не правь тесты"; the Stop hook via
`claude -p`; the architecture tree; ALL CAPS), while only one decoy (spec-review) shares a trigger phrase. The
decoys are the theory's "good twins", but none of them reuses a trigger word. Blind uniform shotgun was not
re-derived; the design's 0.92% over 3 attempts covers it.

### L5 defects, ranked
1. **D1 BLOCKING (cheat passes): lexical triggers separate planted items from decoys.** Fix options, either
   suffices against c7: (a) reword the planted lines so they no longer echo the theory's examples (e.g. typecheck
   as "mypy must be clean when you hand over"; the cheat request without "жульничай"; the effort phrase without
   "think"); (b) add or reword decoys so that every trigger also hits a good practice: a judgement line in
   CLAUDE.md that starts with "Always" (for example "Always say in the PR why a boundary changes"), a user message
   with "think" that is not steering ("Think about whether a migration is needed and ask me"), a second legitimate
   `claude -p` use. Rerun `mk_cheats.py` after the change; c7 must fail and the reference must still pass.
2. **D2 high: CLAUDE.md:53 "Prefer small vertical tasks" is a decoy, but L1's ladder sends it to `delete`.** L1
   step 3: "выражает предпочтение с законными исключениями? -> delete". A learner who uses the ladder as the
   theory tells them to will call the line removable memory, i.e. `memory-bloat`, and hit a decoy. The
   `bugs.yaml` header claim "Every instruction-file decoy survives lesson 1's ladder as `memory` (step 1 or 7)"
   is false for this line. L5 theory also contradicts L1 here: it lists "предпочтение с законными исключениями"
   as a *good twin* of prose-rule. Fix: replace the decoy with a judgement line (design had "Reminders skip
   disputed invoices (REQ-09, tested)" and "Import boundaries are enforced by make check"), or reconcile the
   two theories.
3. **D3 medium: CLAUDE.md:50 "Ask before adding a database migration" is a decoy, but it is enforceable by a
   program.** A permission `ask` rule on the migrations path, or a PreToolUse hook, enforces exactly "ask
   before". Under L5 question 3 ("a must-hold rule a program could check **or enforce**") the line reads as
   `prose-rule`. The key's note "no program can tell whether the agent asked" covers *checking*, not
   *enforcing*. With D2, an honest learner can land 2 decoy hits and fail despite finding every planted item.
   Fix: pick a decoy no settings rule can enforce, or state in theory why a human-approval step is a judgement.
4. **D4 medium: CLAUDE.md:49 category is ambiguous against L1.** `stop_import_review.py` exists, so L1 step 2
   ("already enforced by a hook ... the line leaves memory in any case") and L1's common mistake "Оставить строку
   в CLAUDE.md, когда её уже обеспечивает хук" make a learner call :49 redundant memory (`memory-bloat`). L5
   defines prose-rule as a rule that "есть только текстом", which it is not literally. The key's own walk says
   "only prose and an LLM Stop hook guard it". Fix: one sentence in L5 theory or task: a rule guarded only by a
   model review (which missed the violation) is still a prose-rule.
5. **D5 low: anchor ranges are narrower than the text suggests.** `no_print.py` accepts 14-16, but the
   preference is stated in the docstring (line 2: "we prefer logging"). `stop_import_review.py` accepts 20-23,
   but the decision to ask a model is also the PROMPT constant (8-11). `review.sh` accepts 7-8, but its comment
   (2-3) states the intent. The anchor rule ("the line in its code that does the extra work") supports the key,
   but a docstring or prompt line is a defensible reading. Fix: widen each range to the function or the
   constant, or say in task.md that comments and docstrings are not anchors.
6. **D6 low: task.md inventory is off.** "`CLAUDE.md` примерно на 70 строк": it has 61 (the transcript itself
   says 61). "около 250 строк": transcript has 229. The "Что в рабочей папке" list omits `Makefile`,
   `.github/workflows/spec-review.yml`, `scripts/check_architecture.py` and `docs/adr/`, and two decoys live in
   the first two. `.github/` is hidden from a plain `ls`.
7. **D7 low (runner spec #08): silent non-matches burn attempts.** `file` is compared exactly. `./snapshot/CLAUDE.md`,
   `CLAUDE.md` or `snapshot/.claude/hooks/no_print.py` written as `.claude/hooks/no_print.py` match nothing and
   use a scored attempt, and the feedback is only "не пройдено". 00 2.2 also does not say whether an unknown
   `category` is a format error. Suggest: a `file` not among the starter files, or a category not in
   `categories`, is a (free) format error naming the index and field.
8. **D8 unverified: hook entries use `"command": "python3", "args": [...]`.** I did not confirm that this
   exec form exists in Claude Code 2.1.314 hooks (design 12.9 does not list it). If it does not, a learner who
   knows the hooks schema may report settings.json as broken. Check against the hooks reference.

The reserve excerpt (`checks/data/reserve/anti-pattern-hunt.yaml`) was read only for leaks and form. I did not
grade it.

## Part 2. Blind rubric grading as the mentor

Procedure: I read each rubric and every sample, and wrote down scores before opening either `rubric-demo/README.md`
or the demo-A record. I read the L3 incidents and `checks/reference/failure-log.json` (the mentor key the rubric
names) as context. I did not include `check_deps.py` with the L3 samples: I graded the fix texts only.

### L2 `remediation-rubric` (lowest of A1-A3 per criterion; pass >= 0.7 and no 0)
| Sample | Mine M1-M4 | Expected | Verdict mine / expected |
|---|---|---|---|
| weak | 0,0,0,2 = 2/8 | 0,0,0,2 | fail / fail |
| borderline | 2,1,1,2 = 6/8 | 2,1,1,2 | pass / pass |
| memory-dependent | 0,0,0,2 | 0,0,0,2 | fail / fail |
| suppress | 2,2,2,0 | 2,2,2,0 | fail / fail |
| shouting | 2,2,2,1 = 7/8 | 2,2,2,1 | pass / pass |
| injection | 0,0,0,2, injected text named | as weak, named | fail / fail |

Agreement: 6/6 verdicts, 6/6 criterion vectors.

Ambiguous criteria:
- **R1 (medium, verdict-flipping): borderline A3 "Fix: see docs/money-formatting.md for the formatter to use".**
  Read under M2, this has the same shape as the 0 example "Fix: see CLAUDE.md". A mentor who reads it that
  way scores M2 = 0 and the sample fails. The expected PASS has no margin, so a single reading decides it. Fix:
  say in M2 that a Fix which only points to a named non-memory file scores 1 (and is graded again under M3), or
  that "see CLAUDE.md" is 0 *because* it is the memory file.
- R2 (low): "forbidden import" with no module named. M1's level 1 example ("forbidden import invoices.money")
  names the module, and level 0 ("bad import") does not, so I scored 0. A literal mentor could give 1. The
  verdict does not change.
- R3 (low): M3 for a message that names nothing (weak). The 0 level describes dependence on the memory file,
  not emptiness. I scored 0 by elimination. The verdict does not change.

### L3 `failure-fix-rubric` (pass >= 0.7 and no 0)
| Sample | Mine F1-F4 | Expected | Verdict mine / expected |
|---|---|---|---|
| weak | 0,0,0,(0-2) | 0,0,0,2 | fail / fail |
| borderline | 1,1,1,1 = 4/8 | 1,1,1,1 | fail / fail |
| symptom | **0**,0,2,2 = 4/8 | **2**,0,2,2 = 6/8 | fail / fail |
| injection | as weak, injected text named | as weak, named | fail / fail |

Agreement: 4/4 verdicts, 3/4 criterion vectors.

Ambiguous criteria and record defects:
- **R4 (medium): symptom F1 in the README contradicts the rubric and the README's own borderline.** F1 counts
  fixes "at another layer than `layer` says". In symptom, I01 (`layer: memory`) fixes with `pip install -e .`,
  I02 (`layer: hook`) with a `pip install`, and I10 (`layer: memory`) with a Makefile change. That is three
  off-layer fixes, so F1 = 0. The README gives F1 = 2 for symptom, while for borderline it gives F1 = 1 for
  one off-layer fix (I03). The verdict is unaffected because F2 is 0 either way. But this recorded expectation
  trains the mentor to skip the layer test whenever a fix is a symptom fix. Fix the README (F1 0, 4/8), or
  state in F1 that layer is judged only for fixes that address the cause.
- R5 (low): F3 for borderline I03 ("Write in CLAUDE.md that the project runs on Python 3.10"). This is a fact,
  not a "be careful" request, so a literal reading of F3's heading gives 2. The README gives 1 via "a memory line
  is used only for facts (I01, I10)". I matched the README only because I read the level-2 text, not the
  heading. The verdict is unaffected (4/8 or 5/8, both fail). Fix: F3 level 1 could say "a memory line where a
  deterministic layer applies counts as request-only".
- R6 (low): F4 for eight one-word fixes (weak, injection). The level 1 text mentions "a token change too small
  to matter", and eight such changes could read as 0. The README gives 2. Not verdict-relevant, but the "too
  small" clause and the "3 or more" scale should name the same thing.
- Note: the L3 README says "graded together with `checks/reference/scripts/check_deps.py`". I graded without
  it because the rubric's I02 reading is about the fix text. If the D1 message is meant to move a score, the
  rubric should say which criterion it feeds.

## Summary of blocking and owed
- Blocking: D1 (the lexical cheat passes L5).
- Should fix before `ready`: D2, D3 (two decoys the module's own ladder or rule points at; together they fail an
  honest learner), D4, R1 (borderline verdict depends on the reading), R4 (wrong expected F1 in the record).
- Low: D5-D8, R2, R3, R5, R6.
