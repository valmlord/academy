# Issue #23 design: lost concurrent handback votes, plus the v2 review follow-ups

Architect, tier PIPELINE (PROJECT-sized), branch `fix/23-pipeline-handback-race`, base `e678c4d`.
**Revision 3** (after design review round 2: security FAIL, architecture FAIL, operations FAIL; round 1
blockers confirmed fixed). Changes are targeted: sections not named in the revision 3 changelog are unchanged
from revision 2.

Inputs: `plans/23-pipeline-handback-race-research.md` (root cause reproduced), the issue body,
`plans/21-pipeline-v2-design.md`, `plans/21-pipeline-v2.md` (follow-up list), `docs/adr/0005-pipeline-v2.md`,
`.claude/hooks/**`, `tests/pipeline/run.sh`, `.github/workflows/ci.yml`, and Stepan's three decisions (unchanged):
1. accept the new false positive `rm -rf .claude/{agents,feedback}/x`;
2. mypy strict in CI for the hook Python (`lib/*.py` including new modules), annotations to pass it, pinned version;
3. a failed vote is only logged (first output line, whitelisted field, length-capped); no retry.

## Changelog, revision 3

| Review item (round 2) | What changed | Where |
|---|---|---|
| B1 Stop hook loop in a `common.sh` lockout | `phase-complete.sh` gets its own sentinel fallback (warning on stderr, exit 0, like its unreadable-state branch at `phase-complete.sh:28-32`). New `HOOK_KIND=stop` for `phase-complete.sh` only; `pl_fail` warns and exits 0 for it, so a missing python3 or a failed resolver does not block every Stop either. A crash inside `main_fn` is stated as a residual. Rows T15c (stop_hook_active false and true) and T15d (broken python3) | 2.10, 3.2 T15c/T15d, 5, 7 F17, 8 decision 14, 10.3 step 1 |
| B2 T18 red on correct code (bytecode cache) | T18 moves `pl_gate.py` aside (a `__pycache__` pyc is never used without its source) and restores it with `mv`, proven by `cmp`; F16 mechanism corrected; one-off scratch check that the old chmod variant really stays green; installs `touch` `.py` files so a cached pyc is never reused across versions | 3.2 T18, 3.3, 7 F16/F19, 10.1 P5 |
| B3 T16/T17 log assertion | last log line `gate-crash` with `rc` 70, previous line `gate-no-verdict` with `rc` 2 | 3.2 T16/T17 |
| B4 T11(c) mutation absorbed | the key is encoded inside the marker helper with `backslashreplace` (cannot raise for a `str`); the helper catches only `OSError`, no `UnicodeError` handler. Mutation (c): strict `encode("utf-8")`, which then escapes `_context` -> `pipeline resolver failed` | 2.5, 3.2 T11, 7 F7 |
| B5 typing order vs the import graph | order is cfg (no lib imports), checkout (imports cfg), hookio (cfg, checkout), state (cfg, checkout); the pl_* modules import cfg and checkout and are verified at 10e; per-step check counts only errors located in that module's file | 2.8, 10.3 step 10 |
| NB ADR item 7 / 2.4 header | `.claude/agents/../hooks` and `> .claude/./settings.local.json` (the kill-switch file) added as residual spellings; header names `./` and `..` segments | 2.4, 2.9 |
| NB empty entry script | stated as residual: same exposure as an empty `.sh` wrapper today, core-protected, detected by the S2 negative smokes | 2.7, 7 F16 |
| NB F1 wording | `pl_jsonshape` is imported by `pl_write_gate` from step 8; pl_* mypy-clean only at 10e, which may touch the frozen `pl_gate.py` through 10.1 | 2.7, 2.8, 7 F1, 10.3 |
| NB 10.2 restore through Write | marked as the emergency exception to P5 | 10.2 |
| NB S2 after step 1 | rc 2 with either the `.git` message or `common.sh did not load` counts as closed; the second is a lockout to repair | 10.1 P6, 10.2 |
| NB #15 worktree session | its hooks forward to main's live files; Stepan pauses or restarts it around installs | 7 F1, 11.2, 12 |

## Changelog, revision 2

| Review item | What changed | Where |
|---|---|---|
| B1 residual list from the old regex | `{` added to alternative 3's terminator class; header claim narrowed (no "braces in general"); ADR item 7 residual list rewritten from spellings traced against the final pattern, each executed once by the tester; new blocked rows `.claude//hooks` and `.claude/h{ooks,}` | 2.4, 2.9, T8, T8b, 3.3 R-check |
| B2 CPython exits 2 on an unopenable script | `pl_gate.run` catches only `Blocked`; wrappers map rc 2 without `\x1f` in stdout to a crash (`gate-no-verdict`, rc 70); chmod 000 rows for `pl_write_gate.py`, `pl_shell_guard.py`, `pl_gate.py` | 2.7, T16-T18, F16 |
| B3 "one gate per step" false; common.sh breakage fails open | F1 rewritten; new step 1 makes every hook fail closed (gates) / quiet (observers) / exit 1 (CLI) when `common.sh` does not load (sentinel `PL_COMMON_LOADED`); live install procedure for every hook step: scratch export, `bash -n`, `py_compile` on `/usr/bin/python3` 3.9.6, full suite on 3.9.6, single cp+mv install per file, positive and negative smokes; recovery table; kill-switch runbook; `pl_gate.py` frozen after step 8 | 2.10, 7 (F1, F17-F19), 10, 11.2, T15 |
| mypy pins and interpreter | `mypy==1.20.2`, `librt==0.16.0`, `mypy_extensions==1.1.0`, `pathspec==1.1.1`, `typing_extensions==4.16.0`; local runs on `/opt/homebrew/bin/python3.12`; `--cache-dir` outside the repo; 229 errors at HEAD, step 10 split per module; Stepan adds `pipeline-types` to required checks | 2.8, 10 (step 10a-10e), 12 |
| Module names | new importable modules get a `pl_` prefix (`pl_gate`, `pl_jsonshape`), entry scripts too (`pl_write_gate`, `pl_shell_guard`); `lib/` stays appended to `sys.path` | 2.7, 2.8, 8 (decision 10), F14 |
| ubuntu:24.04 mutation runs | non-root user, `git` and `python3` installed; T7 red there too | 3.3 |
| `error` field source | stated: first line of combined stdout+stderr, a deviation from the issue's "stderr" | 2.2 |
| Marker file | mode `0o600`; session id encoded with `backslashreplace`, any marker failure logs instead of crashing `_context` | 2.5 |
| Strict input decoding | `pl_gate.read_hook_input` decodes stdin bytes as strict UTF-8; a bad byte is a crash, i.e. a block | 2.7 |
| Shim quoting | real `mktemp` path inserted with `printf %q`; template passed to `python3` as an argument | 3.1 |
| `_test_delay`, notify heredoc | `_test_delay` uses the new ASCII digit helper; the notify Python moves into a function so no heredoc sits inside `$(...)` (bash 3.2 parser) | 2.1, 2.3 |
| Live hook swap | never edit a running script in place; install = `cp` to a sibling name + `mv` | 10.1 |

---

## 1. Solution design (summary)

- **Root cause fix.** `py_run` in `pipeline-advance.sh` stops creating a temp file: it feeds the script on stdin
  (`python3 -I - "$@"`), the pattern `pipeline-watchdog.sh` already uses. Every inline script becomes a quoted
  heredoc and receives `$STATE_FILE` (and the key for `read_state`) as `sys.argv`, so no shell value is pasted into
  Python source any more (fixes the `'`-in-path SyntaxError side finding).
- **A guard that goes red on Linux.** `tests/pipeline/run.sh` generates a BSD-behaving `mktemp` shim and puts it
  first on `PATH`. A deterministic row (pre-existing literal file) and a concurrency row (3 rounds x 3 concurrent
  `judge-handback.sh`) go red under "restore the mktemp `py_run`" on GNU CI as on macOS.
- **Visible failures.** `pl_record_vote` and `judge-count.sh` log the first output line in a new whitelisted
  `error` field when a vote or a spawn entry is not recorded. No retry (decision 3).
- **Fail safe when the shared shell library breaks.** Every hook checks a sentinel set on the last line of
  `lib/common.sh`; a PreToolUse gate whose `common.sh` did not load exits 2 with a message instead of 127
  (non-blocking); the Stop gate warns and allows, because blocking Stop when nothing can be repaired only loops.
  Shipped as step 1, before any other hook edit, because it turns the worst rollout failure (all guards silently
  off) into a visible lockout.
- **Follow-ups 1-14** (section 6), and a **live install procedure** (section 10.1): every hook change is built and
  tested in a scratch export on the live interpreter (`/usr/bin/python3` 3.9.6) first, then installed file by file
  with an atomic rename, each followed by smokes that detect both lockout and fail-open.

## 2. Components and changes

### 2.1 `pipeline-advance.sh`: `py_run` without a temp file (Part 1, side finding)

