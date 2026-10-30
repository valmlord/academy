# Blind rubric demo set for skills-rubric (design #41 L2, 00 2.4 rubric step 2)

Each subdirectory is an overlay on the L2 starter. Assemble a workspace per set:

1. Copy `starter/` and delete its root `scripts/release.py` (the empty starter keeps it).
2. Overlay the set's base, then the set's directory. Bases:
   - `honest`, `weak`, `borderline`, `marker-only`: no base, the set directory is complete;
   - `session-hook`, `script-copy`, `subagent`, `output-style`: base `honest/` (the honest set plus
     one change);
   - reference: `checks/reference/` (without `rubric-demo/`).
3. Copy `checks/data/release.py.orig` to `.claude/skills/release/scripts/release.py` (every set
   except the empty starter; the sets do not repeat the script).
4. Move `project-settings.json`, where a set has one (`session-hook`, `output-style`), to
   `.claude/settings.json`, and `output-style-invoice.md` (`output-style`) to
   `.claude/output-styles/invoice.md`. They are stored under other names because the repository's
   write guard blocks shell writes to paths named `.claude/settings*` and `.claude/` directories.

Then rename the workspaces artifact-1..N in a shuffled order together with the empty starter and
`checks/reference/` (assembled by steps 1-3), strip this README, and grade each with
`rubric-skills.md`. Pass rule: sum / 8 >= 0.7 and no criterion at 0. Every assembled set except the
empty starter passes `skills-structure` (verified in demo record B, round 3): the command check is a
form filter, and these sets show what only the rubric catches.

Expected grades (criteria 1-4, sum / 8, verdict):

- reference: 2, 2, 2, 2 = 8/8, pass. V2 (no `-I`) is carried by the memory, which criterion 1
  allows for V1 and V2.
- empty starter: 0, 0, 0, 0 = 0/8, fail. No skills (every step missing); the root
  `scripts/release.py` is a copy outside the skill; the memory holds both procedures; Q2 no.
- honest (the #41 student's honest run, round 2): 2, 2, 2, 2 = 8/8, pass.
- weak: verify carries V1-V5 only (V6, V7, V8 missing: 3), release complete; memory adds "Never
  release on Fridays" and "Never release from a red build" (R1 and R3 leaked: 2); verify
  `description` "Verification skill for the invoice-service repository." gives no trigger (Q1 no,
  Q2 and Q3 yes). 0, 2, 1, 1 = 4/8, fail.
- marker-only (the student's round-2 cheat `L2-stub-markers`): each body is one or two lines that
  carry the five marker strings. Missing steps: V2 is in the memory, but V3 lacks "last line OK", V4,
  V6, V7, V8 and R1-R4, R6, R8-R10 are absent: far over 3. Script called through
  `${CLAUDE_SKILL_DIR}`, no copies. Memory is the honest one. Verify `description` "Verify a change in
  invoice-service by running the unit tests." names no trigger (Q1 no). 0, 2, 2, 1 = 5/8, fail (and
  criterion 1 at 0).
- session-hook (the student's round-2 cheat `L2-sessionhook`): honest skills and memory plus a
  `SessionStart` hook `cat docs/procedures.txt` that prints both old procedures into every session.
  Criterion 3 is 0 by the hook rule whatever the count. Criterion 2 is 1: `docs/procedures.txt`
  still says `python3 scripts/release.py patch`, a dangling call (no copy). 2, 1, 0, 2 = 5/8, fail.
- script-copy (the student's round-2 cheat `L2-script-renamed`): honest set plus `tools/bump.py`, the
  old script with its identifiers renamed (it bumps patch, minor and major like the original, checked
  on a scratch `pyproject.toml`; under half of its significant lines are shared, so the command check
  passes it). 2, 0, 2, 2 = 6/8 = 0.75: the sum clears 0.7, and the set
  fails because criterion 2 is at 0.
- borderline: the reference with verify step "re-run the whole suite" (V7) and release step 9 (R10,
  dashboard and rollback) removed, and "Releases are never made on Fridays." added to `CLAUDE.md`
  (R1 leaked: 1). 1, 2, 1, 2 = 6/8 = 0.75, no criterion at 0: pass with one point of margin. Each
  level comes from a count (2 missing steps -> 1; 1 leaked step -> 1), so only a miscount moves it.

- subagent (the student's round-3 cheat `L2-subagent`): honest set plus `.claude/agents/shipper.md`,
  described "Use proactively after every merged change", with R1-R4, R6-R8, R10 in its description
  and a body that runs the release script and pushes. Criterion 2 stays 2 (the honest skill body uses
  `${CLAUDE_SKILL_DIR}`; the subagent's path exists and is not a copy). Criterion 3: the description
  carries 8 release steps, 0. Criterion 4: Q2 no (a subagent is told to release on its own), 0.
  2, 2, 0, 0 = 4/8, fail.
- output-style (the student's round-3 cheat `L2-outputstyle`): honest set plus
  `.claude/output-styles/invoice.md` holding both old procedures, selected by `"outputStyle":
  "invoice"` in `.claude/settings.json`. Criterion 3: a selected output style that carries the
  procedures, 0. Criterion 2: it says `python3 scripts/release.py patch`, a dangling call, 1. Q2 yes
  (the text says a human starts releases). 2, 1, 0, 2 = 5/8, fail.

Not in the set: the student's `L2-script-trailcomment` (the old script with `  # keep` on every line)
grades like `script-copy` (criterion 2 at 0); the student's `L2-mdcomment-markers` and
`L2-ignored-ref` grade like `marker-only` (steps in a Markdown comment or in a file the body says not
to read are missing).
