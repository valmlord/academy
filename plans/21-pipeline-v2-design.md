# Issue #21 design: pipeline v2 (tier PROJECT, architect phase, revision 3.1)

Revision 3.1 is a targeted amendment of revision 3 (round 3: security PASS; architecture and operations FAIL
on row B18 only). Only the items mapped in section 14.3 changed.

Inputs: `gh issue view 21 --comments` (scope table A-G), `plans/21-pipeline-v2-research.md` (facts, and
Stepan's decisions: 2, 3, 4 as first given, **1 as replaced** and **5 as added** after design review round 1,
**6 and 7 as added** after design review round 2), the current hooks (`.claude/hooks/*.sh`, `lib/cfg.py`,
`lib/hookio.py`), `.claude/settings.json`, `.claude/pipeline.json`, `tests/pipeline/run.sh`, ci.yml `pipeline`
job, `pipeline/state_machine.md`, CLAUDE.md, `.claude/feedback/architect_mistakes.md` (including the five #21
lessons), and the round 1 and round 2 findings of the security, architecture and operations judges (mapped in
the changelog, section 14).

Binding decisions this revision is built on:
- **D-1 (replaced):** hooks, `pipeline.json` and agents always come from the **main checkout**. Only the
  pipeline **state** (active and parked) is per checkout, located from the hook input `cwd`. No script of a
  linked worktree decides anything; a linked worktree's hook copy only forwards to main's copy (2.2).
- **D-2:** Stop is allowed mid-phase only while a `background_tasks` entry with `type == subagent` and
  `status == running` exists.
- **D-3:** one active pipeline plus parked ones per checkout; `pause` / `resume`.
- **D-4:** pipeline core is writable only in the PIPELINE tier (LEARN included in the restriction), shell
  writes too. The architect gets Write and the role rule "writes only `plans/<issue>-*.md`".
- **D-5:** `.claude/settings.local.json` is pipeline core: the core prefix is `.claude/settings`.
- **D-6 (new): threat model.** The pipeline is a guardrail against the mistakes of an honest agent, not a
  sandbox against deliberate subversion (section 0).
- **D-7 (new):** PIPELINE only in the main checkout (accepted). `init PIPELINE <n>` and `pause` of a LEARN
  state require a grant written by Stepan in `.claude/settings.pipeline-grant.json` (2.9a).

Facts re-checked on disk for this revision (2026-10-27):
- `git worktree list --porcelain -z` (git 2.54 here) lists `worktree <path>`, `HEAD`, `branch refs/heads/<b>`
  (or `detached`), and `prunable` / `bare` markers; one call takes about 9 ms. `-z` exists since git 2.36
  (release notes; ubuntu-24.04 ships 2.43). Not run on CI yet: the run.sh suite exercises it there.
- A plain directory holding a `.git` file `gitdir: <main>/.git` reports
  `rev-parse --show-toplevel` = itself and `--git-common-dir` = main's `.git`, and is **absent** from
  `git worktree list` (reproduced in the scratchpad with a path containing a space).
- Live worktree `.claude/worktrees/15-module-introduction-7cf70d`: branch `content/15-module-introduction`
  at 5c4d853 (pre-v2, no own commits), untracked `plans/15-module-introduction-research.md`, **no** state
  file; it has its own `.claude/settings.json` (a session started there runs that checkout's hook wiring).
  `main:plans/` contains only `.gitkeep`, so that untracked file cannot collide on merge.
- Main checkout: on `fix/21-pipeline-v2`; `.claude/pipeline_state.json` = PROJECT #1 at `judge_design`,
  `branch_at_init: feat/1-web-bootstrap`, no `gitdir_at_init` (legacy).
- `feat/1-web-bootstrap` = 5c4d853 + 5ad27f4 (hookio fix) + 4cda2ba (plans/1-* only). 5ad27f4 and a58679d
  (on fix/21) have the same patch-id (96ee826d...); `origin` has only `main`, so feat/1 is not pushed.
- Exit codes (docs hooks.md, via the researcher): only exit 2 blocks; any other non-zero exit is a
  non-blocking error and the tool call proceeds. A crashing gate therefore fails open today.
- macOS `python3` is 3.9.6: all new Python must be 3.9-compatible (no `match`, no `X | Y` at runtime).
  macOS has no `sha1sum`; hashing goes through Python `hashlib`. `python3 -I` on 3.9.6 drops the script
  directory from `sys.path` (`sys.path[0]` printed as the stdlib zip).
- macOS bash is 3.2.57. `IFS=$'\x1f' read -r A B C D E F` on `a<US><US><US>d<US><US>` gives
  `[a][][][d][][]`: a non-whitespace separator keeps empty fields, including trailing ones (run here).
- Builtins only (`read`, `${var#...}`, `cd -P`, `pwd -P`, `command -v`) under `env -i PATH=/nonexistent
  /bin/bash` derive the main root from the #15 worktree's `.git` file (`gitdir:` line, then `commondir` =
  `../..`) and print `python3 not found` from `command -v` (run here).
- `.claude/settings.local.json` is ignored today **only** through Stepan's global `~/.config/git/ignore`
  (`git check-ignore -v`), not by the repo's `.gitignore`.
- `git log -1 --format=%B a58679d | grep -qE '#21\b'` succeeds (the body carries `Refs #1, Refs #21`; the
  subject does not), and `printf 'Refs #210' | grep -qE '#21\b'` fails (BSD grep here).
- run.sh builds its test repo with `cp -r "$SRC/.claude"` then `git add -A && git commit`, so a worktree
  created from the test repo's HEAD carries the copied hooks.
- The tester helper of section 11 was executed in a fresh zsh with a scratch override (revision 3 version,
  see 11.0).

---

## 0. Threat model (D-6)

**In scope (the guardrail):** mistakes of an honest, cooperating agent: acting in the wrong phase or role,
writing state, pipeline core, the git dir or settings through ordinary tool or shell paths, a vote forged by
plain text, a state copied from another checkout, a crashed hook, a missing interpreter, a helper file that
accidentally shadows a stdlib module, a session started in a worktree.

**Out of scope (residual, recorded in ADR-0005, caught by review and by Stepan at merge):** an agent that
deliberately subverts the pipeline: registering a worktree inside `.claude/hooks/` on an orphan branch,
crafting shell commands to evade string rules (`python3 -c "open(...)"`, variables, relative `cd`), forging
transcript files through the shell, setting `JUDGE_HOOK_CALLER` by indirection.

**Design rule:** a mechanism stays when it also stops a plausible accident **or** costs a few lines; machinery
that only defends against deliberate action is removed. Judges evaluate against this model.

Classification of every security item in this design:

| Item | Class | Why |
|---|---|---|
| State resolved only among registered worktrees (2.1) | kept (prevents mistakes) | a `cd` into another repo or a temp dir must not pick up a stray state |
| Linked worktrees accepted only outside main's tree or under `.claude/worktrees/` (2.1) | kept (prevents mistakes) | one comparison; also stops a worktree added in an odd place from re-labelling main's paths |
| Main's git, state and core zones evaluated as absolute paths before checkout mapping (2.6 step 3) | kept (prevents mistakes) | a few path comparisons; no checkout layout can re-label main's core |
| `python3 -I`, lib dir appended to `sys.path` (2.2, 2.11) | kept (prevents mistakes) | a helper named `json.py` / `logging.py` in `lib/`, or a stray `PYTHONPATH`, would break every gate |
| Treating `git worktree add` as a shell write verb | residual (deliberate bypass only) | no honest workflow registers a worktree inside `.claude/hooks/`; the filter above already ignores such a worktree |
| Common-dir re-check of a picked linked worktree (old 2.1 step 3) | residual, **removed** | only defends a deliberately replaced registered directory; the `.git`-file check in `worktrees()` already drops a replaced one |
| Log file `fstat` owner/regular check (old 2.3) | residual, **removed** | only defends a deliberately planted log; `O_NOFOLLOW` (one flag) stays |
| `realpath` on write targets (2.6) | kept (prevents mistakes) | symlinked directories exist by accident (tooling, node_modules) |
| `.git` zone: common dir plus any `.git` path component (2.6) | kept (prevents mistakes) | editing `.git/config`, `.git/hooks` or a worktree's `.git` file breaks git for every session |
| Transcript zone for tools (2.6) | kept (prevents mistakes) | one path rule; stops an agent "cleaning up" session files that role detection reads. Shell writes there: residual |
| User-level `~/.claude/settings*.json` zone, tool and shell (2.6, 2.7) | kept (prevents mistakes) | `disableAllHooks` there turns everything off; cheap |
| Grant file for `init PIPELINE` and LEARN pause (2.9a) | kept (prevents mistakes) | D-7; the common accident is an agent "unblocking itself" with a documented command |
| Shell core rule also requires cwd checkout == main (2.7) | kept (prevents mistakes) | one comparison; a stray PIPELINE state in a worktree cannot open main's core to shell writes |
| Resolver crash or empty state root blocks gates (2.2) | kept (prevents mistakes) | fail closed is the guardrail's base property |
| Worktree hook copies forward to main's copy (2.2) | kept (prevents mistakes) | sessions are started in worktrees routinely (#15); without it an old copy would gate them |
| `JUDGE_HOOK_CALLER` / `pipeline_state` string rules in bash-code-guard (existing) | kept (prevents mistakes) | stops an agent copying a hook's command line; indirection is residual |
| LEARN shell rule for checkouts named by absolute path (2.7) | kept (prevents mistakes); relative `cd` residual | absolute targets are the common shape; relative paths are not parsed |
| `cd` into a sibling registered worktree changes the state for spawn windows, votes and Stop (2.1) | residual | intended for state lookup; a per-session pinned checkout is not built |
| Vote authenticity (2.10) | residual | env flag + string rule + transcript role; not authenticated |
| Harness kill at the hook timeout fails open (2.2) | residual | harness behaviour; gates never wait on the lock |

---

## 1. Solution design (summary)

- **Code from main, state per checkout.** settings.json keeps calling scripts by
  `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/<hook>.sh"`. Every script derives `CODE_ROOT` from its own location
  with shell builtins; a copy inside a linked worktree **forwards** (`exec`) to the same-named script of the
  main checkout, so main's code runs even when a session starts in a worktree. `cfg.py`, `hookio.py` (agents
  dir) and every helper load from `CODE_ROOT`. One resolver (`lib/checkout.py`) answers "which checkout's
  **state** applies" and accepts only registered linked worktrees outside main's tree or under
  `.claude/worktrees/`; anything else falls back to the main checkout.
- **Gates fail closed, observers fail quiet.** A gate script (`require-pipeline`, `phase-gate`,
  `bash-code-guard`, `phase-complete`) maps every exit code other than 0 and 2 to 2 with a clear message, and
  blocks when `python3` is missing or broken or the resolver fails. Observer scripts (`judge-handback`,
  `judge-vote`, `judge-count`, `pipeline-watchdog`) always exit 0. A failed log write never changes an exit
  code. All Python runs as `python3 -I`.
- **All state writes are locked transactions** in `lib/state.py` (`fcntl.flock` on a dedicated lock file
  that v1 never touches, timeout, atomic `os.replace`, compare-and-set). `pipeline-advance.sh` stays the CLI.
- **Votes arrive by two idempotent paths:** PreToolUse on `SubagentHandback` (primary, reads
  `tool_input.message`) and SubagentStop (fallback); one vote per `(agent_id, round)`.
- **One active state plus parked states per checkout**; `init` never destroys a state, it parks it.
  The `PIPELINE` tier is the only tier that may write pipeline core, by tool or by shell, only in the main
  checkout, and only for an issue Stepan granted. Parking an own LEARN state also needs his grant.
- **Write gate on real paths:** targets are resolved with `realpath`; main's git dir, state and core are
  checked as absolute zones first; then the target is mapped to the registered checkout that owns it. Always
  blocked: any `.git` path component and the git common dir, session transcripts, user-level settings, the
  grant file, and unregistered directories under `.claude/worktrees/`.
- **Visibility:** a bounded JSON-lines hook log in the git common dir, opened with `O_NOFOLLOW`.

---

## 2. Components (per file, key logic)

### 2.1 `.claude/hooks/lib/checkout.py` (new): the only resolver, for state location only

Stdlib only. Never decides which code runs; it returns where state lives.

```
code_root()               -> realpath(<this file>/../../..)          # the checkout whose scripts run
worktrees(code_root)      -> [Worktree(root, gitdir, branch|None)]   # one `git worktree list --porcelain -z`
resolve_cwd(cwd)          -> Resolution(state_root, gitdir, branch, main_root, source)
checkout_of(path)         -> Worktree | None                         # for the write gate
```

`worktrees()`: runs `git -C <code_root> worktree list --porcelain -z` once (subprocess timeout 3 s), parses
NUL-separated records, drops `bare` and `prunable` entries, `realpath`s every root. The first record is the
main worktree (`main_root`). `gitdir` per worktree is derived without git: main = `realpath(main_root/.git)`
(must be a directory), linked = the `gitdir:` line of `<root>/.git` (must be a file whose target is inside
`<main gitdir>/worktrees/`). A relative `gitdir:` line (written by `worktree.useRelativePaths`, git 2.48+,
reproduced on 2.54: `gitdir: ../../../.git/worktrees/w-one`) is joined to `<root>` before `realpath`, because
git resolves it relative to the directory holding the `.git` file. Further drops, each logged `worktree-skipped:<why>`:
- `.git` does not satisfy the rule above (`bad-gitdir`): a registered path whose directory was replaced is
  no longer that worktree.
- **nested** (`nested`): a linked root that is inside `main_root` but not under `<main_root>/.claude/worktrees/`.
  Because inside main's tree a nested root would win the longest-prefix match and re-label main's own paths
  (for example a worktree at `.claude/hooks/lib/json`); `.claude/worktrees/` is the one place the harness
  and CLAUDE.md create worktrees.
- a root containing `\x1f` or a newline (`bad-path`), because the context line uses `\x1f` as separator.

`resolve_cwd(cwd)` (cwd = hook input `cwd`, or `os.getcwd()` when called without hook input):
1. `c = realpath(cwd)`; missing or not a directory → `main`, `source=fallback:no-cwd`.
2. Pick the **longest** accepted root that is `c` or a path-component prefix of `c`. None →
   `main`, `source=fallback:unregistered` (another repository after `cd`, a temp dir, a fake `.git`-file
   directory, a directory outside git, a skipped nested worktree).
3. Return the pick, `source=cwd`.

(Revision 2's step 3, a `--git-common-dir` re-check of a picked linked worktree, is removed under D-6: it cost
one git call per hook and only defended a deliberately replaced directory, which the `.git`-file rule in
`worktrees()` already drops.)

`git worktree list` itself failing (corrupt repo, timeout) → `main` = `code_root`, `source=fallback:git-error`.
Any other exception inside the resolver propagates as a non-zero exit with empty stdout: common.sh treats
that as a resolver failure and gates block (2.2). "Fallback to main" is reserved for the documented cases above.

**Why registered worktrees only:** a common-dir comparison is passed by a fake `.git`-file directory
(reproduced), and an accidental `cd` into another repository must not change which state applies. The
registry is not a trust anchor against deliberate action (one `git worktree add` creates an entry); D-6
accepts that, and the nested filter plus the absolute zones of 2.6 keep main's own paths out of its reach.

