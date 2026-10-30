# #42 judge_design round 3: accuracy

Reviewed: `plans/42-module-agentic-patterns-design.md` revision 3. I read section 15, L1 s2/s3/s5 and Готово, L2 w1/w2
and Готово, L3 rules and (b), L4 shape, theory, brief, G1-G7/N1-N4, Готово and check messages, 2.3 suite runner, 2.8,
section 6 residuals and 12.9 V15. I re-fetched the primary pages for V15 and for the new Python claims on 2026-10-30.

PASS. No false fact that a lesson would teach or a check would grade in a way a learner can reach from the starter.
2.8 states Stepan's threat model of record correctly:
- In scope: every class he listed.
- Out of scope: RS1-RS8 plus (iii)/(iv). This matches his out-of-scope list item for item: invisible characters,
  homoglyphs, string-built names, runpy beyond the plain import, bytecode, sys.modules, planted code, SessionStart and
  output style, reading the grader.

The cheap extras (NFKC, "no new file of any extension", `runpy` in w1, the no-`src/`-frame rule) are described as
partial measures, not as closing an RS class. That is accurate. The non-blocking items below are for the
practice-designer and the lesson-author. judge_content checks them.

## Round-2 non-blocking items 1-9: where they landed
1. Sandbox modes:
   - L4 theory (lines 539-543) uses the mode wording, plus the warning that "other hosts prompt" without the mode is
     blocking.
   - The G7 defect cell says "in Manual mode".
   - The quiz stem names Manual mode (line 613).
   - Correct per sandboxing.md.
2. "In a terminal session in a trusted folder": L4 theory (543-546) and the head of L4 Готово (618). Correct.
3. `customEndpoint` pin: Справка (554-555), "admitted only for the exact `ANTHROPIC_BASE_URL` a managed `env` block
   pins". Correct.
4. `/etc/corp` holds only the CA bundle: brief (567). The image confirmation is in 12 item 6 (f). Correct.
5. G4 extra indexes: `UV_INDEX` and `UV_EXTRA_INDEX_URL` items must name the mirror, and a public extra index fails.
   uv env reference: `UV_EXTRA_INDEX_URL` "(Deprecated: use `UV_INDEX` instead.)", both a "space-separated list".
   Correct. A `name=` nuance is in N4 below.
6. `AGENTS.md` wording: L1 s2 (269-271). Correct.
7. "Cost-optimised API model (GPT-6 Luna via Codex)", never "hosted"; cite the article, V10 and V14: L4 theory
   (548-550). Correct.
   - The research-file corrections (a)-(c) are still pending: research line 52 still reads "positive form", and lines
     303 and 537 still carry the R C1 framing.
   - 12 item 6 records them as owed. The lesson must cite V10, V14 and the article, not R C1.
8. `repository.sqlite3.Connection(":memory:")` is an L2 must-fail with the image re-run (402-403, 12 item 6 f).
   Correct.
9. CRLF: the brief says the launcher accepts CRLF line endings (566). This matches N3. Correct.

## V15 and new claims: verified
- Tool names (tools-reference): `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`, `WebFetch`, `WebSearch` are exact
  names. No other built-in tool name starts with `Web`.
  - `Glob` and `Grep` are "Absent by default on macOS, Linux, and WSL". See N1.
- `disableAllHooks` (hooks.md):
  - "set `"disableAllHooks": true` in your settings file. Claude Code reads the value left after settings precedence
    applies, so a `"disableAllHooks": false` in a project's `.claude/settings.json` overrides a `true` in your user
    settings". See N3.
- Hooks merge across scopes (hooks.md): "Hook entries merge across settings levels rather than replacing each other".
  - So `hooks: {}` in local settings passing is consistent with the docs. The page doesn't state the empty-object case.
- uv `name=url` (docs.astral.sh/uv/concepts/indexes): an index on the command line or in an env variable can be "its
  URL, a configured name, or the `<name>=<url>` syntax", e.g. `UV_INDEX=pytorch=https://...`.
  - The env reference doesn't repeat this. The CLI reference describes `--extra-index-url` as URLs only (N4).
- unittest (docs.python.org):
  - `expectedFailures` records "an expected failure or error". `unexpectedSuccesses` are tests "marked as expected
    failures, but succeeded".
  - `wasSuccessful()`: "Changed in version 3.4: Returns `False` if there were any unexpectedSuccesses".
  - The 2.3 rule ("failed" counts both, so a red test marked `@expectedFailure` fails) is correct on 3.10-3.13.
- `-I` (2.3): implies `-E` and `-s`. The script/cwd directory is not on `sys.path`, and `site` still runs. So a
  `sitecustomize` in the system site-packages loads, and `usercustomize`, workspace `sitecustomize` and `PYTHONPATH`
  do not. Correct.
  - Importing stdlib `unittest` before putting `src`/root on `sys.path` makes later `unittest.*` submodule imports
    resolve through the cached package's `__path__`. Correct.
- `runpy` (L2 theory, w1): `runpy.run_path`/`run_module` execute code without an import statement of the target.
  "Evades statement rules" is correct.
- `compile`: a builtin that returns a code object. With `exec`/`eval` banned, code can still run through
  `types.FunctionType(code, globals())()`, so banning the builtin is justified. `re.compile` is an attribute, not the
  builtin. See N2 for the wording.
