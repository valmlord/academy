TEST REPORT (#27) - PIPELINE tier, phase tester

System under test: hook pipeline, `scripts/design_tokens.py`, CI config. No Docker Compose stack or web app
is involved, so pnpm lint/typecheck/test, content:validate, stack, integration and e2e do not apply. The
design conformance step does not apply either, because `apps/web` does not exist yet.
Scratch dir: `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/346534b8-2d38-4a32-8e29-767f6204b671/scratchpad`
(below `$S`). Export of the committed tree: `$S/exp.43qz7N` (`git archive HEAD | tar -x`).
The live tree was not modified: `git diff --quiet HEAD -- .claude/hooks .claude/pipeline.json scripts tests` returned 0.

lint/typecheck: ok (mypy strict 8 + 2 files, shellcheck -S error rc 0)
unit: validator 44 passed / 0 failed (3.9.6 and 3.12.16); pipeline self-test 268 passed / 0 failed
content: n/a | stack: n/a | integration: n/a | e2e: n/a | design: n/a (no apps/web)

## 1. Full run.sh, live tree and committed export: PASS
- Live: `PATH="/usr/bin:$PATH" bash tests/pipeline/run.sh` gives `pipeline self-test: 268 passed, 0 failed`, rc 0, wall 170 s.
- Export: `bash $S/exp.43qz7N/tests/pipeline/run.sh` (cwd /) gives `268 passed, 0 failed`, rc 0, wall 172 s.
- Both are under the 3:30 budget of design 3.1.

## 2. Validator tests, mypy, shellcheck, CI wiring: PASS
- `/usr/bin/python3 -m unittest discover -s tests/design -v` on 3.9.6: `Ran 44 tests ... OK`, rc 0.
- Docker `python:3.12-slim` (3.12.16) on the export: `Ran 44 tests ... OK`, rc 0.
- mypy, run with the exact design 3.2 docker command on the export: `Success: no issues found in 8 source files`,
  then `Success: no issues found in 2 source files`, rc 0, 9 s.
- shellcheck, run with the exact design 3.2 command (`--network none`, phase-gate.sh plus run.sh): rc 0. The full CI
  file set (`.claude/hooks/*.sh .claude/hooks/lib/*.sh tests/pipeline/run.sh`, 12 files) also gives rc 0.
- `.github/workflows/ci.yml`:
  - The new `design` job has three steps: checkout, `python3 -m unittest discover -s tests/design -v`, then the
    `if [ -f design/system/tokens.css ]` step. There is no `|| true` and no `continue-on-error` (grep finds nothing).
  - Default `bash -eo pipefail` applies. In the if-branch, `python3 -I scripts/design_tokens.py check design` is the
    last command, so its exit status propagates.
  - Paths are correct. The second mypy step in `pipeline-types` sets `MYPYPATH=scripts` and uses its own cache dir.
  - A zero-test run fails: in docker 3.12, an empty dir gives `NO TESTS RAN` and rc 5. ubuntu-24.04's system
    python3 is 3.12.
  - The skip is necessary: `check design` on the current tree gives `ERROR design/system/tokens.css:0: missing ...`
    with rc 1, so without the guard the job would be red today.

## 3. Live gate checks (state PIPELINE/tester): PASS
Inputs were written with the Write tool to `$S/gate/cases.txt` and piped into `.claude/hooks/phase-gate.sh`
(cwd = repo). The log reason comes from the last line of `.git/pipeline-hooks.log`. Allowed calls write no log line.

| Case | rc | Log reason / message |
|---|---|---|
| design/ux-researcher.md | 2 | `team:ux-researcher.md`, "ux-researcher.md is a design role; tier PIPELINE belongs to team dev." |
| design/product-designer.md | 2 | `team:product-designer.md` |
| design/ui-designer.md | 2 | `team:ui-designer.md` |
| subagent_type product-designer, no Read line | 2 | `team:product-designer.md` |
| dev/curriculum-architect.md (wrong path) | 2 | `role-path:curriculum-architect.md`, "the prompt names a role file that does not exist at that exact path; ..." |
| content/curriculum-architect.md | 2 | `team:curriculum-architect.md`, "is a content role; tier PIPELINE belongs to team dev." |
| dev/tester.md + subagent_type coder | 2 | `role-type:tester.md`, "subagent_type names a different agent than the prompt's role file; give one identity." |
| dev/tester.md | 0 | allowed |
| dev/tester.md + subagent_type tester | 0 | allowed |
| plain prompt, subagent_type Explore | 0 | allowed |
| design/judge-usability.md | 2 | `not-a-judge:judge-usability.md` |

## 4. Mutations in scratch copies: PASS (every mutant went red)
Each mutant is a copy of the export (`$S/mut_<row>`, `$S/mutv`). The live tree and the export were not touched.
The validator copy was restored and `diff -q` against the original shows no difference.

run.sh mutants (full suite each):

| Row | Mutation | Result |
|---|---|---|
| T10 | hookio.py:157 `return TEAM_BAD_PATH, ...` changed to `return claim[0], ...` (rev 1: team from the prompt) | 261/7. T10 rc 0 (want 2); T9, T11, T12, T13, D7b and D7 also red |
| T15 | hookio.py:158 `if sub and sub != claim:` changed to `if False and ...` | 266/2. T15 rc 0 (want 2), T17 red |
| D7b | hookio.py:166 `role_from` returns `role_file` for sentinels | 266/2. D7b votes `usability:FAIL` recorded; D7 red |
| D13 | DESIGN judges reduced to `[usability, accessibility]` | 265/3. D13 rc 0 (want 1), D13b, D7 red |
| S1 | `cp dev/coder.md design/coder.md` | 266/2. S1 prints `FAIL a basename coder.md ...`, `FAIL a frontmatter name coder ...`, `FAIL b coder.md in 2 team directories`; T16 also red (the name `coder` resolves to design/coder.md first) |

Validator mutants (`/usr/bin/python3 -m unittest discover -s tests/design`):

| Mutation | Red tests |
|---|---|
| `TEXT_MIN_RATIO = 4.3` | `test_muted_foreground_below_text_minimum_fails` (the 4.349 case), `test_text_pair_just_above_minimum_passes` |
| srcset `split(",")[1:]` changed to `[:1]` | `test_protocol_relative_srcset_is_an_error` (second-candidate fixture) |
| `@theme inline` names added to `visible` | `test_theme_inline_only_name_is_undefined_in_prototype` |
| `if False and name in token_names` (token redeclaration) | `test_prototype_redeclaring_a_token_is_an_error` |
| `over()` ignores alpha | `test_translucent_border_composited_over_dark_background` |

## 5. Validator end-to-end on a scratch design/ tree: PASS
- CLI: `design_tokens.py check <design-dir>` and `pair <fg> <bg>`. With no arguments, or `check` without a dir, it
  prints usage and exits 2.
- Tree `$S/e2e/design`:
  - `tokens.css` has the required order: @custom-variant, :root, .dark, @theme inline. It holds shadcn neutral oklch
    values, except ring/input `oklch(0.6 0 0)` and muted-foreground 0.5.
  - `proto.css` has a `:root` alias `--radius-sm` equal to its @theme value.
  - `pages/catalog/prototype.html` contains an `<a href="https://...">` and data-steps F1.1 and F1.2. The page also
    has `acceptance.md`, and the flows are in `flows/learn.md` and `ia.md`.
- First run with shadcn's stock destructive values gives rc 1:
  `ERROR ... :root --destructive: oklch(0.577 0.245 27.325) is out of sRGB gamut`, and the same for
  `.dark oklch(0.704 0.191 22.216)`. The linear channels are (0.800, -0.0094, 0.0033) and (1.0127, 0.127, 0.136),
  so this is real, as design 2.8 step 4 specifies. See observation O1.
- Passing run: destructive changed to `oklch(0.55 0.2 27)` / `oklch(0.7 0.16 22)` gives rc 0, 20 PASS lines and 2
  INFO lines (border 1.260). The anchor href is allowed.
- Failing run (`$S/e2e/fail`): muted-foreground 0.7, `<img src="https://cdn.example/a.png">`,
  `srcset="a.png 1x, //cdn.example/b.png 2x"`, `style="color: var(--color-primary)"`, `var(--radius-md)` in
  proto.css, and `data-step="F1.7"`. Result rc 1:
  ```
  FAIL :root --muted-foreground on --muted: 2.457:1 (min 4.5:1)
  FAIL :root --muted-foreground on --background: 2.679:1 (min 4.5:1)
  ERROR .../prototype.html:15: absolute URL 'https://cdn.example/a.png"': design files load nothing from the network
  ERROR .../prototype.html:15: srcset candidate '//cdn.example/b.png 2x' is a network URL
  ERROR .../prototype.html:15: --color-primary is defined only in @theme inline, which browsers ignore; declare it in proto.css :root with the same value
  ERROR .../system/proto.css:8: undefined variable --radius-md
  ERROR .../prototype.html:15: data-step F1.7 names no declared flow step
  ```
- `pair`:
  - `pair "oklch(0.922 0 0)" "oklch(1 0 0)"` gives 1.260 and `pair "oklch(0.708 0 0)" "oklch(1 0 0)"` gives 2.584.
    These match the seed claims.
  - `pair notacolor "#fff"` gives an ERROR line and rc 2.

## 6. Static review: PASS
- Frontmatter, parsed with a script over `.claude/agents/**`:
  - All six design role files have `name` equal to the file stem, a `description` and a `tools` YAML list, with no
    `model` or `isolation`. Tools match design 2.4/2.5; judge-usability has no Bash.
  - The 22 named agents have no duplicate names and no duplicate basenames across directories.
  - `_contract.md` has no frontmatter, the same as `content/_contract.md` and `dev/_learn-mode.md`. This is correct:
    it is not an agent and the index excludes `_` files.
- Judges:
  - The three design judges use the judge-security response format: `PASS - ... Checked: ...` or
    `FAIL - N issues found:` with `[file:line]` items.
  - Their FAIL procedure names the three design mistakes files plus the orchestrator and judge files.
  - `hookio.verdict_from` returns PASS for both "PASS - no usability issues found. Checked: ..." (also as the last of
    several lines) and "PASS - no accessibility ...", and FAIL for "FAIL - 2 issues found:\n1. ...".
- `pipeline.json`:
  - DESIGN has team design, requires_issue true, the phases of 2.2 and judges [usability, accessibility, consistency].
  - The three `agent_gates` and three `judge_agents` entries are exactly as 2.2 lists them.
  - `cfg.py team DESIGN` prints `design`, and `team NOPE` prints an empty line with rc 0.
- CLAUDE.md:
  - Line 3 now says "three". Section 1 is "Three teams", with a design row and a design/dev contract paragraph.
  - Section 2 step 3 names the `docs` type. Section 3 has the DESIGN row and a "Design tier" column, and the "Hooks
    enforce" bullet is updated.
  - Section headings 1-7 are unchanged in number and title (except "Three teams"). The hooks still quote
    "CLAUDE.md section 7", and section 7 is still "Checkouts, pause/resume and the grant".
- ADR-0006: `- Status: Proposed`.
- Language over the 28 files changed in main..HEAD: `rg '[а-яА-ЯёЁ]'` and the em-dash search both give rc 1 (no
  hits).
- Commits:
  - 9 commits, all by `Stepan Korshukov <korshukovstepan@gmail.com>`.
  - No Co-Authored-By, no "Generated" footer and no AI attribution. The only "Claude" hits are the file name
    `CLAUDE.md`, `.claude` paths, and one technical mention in 598ea55 ("a stray .md that Claude Code would register
    as an unknown agent"). That line names the tool and is not attribution; see O4.
  - The last line of every commit body is `Refs #27`.
- `.github/CODEOWNERS` appears in no commit of main..HEAD (count 0).

## 7. Uncommitted files: PASS
`git status --porcelain` lists exactly 10 entries:
- modified `.claude/feedback/agent_roles_mandatory.md`, `architect_mistakes.md`, `judge_must_be_spawned.md` and
  `.github/CODEOWNERS`;
- untracked `ux-researcher_mistakes.md`, `product-designer_mistakes.md`, `ui-designer_mistakes.md` and the three
  `plans/27-design-team*.md` files.

Content review:
- Each seed opens with "Seeded with design-discipline rules; append real lessons as they are found" and has three
  `### Seeded:` entries, each with a `Rule:` line. None has an invented date or incident. Topics match design 2.6.
- The ui-designer seed numbers (2.584, 1.260) were confirmed by `pair`.
- `agent_roles_mandatory.md` fixes the missing team dir (`dev/judge-security.md`, `<team>/<role>.md`), which is
  plan note 10.
- `judge_must_be_spawned.md` adds the "Design tier (DESIGN)" block with the three judge spawn lines.
- `architect_mistakes.md` appends the three round-1 lessons for #27.
- CODEOWNERS replaces `@OWNER` with `@valmlord`. This is Stepan's own pending edit, left out of the commits.
- The added lines contain no Cyrillic and no em dash.

## Observations (non-blocking, none fails an item)
- O1: shadcn's stock destructive tokens (light `oklch(0.577 0.245 27.325)`, dark `oklch(0.704 0.191 22.216)`) are
  outside sRGB, so the validator rejects an unmodified shadcn copy. This is by design (2.8 step 4, ADR-0006 line 21,
  ui-designer.md:48), but the first DESIGN task will hit it. A seeded line in `ui-designer_mistakes.md` would save a
  round: "shadcn's destructive defaults are outside sRGB; pick an in-gamut value". `pair` does not check gamut: it
  reported 4.770 for the out-of-gamut colour.
- O2: Cosmetic. The absolute-URL message quotes up to 20 characters past the match and includes the closing quote
  (`'https://cdn.example/a.png"'`). The cause is `scripts/design_tokens.py:451-452`, `text[m.start():m.end()+20].split()[0]`.
- O3: The judges' "The last line of your report is the verdict" conflicts with the FAIL template, where numbered
  items follow the `FAIL - N issues found:` line. The parser takes the last line that is a verdict, so FAIL still
  counts. `**PASS** - ...` (bold markers before the dash) parses as UNKNOWN, but that behaviour predates this change.
- O4: Commit 598ea55 mentions "Claude Code" (the product) in its body. It is not attribution. The global
  git-workflow rule says "no mention of Claude ... anywhere in a commit message", so the orchestrator or Stepan may
  want to reword it to "the agent runtime" before push.

Missing tests: none. Every row named in the design was found. T10, T15, D7b, D13 and S1 were each seen to go red,
and the 4.349 threshold, second srcset candidate, @theme-only var, token redeclaration and alpha tests went red too.

STATUS: DONE

## Round 2 re-test (after judge_code round 1: 10f643e, a0cbba9)

TEST REPORT (#27, round 2)
Scratch: `git archive HEAD` export in the session scratchpad (`r2/export`, fresh git init); the working tree was not
touched. Python 3.9.6 = `/usr/bin/python3`; 3.12 = docker `python:3.12-slim`.

1. Diff review + run.sh: PASS
   - `git diff af78873..HEAD`: 7 files, +159/-67. Validator: per-pair line is now `contrast ok|contrast low <theme> ...`
     (module docstring updated to match); `SRCSET_RE` gained an unquoted alternative and `_attr` takes the first
     group that participated; `PROTOCOL_RELATIVE_RE`/`CANDIDATE_URL_RE` accept `/\` and `\/`; the absolute-URL message
     is cut at `URL_TAIL_RE` (no closing quote); the translucent-surface error now carries tokens.css and the token's
     line; loop vars `f`/`v` renamed. ci.yml: design mypy `MYPYPATH=scripts:.claude/hooks/lib`. Judge templates:
     evidence first, `PASS - ...`/`FAIL - N issues found` as the last line. product-designer: proto.js owned by
     ui-designer. No issues found in review.
   - `PATH="/usr/bin:$PATH" bash tests/pipeline/run.sh` -> rc 0, `pipeline self-test: 268 passed, 0 failed`, 165 s.
2. Validator tests + mypy as CI runs them: PASS
   - `/usr/bin/python3 -m unittest discover -s tests/design` -> 48 tests OK, rc 0.
   - docker 3.12: unittest 48 OK rc 0; `pip install --no-deps --only-binary :all: -r tests/pipeline/requirements-typecheck.txt` rc 0;
     `MYPYPATH=.claude/hooks/lib python -m mypy --strict --python-version 3.9 --cache-dir $RUNNER_TEMP/mypy-cache .claude/hooks/lib/*.py`
     -> "no issues found in 8 source files", rc 0; `MYPYPATH=scripts:.claude/hooks/lib python -m mypy --strict --python-version 3.9 --cache-dir $RUNNER_TEMP/mypy-cache-design scripts/design_tokens.py tests/design/test_design_tokens.py`
     -> "no issues found in 2 source files", rc 0.
   - Still fails on error: the same design mypy line on a copy with `def bad() -> int: return "x"` appended -> rc 1
     (`[return-value]`); with the old `MYPYPATH=scripts` it reports 1 error (hookio import not found), so the
     MYPYPATH change is needed. Design job: plain `run:` steps (bash -e), unittest exits 1 on failure (item 4), and
     `check design` is the last command of its `if`, so its rc 1 fails the step.
3. Original bug, `hookio.verdict_from`: PASS
   - Real `check` run on a scratch design/ tree with every contrast pair passing (rc 0, 20 `contrast ok` + 2 INFO lines).
   - New validator output pasted: FAIL report new layout -> FAIL; FAIL report old layout (verdict first, output below)
     -> FAIL; PASS new layout -> PASS; PASS old layout -> PASS. 0 of 22 pasted lines parse as a verdict. Failing-run
     output (item 5) lines: 0 parse as a verdict.
   - Control with the af78873 validator output: FAIL old layout -> PASS (bug reproduced); 10 of 22 lines
     (`PASS :root ...`) parse as a verdict.
   - Template examples in the "Response format" section, each block parsed whole: judge-accessibility PASS/FAIL,
     judge-consistency PASS/FAIL, judge-usability PASS/FAIL, each matching its last line.
4. Mutations (scratch copies, `unittest discover -s tests/design`): PASS
   - Restore `"PASS" if passed else "FAIL"` -> rc 1, 6 failures incl. both VerdictCollisionTest tests. Note: here those
     two go red only through the `assertIn("contrast ok", ...)` precondition in `outputs()`. Stronger mutation
     `"PASS: contrast ok" / "FAIL: contrast low"` (precondition holds) -> rc 1, exactly those two red through their real
     assertions: `votes` has 40 entries; `'PASS' != 'FAIL'` on the pasted-output report.
   - Delete the theme-symmetry loop -> rc 1, `test_custom_color_token_missing_in_dark_is_an_error` red only.
   - Revert `SRCSET_RE` to quoted-only -> rc 1, `test_unquoted_srcset_later_candidate_is_an_error` red only.
   - Revert `PROTOCOL_RELATIVE_RE` + `CANDIDATE_URL_RE` to `//` only -> rc 1, `test_backslash_protocol_relative_src_is_an_error` red only.
5. End-to-end CLI: PASS
   - Passing tree: `python3 -I scripts/design_tokens.py check <tree>` -> rc 0, only `contrast ok` and INFO lines.
   - Failing tree (muted-foreground `oklch(0.556 0 0)`, `<img srcset=a.png,//cdn.example/e.png>`, `<img src="/\cdn.example/f.png">`)
     -> rc 1, with:
     `contrast low :root --muted-foreground on --muted: 4.349:1 (min 4.5:1)`
     `ERROR .../pages/catalog/prototype.html:10: protocol-relative URL: design files load nothing from the network`
     `ERROR .../pages/catalog/prototype.html:10: srcset candidate '//cdn.example/e.png' is a network URL`
6. Commits and files: PASS
   - 10f643e and a0cbba9: author Stepan Korshukov, Conventional Commits subject, body says why, `Refs #27`;
     no match for claude|ai|assistant|co-authored|generated.
   - Changed files (`git diff --name-only af78873..HEAD`): `rg '[а-яА-ЯёЁ]|—'` rc 1 (no match), and also on added lines.
   - `.github/CODEOWNERS` is not in `git diff main..HEAD`; it is still ` M` in the working tree only.

Observation (non-blocking): VerdictCollisionTest guards the exact old regression only through its `contrast ok`
precondition; its own assertions are proven by the stronger mutation above, so no change needed.

Missing tests: none.

STATUS: DONE
