# Issue #23 research: concurrent handback votes fail with rc 1, plus v2 review follow-ups

Researcher, PIPELINE tier, branch `fix/23-pipeline-handback-race`, HEAD `e678c4d`.
Checked on macOS 27.0.1, `/bin/bash` 3.2.57, BSD `/usr/bin/mktemp`, Claude Code 2.1.267; GNU side
checked in `node:22-bookworm-slim` (coreutils 9.1, bash 5.2). CI runs `ubuntu-24.04`.

## Root cause verdict (Part 1)

**Reproduced, 100% of rounds.** The rc 1 is not a state race. It is the temp file of `py_run` in
`.claude/hooks/pipeline-advance.sh:36`:

```bash
local tmpf; tmpf=$(mktemp "${TMPDIR:-/tmp}/pipeline_py.XXXXXX.py")
```

BSD `mktemp` (macOS) replaces only **trailing** `X`s. With the `.py` suffix the template has none, so
every call creates the literal file `$TMPDIR/pipeline_py.XXXXXX.py`. While one `pipeline-advance.sh`
holds it (between `mktemp` and `rm -f`, lines 36-40), every other concurrent `py_run` gets
`mktemp: mkstemp failed on ...: File exists`. GNU `mktemp` treats a non-X tail as an implied
`--suffix` and randomizes, so Linux and CI never see it.

```
$ mktemp "$d/pipeline_py.XXXXXX.py"   -> rc=0  .../pipeline_py.XXXXXX.py    (literal)
$ mktemp "$d/pipeline_py.XXXXXX.py"   -> rc=1  mktemp: mkstemp failed on .../pipeline_py.XXXXXX.py: File exists
GNU (bookworm):                          /tmp/pipeline_py.z1DriG.py /tmp/pipeline_py.LG3eZm.py
```

### Exact failing line

