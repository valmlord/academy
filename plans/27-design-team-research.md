# Issue #27 research: a design (UX/UI) agent team and a DESIGN tier

Researcher, PIPELINE tier, branch `feat/27-design-team`, HEAD `8511e8c`, pipeline state
`PIPELINE/researcher #27`. Checked on macOS, Claude Code 2.1.267. Facts only; the architect designs.

## Findings

### 1. `.claude/pipeline.json` structure and how it is validated

- Fact: top level (`.claude/pipeline.json:2-179`): `_comment`, `state_ttl_hours`, `watchdog_minutes`,
  `hook_log_max_bytes`, `state_lock_timeout_seconds`, `grant_file`, `protected_branches`, `tiers`,
  `agent_gates`, `judge_agents`, `learn_tier_editable_paths`, `human_wait_phases` (`["learner"]`),
  `learn_tier_test_globs`, `learn_tier_code_dirs`, `protected_files` (`[".claude/pipeline_state"]`),
  `pipeline_core_files` (`[".claude/pipeline.json", ".claude/settings", ".claude/hooks/"]`).
- Fact: a tier has `team`, `requires_issue`, `phases`, `judges`, optional flags `edits_pipeline_core`
  (PIPELINE, :59) and `learner_writes_code` (LEARN, :80). Teams in use: `dev` (HOTFIX, TASK, PROJECT,
  PIPELINE, LEARN, RELEASE), `content` (MODULE :99, LESSON :120), `any` (RESEARCH :137).