**The `cd` risk, stated:** hook input `cwd` follows `cd` (docs). Handling:
- `cd` into another repository, a temp dir, a fake checkout → not registered → main's state. Logged.
- `cd` into a sibling registered worktree → that worktree's state applies to **phase-gate**, **votes**,
  **watchdog** and **Stop**. Intended (it is how a session works in a worktree); the residual is that an
  agent could `cd` to a checkout whose phase window admits a role, or that has no pipeline, to end its turn.
  Bounded by: the write gate never uses cwd (it uses the file's checkout, 2.6); core shell writes need the
  cwd checkout to be main and its state PIPELINE (2.7). Not built: a per-session pinned checkout (section 5).

`checkout_of(path)`: `p = realpath(path)` (os.path.realpath resolves symlinks in the existing prefix and
keeps a non-existing tail); longest accepted root that is a component prefix of `p`, else None.

CLI (all read hook JSON from stdin at most once):
- `checkout.py context` prints one line of seven fields separated by `\x1f` (ASCII unit separator):
  `state_root, source, gitdir, branch, main_root, tool_name, state_status`. Empty values (no `tool_name` on
  Stop/SubagentStop and on pipeline-advance's empty-stdin call; no `branch` on a detached HEAD) are printed as
  empty fields; `\x1f` is not IFS whitespace, so `read` keeps them (fact list). `state_status` is
  `none | own:<tier>:<phase> | foreign:<why> | done | unreadable` and is never empty. One Python process gives
  a hook everything it needs, so a hook resolves **once** (about 70 ms including interpreter start). With the
  `python3` probe of 2.2 step 3 (a second interpreter start, about 24-31 ms measured here) a hook's fixed cost
  is about 95-100 ms. The probe is not folded into checkout.py, because S7/S8 need the probe's own message
  before stdin is read, and a broken interpreter would otherwise surface as a resolver failure.
- `checkout.py file <path>` prints `root\x1fgitdir\x1fbranch` of `checkout_of(path)` or nothing.
- `checkout.py log k=v ...` (see 2.3).

### 2.2 `.claude/hooks/lib/common.sh` (new): sourced by every hook script

Every hook script starts with exactly these lines and runs **no external command before the probe**:
```
HOOK_KIND=gate                                   # or observer
case $0 in */*) HOOK_DIR=${0%/*} ;; *) HOOK_DIR=. ;; esac
source "$HOOK_DIR/lib/common.sh"
```

common.sh, in this order (steps 1-3 use only bash builtins, so they work with an empty `PATH`):
```
1. CODE_ROOT=$(cd -P "${BASH_SOURCE[0]%/*}/../../.." && pwd -P)    # builtins; empty -> fail (below)
   LIB="$CODE_ROOT/.claude/hooks/lib"; HOOK_NAME=${0##*/}
2. Forward: if [ -f "$CODE_ROOT/.git" ] (this copy lives in a linked worktree):
     read -r line < "$CODE_ROOT/.git"; g=${line#gitdir: }
     case $g in /*) ;; *) g="$CODE_ROOT/$g" ;; esac   # relative gitdir (useRelativePaths): from the worktree root
     read -r c < "$g/commondir"
     common = c absolute ? c : "$g/$c";  MAIN=$(cd -P "$common/.." && pwd -P)
     MAIN/.git is a directory and MAIN/.claude/hooks/$HOOK_NAME is a file
       -> PIPELINE_HOOK_FORWARDED=1 exec /bin/bash "$MAIN/.claude/hooks/$HOOK_NAME" "$@"   (stdin untouched)
     else gate     -> stderr "BLOCKED: this session runs hooks from a linked worktree (<CODE_ROOT>) and the
                      main checkout's <HOOK_NAME> was not found; start the session in the main checkout", exit 2
          observer -> exit 0
3. Probe: command -v python3 && python3 -I -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'
     fails: gate     -> stderr "BLOCKED: python3 not found or unusable; pipeline gates cannot run. Fix python3,
                        or Stepan sets disableAllHooks in .claude/settings.local.json by hand.", exit 2
            observer -> exit 0
4. IFS= read -r -d '' INPUT || true                  # stdin buffered exactly once, builtin
5. CTX=$(printf '%s' "$INPUT" | python3 -I "$LIB/checkout.py" context); CTX_RC=$?
   IFS=$'\x1f' read -r STATE_ROOT SOURCE GITDIR BRANCH MAIN_ROOT TOOL_NAME STATE_STATUS <<< "$CTX"
   CTX_RC != 0, or STATE_ROOT not an absolute existing directory, or STATE_STATUS empty:
     gate     -> stderr "BLOCKED: pipeline resolver failed (rc=<CTX_RC>); see .git/pipeline-hooks.log", exit 2
     observer -> exit 0
6. STATE_FILE="$STATE_ROOT/.claude/pipeline_state.json"
   cfg()    { python3 -I "$LIB/cfg.py" "$@"; }        # always main's pipeline.json
   hookio() { python3 -I "$LIB/hookio.py" "$@"; }     # agents dir from CODE_ROOT
   pl_log() { python3 -I "$LIB/checkout.py" log "$@" || true; }
   run_hook() { main_fn; RC=$?; ... }                 # rc mapping below
```

- `CODE_ROOT` comes from the script's own path, never from `STATE_ROOT`, `cwd` or an environment variable,
  because D-1 says code is main's. In production, for a session started in main, `CODE_ROOT ==
  CLAUDE_PROJECT_DIR`; for a session started in a worktree the worktree copy forwards and `CODE_ROOT` becomes
  main. The tests set `CLAUDE_PROJECT_DIR=$WORK` and run `$WORK`'s scripts. `CLAUDE_PROJECT_DIR` is no longer
  read by any hook code. `PIPELINE_HOOK_FORWARDED` is only logged (`forwarded` field), never decides.
- **Forwarding** is the D-1 answer to "a session started inside a worktree runs that worktree's hooks". Only
  copies that contain this common.sh forward, i.e. branches that have merged v2; a pre-v2 worktree copy runs
  v1 (residual; section 12 R6 merges main first). Which hooks are **wired** still comes from the session's
  own `settings.json`, so a worktree branch must carry main's `settings.json` (merge main) to get a newly
  added hook. Forwarding never loops: main's `.git` is a directory.
- **Why `python3 -I`:** isolated mode drops the script directory and `PYTHON*` variables from `sys.path`, so
  a file in `lib/` named like a stdlib module (`json.py`, `logging.py`, a nested directory with
  `__init__.py`) cannot shadow the stdlib inside a gate. The libs import each other through
  `sys.path.append(<lib dir>)` (**append**, so the stdlib always wins).
- **rc mapping:** each script puts its logic in `main_fn` and ends with `run_hook`. For gates: rc 0 and 2
  pass through; any other rc (Python traceback, `set -u` violation, missing file) → stderr
  `BLOCKED: <hook> failed internally (rc=N); see .git/pipeline-hooks.log`, log `gate-crash`, exit 2.
  For observers: always exit 0, a non-zero inner rc is logged `observer-crash`.
- Every subprocess inside the libs has a timeout (git 3 s; lock 5 s, observers only), so an internal hang
  becomes a crash that is mapped as above. The harness timeout (`"timeout": 15` in settings.json) is a
  backstop; a harness kill is a non-blocking error, i.e. fails open (residual, section 0). Gates never wait
  on the state lock (they only read the atomically replaced file), so their worst case is bounded by the git
  timeout, far below 15 s.
- `python3` missing means no log line can be written; the block message on stderr is then the only record.

`pipeline-advance.sh` is a CLI, not a hook (2.5). It uses the same three-line header with **`HOOK_KIND=cli`**,
and common.sh branches on that value: step 2 is skipped (no forwarding; pipeline-advance refuses as a
worktree copy instead, 2.5); step 3 failing prints the probe message and exits 1; step 4 is skipped and
`INPUT` stays empty (a CLI's stdin may be a terminal, so reading it would hang); step 5 runs `context` on that
empty input (state from `pwd`) and its failure branch prints `ERROR: pipeline resolver failed (rc=<N>)` and
exits 1 instead of the gate's exit 2; `run_hook` passes the CLI's own exit codes (1, 3, 4, 75) through
unchanged. Any other `HOOK_KIND` value is treated as `gate`.

### 2.3 Hook log

- Where: `<main gitdir>/pipeline-hooks.log` (`.git/pipeline-hooks.log` in the main checkout), because it is
  never tracked, never copied by run.sh, survives `git worktree remove`, and one file shows cross-checkout
  confusion. Fallback when main's `.git` is not a directory: `${TMPDIR:-/tmp}/academy-pipeline-hooks-<uid>.log`.
- Open: `os.open(path, O_WRONLY | O_APPEND | O_CREAT | O_NOFOLLOW, 0o600)`. A symlink at the path makes the
  open fail; that is handled as any `OSError` (below). Revision 2's `fstat` owner/regular check is removed
  (D-6: it only defended a deliberately planted file).
- Format: one JSON object per line written with a single `os.write`. For a regular file opened with
  `O_APPEND`, POSIX makes "seek to end + write" one atomic step, so concurrent writers never overwrite each
  other; a single small `write` is not split on local filesystems. Lines are capped at 1000 bytes for
  readability. A short write is not retried.
- Rotation: before writing, if size > `hook_log_max_bytes` (pipeline.json, 262144), `os.replace(log,
  log + ".1")`. At most two files. Two writers rotating at once can drop a few lines; accepted (diagnostics).
- Failure isolation: `log_event` catches `OSError` only, prints one stderr line `pipeline log write failed:
  <errno name>` and returns; callers ignore its result (`|| true` in bash). No exit code ever depends on it.
- Fields (whitelist): `ts, pid, event, hook, tool, agent_id, checkout, source, forwarded, decision, reason,
  rc`; vote paths add `judge, verdict, round, path (handback|subagent_stop|post_tool_use), role_source
  (transcript|spawn_map|none), transcript_kind, transcript_lines, handback_in_transcript`; Stop adds
  `bg_subagents_running, bg_total`; grant checks add `grant (pipeline_init|learn_pause), issue`. Since #23:
  `error`, the first line of a failed vote or spawn-map CLI call (stdout and stderr combined, capped).
- Never logged: `tool_input` contents (commands, file contents, prompts, `message`),
  `last_assistant_message`, environment. Paths that do appear: the `checkout` field is always an absolute
  checkout root; require-pipeline block reasons carry `REL`, which is absolute for a target outside every
  checkout (2.6 step 4); the `error` field can carry absolute paths (a lock file, a temp file).
- Logged: every block and its reason, every resolver fallback and `worktree-skipped:<why>`, every
  gate/observer crash, every vote-path outcome (`vote-recorded`, `vote-dup`, `vote-ignored:<why>`,
  `verdict-unknown`, `role-unknown`), every state transaction (`init`, `advance`, `pause`, `resume`,
  `park:<reason>`, `finish`), `grant-used` / `grant-missing` / `grant-invalid`, `lock-timeout`, Stop
  decisions, watchdog notifications. Routine allows are not logged (the watchdog runs on every call).
- Authority: none. The log is a diagnostic; forging it changes no gate.

### 2.4 `.claude/hooks/lib/state.py` (new): locked state transactions

- Files per checkout (all under the `pipeline_state` prefix, so `.gitignore`, `protected_files` and
  bash-code-guard's `pipeline_state` string rule cover them):
  `state = <root>/.claude/pipeline_state.json`, `lock = <root>/.claude/pipeline_state.flock`,
  `parked = <root>/.claude/pipeline_state.parked/`, temp `pipeline_state.tmp.<pid>`.
- The lock file has a **new name**, not v1's `pipeline_state.json.lock`, because v1's O_EXCL vote path
  treats an existing `.json.lock` as held and waits 5 s; v2's lock is never deleted, so sharing the name
  would stall every v1 vote after a rollback.
- `transaction(root)`: open the lock (create if absent, never delete), `fcntl.flock(LOCK_EX | LOCK_NB)` in a
  loop until `state_lock_timeout_seconds` (pipeline.json, 5). Timeout → `StateLockTimeout` → CLI exit 75
  `ERROR: could not lock <path> within 5s; nothing written`, logged `lock-timeout`. Never proceeds without
  the lock, because flock is released by the kernel when a holder dies, so there is no stale lock to break.
- Inside: read state (missing → None), apply the op, write the temp file, `os.replace` (atomic, so the
  gates' unlocked reads never see a torn file). **Every** op below, including `advance` and `vote`, runs its
  whole read-modify-write inside one `transaction()`.
- Test seam: env `PIPELINE_STATE_TEST_DELAY_MS` sleeps between read and write inside every op. It can only
  slow a write, never change one.
- Ops (`state.py <op> <root> ...`, one result line each):
  - `init <tier> <issue> <branch> <gitdir> <code_root>`: the init table of 2.8 (including its grant rows),
    decided inside the transaction; parks first where the table says so.
  - `advance <expected_current> <next>`: compare-and-set; mismatch → exit 3 `state changed concurrently
    (now <phase>)`; appends history.
  - `vote <round> <judge> <verdict> <agent_id> <path>`: only if `phase == round`; same `(agent_id, round)`
    exists → `vote-dup`, exit 0, nothing written; else append `{agent, verdict, round, agent_id, path,
    source:'hook', ts}` and history `judge:<k>:<v>`. Votes without `agent_id` (sync PostToolUse path) are
    appended without dedupe.
  - `record_spawn <round> <agent_id> <judge>`: `artifacts.judge_spawns[agent_id]`, only while `phase == round`
    and the phase is a judge phase, else exit 3 `not in a judge phase (now <phase>)`.
  - `set_artifact <k> <v>`.
  - `park <reason> <code_root> <gitdir> <branch>`: moves the state to `parked/<key>.json`, key `<issue>-<epoch>`
    (`noissue-<epoch>`), suffix `-2`, `-3` if that name exists, adds `parked_reason`, `parked_branch`,
    `parked_ts`. Parking an **own LEARN** state requires a `learn_pause` grant for its issue (2.9a); `park` is
    the single place that check lives, so pause, init and resume all pass through it. "Own" is decided by
    `state_is_own` (2.8) against the caller's checkout: `<gitdir>` and `<branch>` (empty on a detached HEAD)
    are the `GITDIR` / `BRANCH` fields of the caller's context line; init passes the same values it received.
    Inside init and resume, park is an internal call within the same transaction, not a second lock.
  - A state file that exists but cannot be read or parsed (`state_status=unreadable`): every op refuses with
    `state file unreadable: <path>; nothing written` (exit 1), because init and pause must never overwrite or
    move a state they cannot read.
  - `unpark <key> <gitdir>`: `os.replace(parked/<key>.json, state)`; rewrites `gitdir_at_init` (2.9).
  - `finish`: removes the state only if `phase == done` (used by phase-complete, 2.11).
- `agent_id` must match `^[A-Za-z0-9_-]{1,64}$`, else `vote-ignored:bad-agent-id`, because it is used in a
  file path (transcript lookup) and as a dedupe key.

### 2.5 `.claude/hooks/pipeline-advance.sh` (changed)

- State root: `checkout.py context` with empty stdin, i.e. resolved from `pwd`. `REPO_DIR` for the PR gate's
  git calls = state root. `cfg` = main's pipeline.json (from `CODE_ROOT`). Runs Python as `python3 -I`.
- **Refuses to run as a linked worktree's copy** (it does not forward, because it is a CLI the orchestrator
  types, and an explicit refusal teaches the canonical invocation): if `CODE_ROOT/.git` is a file, exit 1
  `run the main checkout's copy: bash "<main>/.claude/hooks/pipeline-advance.sh"`. Pre-v2 copies cannot
  refuse; section 12 makes every checkout merge main before it continues.
- Canonical invocation (CLAUDE.md): from the main checkout `bash .claude/hooks/pipeline-advance.sh ...`; from
  anywhere `bash "$(git rev-parse --path-format=absolute --git-common-dir)/../.claude/hooks/pipeline-advance.sh" ...`
  (common dir = main's `.git`). Both resolve the state from `pwd`.
- `write_state`, `set_artifact`, `append_history`, the inline vote block and the init `json.dump` are
  replaced by `state.py` calls; the O_EXCL lock and its "delete the lock on timeout" branch are removed.
- Phase advance: validation as today, then `state.py advance "$CURRENT" "$PHASE"`.
- Vote branch: `pipeline-advance.sh <judge_phase> <judge> <verdict> [agent_id] [path]`, still only with
  `JUDGE_HOOK_CALLER=judge-count-hook`. Hook callers run it with `cd "$STATE_ROOT"` so it resolves the same
  checkout; this re-resolves once per vote (rare event, a few per round), not per tool call.
- New sub-commands: `pause`, `resume <issue|key>`, `parked`, `spawn <round> <agent_id> <judge>`
  (`JUDGE_HOOK_CALLER` only). `status` stdout unchanged (pure JSON or `No active pipeline.`) plus one stderr
  line `Parked here: #1 PROJECT/judge_design (feat/1-web-bootstrap, key 1-1793...)` when parked states
  exist; a foreign active state prints `Foreign state in slot: ... (pause parks it)` on stderr.
- Grant refusals print the file, the key and the issue, e.g. `ERROR: PIPELINE #21 needs a grant: Stepan adds
  21 to "pipeline_init" in .claude/settings.pipeline-grant.json (main checkout)`; exit 4.
- TTL and watchdog age are measured from the latest `phase_history` ts (activity), not `session_ts`.

### 2.6 `require-pipeline.sh` (gate; Edit|Write|MultiEdit|NotebookEdit)

Since #23 the code of these checks lives in `lib/pl_write_gate.py`; the `.sh` wrapper maps its exit code.

Order of checks for target `F` (from `tool_input.file_path` / `notebook_path`):
1. `P = realpath(F)` (symlinks resolved; non-existing tail kept). Every rule below uses `P`, so
   `apps/link -> ../.claude/hooks` cannot launder a core write.
2. **Always blocked, any tier including PIPELINE** (`BLOCKED: <zone> is never written by tools`):
   - **git:** any path component of `P` equal to `.git`, or `P` inside main's git common dir (`.git/**`,
     including `.git/worktrees/**`, `.git/hooks/**`, `.git/config`, `.git/info/**`, the hook log). Because
     these belong to no checkout's tree, hold executable git hooks and `core.hooksPath`, and a worktree's
     `.git` file is what makes it a worktree.
   - **transcripts:** `P` under `realpath($HOME/.claude/projects)` with basename `*.jsonl` or `*.meta.json`,
     or with a `subagents` path component; and anything under `realpath(dirname(transcript_path))/<session_id>/`.
     The `memory/` directories there stay writable on purpose (auto memory uses Write).
   - **user settings:** `P` matching `realpath($HOME/.claude)/settings*.json`. Because `disableAllHooks` there is
     the user-level kill switch; Stepan edits it by hand.
   - **grant:** basename `settings.pipeline-grant.json` anywhere. Because it is Stepan's authorization (D-7),
     and a copy in a worktree would mislead (only main's is read).
3. **Main's zones as absolute paths, before any checkout mapping:** with `M = main_root`:
   - `P` under `M/.claude/pipeline_state` (prefix) → `BLOCKED: pipeline state is written only by pipeline-advance`.
   - `P` under `M/` + any `pipeline_core_files` prefix → core rule with `W = main`: allowed only if main's
     state is own, active and its tier has `edits_pipeline_core`; otherwise
     `BLOCKED: <REL> is pipeline core; writable only in a PIPELINE task in the main checkout (pause this one, then init PIPELINE <issue> with Stepan's grant)`.
   Because a checkout found later by longest prefix must never re-label main's own state or core.
4. `W = checkout_of(P)`. If `W` is None (outside every accepted checkout): `REL` = `P`, governing state =
   the cwd-resolved state (today's semantics: needs an active pipeline). Else `REL = relpath(P, W.root)`,
   governing state = `W`'s state with `state_is_own` (2.8). An `unreadable` governing state (or main's state
   in step 3) counts as no own active state (2.8): product and core writes block, logged `state-unreadable`.
5. `W` is the main checkout and `REL` is under `.claude/worktrees/`: `P` lies in a directory there that is
   not an accepted worktree (an accepted one would have won step 4's longest-prefix match). Blocked like a
   product path with no pipeline, never auto-allowed by step 8.
6. `protected_files` (prefix entries): `REL` under `.claude/pipeline_state` → blocked (a linked worktree's state).
7. Core in a linked worktree: `REL` starts with any `pipeline_core_files` prefix and `W` is not main →
   blocked with the core message (PIPELINE exists only in main, D-7).
8. `.claude/*`, `pipeline/*`, `plans/*` → allowed (unchanged).
9. No own active governing state → blocked (unchanged message).
10. LEARN rules (unchanged, against `REL`).

### 2.7 `bash-code-guard.sh` (gate; Bash)

Since #23 the code of the rules below (all but the two strings) lives in `lib/pl_shell_guard.py`.

- Unchanged: block the strings `pipeline_state` and `JUDGE_HOOK_CALLER`.
- Write verbs (existing LEARN heuristic, extended): `>`, `>>`, `tee`, `sed -i`, `perl -pi`, `cp`, `mv`, `rm`,
  `ln`, `chmod`, `truncate`, `git checkout` with any arguments (a ref included), `git restore`.
- **Always blocked, any tier:** the string `core.hooksPath`; a write verb followed (same pipeline segment) by
  a token with a `.git` path component (`.git/...`, `.../.git`), by `.claude/projects/`, by
  `settings.pipeline-grant`, or by a user-settings path (`~/.claude/settings`, `$HOME/.claude/settings`,
  `<absolute home>/.claude/settings`).
- **Core rule:** a write verb followed (same pipeline segment) by a core path string (`.claude/hooks` with or
  without the trailing slash, `.claude/pipeline.json`, `.claude/settings`) or by the `.claude` directory token
  (since #23: `.claude` with or without a trailing slash, `.claude/` followed by a character that cannot
  continue a name, or a glob or brace character in the first component after `.claude/`) is blocked unless
  the **cwd** checkout is main (`STATE_ROOT == MAIN_ROOT`) **and** its state is own, active and
  `edits_pipeline_core`. The explicit main check is cheap and keeps a PIPELINE state that ended up in a
  worktree (copied, or written by v1 code) from opening main's core to shell writes. A command that names a
  core path gets the core message; one that only names a `.claude` directory gets its own message and log
  reason `core-shell:claude-dir`. Limits: quotes or a backslash inside a name, `./` and `..` path segments,
  a brace that splits `.claude` and variables evade the token (ADR-0005 item 7).
- **LEARN rule:** consulted states = the cwd state plus the state of every accepted checkout whose
  **absolute** root appears in the command. If any consulted own active state is LEARN, the existing
  product-dir write heuristic applies; a consulted `unreadable` state counts as LEARN here (fail closed: the
  heuristic applies, message `pipeline state unreadable`), and as no PIPELINE for the core rule (core shell
  writes block). Because the write gate cannot see shell targets, and `cd`-ing to a
  non-LEARN worktree by absolute path must not lift main's LEARN rule. A **relative** `cd ../x && ...` into
  another checkout is not parsed: residual (section 0).
- Not built: treating `git worktree add` as a write verb (residual under D-6; the nested filter of 2.1 makes
  such a worktree inert for resolution).
- It remains a heuristic (`python3 -c "open(...)"` evades it); see section 0 and ADR-0005.

### 2.8 Checkout ownership, `init`, PIPELINE tier

`state_is_own(state, W)`:
- `gitdir_at_init` present → own iff it equals `W.gitdir`.
- absent (legacy, e.g. live #1) → own iff `branch_at_init == W.branch` (branch from the worktree list, no
  extra git call). Because a legacy state copied into a new worktree (observed in #15) sits on another branch
  and must not unlock that worktree, while the same legacy state on its own branch stays usable.
- A state that is not own is **foreign**: every gate treats it as absent, logs `foreign-state` once per call.
- `state_status=unreadable` (the file exists, but reading or JSON parsing fails): every gate treats the
  checkout as having **no own active state** and logs `state-unreadable` once per call. Effect: writes and core
  fail closed (2.6, 2.7), gated spawns block (phase-gate), Stop allows with a stderr warning (2.11), and
  state.py ops refuse (2.4). Because an unreadable file cannot prove a phase window, but blocking Stop on it
  would only loop a session that cannot repair the file.

`init <TIER> <issue>` (decided under the state lock by `state.py init`), first matching row wins:

| Situation | Decision |
|---|---|
| current HEAD detached | refuse "check out a branch first" (a branch is what identifies the task) |
| tier `requires_issue` and current branch in `protected_branches` | refuse |
| tier has `edits_pipeline_core` and this checkout is not the main worktree | refuse "PIPELINE tasks run in the main checkout: only its hooks are live" |
| tier has `edits_pipeline_core` and the grant file has no `pipeline_init` entry for `<issue>` (missing, invalid, other issue) | refuse with the grant message (2.5), exit 4 |
| no state, or `phase == done` | init |
| state foreign by `gitdir_at_init` (copied from another checkout, or repo moved) | **park** `foreign`, warn, init |
| state's `branch_at_init` differs, ref `refs/heads/<b>` exists (branch switched) | **park** `branch-switched`, warn, init |
| state's `branch_at_init` differs, ref missing (renamed or deleted) | **park** `branch-missing:<b>`, warn "if renamed: `git branch -m` back, then `resume <key>`", init |
| same branch, inactive longer than TTL | **park** `stale`, warn, init |
| same branch, active within TTL | refuse, message suggests `pause` |

- Every "park" row goes through `state.py park`, so parking an **own LEARN** state (branch-switched,
  branch-missing, stale) is refused without a `learn_pause` grant for that state's issue, and init then
  refuses with `LEARN #<m> is the task in this checkout; Stepan grants pausing it in
  .claude/settings.pipeline-grant.json`. A foreign LEARN state parks freely, because gates already treat it
  as absent, so parking it lifts no rule.
- Init never deletes a state. Scope C says a differing `branch_at_init` must not block init: every
  differing-branch row parks (the LEARN grant row is decision 7, which narrows C for LEARN only). The
  detached-HEAD and protected-branch refusals concern the **current** HEAD, not the existing state; they exist
  so that `branch_at_init` is a task branch.
- New fields at init: `gitdir_at_init` (absolute git dir of the checkout), `branch_at_init` from the
  worktree list's `branch` line; for a granted PIPELINE init, history `grant:pipeline_init:<issue>`.
- CLAUDE.md swaps section 2 steps 3 and 4 (branch first, then init).

**PIPELINE tier** (`pipeline.json`): `team: dev`, `requires_issue: true`, `edits_pipeline_core: true`, phases
identical to PROJECT, judges `security, architecture, operations`. Main-checkout-only, **because** under D-1
only the main checkout's hooks run: core edits anywhere else have no effect and cannot be live-checked, and
the core rules above rely on "a PIPELINE state exists only in main". Accepted by Stepan (D-7).

Consequence of D-1 to know about: while a PIPELINE task edits main's hooks, those edits are live for every
session immediately (scripts are not snapshotted, research A), including worktree sessions through
forwarding. A broken edit fails closed (rc mapping, 2.2); recovery is the kill switch (section 13).

### 2.9 D: pause / resume / parked

- `pause`: under the lock; requires an **active** state in the slot, own **or foreign** (a foreign one is
  exactly what the migration and the "repo moved" case need to set aside); parks it with reason `pause`
  (`pause-foreign` for a foreign one). An **own LEARN** state needs a `learn_pause` grant for its issue
  (2.9a); without it `pause` refuses and nothing moves. Checkout is free afterwards. A second pause of the
  same issue gets a distinct key.
- `resume <issue|key>`: one transaction; every refusal happens **before anything is parked or moved**, so a
  refused resume leaves the slot and the parked directory exactly as they were.
  1. An own state that is active **within TTL** exists → refuse "finish or pause #N first".
  2. `<issue>` matches several parked keys → refuse, list keys; resume by key. No match → refuse.
  3. Current branch must equal the chosen parked state's `branch_at_init` (detached never matches) → else refuse.
  4. Only now: an own state past TTL (stale), or a foreign state, in the slot is parked with the init rules
     (reason `stale` or `foreign`; a stale own LEARN state without its grant → refuse, nothing moved).
  5. `unpark`: `gitdir_at_init` is set to the current checkout's gitdir when absent (legacy) **or different**,
     logged `resume:gitdir-rebased`. Because a parked file is found inside this checkout's own parked
     directory, location already proves ownership; a different stored gitdir means the repository moved.
  6. History `resume` (resets TTL and watchdog age).
  Resume needs no grant. For LEARN, because restoring it restores its restrictions. For PIPELINE, because a
  parked PIPELINE state exists only through a granted init (history `grant:pipeline_init:<n>`), and resume
  re-opens core only for that same issue, on its own branch, and only in the main checkout (the core rules of
  2.6 and 2.7 require main): the scope Stepan already granted. Residual: a PIPELINE state parked before
  Stepan removed its grant can still be resumed; CLAUDE.md tells him to delete such a parked file together
  with the grant entry.
- `parked`: one line per parked state: key, tier, phase, branch, parked time, reason.
- While only parked states exist every gate behaves exactly as with no pipeline (gates read only
  `pipeline_state.json`; parked files are inert data); Stop allows and prints `Parked here: ...` on stderr.
- TTL never applies to parked states. Parked states live inside their checkout; removing a worktree discards
  them, so CLAUDE.md says to run `parked` before `git worktree remove`.

### 2.9a Grant file `.claude/settings.pipeline-grant.json` (D-7)

- **Location:** the main checkout only, `<CODE_ROOT>/.claude/settings.pipeline-grant.json` (name in
  pipeline.json `grant_file`). One place for Stepan to edit; PIPELINE is main-only anyway, and a LEARN pause
  in a worktree reads main's file too.
- **Format** (all keys optional except `version`; unknown keys make the file invalid, so a typo such as
  `pipeline-init` is reported instead of silently granting nothing):
  ```json
  {"version": 1, "pipeline_init": [21], "learn_pause": [5]}
  ```
  `pipeline_init`: issues for which `init PIPELINE <n>` is allowed. `learn_pause`: issues whose own LEARN
  state may be parked (by `pause`, or by an init/resume park row).
- **Who writes it:** Stepan, in his own terminal (agents cannot, see below). Exact commands, from the main
  checkout `/Users/stepankorshukov/Documents/Projects/academy`:
  - create or change (`>` **overwrites** the whole file, so retype every issue that should stay granted):
    `printf '%s\n' '{"version": 1, "pipeline_init": [21], "learn_pause": []}' > .claude/settings.pipeline-grant.json`
  - check the syntax: `python3 -I -m json.tool .claude/settings.pipeline-grant.json` (prints the object, or
    an error with line and column); the schema (keys, integers) is checked at use, and a refusal names the problem;
  - remove one issue: rerun the create command without it; remove every grant:
    `rm .claude/settings.pipeline-grant.json`.
  Agents cannot write it: tool writes are always blocked (2.6 zone
  "grant", any tier including PIPELINE), shell writes too (2.7, string `settings.pipeline-grant` with a write
  verb). It also sits under the core prefix `.claude/settings`, so even without those rules it would be core.
- **Read:** by `state.py` inside the transaction that decides (init or park), every time, never cached.
  Missing file → no grant (`grant-missing`). Unreadable, not JSON, not an object, `version` not exactly the
  integer 1, an unknown key, a list value that is not a list, or a list member that is not a positive integer
  → no grant. Integer checks use `type(x) is int`, because Python's `bool` is a subclass of `int`: JSON `true`
  would otherwise pass as `version` 1 or as issue 1. The refusal says
  `.claude/settings.pipeline-grant.json is invalid: <why>; no grant applies` (`grant-invalid`). Never fails open.
- **Lifetime:** not consumed. CLAUDE.md: Stepan removes the issue from the list when its PR is merged. Not
  consumed automatically because that would make a script write Stepan's authorization file; a stale entry
  only re-admits PIPELINE for that same issue in the main checkout, or a pause of that same LEARN issue.
- **Ignored by git:** `.gitignore` gets `.claude/settings.pipeline-grant.json`, because a grant must never
  make the tree dirty or enter a commit; run.sh's copy excludes it (2.13), so a real grant never leaks into
  the test repo.

### 2.10 A: judge vote recording

**`judge-handback.sh` (new observer, PreToolUse matcher `SubagentHandback`)**, primary path:
1. `tool_name == SubagentHandback` and `agent_id` present, else exit 0.
2. `STATE_STATUS` not `own:*` → log `vote-ignored:no-state`, exit 0.
3. `hookio.py handback_vote` → `judge|verdict|agent_id|role_source|transcript_kind`:
   - verdict = `verdict_from(tool_input.message)` (last exact PASS/FAIL line, unchanged grammar).
   - role: first user record of the subagent transcript; candidates in order: `agent_transcript_path`
     (`explicit`); `transcript_path` if its basename is `agent-<agent_id>.jsonl` (`subagent`);
     `<dirname(transcript_path)>/<session_id>/subagents/agent-<agent_id>.jsonl` (`main`);
     `<dirname(transcript_path)>/agent-<agent_id>.jsonl`. First existing file wins (which one the harness
     gives a subagent PreToolUse is unverified, research A; L3 settles it).
   - no transcript → `artifacts.judge_spawns[agent_id]` (`spawn_map`).
4. Unknown or non-judge role → log `role-unknown` / `vote-ignored:not-a-judge`, exit 0; `UNKNOWN` verdict →
   `verdict-unknown`, exit 0.
5. `(cd "$STATE_ROOT" && JUDGE_HOOK_CALLER=judge-count-hook bash "$CODE_ROOT/.claude/hooks/pipeline-advance.sh" "$PHASE" "$JUDGE" "$VERDICT" "$AGENT_ID" handback)`; log the result.
6. Exit 0 (observer).

PreToolUse over PostToolUse because the research verified PreToolUse fires on `SubagentHandback` inside a
judge; PostToolUse after the call that ends the run is unverified.

**`judge-vote.sh` (observer, SubagentStop, fallback):** common.sh buffers stdin (today hookio reads stdin
itself); `hookio.py judge_vote` also returns `agent_id`, `transcript_lines`, `handback_in_transcript`; passes
`agent_id` and path `subagent_stop`; logs the outcome, including `verdict-unknown` with
`handback_in_transcript=false` when the transcript lagged (research cause 1), which was silent until now.

**`judge-count.sh` (observer, PostToolUse Agent|Task):** unchanged sync fallback, plus: `tool_response` dict
with `agentId` (or `agent_id`) and a judge role of the tier → `pipeline-advance.sh spawn` (spawn map). The
field name is unverified; L3 logs it.

**Idempotency:** dedupe `(agent_id, round)` inside the locked transaction, so handback + SubagentStop
(+ PostToolUse when it carries agent_id) record one vote in any order. A re-spawned judge has a new
agent_id; latest per judge wins (existing round logic). A lock timeout on one path is covered by the other.

**`phase-gate.sh`:** block spawning any gated role or judge with `tool_input.isolation == "worktree"`,
because the new agent's `cwd` would resolve to the new worktree, which has no state: votes would vanish and
coder writes would be blocked.

**Vote authenticity (residual, ADR-0005):** a vote is authenticated only by (a) the env flag
`JUDGE_HOOK_CALLER`, which bash-code-guard keeps out of tool-issued commands by string match, and (b) the
role read from a transcript file that tools cannot write (2.6) but a shell `python3 -c` can. Both stop an
honest agent's plain-text "PASS"; neither stops deliberate forgery (D-6).

### 2.11 Other hook scripts

- All scripts: `DIR=${CLAUDE_PROJECT_DIR:-$(pwd)}` is replaced by the three-line header of 2.2.
- Every `python3` call in hook scripts and libs is `python3 -I`; libs import siblings via
  `sys.path.append(os.path.dirname(os.path.realpath(__file__)))`.
- `phase-gate.sh` (gate): uses `STATE_STATUS`; foreign = none; `unreadable` = none (gated spawns block),
  logged `state-unreadable` (2.8).
- `pipeline-watchdog.sh` (observer): marker `${TMPDIR:-/tmp}/pipeline_watchdog_<hashlib.sha1(STATE_ROOT)[:12]>`
  computed in the same Python call that reads the state (no `sha1sum`, absent on macOS); age from latest
  activity; logs `watchdog-notify`.
- `phase-complete.sh` (gate, Stop): `unreadable` counts as no own active state: allow, stderr
  `pipeline state unreadable: <state file>; Stepan inspects it`, logged `state-unreadable` (2.8).
  After "no own active state → allow" and the human-wait check, before any
  `block`: `hookio.py bg_running` counts `background_tasks` entries that are dicts with `type == "subagent"`
  and `status == "running"` (absent, null, non-list → 0). `> 0` → allow, stderr `N subagent(s) still
  running; pipeline at <phase>`, log `stop-allow:subagents-running`. Shell tasks, monitors and crons do not
  count (D-2). `cd "$DIR"` → `cd "$STATE_ROOT"`. On success the state is removed with `state.py finish`
  (under the lock) instead of `rm`; a lock timeout there allows the stop and leaves the done state for the
  next init (a `done` state never blocks init).
- `lib/hookio.py`: `project_dir()` removed; agents dir = `code_root()` from checkout.py.
- `lib/cfg.py`: unchanged location rule (pipeline.json next to itself = main's). No `--checkout` option.

### 2.12 Config, settings, ignore rules

- `.claude/pipeline.json`: `PIPELINE` tier; `hook_log_max_bytes: 262144`; `state_lock_timeout_seconds: 5`;
  `grant_file: ".claude/settings.pipeline-grant.json"`; `protected_files: [".claude/pipeline_state"]`
  (prefix); `pipeline_core_files: [".claude/pipeline.json", ".claude/settings", ".claude/hooks/"]` (D-5).
- `.claude/settings.json`: commands keep the form `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/<hook>.sh"`; new
  PreToolUse entry matcher `SubagentHandback` → `judge-handback.sh`; every hook gets `"timeout": 15`
  (field per hooks.md via the researcher; the coder confirms the spelling against the docs).
- `.gitignore`: `.claude/pipeline_state*` (replaces the two exact lines), `.claude/worktrees/` (today only in
  `.git/info/exclude`; a fresh clone would otherwise show worktrees as untracked and fail dirty-tree gates),
  `.claude/settings.local.json` (today ignored only by Stepan's global ignore file, fact list; a kill-switch
  file must never make the tree dirty on another machine) and `.claude/settings.pipeline-grant.json` (2.9a).

### 2.13 F: `tests/pipeline/run.sh`

- Copy: Python `shutil.copytree` of `.claude` with an ignore function that drops, at the top level of
  `.claude` only, `worktrees`, `settings.local.json`, `settings.pipeline-grant.json` and every name starting
  with `pipeline_state`. After the copy, if any of them exists in `$WORK/.claude`, run.sh prints exactly
  `  FAIL copy excludes worktrees, local settings, grant file and runtime state` and `1 failed`, and exits 1
  before any other test (so 11.1 step 6's grep sees the row name). `cp -r` + `rm` is rejected: it first copies
  whole worktrees (node_modules) and its `.git` file reaches into the real gitdir.
- `export HOME="$BASE/home"` (S4, S11 write there; nothing touches the real `~/.claude`),
  `export TMPDIR="$BASE/tmp"`; `git config` stays repo-local as today.
- `echo '.claude/worktrees/' >> .git/info/exclude` in the test repo.
- Test worktrees are created with spaces, from the test repo's HEAD (which carries the copied `.claude`,
  fact list): `"$WORK/.claude/worktrees/wt one"` (`git worktree add`), so every B test exercises paths with
  spaces.
- Grant files in tests are written by run.sh's own shell (`printf` into `$WORK/.claude/...`), never through a
  hook; `reset_state` removes them.
- `reset_state` at the start of each new group: removes state, `.flock`, parked dir and grant file in WORK and
  every test worktree, and any extra worktree, so one red test does not cascade.
- Existing tests change only where C requires it: TASK 12 and LEARN 5 initialise on a feature branch; the
  "pr blocked on main" check switches to main after init.
- Helpers gain `cwd`, `agent_id`, `session_id`, `transcript_path` arguments; every helper sends `cwd`
  (default `$WORK`), because production hooks always receive it.

New tests. Names are the exact `ok`/`FAIL` strings. **Every row names one concrete mutation** (a few name a
combined one); the tester applies it to a copy (section 11) and the row must go red. For each row the
"distinguishing assertion" is the observable the mutation changes; the row's test asserts it, so no later
branch can produce the same result.

| # | Test name | Mutation that turns it red (distinguishing assertion) |
|---|---|---|
| F1 | `copy excludes worktrees, local settings, grant file and runtime state` | run.sh ignore function returns `[]`. The tester's helper creates the six seeds (nested repo under `worktrees/`, `settings.local.json`, `settings.pipeline-grant.json`, state, flock, parked dir) in the **source** `.claude` of its copy, i.e. the tree run.sh copies from; with the mutation they reach `$WORK/.claude` and the post-copy check prints the FAIL line |
| B1 | `settings.json wires every hook from CLAUDE_PROJECT_DIR with a timeout, including judge-handback` | delete the `SubagentHandback` entry from `.claude/settings.json` |
| B2 | `cwd in a linked worktree selects that worktree's state` | `resolve_cwd` ignores `cwd` and returns main |
| B3 | `main checkout without state still blocks while the worktree is active` (cwd = worktree, write main product file) | require-pipeline governs by the cwd state instead of `checkout_of(P)` |
| B4 | `cwd outside git uses the main checkout's state` (main at coder, cwd = `$BASE/tmp`: coder spawn allowed) | fallback returns `realpath(cwd)` as state root instead of main |
| B5 | `cwd in a foreign git repo uses the main checkout's state` (foreign repo holds a coder-phase state; main none: coder spawn blocked) | accept any `rev-parse --show-toplevel` result instead of the registered list |
| B6 | `fake .git-file directory uses the main checkout's state` (dir with `.git` file `gitdir: $WORK/.git` and a coder-phase state; main none: coder spawn blocked) | accept a candidate when its `--git-common-dir` equals main's |
| B7 | `a registered worktree's own hook files never decide` (worktree's `pipeline.json` has empty core and protected lists, its `lib/*.py` replaced by `exit 0` stubs; main PROJECT active; cwd = worktree; main's script run; Write to main's `.claude/hooks/x.sh` blocked) | common.sh sets `LIB` / `cfg` from `$STATE_ROOT` instead of `$CODE_ROOT` |
| B8 | `pipeline-advance status follows pwd into a worktree` (main's copy run with pwd = worktree) | pipeline-advance resolves state from `CODE_ROOT` instead of `pwd` |
| B8b | `a linked worktree's own pipeline-advance copy refuses to run` | delete the "not the main worktree" refusal |
| B9 | `nested worktree file is governed by its own checkout` (main PROJECT active, product file under `wt one` with no state: blocked) | `checkout_of` picks the shortest matching root instead of the longest |
| B10 | `nested worktree state file is protected` (main PROJECT active, Write `wt one/.claude/pipeline_state.json`: blocked) | remove step 6 of 2.6 (`protected_files`): REL `.claude/pipeline_state.json` in `wt one` then reaches step 8's `.claude/*` allowance. (Revision 2's mutation "`checkout_of` always returns main" is replaced: step 5 would still block it, so it stayed green) |
| B10b | `unregistered directory under .claude/worktrees is never auto-allowed` (`.claude/worktrees/stray/x`, no state: blocked) | remove step 5 of 2.6 |
| B11 | `watchdog markers are per checkout` (two stale checkouts both log `watchdog-notify`) | marker name without the hash |
| B12 | `hook log records checkout, source and decision` | `log_event` drops the `source` field |
| B13a | `hook log never contains a bash command` (canary `ghp_canary_21` in a blocked command) | add `tool_input` to the logged fields |
| B13b | `hook log never contains a handback message` (canary in `tool_input.message`) | judge-handback logs `message` as `reason` |
| B14 | `hook log rotates at hook_log_max_bytes` (max 2000, 60 events: size bounded, `.1` exists, no `.2`) | remove the size check |
| B15 | `hook log symlink is not followed` (`.git/pipeline-hooks.log` pre-created as a symlink to a canary file; canary unchanged, gate rc unchanged) | drop `O_NOFOLLOW` |
| B16 | `failed log write does not change the gate result` (log path is a directory; blocked write still rc 2, allowed write still rc 0) | `log_event` re-raises `OSError` |
| B17 | `worktree path with spaces resolves` (`wt one`, B2 setup, assert the state root printed by `checkout.py context`) | common.sh reads the context line with default IFS |
| B18a | `context line keeps empty fields: own state on a detached HEAD still blocks Stop` (step 6: run.sh writes a PROJECT state at `coder` with `gitdir_at_init` = realpath of `$WORK/.git` and `branch_at_init` = the current feature branch, as `init` would; then `git checkout --detach` in WORK; Stop event without `tool_name`, `stop_hook_active: false`. Asserts rc 2, stderr contains `Pipeline not complete. Current phase: coder`, stderr does **not** contain `resolver failed`) | separator `$'\t'` in checkout.py and common.sh. Mechanism (reproduced on bash 3.2.57): the line `r s g <empty branch> m <empty tool> own:PROJECT:coder` collapses to `[r][s][g][m][own:PROJECT:coder][][]`, `STATE_STATUS` reads empty, common.sh step 5 blocks with `pipeline resolver failed`: still rc 2, so the **message** assertions are what go red |
| B18b | `context line keeps empty fields: no state on a detached HEAD allows Stop` (step 2: no state, `git checkout --detach` in WORK, Stop event without `tool_name`, `stop_hook_active: false`: rc 0) | same TAB mutation: `[/r][cwd][/g][/m][none][][]` (reproduced), `STATE_STATUS` empty, step 5 blocks: rc 2 instead of 0. This row's correct result is ALLOW, so the fail-closed branch cannot absorb the mutation |
| B19a | `worktree registered inside main's tree is not a checkout` (`git worktree add "$WORK/.claude/hooks/lib/json"`; cwd there: context prints state root `$WORK`, log `worktree-skipped:nested`) | remove the nested filter in `worktrees()` |
| B19b | `main's core stays core under a nested worktree` (same nested worktree, holding its own PROJECT state at `coder` with matching gitdir; Write `.../lib/json/x.py`: blocked with the core message) | remove the nested filter **and** move step 3 of 2.6 after the checkout mapping. With the filter removed alone the row stays green (step 3 holds); the tester records that as expected, not as a defect |
| B20 | `a lib file named like a stdlib module does not shadow it` (`$WORK/.claude/hooks/lib/json.py` = `raise SystemExit(3)`; Write `plans/x.md` rc 0) | common.sh calls `python3` without `-I` (context crashes, gate blocks) |
| B22 | `relative gitdir line in a worktree resolves` (run.sh rewrites `wt one/.git` to the relative form `gitdir: ../../../.git/worktrees/<name>`, which git also reads on 2.43; B2 setup: context prints state root `wt one`; `wt one`'s own `require-pipeline.sh` run logs `forwarded=true`) | `worktrees()` does not join a relative `gitdir:` to the root (the worktree is dropped `bad-gitdir`, state root = `$WORK`) |
| B21 | `a session started in a linked worktree runs main's hooks` (`wt one`'s `pipeline.json` has empty core lists; `wt one`'s `require-pipeline.sh` run with `CLAUDE_PROJECT_DIR="$WT"`; main PROJECT active; Write main's `.claude/hooks/x.sh` blocked; log `forwarded=true`) | remove the forward block from common.sh |
| S1 | `settings.local.json not writable by tools outside PIPELINE` (PROJECT active) | `pipeline_core_files` entry back to `.claude/settings.json` |
| S2 | `shell write to settings.local.json blocked outside PIPELINE` | bash core path list without the `.claude/settings` prefix (only `settings.json`) |
| S3 | `symlink into hooks is core` (`apps/link -> ../.claude/hooks`, PROJECT active, Write `apps/link/x.sh`: blocked) | require-pipeline uses `abspath` instead of `realpath` |
| S4 | `transcript files are not writable, memory is` (PROJECT active; Write `$HOME/.claude/projects/p/s/subagents/agent-x.jsonl` blocked; Write `$HOME/.claude/projects/p/memory/m.md` allowed) | (a) remove the transcript zone: first assert red; (b) block the whole `projects` dir: second assert red |
| S5 | `git dir is never written by tools` (PROJECT active in main; `.git/hooks/pre-commit` and `.git/config` blocked) | remove the git zone (both the common-dir and the component check) |
| S5b | `a .git path component is never written by tools` (PROJECT active; Write `.claude/worktrees/wt one/.git` and `apps/sub/.git/config` blocked) | remove the component check, keep the common-dir check |
| S6 | `gate crash blocks` (`chmod 000 "$WORK/.claude/pipeline.json"`, require-pipeline rc 2, message `failed internally`; mode restored from a saved value and checked) | remove the rc mapping in `run_hook` |
| S7 | `broken python3 blocks gates with a clear message, observers exit 0` (`PATH` starts with a dir whose `python3` is `exit 127`; stderr contains `python3 not found or unusable`) | probe replaced by `command -v python3` (gate then blocks as resolver failure: rc 2, message lacks `python3`) |
| S8 | `missing python3 blocks gates with a clear message, observers exit 0` (`PATH` = an empty directory, hook run as `/bin/bash "<abs path>"`; stderr contains exactly `python3 not found or unusable`, rc 2; observer rc 0) | remove the python probe (python3 call fails, resolver-failure block: message text differs) |
| S9 | `resolver failure blocks gates` (`chmod 000 "$WORK/.claude/hooks/lib/checkout.py"`; Write `plans/x.md`: rc 2, stderr `pipeline resolver failed`; an observer rc 0; mode restored from a saved value and checked) | common.sh skips the `CTX_RC` / empty-state-root check (the gate then crashes later: rc 2 with `failed internally`, message differs) |
| S10 | `shell core write refused from a worktree holding a PIPELINE state` (own PIPELINE state written by the test into `wt one`; cwd = `wt one`; `echo x >> "$WORK/.claude/hooks/x.sh"`: blocked) | remove the `STATE_ROOT == MAIN_ROOT` check in the bash core rule |
| S11 | `user-level settings are never written by tools` (PROJECT active; Write `$HOME/.claude/settings.json` and `$HOME/.claude/settings.local.json` blocked) | remove the user-settings zone (P is outside every checkout, the PROJECT cwd state allows it) |
| A1 | `handback vote recorded from tool_input.message (subagent transcript under main transcript dir)` | remove candidate `main` |
| A2 | `handback vote recorded when transcript_path is the subagent's own` | remove candidate `subagent` |
| A3 | `handback role from spawn map when no transcript exists` | remove the spawn-map lookup |
| A4 | `live-shaped SubagentStop records the vote` (fields exactly as the research diag log, `agent_type=general-purpose`, no `last_assistant_message`, attachment records, final SubagentHandback tool_use; judge-handback **not** invoked) | drop the `SubagentHandback` branch in `hookio._block_text` |
| A5 | `lagging transcript gives verdict-unknown, logged with handback_in_transcript=false` | judge-vote returns before logging on `UNKNOWN` (silent exit) |
| A6 | `handback then SubagentStop records one vote` | remove the `(agent_id, round)` dedupe |
| A7 | `SubagentStop then handback records one vote` | dedupe compares `path` too (order-dependent) |
| A8 | `concurrent votes are all recorded` (5 judges, distinct agent_ids, delay 300 ms, `&` + `wait`) | `transaction()` skips `flock` (delay kept) |
| A9 | `concurrent advance and spawn record lose nothing` (state at `judge_design`; delay 300 ms; run.sh calls the state.py ops directly: `python3 -I lib/state.py advance "$WORK" judge_design planner` started in the background, 100 ms later `python3 -I lib/state.py record_spawn "$WORK" judge_design agentX security`; `wait`. Asserts: phase is `planner`, and either `judge_spawns` holds `agentX` or `record_spawn` exited 3 with `not in a judge phase`) | state.py op `advance` runs its read-modify-write without `transaction()` (delay kept): `record_spawn`'s later write restores `judge_design`, the phase assertion goes red |
| A10 | `lock timeout writes nothing and fails` (lock held by a background `python3 -c` flock, timeout 1 s) | timeout path continues instead of raising |
| A11 | `bad agent_id is ignored` (`../../x`) | remove the agent_id regex |
| A12 | `non-judge handback is not a vote` (coder prompt, message ends `PASS`) | remove the judge-key check |
| A13 | `judge spawn with isolation worktree is blocked` | remove the isolation rule |
| A14 | `handback hook never blocks` (garbage JSON, missing state, held lock: rc 0) | judge-handback declares `HOOK_KIND=gate` and exits 1 on bad JSON |
| C1 | `init parks a state copied from another checkout` (state with `gitdir_at_init` of another path and `branch_at_init` = the current branch; asserts the parked file's `parked_reason == "foreign"` and a new state exists) | treat any `gitdir_at_init` as matching (the state then looks own, same branch, active: init refuses and no parked file exists) |
| C2 | `init parks a state from a switched branch` | delete the `branch-switched` row (falls to refuse) |
| C3 | `init parks a state whose branch ref is missing` | `branch-missing` row refuses instead of parking |
| C4 | `init refuses on detached HEAD` | remove the detached check |
| C5 | `init refuses on main for an issue tier` | remove the protected-branch check |
| C6 | `init parks a stale state instead of deleting it` | stale row overwrites (parked dir stays empty) |
| C7 | `gates ignore a foreign state` (copied state in worktree: product write blocked) | `state_is_own` returns true |
| C8 | `TTL counts from last activity, not session start` | age from `session_ts` |
| C9 | `legacy state on another branch is foreign` (no `gitdir_at_init`, `branch_at_init` differs) | legacy states are own unconditionally |
| C10 | `PIPELINE init refused in a linked worktree` (a valid grant for the issue exists, so only the main-only row can refuse) | remove the main-only check |
| D1 | `pause parks the active state and frees the checkout` | pause copies instead of moving (status still prints the state) |
| D2 | `with only parked states every gate behaves as no pipeline` (six asserts `parked: write`, `parked: coder spawn`, `parked: judge spawn`, `parked: vote`, `parked: stop`, `parked: watchdog`) | gates read the first parked file as the state |
| D3 | `second pause of the same issue keeps both; resume by issue is refused as ambiguous` | park key without the epoch (second park overwrites) |
| D4 | `resume refuses while a pipeline is active` | remove the own-active-state check in resume |
| D5 | `resume refuses on a different branch` | remove the branch check |
| D6 | `resume restores phase, votes and history` | unpark drops `artifacts` |
| D7 | `status prints parked summary on stderr and pure JSON on stdout` | parked line printed to stdout |
| D8 | `pipeline core not writable in PROJECT` | core rule checks "active" only |
| D9 | `pipeline core writable in PIPELINE` (granted) | require-pipeline ignores `edits_pipeline_core` (core always blocked) |
| D10 | `pipeline core not writable in LEARN` | LEARN allowance moved before the core check |
| D11 | `shell write to hooks blocked outside PIPELINE` (`echo x >> .claude/hooks/x.sh`, `sed -i ... .claude/pipeline.json`) | remove the bash core rule |
| D12 | `shell write to hooks allowed in PIPELINE` (granted, cwd = main) | bash-code-guard ignores `edits_pipeline_core` (core always blocked) |
| D13 | `pause parks a foreign state` | pause requires an own state |
| D14 | `resume after a repository move rebases gitdir_at_init` (parked state with another gitdir, same branch) | resume requires gitdir equality |
| D15 | `stop removes a done state only under the lock` (lock held: state remains, stop allowed; released: removed) | phase-complete removes with `rm -f` |
| G1 | `init PIPELINE refused without a grant` (no grant file; exit 4, message names the file) | remove the grant row from init |
| G2 | `init PIPELINE allowed with a grant naming the issue` (history holds `grant:pipeline_init:<n>`) | init looks the issue up in `learn_pause` instead of `pipeline_init` |
| G3 | `a grant for another issue does not admit init PIPELINE` (`pipeline_init: [998]`, init 999 refused) | grant check accepts any non-empty `pipeline_init` |
| G4 | `an invalid grant file grants nothing` (two asserts: `{"version": 1, "pipeline-init": [999]}` refused with `invalid`; non-JSON text refused with `invalid`) | a validation error is treated as "granted" |
| G5 | `pause of an own LEARN state refused without a grant` (state stays in the slot) | remove the LEARN check in `park` |
| G6 | `pause of an own LEARN state allowed with a learn_pause grant` | the LEARN check reads `pipeline_init` |
| G7 | `init cannot park an own LEARN state without a grant` (LEARN own state, branch switched, `init TASK`: refused, LEARN state still in the slot) | the LEARN check runs only for reason `pause` |
| G8 | `grant file is never written by tools or shell, even in PIPELINE` (granted PIPELINE active in main; Write `.claude/settings.pipeline-grant.json` blocked; `printf '{}' > .claude/settings.pipeline-grant.json` blocked) | (a) remove the tool grant zone: first assert red (core allows it in PIPELINE); (b) remove the bash `settings.pipeline-grant` rule: second assert red |
| E1 | `stop allowed while a subagent runs` | `bg_running` returns 0 always |
| E2 | `running shell task does not allow stop` | drop the `type` filter |
| E3 | `completed subagent does not allow stop` | drop the `status` filter |
| E4 | `absent or malformed background_tasks does not allow stop` | absent/non-list counts as 1 |

A mutation whose run stays green means that test cannot fail: the tester reports it as a defect (except the
one green run B19b names explicitly).

### 2.14 G: architect

`.claude/agents/dev/architect.md`: frontmatter `tools` gains `Write`; text: "You write exactly one file: your
design, `plans/<issue>-<slug>-design.md` (any `plans/<issue>-*.md`). No code, no other file. Return a short
summary; the file is the design of record." "Does NOT write code" stays. No role-aware gate (D-4).

### 2.15 Docs, ADR, CI

- CLAUDE.md: tiers table + `PIPELINE | changes to .claude/hooks, pipeline.json, settings*.json | same as
  PROJECT, main checkout only, needs Stepan's grant`; section 2 steps 3/4 swapped; canonical
  `pipeline-advance.sh` invocation (2.5); pause/resume/parked; the grant file (format, "Stepan writes it by
  hand, agents never", "remove the issue after merge, together with any parked PIPELINE file of that issue", LEARN pause needs it;
  the exact create / check / remove commands of 2.9a); "Hooks enforce": hooks and
  config always from the main checkout (a worktree session's hook copies forward to main), state per
  checkout, foreign states ignored, core (incl. `settings.local.json`) only in PIPELINE, hook log
  `.git/pipeline-hooks.log`; section 0's threat model in two lines; "the main checkout must always be on a
  branch that contains pipeline v2 (`git merge-base --is-ancestor <v2 commit> HEAD`); bring an older branch
  up with `git merge main` (or the rebase in section 12) **before** checking it out in the main checkout"; "a
  worktree on an older branch runs `git merge main` before its pipeline continues (its hook wiring comes from
  its own settings.json)"; "create worktrees only under `.claude/worktrees/` (others inside the repo are
  ignored by the resolver)"; "never spawn role agents with isolation: worktree"; run `parked` before removing
  a worktree; session start: `status` and `parked`. Plus the one-time migration steps of section 12 (#1, #15).
- `pipeline/state_machine.md`: commands, state per checkout, parked dir and keys, init table with grant
  rows, TTL from activity, PIPELINE tier, grant file, vote paths and dedupe.
- `.github/labels.yml` + `tier:pipeline`; `.github/pull_request_template.md` tier list + `PIPELINE` (and the
  missing `RESEARCH | RELEASE`); `.github/ISSUE_TEMPLATE/feature.yml` dropdown + `PIPELINE`.
- ci.yml `pipeline` job: `python3 -m py_compile .claude/hooks/lib/*.py` before run.sh; shellcheck adds
  `.claude/hooks/lib/*.sh` explicitly.
- `docs/adr/0005-pipeline-v2.md` (status Proposed, English):
  1. Threat model (D-6): guardrail, not sandbox; the judge evaluation rule.
  2. Hooks, config and agents from the main checkout only; worktree copies forward; state per checkout from
     `cwd`, registered linked worktrees outside main's tree or under `.claude/worktrees/` only.
  3. Parked states and keys.
  4. PIPELINE as the only core writer, main checkout only (accepted, D-7); core includes
     `settings.local.json` (D-5); the grant file for `init PIPELINE` and LEARN pause (D-7).
  5. Fail-closed gates (including resolver failure and missing python3), fail-quiet observers, `python3 -I`.
  6. Hook log location.
  7. **Accepted residual risks (deliberate bypass only, caught by review and by Stepan at merge):**
     a worktree registered inside main's tree on an orphan branch (inert for resolution, main's zones
     absolute; `git worktree add` is not a write verb); shell evasion of bash-code-guard (`python3 -c`,
     variables, and relative paths: a relative `cd` evades the LEARN rule **and** the core, grant-file and
     user-settings shell strings, which match path text only, e.g. `cd .claude && echo x >> hooks/x.sh`);
     transcript forgery through the shell; `JUDGE_HOOK_CALLER`
     set by indirection (vote authenticity is not cryptographic); `cd` into a sibling registered worktree to
     pick a permissive state for spawns, votes or Stop; a planted log file (no `fstat` check); a deliberately
     replaced registered worktree directory with a valid-looking `.git` file; a pre-v2 worktree session runs
     v1 hooks until it merges main; harness kill at the hook timeout fails open; a PIPELINE agent with an
     open grant could edit core beyond its issue's scope (review catches it).
  8. The `transcript_path` finding from L3.
  ADR-0004 gets one line "Pipeline mechanics: see ADR-0005". A separate ADR because these are trust-boundary
  decisions.

---

## 3. Alternatives considered

| Alternative | Rejected because |
|---|---|
| Dispatcher running the resolved checkout's own scripts (round 1) | D-1 replaced: an old-commit worktree or a fake `.git`-file dir would choose the code that gates main |
| Block every hook in a worktree-started session ("start in main") instead of forwarding | sessions are routinely started in worktrees (#15); blocking makes them unusable, forwarding keeps D-1 with a dozen builtin lines |
| Accept any directory whose `--git-common-dir` equals main's | passed by a fake `.git`-file directory (reproduced) |
| Keep revision 2's common-dir re-check of a picked worktree | D-6: only defends a deliberately replaced directory; costs a git call per hook |
| Treat `git worktree add` as a write verb | D-6: deliberate-only; the nested filter already makes such a worktree inert |
| `PIPELINE_CHECKOUT` env to steer state | an env variable is agent-influenceable steering; `cwd` + registry needs no extra channel |
| Hook calls `state.py` directly with a pre-resolved root (skip re-resolution on votes) | would add a second entry point for state writes; votes are rare, the extra ~70 ms is irrelevant |
| Fail closed in observers too | a blocked `SubagentHandback` traps a judge; a crashing watchdog would block every tool call |
| Shell LEARN rule against main's state always | blocks unrelated sessions in other worktrees while Stepan learns in main |
| PIPELINE allowed in worktrees | its hook edits have no effect there and cannot be live-checked (D-1); D-7 accepted main-only |
| TAB-separated context line, empty fields as a placeholder (`-`) | a placeholder needs decoding everywhere and can collide with a real value; `\x1f` keeps empty fields natively and no accepted path contains it |
| Grant consumed on use (script removes the issue) | a script would write Stepan's authorization file; a stale grant only re-admits the same issue |
| Grant with an expiry date | extra typing for Stepan on every grant for a risk D-6 places out of scope |
| Grant signed (HMAC, key outside the repo) | defends only deliberate forgery (D-6); the file is already unwritable by tools and shell |
| Grant per checkout | Stepan would edit several files; PIPELINE is main-only and LEARN pause is rare |
| Grant required for `resume` of LEARN | resuming LEARN restores restrictions; it cannot lift a rule |
| Reuse `pipeline_state.json.lock` for flock | v1's O_EXCL path waits 5 s on an existing file; v2 never deletes its lock |
| Plain `git rebase main` for feat/1 | after a squash merge it replays 5ad27f4 onto v2's hookio.py and run.sh: likely conflicts (section 12) |
| O_EXCL lock with stale-lock breaking | breaking a lock is exactly the bug; flock has no stale case |
| Delete foreign/stale states at init | loses votes and history; parking is cheap |
| Refuse init when `branch_at_init` ref is missing (round 1) | contradicts scope C, and parking loses nothing |
| Branch-only foreignness check for new states | cannot tell a copied state from the same checkout after a switch; `gitdir_at_init` can |
| Parked states in the git common dir | D-3 says per checkout; a common dir makes resume across worktrees ambiguous |
| Log inside `.claude/` | copied by tooling, dirty in `git status` unless ignored per checkout |
| `status` with parked lines on stdout | breaks every JSON consumer (tests' `votes()`) |
| Role-aware write gate for the architect | impossible today (research G); D-4 says role text is enough |

## 4. Failure modes and how each is caught

| Failure | Caught by |
|---|---|
| Agent `cd`s into another repo / fake checkout | registered-worktree resolution, fallback to main; B5, B6 |
| Old-commit worktree tries to govern main | its scripts never decide (no delegation, `LIB` from `CODE_ROOT`, worktree copies forward); B7, B21; its own pipeline-advance refuses (v2) or is outdated (pre-v2: section 12 merges main first) |
| Session started inside a worktree | v2+ copy forwards to main's copy; main's copy missing → gates block; B21; pre-v2 copy: residual, R6 |
| Worktree registered inside main's tree (e.g. `.claude/hooks/lib/json`) | nested filter (B19a); main's zones absolute before mapping (B19b); stdlib not shadowed (`-I`, B20) |
| Helper in `lib/` named like a stdlib module, or `PYTHONPATH` set | `python3 -I`, lib appended; B20 |
| Agent `cd`s into a sibling registered worktree | intended for state; write gate unaffected (B3); core shell writes need cwd = main with PIPELINE (S10); residual for spawn windows and Stop documented in ADR-0005 |
| Write via a symlink into core or state | `realpath`; S3 |
| Agent edits or "cleans" transcript files | transcript zone for tools; S4; shell residual |
| Write into `.git/hooks`, `.git/config`, a worktree's `.git`, the hook log | git zone (common dir + component); S5, S5b; shell `.git` component rule |
| Write to `settings.local.json` or `~/.claude/settings*.json` | core prefix `.claude/settings`; user-settings zone; S1, S2, S11 |
| Agent starts a PIPELINE task or pauses LEARN to lift a rule | grant file read under the lock; G1-G8 |
| Grant file malformed | invalid = no grant, message names the problem; G4 |
| Gate script crashes or hangs internally | rc mapping to 2, subprocess timeouts; S6 |
| Resolver crashes or prints nothing | common.sh blocks gates (`pipeline resolver failed`); S9 |
| Empty `tool_name` / detached HEAD shifts context fields | `\x1f` separator; B18a (message), B18b (allow case). With a TAB separator the real hazard is **spurious fail-closed blocking**: every Stop (no `tool_name`) and every call on a detached HEAD reads `STATE_STATUS` empty and is blocked by common.sh step 5 as `pipeline resolver failed`, including a Stop with no pipeline at all. (Before revision 3's step-5 check the same shift failed open; revision 3's own B18 text still described that) |
| Worktree `.git` file with a relative `gitdir:` (git 2.48+ `worktree.useRelativePaths`) | joined to the worktree root in `worktrees()` and in common.sh forwarding; B22. Unhandled it would fail closed (worktree dropped, forwarding finds no `commondir`), never open |
| State file unreadable | no own active state for every gate: writes, core and gated spawns block, Stop allows with a warning, state.py ops refuse (2.8) |
| `python3` missing or broken | builtins-only prologue, probe: gates block with message, observers exit 0; S7, S8 |
| Harness kills a hook at its timeout | fails open (documented harness behaviour); gates never wait on the lock, git calls time out at 3 s, harness timeout 15 s |
| Log write fails or log is a symlink | `O_NOFOLLOW`, `OSError` swallowed with a stderr line; B15, B16 |
| Handback PreToolUse receives an unexpected `transcript_path` | four candidates + spawn map, logged `transcript_kind`; A1-A3; L3 |
| Transcript not flushed at SubagentStop | primary path does not need it; logged; A5 |
| Both vote paths fire | dedupe under lock; A6, A7 |
| Concurrent writers lose updates | flock for every op incl. advance, CAS on advance; A8, A9 |
| Lock held by a hung process | timeout, nothing written, logged; A10 |
| Copied or legacy state unlocks writes in a new worktree | `state_is_own` (gitdir, legacy branch fallback); C7, C9 |
| Branch renamed after init | init parks `branch-missing`, resume by key after rename back; C3, D5 |
| Repository moved | state becomes foreign; `pause` + `resume` rebases gitdir; D13, D14 |
| Parked files, flock or grant make the tree dirty | `.gitignore` (v2 branches); `.git/info/exclude` added at R2 for v1 branches (section 12) |
| Main checkout switched to a pre-v2 branch | not detectable by the hooks (they would be v1); CLAUDE.md rule + section 12 order |
| PIPELINE task leaves main's hooks broken mid-edit | fail closed; kill switch (section 13) |
| Stop allowed forever by a dev server | subagent + running only; E2 |
| Log grows or leaks | rotation; whitelist; B13a, B13b, B14 |
| run.sh pulls real worktrees, local settings or a real grant into the test repo | copytree filter + post-copy check + info/exclude; F1 (seeded copy) and the real-repo run |
| Python 3.10 syntax on macOS 3.9 | local run.sh on 3.9.6; CI on 3.12; py_compile in CI |
| 3 AM: hooks disabled and nobody notices | not detectable by hooks; L1 is part of re-enabling |

## 5. What is NOT built

- No sandbox for shell writes; bash-code-guard stays a string heuristic (D-6).
- No authenticated votes (see 2.10).
- No per-session pinned checkout; `cd` between registered worktrees switches the state (residual, ADR-0005).
- No `git worktree add` write-verb rule, no common-dir re-check, no log `fstat` check (D-6 residuals).
- No role-aware write gating; `plans/*` stays writable by anyone.
- No grant expiry or automatic consumption.
- No `abort` command; Stepan removes a parked file by hand.
- No cross-checkout `status`.
- No automatic parked-state preservation on `git worktree remove`.
- `tests/pipeline/` is not added to `pipeline_core_files` (D-4 lists the core); suggested follow-up.
- No Windows support work (existing `cygpath` lines stay; new code is POSIX: `fcntl`, `O_NOFOLLOW`).
- No change to the verdict grammar or the judge round rules.

## 6. Key decisions (each with because)

1. Threat model D-6 decides what is built: a mechanism stays if it prevents a plausible accident or is a few
   lines, because the pipeline is a guardrail and review catches deliberate subversion.
2. Code from `CODE_ROOT` (script location, builtins only), with worktree copies forwarding to main: D-1, and
   it also covers sessions started inside a worktree.
3. State resolution via the worktree registry with the nested filter: the registry tells an accidental `cd`
   from a real checkout; it is not a trust anchor against deliberate action, so main's own zones are checked
   as absolute paths first.
4. Write gate by the file's real path: absolute main zones, then the owning checkout: a write's effect lands
   where the file really is, and no checkout layout re-labels main's core.
5. Gates fail closed (crash, resolver failure, missing python3), observers fail quiet, logging never decides:
   a crash must not open a gate, and must not trap a judge.
6. `\x1f`-separated context line: empty fields survive `read`, which TAB does not.
7. flock on a v2-only lock file + atomic replace + CAS, every op inside one transaction: serial writes, whole
   reads, no interference with v1.
8. PreToolUse(SubagentHandback) primary, SubagentStop fallback, spawn map tertiary: the only path verified to
   fire with the full report.
9. Init parks instead of deleting or refusing on a foreign/branch-differing state: scope C, no data loss;
   except an own LEARN state, which needs Stepan's grant (D-7).
10. Grant file in main, read under the lock, written only by Stepan: D-7, and one place to look.
11. PIPELINE main-only: under D-1 only main's hooks are live (accepted, D-7).
12. Parked keys `<issue>-<epoch>`: no collision, no silent overwrite.
13. New ADR-0005: trust-boundary decisions and accepted residuals deserve their own record.

Deploy awareness: new files live in `.claude/hooks/` and `.claude/hooks/lib/`; they take effect only in the
**main checkout's working tree** (D-1), so "deployed" means "on the branch checked out in the main checkout";
worktree copies only matter for their forwarding prologue and for the hook wiring in their `settings.json`.
`lib/*.py` run as `python3 -I` and import siblings via `sys.path.append(HERE)`; no new dependencies (stdlib,
git >= 2.36 for `worktree list -z`, bash 3.2); CI's shellcheck and py_compile cover them; `.gitignore` covers
runtime files and the grant.

---

## 7. Ordered coder steps

Each step ends green: `shellcheck -S error .claude/hooks/*.sh .claude/hooks/lib/*.sh tests/pipeline/run.sh`,
`python3 -m py_compile .claude/hooks/lib/*.py`, `bash tests/pipeline/run.sh`. A test is added in the step that
creates the code it guards, and only uses features that exist by then.

1. **F:** run.sh copytree filter (incl. the grant file), post-copy check printing the F1 line, info/exclude,
   `HOME`/`TMPDIR`, `reset_state`, worktree helper with a space in the path; `.gitignore` (all four entries of
   2.12). Test F1.
2. **Resolver, common.sh, log, fail-closed:** `lib/checkout.py` (nested filter, `\x1f` line), `lib/common.sh`
   (builtins prologue, forwarding, probe, resolver check, rc mapping, `python3 -I`); every hook script gets
   the three-line header; hookio/cfg from `CODE_ROOT`; pipeline-advance resolves from `pwd` and refuses as a
   worktree copy; ci.yml py_compile and lib shellcheck. Tests B2, B4-B8b, B12, B13a, B14-B17, B18b, B19a,
   B20, B21, B22, S6-S9. (B18a waits for step 6: before `gitdir_at_init` exists, the legacy branch rule makes
   a state on a detached HEAD foreign, so Stop would be allowed and B18a red on correct code.)
3. **Write gate + watchdog:** realpath, always-blocked zones (git incl. `.git` component, transcripts, user
   settings, grant basename), main's absolute zones before `checkout_of`, unregistered worktrees, prefix
   `protected_files`, core prefix `.claude/settings`; watchdog marker via hashlib. Tests B3, B9, B10, B10b,
   B11, B19b, S1, S3, S4, S5, S5b, S11.
4. **State transactions:** `lib/state.py`, `.flock`, CAS advance, every op in one transaction,
   `record_spawn` phase check, TTL from activity, `finish` in phase-complete. Tests A8-A10, C8, D15.
5. **A:** `judge-handback.sh`, settings entry and timeouts, dedupe, judge-vote diagnostics, spawn map,
   isolation block. Tests A1-A7, A11-A14, B1, B13b.
6. **C:** `gitdir_at_init`, init table (without grant rows), `state_is_own` with legacy branch fallback.
   Tests B18a, C1-C9.
7. **D + PIPELINE + grant:** pause/resume/parked, keys, status stderr lines, PIPELINE tier (main-only), grant
   file reading and its init/park rows, core rules in require-pipeline and bash-code-guard (incl. cwd == main,
   grant and user-settings shell strings). Tests C10, D1-D14, S2, S10, G1-G8.
8. **E:** `background_tasks` in phase-complete. Tests E1-E4.
9. **G + docs:** architect.md, CLAUDE.md (incl. migration, grant, threat model lines), state_machine.md,
   labels/templates, ADR-0005 (with the residual list), ADR-0004 link.

The coder never runs `pause`/`resume` on the real state, never touches `settings.local.json`, and never
creates `.claude/settings.pipeline-grant.json` in the real repo.

---

## 8-11. Tester acceptance (execution model: one fresh zsh per Bash call)

Rules applied: helpers live in a file at a fixed path and are invoked by path; no shell state carries
between calls; every mutation happens in a **copy** of the tree under the scratch path, never in the repo;
the real repo is proven unchanged with checksums.

### 11.0 Create the helper

Use the Write tool, not a heredoc (its text contains the state file name, which bash-code-guard blocks once
hooks are on). Path `/tmp/academy-21-tester/t.sh`. **Write only the lines between the two fence lines below,
not the ``` fences themselves** (a leading ```` ```bash ```` line would be a syntax error).

```bash
#!/bin/bash
# t.sh snap | verify | mut <name> <mutation.py>
set -uo pipefail
REPO=/Users/stepankorshukov/Documents/Projects/academy
SCRATCH="${T21_SCRATCH:-/tmp/academy-21-tester}"
: "${SCRATCH:?}"
mkdir -p "$SCRATCH"
SNAP_PATHS=(.claude/hooks .claude/agents .claude/pipeline.json .claude/settings.json .claude/settings.local.json .claude/settings.pipeline-grant.json .claude/pipeline_state.json .claude/pipeline_state.parked tests/pipeline .gitignore)
case "${1:-}" in
  snap)   (cd "$REPO" && for p in "${SNAP_PATHS[@]}"; do if [ -e "$p" ]; then find "$p" -type f ! -path '*/__pycache__/*' -print0; fi; done | sort -z | xargs -0 shasum -a 256) > "$SCRATCH/snap.sha" && wc -l < "$SCRATCH/snap.sha" ;;
  verify) (cd "$REPO" && shasum -a 256 -c --quiet "$SCRATCH/snap.sha") && echo "REAL REPO UNCHANGED" ;;
  mut)
    NAME="${2:?name}"; MUT="${3:?mutation py file}"
    D="$SCRATCH/mut/$NAME"; rm -rf "$D" && mkdir -p "$D" || exit 1
    python3 - "$REPO" "$D" <<'PY' || { echo "COPY FAILED: $NAME"; exit 1; }
import json, os, pathlib, shutil, subprocess, sys
src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
# Whitelist copy: only tracked inputs of the hooks and the suite.
for rel in (".claude/hooks", ".claude/agents", "tests"):
    shutil.copytree(src / rel, dst / rel, ignore=shutil.ignore_patterns("__pycache__"))
for rel in (".claude/pipeline.json", ".claude/settings.json", ".gitignore"):
    shutil.copy(src / rel, dst / rel)
# Seed, in the source tree run.sh copies from, every condition its copy filter must remove (F1).
c = dst / ".claude"
wt = c / "worktrees" / "x"
wt.mkdir(parents=True)
subprocess.run(["git", "init", "-q", str(wt)], check=True)
(wt / "untracked").write_text("dirty nested checkout\n")
(c / "settings.local.json").write_text(json.dumps({"disableAllHooks": True}) + "\n")
(c / "settings.pipeline-grant.json").write_text(json.dumps({"version": 1, "pipeline_init": [9]}) + "\n")
(c / "pipeline_state.json").write_text(json.dumps({"tier": "PROJECT", "phase": "coder", "issue": 9, "phase_history": []}) + "\n")
(c / "pipeline_state.flock").write_text("")
(c / "pipeline_state.parked").mkdir()
(c / "pipeline_state.parked" / "9-1.json").write_text("{}\n")
PY
    python3 "$MUT" "$D" || { echo "MUTATION NOT APPLIED: $NAME"; exit 3; }
    bash "$D/tests/pipeline/run.sh" > "$D/run.log" 2>&1; echo "rc=$? (log: $D/run.log)"; grep -E "^  FAIL|failed" "$D/run.log" ;;
  *) echo "usage: t.sh snap|verify|mut" >&2; exit 64 ;;
esac
```

Executed by the architect for revision 3 in a fresh zsh with `T21_SCRATCH` pointing at a scratch dir: `snap`
skips absent paths (the grant file and parked dir do not exist yet) instead of failing under `pipefail`;
`mut base` with a no-op mutation ran **today's** run.sh in the seeded copy and failed with the research-F
failures (so the seeds reproduce the condition F1 guards); `verify` printed `REAL REPO UNCHANGED`. The seeded
copy contains the `pipeline_state` file name, which is fine: it is written by Python inside the helper, not
typed into a Bash command. Revision 3.1 changed only the two failure branches of `mut` (copy failed, mutation
not applied): the early-exit shape was run in a scratch copy of the helper under bash 3.2.57, a mutation
whose snippet is absent printed `MUTATION NOT APPLIED: a` with exit 3 and never reached the suite, an
applying one continued; `bash -n` passed.

Mutation file template (Write tool, one per row, e.g. `/tmp/academy-21-tester/m_A6.py`):
```python
import sys, pathlib
p = pathlib.Path(sys.argv[1], ".claude/hooks/lib/state.py")   # file under mutation
s = p.read_text(); new = s.replace("<exact snippet>", "<broken snippet>", 1)
assert new != s, "mutation did not apply"
p.write_text(new)
```
Mutations that edit `tests/pipeline/run.sh` (F1) or `.claude/settings.json` (B1) work the same way; the
copy's `run.sh` is the one that runs. Rows with a combined mutation (B19b) edit both snippets in one file.

### 11.1 Commands (each is one Bash call)

1. `bash /tmp/academy-21-tester/t.sh snap` → prints a file count.
2. `cd /Users/stepankorshukov/Documents/Projects/academy && shellcheck -S error .claude/hooks/*.sh .claude/hooks/lib/*.sh tests/pipeline/run.sh && python3 -m py_compile .claude/hooks/lib/*.py && echo LINT_OK`
3. `cd /Users/stepankorshukov/Documents/Projects/academy && ls .claude/worktrees && bash tests/pipeline/run.sh; echo rc=$?`
   → real worktrees listed (the F condition is present), `0 failed`, rc=0, every name of 2.13 printed `ok`.
4. `bash /tmp/academy-21-tester/t.sh mut base /tmp/academy-21-tester/m_noop.py` (m_noop.py = `import sys`)
   → rc=0, `0 failed`: the seeded copy is green on v2, so every later red run is caused by its mutation.
5. `cd /Users/stepankorshukov/Documents/Projects/academy && bash tests/pipeline/run.sh | grep -cE '^  ok '`
   → equals 70 + the number of 2.13 rows + the extra asserts of multi-assert rows (D2: +5, S4: +1, G4: +1,
   G8: +1); the tester states the arithmetic with the row count he counted.
6. Mutation runs: for **each row of 2.13**, write `m_<id>.py` implementing that row's mutation, then
   `bash /tmp/academy-21-tester/t.sh mut <id> /tmp/academy-21-tester/m_<id>.py`
   → rc=1 and the output contains `FAIL <that row's test name>`. A green run is a defect. Output
   `MUTATION NOT APPLIED: <id>` (exit 3, the suite did not run) is not a result: fix the snippet in
   `m_<id>.py` and rerun. Also run B19b's
   filter-only mutation once and record it green (expected, 2.13).
7. `bash /tmp/academy-21-tester/t.sh verify` → `REAL REPO UNCHANGED`.
8. `cd /Users/stepankorshukov/Documents/Projects/academy && { git diff -z --name-only main...HEAD; git diff -z --name-only HEAD; git ls-files -z --others --exclude-standard; } | sort -zu | while IFS= read -r -d '' f; do case "$f" in docs/adr/0004*) continue ;; esac; [ -f "$f" ] && perl -CSD -ne 'if (/\p{Cyrillic}/) { print "$ARGV\n"; exit }' "$f"; done; echo "cyrillic check done"`
   → no file listed before `cyrillic check done` (ADR-0004 is pre-existing Russian; NUL-separated, so paths
   with spaces stay whole; BSD grep has no `-P`, hence perl).
9. `cd /Users/stepankorshukov/Documents/Projects/academy && bash .claude/hooks/pipeline-advance.sh status; bash .claude/hooks/pipeline-advance.sh parked`
   → read-only; the live #1 state is untouched (v2 shows it as foreign on stderr, because the main checkout
   is on fix/21 while `branch_at_init` is feat/1: that is the C9 rule working on real data).

The tester reports each command with its real output; "should work" is not evidence.

---

## 12. Rollout and migration (every step names its branch and precondition)

Hooks stay disabled (`settings.local.json`, Stepan's file) until step R3. "Main checkout" =
`/Users/stepankorshukov/Documents/Projects/academy`. #21 itself runs as PROJECT with hooks off, so it needs
no grant.

**R1. v2 committed and in the main checkout's working tree.** Commit phase of #21 done on
`fix/21-pipeline-v2`, checked out in the main checkout. Precondition check (one Bash call):
`cd /Users/stepankorshukov/Documents/Projects/academy && test "$(git symbolic-ref --short HEAD)" = fix/21-pipeline-v2 && git log -1 --format=%B | grep -qE '#21\b' && test -f .claude/hooks/lib/state.py && test -f .claude/hooks/lib/checkout.py && grep -q edits_pipeline_core .claude/pipeline.json && test -z "$(git status --porcelain)" && echo R1_OK`.
`%B` because the convention (and a58679d, checked) puts `Refs #21` in the body. Not `R1_OK` → stop; nothing
below runs.

**R2. Park live #1 and protect v1 branches** (main checkout, hooks still off, on fix/21 with v2):
1. Orchestrator: `bash .claude/hooks/pipeline-advance.sh pause` → parks the legacy #1 state (foreign here:
   branch differs; PROJECT, so no grant) as `.claude/pipeline_state.parked/1-<epoch>.json`; `parked` lists it;
   `status` prints `No active pipeline.`; `git status --porcelain` stays empty (v2 `.gitignore`).
2. Stepan (a git-dir write, which v2 never lets agents do):
   `cd /Users/stepankorshukov/Documents/Projects/academy && for p in '.claude/pipeline_state*' '.claude/settings.pipeline-grant.json'; do grep -qxF "$p" .git/info/exclude || printf '%s\n' "$p" >> .git/info/exclude; done; git check-ignore -q .claude/pipeline_state.parked && git check-ignore -q .claude/pipeline_state.flock && git check-ignore -q .claude/settings.pipeline-grant.json && echo R2_EXCLUDE_OK`
   (one path per `check-ignore`, because with several paths `-q` succeeds when **any** is ignored).
   Because `info/exclude` is shared by every checkout and branch: if R3 fails and the main checkout goes back
   to a v1 branch, v1's `.gitignore` would otherwise show the parked dir and the flock as untracked, and v1's
   Stop and PR dirty-tree gates would block.

**R3. Live checks** (Stepan removes `disableAllHooks` from `settings.local.json` by hand; precondition: the R1
check prints `R1_OK` again, because the live checks must run against v2 in the main working tree).
- **L1 gates are on** (session started in the main checkout): Write `apps/x.txt` with no pipeline → BLOCKED;
  `tail -n 3 .git/pipeline-hooks.log` shows `hook=require-pipeline`, `decision=block`, `source=cwd`,
  `checkout=<main>`, `forwarded=false`. Then `bash .claude/hooks/pipeline-advance.sh init PIPELINE 999` →
  refused with the grant message, `status` still `No active pipeline.` (D-7 live; no grant file exists).
- **L2 worktree state** (worktree created from the L1 session:
  `git worktree add ".claude/worktrees/live 21" -b chore/998-live-wt HEAD`, HEAD = the v2 commit; the space
  exercises path handling live). Stepan then starts a **second session whose primary directory is the
  worktree**, so its hook input `cwd` and its subagents' `cwd` are the worktree, the way real worktree
  sessions run. In that session:
  `bash "$(git rev-parse --path-format=absolute --git-common-dir)/../.claude/hooks/pipeline-advance.sh" init HOTFIX 998`,
  then `coder`. A Write to `apps/live-21.txt` inside the worktree is allowed; a Write to
  `<main>/apps/live-21.txt` is blocked; `cd <main> && bash .claude/hooks/pipeline-advance.sh status` prints
  `No active pipeline.`; the log shows `checkout=<worktree>` and `forwarded=true` (the worktree's hook copies
  forwarded to main's). Also, from the worktree, `bash .claude/hooks/pipeline-advance.sh status` (the
  worktree's own copy) refuses with "run the main checkout's copy".
- **L3 real judge vote** (same worktree session): advance `tester`, `judge_code`; spawn the three dev judges
  in one message on a trivial diff. Expected: `status` lists three votes with `path: handback` and distinct
  `agent_id`s; the log has three `vote-recorded` (handback), three `vote-dup` (subagent_stop), `role_source`
  and `transcript_kind` (settles research A's open `transcript_path` question; record in ADR-0005); a Stop
  during the judges' run logs `stop-allow:subagents-running`; the PostToolUse(Agent) line shows whether
  `agentId` exists (spawn map). If the votes log `checkout=<main>` instead, subagents do not inherit the
  session's cwd: that is a finding for #21, not a pass.
- **L4 fake checkout.** Agents cannot run the original form: the shell guard blocks any write verb aimed at
  a `.git` path, so the fake `.git` file cannot be created from a session (#23). Either variant settles it:
  - automated: the suite row `fake .git-file directory uses the main checkout's state`
    (`tests/pipeline/run.sh`) builds the same directory in a temp repo and asserts main's state governs;
  - by hand, Stepan in his own terminal, from the main checkout:
    `mkdir "/tmp/fake co" && printf 'gitdir: %s\n' "$PWD/.git" > "/tmp/fake co/.git"`, then
    `printf '{"hook_event_name":"PreToolUse","tool_name":"Write","cwd":"/tmp/fake co","tool_input":{"file_path":"/tmp/fake co/x"}}' | bash .claude/hooks/require-pipeline.sh`,
    then `tail -n 3 .git/pipeline-hooks.log`: the `resolve-fallback` line shows `"source": "fallback:unregistered"`
    and `"checkout"` the main checkout. Clean up with `rm -r "/tmp/fake co"`.
- **L5 cleanup** (L1 session, after closing the worktree session):
  `rm "<main>/.claude/worktrees/live 21/apps/live-21.txt"`; `git -C "<main>/.claude/worktrees/live 21" status --porcelain`
  prints nothing; `git worktree remove "<main>/.claude/worktrees/live 21"`. The ignored 998 state, flock and
  parked dir are removed with it on purpose (a test pipeline). If remove still refuses, show
  `git -C "<wt>" status --porcelain --ignored`, and only when it lists nothing but those runtime files use
  `git worktree remove --force`. Stepan deletes `chore/998-live-wt`.
Any L-check fails → section 13.

**R4. Merge.** PR with CI green; Stepan squash-merges #21. Main checkout:
`git switch main && git pull --ff-only`. Precondition for every later step:
`git merge-base --is-ancestor <squash commit> HEAD` in the checkout used.

**R5. Resume #1 on feat/1-web-bootstrap** (feat/1 is pre-v2: based on 5c4d853, carries 5ad27f4 + 4cda2ba).
Under D-1, checking feat/1 out in the main checkout as it is would make the **whole session** run v1 hooks,
where `resume` does not exist. So the branch is moved onto main first, and only then checked out. Stepan runs
(author's git operation):
1. Precondition: `git log --format=%h 5c4d853..feat/1-web-bootstrap` prints exactly `4cda2ba` and `5ad27f4`;
   `git diff --name-only 5ad27f4 4cda2ba` lists only `plans/1-web-bootstrap-*.md`; feat/1 is not on origin.
2. `git rebase --onto main 5ad27f4 feat/1-web-bootstrap`. Plain `git rebase main` (or `git merge main`) is
   not used: after a **squash** merge, 5ad27f4's patch no longer matches a single commit on main, so it
   would be replayed onto v2's `hookio.py` and `run.sh` and likely conflict; its content is already in main
   (same patch-id as a58679d). The `--onto` form drops it and replays only the plans commit.
3. Postcondition: `git merge-base --is-ancestor main feat/1-web-bootstrap` and
   `git diff --name-only main feat/1-web-bootstrap` lists only `plans/1-*`.
4. In the main checkout (now on rebased feat/1, v2 hooks): `bash .claude/hooks/pipeline-advance.sh resume 1`
   → branch matches `branch_at_init`, `gitdir_at_init` added (legacy), `status` shows PROJECT #1 at
   `judge_design` (PROJECT: no grant). The #1 design round then restarts its judges (no votes were ever
   recorded).

**R6. #15 worktree** (`content/15-module-introduction` at 5c4d853, no own commits, untracked
`plans/15-module-introduction-research.md`, no state). Before its pipeline continues, and before any session
is started in it again (a pre-v2 copy has no forwarding and would run v1 hooks):
1. Precondition: `git -C <wt> status --porcelain` shows only that untracked file;
   `git cat-file -e main:plans/15-module-introduction-research.md` fails (not in main).
2. `git -C <wt> merge --ff-only main` (fast-forward; the untracked file is untouched). Its hook copies now
   forward to main's and its `settings.json` wires `judge-handback`.
3. Its orchestrator initialises `MODULE 15` with cwd in the worktree via main's pipeline-advance (canonical
   invocation, 2.5). The worktree's state now resolves correctly and its tree has v2's `.gitignore`.

CLAUDE.md carries R5 and R6 as one-time migration notes, plus the general rule of 2.15.

## 13. Rollback

- **Kill switch:** Stepan writes `{"disableAllHooks": true}` into `.claude/settings.local.json` **by hand**
  (agents cannot: it is core, D-5) and starts a new session. This is also the escape from a lockout (e.g.
  `python3` broken, a broken hook edit in PIPELINE).
- **Revert** (Stepan, kill switch on; `<sq>` = the squash commit of #21):
  ```
  git switch main && git pull --ff-only
  git diff --quiet <sq> main -- .gitignore || echo "STOP: .gitignore changed after <sq>; merge by hand"
  git switch -c revert/21-pipeline-v2
  git revert --no-commit <sq>
  git checkout <sq> -- .gitignore
  git commit -m "fix(pipeline): revert pipeline v2, keep its ignore rules" -m "Refs #21"
  ```
  then PR, CI green, Stepan merges. The `.gitignore` of `<sq>` is kept (`.claude/pipeline_state*`,
  `.claude/worktrees/`, `settings.local.json`, the grant file), because v1 ignores only the two exact state
  names and would otherwise see the parked dir and the `.flock` as untracked and fail its Stop and PR
  dirty-tree gates. The `.git/info/exclude` lines of R2 stay as well (harmless).
- **Leftovers under v1:**
  - `.claude/pipeline_state.parked/`: inert for v1 (v1 has no `resume`). To continue a parked task under v1,
    Stepan copies its file to `.claude/pipeline_state.json` by hand (v1 ignores the extra fields
    `gitdir_at_init`, `parked_*`; `phase_history`/`artifacts` keep the v1 shape).
  - `.claude/pipeline_state.flock`: never deleted, but v1 never opens it (v1 uses `.json.lock`), so no wait.
  - `.claude/settings.pipeline-grant.json`: inert for v1; Stepan deletes it if wanted.
  - `.git/pipeline-hooks.log*`: harmless; delete by hand if wanted.
  - Worktrees that merged v2 keep v2 files in their tree; their hook copies forward to main's v1 scripts only
    if those exist under the same names, which they do; harmless.
- **Partial failure during R3:** kill switch, reopen #21 with the failing log line as evidence; no revert is
  needed because v2 is not on main yet; `resume` of #1 waits. The main checkout may go back to any v1 branch:
  R2's `info/exclude` lines keep the parked dir, flock and grant file out of its dirty-tree gates.

## 14. Changelog

### 14.1 Revision 2 against the round 1 findings

| Finding | Change / decision |
|---|---|
| Sec 1: fake `.git`-file dirs and old-commit worktrees pass a common-dir check | D-1 replaced: no dispatcher, no delegation (`dispatch.sh` removed); state resolved only among registered worktrees (2.1); `LIB`/`cfg` from `CODE_ROOT` (2.2). Tests B5, B6, B7 |
| Sec 2: settings.local.json not core | core prefix `.claude/settings` for tool and shell (2.6, 2.7, 2.12). S1, S2 |
| Sec: write paths via realpath | 2.6 step 1. S3 |
| Sec: block `~/.claude/projects/**` (transcript forgery) | 2.6 zone for transcripts and `<session_id>/` subagent dirs; `memory/` deliberately writable (declining a blanket block because auto memory writes there). S4 |
| Sec: `.git/` paths resolving to no checkout | 2.6 git-dir zone (always blocked), plus shell strings `core.hooksPath`, `.git/hooks`. S5 |
| Sec: log opened with O_NOFOLLOW in the TMPDIR fallback | O_NOFOLLOW + fstat owner/regular check on both locations (2.3). B15 (fstat later removed in rev 3, D-6) |
| Sec: unexpected rc (crash/timeout) maps to block | rc mapping in `run_hook`, subprocess timeouts; harness-kill residual documented (2.2). S6 |
| Sec: ADR-0005 states vote authentication | 2.10 "Vote authenticity", ADR-0005 |
| Arch 1 / Ops 1: #1 migration on pre-v2 feat/1; #15 worktree | Section 12 R5 (`rebase --onto main 5ad27f4`) and R6 (`merge --ff-only main`); CLAUDE.md carries both (2.15) |
| Arch 2: every test row needs a concrete mutation | 2.13 table: one mutation per row; 11.1 step 6 runs every row |
| Arch 3: init with missing `branch_at_init` ref parks | 2.8 row `branch-missing`; C3 rewritten |
| Arch minor: park-key collision | keys `<issue>-<epoch>` with suffix; resume by issue refuses when ambiguous (2.4, 2.9). D3 |
| Arch minor: legacy states without gitdir_at_init | branch fallback in `state_is_own` (2.8). C9 |
| Arch minor: resume after repo move | pause accepts foreign states; resume rebases `gitdir_at_init` (2.9). D13, D14 |
| Arch minor: state removal in phase-complete via state.py under lock | `state.py finish` (2.11). D15 |
| Arch minor: B13 before judge-handback exists | split B13a (step 2) / B13b (step 5) |
| Arch minor: `IFS=$'\t'` for tab-separated reads | 2.1, 2.2 (replaced by `\x1f` in rev 3: TAB collapses empty fields). B17 |
| Ops 2: live checks after v2 is committed and in the main working tree | R1 precondition check, repeated at R3 |
| Ops 3: rollback section | section 13 |
| Ops 4: F1 mutation could not go red | tester helper copies a whitelist and seeds the F conditions (11.0) |
| Ops 5: paths with spaces | test worktrees `wt one`, live worktree `live 21`; L4 uses a spaced fake dir |
| Ops 6: python3 missing/broken | probe in common.sh, gates block with message, observers exit 0 (2.2, 2.3). S7, S8, B16 |
| Ops notes | single context call per hook; Python `hashlib`; PIPE_BUF reasoning corrected; fence note in 11.0 |
| Removed with old D-1 | `dispatch.sh`, `PIPELINE_CHECKOUT` env and its bash guard, per-checkout script fallback, `observer_hooks` key, `cfg.py --checkout` |

### 14.2 Revision 3 against the round 2 findings and decisions 6 and 7

Classification in the second column follows section 0: **kept** = prevents mistakes; **residual** =
deliberate bypass only, recorded in ADR-0005 item 7.

| Finding | Class | Change / decision |
|---|---|---|
| Sec 1: worktree registered inside main (e.g. `.claude/hooks/lib/json`) takes ownership of core by longest prefix | kept | resolver accepts only linked worktrees outside `main_root` or under `<main>/.claude/worktrees/`, others logged `worktree-skipped:nested` (2.1); main's git, state and core zones evaluated as absolute paths before `checkout_of` (2.6 step 3). B19a, B19b |
| Sec 1: nested worktree shadows stdlib modules | kept | all Python as `python3 -I`, lib dir **appended** to `sys.path` (2.2, 2.11); justified also by an accidental `lib/json.py`. B20 |
| Sec 1: `git worktree add` as a write verb | residual | declined: deliberate-only, and the nested filter makes such a worktree inert (2.7, section 3) |
| Sec 2: pause as an unauthenticated tier switch (and `init PIPELINE`) | kept | D-7 grant file (2.9a): format, Stepan-only writer (tool zone, shell string, core prefix), read under the lock; `init PIPELINE` row (2.8); `park` of an own LEARN state needs `learn_pause`, covering pause, init park rows and resume (2.4, 2.8, 2.9). G1-G8, L1 |
| Sec 3: `~/.claude/settings*.json` user-level kill switch | kept | always-blocked zone for tools (2.6) and shell (2.7). S11 |
| Sec note: resolver crash / empty `STATE_ROOT` must block | kept | common.sh step 5 checks `CTX_RC`, absolute existing state root, non-empty status; gates exit 2 `pipeline resolver failed` (2.2). S9 |
| Sec note: shell core rule should require cwd checkout == main | kept | `STATE_ROOT == MAIN_ROOT` added (2.7). S10 |
| Sec note: LEARN shell relative-path claim | residual | 2.7 reworded: absolute roots only; relative `cd` is a residual (section 0, ADR-0005) |
| Sec note: block any `.git` path component | kept | git zone = common dir **or** any `.git` component (2.6), shell rule the same (2.7). S5b |
| Sec note: sessions started inside a worktree run its hooks | kept | v2+ worktree copies forward (`exec`) to main's same-named script using builtins only; main copy missing → gates block (2.2); CLAUDE.md notes that hook wiring comes from the session's settings.json (2.15). B21, L2 |
| Arch: A9 mutation misses (advance/vote never call set_artifact) | - | A9 rewritten: concurrent `advance` and `spawn` record (an artifact write) with the test delay; mutation runs `advance` outside `transaction()`; assertion on the final phase (2.13). 2.4 states every op runs in one transaction; `record_spawn` refuses outside its judge phase |
| Arch: C1 must assert `parked_reason == "foreign"` | - | C1 setup keeps `branch_at_init` = current branch and asserts the reason; the mutated run refuses instead (2.13) |
| Arch: S8 cannot pass (dirname/realpath are external) | - | three-line header with `${0%/*}`, common.sh `CODE_ROOT=$(cd -P "${BASH_SOURCE[0]%/*}/../../.." && pwd -P)`, stdin read with `read -d ''`, all before the probe (2.2); S8 uses an empty `PATH` and asserts the exact text `python3 not found or unusable`; verified with `env -i PATH=/nonexistent` (fact list) |
| Arch: S5 in step 3 needs PIPELINE from step 7 | - | S5 (and S5b, S11) use a PROJECT state; the git zone applies in every tier, so the row is unchanged in meaning (2.13). Step 7 is the first to use PIPELINE (C10, D9, D12, S10, G-rows) |
| Arch minor: F1 abort line | - | run.sh prints exactly `  FAIL copy excludes worktrees, local settings, grant file and runtime state` and `1 failed`, exit 1 (2.13) |
| Arch minor: 2.6 step 4 wording | - | now step 5, reworded: a path under `.claude/worktrees/` owned by main lies in a directory that is not an accepted worktree |
| Arch minor: resume of own stale state | - | 2.9 resume step 1 = own state active **within TTL**; step 2 = own stale or foreign parks first (stale own LEARN needs its grant) |
| Arch minor: R4 `git pull --ff-only` | - | R4 and the revert recipe use `--ff-only` |
| Arch minor: tester awk breaks on spaced paths | - | 11.1 step 8 uses `-z` lists, `sort -zu`, `read -d ''` (run once against this branch: prints only `cyrillic check done`) |
| Found while re-tracing rows (rule of the round 2 lesson) | - | B10's mutation "`checkout_of` always returns main" stayed green (step 5 blocks the path anyway); replaced by "remove `protected_files`" |
| Ops 1: `IFS=$'\t' read` collapses empty fields | kept | context line uses `\x1f` (2.1, 2.2), verified on bash 3.2.57 (fact list); paths with `\x1f` dropped by the resolver. B18 (empty `tool_name` on Stop, detached HEAD mid-pipeline) |
| Ops 2: R1 checks `%s` for `#21` | - | `git log -1 --format=%B \| grep -qE '#21\b'`, run against a58679d (matches) and `Refs #210` (does not) |
| Ops minor: L5 product file left in the worktree | - | L5 removes `apps/live-21.txt` first, checks `status --porcelain`, `--force` only after inspecting `--ignored` |
| Ops minor: partial failure at R3, state hooks off on v1 branches | - | R2 step 2: Stepan adds `.claude/pipeline_state*` and the grant file to `.git/info/exclude` (shared by all checkouts), checked with `git check-ignore` |
| Ops minor: revert as exact commands | - | section 13 gives the command sequence with a `.gitignore` drift check |
| Ops minor: F1 seed mechanism wording | - | 2.13 F1 and 11.0 say the seeds are created in the **source** `.claude` that run.sh copies from; the grant file is a sixth seed |
| Ops minor: settings.local.json in the repo `.gitignore` | kept | added to `.gitignore` (2.12); today only the global ignore covers it (fact list) |
| Ops minor: run L2/L3 from a session whose primary directory is the worktree | - | accepted: L2/L3 run in a second session started in the worktree; consistent with D-1 because its hook copies forward to main (`forwarded=true` checked); L3 treats `checkout=<main>` on votes as a finding |
| D-6 shrink (no finding) | residual | removed revision 2's common-dir re-check in `resolve_cwd` and the log `fstat` owner/regular check; B15 mutation now drops `O_NOFOLLOW` only |
| D-6 (decision) | - | section 0 "Threat model" with a kept/residual table for every security item; ADR-0005 item 1 and item 7 (residual list) |
| D-7 (decision) | - | PIPELINE main-only now accepted (2.8); grant file designed (2.9a), tested (G1-G8), checked live (L1), ignored by git and excluded from the test copy |

### 14.3 Revision 3.1 against the round 3 findings (B18) and the minor items

Round 3: security PASS; architecture and operations FAIL, both on B18 only. Targeted amendment approved by
Stepan: only the rows below changed.

| Finding | Change / decision |
|---|---|
| Arch + Ops: B18's TAB mutation cannot turn it red (step 5's "empty `STATE_STATUS` → resolver failed" also gives rc 2) | B18 split. B18a asserts the message: rc 2, `Pipeline not complete. Current phase: coder`, and no `resolver failed`. B18b is a case whose correct result is ALLOW (no state, detached HEAD, Stop without `tool_name`): rc 0 with `\x1f`, rc 2 under the TAB mutation (2.13). Mechanism corrected in both rows and reproduced on bash 3.2.57 (`[/r][cwd][/g][/m][none][][]`). Section 4 now says the real TAB hazard is spurious fail-closed blocking |
| Arch: B18 scheduled in step 2 but needs `gitdir_at_init` from step 6 | B18a moved to step 6 (its state carries `gitdir_at_init`, which only step 6's `state_is_own` reads, so it stays own when detached); B18b stays in step 2 (no state, no ownership question). Every step stays green on correct code (section 7) |
| Grant validation accepts JSON booleans | integer checks use `type(x) is int` for `version` and list members; a non-list value is invalid too (2.9a) |
| `state_status=unreadable` unspecified | 2.8 defines it once: no own active state, logged `state-unreadable`; writes and core fail closed (2.6 step 4, 2.7, where the LEARN heuristic also applies), gated spawns block (2.11 phase-gate), Stop allows with a warning (2.11; blocking would only loop), state.py ops refuse (2.4); section 4 row |
| Relative `gitdir:` lines (git 2.48+) | resolved relative to the worktree root in `worktrees()` (2.1) and in common.sh forwarding (2.2 step 2), reproduced on git 2.54; new row B22 (step 2); section 4 notes it would otherwise fail closed |
| ADR-0005 item 7: relative `cd` | item 7 says a relative `cd` evades the core, grant-file and user-settings shell strings too, with an example (2.15) |
| park: how "own LEARN" is decided | `park <reason> <code_root> <gitdir> <branch>`, `state_is_own` against the caller's context fields (2.4) |
| resume parks before validating | resume reordered: own-active, ambiguity/no match and branch checks first; parking a stale or foreign slot state only after them; a refusal moves nothing (2.9) |
| how pipeline-advance skips common.sh steps 2 and 5 | `HOOK_KIND=cli`: step 2 skipped, step 4 skipped (stdin may be a terminal), step 5 runs `context` on empty input with a CLI error (exit 1), CLI exit codes pass through `run_hook` (2.2) |
| A9 does not name the state.py ops | A9 calls `state.py advance` and `state.py record_spawn` directly; the mutation names the `advance` op (2.13) |
| PIPELINE resume-needs-no-grant rationale | reworded: a parked PIPELINE state exists only through a granted init and resumes only for the same issue, branch and main checkout; residual (state parked before the grant was removed) named, and CLAUDE.md tells Stepan to delete such a parked file with the grant entry (2.9, 2.15) |
| Exact grant commands for Stepan | create/change via `printf ... >` (noted: overwrites the whole file), check via `python3 -I -m json.tool`, remove via rerun or `rm` (2.9a); CLAUDE.md carries them (2.15) |
| Tester helper continues after a mutation that did not apply | `mut` prints `MUTATION NOT APPLIED: <id>` and exits 3 before the suite; copy failure prints `COPY FAILED`; 11.1 step 6 says how to treat it; the early-exit shape was run in a scratch copy (11.0) |
| Latency text omits the python3 probe | 2.1 states the probe's cost (about 24-31 ms, a hook about 95-100 ms in total). Folding the version check into checkout.py declined: S7/S8 need the probe's own message before stdin is read, and a broken interpreter would otherwise report as a resolver failure |
