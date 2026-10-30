# #42 student run B: L3 `03-failure-analysis`, L4 `04-closed-environments`

Scratch: `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/student-b/`
(`l3/ws`, `l4/ws` honest workspaces; `l3/cheat/variants.py`, `l3/cheat/ws_cheats.py`, `l4/cheat/variants.py`,
`sim.py`, `sim2.py` attack and search harnesses; `l3/checks`, `l4/checks` copies of the mounts).
Interpreters: `/opt/homebrew/bin/python3.12 -I` (all runs), `/opt/homebrew/bin/python3.11 -I` (honest runs repeated,
same results). No 3.10 or 3.13 and no `uv` on this machine. Quizzes were not taken: `quiz.yaml` holds the answers.

## STUDENT REPORT patterns-failure-analysis (#42)

Honest run: PASS on both command checks, on the first submission, on 3.12 and 3.11.
- `failure-log`: exit 0, 8 of 8 correct against the key (I01 missing-fact/memory, I02 invented-api/check,
  I03 stale-api/check, I04 repo-misled/code, I05 gamed-check/hook, I07 missing-fact/task, I08 no-self-check/hook,
  I10 repo-misled/memory).
- `deps-gate`: exit 0 in 0.3 s (budget 150 s). `make check` is green as well.
- `failure-fix-rubric`: artifacts are `l3/ws/failure-log.json` and `l3/ws/scripts/check_deps.py` (mentor-graded, not run).
- Time: I am an agent, so wall-clock time is not a fair measure. By effort, the 20 min for eight incidents and 12 min
  for `check_deps.py` look right for a learner who has the L2 import walk to reuse. Without it, 12 min is tight
  (allowlist parser, AST walk and exit codes).

Unclear places:
1. The ladder defines code as "исходники Python в `src/` или `scripts/`; ... настройки кодом не считаются", yet the key
   accepts `code` for I01 (a `make test` target, per the design walk) and for I10 (restoring the Makefile target). A
   Makefile is not Python source, so a learner who follows the printed ladder can never reach `code` on these incidents.
   The key is more lenient than the text. That does not hurt an honest learner, but the two disagree, and the extra
   accepted layers raise the guess rate.
2. Which layer is correct depends on which fix the learner proposes ("строка" is the proposed fix), and the ladder does
   not help choose the fix. For I08, the fix "CLAUDE.md: run `make test` before done" stops at question 1 with
   `memory`, and the key rejects that. The real reason is that CLAUDE.md already names the command, but the text never
   says to first check whether the fix would prevent the recurrence. Suggested line: "сначала выберите исправление,
   которое предотвратит повтор (а не уже существующее), потом проведите его по лестнице".
3. D1 says "повтор одной и той же находки это ошибка". The grader's rule counts names once per statement, so it
   expects two identical findings for `import yaml; import yaml` on one line, and `judge()` would then count one of
   them as "повторов 1". The case is latent: no template in `deps_roots.json` contains it.

Ambiguities:
- I01 has two reasonable readings: missing-fact (no Makefile target, nothing in CLAUDE.md) or "the fact is in the
  repo", because the context says CI runs the exact command and a CI file is normally committed. Under the second
  reading the learner moves to no-self-check, but "не запустив ничего, что могло бы упасть" does not fit either: the
  agent did run the tests, and they failed. Suggested change to the context: say the CI config lives in another
  repository, or say nothing about CI.

Cheats tried (in-scope classes; checks read only after the honest run):
- `deps-gate` gate side, 5 seeded runs each, all FAIL 0/5: exit-0 stub; untouched starter; `tree.body` only; dotted
  names; relative imports reported; hand-written stdlib list; first-party hardcoded; case-insensitive allowlist; lenient
  allowlist parser; no `Fix:`; stdout on exit 2; line-regex gate; dedupe by name per file.
- `deps-gate` workspace side, all FAIL with the right item: starter `export_json`; vendored `src/fastjsonx.py`;
  `src/invoices/fastjsonx.py` + relative import; allowlist edit + `src/fastjsonx/`; `try/except ImportError` fallback;
  `importlib.import_module('fastjsonx')` + root `fastjsonx.py`; `__import__` literal + root `usercustomize.py` and
  `sitecustomize.py`; `exec('import fastjsonx')` + `scripts/fastjsonx.py`; root `json.py` that calls `os._exit(0)`
  (combined with a broken `export_json` still fails items 4 and 6); root `unittest/` (combined with a red test still
  fails item 7); `os._exit(0)` in `export_json`; `.DS_Store` + `export_json.py~`; `*.egg-info/`; sourceless `.pyc`; a
  stub under `src/invoices/__pycache__/` imported relatively; a skipped starter test; a test module that patches
  `TestResult.addFailure` (reported as tampered and red).
