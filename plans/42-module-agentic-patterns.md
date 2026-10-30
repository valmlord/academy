# #42 plan: course/ai-for-developers/02-agentic-patterns "Паттерны агентной разработки"

Tier MODULE. Source of truth for content and checks: `plans/42-module-agentic-patterns-design.md`
(revision 5, judge_design 3/3 PASS in round 5). This plan only splits the work and carries the
non-blocking judge items from round 5 that the design does not contain yet. Where this plan and the
design disagree, the item listed here wins; report any conflict instead of guessing.

Judge reports: `plans/42-module-agentic-patterns-design-review-{1..5}-{accuracy,pedagogy,assessment}.md`.
Fact base: `plans/42-module-agentic-patterns-research.md` (incl. the orchestrator addendum on the OpenAI
"Harness engineering" post) and design 12.9 (vendor facts, fetched 2026-10-30).
Prototype code the design was verified on (scratch, not shipped, reuse freely), Python 3.12.13:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/arch5/`
(`l1/verify_stage0.py`, `l2/verify_ws.py`, `l3/verify_b.py`, `suite/runner5.py`, `honest/` corpora,
`l4/g4_uvtoml.py`) and `judge-r4/`, `judge-r5/` (judge attacks and honest corpora).
Use `/opt/homebrew/bin/python3.12 -I` locally. Shell writes to paths named `.claude/` are blocked in scratch
(use `dotclaude/` there); real lesson files under `course/` may contain `.claude/` paths (L4 starter).

## Threat model of record (design 2.8, Stepan 2026-10-30)
Command checks must fail every IN-scope class: editing tests or graded files; hardcoding outputs; linter
suppression; exit-0 or stub scripts; stdlib shadowing (incl. a `unittest/` package); usercustomize/
sitecustomize; plain `importlib.import_module` / `__import__` / `exec` / `eval` with literal names; a new
vendored stub file; special-casing visible starter files; the untouched starter and listed near misses.
OUT of scope (residuals RS1-RS8, mentor reviews the diff): invisible/format characters; homoglyphs and
mixed scripts; names built from strings; runpy and other executors, subprocess re-running the interpreter;
bytecode; `sys.modules` aliasing; code planted into an existing module; SessionStart or output-style
injection; reading the hidden grader or the checks mount. Do not build against OUT-of-scope classes.

## Roles and files

| Role | Writes |
|------|--------|
| lesson-author A | `module.yaml`; L1-L3 `lesson.yaml`, `theory.md`, `task.md` |
| lesson-author B | L4-L5 `lesson.yaml`, `theory.md`, `task.md` |
| practice-designer A | L1, L2, L3: `quiz.yaml`, `starter/`, `checks/` (2.3 suite runner, stage 0 of `rule-placement` and `failure-log`, arch and deps rules, rubrics, reserve) |
| practice-designer B | L4, L5: `quiz.yaml`, `starter/`, `checks/` (contour-config G1-G7 + N1-N4 by effective value, bug-hunt snapshot and transcript, `bugs.yaml`, findings starter, reserve) |
| every practice-designer | its part of the demo record `plans/42-module-agentic-patterns-demo-<A|B>.md` (design 2.4) |

All roles read the whole design. They work in parallel on disjoint files. The lesson-authors own
`lesson.yaml` check entries but take check ids, kinds, `run` lines, `passScore`/`minFound`/`timeoutSec`
from the design verbatim; when a practice-designer must change a run line, it reports the change and the
orchestrator relays it. Task text names only what the checks verify (2.6) and never contains the
substring `checks/` (leak guard). Lesson text is Russian; code, identifiers, comments, file names English.
Every check message the learner sees is fully Russian (no English halves, no internal `(w1) ` prefixes
unless task.md shows them).

The 2.3 suite runner is implemented once by practice-designer A and copied into each lesson's `checks/`
that uses it (no symlinks; a lesson's checks are self-contained). Domain: `invoice-service` from 00/01
(design section 3); reuse 00 L6 `scripts/codegen.py` and its Makefile shape.

## Module level (lesson-author A)
- M1. `module.yaml`: keep `id`, `title`, `summary`; add outcomes O1-O5 verbatim from design section 1 and
  the 5 lessons in design order; `status: ready` only after validate is green and the student run is done.
- M2. Times per design section 7 (315 min total, 214 hands-on).

## Carried non-blocking items (round 5), not yet in the design
Pedagogy r5:
- P1 (practice-designer A): the w1 message shown to the learner has no `(w1) ` prefix unless task.md shows
  it; group labels taken verbatim from L2 item 4 (`pickle` must not get "исполняет или компилирует код").
- P2 (lesson-author A): the 2.3 task.md line about tests that tamper with the runner goes into L1 item 10,
  L2 item 7 and L3 item 7, worded "adds, replaces or removes a function or class of `unittest`".
- P3 (lesson-author A): L2 item 4 says relative imports are resolved (the learner's own `profile` is fine)
  and gives the way out for `importlib.metadata` / `importlib.resources`.
- P4 (lesson-author A): L2 item 4 set out as a sub-list, not one 10-line sentence.
- P5 (lesson-author B): split the uv sentence in the L4 brief into two.
- P6 (practice-designer A): the L1 s4 message fully Russian.
Accuracy r5:
- A1 (practice-designer A): gate the `enterContext` honest-corpus case on `sys.version_info >= (3, 11)` or
  replace it; checks must run on Python 3.10-3.13.
- A2 (lesson-author A): L2 item 4: `importlib`, `pkgutil`, `zipimport` import a module by a name or path
  given at run time; say that, not "code handed as text".
- A3 (practice-designer A, lesson-author A where mentioned): a `__code__` swap is a residual; never word it
  as "red anyway".
- A4 (lesson-author A, theory): research corrections owed since round 3 (design 12.6 (a)-(c)). The lesson
  cites the primary sources, not research summary R C1: V14 (`CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT`) and V10
  (five providers) from design 12.9; Jain's caveat "Untested ... open-weights models" from his article;
  Böckeler's phrase checked against her article (research line 52 says "positive form"; verify the exact
  word before quoting, or paraphrase without quotes).
Assessment r5:
- S1 (practice-designer A): patch-and-restore inside the run (a test module no-ops `TestResult.addFailure`
  at import and a later test restores it) passes today. Close it cheaply: count failures with the original
  methods captured before discovery, or compare the behaviour keys in each `stopTest`. Add the judge-r5
  case as must-fail and keep the honest corpus green.
- S2 (practice-designer A): `unittest.installHandler()` in a test reports `runner tampered`; mention it in
  the task.md runner line or leave it as is, no code change required.
- S3 (practice-designer A and B): run the honest and attack corpora on every available interpreter 3.10-3.13
  (`/opt/homebrew/bin/python3.1*`, `uv python` if present); record which versions ran in the demo file.

## Per lesson (design section 5 is the spec; read the lesson section in full)
- L1 `01-code-over-rules`: practice-designer A: the bloated starter CLAUDE.md (headings, 12 tagged lines,
  blanks only), `rule-placement` stage 0 + key (cap 3, binary feedback, pass >= 11 of 12), `poka-yoke-applied`,
  quiz, reserve. Lesson-author A: placement ladder (2.7) defined once in theory.
- L2 `02-architecture-checks`: practice-designer A: `arch-linter` (hidden roots per run, w1 module list
  with whole-component matching, w2 incl. the revision-5 `__file__` rule), `arch-workspace-clean`,
  `remediation-rubric` with blind demo.
- L3 `03-failure-analysis`: practice-designer A: failure-log (blind and per-item-oracle bounds as design),
  `deps-gate` (pristine set incl. `generated/`, OS and editor files named), `failure-fix-rubric`, quiz.
- L4 `04-closed-environments`: practice-designer B: `contour-config` graded by effective value, G1-G7
  planted and documented, N1-N4 guards, uv config at any level does not count, the 103-case demo matrix,
  quiz. Vendor semantics per design 12.9 at Claude Code 2.1.314.
- L5 `05-anti-patterns`: practice-designer B: snapshot + transcript, 9 planted, 18 decoys, `minFound 6`,
  `maxReports 10`, reference findings.

## Owed before `ready`, outside this module's files (design 12.6 (d)-(f))
The repo has no `images/` yet, so the image interpreter version, stdlib membership on it, `make` in
`academy-workspace:dev`, and the `sqlite3.Connection` audit event / uv `SSL_CERT_DIR` cannot be checked on
the image. The practice-designers verify them on 3.10-3.13 locally (S3) and the PR lists the image check as
owed to the workspace-image issue.

## Order
author (4 agents in parallel) -> student (honest + cheater per lesson) -> `pnpm content:validate`
(needs `pnpm install` in this worktree, never `--force` / `--legacy-peer-deps`) -> judge_content (3
judges, threat model above in every brief) -> compound -> commit -> PR.
