# #42 demo record, part B (practice-designer B): L4 `04-closed-environments`, L5 `05-anti-patterns`

Protocol: design 2.4 (as 00 2.4 with 01 2.4's deltas). Run 2026-10-30 on the authoring Mac.
Scratch harnesses (not committed), `<pd-b>` =
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/pd-b`.
Outputs are saved next to each harness (`*-3.11.out`, `*-3.12.out`).

## Interpreters (carried item S3)
- Ran: `/opt/homebrew/bin/python3.11` (Python 3.11.14) and `/opt/homebrew/bin/python3.12` (Python 3.12.13). Every
  harness below ran on both, with identical verdicts.
- Not available: 3.10 and 3.13 (`/opt/homebrew/bin/python3.1*` holds only 3.11 and 3.12; no `uv`). Substitute
  for 3.10: `ast.parse(source, feature_version=(3, 10))` on `verify_contour.py` passes. The L5 bug-hunt and the
  quizzes have no check script. The image-interpreter rerun is still owed before `ready` (design 12.6 (d)).
- The YAML-to-JSON conversion for the quiz and bug-hunt harnesses used `/usr/bin/python3` (3.9.6, user-site
  PyYAML 6.0.3) as a converter only. Every scorer and matcher ran on 3.11 and 3.12.

## L4 `contour-config` (`checks/verify_contour.py`)
Grader mount `$G` = `checks/` copied without `reference/` and `data/reserve/`; each case on a fresh temp copy; env
built from scratch (`PATH` = interpreter dir + `/usr/bin:/bin`, `HOME` = copy's `home/`), `python3 -I`.

| Step | Command (cwd `<pd-b>/l4`) | Result, 3.11 and 3.12 |
|---|---|---|
| (1) (2) (3) (3b) | `python3.1x -I matrix.py <L4> python3.1x` | 167 cases (round 2): 109 must-fail + 58 must-pass, 73 of them the cases the design names; **unexpected 0**. Each case asserts the exact set of failing ids, exit code and that every stdout line is `не выполнено: <id>: ...` or the success or stop note |
| (1) | untouched starter | exit 1, exactly G1-G7; N1-N4 hold (as task.md says) |
| (2) | starter + `checks/reference/` | exit 0, `Все требования закрытого контура выполнены.` |
| (4a) | `bash probes.sh <L4> python3.1x` | usercustomize on EMPTY starter: without `-I` exit 0 (attack real), with `-I` exit 1 |
| (4b) | same | PATH shim `python3` (exit 0) first on PATH: exit 0 (attack real); fixed PATH: exit 1 |
| shadowing | same | workspace `json.py`, `fnmatch.py`, `re.py`, `sitecustomize.py` that `os._exit(0)`: exit 1 |
| (4c) | n/a | the check runs no learner code |
| (4d) | same | `$G/reference` and `$G/data/reserve` absent; the script reads only `data/contour_spec.json` |

Matrix contents (the per-reason detail is in `matrix-3.1x.out`, never on the learner's screen):
- Must fail, by rule: starter (G1-G7); starter state with only G7 left; G1 x5 (`/v1`, `http://`, other host, a public
  URL in user env over a correct launcher, `/v1/` in project env); G2 x9 (another static token in local env,
  `ANTHROPIC_API_KEY` in launcher, an empty token, the token in a launcher comment, in `docs/notes.txt`, under
  another key in user env, helper missing, another helper command, a local helper over a correct user helper); G3 x3
  (unset, empty user value over launcher `1`, empty in launcher); G4 x14 (`UV_INDEX` alone, settings-env only,
  public `UV_INDEX` in launcher and in user env, public `UV_EXTRA_INDEX_URL`, `UV_EXTRA_INDEX_URL=corp=<mirror>`,
  `[[tool.uv.index]] default = true` in `pyproject.toml`, `home/.config/uv/uv.toml` and root `uv.toml` with
  `default = true` as the only index change, a public default index in user env, `http://`, no `/simple`, a public
  `UV_INDEX_URL` in local env, a second public item in `UV_INDEX`); G5 x7 (unset, `UV_SYSTEM_CERTS` only,
  settings-env only, user `SSL_CERT_DIR` disagrees, wrong bundle, project env disagrees, `SSL_CERT_DIR` naming the
  file); G6 x18 (no deny, only one of the two, `*`, `Bash(*)`, `W*`, `*e*`, `R*`, bare `Bash`, `G*`, `Gre?`, user deny
  `Edit`, `WebFetch(domain:*)`, `WebSearch(*)`+`WebFetch(*)`, env `0`, `false`, `2`, env `1` with WebSearch kept); G7
  x11 (string `"true"`, empty user allowlist, `*.corp.local`, `pypi.org`, `:8443`, user allow
  `WebFetch(domain:*)` and `WebFetch(domain:pypi.org)`, local `enabled: false`, `enabled` unset, `strictAllowlist`
  only in local, `allowedDomains` a string); N1 x2; N2 x6 (all five switches, an on value and `enabled`); N3 x9
  (`export` (+G1), quotes (+G1), duplicate key, spaces around `=`, lower-case key, indented line, trailing space,
  `export` on the SSL line (+G5), launcher missing (+G1 G3 G4 G5 N1)); N4 x11 (trailing comma, NaN, top-level array,
  user file missing, env a string, non-string env value, hooks removed, Stop hook removed, hook timeout changed,
  `disableAllHooks: true` in local and in user only).