- `deps-gate`, near misses on item 6 that PASS on retry (blocking, see below): `json.dumps(dict(sorted(d.items())))`
  (top-level sort only) passes 65% of runs; `json.dumps(d, sort_keys=True, ensure_ascii=False)` passes 40% of runs
  (measured 9 of 20 real runs, and 59% of hidden dicts contain the Cyrillic value). Attempts are unlimited, so either
  passes within one to three tries. No `sort_keys` passes 0.9% of runs and compact separators 0%.
- Out of scope, recorded residual: overwriting the existing `generated/invoice_schema.py` with a `dumps` and importing
  it as `fastjsonx` passes (RS7, planted into an existing module).
- `failure-log`, stage 0 (all exit 3, not counted): the starter, whitespace-only `fix`, an extra field, `NaN`, a
  duplicate key, a 401-character `fix`, and a UTF-8 BOM. The BOM message says "не строгий JSON (строка 1)", which is
  confusing for a learner whose editor writes a BOM. Free, but the message could name the BOM. Counted: two wrong ->
  exit 1, one wrong -> pass, as specified.
- `failure-log` search cost (cap: 10 counted failures, count-only feedback):
  - Blind over all 36 combinations per incident: 0 of 20,000 in simulation, which matches the design.
  - The cause half is nearly free from the incident titles alone ("Пакет, которого нет", "мёртвого модуля",
    "Ожидание в тесте", "Готово, всё хорошо", "Цель, которой больше нет"): 7 of 8 causes, with only I01 likely wrong.
  - A one-incident-at-a-time hill climb over layers, starting from all `check` and trying the other layers in random
    order, passes within the cap 60% of the time when all causes are right and 14% with title-only causes (`sim2.py`).
  - A climber who picks sensible layers ("check" by default, "hook" for "done without running", "task" for the vague
    request) passes on the 4th submission after 3 counted failures: all-`check` gives 4 wrong, then I08 -> hook,
    I10 -> memory, I07 -> task.
  - Conclusion: the design's "aggregate-count hill climb 0 of 20,000" holds only from a blind start. Count feedback
    lets a learner climb the layer half once the causes are known. This is not an enumerated in-scope class, so I
    record it as a finding for judge_content and not as blocking. Options: show no count at all (binary feedback, as
    in L1), or lower the cap to about 5.

Blocking:
- B1 (L3 `deps-gate` item 6): the hidden dict has a nested dict with unsorted keys in only some runs and a non-ASCII
  value in 59% of runs, so plausible near misses pass on retry. Fix: every run's dict always contains one non-ASCII
  string and one nested dict whose keys are inserted in non-sorted order, or the probe checks two or three dicts per
  run. Add `ensure_ascii=False` and top-level-only sort as must-fail near misses.

## STUDENT REPORT patterns-closed-environments (#42)

