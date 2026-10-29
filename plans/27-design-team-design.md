# Issue #27 design: a design (UX/UI) agent team and a DESIGN tier

Architect, PIPELINE tier, branch `feat/27-design-team`, HEAD `8511e8c`, revision 2 (design round 2 of 2).
Upstream: `plans/27-design-team-research.md` (cited as R1..R10 by its section numbers).
Scope: team and pipeline wiring only. Designing the platform itself (flows, wireframes, the actual
design system) is the first DESIGN-tier task afterwards and is out of scope here.
Changes against revision 1 are listed by judge finding id in section 12.

Facts checked by the architect before writing (not only taken from the research):
- `curriculum-architect.md` is spawnable inside TASK today, both by prompt and by `subagent_type`. Reproduced on a
  scratch export: two probe rows inserted after `adv_ok "judge_design" judge_design` (`run.sh:210`) with expected
  rc 0 both printed `ok` (suite `230 passed, 0 failed`, 2:20 wall). Cause: its window `[architect, judge_design]`
  exists in TASK, PROJECT, PIPELINE and LEARN, and windows are keyed by phase name only (R2). This is a live
  cross-team leak, independent of #27.
- `run_hook` runs `main_fn` under `set -eu` (`lib/common.sh:106-119`); `phase-gate.sh:24` captures the role with a
  plain assignment, so a crashing `hookio` exits non-zero and is mapped to a block (`gate-crash`). A `read ... <<<
  "$(...)"` form would swallow that exit status (fail open). The new code must keep the assignment form (2.1.3).
- `bash-code-guard.sh:37` calls `hookio field`, so `hookio.py` is shared by the shell guard, the phase gate and the
  three judge hooks. `require-pipeline.sh` does not import `hookio` (the Write tool is the repair path if a
  `hookio.py` install goes wrong). `cfg.py` is imported by every gate, including the Write gate.
- `hookio.role_from` (`hookio.py:84-91`) returns the prompt match before it looks at `subagent_type`, and the prompt
  match carries a team segment the gate would trust. The identity rule of 2.1.2 (resolve against the scanned tree,
  check both sources) was run as a scratch prototype (`$S/rolecheck.py`, not product code) against the live
  `.claude/agents/` tree on 2026-10-29. Results: `dev/curriculum-architect.md` -> `!path`, `content/Curriculum-
  Architect.md` -> `!path` (resolved basename `curriculum-architect.md`), `qa/coder.md` -> `!path`,
  `dev/nonexistent.md` -> `!path`, prompt `dev/architect.md` + type `curriculum-architect` -> `!type`, prompt
  `dev/coder.md` + type `coder` -> `dev/coder.md`, + type `Curriculum-Architect` -> `!type`, + type
  `general-purpose` -> `dev/coder.md`, type `curriculum-architect` alone -> `content/curriculum-architect.md`,
  `READ .claude/agents/DEV/coder.md FIRST` -> `!path`.
- `cfg gated_agents` already skips `_`-prefixed keys (`cfg.py:135`); `agent_gates` carries `_comment`.
- The live smokes in 9.1 were run against the live hooks on 2026-10-29 in phase `architect`: S2a rc 2, S2b rc 2,
  S4a rc 0, S4b rc 2 (outside window, expected in this phase), S5 rc 0 (design role unknown today).
- Tools on this Mac, run on 2026-10-29 against a scratch export (`$S/export.jFXz2s`): no local `shellcheck`, no
  `mypy`, no Python 3.12 (`/usr/bin/python3` is 3.9.6). The docker shellcheck command of 9.1 P3 over the current
  `phase-gate.sh` and `run.sh`: rc 0. The docker mypy command of 9.1 P3 over `.claude/hooks/lib/*.py`: rc 0,
  "Success: no issues found in 8 source files", 7 s wall including the pip install (needs network).
- Contrast oracles in 2.8 were computed with WCAG 2.2's formula after 8-bit quantization (stdlib Python,
  `$S/ratio.py`): `oklch(0.556 0 0)` on white 4.742, on `oklch(0.97 0 0)` 4.349; `oklch(0.545 0 0)` on
  `oklch(0.97 0 0)` 4.542; `oklch(0.65 0 0)` on white 3.234; `oklch(0.922 0 0)` on white 1.260; `oklch(0.708 0 0)` on
  white 2.584; `oklch(1 0 0 / 10%)` over `oklch(0.145 0 0)` 1.244.
- The CODEOWNERS procedure (11.2) and the core-file revert procedure (10) were run end to end in a scratch clone
  (`$S/sim.*`); every exit code is quoted where the step is prescribed.
- `gh label list` returns 30 labels by default; the repository has 31 today, so the label check needs `--limit`.

---

## 1. Solution design (summary)

1. **Team enforcement in the hooks, derived from where the role file really lives.** `hookio` scans
   `.claude/agents/*/` once per call and resolves the prompt's `Read .claude/agents/<dir>/<file>.md first` claim
   against that scan with exact case. The role's team is the directory the file is found in; a claim naming a
   directory or case that does not exist resolves to the sentinel team `!path`, and a `subagent_type` that names a
   known agent different from the prompt's role resolves to `!type`. `phase-gate.sh` denies both sentinels for every
   role spawn, then compares a gated role's real team with the tier's `team` before the window check. This closes
   the existing curriculum-architect leak by prompt, by a misnamed directory, by case and by `subagent_type`, and
   makes DESIGN safe even where it shares phase names with other tiers.
2. **A DESIGN tier as data**: `init, researcher, architect, judge_design, planner, author, judge_ux, compound, commit,
   pr, notify, done`, team `design`, judges `usability, accessibility, consistency`. Windows: `ux-researcher.md
   [researcher, judge_design]`, `product-designer.md` and `ui-designer.md [author, judge_ux]`.
3. **Six role files** under `.claude/agents/design/` plus `_contract.md`, three seeded mistakes files. Judges vote in
   the existing verdict format and append to the shared `judge_mistakes.md`, like every other judge.
4. **Deliverables in a top-level `design/`** (product, writable only in an active pipeline, not in LEARN), with a
   fixed layout: flows and IA, `system/tokens.css` in the shadcn/Tailwind v4 `globals.css` shape (blocks reordered
   to `:root`, `.dark`, `@theme inline`; current shadcn puts `@theme inline` first), one
   `prototype.html` plus `acceptance.md` per page. A small stdlib validator `scripts/design_tokens.py` computes
   contrast, checks token shape and value classes, the variables a prototype may use, raw colors, any absolute or
   protocol-relative URL, and flow step ids, so the accessibility and consistency judges report computed numbers,
   not impressions. CI runs its unit tests always and the token check once `tokens.css` exists.
5. **ADR-0006 (Proposed)**: the design -> dev contract. Dev takes tokens verbatim, one prototype and acceptance notes
   per page, implements only pages whose acceptance notes say `Status: ready` on `main`; the dev tester adds a
   "Design conformance" section with screenshots of prototype and app; judge-architecture gets the matching
   checklist item. No fourth dev judge. Neither team changes the contract alone. ADR-0005 is amended with the team
   rule (item 10).

---

## 2. Components

### 2.1 Hook changes (pipeline core)

Every new check below runs inside an existing exception boundary: `hookio` code runs in a process whose exit
status `phase-gate.sh` captures by plain assignment inside `main_fn`, and `main_fn` runs under `run_hook`, which maps
any non-zero exit to a block (`gate-crash`). No check is added at script top level, before `run_hook`, or in a
subshell whose status is discarded.

#### 2.1.1 `lib/cfg.py`: one new query

- New command `team <TIER>`: prints the tier's `team` string, or an empty line when the tier or the key is missing.
  Docstring lists it. No validation change: `team` stays an optional string (`cfg.py:80-82`); an unknown team value
  is caught by the static invariant row (3.1, S1e), not by `_validate`, because a raising validation would lock every
  gate (ADR-0005 item 9) for a mistake that only affects role spawns.
- mypy: same shape as the `phases` branch (`tiers.get(args[0], {}).get("team", "")` is `str`), no new types, no cast.

#### 2.1.2 `lib/hookio.py`: role identity from the scanned tree

- `ROLE_RE`: the team segment becomes a capture group, `\.claude/agents/([a-z0-9-]+)/([a-z0-9-]+\.md)`, all else
  unchanged (leading `Read`, optional quote/backtick, `first`, `re.I`). Because of `re.I` both groups may come back in
  any case; they are a claim only and are never used as an identity without the resolution below.