- Must pass: reference; URL only in user env; trailing `/`; URL in local env over a public launcher; helper in
  project and in local settings; G3 `0`, `false`, `yes` in user env, project env only; `UV_INDEX_URL` alone;
  `/simple/`; `SSL_CERT_DIR=/etc/corp` and `/etc/corp/`; both SSL variables; `UV_SYSTEM_CERTS` next to
  `SSL_CERT_FILE`; WebFetch off by env `true`, `TRUE`, `On`, `yes` (user env), `1` (project env); `Web*`; user-scope
  deny with project `allow: ["WebFetch"]`; deny in local; bare names plus `WebSearch(*)`; deny `WebFetch` plus env
  `0` (deny wins); extra content rules; `:443`; `pypi.org` left in the project list; user
  `WebFetch(domain:pypi.corp.local)` as the only allowlist; `sandbox.enabled` only in user; `strictAllowlist` also
  in project; project allow `WebFetch(domain:pypi.org)` (ignored under the user strict list); `deniedDomains` and
  `allowUnsandboxedCommands` (not graded); `NODE_EXTRA_CA_CERTS` in user env; empty `CLAUDE_CODE_USE_VERTEX`;
  `CLAUDE_CODE_USE_BEDROCK=0`; `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`; extra keys; CRLF; comments, blank and
  whitespace lines; `UV_INDEX` and `UV_INDEX=corp=` naming the mirror; `UV_EXTRA_INDEX_URL` naming the mirror; an
  empty `UV_INDEX`; uv config files next to a correct launcher (ignored); `hooks: {}` and added hooks in local;
  `disableAllHooks: false`; user `true` under project `false` and under local `false`; local settings with
  unrelated keys.
- Boundary case of revision 5 (design 2.4 (5), row 19): `home/.config/uv/uv.toml` default index as the only change:
  fails G4 (the check never reads uv files).

### L4 quiz `closed-environments-quiz` and its reserve
`python3.1x -I quiz_demo.py <quiz.json> 0.8` (cwd `<pd-b>/l4`; `quiz.json` converted from `quiz.yaml`):
6 questions (4 single + 2 multiple), single positions a, b, c, d (25% each), correct option uniquely longest in at
most 1 question (first run found 3, so three distractors were lengthened, then 0 unexpected); empty 0, key 1.0,
always a/b/c/d, always longest and select-all all below 0.8; analytic random pass 0.1211% per attempt, 0.3628% over
3; Monte Carlo 200k 0.1270% (within 3 SE 0.0233%); adaptive strategy over 3 attempts 0.3745%. Reserve (6 unseen
questions): same rules, 0.1211% / 0.4020% adaptive. **Unexpected 0** on 3.11 and 3.12.

