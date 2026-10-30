# #41 plan: course/ai-for-developers/01-spec-driven-development "Spec Driven Development"

Tier MODULE. Source of truth for content and checks: `plans/41-module-spec-driven-development-design.md`
(revision 7, judge_design 3/3 PASS in round 6). This plan only splits the work and carries the
non-blocking judge items from rounds 5-6 that the design does not contain yet. Where this plan and the
design disagree, the later judge item listed here wins; report any conflict instead of guessing.

Judge reports: `plans/41-module-spec-driven-development-design-review-{1..6}-{accuracy,pedagogy,assessment}.md`.
Fact base: `plans/41-module-spec-driven-development-research.md` and `-research-addendum.md`.
Prototype code the design was verified on (scratch, not shipped, reuse freely):
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-zealous-bhaskara-22c06a/8b58a220-6421-4cbe-980e-760493c05b9c/scratchpad/m3/`
(seam, grader, probes/harness.py generator, guards, attacker hooks) and `judge-r2` .. `judge-r6` (judge attacks).

## Roles and files

| Role | Writes |
|------|--------|
| lesson-author A | `module.yaml`; L1-L4 `lesson.yaml`, `theory.md`, `task.md` |
| lesson-author B | L5-L7 `lesson.yaml`, `theory.md`, `task.md` |
| practice-designer A | L1, L5, L7: `quiz.yaml`, `starter/`, `checks/` (seam 2.6, Stop-hook protocol and generator 2.8, guards, mutants, acceptance tests, reserve) |
| practice-designer B | L2, L3, L4: `quiz.yaml`, `starter/`, `checks/` (skills-structure, glossary, sdd-artifacts, rubrics, reserve) |
| practice-designer C | L6: transcript, `bugs.yaml`, findings starter, reserve excerpt |
| every practice-designer | its part of the demo record `plans/41-module-spec-driven-development-demo-<A|B|C>.md` |

All roles read the whole design. They work in parallel on disjoint files. The lesson-authors own
`lesson.yaml` check entries but take check ids, kinds, `run` lines, `passScore`/`minFound`/`timeoutSec`
from the design verbatim; when a practice-designer must change a run line, it reports the change and the
orchestrator relays it. Task text names only what the checks verify (2.9) and never contains the
substring `checks/` (leak guard). Lesson text is Russian; code, identifiers, comments, file names English.

Shared grader code (2.3 parser subset, 2.6 seam, 2.7 resolver, 2.8 generator and guards) is implemented
once by practice-designer A and B as needed and copied into each lesson's `checks/` (no symlinks; a lesson's
checks are self-contained). One resolver per concept (practice-designer mistakes, #15): every rule in every
lesson goes through the same copy.

## Module level (lesson-author A)
- M1. `module.yaml`: outcomes O1-O6 verbatim from design section 1, the 7 lessons in design order, keep
  `summary`, `status: ready` only after validate is green and the student run is done.
- M2. Times per design section 7 (420 min total).

## Carried non-blocking items (rounds 5-6), not yet in the design
- P1 (pedagogy r6 N-o, lesson-author A): L1 task item 1 names the same five skip constructs as item 6.
- P2 (pedagogy r6, lesson-author B): L7 task.md says "original ... as shipped in the starter" wherever the
  check means the pristine copy (task.md cannot name its location).
- P3 (assessment r6 N1, practice-designer A): the `generate()` state-flow assertion also requires that the
  `tokens` expression contains no call and no walrus (`NamedExpr`), and that `tokens`, and `v` after that
  line, are read only in the `return`; add `harness_tokflow.py` (judge-r6) as a fourth control that must
  go red; also run `harness_tokleak.py`.
- P4 (assessment r6 N2, lesson-author B + practice-designer A): one wording everywhere for the L7 task rule:
  "every task that lists it has `Status: done`" (stage 0, (C), task.md items 2 and 4).
- P5 (accuracy r6): no action in shipped files (design-internal location list).

## Per lesson (design section 5 is the spec; read the lesson section in full)
- L1 `01-verification`: practice-designer A builds the 2.6 seam (variants over a pipe, exec, `-I -B`,
  non-dumpable server, test process and grader, typed domain, `secrets` shuffles, fresh TMPDIR/HOME, pgroup
  kill, nonce record), the late-fee mutants and acceptance tests, the 2.8 one-template generator (draw
  first, hit and miss seed per value, state selects in one place) and all three guards (text, metadata and
  timing at 1000+1000, state-flow AST incl. P3), stage 0 for both capped checks, the quiz and reserve.
- L2 `02-skills`, L3 `03-domain-ontology`, L4 `04-spec-adr-tasks`: practice-designer B, per design; YAML
  subset (2.3) and the 2.7 grammar/resolver; MADR near-miss with unquoted date; rubrics with blind demo.
- L5 `05-pocock-pipeline`: practice-designer A; vendor four Matt Pocock SKILL.md (MIT LICENSE, `UPSTREAM.md`
  with tag and full commit SHA, fetched from github.com/mattpocock/skills at the tag the design names;
  re-check names at fetch) under `starter/vendor/mattpocock-skills/`, not registered as skills.
- L6 `06-pipeline-bug-hunt`: practice-designer C; transcript 380-420 lines, 6 bugs, 21 decoys, bugs.yaml
  per 00 2.2 with every accepted range counted; reserve excerpt with its own key.
- L7 `07-integrity-control`: practice-designer A; linter stub generator (one template), change-request
  check with stage 0 copied verbatim into task.md item 4, the demo pair (ADR numbering gap: stage 0,
  counter unchanged; test broken on a correct version: counter +1).

## Demonstration (every practice-designer, per design 2.4 / 2.5 / 2.10)
- Python 3.10+ (`/opt/homebrew/bin/python3.12` first on PATH; `/usr/bin/python3` is 3.9.6); record
  `python3 --version`. Linux-only claims (PR_SET_DUMPABLE) re-run in a `python:3.12-slim` container if
  docker is available; else record "not run" explicitly.
- Every command check: one recorded run fails on the untouched starter, one passes on the reference;
  every attacker the design lists is run and recorded with its result and base copy.
- Run `pnpm content:validate` before handing back.

## Decisions recorded for Stepan (PR body)
- Bug-hunt cumulative 1.385% over 3 attempts (above 1%), kept as in module 00.
- Cap of 10 counted failed submissions on five checks, with uncounted stage 0.
- Residuals (iii) mount and (iv) static probe evaluator accepted until runner isolation (00 2.5.3).
- Module 420 min. Follow-up issue for module 00 L6 theory.md:95 (exit 1 with JSON).

## Done when
- `pnpm content:validate` green; demo records complete; student honest and cheater runs reported, no
  cheat passes outside the accepted residuals; judge_content 3/3 PASS.