- `agent_index() -> tuple[frozenset[tuple[str, str]], dict[str, tuple[str, str]]]`, one scan of
  `<code_root>/.claude/agents/`:
  - directories whose name fully matches `[a-z0-9-]+` (case-sensitive, no `re.I`), in `sorted()` order; inside each,
    files whose name fully matches `[a-z0-9-]+\.md` (case-sensitive; this also excludes `_contract.md` and
    `_learn-mode.md`), in `sorted()` order. Names come from `os.listdir`, so they carry the real case on a
    case-insensitive file system too.
  - first element: every `(team, file)` pair found. Second: lower-cased frontmatter `name` -> `(team, file)`, first
    one wins in sorted order (`setdefault`), replacing today's filesystem-order "last file wins silently" (R5).
    Duplicates are a CI failure (S1a).
  - an `OSError` while listing or reading propagates (today's `except OSError: continue` at `hookio.py:76` is removed),
    and an index with no file at all raises `ValueError("no agent role files under <path>")`. (Coder, binding
    condition 2 of the plan:) any `.md` not starting with `_` that is not an indexed `<team>/<file>.md` (top level of
    `.claude/agents/`, a nested directory, a directory or file name outside the lower-case patterns) raises
    `ValueError` naming the files, because Claude Code registers it as an agent the gates do not know; other
    non-directories at the top level are skipped. Both end the process
    non-zero, which every caller maps to a block or to "no vote" (2.1.3, judge hooks). Reason: an unreadable or empty
    tree would otherwise turn every role into "not a role" and allow it.
  - Agents still come from the main checkout (`checkout.code_root()`), as today.
- `role_spec(prompt, subtype) -> tuple[str, str]` returns `(team, file)`, where `team` is a real directory, `!path`,
  `!type`, or `""` (not a role). Rules, in order:
  1. Neither a `ROLE_RE` match nor a non-empty `subagent_type`: `("", "")` without scanning (a plain search agent
     costs nothing and cannot crash on the scan).
  2. Scan once (`agent_index()`). Let `sub = names.get(subtype.lower())` when `subtype` is non-empty. Lower-casing is
     the strict assumption: whether Claude Code matches `subagent_type` case-insensitively is not verified, and the
     check must cover a case variant if it does. A `subagent_type` that names no indexed agent (`general-purpose`,
     `Explore`, `fork`) is ignored, as today.
  3. Prompt match `(d, f)`: if `(d, f)` is in the index exactly, the claim is true. Else return `("!path", g)` where
     `g` is the unique indexed file whose lower-cased name equals `f.lower()`, or `f` itself when there is none or
     more than one. Resolving `g` makes the logged role the real file (`Curriculum-Architect.md` is logged as
     `curriculum-architect.md`).
  4. True claim and `sub` set and `sub != (d, f)`: return `("!type", f)`.
  5. True claim otherwise: `(d, f)`.
  6. No prompt match, `sub` set: `sub`. Else `("", "")`.
  The sentinels start with `!`, which the directory pattern can never produce, so a sentinel never equals a tier's
  `team`; neither sentinel is empty, because empty means "not a role" and is allowed.
- `role_from(prompt, subtype) -> str` (used by `handback_vote`, `judge_vote`, `judge_vote_post`, `spawn_info`) returns
  `role_spec(...)[1]` when the team is a real directory and `""` for a sentinel. Effect: a judge whose spawn prompt
  names a wrong path or disagrees with its type never has its vote counted (the phase gate already refused its
  spawn; this keeps a vote that arrives by another path from counting, row D7b).
- New CLI command `role_team`: stdin PreToolUse JSON -> `<team>/<file>` (team may be a sentinel) or an empty line.
- The CLI command `role` stays during the install and prints `role_spec(...)[1]` for every non-empty result,
  sentinels included, so the old `phase-gate.sh` (until step 4) still gates the basename exactly as today or
  stricter (a misnamed directory now yields the real basename instead of `""`). It is deleted in step 5 (dead code
  after step 4; no other consumer: `grep "hookio role"` hits only `phase-gate.sh:24`).
- Docstring (`hookio.py:4,18-21`) updated: the role is the file named by the leading "Read .claude/agents/<team>/<file>.md
  first" when that exact file exists, its team is the directory it lives in, a `subagent_type` naming a known agent
  must agree with it, and the sentinels `!path` / `!type` mark a claim that is not true.

#### 2.1.3 `phase-gate.sh`: identity and team checks

Behaviour, in this order (only the marked lines change):
1. (changed) `spec` is captured from `hookio role_team` with a plain assignment statement (errexit applies; never a
   here-string or `read` from a substitution, which would turn a hookio crash into "no role" and allow the spawn).
   Empty `spec` -> return 0 (not a role agent, unchanged). Otherwise `team` is the part before the first `/` and
   `role` the part after it, by parameter expansion.
2. (new) identity check, for every role, before any other check and with or without an active pipeline:
   - `team` = `!path` -> deny `<role>: the prompt names a role file that does not exist at that exact path; use
     .claude/agents/<team>/<file>.md with the directory and case the file really has.` log reason `role-path:<role>`;
   - `team` = `!type` -> deny `<role>: subagent_type names a different agent than the prompt's role file; give one
     identity.` log reason `role-type:<role>`.
   Denying an ungated role with a false claim (for example `content/researcher.md`) is deliberate: a spawn that names
   a role file must name a real one, so no future gate has to re-derive which false claims are harmless.
3. gated/judge classification, isolation check, no-pipeline check, LEARN coder check: unchanged.
4. (new) if the role is gated: `tier_team` captured from `cfg team "$tier"` (plain assignment). If `tier_team` is
   empty -> deny `tier <T> has no team in .claude/pipeline.json; gated roles cannot run in it.` with log reason
   `team:<role>`. Else if `team != tier_team` -> deny `<role> is a <team> role; tier <T> belongs to team
   <tier_team>.` with log reason `team:<role>`. Strict equality: RESEARCH (`team: any`) matches no gated role, which
   is correct today because no gated window exists in RESEARCH.
5. window check (`not-in-tier`, `window`) and judge checks: unchanged.

The team check runs before the window check, so a cross-team spawn always logs `team:<role>`; rows D4, T1-T4 and T6
assert that reason, which separates it from `not-in-tier`. Judges are not team-checked at runtime: the tier's
`judges` list already decides (`phase-gate.sh:68-74`), a judge listed in a foreign tier is caught statically (S1d),
and a judge spawned with a false path or type is caught by step 2.

#### 2.1.4 Unchanged on purpose

`pl_write_gate.py`, `pl_shell_guard.py`, `require-pipeline.sh`, `bash-code-guard.sh`, `judge-*.sh`,
`pipeline-advance.sh`, `phase-complete.sh`, `state.py`, `checkout.py`, `common.sh`. `design/` needs no allowlist change
(R3: product by default). The `<team>` placeholder in `pipeline-advance.sh:192` stays text.

### 2.2 `.claude/pipeline.json` additions

- `tiers.DESIGN`: `team "design"`, `requires_issue true`, phases `["init", "researcher", "architect", "judge_design",
  "planner", "author", "judge_ux", "compound", "commit", "pr", "notify", "done"]`, judges `["usability",
  "accessibility", "consistency"]`. No new tier flags, so `TierConfig` and `TIER_FLAG_KEYS` stay as they are.
- `agent_gates`: `"ux-researcher.md": ["researcher", "judge_design"]`, `"product-designer.md": ["author",
  "judge_ux"]`, `"ui-designer.md": ["author", "judge_ux"]`.
- `judge_agents`: `"usability": "judge-usability.md"`, `"accessibility": "judge-accessibility.md"`, `"consistency":
  "judge-consistency.md"`.
- Nothing else: `learn_tier_editable_paths`, `learn_tier_code_dirs`, `pipeline_core_files` unchanged (2.7).

Why `judge_ux` and not `judge_content`: the name is shown in status output, logs and docs; "content" would mislead.
With the team check, reusing `author` is safe (lesson-author's window also needs `judge_content`, absent in DESIGN,
and its team is wrong anyway; product-designer's window needs `judge_ux`, absent in MODULE/LESSON).

### 2.3 DESIGN tier: phase -> agent

| Phase | Agent | Output |
|---|---|---|
| researcher | `design/ux-researcher.md`, research mode | `plans/<n>-<slug>-research.md`: learner goals from `course/`, `learner/profile.md`, `learner/journal.md`, `docs/learning-process.md`, `docs/architecture.md`; constraints (stack, auth, workspace terminal); what exists in `design/`; prior art with sources |
| architect | `design/ux-researcher.md`, flows mode | `design/flows/<journey>.md` (flows with globally unique ids) and `design/flows/ia.md` (sitemap, navigation, page inventory, flow registry); a short `plans/<n>-<slug>-design.md` naming the pages and system changes in scope and what is NOT designed |
| judge_design | 3 design judges, ONE message | review flows, IA and scope (round checklists in 2.5); the orchestrator runs `python3 -I scripts/design_tokens.py check design` (flow checks run without `tokens.css`) and passes its output to the judges |
| planner | orchestrator, inline | `plans/<n>-<slug>.md`: per-page work items, which tokens/components are new |
| author | `design/ui-designer.md` first (only when tokens or components change), then `design/product-designer.md` | `design/system/*`; `design/pages/<slug>/prototype.html` + `acceptance.md` with `Status: ready` |
| judge_ux | 3 design judges, ONE message | review prototypes, tokens, acceptance notes, validator output (run by the orchestrator and passed to the judges) |
| compound | orchestrator | lessons into mistakes files |

Sequential in `author` (not parallel like lesson-author + practice-designer) because prototypes link the token file
and the component classes; parallel work would build pages on tokens that are about to change.

A ux-researcher re-spawn after `judge_design` FAIL stays inside its window; a product-designer or ui-designer
re-spawn after `judge_ux` FAIL likewise. A FAIL in `judge_ux` caused by the flows (not the pages) is handled as in
other tiers: the orchestrator cannot re-enter `architect`; the product-designer records the gap in the page's
acceptance notes under "Open questions", sets that page to `Status: draft`, and a follow-up DESIGN issue is opened.
Stated, not built.

### 2.4 Maker role files (`.claude/agents/design/`)

Common to all six files: frontmatter `name` (equal to the file stem), `description`, `tools` (YAML list), closing
`---` after a blank line; no `model`, no `isolation` (R5). Sections as in the other teams: `# <Role> Agent`,
`## Before ..., load`, `## You receive`, `## You write`, `## Checklist`, `## Rules`. English; learner-facing UI copy
inside prototypes and acceptance notes in Russian (straight double quotes, no em dashes, `pipeline/_shared.md:31-32`).
Every file loads `.claude/agents/design/_contract.md` and its own mistakes file.

**`ux-researcher.md`** (tools: Read, Write, Edit, Glob, Grep, WebFetch, WebSearch)
- Job: in `researcher`, gather facts about the learner and the product; in `architect`, turn them into user flows and
  the information architecture of the learner journey. Never draws pages.
- Receives: the issue, `course/`, `learner/`, `docs/learning-process.md`, `docs/architecture.md`, ADR-0003, existing
  `design/`; in `architect` also its own research file.
- Writes: research file (researcher); `design/flows/<journey>.md`, `design/flows/ia.md`, the short design scope file
  (architect).
- Checklist: every flow starts from a learner goal with a source (course file, journal entry, issue); flow ids
  `F<n>` are unique across all journey files (a new flow takes the next free number from the flow registry in
  `ia.md`; an existing flow keeps its id), declared by a heading `## F<n>: <title>`; each step is a list item that
  starts with its id `F<n>.<m>` (e.g. `1. F2.3 Learner opens the lesson`); each flow has entry point, success state,
  error and empty states, exit; the IA lists every page with slug, route, Russian page title, purpose and the flows
  that pass through it, plus the flow registry (id -> journey file -> title); each page reachable from the catalog,
  number of steps stated; one vocabulary, taken from `course/` and `docs/learning-process.md` (a lesson is never also
  called a "class"); keyboard path noted for any step that needs more than a click (terminal focus and how to leave
  it); time limits (workspace TTL, session) named with warning behaviour; sources for every claim about other
  products; `python3 -I scripts/design_tokens.py check design` reports no flow-id error before reporting (once
  `design/system/tokens.css` exists; before that the flow ids are checked by hand against the registry).
- Rules: no wireframes or visual decisions; flows are text plus optional Mermaid; scope stated explicitly (what is not
  designed in this task).

**`product-designer.md`** (tools: Read, Write, Edit, Glob, Grep, Bash)
- Job: wireframes and clickable HTML prototypes Stepan opens in a browser by double-click, plus acceptance notes per
  page.
- Receives: flows, IA, scope file, plan, `design/system/*`.
- Writes: `design/pages/<slug>/prototype.html`, `design/pages/<slug>/acceptance.md`, the page table in
  `design/README.md`. Never edits `design/system/*` (asks for a ui-designer re-spawn through its report).
- Checklist: prototype conventions of ADR-0006 (2.7: relative links to `../../system/`, no absolute or
  protocol-relative URL outside an `<a href>`, `lang="ru"`, viewport meta, follows `prefers-color-scheme`, states via
  `#state-<name>`); every flow step id of the page has an element with `data-step="<id>"`; every state named in
  acceptance notes is reachable; navigation between pages works with relative links; colors only as `var(--name)`
  where `name` is declared in `tokens.css` `:root`/`.dark` or in `proto.css` (never a `--color-*` or other
  `@theme inline` name, which browsers ignore); semantic HTML (landmarks, one `h1`, labelled inputs, `button` for
  actions, `a href` for navigation); copy table in acceptance notes equals the strings in the prototype;
  `python3 -I scripts/design_tokens.py check design` exits 0 before reporting; sets `Status: ready` in the
  acceptance notes of every page it submits to `judge_ux` and `Status: draft` on any page it knows is incomplete.
- Rules: low-fidelity first is allowed (a wireframe is a prototype using only neutral tokens); no build step, no npm,
  no framework; shared interaction script lives in `design/system/proto.js` (Biome-formatted, R9), which the
  ui-designer owns (the product-designer names the behaviour it needs in its report), page-only behaviour in a short
  inline `<script>`; fake data inline.

**`ui-designer.md`** (tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch)
- Job: the design system on shadcn/ui: tokens (color, radius, spacing scale), dark mode, component inventory and the
  prototype component styles.
- Receives: flows, IA, scope file, plan, current `design/system/*`, shadcn docs (theming, dark mode, the button
  component; fetch current docs, cite the page).
- Writes: `design/system/tokens.css`, `design/system/README.md` (type scale, spacing scale, radius, motion and
  reduced-motion rule, component inventory: shadcn component name -> where used -> variants), `design/system/proto.css`,
  `design/system/proto.js`, `design/system/components.html` (every inventory component, both themes).
- Checklist: `tokens.css` in the exact ADR-0006 shape (2.7): colour tokens as `oklch()` or hex, other tokens only
  lengths, numbers, `calc()` or `var()`; every required shadcn token (2.8) defined as a colour in `:root` and `.dark`;
  every colour token mapped in `@theme inline`; colors inside sRGB; every variable a prototype needs that is not a
  `:root`/`.dark` token (radius steps, the system font stack `--font-sans`, spacing steps) declared in a `:root`
  block of `proto.css`, and where the same name exists in `@theme inline` (radius steps) with the identical value;
  validator exits 0 and its PASS/FAIL lines are pasted into the report; any shadcn default kept is re-measured, not
  assumed (the light defaults for `--ring` and `--input` measure 2.584 and 1.260 on white, below 3:1); every text
  colour on a token background that the validator's pairs do not cover is measured with `pair`, in both themes
  (shadcn v4 has no `--destructive-foreground`; per the judges' reading its destructive button uses white text on
  `--destructive`, with a translucent destructive background in dark mode; unverified here, the ui-designer reads
  the current button source and measures what `proto.css` actually uses); custom tokens follow the `<name>` /
  `<name>-foreground` pairing; `proto.css` uses only `var(--...)` colors and the documented scales.
- Rules: shadcn names first, a custom token or component only with a written reason in `system/README.md`; no web
  fonts loaded from the network (system stack in `proto.css`; font choice for the app is a dev decision); token
  values change only in a DESIGN task (ADR-0006).

### 2.5 Design judges (`.claude/agents/design/judge-*.md`)

Common: load `.claude/feedback/judge_mistakes.md`, `.claude/feedback/agent_roles_mandatory.md`, `_contract.md`; say
which round they are in (`judge_design` or `judge_ux`), read with the Read tool from the `phase` field of
`.claude/pipeline_state.json` in the session's checkout, the way `dev/judge-architecture.md:23` does (the shell guard
blocks any shell command naming that file, and judge-usability has no Bash); must read every file under review (a
PASS from the description is the rubber-stamp failure); response format evidence first, verdict last: pasted
evidence (validator output, `pair` runs, quoted flow lines) and the `[file:line]` items come first, and the exact
verdict line (`PASS - no <key> issues found` after a `Checked: ...` line, or `FAIL - N issues found`) is the last line
of the report, with nothing after it, because `hookio.verdict_from` takes the last verdict-shaped line and anything
pasted below the verdict could overturn it; no pasted or quoted line may start with a bare `PASS` or `FAIL`. FAIL
procedure as `judge-security.md:59-76` with the design roles added (`ux-researcher_mistakes.md`,
`product-designer_mistakes.md`, `ui-designer_mistakes.md`, orchestrator, judge). A page marked `Status: ready` that
fails any check is a FAIL; the verdict is what makes `ready` mean anything (ADR-0006 item 2).

**`judge-usability.md`** (key `usability`; tools: Read, Write, Edit, Glob, Grep)
- judge_design: each flow traces to a learner goal with a source; entry, success, error, empty and exit states exist;
  no dead ends or orphan pages (every IA page appears in at least one flow; every flow step lands on an IA page);
  flow ids unique across journey files and every flow in the registry of `ia.md` (the judge greps `^## F` across
  `design/flows/`; once `tokens.css` exists it also quotes the validator's flow lines from the orchestrator's
  validator output in the review input); the core path catalog -> lesson -> workspace -> checks -> progress is
  covered when in scope; step counts are stated and the judge recounts them; vocabulary: list every UI term used and
  confirm one term per concept; a heuristic walkthrough (Nielsen's ten) per flow, naming the heuristic for each
  finding.
- judge_ux: cognitive walkthrough per flow on the prototypes: for each step id, Grep for `data-step="F<id>"` finds
  exactly the element that performs it and its link or control leads to the next step's page or state (the judge
  follows the `href`/handler in the file); one primary action per screen; every acceptance-notes state reachable
  via `#state-<name>`; Russian copy short, concrete, consistent with the flows' vocabulary, no em dashes, straight
  quotes; acceptance checks are verifiable statements (a dev tester could mark each pass/fail).

**`judge-accessibility.md`** (key `accessibility`; WCAG 2.2 AA; tools: Read, Write, Edit, Glob, Grep, Bash)
- Computed, never eyeballed: every contrast claim comes from `python3 -I scripts/design_tokens.py check design`
  (pasted) or `... pair "<fg>" "<bg>"` for colors outside the token pairs; the report quotes the ratios.
- judge_design: 3.2.6 Consistent Help (help/mentor entry at the same place on every page in the IA); 3.3.7 Redundant
  Entry (no flow asks twice for the same data); 3.3.8 Accessible Authentication (sign-in flow has no cognitive test,
  allows paste and password managers, R7); 2.4.5 Multiple Ways (two ways to reach each content page); 2.4.2 every IA
  page has a planned title; 2.1.1 / 2.1.2 every flow is keyboard-operable and the workspace terminal step names the
  key that moves focus out of the terminal (a terminal capturing Tab is the likely keyboard trap); 2.2.1 time
  limits (workspace TTL, session) have a warning and a way to extend.
- judge_ux, per prototype and both themes: 1.4.3 text 4.5:1 (3:1 for large text 18pt/14pt bold) and 1.4.11 non-text
  3:1 for focus ring and control boundaries, from validator output; a `pair` run, both themes, for every text colour
  on a background the validator pairs do not cover, at least every destructive button (the exact foreground and
  background from `proto.css`, alpha included; shadcn v4 ships no `--destructive-foreground`); 2.4.7 focus visible (a
  `:focus-visible` style exists for every interactive class in `proto.css`); 2.4.11 focus not obscured (if a sticky
  header exists, `scroll-padding-top` or equivalent is set); 2.5.8 target size (interactive classes have
  `min-height`/`min-width` >= 24px or the spacing exception, read from CSS); 1.4.10 reflow (viewport meta, no fixed
  width > 320px outside `max-width` or a media query, found by grep of `width:` values); 1.4.12 text spacing (no fixed
  `height` on text containers); 1.3.1 semantics (landmarks, heading order, `label for`, native `button`/`a`); 4.1.2
  custom widgets (tabs, dialog) carry role and state attributes; 1.1.1 alt text; 3.1.1 `lang="ru"`; 1.4.1 color is
  not the only signal (errors carry text or an icon with a label); `prefers-reduced-motion` respected in `proto.css`.
- Limitation stated in the file: no browser or axe here; runtime checks (axe, real focus order) happen in the dev
  task's tester run (ADR-0006).

**`judge-consistency.md`** (key `consistency`, visual consistency; tools: Read, Write, Edit, Glob, Grep, Bash)
- judge_design: page inventory names match routes and slugs; the planned component list maps to shadcn component
  names or carries a reason; vocabulary of the IA equals the flows'.
- judge_ux: validator output clean (no raw color literals, no undefined or `@theme`-only `var(--x)`, no alias that
  differs from `@theme inline`, no absolute URL, token shape valid); named colour keywords (`red`, `white`, ...) in
  CSS values, which the validator does not scan, found by reading `proto.css` and the `<style>` blocks; spacing,
  radius and type values in `proto.css` and inline styles belong to the scales in `system/README.md` (the judge lists
  any value not on a scale, found by grep of `px`/`rem` values); the same component uses the same class and markup on
  every page (grep each inventory class across `design/pages/`); every component used in a prototype is in the
  inventory and shown in `components.html`; both themes defined for every token used.

### 2.6 `_contract.md` and mistakes seeds

- `.claude/agents/design/_contract.md` (<= 30 lines, like `content/_contract.md`): the `design/` tree, `tokens.css`
  shape and value classes, the variables prototypes may use, prototype conventions, flow id grammar,
  acceptance-notes headings, `status: draft | ready` and who sets it, the validator command, and "authoritative:
  ADR-0006". Not indexed by `agent_index()` (the file pattern excludes `_`).
- Seed files in `.claude/feedback/`, each opening "Seeded with design-discipline rules; append real lessons as they
  are found" and one to three `### Seeded: <title>` entries with a `Rule:` line (no invented dates or incidents):
  - `ux-researcher_mistakes.md`: flows written from assumed needs instead of `course/` and the journal; a flow
    without error/empty states; two words for one concept.
  - `product-designer_mistakes.md`: a CDN script or web font that breaks offline opening; a hex color in a prototype
    bypassing tokens; a flow step with no `data-step` element.
  - `ui-designer_mistakes.md`: shadcn defaults copied without computing contrast (ring 2.584:1 and input 1.260:1 on
    white); shadcn's stock destructive tokens are outside sRGB, so the validator rejects them; a token defined in
    `:root` only; a radius step or font stack defined only in `@theme inline`, which the
    browser drops, so prototypes render without it.
  - Judges keep the shared `judge_mistakes.md` (existing convention for all six current judges).

### 2.7 `design/` deliverables, layout and write rules

```
design/
  README.md                      purpose, how to open prototypes, page table (slug, status, prototype link)
  flows/
    ia.md                        sitemap, navigation model, page inventory, flow registry (F<n> -> file -> title)
    <journey>.md                 one journey per file, flows "## F<n>: <title>", steps "1. F<n>.<m> ..."
  system/
    tokens.css                   THE token file (contract); shape below
    README.md                    type, spacing, radius, motion scales; component inventory; dark-mode rules
    proto.css                    prototype-only: a :root block of prototype variables, then component styles
    proto.js                     prototype-only behaviour (theme toggle, states, dialogs); never copied
    components.html              gallery of every inventory component, both themes
  pages/
    <slug>/
      prototype.html             no build step; links ../../system/{tokens.css,proto.css,proto.js}
      acceptance.md              acceptance notes, fixed headings (ADR-0006)
```

- `tokens.css` contains, in this order and nothing else: `@custom-variant dark (&:is(.dark *));`, `:root { ... }`,
  `.dark { ... }`, `@theme inline { ... }`. Browsers drop the two Tailwind at-rules as unknown at-rules, so the
  same file pastes into `globals.css` (R7 shape) and, for its `:root` and `.dark` blocks only, styles the prototypes.
  Unverified detail flagged: that browsers ignore `@theme inline { }` as a whole block follows from CSS error
  handling for unknown at-rules; the product-designer confirms it by opening the first prototype (colors render).
- Value classes in `:root` and `.dark` (only `--name: value;` declarations): a **colour token** is a value starting
  with `oklch(` or `#`; a **non-colour token** is a length or number (`0.625rem`, `4px`, `1.5`), a `calc(...)` or a
  `var(--x)`; anything else (`rgb()`, `hsl()`, a named colour, a font list) is an error. Only colour tokens are
  parsed as colours, paired and required in `@theme inline`; `--radius` is the one required non-colour token.
- Variables a prototype may reference with `var(--x)`: names declared in `tokens.css` `:root` or `.dark`, and names
  declared as `--x:` in a scanned prototype file (`proto.css`, a `<style>` block, a `style=""` attribute). Names
  declared only in `@theme inline` (`--color-*`, `--radius-sm`..) are never visible to a browser. A prototype that
  needs one declares it in the `:root` block of `proto.css` with exactly the `@theme inline` value (for example
  `--radius-sm: calc(var(--radius) - 4px);`); the validator checks the equality, so prototype radii cannot drift
  from the app's. `--font-sans` (system stack) and spacing steps live in `proto.css` `:root` too; `tokens.css`'s
  `@theme inline` carries only the `--color-*` mappings and the radius steps, and the app's font theme lives
  outside the marked block in `globals.css` (ADR-0006 item 1).
- Prototype conventions: `<!doctype html>`, `<html lang="ru">`, viewport meta, Russian `<title>`; follows
  `prefers-color-scheme`, `proto.js` toggles `.dark` on `<html>` (same strategy as next-themes `attribute="class"`);
  state blocks `[data-state="<name>"]` shown by `#state-<name>`; `data-step` attributes for flow steps; relative
  links only; no absolute URL (`<scheme>://`, any scheme) and no protocol-relative URL (`//host`) anywhere in
  `.html`, `.css`, `.js` or `.svg` under `design/` (attributes, `srcset`, `<meta http-equiv="refresh">`, `<form
  action>`, CSS `url()` and `@import`, `fetch`/`XMLHttpRequest`/`WebSocket`/`import()` in scripts, comments), except
  the value of an `<a href>` (navigation the user chooses; the `<a>` tag's other attributes, such as `ping`, are not
  exempt) and an `xmlns` value under `http://www.w3.org/` (a namespace name, never fetched).
- Acceptance notes headings: Route; Prototype; Flows (step ids); Status (`draft` | `ready`); Purpose; Layout and
  breakpoints (375, 768, 1280); Components (shadcn name -> usage); States (with `#state-` anchors); Interactions and
  keyboard (focus order, escape keys); Copy (key | Russian text); Accessibility notes; Acceptance checks (numbered
  `AC1..`, each verifiable); Open questions.
- `Status`: written only by the product-designer. `ready` means "submitted for `judge_ux` as complete"; it becomes a
  promise to dev only on `main`, which a DESIGN PR reaches only after 3/3 PASS in `judge_ux` (Stop gate, then
  Stepan's merge). A FAIL means not ready: the re-spawned product-designer fixes the page or sets `draft`. The
  orchestrator never writes it (CLAUDE.md 4.1).
- Language: deliverables in English; prototype UI copy and the acceptance-notes Copy table in Russian.
- Write rules (no change to any gate): `design/` is product: writable in any active pipeline, blocked without one;
  in LEARN, tool writes are blocked because `design/` is not in `learn_tier_editable_paths` (designs are inputs to
  LEARN, changed only by a DESIGN task); shell writes in LEARN are not guarded, the same as `course/` today (R3),
  accepted. Per-team path scoping does not exist and is not built (section 5).
- `design/README.md` is created in this task (states the layout, empty page table) so the location is documented in
  the tree; no other `design/` file is created here.

### 2.8 `scripts/design_tokens.py` and CI

Python 3.9-compatible stdlib script, `mypy --strict` clean, no third-party packages (a dependency for a color formula
is not worth it; the formulas are published and small). Two subcommands; exit 0 = clean, 1 = findings (including a
missing `tokens.css`), 2 = usage error or a `tokens.css` that cannot be parsed (unterminated comment, unbalanced
braces).

- `check <design-dir>`:
  1. **Parse** `<dir>/system/tokens.css` (missing -> exit 1 naming the path). Strip `/* */` comments (unterminated ->
     exit 2); split top-level items by brace depth (unbalanced -> exit 2). The items must be, in this order and
     exactly once each: the `@custom-variant dark (&:is(.dark *));` statement (whitespace-normalized), `:root {}`,
     `.dark {}`, `@theme inline {}`. Any other or repeated top-level rule or at-rule (`body {}`, a second `:root`,
     `@media`) -> ERROR naming it. Inside the three blocks only `--name: value;` declarations; anything else -> ERROR.
  2. **Classify** every `:root`/`.dark` declaration by value shape (2.7): colour token, non-colour token
     (fullmatch `-?(\d+\.?\d*|\.\d+)(px|rem|em|%|ms|s|deg)?`, `calc\(.+\)` or `var\(--[a-z0-9-]+\)`), else ERROR
     `<theme> --<name>: '<value>' is neither a colour (oklch() or hex) nor a length, number, calc() or var()`.
  3. **Shape**: required colour tokens in both themes: `background, foreground, card, card-foreground, popover,
     popover-foreground, primary, primary-foreground, secondary, secondary-foreground, muted, muted-foreground,
     accent, accent-foreground, destructive, border, input, ring` (shadcn default set, R7). Absent from both themes ->
     one ERROR `required token --<name> missing in :root and .dark`; absent from one -> ERROR naming that theme; present
     but non-colour -> ERROR. Every colour token present in one theme is a colour token in the other. Every colour
     token has `--color-<name>: var(--<name>)` in `@theme inline`. Every `var(--x)` in `@theme inline` refers to a
     `:root`/`.dark` name. `--radius` is a non-colour token in `:root`.
  4. **Colour parsing** (colour tokens only): `oklch(L C H)` and `oklch(L C H / A)` (L number or percent, H with
     optional `deg`, A number or percent) and `#rgb`/`#rrggbb`; anything else -> ERROR naming token, theme and value.
     Conversion OKLCH -> OKLab -> linear sRGB with the matrices from the CSS Color 4 sample code (coder copies them
     from https://www.w3.org/TR/css-color-4/#color-conversion-code and cites the URL in a comment; not from this
     design). A linear channel outside [-0.0001, 1.0001] -> ERROR "out of sRGB gamut" (tokens must render the same on
     every display, so contrast is defined; gamut mapping differs between browsers). Encode to sRGB, composite a
     translucent color over the opaque surface it is checked against in encoded space, quantize to 8 bits, linearize
     with WCAG's formula, relative luminance, ratio `(L1+0.05)/(L2+0.05)`. A translucent surface -> ERROR.
  5. **Pairs** per theme. Text, minimum 4.5: every `<x>-foreground` on `<x>` when both exist; `muted-foreground` on
     `background`; `destructive` on `background`. Non-text, minimum 3.0: `ring` on `background`; `input` on
     `background`; `sidebar-ring` on `sidebar` when both exist. Info only (printed, never failing): `border` on
     `background`. Comparison on the unrounded ratio (`ratio >= min` passes); printed with three decimals.
  6. **Scan** every `*.html`, `*.css`, `*.js` and `*.svg` under `<dir>`:
     - raw color literals, in every file except `system/tokens.css`, only inside declaration values of CSS contexts:
       `.css` files and `<style>` blocks (comments stripped; the text between `prop:` and `;` or `}` inside a block,
       never a selector, so `#main { ... }` is not a colour), `style="..."` attribute values, and the values of
       `fill`/`stroke`/`color`/`stop-color` attributes. Flagged: hex `#[0-9a-fA-F]{3,8}\b` and
       `oklch(`/`oklab(`/`lab(`/`lch(`/`rgb(`/`rgba(`/`hsl(`/`hsla(`/`hwb(`/`color(`;
     - `var(--x)` in CSS contexts (fallback form `var(--x, ...)` included): ERROR when `x` is declared only in
       `@theme inline` (`--x is defined only in @theme inline, which browsers ignore; declare it in proto.css :root
       with the same value`), or nowhere (`undefined variable --x`). Visible names as in 2.7;
     - a `--x:` declared in a scanned file whose name also exists in `@theme inline` with a different value
       (whitespace-normalized) -> ERROR `prototype alias --x differs from @theme inline`;
     - URLs, in every scanned file including `tokens.css`: after masking `<a ... href="...">` values (`href` only) and
       `xmlns`/`xmlns:*` values starting `http://www.w3.org/`, ERROR for `[A-Za-z][A-Za-z0-9+.-]*://` anywhere and for
       a protocol-relative URL, regex `["'`(=]\s*(?:/[/\\]|\\/)[A-Za-z0-9]` (browsers read a backslash as a slash
       in http(s) URLs, so `/\host` and `\/host` are protocol-relative; a JavaScript `// comment` is not preceded by
       a quote, backtick, parenthesis or `=`, so it is not flagged; two leading backslashes are not flagged outside
       srcset, because JavaScript strings hold `"\\d"` regex escapes). The absolute-URL message quotes the URL up to
       the first whitespace, quote, backtick, parenthesis, angle bracket, comma or semicolon. Every srcset candidate
       after the first, quoted or unquoted attribute value, is checked for `//`, `/\`, `\/`, `\\` or a scheme.
  7. **Flows**, when `<dir>/flows/` exists: in every `flows/*.md` except `ia.md`, flow headings
     `^#{2,3}\s+F(\d+)\b` and step items `^\s*(?:[-*]|\d+\.)\s+\**F(\d+)\.(\d+)\b`. ERROR for a flow id declared twice
     (naming both files), a step id declared twice, a step whose flow has no heading in the same file, and a
     `data-step="F<n>.<m>"` in any scanned `.html` with no declared step.
  Output lines: `contrast ok|contrast low <theme> <fg> on <bg>: <ratio>:1 (min <m>:1)`, `INFO ...`,
  `ERROR <path>:<line>: <message>`, `design check: clean`. No output line (usage text and `pair` included) starts with a
  bare `PASS` or `FAIL`: judges paste this output into reports whose vote `hookio.VERDICT_RE` parses, and with the
  theme `:root` a `PASS :root ...` line matched it (`\s*[:\-]` after the token). A translucent-surface ERROR names
  `tokens.css` and the surface token's line, like every other token ERROR.
- `pair <fg> <bg>`: prints the ratio for two color values (same parser, alpha composited over `bg`), exit 0; exit 2 on
  a parse error.
- Tests `tests/design/test_design_tokens.py` (stdlib `unittest`). The test inserts the repository's `scripts/`
  directory (path relative to the test file) at the front of `sys.path` and does `import design_tokens`, and adds
  `.claude/hooks/lib` after it for `import hookio` (the verdict-collision rows), so mypy checks the calls against the
  real signatures (`MYPYPATH=scripts:.claude/hooks/lib`); exit codes are asserted through
  `subprocess.run([sys.executable, "-I", <script>, ...])`. Fixtures are written to a `tempfile.TemporaryDirectory`
  from one valid minimal fixture builder, so the repo holds no fixture tree and every negative test differs from
  the positive control in one place. Named by behaviour, with the mutation each one catches:

  | Test | Asserts | Mutation that turns it red |
  |---|---|---|
  | `test_valid_minimal_design_dir_exits_zero` | exit 0, no ERROR line | a checker that always fails (positive control for every negative row) |
  | `test_achromatic_oklch_matches_hex_737373_contrast_on_white` | `oklch(0.556 0 0)` on `oklch(1 0 0)` 4.742 +- 0.005 and equal to `#737373` on `#ffffff` | wrong lightness cube or missing quantization |
  | `test_white_on_black_is_21` | 21.000 | ratio formula without the 0.05 terms |
  | `test_percent_lightness_equals_number_lightness` | `55.6%` == `0.556` | percent read as a number |
  | `test_srgb_primaries_round_trip_from_oklch` | red, green, blue oracle oklch values (cited from CSS Color 4 examples or colorjs.io) -> `#ff0000`/`#00ff00`/`#0000ff` within one 8-bit step; the only test exercising the chroma matrices, mandatory | a mistyped matrix entry |
  | `test_translucent_border_composited_over_dark_background` | `oklch(1 0 0 / 10%)` over `oklch(0.145 0 0)` 1.252 +- 0.02 (coder: the blend is 34.5 of 255; compositing before quantizing, as step 4 says, rounds it to 35 and gives 1.260, the architect's 1.244 rounded the tie down; the test accepts both, alpha ignored gives about 18) | alpha ignored |
  | `test_muted_foreground_below_text_minimum_fails` | `--muted-foreground: oklch(0.556 0 0)` on `--muted: oklch(0.97 0 0)` (4.349) -> `contrast low` line, exit 1 | text minimum set to 3.0 (rev 1 had no case between 3 and 4.5) |
  | `test_text_pair_just_above_minimum_passes` | `oklch(0.545 0 0)` on `oklch(0.97 0 0)` (4.542) -> `contrast ok` | text minimum set above 4.55, or `>` vs `>=` swapped with a rounded ratio |
  | `test_light_ring_default_fails_non_text_minimum` | `oklch(0.708 0 0)` on white (2.584) -> `contrast low`, exit 1 | non-text minimum lowered or the ring pair dropped |
  | `test_ring_just_above_non_text_minimum_passes` | `oklch(0.65 0 0)` on white (3.234) -> `contrast ok` | ring checked against 4.5 |
  | `test_out_of_gamut_token_is_an_error_naming_token_and_theme` | ERROR names `--primary` and `.dark` | gamut check removed |
  | `test_required_token_absent_from_both_themes_is_an_error` | `--ring` removed from both -> one ERROR "missing in :root and .dark" | only the one-sided presence check exists |
  | `test_custom_color_token_missing_in_dark_is_an_error` | custom `--brand` (mapped in `@theme inline`) in `:root` only -> exactly one ERROR "colour token --brand has no colour value in .dark" (a required token would be reported by the required-token check instead) | symmetry check removed |
  | `test_translucent_surface_is_an_error` | `--muted` at 50% alpha -> one ERROR at `system/tokens.css:<line of --muted>` | the ERROR reported with a bare relative path and line 1 |
  | `test_theme_mapping_to_undefined_token_is_an_error` and `test_color_token_without_theme_mapping_is_an_error` | ERROR each | mapping checks removed |
  | `test_non_colour_tokens_are_not_parsed_as_colours` | `--radius: 0.625rem`, `--spacing: 0.25rem` -> no colour, pair or mapping ERROR | every `:root` declaration treated as a colour |
  | `test_named_colour_or_rgb_value_in_tokens_is_an_error` | `--brand: rebeccapurple` and `--x: rgb(0 0 0)` -> ERROR each | unknown value shapes treated as non-colour (escaping every check) |
  | `test_extra_top_level_rule_in_tokens_is_an_error` | `body { }` appended -> ERROR | top-level item list not enforced |
  | `test_unbalanced_braces_in_tokens_exits_2` | exit 2 with a message | parse error reported as findings or as a clean run |
  | `test_external_url_and_import_in_css_are_errors` | `url(https://x.example/a.png)` and `@import "//cdn.example/x.css";` in `proto.css` -> 2 ERRORs | rev 1's context list without CSS |
  | `test_iframe_src_is_an_error` | `<iframe src="https://x.example">` | rev 1's narrow context list (script/link/img only) |
  | `test_protocol_relative_srcset_is_an_error` | `<img srcset="//cdn.example/a.png 2x">` | protocol-relative form not detected |
  | `test_unquoted_srcset_later_candidate_is_an_error` | `<img srcset=a.png,//cdn.example/e.png>` -> srcset candidate ERROR | srcset matched only when quoted |
  | `test_backslash_protocol_relative_src_is_an_error` | `<img src="/\cdn.example/f.png">` -> protocol-relative ERROR | only the `//` form detected |
  | `test_fetch_and_websocket_urls_in_script_are_errors` | `fetch("https://api.example/x")` in `proto.js` (message quotes `'https://api.example/x'` without the closing quote), `new WebSocket("wss://x.example")` inline | `.js` not scanned, only http(s) schemes, or the quoted URL keeps the trailing quote |
  | `test_anchor_href_and_svg_xmlns_are_allowed` | `<a href="https://docs.example">`, `xmlns="http://www.w3.org/2000/svg"` -> no ERROR | exemptions missing (false positives) |
  | `test_anchor_ping_is_an_error` | `<a href="x.html" ping="https://t.example">` -> ERROR | the whole `<a>` tag masked instead of its `href` value |
  | `test_js_line_comment_is_not_a_url` | `// toggles the theme` in `proto.js` -> no ERROR | protocol-relative regex without the preceding-character rule |
  | `test_raw_hex_in_proto_css_reported_with_line` and `test_anchor_href_hash_is_not_a_color` | ERROR with the line; `href="#bad"` not flagged | hex scan removed; attributes scanned as CSS |
  | `test_id_selector_is_not_a_color` | `#main { color: var(--foreground); }` -> no ERROR; `.x { color: #fff; }` -> ERROR | whole-text hex scan (selectors flagged) |
  | `test_undefined_var_reported_and_var_declared_in_proto_css_accepted` | ERROR for `var(--nope)`; none for a `proto.css :root` name | var check removed or proto declarations ignored |
  | `test_theme_inline_only_name_is_undefined_in_prototype` | `var(--radius-sm)` and `var(--color-primary)` without a proto alias -> ERROR each, message names `@theme inline` | `@theme inline` names counted as visible |
  | `test_proto_alias_must_equal_theme_value` | `--radius-sm: calc(var(--radius) - 2px)` vs theme `- 4px` -> ERROR; equal value -> none | alias equality not checked |
  | `test_flow_id_declared_in_two_journey_files_is_an_error` | `## F1` in two files -> ERROR naming both | flow ids checked per file only |
  | `test_data_step_without_declared_step_is_an_error` | `data-step="F1.9"` with steps F1.1-F1.3 -> ERROR | prototypes not cross-checked with flows |
  | `test_no_validator_output_line_parses_as_a_verdict` | every line of a passing and a failing `check` run, a `pair` run and the usage text through `hookio.verdict_from` -> `UNKNOWN` | per-pair lines prefixed `PASS`/`FAIL` |
  | `test_fail_report_with_pasted_output_stays_a_fail` | a FAIL report with the same output pasted above the verdict, and the old layout with it pasted below `FAIL - 1 issues found:` -> both `FAIL` | per-pair lines prefixed `PASS`/`FAIL` |
  | `test_pair_cli_exit_codes` | 0 with a ratio line; 2 on `notacolor` | CLI exit codes swapped |

- CI (`.github/workflows/ci.yml`), new job `design` ("design tokens", ubuntu-24.04, timeout 5): checkout;
  `python3 -m unittest discover -s tests/design -v`; then a step that runs `python3 -I scripts/design_tokens.py check
  design` when `design/system/tokens.css` exists and otherwise prints `design/system/tokens.css not present yet:
  token checks skipped`. The skip is visible in the log and ends the moment the first DESIGN task adds the file;
  ADR-0006 states the check is required from then on. `pipeline-types` gains a second mypy step on the installed
  mypy: `MYPYPATH=scripts:.claude/hooks/lib python -m mypy --strict --python-version 3.9 --cache-dir
  "$RUNNER_TEMP/mypy-cache-design" scripts/design_tokens.py tests/design/test_design_tokens.py` (a separate invocation:
  the validator resolves from `scripts/`, and the hook lib is on the path only for the test's `import hookio`). No HTML validator, no axe, no stylelint (section 5).

### 2.9 ADR-0006 and the ADR-0005 amendment

`docs/adr/0006-design-dev-contract.md`, template of `0000-template.md`, Status Proposed, Issue #27.
- Context: design team exists (#27); `apps/web` will consume designs (#1); ADR-0001 as the model.
- Decision:
  1. Single source of tokens: `design/system/tokens.css` in the 2.7 shape. Dev copies it verbatim into
     `apps/web/app/globals.css` between `/* design-tokens:start */` and `/* design-tokens:end */`, right after the
     `@import` lines; the app's font theme (`--font-sans` -> a next/font variable) stays outside the block. No token
     is edited in `apps/web`: token values change only through a DESIGN task, and dev picks the new file up by
     re-copying the block. The first dev task that adopts tokens adds a CI drift check (block == file), which also
     catches a shadcn CLI run (`shadcn init`/`add`) that rewrites `globals.css` inside the block; until then the
     tester diffs them by hand and reports it.
  2. Per page: `design/pages/<slug>/prototype.html` and `acceptance.md` with the fixed headings. `Status` is written
     only by the product-designer; `ready` is a promise to dev only on `main` (a DESIGN PR reaches main only after
     3/3 PASS in `judge_ux`); a FAIL means not ready. Dev implements only pages whose acceptance notes on `main` say
     `Status: ready`.
  3. Prototype conventions (2.7, including the variables a prototype may use and the URL rule) and the rule that
     `proto.css`/`proto.js` are never imported by the app (`rg -n "design/" apps/` lists no runtime import).
  4. Validator `scripts/design_tokens.py check design` required in CI once `tokens.css` exists.
  5. Fidelity in dev review (2.10): tester's "Design conformance" section; judge-architecture checklist item. A
     deviation is allowed only when listed under "Design deviations" in the PR body with a follow-up DESIGN issue;
     dev never edits `design/` to make it match.
  6. Change procedure: the contract (this ADR, the tokens shape and value classes, layout, acceptance headings,
     prototype conventions, the validator's rules) changes only through a dev task with an ADR update approved by
     Stepan, which migrates every existing design deliverable and `apps/web` consumer in the same PR. Token values
     and design deliverables change only through DESIGN tasks. Neither team changes the contract alone.
- Alternatives: tokens as JSON plus a generator (rejected: a build step and a second format for one consumer); Tailwind
  CDN in prototypes (rejected: network and third-party script, prototype styling diverges from app classes anyway);
  a design judge in every dev tier (rejected, 4); pixel-diff tests (rejected: prototypes are not pixel-exact).
- Consequences: dev cannot start a page before DESIGN marks it ready on main; prototypes stay static and cheap.
- `docs/architecture.md` "Decisions that are costly to change": add "Design/dev contract: ADR-0006"; add a
  `design/` bullet to the component list ("written by the design team, read by apps/web").
- ADR-0005: bullet `Amended: #23 (items 6, 7, 8 and 9); #27 (item 10)` and a new item 10 "Team of a role": the role of
  a spawn is the agent file named by the prompt's leading `Read .claude/agents/<dir>/<file>.md first` only when that
  exact path (directory and case) exists in the main checkout's agent tree, and its team is the directory the file
  lives in; a prompt naming a path that does not exist, or a `subagent_type` naming a known agent other than the
  prompt's role, is denied for every role (`role-path`, `role-type`); a gated role may be spawned only in a tier whose
  `team` equals its team; an unreadable or empty agent tree blocks role spawns (fail closed); agent names and
  basenames are unique across directories (CI); judges are bound by the tier's judge list. Residual risk accepted as
  for items 1-9: a deliberate bypass (a prompt without the leading `Read` line and no `subagent_type`) is not a role
  spawn and is caught by review.

### 2.10 Dev-side role changes (always-writable `.claude/agents/`)

- `dev/tester.md`, new step "Design conformance" (when the diff touches a page that has `design/pages/<slug>/`):
  Playwright screenshots of the prototype (`file://` URL) and the app page at widths 375 and 1280, light and dark
  (`emulateMedia({ colorScheme })`), saved to `test-results/design/<slug>/<prototype|app>-<width>-<theme>.png`
  (`test-results/` is git-ignored, `.gitignore:22`); each `AC<n>` of the acceptance notes marked pass/fail with
  evidence (test name or screenshot path); token block vs `tokens.css` diff result; contrast of destructive button
  text in the app from computed styles (both themes, `python3 -I scripts/design_tokens.py pair`); raw color grep
  `rg -n '#[0-9a-fA-F]{3,8}\b|oklch\(|rgb\(|hsl\(' apps/web --glob '!**/globals.css'` empty. Report gains a
  `design:` line. Not applicable before `apps/web` exists; the step says so.
- `dev/judge-architecture.md`, one checklist item: "Design conformance: if the diff touches a page with a design,
  the tester report has the Design conformance section with every AC answered, the raw color grep is empty, the
  components are the shadcn components named in the acceptance notes, the page is `Status: ready` on main, and every
  deviation is listed in the PR body with a follow-up DESIGN issue. Missing any of these is a FAIL."
- No change to judge-security or judge-operations.

### 2.11 Docs and GitHub meta

- `CLAUDE.md` (section numbers unchanged; hooks quote section 7): line 3 "two agent teams" -> "three"; section 1
  heading "Two teams" -> "Three teams", a design row (works on `design/`; agents `.claude/agents/design/`:
  ux-researcher, product-designer, ui-designer; judges usability, accessibility, visual consistency), a second
  contract paragraph (design -> dev: ADR-0006, `scripts/design_tokens.py`); section 2 step 3: "DESIGN tasks use the
  `docs` type, e.g. `docs/31-learner-flows`"; section 3 tier table DESIGN row; phase -> agent table gains a
  "Design tier" column (2.3) with `judge_ux` added to the judge row; "Hooks enforce": "Each gated role may run only
  inside its phase window and only in tiers of its own team. The role is the file named by the leading `Read
  .claude/agents/<team>/<file>.md first` only if that exact path exists; its team is the directory it lives in; a
  wrong path or a `subagent_type` naming another agent is blocked for every role."
- `.claude/feedback/judge_must_be_spawned.md`: a third block "Design tier (DESIGN)" with the three
  `Agent(prompt="Read .claude/agents/design/judge-<usability|accessibility|consistency>.md first. Then review: ...")`
  lines, and "Dev tiers" / "Content tiers" headings unchanged.
- `README.md:7` "Two agent teams" -> "Three"; tree gains `.claude/agents/design/` and `design/` lines.
- `package.json` description: "three agent teams".
- `pipeline/state_machine.md`: new "## Design tier" section after "Content tiers" (phases and agents as 2.3).
- `.github/pull_request_template.md`: tier list adds `DESIGN`; checklist adds "Design contract unchanged, or
  ADR-0006 updated and all designs migrated".
- `.github/labels.yml`: `{ name: "team:design", color: "f9d0c4", description: "Design team pipeline" }`,
  `{ name: "tier:design", color: "fbca04", description: "Pipeline tier" }`, `{ name: "area:design", color: "ededed",
  description: "design/" }`.
- `.github/ISSUE_TEMPLATE/design.yml`: name "Design (UX/UI)", title prefix `docs(design): `, labels `type:feature`
  (the existing type label for product work; `module.yml` likewise carries a `type:` label), `team:design`,
  `tier:design`, `area:design`; fields: pages or flows in scope (required), learner goal and source (required),
  constraints and out of scope.
- `pr-hygiene.yml`: unchanged (decision 7.3).

---

## 3. Tests

### 3.1 `tests/pipeline/run.sh` rows

New prompt variables next to `JS`/`CODER` (`run.sh:166-169`): `UXR`, `PD`, `UID` (makers), `JU`, `JAC`, `JV` (judges),
`CA` (`Read .claude/agents/content/curriculum-architect.md first.`), `ARCH` (`Read .claude/agents/dev/architect.md
first.`). Groups use `put_state` where the phase can be set directly (no init/advance cost) and `reset_state` between
groups. `reason` means `log_last reason` after the call; `agent <prompt> [subagent_type]` is the existing helper
(`run.sh:81`).

Group "== teams" (added in coder step 4, after the content tier group):

| Row | Setup | Assertion | Mutation that turns it red |
|---|---|---|---|
| T1 | `put_state "$WORK" TASK architect` | `agent "$CA"` rc 2, reason `team:curriculum-architect.md` | team check removed: rc 0 (reproduced today) |
| T2 | same | `agent "design the module" curriculum-architect` rc 2, reason `team:curriculum-architect.md` | team check removed: rc 0 (reproduced today by the subagent_type probe) |
| T3 | `put_state "$WORK" TASK researcher` | `agent "$UXR"` rc 2, reason `team:ux-researcher.md` | team check removed: rc 0 (window `[researcher, judge_design]` exists in TASK). Needs step 6 gates: row added in step 6 |
| T4 | `put_state "$WORK" MODULE researcher` | `agent "$UXR"` rc 2, reason `team:ux-researcher.md` | as T3 (step 6) |
| T5 | `put_state "$WORK" MODULE architect` | `agent "$CA"` rc 0 | team compared with a constant or the wrong field: rc 2 (positive control) |
| T6 | `put_state "$WORK" DESIGN architect` | `agent "$CA"` rc 2, reason `team:curriculum-architect.md` | team check removed: rc 0 (step 6) |
| T7 | `set_cfg tiers` with TASK's `team` deleted (python over the saved file), `put_state "$WORK" TASK coder` | `agent "$CODER"` rc 2, reason `team:coder.md`; then `restore_cfg` | empty tier team treated as a wildcard: rc 0 |
| T8 | `put_state "$WORK" TASK coder`, Agent input with `prompt: 5` (inline python, like `agent`) | rc 2, `log_last event` = `gate-crash` | `read -r ... <<< "$(hookio role_team)"` form: rc 0 |
| T9 | `put_state "$WORK" TASK coder` | `agent "Read .claude/agents/qa/coder.md first."` rc 2, reason `role-path:coder.md` | `ROLE_RE` back to a fixed team list: role `""`, rc 0; claim not resolved against the scan: team `qa`, reason `team:coder.md` (reason assertion red) |
| T10 | `put_state "$WORK" TASK architect` | `agent "Read .claude/agents/dev/curriculum-architect.md first."` rc 2, reason `role-path:curriculum-architect.md` | rev 1 (team taken from the prompt capture): team `dev`, window exists, rc 0 |
| T11 | same | `agent "Read .claude/agents/content/Curriculum-Architect.md first."` rc 2, reason `role-path:curriculum-architect.md` | exact-case lookup without basename resolution: file `Curriculum-Architect.md` ungated, and with the identity check limited to gated roles rc 0; rev 1: rc 0. Deterministic on case-sensitive CI and case-insensitive macOS, because names come from `os.listdir` |
| T12 | `put_state "$WORK" TASK researcher` | `agent "Read .claude/agents/dev/ux-researcher.md first."` rc 2, reason `role-path:ux-researcher.md` | rev 1: team `dev` equals TASK's, window exists, rc 0 (step 6) |
| T13 | `put_state "$WORK" TASK coder` | `agent "Read .claude/agents/dev/nonexistent.md first."` rc 2, reason `role-path:nonexistent.md` | identity check applied to gated roles only: rc 0 |
| T14 | same | `agent "Read .claude/agents/dev/researcher.md first."` rc 0 | identity check compares case-folded or joined paths wrongly: rc 2 (positive control for T9-T13) |
| T15 | `put_state "$WORK" TASK architect` | `agent "$ARCH" curriculum-architect` rc 2, reason `role-type:architect.md` | rev 1 (`subagent_type` ignored when the prompt matches): rc 0 |
| T16 | `put_state "$WORK" TASK coder` | `agent "$CODER" coder` rc 0 | disagreement test inverted, or deny whenever both are given: rc 2 (positive control) |
| T17 | same | `agent "$CODER" Curriculum-Architect` rc 2, reason `role-type:coder.md` | exact-case `subagent_type` lookup: unknown name ignored, rc 0 |
| T18 | same | `agent "$CODER" general-purpose` rc 0 | an unknown `subagent_type` treated as a disagreement: rc 2 (Claude Code's built-in types must keep working) |
| T19 | `put_state "$WORK" TASK coder`; `mv "$WORK/.claude/agents" "$WORK/.claude/agents.off"` | `agent "$CODER"` rc 2, `log_last event` = `gate-crash`; `agent "plain search"` rc 0 (no claim, no type: no scan); then `mv` back | an empty or unreadable tree treated as "no role": rc 0 |

Group "== design tier" (added in coder step 6), branch `docs/30-design` from main, `init DESIGN 30`:

| Row | Setup / phase | Assertion | Mutation |
|---|---|---|---|
| D0 | init | `adv_ok "DESIGN starts" init DESIGN 30` | DESIGN tier missing: rc 1 |
| D1 | init | `agent "$UXR"` rc 2, reason `window:ux-researcher.md` | ux-researcher gate removed: rc 0 |
| D2 | researcher | `agent "$UXR"` rc 0 | team check compares with the wrong tier field: rc 2 |
| D3 | researcher | `agent "draw the pages" product-designer` rc 2 | `agent_index()` scans only dev/content: role `""`, rc 0 |
| D4 | researcher | `agent "Read .claude/agents/content/lesson-author.md first."` rc 2, reason `team:lesson-author.md` | team check removed: still rc 2 but reason `not-in-tier:...`, so the reason assertion goes red |
| D5 | judge_design | `agent "$JS"` rc 2, reason `not-a-judge:judge-security.md` | `security` added to DESIGN judges: rc 0 |
| D6 | judge_design | `agent "$JU"` rc 0 | `usability` missing from DESIGN judges: rc 2 |
| D7 | judge_design | `subagent_stop "$JU" "Checked flows.\nPASS"`, `subagent_handback "$JAC" "Checked.\nPASS: no issues"`, `post_agent "$JV" "Checked.\nPASS - consistent"`, `subagent_stop "$JS" "FAIL: off-tier"`; `votes` = `usability:PASS accessibility:PASS consistency:PASS` | old `ROLE_RE` (dev/content only): no votes recorded, string empty |
| D7b | judge_design, before D7 | `subagent_stop "Read .claude/agents/dev/judge-usability.md first." "Checked.\nFAIL: wrong path"`; `votes` has no `usability` entry | `role_from` returning the resolved basename for a sentinel: `usability:FAIL` recorded |
| D8 | judge_design | `adv_ok "leaves judge_design with the design trio" planner` | any one judge key mismatched between `judge_agents` and the tier list: rc 1 |
| D9 | author | `agent "$UID"` rc 0 and `agent "draw" product-designer` rc 0 | product-designer gate window typo (`autor`): rc 2 `not-in-tier` |
| D10 | author | `agent "$UXR"` rc 2, reason `window:ux-researcher.md` | ux-researcher window widened to `judge_ux`: rc 0 |
| D11 | author | `write_to "design/pages/catalog/prototype.html"` rc 0 | (positive control of product default; mutation: `design/` added to a blocked zone) |
| D12 | judge_ux | `agent "$PD"` rc 0 (re-spawn after FAIL) | window ends at `author`: rc 2 |
| D13 | judge_ux | two PASS votes (`JU`, `JAC` via `subagent_stop`); `adv_fail compound`; third vote `JV`; `adv_ok compound` | DESIGN judges list of two: the `adv_fail` row goes red |
| D14 | `put_state "$WORK" TASK judge_design` | `agent "$JU"` rc 2, reason `not-a-judge:judge-usability.md` | `usability` added to TASK judges: rc 0 |
| D15 | `put_state "$WORK" MODULE judge_content` | `agent "$JAC"` rc 2 | `accessibility` added to MODULE judges: rc 0 |
| D16 | `put_state "$WORK" LEARN learner` | `write_to "design/flows/ia.md"` rc 2 | `design/` added to `learn_tier_editable_paths`: rc 0 |
| D17 | no state (`reset_state`) | `write_to "design/README.md"` rc 2 | `design/` added to `OPEN_PREFIXES`: rc 0 |

In D7, D7b and D13 the reports are two-line strings written with a literal newline inside the quotes, as the existing
rows at `run.sh:216-219` do (`\n` above is shorthand). Votes are recorded per round, so the `judge_design` votes of D7
do not count in `judge_ux` (D13). D7b runs before D7 so that D7's vote string shows the FAIL was never recorded.
Plus T3, T4, T6, T12 (above) in this step. Row S1 (static invariants, step 6), one python heredoc over `$WORK/.claude`
printing one `ok`/`FAIL <letter> <detail>` line per check:
- S1a: every `.md` file directly under `.claude/agents/<dir>/` either starts with `_` or fully matches
  `[a-z0-9-]+\.md` (no file is silently left out of the index); basenames unique across directories after
  lower-casing; frontmatter names unique after lower-casing; each name equals its file stem (true for all 16 files
  today, checked).
- S1b: every `agent_gates` key and every `judge_agents` value, skipping keys that start with `_` (`agent_gates` has
  `_comment`), exists in exactly one team directory.
- S1c: every gated agent has at least one tier of its own team that contains both window phases (no dead role).
- S1d: every judge key in a tier's `judges` maps to a file in that tier's team directory (a design judge put into a
  dev tier's list passes the runtime check but fails here).
- S1e: every tier `team` is a directory under `.claude/agents/` or `any`; an `any` tier has no judges.
Mutations (tester, in a scratch copy, one at a time): copy `dev/coder.md` to `design/coder.md` (a), add
`dev/Coder2.md` (a, pattern), rename an `agent_gates` key to a missing file (b), S1b without the `_` skip (b must
then print `FAIL b _comment`, proving the skip is needed), `ux-researcher.md` window `["research", "judge_design"]`
(c), add `usability` to TASK judges (d), DESIGN team `desgn` (e); each must print its own `FAIL <letter>` line, and
the unmutated tree prints only `ok`.

Runtime budget: 19 + 19 rows plus S1; each `agent`/`subagent_stop` call costs a few python3 processes (R4), and the
directory scan adds about 20 small reads per role call. Estimate +20 to +40 s over today's 2:20 on this Mac (the
operations judge measured 141 s for the scratch suite); the tester measures the wall time and fails the step if the
suite exceeds 3:30 locally (CI job timeout 5:00).

### 3.2 Other tests

- `tests/design/test_design_tokens.py` (2.8), run locally on `/usr/bin/python3` (3.9.6):
  `/usr/bin/python3 -m unittest discover -s tests/design -v`, and in the `design` job.
- mypy strict on 3.12 targeting 3.9, both invocations, locally through docker (no local mypy or Python 3.12; needs
  network for the pinned pip install), from the export or the repo root mounted read-only:
  `docker run --rm -v "$EXP":/mnt:ro -w /mnt python:3.12-slim sh -c 'pip install -q --root-user-action=ignore
  --disable-pip-version-check --no-deps --only-binary :all: -r tests/pipeline/requirements-typecheck.txt &&
  MYPYPATH=.claude/hooks/lib python -m mypy --strict --python-version 3.9 --cache-dir /tmp/mypy-cache
  .claude/hooks/lib/*.py && MYPYPATH=scripts:.claude/hooks/lib python -m mypy --strict --python-version 3.9 --cache-dir
  /tmp/mypy-cache-design scripts/design_tokens.py tests/design/test_design_tokens.py'`. The hooks half ran on
  2026-10-29 against today's tree: rc 0 (7 s); the design half exists from step 7.
- shellcheck `-S error` over the changed `phase-gate.sh` and `run.sh`, offline from the cached image:
  `docker run --rm --network none -v "$EXP":/mnt:ro -w /mnt koalaman/shellcheck:stable -S error
  .claude/hooks/phase-gate.sh tests/pipeline/run.sh` (ran on 2026-10-29 against today's files: rc 0).
- Language check on every new or changed file: `rg -n '[\x{0400}-\x{04FF}]'` empty except prototype copy (none is
  created in this task, so empty everywhere) and `rg -n '\x{2014}'` (em dash) empty.

---

## 4. Alternatives considered

- **Distinct phase names only (no hook check).** DESIGN would use names no other tier has (`ux_research`,
  `prototype`, `judge_ux`). Rejected: it cannot fix the existing curriculum-architect leak without renaming MODULE's
  `architect`/`judge_design` (docs, plans, parked states), and every future tier that reuses a name silently reopens
  the leak. The rule we mean is "a team owns its roles"; the `team` field already exists (R1) and is unused.
- **Team taken from the prompt's directory segment** (revision 1). Rejected after review: the prompt is a claim, the
  file's location is the fact, and `dev/curriculum-architect.md` or a case variant passed every check.
- **Deny only false claims for gated roles.** Rejected: it keeps a list of "harmless" false claims (ungated roles,
  judges, nonexistent files) that every later gate must re-derive; one rule for every role is shorter and has no
  known legitimate exception (no spawn in the repo or its docs names a wrong path).
- **Team check for every role, including ungated ones.** Rejected: `researcher.md`, `architect.md`, `mentor.md`,
  `content-researcher.md` are deliberately ungated and are used across tiers (RESEARCH is `any`); gating them is a
  separate decision.
- **Change `hookio role` output to `team/file` in place.** Rejected: between the `hookio.py` and `phase-gate.sh`
  installs, the old gate would read `dev/coder.md` as an unknown role and allow it (fail open for a few seconds).
  A new command plus a later deletion keeps every intermediate state closed.
- **Top-level `teams` list in `pipeline.json` feeding `ROLE_RE`.** Rejected: role detection would depend on
  `cfg.load()` succeeding inside `hookio` (a config error would make every role unknown), and the directory is the
  identity anyway. S1e covers the registry purpose statically.
- **Reuse `judge_content` for the design review round.** Rejected: misleading name in status/logs; no benefit with the
  team check.
- **A smaller DESIGN_FIX tier (LESSON-like).** Not built: no DESIGN task exists yet, and the full tier lets
  researcher/architect be short. Add it (data plus two rows) after two real one-page tweaks show the need.
- **A fourth judge (design) in dev tiers.** Rejected: one judge list per tier (R1) means it would also run on
  HOTFIX/PIPELINE/RELEASE work with no UI; the tester's screenshots plus one architecture checklist item give
  evidence without a new voter.
- **No validator, judges compute contrast ad hoc.** Rejected as default: an LLM re-deriving OKLCH conversion in each
  review is the "subtly wrong but convincing" case; a tested script makes the judges' numbers reproducible and is the
  `content:validate` analogue. Stepan may override (7.2).
- **Radius steps and font stack in `tokens.css` `:root`.** Rejected: the app would carry them twice (`:root` and
  `@theme inline`) and the font stack is a dev decision; prototype aliases in `proto.css` with a checked equality
  keep `tokens.css` identical to the shadcn shape.
- **Scanning only known URL contexts** (revision 1). Rejected: the list of fetching contexts is open-ended (iframe,
  srcset, object, form, meta refresh, fetch, WebSocket, import()); any absolute URL outside `<a href>` is the rule.
- **Tokens as JSON plus a generated CSS.** Rejected: a build step and two formats for one consumer.
- **Tailwind CDN or a framework in prototypes.** Rejected: network dependency, third-party script, and Stepan opens
  files by double-click.

## 5. What NOT to build

- The platform's flows, wireframes, tokens or components (first DESIGN task).
- A DESIGN_FIX tier; a `design` branch/title type in `pr-hygiene.yml`.
- Per-team path scoping in the write gates (no team is path-scoped today; discipline, CLAUDE.md 4.1).
- Runtime team checks for judges or ungated roles (the identity check of 2.1.3 step 2 is not a team check); a `teams`
  registry in `pipeline.json`.
- An HTML validator, axe/pa11y, stylelint, screenshot or pixel-diff tooling in this repo now; the token drift check in
  `apps/web` (built by the first dev task that adopts tokens, ADR-0006 item 1); a named-colour scan (judge-consistency
  reads for it).
- Any change to `learn_tier_editable_paths`, `learn_tier_code_dirs`, `OPEN_PREFIXES`, the shell guard.
- CODEOWNERS changes by any agent (the file carries Stepan's uncommitted edit; Stepan resolves it in 11.2 and may add
  `/design/` there).
- Printing the real team in `pipeline-advance.sh:192`.
- A browser tool for design judges.

## 6. Failure modes and mitigations

| # | Failure | Effect | Mitigation |
|---|---|---|---|
| F1 | Broken `cfg.py` installed | every gate, Write included, fails closed (lockout) | 9.1 scratch-first (py_compile, mypy, full suite on 3.9.6) and one atomic `cp`+`touch`+`mv`; recovery 9.2 row 3 (kill switch, CLAUDE.md section 7) |
| F2 | Broken `hookio.py` installed | shell guard and phase gate fail closed (`hookio field` / role capture crash -> `gate-crash`); Write gate unaffected | same procedure; repair path is the Write tool (9.2 row 1) |
| F3 | `phase-gate.sh` syntax error | `common.sh` sentinel still loads, `main_fn` fails -> rc != 0 -> `gate-crash` block for Agent calls only | `bash -n` + shellcheck in scratch; restore by Bash cp (9.2 row 5) |
| F4 | Malformed `pipeline.json` | every gate crashes (ADR-0005 item 9), Write included | validated in scratch by `python3 -I "$EXP/.claude/hooks/lib/cfg.py" tiers` (prints DESIGN) and the full suite before install; atomic install; recovery 9.2 row 3 |
| F5 | hookio crash read as "no role" | fail open for gated roles | assignment form mandated (2.1.3), row T8 |
| F6 | Tier without `team` | gated roles allowed if treated as wildcard | strict equality + explicit empty-team deny, row T7 |
| F7 | Duplicate agent names/basenames across dirs | wrong role/team picked | sorted first-wins for names at runtime (deterministic); exact `(dir, file)` match for prompt claims, so a duplicate basename keeps its real directory; S1a in CI; Claude Code also loads only one |
| F8 | Design judge listed in a dev tier by mistake | runtime would accept its vote | S1d |
| F9 | Gate window phase typo | role silently unspawnable | S1c, D9 |
| F10 | Team check blocks a legitimate cross-team use | work stalls | none exists today (all gated roles used only in own-team tiers, checked against `pipeline.json`); the block message names both teams |
| F11 | Validator math wrong | judges certify bad contrast | oracles from independent sources (achromatic closed form, sRGB primaries from the spec, 8-bit hex equivalence), both sides of each threshold, positive control |
| F12 | Out-of-gamut rule rejects shadcn defaults | ui-designer must adjust chroma | intended (consistent contrast across displays); error names token and theme; default, Stepan may override (7.8) |
| F13 | Token skip step hides a deleted `tokens.css` | check silently skipped | deletion is visible in the PR diff; once `design/pages/` exist, ADR-0006 forbids it; acceptable residual |
| F14 | Suite exceeds CI timeout | red CI | budget measured (3.1); rows use `put_state` |
| F15 | Our own PIPELINE session blocked by the new check mid-task | coder/tester re-spawns refused, task stalls | coder/tester/judges are spawned with their real `dev/` paths in a `dev` tier, so the rule allows them; the S4b smoke after step 4 proves the coder spawn still passes, and 9.2 restores `phase-gate.sh` if it does not |
| F16 | A worktree session (e.g. parked #1) forwards to the live hooks during installs | it sees each install immediately | Stepan pauses other sessions before step 2 (11.1); its roles are dev roles in a dev tier, unaffected by the rule |
| F17 | Prompt claims a role path that is not where the file lives (wrong directory, case, nonexistent file) | rev 1: identity spoofed, gated role spawned in a foreign tier | resolved against the scanned tree, sentinel `!path`, denied for every role (T9-T13), vote not counted (D7b) |
| F18 | `subagent_type` names a different known agent than the prompt | rev 1: Claude Code loads one agent, the gate checks another | sentinel `!type`, denied (T15, T17); unknown types ignored (T18) |
| F19 | Agent tree unreadable, empty, or a role file vanishes between listing and reading (a Write in progress) | rev 1 shape: every role "unknown", allowed | the scan raises, the gate maps it to `gate-crash` (T19); a transient race blocks one spawn, a retry passes |
| F20 | Validator false positives (`#id` selectors, JS comments, SVG `xmlns`) | designers work around the checker, or it gets ignored | declaration-value-only colour scan, preceding-character rule for `//`, `xmlns` and `<a href>` masks; each has a negative test |
| F21 | Prototype uses an `@theme inline` name | renders without the value in the browser while the validator says clean | `@theme`-only names are errors; aliases must equal the theme value (two tests) |
| F22 | Stepan's uncommitted `.github/CODEOWNERS` | `pr` (`pipeline-advance.sh:249`) and Stop at `done` (`phase-complete.sh:90`) refuse a dirty tree; the task cannot finish | Stepan's step 11.2 before `pr` (preferred: committed on main and merged into the branch; alternative: stash and pop after done); agents never stash, reset or switch branches |

## 7. Key decisions (with the researcher's open questions)

1. **Runtime team check for gated roles, identity from the scanned tree** (R open question 4), because it closes a
   live leak and states the real rule; cost about 40 lines in `hookio` plus about 15 in one gate and a query.
   Default, Stepan may override (then: distinct phase names and the leak stays).
2. **Small stdlib validator now** (R open question 3), because both design judges' core checks become computed and
   reproducible; CI runs its tests always and the token check once tokens exist. Default, Stepan may override (drop
   2.8; judges then compute in ad hoc Python, which 2.5 would have to say).
3. **Reuse the `docs` type for DESIGN branches and titles** (R open question 1), because deliverables are documents
   and static mockups and a new type touches `pr-hygiene.yml` twice and CLAUDE.md. Default, Stepan may override.
4. **Top-level `design/`, product by default, not editable in LEARN** (R open question 2), because it mirrors
   `course/` and needs no gate change. CODEOWNERS `/design/` is Stepan's optional addition in 11.2. Default, Stepan
   may override.
5. **Fidelity through tester evidence plus a judge-architecture item, no fourth dev judge** (R open question 5),
   because the judge list is per tier. Default, Stepan may override.
6. **No small DESIGN tier** (R open question 6), because there is no demand yet. Default, Stepan may override.
7. **Labels `team:design`, `tier:design`, `area:design` and a `design.yml` issue template** (R open question 7),
   because `github_bootstrap.py` rejects unknown labels in backlog files and DESIGN issues need the same intake as
   others. Default, Stepan may override.
8. **Tokens must be in sRGB gamut**, because contrast is otherwise display-dependent. Default, Stepan may override.
9. **Sequential `author` phase (ui-designer, then product-designer)**, because prototypes depend on tokens.
10. **`ux-researcher` runs both researcher and architect phases**, because flows and IA are the "architecture" of a
    design task and the brief defines three makers; a separate design-architect role would duplicate it.
11. **Judges share `judge_mistakes.md`**, because all existing judges do.
12. Issue #27 carries `tier:project` but runs as PIPELINE: cosmetic, Stepan relabels if he wants.
13. **A false role claim is denied for every role**, because a single rule needs no list of harmless exceptions.
14. **`Status: ready` is the product-designer's claim, made binding by the merge**, because the orchestrator never
    writes deliverables and no role runs after a PASS.

## 8. Deploy awareness

- New directories: `.claude/agents/design/` (registered by Claude Code by recursive scan, R5; read by `hookio` from the
  main checkout), `design/` (static files, never packaged into any image; no Dockerfile copies it, and ADR-0006 forbids
  runtime imports from `apps/`), `scripts/design_tokens.py`, `tests/design/`.
- No new dependencies: stdlib Python 3.9+ (macOS `/usr/bin/python3` 3.9.6, CI ubuntu-24.04 python3 3.12); mypy is the
  existing pinned 1.20.2 in `pipeline-types`; locally mypy and shellcheck run from docker images (3.2).
- `run.sh` copies `.claude/` wholesale (`run.sh:14-25`), so the new agent directory reaches the test repo; `design/` is
  not needed there (D11/D16/D17 only check gate decisions on paths).
- Biome covers any `.js`/`.json` in `design/` (R9); `.html`/`.css` are not linted.
- Claude Code may need a new session to list the new subagent types; spawning by `Read ... first` prompt works either way.

## 9. Ordered coder steps and the live install procedure

### 9.1 Live install procedure (every step that changes `.claude/hooks/**` or `.claude/pipeline.json`)

Paths: `S=/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/346534b8-2d38-4a32-8e29-767f6204b671/scratchpad`,
`MAIN=/Users/stepankorshukov/Documents/Projects/academy`. Each Bash call starts by setting both literally and, from P1 on,
`. "$S/env.sh"; : "${EXP:?}"`. The Bash tool starts a fresh shell per call (architect lesson #1), so nothing else is
assumed to persist. If the coder runs with a different scratchpad, it substitutes its own path everywhere.

Smoke inputs (already written with the Write tool and run on 2026-10-29; recreate with the Write tool if missing, never
via Bash, because a Bash command containing the `.git` path is itself blocked):
- `$S/smoke-write.json`: `{"hook_event_name": "PreToolUse", "tool_name": "Write", "cwd": "<MAIN>", "tool_input":
  {"file_path": "<MAIN>/.git/pipeline-smoke", "content": "x"}}`
- `$S/smoke-bash.json`: same with `"tool_name": "Bash"`, `"tool_input": {"command": "rm -rf .git/pipeline-smoke"}`
- `$S/smoke-agent-researcher.json`, `$S/smoke-agent-coder.json`, `$S/smoke-agent-uxr.json`: `"tool_name": "Agent"`,
  `"tool_input": {"prompt": "Read .claude/agents/<dev/researcher|dev/coder|design/ux-researcher>.md first. Smoke.",
  "subagent_type": ""}`
- `$S/smoke-agent-misdir.json` (new, from step 3 on): same with the prompt `Read .claude/agents/dev/curriculum-architect.md
  first. Smoke.`

Steps:
- **P1 export**, once per hook step: `EXP=$(mktemp -d "$S/export.XXXXXX") && git -C "$MAIN" ls-files -z -co
  --exclude-standard | tar -C "$MAIN" --null -T - -cf - | tar -C "$EXP" -xf - && printf 'EXP=%s\n' "$EXP" > "$S/env.sh"`
  (run on 2026-10-29: rc 0; no `rm -rf` of a variable, architect lesson #26).
- **P2 change** files in `$EXP` only (Edit/Write on scratch paths).
- **P3 static**: `bash -n` on changed `.sh`; `/usr/bin/python3 -I -m py_compile` on changed `.py`; shellcheck and mypy
  with the docker commands of 3.2 (shellcheck offline from the cached `koalaman/shellcheck:stable`; mypy in the cached
  `python:3.12-slim` with a networked pinned pip install; both ran on 2026-10-29 with rc 0 against today's tree);
  for `pipeline.json`: `/usr/bin/python3 -I "$EXP/.claude/hooks/lib/cfg.py" tiers` prints the tier list including
  DESIGN.
- **P4 suite in scratch**: `PATH="/usr/bin:$PATH" bash "$EXP/tests/pipeline/run.sh"` ends `0 failed` (2:20 today);
  every new row red under its 3.1 mutation, in a second export (`mktemp -d` again).
- **P5 install**, one file per Bash call, order inside a step as listed in 9.3: backup
  `B=$(mktemp -d "$S/backup.XXXXXX") && cp -p "$MAIN/<f>" "$B/" && printf 'B=%s\n' "$B" >> "$S/env.sh"`; then
  `cp -p "$EXP/<f>" "$MAIN/<f>.install" && touch "$MAIN/<f>.install" && mv -f "$MAIN/<f>.install" "$MAIN/<f>"`
  (`touch` invalidates a cached pyc, #23 F19). Never Edit/Write a live hook file in place.
- **P6 smokes**, each its own call, right after each install:
  - S1 `bash "$MAIN/.claude/hooks/pipeline-advance.sh" status` rc 0;
  - S2a `bash "$MAIN/.claude/hooks/require-pipeline.sh" < "$S/smoke-write.json"; echo "rc=$?"` -> `rc=2` with a `.git`
    message; S2b same for `bash-code-guard.sh` with `smoke-bash.json` -> `rc=2`;
  - S3 Write tool to `$S/smoke.txt` succeeds;
  - S4a phase-gate with `smoke-agent-researcher.json` -> rc 0; S4b with `smoke-agent-coder.json` -> rc 0 (the
    coder installs in phase `coder`; rc 2 here means the team check blocks the team's own role: restore at once);
  - S5 (from step 6 on) phase-gate with `smoke-agent-uxr.json` -> rc 2 and the message names team `design` and tier
    `PIPELINE` team `dev` (proves the team check live);
  - S6 (from step 4 on) phase-gate with `smoke-agent-misdir.json` -> rc 2, message "does not exist at that exact
    path" (proves the identity check live; before step 4 the old gate decides it by the curriculum-architect window
    alone, rc 2 outside `architect..judge_design` and rc 0 inside, so it proves nothing then and is not run earlier).
- **P7** `bash "$MAIN/tests/pipeline/run.sh"` on the live tree ends `0 failed`.

### 9.2 Recovery

| Observation | Cause | Action (next call, nothing first) |
|---|---|---|
| S1 blocked, S3 succeeds | `hookio.py` (the shell guard calls `hookio field`; the Write gate does not import it) | Read the backup, Write its full content to `$MAIN/.claude/hooks/lib/hookio.py` (the one allowed in-place write), re-run P6 |
| S3 blocked, S1 succeeds | not expected from this task's files (the Write gate imports only `cfg.py`, which would also close S1) | `. "$S/env.sh"; cp -p "$B/<file>" "$MAIN/<f>.install" && mv -f "$MAIN/<f>.install" "$MAIN/<f>"` for the file installed last, re-run P6 |
| S1 and S3 blocked | `cfg.py` (F1) or a malformed `pipeline.json` (F4): every gate crashes | stop; report the file and the backup path; Stepan uses the kill switch (CLAUDE.md section 7), then in his terminal `cp -p <backup>/<file> <f>` (or `git restore --source=HEAD -- <f>` when the file is unchanged since the last commit), removes the kill switch, starts a new session |
| S2 rc 0 or 127 | fail open | restore the file installed last by Bash cp+mv at once, re-run P6, record in the test report |
| S4a or S4b rc 2 after step 3 or 4 | identity or team check blocks the team's own role | restore `phase-gate.sh` (step 4) or `hookio.py` (step 3) from the backup by Bash cp+mv, re-run P6, report |
| S5 rc 0 or S6 rc 0 | check not live | restore the file installed last, re-run P6, report |
| P7 red on the live tree after P4 green | live-only difference (state, worktrees) | restore the file installed last by Bash cp+mv, re-run P6 and P7, report |
| any other smoke red after any hook step | the file installed last | restore the file installed last by Bash cp+mv, re-run P6, report |

### 9.3 Steps

The coder commits once per step, as in #23: `git add <explicit paths>` and `git commit` with the subject below and a
body ending `Refs #27`, after the step is green on P4/P7. Never `git add -A`: the uncommitted `.github/CODEOWNERS`
stays out until Stepan's step 11.2. No AI attribution. `Closes #27` goes into the PR body, not a commit.

1. `feat(agents): add the design team role files` - `.claude/agents/design/` (six roles, `_contract.md`), three
   seeded mistakes files. Always-writable, inert for gates (directory unknown to `hookio` until step 3; no gates).
2. `feat(pipeline): add a cfg query for a tier's team` **[shared]** - `cfg.py`. P1-P7.
3. `feat(pipeline): resolve spawned roles against the agent tree` **[shared]** - `hookio.py` (regex, `agent_index`,
   `role_spec`, `role_from` sentinel rule, `role_team`; legacy `role` kept, printing the file for sentinels too). P1-P7.
   Live effect: design prompts recognized; misnamed directories now resolve to the real basename for the old gate
   (stricter); a mis-pathed judge's vote is no longer counted; nothing gated by team yet.
4. `feat(pipeline): spawn gated roles only in tiers of their own team` - `phase-gate.sh` (identity check, team check);
   rows T1, T2, T5, T7-T11, T13-T19 in `run.sh` (written in `$EXP` first, then copied to `$MAIN` with the Edit tool
   after install; `tests/` is product, writable in the active pipeline). P1-P7, S4b and S6 mandatory.
5. `refactor(pipeline): drop the unused hookio role command` **[shared]** - `hookio.py` (command and docstring).
   P1-P7.
6. `feat(pipeline): add the DESIGN tier` **[shared]** - `pipeline.json`; rows T3, T4, T6, T12, D0-D17 with D7b, S1;
   S5 smoke. P1-P7.
7. `feat(design): token validator for design deliverables` - `scripts/design_tokens.py`, `tests/design/`,
   `ci.yml` (`design` job, second mypy step in `pipeline-types`). Not core; run the unit tests on 3.9.6 and both mypy
   invocations (3.2) before handing over.
8. `docs(design): design/dev contract adr-0006 and the design directory` - ADR-0006, ADR-0005 amendment,
   `docs/architecture.md`, `design/README.md`, `dev/tester.md`, `dev/judge-architecture.md`.
9. `docs(pipeline): document the design team and DESIGN tier` - CLAUDE.md, README.md, package.json, state_machine.md,
   PR template, labels.yml, `ISSUE_TEMPLATE/design.yml`, `.claude/feedback/judge_must_be_spawned.md`.
10. `chore(pipeline): record the #27 plans and review lessons` - orchestrator, in the `commit` phase after `compound`
    (so compound's lessons are included): `plans/27-*.md` and every changed `.claude/feedback/*.md`, by explicit
    paths. After it, `git status --porcelain` lists only `.github/CODEOWNERS` (until 11.2) and nothing else; any
    other line is committed or explained before `pr`.

## 10. Rollback

- **Before merge, order**: revert steps 9, 8, 7, 6, 5, 4, 3, 2, 1 (reverse; step 10 holds records and is not
  reverted). Reverting 3 before 4 would leave `phase-gate.sh` calling `role_team` that no longer exists (crash ->
  block for every Agent spawn); reverting 1 before 6 would leave gates naming design files that do not exist (S1b
  red, design roles unspawnable with a `role-path` denial). Each revert commit body ends `Refs #27`, because `pr`
  checks the last commit.
- **Core steps (2, 3, 4, 5, 6) are not reverted with `git revert`** in a session: git rewrites the live file in place
  (unlink and write), and a hook that fires in between can read a missing or partial file; a missing hook script exits
  127, which Claude Code does not treat as a block (fail open). Instead, per step, newest first: 9.1 P1 export; P2
  `git -C "$MAIN" show "<sha>^:<f>" > "$EXP/<f>"` for each file of the step; P3-P4 in scratch; P5 atomic install; P6;
  then `git -C "$MAIN" commit -m 'Revert "<subject>"' -m 'This reverts commit <sha>. Refs #27' -- <files>`. Run in
  a scratch clone on 2026-10-29: `show` rc 0, install rc 0, commit rc 0, `git diff --quiet <sha>^ HEAD -- <f>` rc 0,
  clean tree.
- **Non-core steps (1, 7, 8, 9)**: `git revert --no-commit <sha> && git commit -m 'Revert "<subject>"' -m 'This
  reverts commit <sha>. Refs #27'` (files outside the hook core; a partial write is harmless there).
- **Reverting step 6 while a DESIGN pipeline is active**: first `bash .claude/hooks/pipeline-advance.sh pause` in that
  checkout (allowed for non-LEARN tiers); a parked state with an unknown tier is inert for every gate.
- **After merge** (the squash commit `<sq>` is on main), Stepan, in his own terminal, with no Claude Code session open
  in any checkout of this repo (worktree sessions forward to the main checkout's hooks, so none may run while git
  rewrites hook files):
  1. `git worktree list`, then in each checkout `bash .claude/hooks/pipeline-advance.sh status`; `pause` any active
     DESIGN pipeline there (and `parked` shows existing DESIGN keys, removed after the revert merges).
  2. `git switch main && git pull --ff-only`, then `git switch -c fix/27-revert-design-team`.
  3. `git revert --no-edit <sq>`; then `git commit --amend -m "fix(pipeline): revert the design team and DESIGN tier"
     -m "This reverts commit <sq>." -m "Refs #27"`. Direct `git revert` is safe here because no session runs, so no
     hook can fire during the rewrite.
  4. `git push -u origin fix/27-revert-design-team`; `gh pr create --title "fix(pipeline): revert the design team
     and DESIGN tier" --body "Refs #27"` (passes `pr-hygiene.yml`: conventional title, `refs #27`, branch
     `fix/27-...`); CI green; squash merge.
  5. Any `design/` deliverables made after #27 by DESIGN tasks go with their own revert, not this one.
- No new runtime files, state fields or log formats; `design/` and the validator are plain files.
- Lockout during the work: CLAUDE.md section 7 kill switch, then restore as in 9.2.

## 11. Steps for Stepan

### 11.1 Before step 2

Quit or pause any other Claude Code session running in a worktree of this repo (its hooks forward to the main
checkout's live files). Check: `git worktree list` from the repo root; today it shows
`.claude/worktrees/keen-blackwell-7013a8` (detached at `8511e8c`): no session may be open there during steps 2-6.

### 11.2 `.github/CODEOWNERS` before the `pr` phase (own terminal, repo root)

The uncommitted edit blocks `pr` (`pipeline-advance.sh:249`) and the Stop gate at `done` (`phase-complete.sh:90`).
No agent stashes, resets or switches branches in this session, so the orchestrator stops before `pr`, asks Stepan to
do one of the two paths below, and continues only when `git status --porcelain` prints nothing. Every command below
was run in a scratch clone on 2026-10-29 with the exit codes shown (the GitHub merge itself was simulated by moving
the clone's `main`; `git fetch origin main:main` was run against a second clone).

**Preferred: commit the edit on main through its own PR, then bring the branch up** (CLAUDE.md section 7, step 2).
Run it while the orchestrator is idle at a phase boundary; it touches only `.github/CODEOWNERS` in the checkout.
1. Optional: add the `/design/` owner line in the main checkout now (so the copy and main stay identical for the
   check in 6): `printf '%s\n' '/design/ @valmlord' >> .github/CODEOWNERS`.
2. `git worktree add .claude/worktrees/codeowners-27 -b chore/27-codeowners-login main` (rc 0).
3. `cp -p .github/CODEOWNERS .claude/worktrees/codeowners-27/.github/CODEOWNERS`
4. `git -C .claude/worktrees/codeowners-27 commit -m "chore(github): set the codeowners login" -m "Refs #27" --
   .github/CODEOWNERS` (rc 0). Check: `git -C .claude/worktrees/codeowners-27 diff --name-only main HEAD` prints only
   `.github/CODEOWNERS`.
5. `git -C .claude/worktrees/codeowners-27 push -u origin chore/27-codeowners-login`;
   `gh pr create --head chore/27-codeowners-login --base main --title "chore(github): set the codeowners login"
   --body "Refs #27"` (title, body and branch satisfy `pr-hygiene.yml`); CI green; squash merge on GitHub.
6. `git fetch origin main:main` (rc 0; fast-forwards local `main` without checking it out; `main` is checked out in
   no worktree). Check: `git diff --quiet main -- .github/CODEOWNERS; echo $?` prints 0 (the local edit is exactly
   what main now has; 1 means they differ: stop and compare, do not restore). Check: `git diff --name-only
   HEAD...main` prints only `.github/CODEOWNERS` (nothing else moves, no hook file).
7. `git restore .github/CODEOWNERS` (rc 0). Check: `git status --porcelain -- .github/CODEOWNERS` prints nothing.
8. Bring-up (CLAUDE.md section 7, step 2; precondition: shared history, `git merge-base main HEAD` prints a commit):
   `git merge-base --is-ancestor main HEAD; echo $?` prints 1; `git cherry main HEAD | grep -c '^-'` prints
   0; then `git merge --no-edit -m "chore: merge main into feat/27-design-team" -m "Refs #27" main` (rc 0). The
   `Refs #27` line keeps `pr`'s last-commit check satisfied if the merge ends up as the last commit.
9. Checks: `git status --porcelain` prints nothing (once step 10 of 9.3 is committed); `git merge-base --is-ancestor
   main HEAD; echo $?` prints 0; `git log -1 --format=%B | grep -cE '#27\b'` prints 1 or more.
10. Cleanup after proof (b) of CLAUDE.md section 7: `git rev-parse chore/27-codeowners-login` equals the line printed
    by `gh pr list --repo valmlord/academy --head chore/27-codeowners-login --state merged --json headRefOid --jq
    '.[].headRefOid'`; then, in the worktree, `bash "$(git rev-parse --path-format=absolute --git-common-dir)/../.claude/hooks/pipeline-advance.sh" parked`
    (parked states go with the worktree); then `git worktree remove .claude/worktrees/codeowners-27` (rc 0) and `git branch -D
    chore/27-codeowners-login` (rc 0).

**Alternative: stash it across the end of the pipeline.**
1. Right before the orchestrator runs `pr`: `git stash push -m codeowners-27 -- .github/CODEOWNERS` (rc 0). Check:
   `git status --porcelain` prints nothing.
2. After the orchestrator reports `DONE` (its Stop at `done` passed and the state is gone):
   `git stash list | grep -c codeowners-27` prints 1; `git stash pop "stash^{/codeowners-27}"` (rc 0). Check: `git status --porcelain` prints
   ` M .github/CODEOWNERS`. The edit then still needs its own commit later (the preferred path, from step 1).

### 11.3 After merge (own terminal, from `/Users/stepankorshukov/Documents/Projects/academy`)

- Labels on GitHub, one command each (no apostrophes in the literals):
  `gh label create team:design --color f9d0c4 --description "Design team pipeline"`
  `gh label create tier:design --color fbca04 --description "Pipeline tier"`
  `gh label create area:design --color ededed --description "design/"`
  Check: `gh label list --limit 200 --json name --jq '.[].name' | grep -c ':design$'` prints 3 (`gh label list`
  returns 30 labels by default and the repo has 31; run on 2026-10-29 it printed 0 with grep rc 1, as expected before
  the labels exist). If one exists already, `gh label create` fails with "already exists": skip it.
- Remove the grant for #27 as CLAUDE.md section 7 describes once the PR is merged.

### 11.4 Decisions to confirm or override

Section 7 items 1-8 are defaults. The ones that change the build if overridden: 1 (no hook change, leak stays), 2
(no validator: drop step 7 and rewrite the judges' "computed" rule), 3 (a `design` type: two regexes in
`pr-hygiene.yml` plus CLAUDE.md section 2).

## 12. Changelog (revision 1 -> 2)

| Finding | Where fixed |
|---|---|
| S1 / A1 (team from the prompt's claim; `re.I` case variant; `dev/ux-researcher.md`) | 1.1 item 1; 2.1.2 (`agent_index`, `role_spec` rules 2-3, `!path`); 2.1.3 step 2; ADR-0005 item 10 text (2.9); CLAUDE.md "Hooks enforce" text (2.11); rows T9 (reason now `role-path`), T10, T11, T12, T13, T14, T19, D7b; S1a pattern and case-folded uniqueness; F7, F17, F19; S6 smoke; alternatives |
| S2 (prompt role plus a different `subagent_type`) | 2.1.2 rule 4 (`!type`, case-folded type lookup); 2.1.3 step 2; ADR-0005 item 10; rows T15, T16, T17, T18; F18 |
| S3 (external resources too narrow) | 2.7 URL rule; 2.8 step 6 URL scan; tests iframe, srcset, fetch/WebSocket, `<a href>`/`xmlns` allowed, `ping`, JS comment, CSS `url()`/`@import`; F20; alternatives |
| A2 (`tokens.css` contract for prototypes) | 2.7 value classes, visible variables, proto aliases; 2.8 steps 2, 3, 6; ui-designer and product-designer checklists (2.4); seed (2.6); tests non-colour, named/rgb value, `@theme`-only name, alias equality; F21; alternatives |
| A3 (no test for the text threshold and others) | 2.8 test table: muted-foreground 4.349 FAIL, 4.542 PASS, ring 3.234 PASS, required token absent from both, extra top-level rule, exit 2 on unbalanced braces, external `url()`/`@import` |
| A non-blocking: judge-usability round | 2.5 common (Read of the state file's `phase`, as `dev/judge-architecture.md:23`, all three judges) |
| A non-blocking: `judge_must_be_spawned.md` | 2.11; step 9 |
| A non-blocking: S1b `_` keys | 3.1 S1b and its mutation |
| A non-blocking: `Status: ready` | 2.3, 2.4 product-designer, 2.5 common, 2.7 `Status`, ADR-0006 item 2, 2.10, decision 14 |
| A non-blocking: unique `F<flow>` ids | 2.4 ux-researcher grammar and registry; 2.7 tree; 2.8 step 7; 2.5 usability; two tests |
| A non-blocking: raw-hex scan on declaration values only | 2.8 step 6; `test_id_selector_is_not_a_color`; F20 |
| A non-blocking: tokens change only through DESIGN; drift check vs shadcn CLI | ADR-0006 items 1 and 6 (2.9); ui-designer rules |
| A non-blocking: destructive button pair | 2.4 ui-designer, 2.5 accessibility judge_ux, 2.10 tester |
| A optional: `type:` label | 2.11 `design.yml` (`type:feature`) |
| O1 (CODEOWNERS blocks `pr` and Stop) | 11.2 (both paths, commands, checks, exit codes from a scratch run); 9.3 preamble and step 10 (plans and feedback committed); 5; F22; decision 4 |
| O2 (recovery table) | 9.2 rows 1 (`hookio.py` only) and 3 (`cfg.py` or malformed `pipeline.json`), cause column, S4/S5/S6 rows |
| O3 (shellcheck, mypy not on this Mac) | 3.2 and 9.1 P3: docker commands, run with rc 0 |
| O4 (commits and rollback) | 9.3 preamble (one commit per step); 10 (order incl. step 1 after 6, core reverts by atomic install plus explicit-path commit, run in scratch; non-core reverts; after-merge revert PR with DESIGN pause) |
| O5 (label check) | 11.3 (`--limit 200`, `grep -c ':design$'`, run today: 0) |
| O6 (test file under mypy strict) | 2.8 test import and CI second mypy step; 3.2; 9.3 step 7 |
| Worktree note | 11.1 names `keen-blackwell-7013a8` |