- `py_run` becomes a one-line wrapper equivalent to `python3 -I - "$@"`, with a comment saying why there is no
  temp file (BSD `mktemp` keeps a template without trailing `X`s literal; see #23). The name stays, because the
  regression mutation in section 3 is defined as "restore the old `py_run` body" and every caller already feeds
  stdin.
- `read_state <key>`: script on stdin, `sys.argv[1]` = state file, `sys.argv[2]` = key. `read_state_json`,
  `check_judges_unanimous` (`sys.argv[1]` = state file, `sys.argv[2]` = needed judges): quoted heredocs (`<<'PY'`).
- Notify body (`:229`): its Python moves into a shell function `notify_body` (quoted heredoc inside the function,
  state file as `sys.argv[1]`), called as `$(notify_body)`. Because bash 3.2 mis-parses a heredoc inside `$(...)`
  when the body has unbalanced quotes or parentheses; inside a function body the heredoc is parsed by the normal
  parser.
- After this step no `$STATE_FILE`, `$1` or other shell variable appears inside any Python source text in this
  script. The `cygpath` conversion of `STATE_FILE` (`:30`) stays: it is applied before the value reaches argv.
- Nothing else in the hooks calls `mktemp` (a search for `mktemp` in `.claude/hooks` finds only `:36`).

### 2.2 `lib/common.sh` and `judge-count.sh`: log why a vote or spawn was not recorded (decision 3)

- `pl_record_vote`: when the event is neither `vote-recorded` nor `vote-dup`, pass `error=<first line of out>` to
  `pl_log` (bash parameter expansion up to the first newline, no external command). The 200-character cap is the
  existing `LOG_VALUE_MAX_CHARS`; JSON escaping is the existing `json.dumps`.
- **Deviation from the issue, stated:** the issue says "the first stderr line"; the field is the **first line of
  combined stdout+stderr**, because `pl_record_vote` already captures `2>&1` into one variable (`common.sh:88-89`)
  and separating the streams needs a temp file or fd juggling, i.e. the kind of moving part this issue removes. On
  every failing path the CLI prints nothing to stdout before its error (research trace), so in practice the first
  line is the error line.
- `lib/checkout.py` `LOG_FIELDS` gains `"error"`, because `log_event` silently drops any key not in the whitelist.
- `judge-count.sh`: the spawn call keeps its output (`2>&1` into a variable) instead of `>/dev/null 2>&1 || true`;
  on a non-zero rc it logs `event=spawn-failed rc=<rc> error=<first line> judge=<k> agent_id=<id> round=<phase>`.
  Still an observer: it never blocks. Because the spawn map is the fallback that attributes a handback when no
  transcript is found, and the same defect lost spawn entries with no trace.
- No retry anywhere (decision 3).

### 2.3 `lib/state.py`: parked listing and ASCII digits (follow-ups 1, 3)

- `op_parked`: a parked file that is valid JSON but not an object yields `<key> (not a JSON object)`, mirroring the
  `(unreadable)` line and `op_resume`'s check at `:421`.
- One helper `is_ascii_digits(text: str) -> bool` (`isascii() and isdigit()`) used at `op_init` (`:264`),
  `require_grant` (`:111`), `_pick_parked` (`:391`) and `_test_delay` (`:157`). Because a Unicode digit (`²`) passes
  `isdigit()` and then crashes `int()`; at `:287` that crash comes after `_park` (`:284`), so today it can park the
  slot's state and write no new one. `_test_delay` has the same `isdigit()` + `int()` shape on an env value.

### 2.4 `bash-code-guard.sh` (later `lib/pl_shell_guard.py`): one token-end rule, a truthful message (follow-ups 2, 6, 7)

- One constant `TOKEN_END = (?![\w.-])` (a name cannot continue). Core directory entries:
  `<escaped prefix without slash>(?:/|TOKEN_END)`.
- The `.claude` token (researcher's rule, plus `{` in the third alternative's terminator class):
  `(?<![\w.-])\.claude(?:/(?![\w.-])|(?![\w./-])|/[^\s/'";|&)]*[*?\[{])`
  1. `.claude/` followed by anything that cannot continue a name (end, space, `/`, `{`, `*`, a quote);
  2. bare `.claude` not followed by a name character or `/` (covers `.claude`, `.claude,`, `".claude"/x`);
  3. a glob or brace character (`*`, `?`, `[`, `{`) anywhere in the **first** component after `.claude/`.
- Traced against the final pattern (each spelling executed once by the tester, 3.3 R-check):

  | Spelling (after `rm -rf ` unless shown) | Result | Matched by |
  |---|---|---|
  | `.claude`, `.claude/`, `.claude,` | blocked | alt 2, alt 1, alt 2 |
  | `.claude//hooks` | blocked (was allowed before #23) | alt 1 (`/` after `.claude/`) |
  | `.claude/{hooks,}`, `.claude/{pipeline.json,x}` | blocked | alt 1 (`{` after `.claude/`) |
  | `.claude/h{ooks,}` | blocked | alt 3 (`{` in the first component) |
  | `.claude/h*`, `.claude/hoo[k]s` | blocked | alt 3 |
  | `".claude"/hooks` | blocked | alt 2 (`"` after `.claude`) |
  | `.claude/hooks{,.bak}`, `.claude/hooks/{a,b}` | blocked | core prefix `.claude/hooks` + `TOKEN_END` / `/` |
  | `.claude/{agents,feedback}/x` | blocked, accepted false positive (decision 1) | alt 1 |
  | `.claude/agents/*`, `.claude/worktrees/old`, `cp x .claude/agents/y` | allowed (intended) | none |
  | `.claude/./hooks` | **passes** (residual) | alt 1 fails on `.`, alt 3 hits `/` before any glob, no literal `.claude/hooks` |
  | `.claude/agents/../hooks` | **passes** (residual) | alt 1 fails on `a`, alt 3 hits `/` after `agents` with no glob, no literal `.claude/hooks` |
  | `printf x > .claude/./settings.local.json` (the kill-switch file) | **passes** (residual) | alt 1 fails on `.`, alt 3 hits `/` after `.`, no literal `.claude/settings.local.json` |
  | `.claude/h""ooks`, `.claude/h''ooks` | **passes** (residual) | quotes end alt 3's class before a glob, no literal core prefix |
  | `.claude/h\ooks` | **passes** (residual) | no glob or brace character, no literal core prefix |
  | `.cla{ude,}/hooks` | **passes** (residual) | no literal `.claude` |
  | `d=.claude; rm -rf $d/hooks`, `cd .claude && rm -rf hooks` | **pass** (residual) | `.claude` is not in the write verb's segment |

  Braces are covered only directly after `.claude/` and inside the first component; a brace that splits the
  `.claude` name, a `./` or `..` path segment, or a quote/backslash that splits a component name is not, and no
  claim says otherwise.
- Message split (follow-up 7): the core-file pattern is tested first and keeps today's message and log reason
  `core-shell`. Only when the command matches the `.claude` token alone, the message is
  `shell writes that name a .claude directory are allowed only in a PIPELINE task in the main checkout (removing
  or renaming .claude disables every hook)`, log reason `core-shell:claude-dir`. Same allow condition for both.
- Header comment (follow-up 6): rule 3 lists the core path strings; the `.claude` directory token: `.claude` with
  or without a trailing slash, `.claude/` followed by a non-name character, or a glob or brace character in the
  first component after `.claude/`; and `git checkout` with any arguments (a ref included) as a write verb. It
  also says that quoting, backslashes, `./` and `..` path segments (`.claude/./hooks`, `.claude/agents/../hooks`)
  and variables evade it (ADR-0005 item 7).

### 2.5 `lib/checkout.py`: `foreign-state` once per session, checkout and status (follow-up 10)

- In `_context`, before logging `foreign-state`: when the hook input has a non-empty string `session_id`, call one
  helper `_foreign_marker_is_new(session_id: str, state_root: str, status: str) -> bool`. Inside it, in this order:
  1. build `key = session_id + "\0" + state_root + "\0" + status` and encode it **here, in the helper, outside
     any `try`**, with `key.encode("utf-8", "backslashreplace")`. For a `str` this cannot raise: UTF-8 can encode
     every code point except lone surrogates, and `backslashreplace` replaces those (a lone surrogate arrives from
     `json.loads("\"\\ud800\"")`). So there is no `UnicodeError` handler (it would be dead code);
  2. path `${TMPDIR:-/tmp}/pipeline_foreign_<sha1(key bytes)[:16]>`;
  3. `try: os.open(path, O_CREAT | O_EXCL | O_WRONLY, 0o600)`, close, return `True`;
     `except FileExistsError: return False`; `except OSError: return True` (log anyway).
  `_context` logs when the helper returns `True`. No `session_id` (the CLI, tests) -> always log.
- Because `_context` runs for every hook (it is `common.sh`'s resolver), an exception there blocks every gate: the
  helper's only expected failures are `OSError`s, which cost a duplicate log line. Any other exception (a defect)
  propagates and fails closed (`pipeline resolver failed`), which is what T11(c) proves for the encode. `0o600`
  because the marker name derives from the session id and other users have no business reading or replacing it.
- `state-unreadable` and `resolve-fallback` keep logging on every call: they are rare and each occurrence matters.

### 2.6 `pipeline-watchdog.sh`: reuse `state.last_activity` (follow-up 12)

- The inline script imports `state` from `$LIB` (argv entry appended to `sys.path`) and calls
  `state.last_activity(d)`. Because the copy lacks the `isinstance` check on `ts` and the `or 0` on `session_ts`,
  so a non-numeric `ts` crashes it (`observer-crash`, no warning). The marker logic stays inline.

### 2.7 Gate Python into `lib/` (follow-up 11)

- New `lib/pl_gate.py` (shared by both gates): `Blocked` exception, `tier_of(status)`, `has_flag(conf, tier,
  flag)` with `conf: Mapping[str, object]` (so the later `Config` TypedDict of 10a is accepted without editing
  `pl_gate.py`), `read_hook_input() -> dict[str, object]`, and `run(decide)`. It imports only the stdlib and
  `pl_jsonshape`.
  - `read_hook_input` reads `sys.stdin.buffer` and decodes **strict UTF-8**; a `UnicodeDecodeError` propagates
    (crash = block), because a lenient decode (`surrogateescape` under a C locale) would hand the guard a command
    text that differs from what the shell runs. Empty input -> `{}`; invalid JSON or a non-object -> `{}` (today's
    behaviour, kept so the existing rows stay green).
  - `run(decide)` contract: `decide` returns -> exit 0 (allow); raises `Blocked(reason, message)` -> print
    `<reason>\x1f<message>` to stdout, exit 2; **any other exception is not caught** -> traceback, CPython exit 1
    (crash). `run` catches only `Blocked`.
- New entry scripts `lib/pl_write_gate.py` (body of `GATE_PY`, `require-pipeline.sh:16-137`) and
  `lib/pl_shell_guard.py` (body of `GUARD_PY`, `bash-code-guard.sh:16-109`), run as
  `python3 -I "$LIB/<name>.py" <args>` with the hook JSON on stdin. Both import `cfg`, `checkout`, `pl_gate` and
  `pl_jsonshape` (today's inline code imports `cfg, checkout`, `require-pipeline.sh:20`, `bash-code-guard.sh:20`).
  Written with strict annotations from the start; mypy-clean only from step 10e, because they call the untyped
  `cfg` and `checkout` until 10a/10b (2.8).
- **Exit-code mapping in both wrappers** (because CPython itself exits 2 when it cannot open the script: missing
  or unreadable file, stderr `can't open file`, stdout empty):
  - rc 0 -> allow;
  - rc 2 **and** the captured stdout contains `\x1f` -> `deny "<message>" "<reason>"` (today's path);
  - rc 2 **without** `\x1f` -> `pl_log event=gate-no-verdict rc=2`, then `return 70` (EX_SOFTWARE, named in a
    comment: "the gate ended without a verdict") so `run_hook` takes its crash path: it logs `gate-crash rc=70`
    after the wrapper's line (`common.sh:111`) and prints `BLOCKED: <hook> failed internally (rc=70)`;
  - any other rc -> `return "$rc"` (crash path, as today).
  The mapping stays in the two wrappers (three lines each) rather than in `common.sh`, because a helper there
  would add one more edit to the file every hook sources (section 10).
- **Residual, stated:** an empty (or truncated-to-nothing) `pl_write_gate.py` or `pl_shell_guard.py` makes CPython
  exit 0 with empty stdout, i.e. allow. This is the same exposure as an empty `require-pipeline.sh` or
  `bash-code-guard.sh` today: the files are pipeline core (writable only in PIPELINE, ADR-0005), installs are an
  atomic `mv` of a file that passed P3/P4 (never an in-place truncation), and the S2 negative smokes after every
  install go red (rc 0) on exactly this state. A positive allow token in stdout was considered and not adopted:
  it changes the contract of every allow path for a case the install procedure already detects.
- The `.sh` wrappers keep `main_fn`, `deny` and the two string checks (`pipeline_state`, `JUDGE_HOOK_CALLER`).
- Because inline Python is invisible to `py_compile` and mypy (decision 2), and `tier_of` / `has_flag` / input
  parsing were duplicated. Other inline Python (`phase-complete.sh`, `pipeline-advance.sh` stdin scripts, watchdog
  remainder) stays inline: section 5.
- `pl_gate.py` is **frozen after step 8**: step 9 reuses it unchanged. If step 9 or the 10e mypy run needs a
  change there, that change goes through the shared-file path of 10.1 like any other shared file.

### 2.8 Strict typing and the mypy CI job (follow-up 13, decision 2)

- Scope: every `.claude/hooks/lib/*.py` (`cfg`, `checkout`, `state`, `hookio`, `pl_gate`, `pl_write_gate`,
  `pl_shell_guard`, `pl_jsonshape`). At HEAD `mypy --strict` reports 229 errors in the 4 existing files
  (operations judge), so step 10 is one commit per module (section 10).
- **Import graph (callees first, the typing order):** `cfg` imports nothing from `lib/`; `checkout` imports `cfg`
  (`checkout.py:25`); `hookio` imports `cfg` and `checkout` (`hookio.py:32-33`, calls `checkout.code_root()` at
  `:45`); `state` imports `cfg` and `checkout` (`state.py:32-33`); `pl_jsonshape` imports nothing from `lib/`;
  `pl_gate` imports `pl_jsonshape`; `pl_write_gate` and `pl_shell_guard` import `cfg`, `checkout`, `pl_gate`,
  `pl_jsonshape`. Nothing in `lib/` imports `state` or `hookio` (the watchdog's inline import of `state` is outside
  mypy's scope). Under `--strict`, a typed module that calls an untyped one gets `no-untyped-call` in its own file,
  so a module can be clean only after every `lib/` module it calls is typed.
  As built (step 10): `cfg` still imports nothing from `lib/` (its validation needs no `pl_jsonshape`);
  `hookio` and `state` gained an import of `pl_jsonshape`, which imports nothing from `lib/`, so the order
  above is unchanged.
- Conventions (code-style rules 2): no `Any`, no bare `# type: ignore` (an ignore needs an error code and a reason
  comment), exported functions carry return types. JSON from disk or stdin is `object`, narrowed through
  `lib/pl_jsonshape.py` (`as_object(v) -> Optional[dict[str, object]]`, `as_str(v, default) -> str`,
  `as_list(v) -> list[object]`). `typing.Optional`/`Union` only, never `X | None`, because annotations are
  evaluated at definition time on the 3.9 runtime. `collections.namedtuple` becomes `typing.NamedTuple`.
  `cfg.load()` validates the top-level types of the keys the hooks use and raises `ConfigError(ValueError)` (so
  existing `except (OSError, ValueError)` handlers keep working); one `typing.cast` to a `Config` TypedDict right
  after that validation, with a comment, because mypy cannot narrow a dict to a TypedDict.
- Behaviour must not change, except that malformed shapes which today raise `AttributeError` are refused with a
  message. The existing suite is the guard, run on 3.9.6 for every step (10.1).
- mypy itself needs Python >= 3.10 (verified by the operations judge); it targets the 3.9 runtime with
  `--python-version 3.9`, which mypy 2.x rejects, so the pin is the 1.20 line.
- `tests/pipeline/requirements-typecheck.txt`, exact pins (no-deps wheel install verified on 3.12 by the operations
  judge): `mypy==1.20.2`, `librt==0.16.0`, `mypy_extensions==1.1.0`, `pathspec==1.1.1`,
  `typing_extensions==4.16.0`. Installed with `pip install --no-deps --only-binary :all: -r ...`, so a missing pin
  fails loudly.
- Command (CI and local, same flags): `MYPYPATH=.claude/hooks/lib python -m mypy --strict --python-version 3.9
  --cache-dir "<outside the repo>" .claude/hooks/lib/*.py`. CI: `--cache-dir "$RUNNER_TEMP/mypy-cache"`; local:
  `--cache-dir "$SCRATCH/mypy-cache"`. Because a `.mypy_cache/` in the repo would be an untracked directory that
  trips the dirty-tree gates; no `.gitignore` change needed.
- CI: new job `pipeline-types` in `ci.yml`: `actions/checkout@v4`, `actions/setup-python@v5` with
  `python-version: "3.12"`, the pip install, the mypy command. Timeout 5 minutes, `permissions: contents: read`.
  The job only protects `main` once Stepan adds it to the required checks (section 12).
- Local check: `/opt/homebrew/bin/python3.12 -m venv "$SCRATCH/venv"` (not `/usr/bin/python3`, which is 3.9.6 and
  cannot install mypy 1.20), install the same requirements file, run the same command.
- Unverified (coder verifies in step 10e, does not guess): that `MYPYPATH` plus file arguments resolves
  `import cfg` without "source file found twice"; if not, `cd .claude/hooks/lib && mypy ... *.py` in both CI and
  the local command.

### 2.9 Docs (follow-ups 4, 5, 6, 8, 9, 14)

- `docs/adr/0005-pipeline-v2.md` (stays Proposed):
  - item 6: the whitelist includes `error`, the first line of a failed vote or spawn CLI output (stdout and
    stderr combined), capped at 200 characters; it may contain absolute paths, never a command, file content or
    handback message.
  - item 7, new bullet, from the 2.4 table only: write verbs outside the guard's list (`find ... -delete`,
    `rsync --delete`, `git clean`, `tar -x -C`) pass; so do spellings that hide a core name from a string match:
    `./` and `..` path segments (`.claude/./hooks`, `.claude/agents/../hooks`, and `> .claude/./settings.local.json`,
    which reaches the kill-switch file), `.claude/h""ooks`, `.claude/h\ooks`, `.cla{ude,}/hooks`, a variable
    (`d=.claude; rm -rf $d/hooks`) and `cd .claude && rm -rf hooks`. `.claude//hooks` and `.claude/h{ooks,}` are
    blocked since #23. Accepted false positive: `rm -rf .claude/{agents,feedback}/x` (decision 1). The text is
    finalised only after the tester's R-check (3.3) confirms every listed spelling.
  - item 8: answered: inside a subagent, the `PreToolUse(SubagentHandback)` hook received the parent session's
    `transcript_path` (`transcript_kind=main`, `role_source=transcript`; hook log 2026-10-27 20:23:49 and
    20:23:56, Claude Code 2.1.267). The other layouts stay as fallbacks.
  - item 1 or a new short item: PreToolUse gates fail closed when `lib/common.sh` does not load (2.10), and a
    gate script CPython cannot open is a crash, not a verdict (2.7). The Stop gate (`phase-complete.sh`) instead
    warns and allows when it cannot evaluate (no `common.sh`, no python3, resolver failure), because a Stop block
    that cannot be repaired only re-prompts the session; a crash inside its `main_fn` still blocks (residual, 2.10).
- `.claude/hooks/lib/hookio.py` docstring of `subagent_transcript` (`:166-167`): observed layout and date.
- `plans/21-pipeline-v2-design.md`:
  - 2.3: the `checkout` field is always an absolute root; block reasons carry `REL`, absolute for a target outside
    every checkout (2.6 step 4); the `error` field can carry absolute paths. Add `error` to the field list.
  - 2.6 and 2.7: one line each, "code lives in `lib/pl_write_gate.py` / `lib/pl_shell_guard.py` since #23".
  - 2.7: write verbs list `git checkout` with any arguments; core rule names the core path strings plus the
    `.claude` token of 2.4, with its stated limits, and the split message.
  - R3 L4: agents cannot write a `.git` path, so L4 is either run by Stepan in his own terminal with copy-paste
    commands (create the fake dir and its `.git` file, pipe a hook JSON whose `cwd` is the fake dir into
    `bash .claude/hooks/require-pipeline.sh`, check the last log line has `source` `fallback:unregistered`, remove
    the dir), or replaced by the automated row `fake .git-file directory uses the main checkout's state`
    (`tests/pipeline/run.sh:292-294`). The coder writes both variants' exact commands.
- `CLAUDE.md` section 7 "Kill switch" (follow-up 9): in a session started in a worktree, Claude Code reads
  `.claude/settings.local.json` at the main checkout's root (Claude Code docs, >= 2.1.211; not verified live), and a
  file in the worktree's own `.claude/` is still read as a legacy location; to be safe, add the key in both.
  Replace "writes ... into" with the add-the-key command and check command from 11.2, because overwriting the file
  loses other local settings.
- `plans/21-pipeline-v2.md` follow-ups list: one line "addressed in #23 (plans/23-pipeline-handback-race-design.md)".

### 2.10 Every hook fails safe when `lib/common.sh` does not load (review B3; Stop hook revised in rev 3)

- Fact (operations judge, scratch export): a syntax error in `lib/common.sh` stops the `source` before `run_hook`
  is defined; the hook then exits 127, which Claude Code treats as non-blocking, so every guard (including `.git`,
  grant file and transcript protection) is silently off. A missing `common.sh` ends the same way.
- `lib/common.sh` gets one new **last** line `PL_COMMON_LOADED=1` (not exported), with a comment: it must stay the
  last line, because it proves the whole file was executed.
- Every script that sources it (`require-pipeline.sh`, `bash-code-guard.sh`, `phase-gate.sh`,
  `phase-complete.sh`, `judge-count.sh`, `judge-handback.sh`, `judge-vote.sh`, `pipeline-watchdog.sh`,
  `pipeline-advance.sh`) does, with builtins only:
  - `unset PL_COMMON_LOADED` right before `source` (because an inherited environment value must not fake a load);
  - right after `source`: `[ "${PL_COMMON_LOADED:-}" = 1 ] || { <fallback>; }` where the fallback is
    - PreToolUse gates (`require-pipeline.sh`, `bash-code-guard.sh`, `phase-gate.sh`):
      `echo "BLOCKED: $0: lib/common.sh did not load; pipeline gates cannot run. Stepan: kill switch, CLAUDE.md section 7" >&2; exit 2`;
    - **the Stop gate `phase-complete.sh`**: `echo "WARNING (not blocking): $0: lib/common.sh did not load; the
      pipeline completion check did not run. Stepan: kill switch, CLAUDE.md section 7" >&2; exit 0`. Because its
      contract (header line 4, row `stop not blocked twice (stop_hook_active)`, `run.sh:174`) is to block at most
      once per turn, and without `common.sh` it cannot read `stop_hook_active`: an exit 2 would block every Stop
      and re-prompt the session until a human interrupts, in exactly the lockout where the orchestrator must stop
      and hand over to Stepan. Same reasoning as its unreadable-state branch (`phase-complete.sh:28-32`);
    - observers: `exit 0` (observers never block);
    - CLI: `echo "ERROR: lib/common.sh did not load" >&2; exit 1`.
- **Stop hook and `pl_fail` (rev 3).** `pl_fail` (`common.sh:15-21`) exits 2 for every gate, so a missing python3
  (`:49-52`) or a resolver failure (`:63-66`) also blocks every Stop, the same loop. Fix inside step 1's
  `common.sh` edit:
  - `phase-complete.sh` sets `HOOK_KIND=stop` instead of `gate`; `common.sh:10` accepts `stop`
    (`observer|cli|stop) ;;`), and the header comment (`:3`, `:6`) names it: "the Stop gate warns and allows
    when it cannot evaluate";
  - `pl_fail` gets one branch: `stop) echo "WARNING (not blocking): $1" >&2; exit 0 ;;`;
  - everywhere else `stop` behaves as `gate`: `:40` and `:56` test only for `cli`, `run_hook` (`:105-113`)
    special-cases only `observer`, so verdicts (rc 2 from `block()`) and crashes map exactly as today.
  - An inherited `HOOK_KIND=stop` cannot weaken a PreToolUse gate: every hook script assigns `HOOK_KIND` itself
    before `source` (`require-pipeline.sh:10`, `bash-code-guard.sh:10`, `phase-gate.sh:5`), overwriting the
    environment value.
- **Residual, stated:** a crash inside `phase-complete.sh`'s `main_fn` (python3 and `common.sh` fine, e.g. an
  unreadable `hookio.py`) still goes through `run_hook`'s gate mapping and blocks every Stop. Not changed here
  because `run_hook` cannot tell a crash from CPython's rc 2 for an unopenable script (2.7), so a correct mapping
  needs the verdict-token work of 2.7 applied to `phase-complete.sh`'s own Python, which section 5 leaves inline;
  it is existing #21 behaviour and needs a broken lib file while `common.sh` loads. Candidate follow-up issue.
- Rejected variant `run_hook "$@" || { ...; exit 2; }`: it covers only a missing `run_hook` and leaves a
  `common.sh` that aborted after defining some functions, or a CLI that never calls `run_hook`, unhandled; the
  sentinel covers every partial load with one rule.
- Whether bash 3.2 and 5.2 stop a `source` at the first syntax error is the operations judge's observation, not a
  documented contract I checked; T15's red run (without the check: rc 127) re-proves it on both shells. If bash
  ever continued past the error, the sentinel would be set and the hook would behave normally minus the broken
  line, which is the same exposure as today.

## 3. Tests and mutations

All rows live in `tests/pipeline/run.sh`. New rows go into one new group `== #23: temp files, concurrent votes,
follow-ups` at the end of the suite, except the shim setup (right after `cd "$WORK"`, line 36), the guard spellings
(extend the loops at `:881-892`), and T15-T18 (next to the existing crash rows at `:400-431`, reusing `mode_of`,
`badpy` and `stop_json`).
Every chmod or file mutation inside `run.sh` takes a backup in `$BASE` first and proves the restore with `cmp` or
`mode_of` (pattern of `:423-430`).

### 3.1 The BSD `mktemp` shim (why and how)

- Why: GNU `mktemp` (CI, `ubuntu-24.04`) randomizes a template with a non-`X` tail, so no test can observe the #23
  defect on Linux; a concurrency test alone stays green in CI under the regression.
- What: run.sh writes `$BASE/bsdbin/mktemp` (heredoc, `chmod +x`) after the `.claude` copy and before the first
  test. The absolute path of the real `mktemp` (resolved with `command -v` before `PATH` changes) is inserted with
  `printf %q` into an assignment line, so a path with spaces or quotes stays one word. Then
  `export PATH="$BASE/bsdbin:$PATH"`.
- Behaviour: exactly one argument, not starting with `-`, whose last character is not `X` -> run
  `python3 -I -c '<fixed code>' "$1"`: the template arrives as `sys.argv[1]`, never inside the code text; the code
  creates it with `os.open(O_CREAT|O_EXCL)`, prints it, rc 0; if it exists, prints
  `mktemp: mkstemp failed on <path>: File exists` to stderr, rc 1. Every other invocation `exec`s the real
  `mktemp` unchanged.
- Scope: the suite's own `mktemp -d` (line 7) runs before the shim; rows that replace `PATH` (`badpy`, `emptybin`)
  never reach `py_run`. Generated at runtime because a committed helper needs an exec bit and its own shellcheck
  path, and it belongs to the rows that depend on it.

### 3.2 Test rows

| Id | Row (name = behaviour) | Setup and assertion | Mutation that must turn it red, and why |
|---|---|---|---|
| T0 | `mktemp shim behaves like BSD for a template without trailing X` | `command -v mktemp` is the shim; two calls with `$TMPDIR/shimcheck.XXXXXX.py`: rc 0 printing the literal path, then rc 1 with `File exists`; `mktemp -d` still creates a directory | shim delegates everything (or drop the `export PATH`): first assertion or rc 1 fails |
| T1 | `status and a vote work while a literal pipeline_py.XXXXXX.py exists in TMPDIR` | `put_state PROJECT judge_design`; create `$TMPDIR/pipeline_py.XXXXXX.py`; `status` rc 0 with valid JSON; one `handback` (security) recorded with `path: handback`; file removed afterwards | restore the mktemp `py_run`: the shim finds the file, `tmpf` is empty, `python3 -I ""` exits 1, `status` rc 1. Deterministic |
| T2 | `three concurrent handbacks record three votes, three rounds in a row` | per round: fresh `put_state PROJECT judge_design`, `rm -f "$LOG"`, three transcripts (ids `c<r>s/c<r>a/c<r>o`), three `handback` calls in the background, `wait`; `votes_by` gives all 9 ids with `path: handback`, 3 `vote-recorded` per round | restore the mktemp `py_run`: overlapping calls fail on the shim's literal file, a vote is missing. Probabilistic (100% of 50 rounds on macOS); T1 is the deterministic red |
| T3 | `status works in a checkout whose path contains a single quote` | `git worktree add` at `$WORK/.claude/worktrees/it's wt`; `put_state` there; `(cd that dir && "${ADV[@]}" status)` rc 0 with its issue; removed by `reset_state` | interpolate `r'$STATE_FILE'` back into `read_state_json`: SyntaxError, rc 1 |
| T4 | `judge hook logs the first output line of a failed vote` | extends `lk2` (`:902-906`): `log_last error` contains `could not lock` | (a) drop `"error"` from `LOG_FIELDS`; (b) drop `error=` in `pl_record_vote`. Either way the field is empty |
| T5 | `a spawn that cannot take the lock is logged as spawn-failed` | `put_state PROJECT judge_design`, `set_cfg state_lock_timeout_seconds 1`, `hold_lock 3`; PostToolUse(Agent) JSON (`tool_input.prompt=$JS`, `tool_response.agentId=sp1`) into `judge-count.sh`; rc 0; last log line `spawn-failed`, `rc=75`, `error` contains `could not lock` | restore `>/dev/null 2>&1 \|\| true`: no `spawn-failed` line |
| T6 | `parked and status list a parked file that is not a JSON object` | `[]` in `$PARKED/111-1.json`; `parked` rc 0 printing `111-1 (not a JSON object)`; `status` rc 0 with it on stderr | drop the `isinstance` check: `AttributeError`, rc 1 for both |
| T7 | `init refuses a Unicode digit issue without a traceback and changes nothing` | no state; `init RESEARCH ²` rc 1, stderr has `issue must be a GitHub issue number`, no `Traceback`, no state file, no parked dir | plain `isdigit()`: `int("²")` raises, `Traceback` on stderr (red on macOS and in `ubuntu:24.04`) |
| T8 | guard blocks brace, comma and double-slash spellings of `.claude` (5 rows) | blocked loop (`:881`), rc 2: `rm -rf .claude/{hooks,}`, `mv .claude, x`, `rm -rf .claude/{pipeline.json,x}`, `rm -rf .claude//hooks`, `rm -rf .claude/h{ooks,}` | restore today's `CLAUDE_DIR_TOKEN`: all five pass (each traced: no core prefix, no old alternative) |
| T8b | `a brace inside the first component after .claude/ is blocked` | the `.claude/h{ooks,}` row of T8, named separately | drop `{` from alternative 3's class: only this row turns green-to-red, the other four stay blocked by alt 1/2 |
| T9 | `accepted false positive: brace list under .claude is blocked` | `rm -rf .claude/{agents,feedback}/x` in the blocked loop, comment naming decision 1 | restore today's `CLAUDE_DIR_TOKEN`: allowed |
| T10 | `stray .claude token gets the .claude directory message` | `put_state PROJECT coder`; `bashcmd "rm -rf node_modules/.claude"` rc 2, stderr contains `.claude directory` and not `pipeline.json` | one combined message (today's): stderr lists the core files |
| T11 | `foreign-state is logged once per session and checkout` | `put_state` + `edit_state gitdir_at_init=/elsewhere/.git`; `rm -f "$LOG"`; three Write inputs for `plans/x.md` with `session_id` S1, S1, S2; `grep -c '"foreign-state"'` = 2; a fourth input with `session_id` `"\ud800"` (JSON escape, lone surrogate): rc 0, and the `foreign-state` count is now 3 | (a) drop the marker check: count 3 after three calls; (b) key without `session_id`: count 1; (c) in `_foreign_marker_is_new`, replace `encode("utf-8", "backslashreplace")` with `encode("utf-8")`: the fourth call raises `UnicodeEncodeError`, which no handler catches (the helper catches only `OSError`, 2.5), `checkout.py context` exits 1, the write gate blocks with rc 2 `pipeline resolver failed`; the row asserts rc 0 |
| T12 | `watchdog survives a non-numeric ts and still warns` | `put_state PROJECT coder 77 120`, `edit_state` with `phase_history: [{"phase":"coder","ts":"x"}]`; `rm -f "$LOG" "$TMPDIR"/pipeline_watchdog_*`; watchdog hook; log has `watchdog-notify`, no `observer-crash` | restore the inline loop: `TypeError`, `observer-crash`, no notify |
| T13 | existing suite (about 200 rows) after the `lib/` extraction | unchanged rows | (a) `pl_write_gate.decide` returns at its first line: every blocked Write row is red; (b) `pl_shell_guard.decide` returns at its first line: the guard spelling rows are red |
| T14 | mypy job | the 2.8 command exits 0 | (a) annotate `pl_gate.tier_of` as returning `int`; (b) one annotation as `str \| None` without a future import: both exit non-zero |
| T15 | `hooks fail safe when lib/common.sh does not load` | back up `$H/lib/common.sh` to `$BASE`, insert `fi` as its first line; `write_to plans/x.md` rc 2 with `common.sh did not load`; `bashcmd "ls"` rc 2 with the same; `phase-gate.sh` (Agent input) rc 2; `pipeline-watchdog.sh` rc 0; `pipeline-advance.sh status` rc 1 with `ERROR: lib/common.sh did not load`; restore, `cmp` against the backup | (a) delete the sentinel check from `require-pipeline.sh`: rc 127 (reproduces the fail-open); (b) delete the `PL_COMMON_LOADED=1` line from `common.sh` (unbroken copy): every PreToolUse gate blocks, so the existing allow rows go red |
| T15b | `an inherited PL_COMMON_LOADED does not fake a load` | same broken copy, `PL_COMMON_LOADED=1` exported for the `write_to` call: rc 2 with `common.sh did not load` | drop the `unset`: rc 127 |
| T15c | `stop is never blocked when lib/common.sh does not load` (two rows: `stop_hook_active` false, true) | same broken copy, `put_state PROJECT coder` (so a working hook would block, cf. `run.sh:173`); `stop 0` and `stop 1`: both rc 0, stderr contains `not blocking` and `common.sh did not load` | give `phase-complete.sh` the PreToolUse gate fallback (`exit 2`): both rows rc 2. Without any check: rc 127 and no `common.sh did not load` text, also red |
| T15d | `stop is never blocked when python3 is unusable` | unbroken `common.sh`, `put_state PROJECT coder`; `stop_json 0 \| PATH="$BASE/badpy:$PATH" bash "$H/phase-complete.sh"`: rc 0, stderr contains `not blocking` and `python3 not found or unusable`. The existing row `broken python3 blocks gates` (`:412-416`) stays green, proving the branch did not leak to `require-pipeline.sh` | (a) drop the `stop)` branch from `pl_fail`: rc 2; (b) `phase-complete.sh` keeps `HOOK_KIND=gate`: rc 2; (c) `common.sh:10` without `stop`: the kind is coerced to `gate`, rc 2 |
| T16 | `an unreadable pl_write_gate.py blocks as a crash, not as an empty verdict` | save the mode, `chmod 000 "$H/lib/pl_write_gate.py"`; `write_to plans/x.md`; restore mode; rc 2, stderr contains `failed internally (rc=70)`; `tail -n 2 "$LOG"`: the last line has `event` `gate-crash` and `rc` `70`, the line before has `event` `gate-no-verdict` and `rc` `2`; mode equal to the saved one. `pl_write_gate.py` is run as a script, which CPython never caches, so chmod is effective | drop the `\x1f` test in the wrapper: rc 2 but stderr is `BLOCKED: ` with an empty message, no `failed internally`, no `gate-no-verdict` line |
| T17 | `an unreadable pl_shell_guard.py blocks as a crash, not as an empty verdict` | same with `chmod 000 "$H/lib/pl_shell_guard.py"` and `bashcmd "ls"`; same two log lines | same mutation in `bash-code-guard.sh` |
| T18 | `a missing pl_gate.py blocks both gates as a crash` | `cp -p "$H/lib/pl_gate.py" "$BASE/pl_gate.py.bak" && mv "$H/lib/pl_gate.py" "$BASE/pl_gate.py.aside"`; `write_to plans/x.md` and `bashcmd "ls"`: both rc 2, stderr `failed internally (rc=1)`, last log line `gate-crash` with `rc` `1`; then `mv "$BASE/pl_gate.py.aside" "$H/lib/pl_gate.py"` and `cmp "$BASE/pl_gate.py.bak" "$H/lib/pl_gate.py"`. Why move, not chmod: `pl_gate` is imported, earlier rows have written `lib/__pycache__/pl_gate.cpython-*.pyc` (`python3 -I` does not stop bytecode writes), and CPython's source loader only stats the source and loads a pyc whose recorded mtime and size match, so a mode-000 source still imports. A `__pycache__` pyc is never used without its source (PEP 3147), so a missing source raises `ModuleNotFoundError` -> traceback -> rc 1 | wrapper treats any rc other than 2 as allow (`[ "$rc" = 2 ] \|\| return 0`): rc 0 for both gates |

Not added, with reason: a row proving the `error` field never carries the handback message (the CLI never receives
`tool_input.message`, so no plausible mutation could make it red; the canary row `:613-618` keeps covering the
recorded path). No rows for `require_grant` / `_pick_parked` / `_test_delay` with non-ASCII digits: no CLI path
reaches them with one (bash rejects it for issue tiers; `_test_delay` reads a test-only env value); T7 guards the
helper. No suite rows asserting that the residual spellings of 2.4 pass: a row that pins a hole open is a test of
a defect; the R-check in 3.3 verifies the ADR text instead. No row for the `phase-complete.sh` resolver-failure
path: it is the same `pl_fail` branch as T15d.

### 3.3 How the tester runs mutations

- Never mutate the live `.claude/hooks`: they gate the running session. Export the working tree to scratch (same
  export command as 10.1 P1), apply the mutation there with a backup copy, run `bash "$EXP/tests/pipeline/run.sh"`,
  restore from the backup and prove it with `cmp`. `run.sh` copies `.claude` from its own `../..`.
- One fresh zsh per Bash call: paths in `$SCRATCH/env.sh`, sourced each call, guarded with `: "${SCRATCH:?}"`,
  backup and mutation chained with `&&` (architect_mistakes, #1).
- Linux runs (T1, T2, T7 under their mutations; T15-T18 once green): `ubuntu:24.04` as a **non-root user**,
  because root ignores `chmod 000` and T16, T17 (and the existing rows at `:402` and `:424`) would go red on correct
  code. Shape: `docker run --rm -v "$EXP:/src:ro" ubuntu:24.04 bash -c 'apt-get update -qq && apt-get install -y
  -qq git python3 >/dev/null && useradd -m t && cp -R /src /home/t/src && chown -R t /home/t/src && su t -c "bash
  /home/t/src/tests/pipeline/run.sh"'`. The tester runs this once on the green tree before trusting any red run.
  T2 is reported with its red count over 3 rounds; T1 and T7 must be red on every run.
- **T18 mechanism check (once, scratch, `/usr/bin/python3` 3.9.6):** in a scratch copy where the suite has run,
  confirm `lib/__pycache__/pl_gate.cpython-39.pyc` exists, then run the rev 2 variant (`chmod 000` on
  `pl_gate.py`, no move) and record that `write_to plans/x.md` is still allowed (rc 0). This proves the cache
  explanation behind T18 instead of assuming it; if the observation differs, the tester reports it and the row is
  re-derived before the step is installed.
- **R-check (B1):** every spelling in the 2.4 table is fed once through the final guard in the scratch export
  (hook JSON from a scratch file into `bash-code-guard.sh`, `put_state` irrelevant outside PIPELINE: use a
  non-PIPELINE state) and its rc recorded in the test report. Any row whose observed result differs from the table
  is a design defect: the ADR item 7 text is corrected before the docs step, not the table bent to fit.

## 4. Alternatives considered

| Alternative | Rejected because |
|---|---|
| Keep the temp file, fix the template (`pipeline_py.XXXXXX`, or `mktemp -t`) | still a file per call that a kill can strand, and `-t` differs between BSD and GNU; stdin needs no file |
| `python3 -I -c "$script"` | scripts would still be built from shell strings; stdin heredocs plus argv remove quoting entirely |
| Move `read_state` / unanimity / notify into `state.py` read ops | larger CLI change for a one-line bug; section 5 |
| Retry a failed vote once | Stepan decision 3; it would hide this class of bug |
| CI job on a `macos` runner instead of a shim | catches BSD differences only incidentally, roughly ten times the runner cost |
| A test seam inside `py_run` | test code in the product path, and the mutation replaces `py_run` wholesale |
| mypy step inside the existing `pipeline` job | PEP 668 refuses `pip install` into the runner's system Python; a separate job with `setup-python` avoids it |
| Hash-pinned requirements | needs pip-tools; read-only token, no secrets, exact pins plus `--no-deps` already make every version deliberate |
| The issue's token rule `\.claude(?![\w./-])` | stops blocking `rm -rf .claude/` and still passes `.claude/{hooks,}` |
| Normalise the command (strip quotes, collapse `./`) before matching | a partial shell parser; the threat model keeps the guard a heuristic (ADR-0005 item 1), and each normalisation adds false positives; the residuals are documented instead |
| `foreign-state` dedupe with a time window | the information changes with session, checkout and state, not with time |
| One `lib/gates.py` for both gates | two files mirror the two hooks; the shared part fits `pl_gate.py` |
| Gate verdict mapping as a helper in `common.sh` | one more edit to the file every hook sources (section 10); three duplicated lines in two wrappers are cheaper |
| `run_hook "$@" \|\| {...}` instead of a sentinel | covers only a missing `run_hook` (2.10) |
| Insert `lib/` first on `sys.path` instead of prefixing names | a lib file would then shadow the stdlib (the #21 nested-`json` lesson); appending keeps stdlib and site-packages first, the prefix avoids collisions with site-packages |
| Edit live hook files in place (Edit tool) | a running bash reads its script incrementally, and a concurrently starting hook can read a half-written file; `mv` swaps the inode atomically |
| Export with `git archive HEAD` only | earlier steps may not be committed yet when the next one starts; the working-tree export (10.1 P1) sees them either way |
| Stop gate fallback that blocks once by matching `"stop_hook_active": true` in stdin with bash `case` | a string match on JSON whitespace variants is a second, untested parser; in a lockout the session cannot repair anything, so one extra block buys nothing |
| Positive allow token on the entry scripts' stdout | changes every allow path's contract for a state (empty entry script) that the install smokes already detect (2.7) |
| `chmod 000` plus `rm -rf lib/__pycache__` for T18 | also works, but depends on every cache location (`PYTHONPYCACHEPREFIX` would move it); a missing source defeats any cache |

## 5. What NOT to build

- No vote or spawn retry (decision 3).
- No shell parser or normalisation for the guard, no new write verbs: residuals documented in ADR-0005 item 7.
- No deduplication of `state-unreadable`, `resolve-fallback` or `worktree-skipped`.
- No extraction of the inline Python in `phase-complete.sh`, the `pipeline-advance.sh` stdin scripts or the
  watchdog marker logic. Possible later issue: read ops in `state.py`, together with a non-looping crash mapping
  for the Stop gate (2.10 residual).
- No mypy for `run.sh`'s inline Python.
- No renaming of the existing `cfg`, `checkout`, `state`, `hookio` modules: their exposure to a same-named
  site-packages module is unchanged by this issue (`lib/` is appended), and renaming touches every caller; a
  candidate follow-up.
- No live verification of the kill switch in a worktree session (follow-up 9 is docs only).
- No change to the `common.sh` Python floor (3.9).

## 6. Coverage matrix (issue part 2, research numbering)

| # | Follow-up | Where | Test |
|---|---|---|---|
| 1 | `op_parked` on a non-object | 2.3 | T6 |
| 2 | one token-end rule | 2.4 | T8, T8b, T9 |
| 3 | Unicode digits | 2.3 | T7 |
| 4 | ADR item 7 write verbs | 2.9 | docs, R-check |
| 5 | ADR item 8 L3 answer | 2.9 (+ hookio docstring) | docs |
| 6 | guard header, design 2.7 | 2.4, 2.9 | docs |
| 7 | message for a stray `.claude` | 2.4 | T10 |
| 8 | design R3 L4 | 2.9 | docs |
| 9 | kill switch reach in worktrees | 2.9 (CLAUDE.md) | docs |
| 10 | `foreign-state` volume | 2.5 | T11 |
| 11 | inline gate Python | 2.7 | T13, T16-T18 |
| 12 | watchdog `last_activity` copy | 2.6 | T12 |
| 13 | type annotations | 2.8 | T14 |
| 14 | design 2.3 vs 2.6 | 2.9 | docs |
| Part 1 | temp file race, `$STATE_FILE` in source, error logging | 2.1, 2.2 | T0-T5 |
| Review | hooks fail safe without `common.sh`; Stop never loops on it | 2.10 | T15, T15b, T15c, T15d |

## 7. Failure modes and mitigations

| # | Failure | Mitigation |
|---|---|---|
| F1 | A hook edit in this PIPELINE task breaks the hooks for the running session. Files executed by more than one hook: `lib/common.sh` (all hooks), `lib/checkout.py` (resolver of every hook, imported by both gates), `lib/cfg.py` (imported by both gates and the CLI), `lib/hookio.py` (shell guard, phase gate, judge hooks), `lib/state.py` (CLI, watchdog after step 7), `lib/pl_gate.py` and `lib/pl_jsonshape.py` (the write gate from step 8, both gates from step 9; `pl_jsonshape` also every typed module after step 10). Breaking one of the first three locks out Write and Bash together (a syntax error in `checkout.py` or `cfg.py`: every command blocked); breaking `common.sh` before step 1 turns every guard off (rc 127). A session running in the #15 worktree (`content/15-module-introduction`) forwards every hook to main's live files (`common.sh:43-44`), so each install acts on that session too, and a lockout locks it out as well | No step relies on "repair through the other gate" for a shared file. Every hook change follows 10.1: built and tested in a scratch export on 3.9.6 first, installed one file per atomic `mv`, then smokes that detect lockout (positive smokes) and fail-open (negative smokes on the live scripts). Step 1 ships the sentinel first, so a later `common.sh` breakage locks out instead of failing open. The pl_* modules are written annotated but are mypy-verified only at 10e (2.8); a change 10e needs in the frozen `pl_gate.py` is a shared-file install. Recovery table 10.2; lockout of both gates -> Stepan's kill-switch runbook 11.2. Stepan pauses or quits any Claude Code session in the #15 worktree before step 1 and restarts it after step 11's smokes pass (11.2, 12) |
| F2 | The shim is not first on `PATH` or silently delegates | T0 |
| F3 | T2 flaky on the fixed code | depends only on flock and per-pid temp files; a red T2 on fixed code is investigated, never retried |
| F4 | T2 stays green under the mutation on a fast Linux box | T1 is the deterministic red; the tester reports T2's red count |
| F5 | A stale literal `$TMPDIR/pipeline_py.XXXXXX.py` on Stepan's Mac after the merge | harmless after the fix (T1) |
| F6 | The `error` field leaks something sensitive | first line of the CLI's own output, which never receives the handback message; capped; absolute paths documented (ADR item 6, design 2.3) |
| F7 | Marker creation for `foreign-state` fails (TMPDIR unwritable) or the session id holds a lone surrogate | `OSError` -> the helper returns `True` and the line is logged anyway; the key encode uses `backslashreplace`, which cannot raise for a `str` (2.5); any other exception fails closed and T11(c) proves the encode path |
| F8 | Markers accumulate in TMPDIR | one empty `0o600` file per session, checkout and status; OS cleans TMPDIR |
| F9 | The stricter `.claude` rule blocks a legitimate command | accepted (decision 1); name paths without braces; T9 |
| F10 | Annotations use 3.10+ runtime syntax and break hooks on the 3.9.6 runtime (every gate fails closed) | mypy targets 3.9 (T14b); every step's scratch suite runs on `/usr/bin/python3` 3.9.6 before install (10.1 P3-P4), so an evaluated `X \| None` fails in scratch, not live |
| F11 | Typing changes behaviour | the suite on 3.9.6 per module (step 10a-10d); the only intended change is a message instead of a traceback on malformed shapes. `cfg.load()`'s new validation runs against the real `pipeline.json` in the scratch export before it goes live |
| F12 | PyPI or `setup-python` unavailable in CI | `pipeline-types` red until a re-run; no hook behaviour depends on it |
| F13 | A pinned wheel disappears from PyPI | install fails loudly (`--no-deps`, exact pins); repin deliberately |
| F14 | A new lib module shadows or is shadowed | `python3 -I` keeps the script directory off `sys.path`; `lib/` is appended, so stdlib wins; the `pl_` prefix keeps site-packages names (`gate`) from shadowing ours; the stdlib-shadow row (`:371`) keeps running |
| F15 | Process restart mid-operation | state writes are flock transactions with atomic replace; `py_run` leaves nothing behind; an install interrupted between `cp` and `mv` leaves only a `<file>.install` sibling, which no hook reads (10.1 P5) |
| F16 | CPython cannot open `pl_write_gate.py` / `pl_shell_guard.py` (missing, unreadable) and exits 2 with empty stdout, which would look like a verdict with an empty message. An entry script is empty | the wrappers require `\x1f` in stdout for a verdict; rc 2 without it is `gate-no-verdict` -> crash path, `failed internally (rc=70)` (T16, T17); entry scripts are run directly and never cached, so an unreadable one really fails. `pl_gate.py` is imported: an **unreadable** `pl_gate.py` is not a crash while a matching `__pycache__` pyc exists (CPython stats the source and loads the pyc), so the gates keep running the last good code, which is not fail-open; a **missing** `pl_gate.py` is `ModuleNotFoundError`, rc 1, crash (T18). All of these block. An empty entry script exits 0 (allow): residual, same as an empty wrapper today, core-protected, caught by the S2 negative smokes after every install (2.7) |
| F17 | `lib/common.sh` broken or missing; python3 unusable; resolver failure | before step 1: rc 127, guards off (detected by 10.1 P6 negative smokes, repaired at once, 10.2); from step 1 on: PreToolUse gates exit 2 with `common.sh did not load`, observers 0, CLI 1 (T15); the Stop gate warns and exits 0 whatever `stop_hook_active` says (T15c), and the same for python3 missing or a resolver failure through `pl_fail`'s `stop` branch (T15d), so the session can stop and hand over instead of looping. Residual: a crash inside `phase-complete.sh`'s `main_fn` still blocks every Stop (2.10); Stepan interrupts the session |
| F18 | Both gates locked out during the work | no tool call can repair it; the coder stops and reports; Stepan runs 11.2. Since rev 3 the Stop hook does not keep the session busy meanwhile (F17) |
| F19 | An install overwrites a script while a hook is executing it; a cached pyc outlives a module change | install is `cp` to `<file>.install` in the same directory, then `mv -f` (rename keeps the running process on the old inode). `cp -p` keeps the export's mtime, and CPython reuses a pyc whose recorded mtime (seconds) and size match the source, so for `.py` files P5 runs `touch` on the `.install` file before `mv`: the installed source always has a fresh mtime, and installs are separate tool calls, never two in the same second |
| F20 | `pipeline-types` not a required check | the job reports but does not block merges; Stepan adds it (section 12) |
| F21 | `ubuntu:24.04` mutation run as root makes chmod rows fail on correct code | non-root user (3.3); the tester runs the green tree there first |

## 8. Key decisions

1. **stdin instead of a temp file**, because it removes the shared file name, the kill-stranded file and the
   BSD/GNU divergence in one move, and the watchdog already proves the pattern.
2. **Shell values reach Python only through argv**, because pasting `$STATE_FILE` into `r'...'` breaks on a `'`
   and is code injection by construction. The shim follows the same rule (template as `sys.argv[1]`).
3. **A generated BSD shim, suite-wide**, because CI runs GNU and the regression is BSD-only.
4. **Log, do not retry** (decision 3), spawn failures included, because the spawn map is the vote fallback.
5. **The researcher's token rule plus `{` in alternative 3**, because it was checked on 17 cases, the issue's rule
   breaks `rm -rf .claude/`, and `.claude/h{ooks,}` expands to the hooks directory.
6. **Marker-based `foreign-state` dedupe whose only handled failure is `OSError`**, because the information changes
   with session, checkout and status, `_context` runs in every hook, and a `backslashreplace` encode cannot raise,
   so a `UnicodeError` handler would be dead code that hides a mutation.
7. **Gate Python to `lib/` before typing**, because mypy cannot see inline strings and the refactor is verified by
   the unchanged suite before annotations change anything.
8. **A verdict needs `\x1f`; rc 2 alone is a crash**, because CPython uses rc 2 for "cannot open script" and the
   gate contract must not depend on an interpreter exit code it does not own.
9. **Sentinel in `common.sh`, checked by every hook, shipped first**, because a broken shared library must fail
   closed like every other gate failure, and every later step edits shared files.
10. **`pl_` prefix for new modules, `lib/` stays appended**, because prepending lets a lib file shadow the stdlib
    and a generic name like `gate` can be shadowed by site-packages.
11. **mypy 1.20.2 on 3.12 targeting 3.9, own job, exact pins, cache outside the repo, modules typed in import-graph
    order (cfg, checkout, hookio, state, then the pl_* check)**, because 2.x rejects a 3.9 target, mypy cannot run
    on the 3.9 runtime, PEP 668 blocks the system Python, a repo cache dirties the tree, and `--strict` flags a
    call into an untyped module in the caller's file.
12. **Scratch-first, one atomic install per file, smokes after each**, because hook edits in a PIPELINE task act on
    the running session immediately and a broken shared file either locks out or fails open.
13. **No ADR beyond amending ADR-0005**, because nothing here is costly to change (no schema, lesson contract,
    workspace API or public route); the trust model is unchanged and ADR-0005 is still Proposed.
14. **The Stop gate warns and allows when it cannot evaluate (`HOOK_KIND=stop`)**, because its contract is to block
    at most once per turn, a gate that cannot read `stop_hook_active` can only honour that by not blocking, and in
    a lockout stopping is the way to reach Stepan. PreToolUse gates keep failing closed: they protect writes,
    Stop only checks completion.

## 9. Deploy awareness

- New files: `.claude/hooks/lib/pl_gate.py`, `pl_write_gate.py`, `pl_shell_guard.py`, `pl_jsonshape.py`. They
  reach the runtime by living next to the existing lib modules: hooks call `$LIB/<name>.py` where `LIB` is the
  main checkout's (worktree copies forward to main's scripts); modules import each other through the existing
  `sys.path.append(HERE)` pattern. `run.sh` copies `.claude` wholesale. CI `py_compile .claude/hooks/lib/*.py` and
  the mypy glob pick them up. No new `.sh`, so `settings.json` wiring and its test row are unchanged.
- Runtime interpreter: the hooks run on `/usr/bin/python3` 3.9.6 on Stepan's Mac (operations judge); every
  scratch suite run uses it (10.1 P4). mypy runs on 3.12 (CI `setup-python`, local `/opt/homebrew/bin/python3.12`).
- New file `tests/pipeline/requirements-typecheck.txt`, used only by the CI job and the scratch venv.
- New CI job `pipeline-types`; the existing `pipeline` job is unchanged. Required check: section 12.
- No `.gitignore` change: markers live in TMPDIR, the mypy cache outside the repo, the install sibling
  `<file>.install` exists only between `cp` and `mv` in one command.
- Leave `.github/CODEOWNERS` (unrelated working-tree change) out of every commit.
- Other sessions on the same hooks: the #15 worktree session forwards to main's files (F1); Stepan pauses it
  during the hook steps (section 12).

## 10. Ordered coder steps and the live install procedure

### 10.1 Live install procedure (every step that changes `.claude/hooks/**`)

Setup once: `$SCRATCH/env.sh` defines `SCRATCH`, `MAIN=/Users/stepankorshukov/Documents/Projects/academy`, and is
sourced at the start of every Bash call with `: "${SCRATCH:?}"`. Two smoke inputs are written once with the Write
tool into scratch: `$SCRATCH/smoke-write.json` (a `PreToolUse` `Write` input, `cwd` `$MAIN`, `file_path`
`$MAIN/.git/pipeline-smoke`) and `$SCRATCH/smoke-bash.json` (a `PreToolUse` `Bash` input, `cwd` `$MAIN`, command
`rm -rf .git/pipeline-smoke`). They live in files so the Bash calls below never contain the blocked text.

- **P1 export** the working tree as git sees it (tracked plus untracked non-ignored, so uncommitted earlier steps
  are included): `EXP=$SCRATCH/export-<step>`, `rm -rf "$EXP" && mkdir -p "$EXP" && git -C "$MAIN" ls-files -z -co
  --exclude-standard | tar -C "$MAIN" --null -T - -cf - | tar -C "$EXP" -xf -`.
- **P2 change** the files in `$EXP` only (Edit/Write on scratch paths).
- **P3 static checks** in `$EXP`: `bash -n` on every changed `.sh`; `/usr/bin/python3 -I -m py_compile` on every
  changed `.py` (3.9.6, the live runtime); `shellcheck -S error` (docker `koalaman/shellcheck` if not installed);
  the Cyrillic check (`rg '[\x{0400}-\x{04FF}]'`) on changed files.
- **P4 suite in scratch on the live interpreter**: `PATH="/usr/bin:$PATH" bash "$EXP/tests/pipeline/run.sh"` green;
  every new row red under its mutation (3.3) in a copy of `$EXP`.
- **P5 install**, one file per Bash call, in dependency order (new modules first, then modules that import them,
  then wrappers; `common.sh` before any wrapper that relies on it): first back up the live file once per step
  (`mkdir -p "$SCRATCH/backup-<step>" && cp -p "$MAIN/<f>" "$SCRATCH/backup-<step>/"`, skipped for new files), then
  `cp -p "$EXP/<f>" "$MAIN/<f>.install" && mv -f "$MAIN/<f>.install" "$MAIN/<f>"`; for a `.py` file
  `cp -p "$EXP/<f>" "$MAIN/<f>.install" && touch "$MAIN/<f>.install" && mv -f "$MAIN/<f>.install" "$MAIN/<f>"`
  (F19: a fresh mtime invalidates any cached pyc). Never Edit/Write a live hook file in place.
- **P6 smokes immediately after each install, in this order** (each its own tool call):
  - S1 Bash: `bash "$MAIN/.claude/hooks/pipeline-advance.sh" status` -> rc 0 (also proves the live shell guard
    lets a harmless command through);
  - S2 Bash: `bash "$MAIN/.claude/hooks/require-pipeline.sh" < "$SCRATCH/smoke-write.json"; echo "rc=$?"` and the
    same for `bash-code-guard.sh` with `smoke-bash.json` -> both `rc=2`. Reading the result:
    - `rc=2` with a `.git` message: closed and working (pass);
    - `rc=2` with `common.sh did not load` (possible from step 1 on): closed, **not** fail-open, but a lockout to
      repair (10.2), not a pass;
    - `rc=127` or `rc=0`: fail-open (10.2);
  - S3 Write tool: `$SCRATCH/smoke.txt` -> succeeds (proves the live write gate lets a normal write through).
- **P7** `bash "$MAIN/tests/pipeline/run.sh"` on the live tree (it tests a temp copy, so it is safe), then the
  step's commit text (`Refs #23`, Conventional Commits, no AI attribution).

Steps that change only a single-gate file still use P1-P7: the procedure costs minutes and removes the need to
classify each edit correctly.

### 10.2 Recovery when a smoke fails

| Observation | Meaning | Action (next tool call, nothing else first) |
|---|---|---|
| S1 blocked, S3 succeeds | shell guard or a file only it uses is closed | restore through the write gate: Read the backup, Write its full content to `$MAIN/<f>`; re-run P6. **This is the one emergency exception to P5's "never Write a live hook file in place"**: the shell is closed, so no `cp`+`mv` is possible; the Write tool replaces the file in one call, and the risk of a concurrently starting hook reading a partial file is accepted against a broken shell guard |
| S3 blocked, S1 succeeds | write gate side closed | restore through Bash: `cp -p "$SCRATCH/backup-<step>/<f>" "$MAIN/<f>.install" && mv -f "$MAIN/<f>.install" "$MAIN/<f>"` (or `rm` a new file); re-run P6 |
| S1 and S3 both blocked, or S2 shows `rc=2` with `common.sh did not load` | shared file broke both gates (lockout) | stop, report to the orchestrator with the file name and backup path; Stepan runs 11.2 |
| S2 shows rc 127 or rc 0 | fail-open | restore by Bash cp+mv from the backup at once (the guards will not stop it), re-run P6, report the incident in the test report |

### 10.3 Steps

Shared-file steps (F1 list) are marked **[shared]**.

1. **`fix(pipeline): fail closed when lib/common.sh does not load`** **[shared]** - 2.10 (sentinel, the Stop gate's
   own fallback, `HOOK_KIND=stop` and `pl_fail`'s `stop` branch); rows T15, T15b, T15c, T15d. Install order:
   `common.sh` (new last line, inert until checked; `stop` kind accepted, unused until `phase-complete.sh` sets it),
   then each of the nine scripts, `phase-complete.sh` among them.
2. **`fix(pipeline): run inline python from stdin, not a mktemp file`** - 2.1; shim (3.1); rows T0-T3. Check: T1
   red under the restored `py_run`, also in `ubuntu:24.04` (non-root).
3. **`fix(pipeline): log why a vote or spawn was not recorded`** **[shared]** - 2.2; rows T4, T5. Order:
   `checkout.py` (`LOG_FIELDS`), `common.sh`, `judge-count.sh`.
4. **`fix(pipeline): list non-object parked files and accept only ascii digits`** **[shared]** (`state.py`, CLI) -
   2.3; rows T6, T7 (T7 red in `ubuntu:24.04` too).
5. **`fix(pipeline): one token-end rule for the .claude shell guard`** - 2.4; rows T8, T8b, T9, T10; the allowed
   loop (`:887-892`) stays green; R-check (3.3).
6. **`fix(pipeline): log foreign-state once per session and checkout`** **[shared]** (`checkout.py`) - 2.5; T11.
7. **`refactor(pipeline): watchdog uses state.last_activity`** - 2.6; T12.
8. **`refactor(pipeline): move the write gate python into lib`** **[shared]** - `pl_jsonshape.py`, `pl_gate.py`,
   `pl_write_gate.py` (annotated from creation, mypy-verified at 10e), then `require-pipeline.sh`; T13a, T16, T18
   (write-gate half), plus the 3.3 T18 mechanism check. Shell guard untouched.
9. **`refactor(pipeline): move the shell guard python into lib`** - `pl_shell_guard.py`, then
   `bash-code-guard.sh`; `pl_gate.py` unchanged (frozen); T13b, T17, T18 (shell-guard half).
10. Typing, one commit per module, each **[shared]**, in import-graph order (2.8: callees first); at HEAD 229
    strict errors across the four old modules:
    - 10a **`refactor(pipeline): strict types for cfg`** - annotations plus `ConfigError` validation (no lib
      imports);
    - 10b **`refactor(pipeline): strict types for checkout`** (imports `cfg`, typed in 10a);
    - 10c **`refactor(pipeline): strict types for hookio`** (imports `cfg`, `checkout`, typed in 10a/10b);
    - 10d **`refactor(pipeline): strict types for state`** (imports `cfg`, `checkout`);
    - 10e **`build(pipeline): pinned mypy ci job for the hook python`** - `requirements-typecheck.txt`,
      `pipeline-types` job; local mypy on 3.12 green over all `lib/*.py`, which is the first point where
      `pl_write_gate`, `pl_shell_guard`, `pl_gate` and `pl_jsonshape` are verified (they call `cfg`/`checkout`);
      any fix they need, `pl_gate.py` included, is installed through 10.1 in this step; T14a/T14b red.
    Each of 10a-10d: run the 2.8 command over all `lib/*.py` in scratch and require **zero error lines located in
    that module's file** (`<module>.py:`); errors in modules later in the order are expected until their step.
    Because every module a step's module imports was typed in an earlier step, this gate is reachable. Then the
    suite on 3.9.6 green.
11. **`docs(pipeline): record #23 findings in adr-0005, the v2 design and claude.md`** - 2.9 (with the hookio
    docstring, which is a lib file: P1-P7). ADR item 7 text from the R-check results.

## 11. Rollback

### 11.1 Commits

- Each step is one commit; a bad step is reverted with `git revert <sha>` before merge, or after merge through a
  revert PR (Stepan merges). A revert of a hook file during the work is itself installed through 10.1.
- After a revert of step 2 on main, macOS is back to losing concurrent votes; nothing persistent is left behind
  (`pipeline_foreign_*` markers in TMPDIR are inert for older code).
- Reverting step 1 removes the sentinel and the `stop` kind (back to rc 127 on a broken `common.sh`, and to a Stop
  block on a missing python3); reverting step 10e removes the CI job; the hooks run the same either way.

### 11.2 Kill-switch runbook for Stepan (lockout during this task)

Run in your own terminal, not in Claude Code.

0. Before step 1 starts (not only in a lockout): quit or pause any Claude Code session running in the #15 worktree
   (`.claude/worktrees/` checkout of `content/15-module-introduction`). Its hooks forward to the main checkout's
   live files (`common.sh:43-44`), so every install in this task acts on it and a lockout locks it too. Restart it
   after the orchestrator reports step 11's smokes green.
1. `cd /Users/stepankorshukov/Documents/Projects/academy`
2. See whether the file exists: `ls -l .claude/settings.local.json`
3. If it does not exist:
   `printf '%s\n' '{"disableAllHooks": true}' > .claude/settings.local.json`
   If it exists, add the key without losing the rest:
   `/usr/bin/python3 -I -c 'import json,sys; p=sys.argv[1]; d=json.load(open(p)); d["disableAllHooks"]=True; open(p,"w").write(json.dumps(d,indent=2)+"\n")' .claude/settings.local.json`
4. Check: `/usr/bin/python3 -I -m json.tool .claude/settings.local.json` shows `"disableAllHooks": true`.
5. Quit the Claude Code session and start a new one in the main checkout (settings are read at session start).
6. Repair: the coder's report names the broken file and its backup. Restore it by hand:
   `cp -p "<backup path>/<file>" ".claude/hooks/<path>/<file>"`, or from the last commit:
   `git restore --source=HEAD -- .claude/hooks/<path>/<file>`.
7. Verify with hooks still off: `bash tests/pipeline/run.sh` ends with `0 failed`, and
   `bash .claude/hooks/pipeline-advance.sh status` prints the #23 PIPELINE state.
8. Turn hooks back on: if the file held only the key, `rm .claude/settings.local.json`; otherwise
   `/usr/bin/python3 -I -c 'import json,sys; p=sys.argv[1]; d=json.load(open(p)); d.pop("disableAllHooks",None); open(p,"w").write(json.dumps(d,indent=2)+"\n")' .claude/settings.local.json`
   and check with step 4's command that the key is gone.
9. Start a new session; the orchestrator re-runs the 10.1 P6 smokes before continuing.

If `/usr/bin/python3` itself is the problem, edit the file in an editor instead of steps 3 and 8 and check the
syntax by eye; the file is one JSON object.

## 12. Steps for Stepan

- Before step 1: pause or quit any Claude Code session in the #15 worktree; restart it after step 11 (11.2 step 0).
  Check: no `claude` process has that worktree as its cwd (`lsof -c claude -a -d cwd` lists none under
  `.claude/worktrees/`).
- Make `pipeline-types` a required status check on `main` after the PR's first CI run has reported it (GitHub
  only offers checks it has seen): repository Settings -> Branches (or Rules -> Rulesets) -> the rule for `main`
  -> Require status checks -> add `pipeline-types`. Check: `gh api repos/{owner}/{repo}/branches/main/protection/required_status_checks --jq .contexts`
  lists it (run from the repo; `gh` fills `{owner}/{repo}`; if `main` uses a ruleset instead of classic
  protection this endpoint returns 404 and the Rules page is the check).
- Lockout during the work: 11.2.
- Grant: unchanged from the PIPELINE init (`pipeline_init` contains 23); remove 23 after the merge (CLAUDE.md
  section 7).