`pipeline-advance.sh:148` `TIER=$(read_state tier)`, the first `py_run` after the status case (line 141).
Trace of a losing call (`bash -x`, captured through `pl_record_vote`'s `out`):

```
++ read_state tier
++ py_run
+++ mktemp .../tmp/pipeline_py.XXXXXX.py
mktemp: mkstemp failed on .../tmp/pipeline_py.XXXXXX.py: File exists
++ tmpf=
++ cat                       pipeline-advance.sh: line 37: : No such file or directory
++ python3 -I ''             python3: can't find '__main__' module in ''
++ local rc=1
++ return 1
+ TIER=
```

bash 3.2 does not inherit `errexit` into command substitutions, so the failed `mktemp` (line 36) does not
stop `py_run`; `cat > ""` fails, `python3 -I ""` exits 1, `py_run` returns 1, and the outer `set -euo
pipefail` (line 28) aborts on the failed assignment at line 148 with rc 1. `state.py vote` (line 172) is
never reached, so nothing is written and nothing about the vote is printed. `pl_record_vote`
(`lib/common.sh:88-95`) sees neither `Judge recorded` nor `Duplicate vote` and logs
`vote-ignored:advance-rc-1`, dropping the `mktemp` line.

### Reproduction

Harness (scratch, never under `.claude/hooks` or `tests/`):
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/harness/setup.sh`
(throwaway repo `work dir` with a copy of `.claude/` filtered like `tests/pipeline/run.sh`, branch
`fix/998-x`) and `.../scratchpad/harness/race.sh <base> <iterations> 3`, which per iteration runs
`init HOTFIX 998 -> coder -> tester -> judge_code`, writes three subagent transcripts
(`.../<session>/subagents/agent-agN.jsonl`, roles security/architecture/operations, so
`transcript_kind=main`, as live), then starts three `judge-handback.sh` calls in the background with
`PreToolUse/SubagentHandback` JSON (`cwd` = repo, `tool_input.message` = `Checked.\nPASS`), waits,
and counts `judge_votes` from `pipeline-advance.sh status`.

| Run | Rounds | Calls | Lost | Log per round |
|---|---|---|---|---|
| HEAD | 30 | 90 | 60 | 1 `vote-recorded`, 2 `vote-ignored:advance-rc-1` |
| HEAD | 50 | 150 | 100 | same, every round |
| `py_run() { python3 -I - "$@"; }` (scratch copy) | 50 | 150 | 0 | 3 `vote-recorded` |

In the harness all three hooks overlap, so exactly one survives; live, operations came 7 s later, so
only one of three was lost (log lines 16-19, 2026-10-27 20:23:49-50).

### Why the live log fits this and nothing else
- No `resolve-fallback`, `foreign-state` or `state-unreadable` line from the inner
  `pipeline-advance.sh` at 20:23:49; `checkout.py context` (`lib/checkout.py:303-309`) logs each of those,
  so `STATE_STATUS` was `own:HOTFIX:judge_code` and the CLI got past line 141.
- `none` (not logged) needs a missing state file; `state.save` (`lib/state.py:170-174`) is
  temp-file-per-pid + `os.replace`, so the path never disappears.
- rc 3 / rc 75 are the only non-zero exits of `state.py vote`; rc 1 from it would need `_require` or an
  unreadable state, both logged or impossible with atomic replace.

### Ruled out (evidence)
- Torn or missing state on unlocked reads: `os.replace` is atomic; `read_state` / `check_judges_unanimous`
  open the path once and get the old or the new inode. With `py_run` fixed, 150/150 votes recorded.
- flock fd across forwarding: each `state.py` opens its own fd (`state.py:137`) and closes it in
  `finally`; `exec` forwarding in `common.sh:42` holds no lock fd. Not involved.
- Forwarding / worktree: the harness has no worktree and fails the same way; the temp path depends only
  on `TMPDIR`, which is per user (`/var/folders/.../T/`), so collisions also happen across checkouts and
  sessions.

### Blast radius of the same defect (every `py_run`, macOS only)
- `pipeline-advance.sh:148-150` (`read_state` tier/phase/issue): every vote, `spawn` (the judge-count hook
  for three judges spawned in one message, so spawn-map entries are lost the same way), `compound`, `pr`,
  `notify` and every advance exits 1 with only the `mktemp` line.
- `:267` `UNAN=$(check_judges_unanimous ...)` when leaving a judge phase: exit 1, no BLOCKED text.
- `:90` `status` -> `read_state_json` (not in a substitution): exit 1.
- `:177` `Round status:` inside `echo`: the vote is already written; only the status text is empty.
- `:229` notify body, `:93` foreign status text.
- **Stale literal file**: `py_run` has no trap, so a kill between `mktemp` (36) and `rm -f` (40)
  leaves `$TMPDIR/pipeline_py.XXXXXX.py`, and then every `py_run` fails until it is removed by hand.
  Reproduced by creating the file in the scratch `TMPDIR`: `status` rc 1, `judge_code` rc 1; removing it
  restores rc 0. Not observed live (only an unrelated `pipeline_py.aM5ZZh` from Oct 24 is in `$TMPDIR`).

### Existing pattern for the fix
`pipeline-watchdog.sh:13` already runs inline Python as `python3 -I - args <<'PY'` with no temp file.
All `py_run` callers feed the script on stdin (`echo ... | py_run`, heredocs at 54, 229), so
`py_run() { python3 -I - "$@"; }` is a drop-in (verified in the scratch run above).
Side finding: `read_state`, `read_state_json`, `check_judges_unanimous` and the notify body interpolate
`$STATE_FILE` into Python source as `r'$STATE_FILE'` (lines 44, 45, 56, 231); a checkout path with `'`
is a SyntaxError (code reading, not reproduced). Passing the path as `sys.argv` fixes both.

### Logging the error line
`pl_record_vote` captures stdout+stderr together (`2>&1`, `common.sh:89`); the first line is the error.
`checkout.log_event` drops any key not in `LOG_FIELDS` (`lib/checkout.py:41-45`), so a new field (e.g.
`error`) must be added to the whitelist; values are already capped at 200 chars
(`LOG_VALUE_MAX_CHARS`, `:37`). The CLI never receives `tool_input.message`, so the line cannot carry
the handback text; it can carry absolute paths (see follow-up 14).

### Test that can fail in CI
A concurrent `judge-handback.sh` test passes on Linux even unfixed (GNU randomizes). For a row that
goes red in CI under the mutation "restore the mktemp `py_run`", the test needs BSD behaviour, e.g. a
`mktemp` shim prepended to `PATH` that creates the literal template and fails with `File exists` when it
is present (the hooks call `mktemp` by name). With the stdin `py_run` the shim is never called.
Expected rows: (a) N rounds x 3 concurrent `judge-handback.sh`, all votes recorded with
`path: handback`; (b) a pre-existing literal `$TMPDIR/pipeline_py.XXXXXX.py` does not break `status`
or a vote; (c) a failing vote logs the first output line (e.g. under `hold_lock`, the existing rc 75 row
at `tests/pipeline/run.sh:902-906`, assert the new field contains `could not lock`).
Retrying a vote is safe: `state.py vote` is idempotent per `agent_id` and round (`state.py:319`).

## Part 2: follow-ups at HEAD

| # | Item | Holds? | Where | Minimal fix | Test / mutation |
|---|---|---|---|---|---|
| 1 | `op_parked` on a non-object parked file | **holds**, reproduced: `AttributeError`, `status` rc 1 | `lib/state.py:445-454` (no `isinstance`; `op_resume` has it at :421); `pipeline-advance.sh:84` under `pipefail` | `if not isinstance(d, dict): lines.append("%s (not a JSON object)" % key); continue` | `[]` in the parked dir -> `status` rc 0, stderr names the key; mutation: drop the check -> rc 1 |
| 2 | One token-end rule | **holds**, reproduced: `rm -rf .claude/{hooks,}`, `mv .claude, x`, `rm -rf .claude/{pipeline.json,x}` all rc 0 | `bash-code-guard.sh:26`, `:29` | **The rule proposed in the issue is wrong**: `\.claude(?![\w./-])` stops blocking `rm -rf .claude/` (regression, checked) and still passes `.claude/{hooks,}`. Working rule (checked on 17 cases): `TOKEN_END = (?![\w.-])`; core dirs `prefix(?:/\|TOKEN_END)` (as now); `.claude` = `(?<![\w.-])\.claude(?:/(?![\w.-])\|(?![\w./-])\|<glob alt>)`. Keeps `rm -rf .claude/agents/*`, `cp x .claude/agents/...`, `rm -rf .claude/worktrees/old` allowed; newly blocks `rm -rf .claude/{agents,feedback}/x` (accepted false positive?) | rows rc 2 for the three commands above; mutation: old `CLAUDE_DIR_TOKEN` -> green-to-red |
| 3 | Unicode digits | **holds**, reproduced: `pipeline-advance.sh init RESEARCH ²` -> `ValueError` traceback rc 1 | `state.py:264` (check), `:287` `int(issue)`, `:111` `require_grant`, `:391` `_pick_parked` (harmless, prefix match only). Bash `^[0-9]+$` (`pipeline-advance.sh:124`) rejects `²` (checked) but RESEARCH/RELEASE skip it (`requires_issue` false) | `issue.isascii() and issue.isdigit()` at 264, 111, 391 (Python >= 3.7; the probe requires 3.9). Note `_park` (:284) runs before `int()` (:287): today a crash can park the slot's state and write no new one | `init RESEARCH ²` rc 1 with `issue must be a GitHub issue number`, no traceback, slot unchanged; mutation: plain `isdigit()` |
| 4 | ADR-0005 item 7 write verbs | **holds**, reproduced: `find .claude/hooks -delete`, `rsync -a --delete x/ .claude/hooks/`, `git clean -fdx .claude`, `tar -C .claude -xf x.tar` all pass the guard | `docs/adr/0005-pipeline-v2.md:41-55`, `bash-code-guard.sh:22-23` | add a bullet naming them | docs only |
| 5 | ADR-0005 item 8 L3 answer | **holds** | `docs/adr/0005-pipeline-v2.md:56-58`; also `lib/hookio.py:166-167` docstring says "unverified" | record: handback hook got the parent's transcript (`transcript_kind=main`, `role_source=transcript`), hook log 2026-10-27 20:23:49 lines 16-17, 20:23:56 | docs only |
| 6 | Guard header and design 2.7 | **holds** | `bash-code-guard.sh:2-9` (no `.claude` dir token or first-component glob; no `git checkout` with a ref); code `:23` matches `git checkout` with any args; design `plans/21-pipeline-v2-design.md:421-426` says `git checkout --` and core path strings only | reword both | docs only |
| 7 | Core message on a stray `.claude` | **holds**, reproduced: `rm -rf node_modules/.claude` -> message lists `.claude/pipeline.json, .claude/settings, .claude/hooks/` | `bash-code-guard.sh:78-80` | test the `.claude`-token alternative separately and say "a .claude directory token (removing or renaming .claude disables every hook)" | stderr of that command contains `.claude directory`; mutation: old message |
| 8 | Design R3 L4 not runnable | **holds** (the guard blocked this research's own write into a `.git` path the same way) | `plans/21-pipeline-v2-design.md:1126-1128` | rewrite L4 as feeding hook JSON with `cwd` = the fake dir; the automated equivalent already exists: `tests/pipeline/run.sh:292-294` | docs only |
| 9 | Kill switch reach in worktrees | **holds** (undocumented) | `CLAUDE.md:182`, design section 13 | per current docs (code.claude.com/docs/en/settings, CC >= 2.1.211; installed 2.1.267): in a worktree, `.claude/settings.local.json` is read **at the main checkout's root** (a legacy file in the starting dir is still read too); `.claude/settings.json` comes from the session's primary working directory (the worktree, which is why worktree copies forward). So main's file reaches worktree sessions. Could not verify live | docs only |
| 10 | `foreign-state` logged on every call | **holds** | `lib/checkout.py:304-305`; log lines 1-2 show it per call | log once per `(session_id, checkout)`, e.g. a marker in `TMPDIR` like the watchdog's (`pipeline-watchdog.sh:23`), or only from `pipeline-advance.sh` | two hook calls, same session -> one line; mutation: drop the marker check |
| 11 | Inline gate Python | **holds** | `require-pipeline.sh:16` (`GATE_PY`), `bash-code-guard.sh:16-109` (`GUARD_PY`); duplicated `tier_of`/`has_flag` (`require-pipeline.sh:33,37`, `bash-code-guard.sh:61,65`) and stdin parsing (`:127-129`, `:97-101`); CI `py_compile` covers only `lib/*.py` (`ci.yml:55`) | move to `lib/write_gate.py`, `lib/shell_guard.py`, shared helpers in one lib module | existing suite rows stay green; py_compile now covers them |
| 12 | Watchdog duplicates `last_activity` | **holds**, and differs: no `isinstance` on `ts`, no `or 0` for `session_ts` | `pipeline-watchdog.sh:16-21` vs `lib/state.py:186-192` | import `state` from `$LIB` and call `last_activity` | non-numeric `ts` in history -> no `observer-crash`; mutation: restore the copy |
| 13 | Type annotations | **holds**: zero annotated functions in `lib/*.py`; mypy not installed locally, no mypy step in CI | `lib/checkout.py`, `lib/state.py` (also `cfg.py`, `hookio.py`) | annotate; a mypy CI step is a new dependency (decision) | mypy in CI |
| 14 | Design 2.3 vs 2.6 paths | **holds** | `plans/21-pipeline-v2-design.md:302-303` ("only checkout-relative REL") vs `:404` (`REL = P`, absolute, outside every checkout); the `checkout` log field is always absolute | reword 2.3: absolute checkout roots and out-of-checkout targets are logged; the new error field adds absolute temp paths | docs only |

## Constraints discovered
- The defect is macOS-only (BSD `mktemp`); CI (`ubuntu-24.04`, GNU) cannot catch it without a BSD-like
  shim. A test that only runs concurrent handbacks is green in CI under the mutation.
- `bash-code-guard.sh` blocks any tool-issued command containing the state file name or the judge-caller
  variable name, and any write verb aimed at a `.git` path, so the architect's live checks and the tester
  must drive votes through the hooks (as this harness does), not by calling the CLI with the variable.
  For the record: this research copied `.claude/` into scratch with an `fnmatch("pipeline_s*")` filter and
  wrote one parked file in the scratch repo by splitting the name in shell text; both touched only scratch
  copies, but they are an example of the string-match evasion ADR-0005 item 7 already accepts.
- `/bin/bash` 3.2 on macOS: no `inherit_errexit`; failures inside `$(...)` do not stop the subshell.
- A new log field needs a `LOG_FIELDS` entry, or it is silently dropped.
- Retrying a failed vote is safe (per-agent dedup), but a retry alone would hide this class of bug.

## Open questions
- Follow-up 2: accept the new false positive `rm -rf .claude/{agents,feedback}/x` (blocked by the unified
  rule)?
- Follow-up 13: add mypy (a pip dependency) to the CI pipeline job, or annotate without a checker?
- Should the vote path also retry once on rc 75 / rc 1 (idempotent), or only log?