## L5 `anti-pattern-hunt` (`checks/bugs.yaml`)
Starter and key are generated together by `<pd-b>/l5/gen.py` (snapshot files outside `.claude/`, `transcript.md`,
marker ranges) and `keygen.py` (`bugs.yaml`, `checks/reference/findings.json`). Ranges in the `.claude/` files,
which were written by hand, are located by code substring. No line number is typed by hand.
`python3.1x -I hunt_demo.py <L5> bugs.json 6` (cwd `<pd-b>/l5`): **unexpected 0** on 3.11 and 3.12.
- Structure: transcript 229 lines, embedded numbers equal physical lines; 27 ranges, one per item, pairwise
  non-overlapping, inside their files; transcript line 1 (task.md format example) in no range; no range on a
  `.claude/settings.json` hook registration line; 9 planted (memory-bloat 2, prose-rule 2, over-harness 3,
  session-steering 2) and 18 decoys, two per planted range in its look-alike category; `maxReports` 10,
  `maxDecoyHits` 1, `minFound` 6.
- Must fail: `[]`; the untouched starter `findings.json`; right lines with rotated categories; right lines, all
  `over-harness`; shotgun (every 10th line x 4 categories, 116 reports) and that shotgun cut to 10; the hedge (both
  sides of five look-alike pairs: 10 reports, 5 decoy hits); 8 planted + 2 decoy hits; reference + 2 decoy hits;
  11 reports with 9 matched.
- Must pass: `checks/reference/findings.json` (9 of 9); the reference with each item moved to the last line of its
  range (9 cases); the reference + one decoy hit.
- Near misses as designed: the three hook items reported on their `settings.json` registration lines do not match
  (with the other 6: 6 found, pass; one more dropped: 5, fail); the violating code line (`report.py:5`), the agent's
  later action (transcript 59) and the format example (transcript 1) match nothing and hit no decoy; a decoy report
  with the wrong category still counts as a hit; format errors name index and field.
- Enumeration (exact hypergeometric over every allocation of <= 10 reports, blocks 6/6/9/6): the best allocation is
  (1,2,2,2), tied with (2,2,2,1) and (2,1,2,2), at **0.3086% per attempt, 0.9231% over 3**, the same as the design;
  next best 0.2734%. Monte Carlo 200k with the matcher on (1,2,2,2): 0.3125% (within 3 SE 0.0372%).
- Reserve `checks/data/reserve/anti-pattern-hunt.yaml` (excerpt 2, 30 lines; 4 planted, one per category; 4 decoys;
  `minFound` 3, `maxReports` 5): its key passes, 3 of 4 passes, 2 of 4 fails, 3 + one decoy passes, 3 + two decoys
  fails, `[]` fails (run inline with `/usr/bin/python3` + PyYAML, recorded here).

## Deviations from the design and open items
1. L5 prose-rule decoys: two of the design's four ("Import boundaries are enforced by `make check` (A1-A3)" and
   "Reminders skip disputed invoices (REQ-09, tested)") were replaced with "Never copy real customer data into
   fixtures, tests or docs: ..." and "In a pull request description, say why a boundary or an ADR changes, ...".
   Reason: by L1's ladder (2.7 step 2, and L1 R05-R08/R10, where s5 forbids keeping such text), a line whose
   guarantee already lives in a check is removed from memory. A learner who applies the module's own ladder would
   report those two lines as `memory-bloat` and hit 2 decoys, which fails. Every instruction-file decoy now ends at
   ladder step 1 or 7. "Ask before adding a migration" and "Prefer small vertical tasks" are kept.
2. L5 anchor rule (orchestrator relay): for hook and script items, the range is the lines of code that do the work
   (`no_print.py` 14-16, `stop_import_review.py` 20-23, `scripts/review.sh` 7-8; decoys likewise). Registration
   lines in settings.json are in no range; the deny decoy is anchored in settings.json (5-6).
3. L4 G6: `WebSearch(*)` / `WebFetch(*)` and an env `0`/`false`/other value do not remove the tool, but they fail
   G6 only when the tool is not removed another way (a bare-name deny wins, V4). The design's "fail with their
   reason" is read as "do not count". `WebFetch(domain:*)` in deny and any match on a kept tool always fail.
4. L4 form added beyond the design's list and accepted: `SSL_CERT_DIR=/etc/corp/` (same directory). Not accepted: `UV_DEFAULT_INDEX=<name>=<url>` (the design names a
   plain URL), the mirror with an explicit `:443` in its URL.
5. L4 N4: when a settings file does not parse (or the project/user file is missing, or `env` is not an object of
   strings), the check prints N4 plus `Остальные требования не проверялись: сначала файлы настроек должны
   разбираться.` and stops, rather than grading the rest against a half-read state.
