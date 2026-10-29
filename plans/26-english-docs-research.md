# #26 research: translate the repo and GitHub text to English

Read-only findings at e7c4b97 against live GitHub data.

## Inventory
- `backlog/*.md`: 20 files (not 23). 01-14 -> issues #1-#14, 20-25 -> #15-#20. Each issue = backlog
  title, body + `"\n\n_Imported from \`backlog/<file>\`._\n"`, milestone, labels (verified byte-identical).
- `README.md` (lines 3-61 Russian prose) was missing from the original scope.
- `docs/architecture.md`, `docs/adr/0001`-`0004`: pure prose.
- `docs/learning-process.md`: entirely Russian. Sections "## 1." to "## 6." are cited by number from
  `plans/15-*` and PR #24 ("section 3"): keep the numbering.
- `docs/course-reference.md`: heading, intro, one-line descriptions, the "Result:" lines and the "Our amendments" section
  are prose. Hexlet program name (equal to `course.yaml` `title`) and the six module headings equal
  `course/ai-for-developers/*/module.yaml` `title`. Bullet lists are transcribed from Hexlet's Russian page.
- `.github/ISSUE_TEMPLATE/feature.yml:10`: the user-story placeholder ("As the learner, I want ..., so that ...").
- Out of scope: `course/`, `learner/*`, `plans/15-*`, `.claude/feedback/*`, quotes in
  `.claude/agents/*` (mentor.md:35, lesson-author.md:35, content-researcher.md:24).
- No in-scope file has em dashes, en dashes or curly quotes today.

## GitHub
- Milestones (number = title): 1 M0 (foundation), 2 M1 (workspace), 3 M2 (learning loop),
  4 M4 (comfort), 5 M3 (course), titled in Russian. Open, no descriptions.
- Issue #21 (closed): ~16 Russian lines (user story, the "state drifts apart" paragraph, the "what #15 shows" list,
  acceptance criteria, notes). Embedded English error strings stay verbatim. Its comment is English.
- PR #24 title quotes module.yaml title; body lines 5, 28, 29, 36 quote course text (the hint level and
  hint command names, an outcome phrase and a lesson phrase). PRs #22, #25 and issues #22, #23 are English.
- No Russian in any issue/PR comment or review.

## Dependencies
- `scripts/github_bootstrap.py` matches milestones and issues by title and never edits. Renaming on one side
  only makes a rerun create duplicates. `parse_value` reads quoted titles with `json.loads`: inner quotes stay
  escaped `\"`.
- Module ids are English already: introduction, spec-driven-development, agentic-patterns,
  subagent-orchestration, final-project, legacy-code.
- No references to milestone names or backlog titles outside backlog/. No markdown anchors linked anywhere.
- CI reads none of the in-scope files' content. `tests/pipeline/run.sh:275` uses the path
  `docs/adr/0002-workspace-runtime.md`: do not rename files.
- `pr-hygiene.yml` runs on `edited`: PR #24 title must keep `content(intro): ...`, body keeps `Closes #15`.
- ADR-0002 status "Proposed (refined in the LEARN task ...)" points to backlog 05 which promises
  "ADR-0002 moved to Accepted": keep both consistent.

## Glossary (English target terms)
learner (never "student"); methodologists; workspace; workspace service; workspace image;
lesson/module/course; check; grader; attempt; submission; mentor review; hint ladder (question -> direction ->
skeleton -> direct explanation); dashboard (not "cabinet"); sign-in; reference solution; weak topics;
journal; judges; tier; transcript; harness; reasoning effort; context engineering; skills; cheating attempt.
Milestones: M0 Foundation, M1 Workspace, M2 Learning loop, M3 Course, M4 Comfort.
Style: no em dashes, straight double quotes, "->" for arrows.

## Orchestrator decisions on the open questions (defaults; Stepan may override)
1. course-reference bullet lists: translate; module headings keep the Russian title with the English name.
2. Module names in titles: English only in titles (`content: module "Introduction to AI-assisted
   development"`); the Russian module.yaml title is quoted in the body as the learner-facing name.
3. UI labels with no UI yet (check button, terminal/editor/agent tabs): translate. Hint commands the
   learner types and lessons already quote ("подсказка", "скелет", "скажи прямо"): keep in quotes with English.
4. #26 body fixed (20 files, README added).
5. "M4 Comfort".

## Update from Stepan (relayed by the sibling session)
- After this PR and #25 merge, main is squashed into a fresh root commit and force-pushed by Stepan.
- Issues: recreate in English rather than edit (GitHub keeps edit history). Deleting old issues is Stepan's
  (`gh issue delete`); prepare the commands. Merged PRs (#22, #24, #25): edit to English.
- CLAUDE.md section 7 SHA references: pending Stepan's direct confirmation.