- Fact: content tiers' phases: MODULE `init, researcher, architect, judge_design, planner, author,
  student, validate, judge_content, compound, commit, pr, notify, done` (:101-116); LESSON has no
  architect/judge_design/planner/compound (:121-133).
- Fact: `agent_gates` (:149-157) maps agent FILE BASENAME -> `[first, last]` phase window. Gated today:
  `coder.md [coder, judge_code]`, `tester.md [tester, judge_code]`, `curriculum-architect.md
  [architect, judge_design]`, `lesson-author.md`/`practice-designer.md [author, judge_content]`,
  `student.md [student, judge_content]`. NOT gated: `researcher.md`, `architect.md`, `mentor.md`,
  `content-researcher.md` (spawnable in any phase of any tier once a pipeline is active, and even
  without a pipeline, see 2).
- Fact: `judge_agents` (:158-165) maps judge KEY -> file basename (`security`, `architecture`,
  `operations`, `accuracy`, `pedagogy`, `assessment`).
- Fact: validation is `cfg._validate` (`.claude/hooks/lib/cfg.py:68-105`): `team` only has to be a
  string (:80-82), there is NO list of allowed team values anywhere; `phases`/`judges` lists of strings
  (:77-79); the three flags exact bool (:85-88, `TIER_FLAG_KEYS` :61); `judge_agents` str->str
  (:89-91); `agent_gates` must be an object, its values are not validated (:92-93); top-level string
  lists (:59-60, :99-101). New tier flags must be added to `TierConfig` (:23-29) and `TIER_FLAG_KEYS`,
  otherwise mypy strict / the cast comment (:102-104) lie (see coder lesson 2026-10-28 on casts).
- Fact: `team` is read by NO hook. `grep team .claude/hooks -r` hits only `cfg.py:24,80-82`. It is
  documentation only today.
- Fact: judges per tier are ONE list for every `judge_*` round of the tier: `pipeline-advance.sh:183`
  (`JUDGES=$(cfg judges "$TIER")`), unanimity check :282-290, Stop check `phase-complete.sh:65-83`
  (every judge round of the tier needs PASS from every judge of the tier). A tier cannot have
  different judges on different rounds without a hook change.
- Fact: a phase is a judge round iff its name starts with `judge_` (`cfg.py:128`, `phase-gate.sh:75-78`,
  `lib/common.sh:86-91`, `pipeline-advance.sh:186,282`, `lib/state.py:370`). Other reserved phase names
  with CLI behaviour: `init`, `status`, `pause`, `resume`, `parked`, `spawn`, `compound` (skip),
  `pr`, `notify` (`pipeline-advance.sh:119-265`); `learner` via `human_wait_phases`
  (`phase-complete.sh:47-52`). `done` is the terminal phase (`phase-complete.sh:63`). Every other
  phase name (author, student, validate, ...) is a free string with no hook semantics.
- Implication: a DESIGN tier is pure data in `pipeline.json` (tiers, `agent_gates`, `judge_agents`),
  except role recognition (section 2). The `team` value `design` is accepted as-is.

### 2. Hardcoded team/role/phase names in `.claude/hooks/`

Exhaustive grep over `.claude/hooks/**` for team, role, judge and phase names:

| Location | What is hardcoded | Third team needs a change? |
|---|---|---|
| `lib/hookio.py:39` `ROLE_RE = ...\.claude/agents/(?:dev\|content)/([a-z0-9-]+\.md)...first` | team dirs in the role regex | **yes** |
| `lib/hookio.py:67` `for team in ("dev", "content"):` in `agent_names()` | team dirs scanned for `subagent_type` -> file | **yes** |
| `phase-gate.sh:53-55` `coder.md` + `learner_writes_code` | one role name (LEARN rule) | no |
| `pipeline-advance.sh:192` message `Read .claude/agents/<team>/$F first` | placeholder text only | no (could print the real team) |
| `phase-complete.sh:49,63` "waiting for the learner" | text only | no |
| `pl_write_gate.py:19` `OPEN_PREFIXES = (".claude/", "pipeline/", "plans/")` | always-writable dirs | only if `design/` should be always-writable (section 3) |

Everything else is data-driven: tiers/phases/judges/gates via `cfg.py` commands (`cfg.py:121-142`).

- Role recognition (`lib/hookio.py:18-21,84-91`): the role is the file basename captured by `ROLE_RE`
  from the LEADING `Read .claude/agents/<team>/<file>.md first` of the prompt (case-insensitive,
  optional backtick/quote); else `subagent_type` looked up in `agent_names()` (frontmatter `name:` in
  the first 400 bytes -> file basename, files starting with `_` skipped, :62-81). Only the BASENAME is
  kept: the team directory is not part of the role.
- Consequence today: `Read .claude/agents/design/judge-usability.md first` does not match `ROLE_RE`
  -> role `""` -> `phase-gate.sh:25` returns 0 (allowed, treated like a plain Explore agent), and its
  vote is never recorded (`judge_key("")` = `""`), so a design judge round would sit at NOTVOTED
  forever. Same for `subagent_type: judge-usability`.
- Phase gate (`phase-gate.sh:21-81`): role -> `is_gated` if basename in `agent_gates`, `is_judge` if
  basename is a `judge_agents` value (:27-30). Gated or judge roles: blocked with
  `isolation: worktree` (:34-37) and without an active own pipeline (:42-46). Gated: both window phases
  must be in the tier's phase list, else "not part of tier" (:58-62); current phase index must be within
  the window (:63-65). Judge: its key must be in the tier's `judges` (:68-74) and the current phase must
  start with `judge_` (:75-78). Ungated non-judge roles are always allowed.
- **Cross-team leak via phase names**: windows are keyed by phase NAME, not by tier/team. If DESIGN
  reuses `author` and `judge_content`, then `lesson-author.md`, `practice-designer.md` (and `student.md`
  if it has `student`) become spawnable inside DESIGN; conversely a design role gated
  `[author, judge_content]` becomes spawnable in MODULE/LESSON. Only distinct phase names, or a new
  team check (e.g. role's team dir vs tier `team`), prevent that. Note the regex currently drops the
  team dir, so a team check needs the captured team too.
- Judge vote attribution: `judge_key(role_file)` reverse-looks-up `judge_agents` by basename
  (`hookio.py:103-111`). Three record paths: PreToolUse `SubagentHandback` (`judge-handback.sh`, role
  from the subagent transcript's first user record or the spawn map, `hookio.py:229-250`), SubagentStop
  (`judge-vote.sh`, `hookio.py:282-298`), PostToolUse Agent (`judge-count.sh`, also writes the spawn
  map `hookio.py:253-260`). All funnel into `pl_record_vote` (`lib/common.sh:82-101`) ->
  `pipeline-advance.sh <judge_phase> <key> <verdict>` (:186-210), which ignores a key not in the
  tier's judges (:196-199). Votes keyed per agent id per round (`state.py:346-363`).
- **Uniqueness**: because only the basename is the role, a basename must be unique across all team
  dirs (`design/researcher.md` would be read as the dev `researcher.md`, `design/coder.md` as the
  gated coder). `agent_names()` builds a dict by frontmatter name, last file wins silently.
- Proposed names collide with nothing: existing basenames are listed in section 5. `ux-researcher`,
  `product-designer`, `ui-designer`, `judge-usability`, `judge-accessibility`, `judge-visual-consistency`
  (or similar) are free.
- Implication: minimum hook change for a third team = `hookio.py:39` and `:67` (ideally derived from
  one list, e.g. the set of tier `team` values in `pipeline.json` or a new top-level `teams` key,
  instead of a third literal). Everything else is `pipeline.json` data + tests.

### 3. Write gates: is `design/` product?

- Fact: `pl_write_gate.decide` (`lib/pl_write_gate.py:67-110`): always blocked (.git, transcripts,
  user settings, grant file, :26-46); main state/core (:56-64); protected files (:91-92); core in a
  worktree (:94-95); `OPEN_PREFIXES` `.claude/`, `pipeline/`, `plans/` always writable (:19, :96-97);
  anything else needs an active own pipeline (:100-103); LEARN additionally restricts to
  `learn_tier_editable_paths` + test globs (:104-110).
- Fact: `learn_tier_editable_paths` = `.claude/, pipeline/, docs/, plans/, learner/, backlog/`
  (`pipeline.json:166`); `learn_tier_code_dirs` = `apps/, services/, packages/, images/` (:177).
- Implication: a new top-level `design/` is product by default: writable in ANY active pipeline (any
  tier, any team), blocked without one; in LEARN, tool writes to `design/` are blocked (not in the
  editable list) while shell writes are not (`pl_shell_guard.py:81-87` only guards
  `learn_tier_code_dirs`). No allowlist change is required for the DESIGN tier to write `design/`.
- Fact: there is no per-team path scoping anywhere: a dev coder in TASK can write `course/` or
  `design/`, a content author can write `apps/`. Hooks never enforced "team X writes only its dirs"; it
  is discipline (CLAUDE.md section 4.1).
- Fact: `bash-code-guard.sh` / `pl_shell_guard.py`: never-written targets (:31-36), core shell writes
  (:64-72), LEARN code dirs (:73-87). Nothing about `design/`.
- Implication: the architect decides whether `design/` gets added to `learn_tier_editable_paths`
  (agents could then touch design files during LEARN) and whether path scoping per team is wanted
  (new mechanism, not existing).

### 4. `tests/pipeline/run.sh`

- Fact: 1191 lines, one script, throwaway git repo at a path with a space, copies `.claude/`
  without runtime files (:1-36); helpers (:70-176): `ok/bad`, `expect_rc <desc> <rc> <cmd>`,
  `adv_ok/adv_fail` (pipeline-advance rc 0/1), `vote`, `agent <prompt> [subagent_type]` (phase-gate
  rc, :81-83), `write_to <rel>` (require-pipeline rc), `bashcmd`, `stop`, `subagent_stop <prompt>
  <report> [transcript_only]` (:92-97), `subagent_handback` (:98-103), `post_agent` (:104-106),
  `votes` (status -> `key:verdict` list, :165), `set_cfg/restore_cfg`, `put_state`, `reset_state`.
  Role prompts as variables: `JS`, `JA`, `JO`, `CODER` (:166-169).
- Example (role window + subagent_type), `run.sh:202-210`:
  `expect_rc "coder blocked before coder phase" 2 agent "$CODER"`;
  `expect_rc "coder blocked via subagent_type too" 2 agent "implement" coder`;
  `expect_rc "judge blocked outside judge phase" 2 agent "$JS"`.
- Example (judges of another team rejected, votes attributed), `run.sh:212-219`:
  `expect_rc "content judge not allowed in TASK" 2 agent "Read .claude/agents/content/judge-pedagogy.md first."`;
  `subagent_stop "$JS" "...FAIL: 1 issue found"` then `[ "$(votes)" = "security:FAIL architecture:PASS" ]`.
- Example (content tier group, the closest model for DESIGN), `run.sh:282-295`: `init MODULE 20`,
  `coder not part of MODULE` (2), `lesson-author blocked before author phase` (2), content trio votes
  via `subagent_stop`, `subagent_stop "$JS" "FAIL: off-tier"` then `adv_ok "off-tier judge vote ignored,
  content trio enough" planner`, `lesson-author allowed in author phase` (0), course file writable.
- Fact: CI job `pipeline` (`.github/workflows/ci.yml:45-54`): `shellcheck -S error` on hooks, lib and
  run.sh; `python3 -m py_compile .claude/hooks/lib/*.py`; `bash tests/pipeline/run.sh`; timeout 5 min.
  Job `pipeline-types` (:56-72): Python 3.12, pinned mypy 1.20.2 (`tests/pipeline/requirements-typecheck.txt`),
  `mypy --strict --python-version 3.9` on `.claude/hooks/lib/*.py`.
- Fact: local run on this branch (macOS): `228 passed, 0 failed`, wall time 2:21 (107 s user). CI
  timeout is 5 min, so headroom is about 2x on similar hardware; each `agent`/`subagent_stop` call
  spawns several python3 processes, so a dozen new rows add a few seconds.
- Fact: run.sh hardcodes only role prompts with `dev/` and `content/`; nothing derives from
  `pipeline.json`, so new rows are needed for design roles; existing rows need no change.

### 5. Role file conventions and agent registration

- Fact: frontmatter of every role file: `name`, `description`, `tools` (YAML list), closing `---`
  after a blank line (e.g. `.claude/agents/dev/judge-security.md:1-11`). No `model`, no `isolation`.
  Judges have `Write`/`Edit` (to append mistakes files); some have `Bash` (assessment, operations) or
  `WebFetch/WebSearch` (accuracy).
- Fact: sections: title `# <Role> Agent`; `## Before ..., load` (own mistakes file, meta-rules, team
  `_contract.md`/`_learn-mode.md`); `## Checklist` / `## You write`; `## Style` / `## Rules`;
  judges add `## Response format` and `## If FAIL, you MUST` (`judge-security.md:46-76`).
- Fact: verdict format: `PASS - ...` / `FAIL - N issues found:` + `[file:line]` list
  (`judge-security.md:46-57`); content judges say `PASS: ... Checked: ...` / `FAIL: N issues: [file:line]`
  (`content/judge-pedagogy.md:33-36`). Hook parse rule: last line that is exactly `PASS`/`FAIL`,
  `PASS: ...`, `PASS - ...`, `VERDICT: PASS|FAIL`, uppercase, markdown stripped (`hookio.py:22-24,40,94-100`).
- Fact: FAIL procedure: identify the responsible role, append to `.claude/feedback/<role>_mistakes.md`
  with `### YYYY-MM-DD: Short description` / what happened / `Rule: ...`
  (`judge-security.md:59-76`). Mistakes files exist per role (`.claude/feedback/`: researcher,
  architect, coder, tester, judge, orchestrator, content-researcher, curriculum-architect,
  lesson-author, practice-designer, student). New roles need seeded files (`ux-researcher_mistakes.md`,
  etc.); `.claude/feedback/` is always writable.
- Fact: team-shared docs start with `_` and are skipped by `agent_names()` (`hookio.py:72`):
  `content/_contract.md` (29 lines, summary of the lesson contract pointing at schema.ts + ADR-0001) and
  `dev/_learn-mode.md` (29 lines, how judges review in LEARN). A `design/_contract.md` (or similar)
  summarising the design/dev contract fits this pattern.
- Fact: existing basenames (must stay unique): `architect, coder, judge-architecture, judge-operations,
  judge-security, mentor, researcher, tester` (dev); `content-researcher, curriculum-architect,
  judge-accuracy, judge-assessment, judge-pedagogy, lesson-author, practice-designer, student` (content).
- Fact (Claude Code docs, code.claude.com/docs/en/sub-agents, fetched 2026-10-29): `.claude/agents/`
  is scanned recursively; "identity comes only from the `name` frontmatter field", the subfolder does
  not affect it; two files in the same tree with the same name -> only one loads "chosen by filesystem
  read order rather than a documented precedence"; `/doctor` reports collisions. Hooks receive `name`
  as `agent_type`. Observed: this session's agent list contains `judge-security`, `lesson-author`,
  `student` etc., so both subfolders are registered today; a `design/` subfolder will be too.
- Implication: names must be unique across teams (both for Claude Code and for `hookio`).
  Frontmatter `isolation` must not be set on design roles (phase-gate blocks only the spawn-time
  `tool_input.isolation`, `phase-gate.sh:35`; a frontmatter `isolation: worktree` would not be seen by
  the gate: could not verify whether the harness reflects it into `tool_input`).

### 6. ADR conventions

- Fact: template `docs/adr/0000-template.md:1-17`: `# ADR-NNNN: Title`, bullets `Status: Proposed |
  Accepted | Superseded by ADR-XXXX`, `Date`, `Issue`; sections Context, Decision, Alternatives
  considered, Consequences. All five ADRs are `Proposed`.
- Fact: ADR-0001 (`docs/adr/0001-lesson-format.md:1-37`) is the contract model: single machine-checked
  definition (zod schema), fixed directory structure, statuses, `content:validate` as required CI check,
  change procedure (dev task, ADR update, migrate everything in one PR), CODEOWNERS owner.
- Fact: ADR-0005 (`docs/adr/0005-pipeline-v2.md`): item 1 threat model (guardrail vs honest mistakes,
  not a sandbox, :17-20); item 7 accepted residual risks (:45-70); item 9 says `cfg.py` validates
  every tier on every load and a malformed one crashes both gates (:86-89). It carries an `Amended: #23`
  bullet (:6), a precedent for amending instead of a new ADR.
- Fact: next free number is **0006** (`docs/adr/`: 0000-0005).
- Fact: `docs/architecture.md:27-32` lists the costly decisions with their ADRs; a design contract ADR
  would be listed there. CODEOWNERS covers `/docs/adr/`, `/.claude/`, `/course/`,
  `/packages/lesson-schema/` (`.github/CODEOWNERS`); a `design/` dir is not covered.

### 7. Web stack, shadcn/ui tokens, WCAG 2.2

- Fact: `apps/` is empty; no Next.js/Tailwind/shadcn installed. Stack decided only in prose:
  "Next.js (App Router), Tailwind, shadcn/ui" (`docs/adr/0003-stack.md:8`), `docs/architecture.md:7,18`.
  No versions pinned anywhere. Backlog #1 (`backlog/01-web-bootstrap.md`) sets up Tailwind + shadcn/ui.
  Biome 2.6.3 (`biome.json`).
- Fact (npm registry, 2026-10-29): `shadcn` 4.23.0, `tailwindcss` 4.3.3, `next` 16.4.3,
  `next-themes` 0.4.6.
- Fact (shadcn docs via Context7 `/websites/ui_shadcn`, pages ui.shadcn.com/docs/theming and
  /docs/installation/manual): tokens are CSS custom properties in `app/globals.css`, light under
  `:root`, dark under `.dark`, values in `oklch(...)`; Tailwind v4 mapping through
  `@theme inline { --color-<token>: var(--<token>); ... }` plus `@custom-variant dark (&:is(.dark *));`.
  Default token set: `background/foreground, card, popover, primary, secondary, muted, accent` (each
  with `-foreground`), `destructive, border, input, ring, chart-1..5, sidebar*`, `--radius` with
  derived `--radius-sm..4xl`. Convention: a surface token pairs with `<name>-foreground`. New tokens:
  define under `:root` and `.dark`, expose via `@theme inline` (example `--warning`). Dark mode in
  Next.js: `next-themes` `ThemeProvider attribute="class" defaultTheme="system" enableSystem`,
  `suppressHydrationWarning` on `<html>` (ui.shadcn.com/docs/dark-mode/next). `components.json`
  `tailwind.cssVariables` true -> theme as CSS variables.
- Implication: the natural design->dev tokens artifact is a CSS file in exactly this shape
  (`:root` / `.dark` / `@theme inline`), copyable into `apps/web/app/globals.css`, or a JSON source
  plus a generated CSS. HTML prototypes can load the same CSS file so prototype and app share tokens.
  Could not verify a Tailwind CDN/standalone option for prototypes (not checked; a prototype loading a
  CDN script is a choice the architect and the security judge weigh).
- Fact (W3C, www.w3.org/WAI/standards-guidelines/wcag/new-in-22/, updated 5 Oct 2023; WCAG 2.2 TR
  "W3C Recommendation, 12 December 2024" edition): new SC in 2.2 at A/AA: 2.4.11 Focus Not Obscured
  (Minimum) AA ("the component is not entirely hidden due to author-created content"); 2.5.7 Dragging
  Movements AA (single-pointer alternative); 2.5.8 Target Size (Minimum) AA (24x24 CSS px, or spacing;
  exceptions: spacing, equivalent control, inline, user agent control, essential); 3.2.6 Consistent
  Help A; 3.3.7 Redundant Entry A; 3.3.8 Accessible Authentication (Minimum) AA. AAA (out of AA scope):
  2.4.12, 2.4.13, 3.3.9. Removed: 4.1.1 Parsing. Carried-over AA thresholds an a11y judge checks on
  tokens and prototypes (WCAG 2.2 TR): 1.4.3 contrast 4.5:1 (3:1 large text, 18pt / 14pt bold);
  1.4.11 non-text contrast 3:1 (borders, focus rings, icons); 1.4.10 reflow at 320 CSS px; 1.4.12 text
  spacing (line height 1.5, paragraph 2x, letter 0.12, word 0.16); 1.4.4 resize to 200%; 2.4.7 focus
  visible.
- Implication: shadcn's default `--border` (`oklch(0.922 0 0)` on white) and `--ring` values are
  candidates the a11y judge must actually measure against 1.4.11 rather than assume; 3.3.8 matters for
  the sign-in page (Better Auth, ADR-0003). Contrast checking of oklch values needs a tool or script
  (none in the repo).

### 8. Shape of previous PIPELINE docs and relevant lessons

- Fact: research docs are `plans/<n>-<slug>-research.md` (#21: 109 lines, sections A-G + Constraints +
  Open questions + appended "Stepan's decisions"; #23: 167 lines, verdict, evidence, constraints, open
  questions). Design docs `plans/<n>-<slug>-design.md` (#23: 747 lines: changelog per revision,
  1 summary, 2 components with per-file subsections, 3 tests and mutations, 4 alternatives, 5 what NOT
  to build, 6 coverage matrix, 7 failure modes, 8 key decisions, 9 deploy awareness, 10 ordered coder
  steps + live install procedure for `.claude/hooks/**`, 11 rollback). Plan `plans/<n>-<slug>.md` (rules,
  judges' non-blocking notes, phase log). Design reviews `plans/<n>-<slug>-design-review-<k>.md` (#26).
- Lessons that apply here:
  - orchestrator #26 (`.claude/feedback/orchestrator_mistakes.md`, last entry): scripts and
    procedures in a design must be executed before the judge round; the operations judge runs them.
  - orchestrator #23: coder re-spawn brief must say (1) update every design/ADR statement the fix
    contradicts, (2) a boundary test that goes red on the old code, (3) no guard outside an existing
    exception boundary.
  - coder 2026-10-28 (cast): adding a tier flag or key means updating `TierConfig`/`_validate` and the
    cast comment truthfully.
  - coder 2026-10-28 (design record): a fix that changes imports/behaviour updates the design doc and
    ADR in the same commit (relevant if `hookio` starts reading teams from `cfg`).
  - coder 2026-10-27 (prefix lists): a prefix list reused as a different matcher needs boundary tests.
  - researcher: enumerate all inputs: role recognition has two inputs (prompt regex and
    `subagent_type`) and vote attribution three paths; all must learn the design team.

### 9. CI on a PR touching `.claude/` and `design/`

- Fact: `ci.yml` runs all jobs on every PR, no path filters (:3-6): `checks` (`pnpm lint` = `biome
  check .`, typecheck, test, build), `content` (`pnpm content:validate`), `pipeline`, `pipeline-types`,
  `compose`. `pr-hygiene.yml` checks title type, `Closes #n`, branch name.
- Fact: Biome `files.includes` lists only `**/*.ts, *.tsx, *.js, *.mjs, *.cjs, *.json` (`biome.json:3-17`).
  So `design/**/*.html` and `.css` are not linted; but any `.js` or `.json` placed in `design/`
  (prototype scripts, a tokens JSON) IS checked by `pnpm lint` (formatter: 2-space, width 100, double
  quotes, semicolons; linter preset `none`).
- Fact: no HTML/CSS/a11y tooling in the repo (no html-validate, axe, pa11y, stylelint).
- Fact: `pr-hygiene.yml:20` and `:30` accept types `feat|fix|refactor|perf|test|docs|chore|ci|build|content|learn`
  only; CLAUDE.md:42-43 lists the same. A `design/NN-...` branch or `design(...)` PR title would FAIL
  hygiene unless the list is extended (or DESIGN work uses e.g. `docs/` or `feat/`).
- Implication: whether `design/` gets a CI check (html validation, token contrast script, axe on
  prototypes) or is explicitly left out is an architect decision; a contrast check is the one that
  makes the a11y judge's token claims machine-verifiable, like `content:validate` for ADR-0001.

### 10. CLAUDE.md references from hooks/tests

- Fact: no test or hook parses CLAUDE.md tables. The only references are message strings
  "CLAUDE.md section 7" (kill switch) in `phase-gate.sh:13`, `require-pipeline.sh:19`,
  `bash-code-guard.sh:26`, `phase-complete.sh:19`. Section numbering 1/3/7 must stay stable (7 is
  cited by hooks).
- Fact: other docs that name the two teams and would go stale: `CLAUDE.md:3` ("two agent teams"),
  `:14-22` (team table), `:42-43` (branch types), `:55-79` (tier and phase->agent tables);
  `README.md:7,16-18`; `package.json` description ("built by two agent teams");
  `pipeline/state_machine.md:63-79` (Dev tiers / Content tiers); `.github/pull_request_template.md`
  tier list; `.github/labels.yml` (`team:dev`, `team:content`, `tier:*`; no `team:design`/`tier:design`,
  used by `scripts/github_bootstrap.py:78-87`, which rejects unknown labels in backlog files);
  `.github/ISSUE_TEMPLATE/` (feature, module, learn, ...; no design template); `docs/architecture.md`.

## Constraints discovered

- `.claude/hooks/`, `.claude/pipeline.json`, `.claude/settings*` are writable only in this PIPELINE
  task in the main checkout (`pl_write_gate.py:49-64`, `pl_shell_guard.py:62-72`); edits are live for
  every session at once, a broken edit fails closed (ADR-0005 Consequences). The #23 design's "live
  install procedure" (section 10.1) is the precedent for ordering hook edits.
- `pipeline.json` is validated on every load of every hook; a malformed new tier blocks every write and
  command (ADR-0005 item 9). New keys must be added to `cfg.py` types/validation or declared `object`.
- mypy `--strict --python-version 3.9` on all `lib/*.py`; shellcheck `-S error`; run.sh must stay
  under the 5 min CI job timeout (now 2:21 locally).
- Role identity = file basename (hooks) and frontmatter `name` (Claude Code): both must be unique
  across `dev/`, `content/`, `design/`. Never set `isolation: worktree` on role/judge spawns
  (`phase-gate.sh:34-37`).
- Phase windows are global by phase name; reusing `author`/`judge_content` in DESIGN opens content
  roles there and vice versa.
- One judge list per tier for all its judge rounds.
- Everything in the repo in English (global code-style rule, CLAUDE.md); learner-facing UI copy in
  prototypes in Russian (issue scope); no em dashes in learner text (`pipeline/_shared.md:31-32`).
- No AI attribution in commits/PRs/branches; Stepan commits/merges unless he says otherwise
  (global git-workflow rule).
- Uncommitted unrelated change in the tree: `.github/CODEOWNERS` (`@OWNER` -> `@valmlord`, from the
  bootstrap script). `pr` and Stop gates require a clean tree; it must be committed separately or
  left out by Stepan before `pr`.
- Issue #27 is labelled `tier:project`, but runs as PIPELINE (needs `tier:pipeline` label for
  consistency, cosmetic).

## Open questions (for Stepan)

1. Branch/PR type for DESIGN work: add `design` to the allowed types in `pr-hygiene.yml` and
   CLAUDE.md section 2, or reuse `docs`/`feat`?
2. Deliverables path: top-level `design/` (product, writable only in an active pipeline, not in LEARN)?
   Add it to CODEOWNERS like `/course/`?
3. Should `design/` get a CI check (HTML validation, token contrast script, axe on prototypes), or be
   explicitly left out for now? A tokens JSON or prototype `.js` in `design/` is already covered by
   Biome.
4. Should hooks enforce team per tier (a design role spawnable only in `team: design` tiers, using the
   currently unused `team` field), or is it enough to choose distinct phase names?
5. Design fidelity in dev tasks: add checklist items to existing dev judges (e.g. judge-architecture
   checks the page against the prototype), make the tester take screenshots, or add a design judge to
   dev tiers (affects HOTFIX..LEARN, since the judge list is per tier)?
6. Should DESIGN have a LESSON-like small tier (one page/component change) in addition to a full one?
7. Labels: add `team:design` and `tier:design` to `.github/labels.yml` and an issue template?