6. L4 starter base (done after practice-designer A finished): the L4 starter's code is A's L3 starter with A's L3
   `checks/reference/` overlay (`Makefile` with `check`, `scripts/check_deps.py`, `src/invoices/export_json.py`
   on `json`), without `failure-log.json`, `incidents/` and the rubric-demo files. `CLAUDE.md`, `pyproject.toml`,
   `.gitignore`, `allowed-imports.txt`, `schema/`, `src/`, `tests/` and `scripts/` are byte copies. `.claude/hooks/`
   equal A's (`protect_generated.py` was already identical; `stop_tests.py` now is). `README.md` is A's plus the L4
   `make check` row and the four L4 file lines. The hooks block of A's L3 `.claude/settings.json` equals
   `contour_spec.json` `projectHooks`, the L4 starter's and the L4 reference's hooks (asserted with `==`), so
   `projectHooks` did not change. On the new state: suite `Ran 14 tests ... OK`, `make -s check` exit 0 (python3 ->
   3.12 on PATH), no `checks/`, `fastjsonx`, `incidents` or `failure-log` string in the starter. Rerun: `matrix.py`
   149 cases, 0 unexpected, and `probes.sh` as above, on 3.11.14 and 3.12.13. Mismatches: none.
7. Risk for the student run and the learner: the L4 starter `.claude/settings.json` is live configuration. A Claude
   Code session opened in that workspace applies its `env` after workspace trust, including the planted
   `ANTHROPIC_AUTH_TOKEN` (and any gateway URL or project `apiKeyHelper` the learner adds), and loses its own login.
   Task text or the workspace setup should start the agent so that it does not load this project's settings. This
   needs Stepan or the orchestrator; it is not fixed in the files. In L5, `snapshot/CLAUDE.md` is a nested memory
   file that Claude Code loads on demand when the learner's agent reads files under `snapshot/`.
8. Image checks owed (design 12.6 (d)-(f)): rerun all four harnesses on the image interpreter before `ready`.

## Round 2 (student runs B and C), 2026-10-30, rerun on 3.11.14 and 3.12.13

### L5 (student C, `plans/42-module-agentic-patterns-student-C.md`)
Changed lines (all generated by `<pd-b>/l5/gen.py` and `keygen.py`; earlier versions kept as `*_r1.py`, `*_r2a.py`):
- D1, planted lines reworded away from the theory's examples, line numbers unchanged: `snapshot/CLAUDE.md:7` heading
  `## Layout` (was `## Project structure`); `:49` "ledger code never imports invoices: ..."; `:51` "Before you hand
  over, run `make typecheck`: the release pipeline rejects type errors."; `transcript.md:98` "Подумай над этим
  очень-очень тщательно. ..."; `:120` "Тест падает. Пожалуйста, ожидания в тестах оставь как есть и почини код."