- NFKC (L1 s1/s5) maps compatibility forms (fullwidth, mathematical alphanumerics, NBSP to space). It does not remove
  zero-width characters or map Cyrillic homoglyphs.
  - The design claims only that it "also stops some out-of-scope forms" and keeps RS1/RS2 as residuals. Correct.
- Sourceless `.pyc` (L3): Python imports a sourceless `.pyc` only from the source directory, not from `__pycache__/`.
  So "no new file, `__pycache__/` excepted" closes the in-scope form. Correct.
- `sqlite3.connect` audit event: raised in the calling thread. Hooks are process-wide. A worker given `sqlite3.connect`
  directly has no `src/` frame. Correct, but see N5 for the task wording.
- Timeouts: L2 8x12 = 96 <= 120 and 20 + 45 + 180 = 245 <= 300; L3 60 + 20 + 45 = 125 <= 150. Correct.

## Non-blocking (practice-designer, lesson-author; judge_content checks)
1. G6 and Glob/Grep. tools-reference: "On macOS, Linux, and WSL, Claude Code leaves Glob and Grep out of the default
   tool set, and Claude searches with `find` and `grep` through the Bash tool instead". They come back through `--tools`
   or `--allowedTools`, or through a subagent that lists them without `Bash`.
   - Failing a deny that matches them is still defensible: it removes them on Windows and wherever they are restored.
   - The demo-log reason, V15 and any lesson text must not call them default tools on Linux or macOS. Say "file tools
     where present".
   - FYI: `*Search` also matches `ToolSearch` (passes, correctly). `W*` also matches `Workflow` and `WaitForMcpServers`
     (fails anyway, on `Write`).
2. L2 item 4 and w1 on `compile`.
   - w1 bans the name `compile`, so `from re import compile` followed by `compile(...)` fails. The task text says only
     the "builtin `compile`" is banned, which misinforms.
   - Fix one of the two:
     - (a) the text says "no bare name `compile` (the attribute `re.compile` is fine)";
     - (b) the check exempts a name bound by `from re import compile`.
   - Add the case to the demo matrix either way.
3. N4 `disableAllHooks`. The check fails "any file sets `disableAllHooks: true`", but the docs use the effective value.
   - With user `true` plus project or local `false`, hooks stay on, yet the check fails. That contradicts the general
     rule ("any documented form passes") and the design's own effective-value definition.
   - It can't be reached from the starter, which has no `disableAllHooks` anywhere. That is why it isn't blocking.
   - Fix: N4 checks the effective value (local, then project, then user) is not `true`. Must fail: `true` in user
     only. Must pass: user `true` with project `false`.
4. G4 forms the brief must rule out or the check must state.
   - (a) uv documents `[[tool.uv.index]] ... default = true` in `pyproject.toml` ("To exclude PyPI from the list of
     indexes, set `default = true` on another index entry"), and the starter has a `pyproject.toml`. Under the general
     rule ("any documented form passes wherever the documentation says it takes effect") a learner can argue that it
     passes, but G4 fails it.
     - Add one brief line: "the team also runs uv outside this repository, so project files (`pyproject.toml`,
       `uv.toml`) do not count".
     - Add it to the demo matrix as must fail.
   - (b) `name=url` is documented for `--index`/`UV_INDEX`, not for `--extra-index-url`, which the CLI reference
     describes as URLs.
     - Allow the `name=` prefix on `UV_INDEX` only. I couldn't verify whether uv rejects `name=url` in
       `UV_EXTRA_INDEX_URL`, so treat accepting it there as unproven leniency, not a documented form.
5. L2 item 5 "(not from another thread)" overstates what w2 checks.
   - w2 fails only a connection with no `src/` frame on the stack. A repository function run in a thread pool still has
     the `repository.py` frame and passes.
   - Text: "a connection opened with no code from `src/` on its call stack (for example `sqlite3.connect` handed
     straight to a thread pool) counts as opened elsewhere".
6. L1 s2 is stricter than Claude Code: it flags `@` in code spans and fences, which memory.md says are not imported.
   The lesson must present this as the exercise's rule, not as Claude Code behaviour.
7. Research corrections (a)-(c) are still owed (item 7 above). judge_content checks the lesson cites V10, V14 and Jain's
   article directly.

## Checked
- code.claude.com tools-reference (full tool table; Glob/Grep behaviour sections), fetched 2026-10-30.
- code.claude.com hooks: "Disable or remove hooks", hook locations table, merge across levels, managed hierarchy.
- docs.astral.sh/uv: environment reference (`UV_INDEX`, `UV_EXTRA_INDEX_URL`, `UV_DEFAULT_INDEX`, `UV_INDEX_URL`);
  concepts/indexes (`<name>=<url>`, `default = true`); CLI reference (`--index`, `--extra-index-url`, `--default-index`,
  `--index-url`).
- docs.python.org unittest `TestResult` attributes and `wasSuccessful` (3.4 change).
- Python `-I`, `site`, sourceless `.pyc` lookup, NFKC scope, `compile` + `types.FunctionType`, audit-hook threading:
  from the reference docs as known at 3.10-3.13. None of these changed in revision 3 beyond what is listed.
- Repo: `course/ai-for-developers/01-spec-driven-development/07-integrity-control/starter/pyproject.toml` (exists; no
  `[tool.uv]`); research file lines 52, 303, 537 (corrections pending).
- Round-2 items 1-9 located in the design at the lines cited above.
- 2.8 compared with Stepan's threat model of record, item by item; section 6 residual lists agree with 2.8.

PASS