Honest run: `contour-config` PASS on the first submission, on 3.12 and 3.11. The untouched starter fails exactly
G1-G7, as task.md says.
- Solution: `launcher.env` sets `ANTHROPIC_BASE_URL`, `NODE_EXTRA_CA_CERTS`, `UV_DEFAULT_INDEX` and `SSL_CERT_FILE`.
  Project settings: the token is removed; `env` sets `ANTHROPIC_BASE_URL` and
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`; deny gains `WebSearch` and `WebFetch`; the `WebFetch` allow is
  removed; `sandbox.enabled` is kept and the network block removed; hooks are untouched. User settings:
  `apiKeyHelper`, plus `sandbox.enabled` and `network.strictAllowlist: true` with `allowedDomains: ["pypi.corp.local"]`.
- I built the workspace with the Write tool so the real `.claude/` names exist, and ran the check with the lesson.yaml
  run line. I never started Claude Code in it.
- Time: the theory carries the whole task. Mapping the brief to requirements and keys took effort that matches the
  4 + 13 + 10 min split. Every trap in the starter (`/v1`, `=0`, `UV_INDEX`, project-level `strictAllowlist`, `*`)
  is named in the theory or the "Частые ошибки" list.

Unclear places:
1. G7 says "никакой запрос разрешения этого не расширит", but the grader does not model `allowUnsandboxedCommands` (the
   design lists it as "not graded"), and the theory never mentions it. By default (true), a sandboxed command that
   fails can be retried outside the sandbox after a permission prompt. A permission request does then widen access,
   so the reference solution does not deliver the sentence as written. Either teach and grade
   `sandbox.allowUnsandboxedCommands: false` (in a user-scope or effective setting), or narrow G7's wording to a
   network-access prompt inside the sandbox. This is a vendor-semantics item for the accuracy judge.
2. N4 says "хуки проекта остаются на месте", but the grader compares only the `hooks` JSON. Deleting or stubbing
   `.claude/hooks/stop_tests.py` passes (the harness root had no hook files and passed). A cheater gains nothing from
   this, but the text promises more than the check verifies.
3. G2 promises "ни в одном файле ... не осталось статического токена", but the check scans only for the planted token.
   A new static token in `ANTHROPIC_CUSTOM_HEADERS` passes. Low impact.

Ambiguities: none blocking. The "effective value" rule in the general rule says first of local, project, user, while
G7 needs `strictAllowlist` specifically in user scope. The theory explains this, so a learner who read it is fine.

Cheats and near misses tried (harness `l4/cheat/variants.py`: the grader's own `evaluate()`, with the `.claude/` paths
renamed to `dotclaude/` because shell writes are blocked; the honest baseline gives the same verdict in the harness
and in the real run):
- Fail correctly:
  - G1: `/v1` suffix; a project-env value overriding the launcher.
  - G2: token moved to local settings; token in a `.bak` file; `apiKeyHelper` that echoes a static token.
  - G3: empty `NONESSENTIAL_TRAFFIC`.
  - G4: `UV_INDEX` only; index set only in project env; index set only in `uv.toml`; `UV_EXTRA_INDEX_URL` pointing at
    pypi.org.
  - N3 (with G4/G5): `export` prefix; quoted value.
  - G5: `NODE_EXTRA_CA_CERTS` only; `UV_SYSTEM_CERTS=true` only.
  - G6: deny `*`; `WebFetch(domain:*)`; `WebSearch(*)`/`WebFetch(*)`; `CLAUDE_CODE_DISABLE_WEB_FETCH=1` alone.
  - G7: `strictAllowlist` in project only; `"true"` as a string; pypi.org in the user allowlist; `*.corp.local`; a
    user-scope `WebFetch(domain:pypi.org)` allow; project `sandbox.enabled: false`.
  - N1: `NODE_EXTRA_CA_CERTS` removed. N2: `CLAUDE_CODE_USE_BEDROCK=1` in user settings.
  - N4: hooks removed; `disableAllHooks` true in local settings; trailing comma.
- Pass correctly, per the documented semantics: `NONESSENTIAL_TRAFFIC=0`; `UV_INDEX_URL`; CRLF; `SSL_CERT_DIR=/etc/corp`;
  `Web*`; deny `WebSearch` + `DISABLE_WEB_FETCH=1`; deny only in user settings; `pypi.corp.local:443`; project
  `allowedDomains` with pypi.org under user `strictAllowlist`; empty `CLAUDE_CODE_USE_VERTEX`; user `disableAllHooks`
  under a project `false`.
- Pass but questionable (non-blocking):
  - `UV_FIND_LINKS=https://pypi.org/...` in `launcher.env` passes G4. It is not modelled, and uv also fetches from
    find-links.
  - Deny `WebF?tch` and `Web[FS]*` pass G6, because the grader uses `fnmatch`. The design (V4) only cites "glob
    patterns"; whether Claude Code honours `?` and `[...]` in the tool-name position is unverified. If only `*` is
    supported, these should fail.
  - The `ANTHROPIC_CUSTOM_HEADERS` static token and the deleted hook scripts (above).
- Scope-blind shotgun: the same block (all env vars, deny, `apiKeyHelper`, strict sandbox) in every settings file and in
  `launcher.env` passes. This is intended ("any form that has the effect where it acts"), and the config is genuinely
  effective, so it is not a defect. It does mean the check measures "knows the keys and the traps" more than "knows
  which file wins".
- Per-requirement feedback with unlimited attempts allows trial-and-error per requirement. This is by design, and the
  search space comes from the theory, so it is not a defect.

Blocking: none for L4.

## Defects ranked
1. B1, L3 `deps-gate` item 6: plausible near misses pass on retry (65% / 40% per run, unlimited attempts). Blocking.
2. L3 `failure-log`: count feedback plus title-guessable causes let a learner hill-climb the layers within the cap
   (3 counted failures with sensible layer guesses; 60% with random layer order once the causes are right). The
   design's 0-of-20,000 figure assumes a blind start. For judge_content: binary feedback, or a lower cap.
3. L4 G7 wording vs `allowUnsandboxedCommands` (default true): the requirement as written is not delivered by the
   reference and is not graded. Teach and grade it, or reword. Vendor fact to confirm at 2.1.314.
4. L3 ladder vs key: `code` is accepted for I01 and I10 through Makefile changes, which the printed definition of
   code excludes. Also, the right layer depends on the proposed fix, which the ladder does not help choose (I08).
5. L3 I01 context: the "CI runs the command" detail makes missing-fact debatable.
6. L4 G6: `fnmatch` accepts `?` and `[...]` tool-name globs; vendor support is unverified.
7. Low: L4 N4 does not check the hook script files; L4 G2 scans only the planted token; `UV_FIND_LINKS` is not
   modelled; the L3 BOM stage-0 message is vague; the latent L3 duplicate-statement edge in `judge()`.