- D1, decoys now carry the same trigger words (still two per planted range, 18 in all): `CLAUDE.md:50` and `:53`
  say "must"; `:54` starts with "Always"; `:59` and `:60` hold capitals (ACME TRADING GMBH, NORDIC PARTNER
  SERVICES); `transcript.md:11`, `:155` and `:180` say "подумай" (ask for a list or name the place, never "think
  harder"); `:166` names "жульничества" while asking for the command, its output and `git diff tests/`;
  `format_edited.py:2` "we prefer ruff's style"; `protect_generated.py:4` "Not a preference ... a claude -p review
  here could let one through"; `Makefile:6` "# Deterministic: the AST import linter, never a claude -p review."
- D2, D3: decoys `:50` "When two ADRs seem to disagree, the newer one must win; name both in your answer." and `:53`
  "When a bug report and the spec disagree, the spec must win; say so, and ask only if the spec is silent." replace
  "Ask before adding a database migration" and "Prefer small vertical tasks". Both are judgements no program can
  decide (ladder step 7). The fixtures and legacy decoys are now stated as facts, not imperatives.
- D4: key stays `prose-rule`; the walk says a rule guarded only by a model review is still prose-rule and lesson 1's
  step 2 does not apply (lesson-author B adds the sentence to theory or task).
- D5: ranges widened: `no_print.py` 2-16 (docstring through the block), `stop_import_review.py` 2-23 (docstring,
  PROMPT, call), `scripts/review.sh` 2-8 (intent comment through both commands). The hook decoys widened the same
  way (docstring through the working lines): `format_edited.py` 2-15, `protect_generated.py` 2-34, `stop_tests.py`
  2-38; `spec-review.yml` 1-17; `Makefile` 6-8. No overlaps.
- D8: the hook entry form `"command": "python3", "args": [...]` is documented in the settings schema of the installed
  Claude Code 2.1.267 (`args`: "Argument list for exec form. When present, `command` is resolved as an executable and
  spawned directly with these arguments, no shell", with `${CLAUDE_PROJECT_DIR}` substituted in every element). Kept;
  modules 01, L1-L4 use the same form. A check of the 2.1.314 hooks page is owed to the content-researcher.

Results, identical on 3.11 and 3.12:
- `hunt_demo.py`: unexpected 0. Enumeration unchanged (block counts did not change): best (1,2,2,2) and its two
  permutations, 0.3086% per attempt, 0.9231% over 3; Monte Carlo 0.3125%.
- Student C's files (`student-c/grade_l5.py`): honest `l5/findings.json` PASS 9/9, 0 decoy hits (unchanged, line
  numbers kept); reference PASS 9/9; c1-c6 fail as before.
- c7 regenerated by `student-c/mk_cheats.py` on the new starter: fail (3 matched, 7 decoy hits). The original
  `c7_lexical_theory_grep.json` still passes (8 matched, 1 decoy): it is a fixed list of line numbers taken from the
  old wording, which on the new text points only at planted lines (with `no_print.py:2` now inside the widened
  range), i.e. a copy of the key, not a lexical attack.
- Broader lexical attacks (`lexical.py`, seven trigger families in English and Russian): all-hits, first 10, strongest
  10 all fail (4 matched, 5-7 decoy hits). `lexical_enum.py`: every deterministic per-family choice (none, first,
  last, all; two category heuristics): **0 of 10,593 and 0 of 10,591 pass** (before the change: 403 of 15,027 and
  397 of 14,531). Blind one-hit-per-family attacker: 0.000% and 0.222% per attempt (before: 9.9% and 13.5%).
- Residual, not built against: the tree dump is the only trigger family with no decoy (`├──` lines); spotting a tree
  dump is the skill itself.

### L4 (student B, `plans/42-module-agentic-patterns-student-B.md`)
- G7 now also requires the effective `sandbox.allowUnsandboxedCommands` (first among local, project, user) to be JSON
  `false`. Fact, from the settings schema of the installed 2.1.267: "Allow commands to run outside the sandbox via
  the dangerouslyDisableSandbox parameter. When false, the dangerouslyDisableSandbox parameter is completely ignored
  and all commands must run sandboxed. Default: true." Research C5 (sandboxing.md, 2.1.314) lists
  `allowUnsandboxedCommands: false` as the strict setting. Reference: `false` in project `sandbox`. Starter: unset,
  so G7 fails (with its planted reasons). This revises design L4 "Not graded" (`allowUnsandboxedCommands`).
- G6: tool-name globs are matched with `*` only (V4); a bare deny entry with `?` or `[...]` removes no web tool and
  fails G6 as undocumented. `fnmatch` is gone.
- N4: the hook scripts `.claude/hooks/protect_generated.py` and `stop_tests.py` must equal the starter's (sha256 in
  `contour_spec.json` `hookFiles`).
- G2: a credential header (`Authorization`, `x-api-key`, any case) in `ANTHROPIC_CUSTOM_HEADERS` in any of the four
  places fails. G4: a `UV_FIND_LINKS` URL whose host is not `pypi.corp.local` fails (local directories pass).
- New matrix cases (18): must fail: `allowUnsandboxedCommands` unset, `true` in local over project `false`, string
  `"false"`; `WebF?tch` + `WebSearch`, `Web[FS]*`, `Web[FS]*` next to the bare names; `stop_tests.py` deleted,
  `protect_generated.py` stubbed; `Authorization` in user env, `x-api-key` on a second header line; `UV_FIND_LINKS`
  to pypi.org, a second find-links item off the mirror. Must pass: `allowUnsandboxedCommands: false` only in user,
  `false` in local over project `true`; a non-credential header; find-links on the mirror host and a local
  directory; `Web*Search` + `WebFetch`.
- Results, identical on 3.11 and 3.12: `matrix.py` **167 cases (109 must-fail + 58 must-pass), unexpected 0**;
  `probes.sh` unchanged ((1) exit 1, (2) exit 0, (4a), (4b), shadowing as above). Untouched starter: exactly G1-G7.
- Student B's `l4/cheat/variants.py` (copy in `<pd-b>/l4/student-b/`, mount replaced by the current `checks/`,
  hook scripts copied into each root, the two no-op variants made real): on the student's own baseline every case
  also fails G7 (the honest workspace lacks `allowUnsandboxedCommands: false`); on that baseline plus the setting,
  every variant gives the documented verdict: `WebF?tch`, `Web[FS]*`, `UV_FIND_LINKS` to pypi.org, the custom-header
  token, deleted hook scripts and the default `allowUnsandboxedCommands` now fail; `pypi.corp.local:443`, `Web*`, user
  deny, `UV_INDEX_URL`, CRLF, `=0` still pass. The variant that replaces the whole project `sandbox` object (project
  `allowedDomains` with pypi.org) now fails G7 because it drops `allowUnsandboxedCommands`, which is correct.

### L4 N4 message (lesson-author B's task.md change)
`verify_contour.py` N4 now prints `не выполнено: N4: файлы настроек разбираются, а хуки проекта остаются на месте и
включены, и скрипты хуков не изменены` (verbatim from task.md). Rerun `matrix.py` (every stdout line asserted to be
`не выполнено: <id>: ...` or the success or stop note): 167 cases, 109 must-fail + 58 must-pass, unexpected 0 on
3.11.14 and 3.12.13; `probes.sh` (1) exit 1, (2) exit 0 on both. Reference with `stop_tests.py` deleted prints exactly
that N4 line, exit 1.

## Round 3 (judge_content round 1, accuracy), 2026-10-30, rerun on 3.11.14 and 3.12.13
- L4 quiz `local-open-weight-model` option d (blocking B2) replaced: "WebFetch перестанет отправлять имя хоста на
  `api.anthropic.com`", keyed false. Source: network-config, as theory.md:183-184 states it (the WebFetch preflight
  sends the host name to `api.anthropic.com` even when the model goes through a gateway, until
  `skipWebFetchPreflight: true`; verified at the page by judge-accuracy round 1). The explanation no longer claims
  anything about the 2.1.312 prompt change. It quotes llm-gateway ("doesn't support routing Claude Code to non-Claude
  models through any gateway"), says the `CLAUDE_CODE_USE_*` switches select cloud providers (V10), not a local
  server, and states the preflight. The reserve quiz has no such option (its `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT`
  distractor in `shell-export-background-agents` is a different, plainly wrong claim).
- G7 precedence (non-blocking 3): a JSON `false` for `sandbox.allowUnsandboxedCommands` in user settings now holds
  over a project or local `true` (sandboxing, v2.1.285, theory.md:109-110). Otherwise the first value among local,
  project and user decides. Matrix: must pass user `false` over project `true` and over local `true`; must fail
  `true` in project and user, project `false` under local and user `true`, plus the round-2 cases (unset, string
  `"false"`, local `true` over project `false`).
- G7 `excludedCommands` (item 3): theory.md:107-110 says excluded commands still run outside the sandbox when
  `allowUnsandboxedCommands` is false. So an entry there lets a command reach hosts beyond the allowlist. G7 now
  fails on any non-empty `sandbox.excludedCommands` (or a non-list value) in any of the three settings files; an
  empty list passes. Matrix: must fail in project, in user, a string in local; must pass `[]`.
- Results, identical on 3.11 and 3.12: `matrix.py` **175 cases (114 must-fail + 61 must-pass), unexpected 0**;
  `probes.sh` unchanged ((1) exit 1, (2) exit 0, (4a), (4b), shadowing); `quiz_demo.py` on `quiz.yaml` and the
  reserve: 0 unexpected (6 questions, positions 25% each, correct option uniquely longest in at most 1, random
  0.1211% / 0.3628% over 3, adaptive 0.37% and 0.40%). `verify_contour.py` parses under the 3.10 grammar.
- Follow-up: the `local-open-weight-model` explanation now reads "Эту проверку отключает `skipWebFetchPreflight:
  true`, а `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` на неё не влияет" (no "только"). `quiz_demo.py` rerun on 3.11
  and 3.12: 0 unexpected; options unchanged, the correct option uniquely longest in no question.
