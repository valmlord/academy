# #15 L6 research addendum: permissions and hooks (Claude Code 2.1.311, fetched 2026-10-27)

Sources: P = code.claude.com/docs/en/permissions; M = /permission-modes; H = /hooks; HG = /hooks-guide;
T = /tools-reference; SR = /settings-reference; S = /sandboxing. All verified from primary unless
marked. Local copies (scratch): /private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-15-module-introduction-7cf70d/98d817e5-bdb8-4725-9f16-ca66a42a0883/scratchpad/docs/

## 0. Findings that change the starter design
A. `defaultMode: "bypassPermissions"` in project `.claude/settings.json` does nothing. M: "If you set
   `"bypassPermissions"` in those two files [`.claude/settings.json`, `.claude/settings.local.json`], it
   doesn't take effect either, and the session starts in Manual mode." SR: "`auto` and
   `bypassPermissions` don't take effect from project or local settings ... Before v2.1.257,
   `bypassPermissions` took effect from any file." Options: (a) move the flaw to a user-settings snippet
   (`~/.claude/settings.json`) or launch command `claude --dangerously-skip-permissions`; (b) keep it in
   the project file but teach that it is ignored, keep the static check only as hygiene. The evaluator
   must not claim the project file puts the session in bypass mode.
B. Project `permissions.allow` applies only after workspace trust; deny and ask always apply. P:
   "`permissions.allow` rules ... in a project's `.claude/settings.json` grant capability, so Claude
   Code applies them only after you accept the workspace trust dialog ... `deny` and `ask` rules aren't
   affected." In `claude -p`/SDK not used at all. One line in theory; evaluator models "trusted
   interactive session".

## 1. Rule specifier syntax
Bash:
- `Tool` or `Tool(specifier)`. `Bash` == `Bash(*)` (P: "As a deny rule, both forms remove the tool from
  Claude's context.").
- `Bash(x:*)` == `Bash(x *)` (":* suffix ... only recognized at the end of a pattern").
- Trailing ` *` also matches the bare command (`Bash(ls *)` matches `ls`) only when it is the only
  wildcard. Space matters: `Bash(ls*)` matches `lsof`. No `*` = exact match (`Bash(npm run build)`
  doesn't match `npm run build --watch`).
- Compound separators `&&`, `||`, `;`, `|`, `|&`, `&`, newline. Allow must match every subcommand;
  deny/ask fire if any subcommand matches, incl. inside `$()`, subshells, loops.
- Wrappers stripped: `timeout`, `time`, `nice`, `nohup`, `stdbuf`, `command`, `builtin`, `noglob`, bare
  `xargs`. Deny matches past any leading `VAR=`; allow only past known-safe vars.
- P table "What a Bash rule doesn't match": `Bash(git push *)` stops `git push origin main`; doesn't stop
  `git -C . push origin main`, `git -c push.default=current push origin main`, `git 'push' origin main`.
  "Your other rules and the permission mode decide the commands in the last column."
- P wildcard table: `Bash(git * main)` matches "`git -c core.fsmonitor=<script> diff main`"; `-c` "makes
  git run a program you name". Startup warning for an allow rule with `*` before the subcommand.
Built-in read-only set (P): "runs them without a permission prompt in every mode ... `ls`, `cat`, `echo`,
`pwd`, `head`, `tail`, `grep`, `find`, `wc`, `which`, `diff`, `stat`, `du`, `cd`, and read-only forms of
`git`. The set is not configurable; to require a prompt for one of these commands, add an `ask` or `deny`
rule for it." In auto they "can also wait for the classifier's review". Unverified: whether `git -c`/`git
-C` forms count as read-only; exact git subcommand list.
Read/Edit paths (gitignore syntax):
| Pattern | Anchors at |
|---|---|
| `//path` | filesystem root |
| `~/path` | home |
| `/path` | settings source: primary working dir for project/local, `~/.claude/` for user |
| `path` or `./path` | current directory |
- P: "`/Users/alice/file` isn't an absolute path." `*` one segment, `**` across directories.
- Bare filenames at any depth: "`Read(.env)` and `Read(**/.env)` are equivalent", block "any `.env` at
  or under the current directory". `Read(./.env)` = "the `.env` file in the current directory" (inferred
  not to match `config/.env`; single-source wording).
- Single-segment dir patterns: allow `Edit(src/**)` matches only `<cwd>/src`; deny/ask `Read(secrets/**)`
  matches `secrets` "at any depth". "Every other pattern shape matches at the same depth in every rule
  type": `Edit(/src/**)`, `Edit(src/components/**)` anchored; `Edit(**/src/**)` any depth. Hook `if` uses
  allow-style depth.
`!` negation (P): "A deny or ask pattern that starts with `!` is a gitignore negation. It carves the
paths it matches out of the `path` or `./path` rules listed before it." Example `Read(*.env)` then
`Read(!sample.env)`; "A `!` rule listed first carves nothing out." Same source only ("doesn't cancel a
`Read(./.env)` deny from managed settings or any other settings file"); can't reach `/`, `~/`, `//`
rules; can't reopen a file in a directory blocked as a whole (`Read(secrets/**)` + `Read(!secrets/public/**)`
still blocks). Not documented for allow.
Read deny covers Edit/Write (P): "A `Read` deny rule also blocks the Edit and Write tools on the same
path, including creating a new file there. NotebookEdit isn't covered ... For the Write tool, the check
requires Claude Code v2.1.228 or later." T agrees.
Write/MultiEdit never match (P heading): "`Write(path)`, `NotebookEdit(path)`, and `Glob(path)` rules
never match." "If you write a path rule for `Write`, `NotebookEdit`, `Glob`, or legacy `MultiEdit`,
Claude Code accepts the rule but never matches a read or edit against it. Use `Edit(docs/**)` in place
of ..." T maps `Edit(/src/**)` to Edit, Write, NotebookEdit. Bare `Write` matches every Write call.
Scope of file rules: built-in file tools, recognized Bash file commands (`cat`, `head`, `tail`, `sed`,
`tee`) and redirect targets; not `grep -r pattern .` or scripts opening files (use sandbox).
WebFetch: bare `WebFetch`, `WebFetch(domain:example.com)` (exact host), `WebFetch(domain:*.example.com)`
(subdomains, not apex), `WebFetch(domain:*)`. P: "`WebFetch(domain:*)` ... isn't the same as a bare
`WebFetch` rule." Bare deny removes the tool; `domain:*` deny keeps it, refuses each fetch, feeds sandbox
domain list. Bare deny/ask doesn't apply to claude.ai artifact reads; `domain:` does. T: WebFetch prompts
in Manual and acceptEdits "except for domains your permission rules already allow or deny and a built-in
set of preapproved documentation domains"; "An explicit `WebFetch(domain:...)` rule in `deny`, `ask`, or
`allow` takes precedence over the preapproved set." Unverified whether bare `WebFetch` ask overrides
preapproved domains. Recommendation: canonical answer `WebFetch(domain:*)` in ask; bare `WebFetch` ask
acceptable-with-caveat, or accept only `domain:*`.
Primary content field forms `Bash(command:...)`, `Read(file_path:...)`, `WebFetch(url:...)` are ignored
with a startup warning: unsupported.

## 2. Evaluation, modes, fallthrough
- P: "Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines
  the outcome, and rule specificity doesn't change the order." "An allow rule can't carve an exception
  out of a deny rule." Same for ask over allow. Scopes merge; "a user-level deny blocks a project-level
  allow"; managed can't be overridden. Deny blocks in every mode incl. bypass. M: "Allow rules have no
  effect in `bypassPermissions`."
No-match per mode:
| Mode | Outcome |
|---|---|
| `default` (Manual) | Reads run. Bash outside read-only set, edits, WebFetch (non-preapproved) prompt. |
| `acceptEdits` | Edits and `mkdir`/`touch`/`rm`/`rmdir`/`mv`/`cp`/`sed` in working dir auto-approved; other Bash outside read-only set prompts. |
| `plan` | No source edits. Shell commands to classifier if auto available (`useAutoModeDuringPlan` on by default), else non-read-only prompt. |
| `auto` | Rules first; read-only actions and working-dir edits auto-approved; else classifier. Explicit ask rules still prompt. Entering auto drops broad allows (`Bash(*)`, `Bash(python*)`, package-manager run commands, `Agent`). |
| `dontAsk` | Anything that would prompt is denied, incl. ask-rule matches. Allow rules and PreToolUse "allow" still run. |
| `bypassPermissions` | Everything runs except ask rules, critical `rm` paths, M's "Actions no mode auto-approves". Protected-path writes allowed. |
Protected paths: `.git`, `.claude` (with exceptions), `.vscode`, `.husky`, others. Never auto-approved
except bypass; allow rules don't pre-approve them; `.claude/settings.json` and `.claude/hooks/*` edits
prompt in default/acceptEdits, classifier in auto, denied in dontAsk.
Starting mode (M): precedence `--permission-mode` / `--dangerously-skip-permissions` flag, then
`permissions.defaultMode`, then built-in default. Terminal/VS Code built-in default `auto` from v2.1.283.
`claude -p`/SDK: `default`; v2.1.302+: "Calls needing approval are denied unless you approve them with an
allow rule, hook, `canUseTool` callback, or `--permission-prompt-tool`." `default` also if any settings
file sets `disableAutoMode`. Values `default|manual|acceptEdits|plan|auto|dontAsk|bypassPermissions`;
auto/bypass ignored in project/local files.
Evaluator implication: no-match is "mode-dependent". A probe expecting "ask" needs an explicit ask rule;
a probe expecting "allow" for non-read-only actions needs an explicit allow rule.

## 3. Hooks (PreToolUse)
Registration (H, HG):
```json
{"hooks":{"PreToolUse":[{"matcher":"Edit|Write","hooks":[{"type":"command","command":"\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/protect_generated.py","timeout":30}]}]}}
```
Optional: `args` (exec form, no shell), `if` (one permission rule, e.g. `"Edit(src/invoices/generated/**)"`),
`onFailure`, `statusMessage`. `${CLAUDE_PROJECT_DIR}` = project root where session started.
Matcher: `*`, `""` or omitted = all; only letters/digits/`_`/`-`/spaces/`,`/`|` = exact name or list
(`Edit|Write`, `Edit, Write`); else unanchored JS regex (`Edit.*` also matches `NotebookEdit`; use
`^Edit$`). Built-in tool names: `Bash`, `PowerShell`, `Edit`, `Write`, `Read`, `Glob`, `Grep`, `Agent`,
`Workflow`, `WebFetch`, `WebSearch`, `AskUserQuestion`, `ExitPlanMode`.
MultiEdit: not a current tool (absent from T; P "legacy `MultiEdit`"). Matcher containing it harmless,
don't require it. NotebookEdit matcher optional for `.py`.
Timeout default 600 s. H: "On `PreToolUse`, a timed-out ... hook doesn't block the tool call, except for
hooks whose failure blocks the action."
stdin: common `session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir` (v2.1.257+),
`permission_mode` ("default" for Manual), `effort`, `hook_event_name`, optional `agent_id`, `agent_type`.
PreToolUse adds `tool_name`, `tool_input`, `tool_use_id`. Write `tool_input`: `file_path`, `content`.
Edit: `file_path`, `old_string`, `new_string`, `replace_all`. Read: `file_path`, `offset`, `limit`. Bash:
`command`, `description`, `timeout`, `run_in_background`. WebFetch: `url`, `prompt`, `offset`.
Paths: H: "For the file tools `Write`, `Edit`, and `Read`, `tool_input.file_path` is always absolute:
Claude Code expands `~` and relative paths before hooks run." Windows backslashes: "match a path segment
such as `/src/` rather than anchoring with `^`". Unverified whether `..` is collapsed: keep traversal
probe as defensive hardening (normpath/realpath against `$CLAUDE_PROJECT_DIR` or `cwd`), don't claim CC
sends `..`.
Exit codes (H): 0 success, JSON applies; 2 blocking error, on PreToolUse "Blocks the tool call", Claude
gets stderr as tool error (`PreToolUse:Edit hook error: [...]: <stderr>`), blocks even with JSON
"allow"; any other code, crash, missing script, invalid JSON = non-blocking, "The action goes ahead". H:
"Exit code 1 without valid JSON output is a non-blocking error ... If your hook is meant to enforce a
policy, use `exit 2`." Exception: non-0/2 exit with schema-valid JSON on stdout lets JSON decide.
JSON output (exit 0):
```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}
```
Values `allow|deny|ask|defer`; deny reason shown to Claude; multiple hooks precedence deny > defer > ask >
allow; top-level `decision`/`reason` deprecated for PreToolUse.
Fail-open by default: fail-closed needs `"onFailure": "block"` (command/http hooks, v2.1.295+), covers
can't-start, exit not 0/2, HTTP error, timeout, invalid JSON; then failure acts as exit 2.
Precedence with rules: P: "A hook that exits with code 2 stops the tool call before permission rules
are evaluated." Hook "allow" doesn't bypass deny/ask. HG: hook deny "blocks the tool even in
`bypassPermissions` mode". Edge: without managed settings or Team/Enterprise login, an installed mod
(`tool.check`) can approve a call a hook blocked or a deny refused (footnote only).
Hard deny: H "Because the `if` filter is best-effort, use the permission system rather than a hook to
enforce a hard allow or deny" is about the `if` filter; HG "Block edits to protected files" uses exit-2
hooks legitimately. Recommendation: deny `Edit(src/invoices/generated/**)` for enforcement + hook for
"regenerate with make codegen" feedback. `@`-mentioned files bypass PreToolUse; a Read deny covers them.

## 4. Probe outcomes on CC 2.1.311
Assumed correct settings: deny `Read(.env*)` (or `.env` + `.env.*`), `Edit(src/invoices/generated/**)`,
`Bash(git push *)`; ask `WebFetch(domain:*)`; allow `Edit(src/**)`, `Bash(make test)`, `Bash(make lint)`,
`Bash(git status *)`, `Bash(git diff *)`.
| Probe | Outcome |
|---|---|
| `Read(.env)` | deny; bare pattern any depth (`Read(./.env)` cwd only) |
| `Read(.env.staging)` | deny only if pattern covers it (`.env*`/`.env.*`); plain `Read(.env)` doesn't match: good wrong-solution probe |
| `Read(config/.env)` | deny for bare `.env*`; not matched by `./.env` or `/.env` |
| `Read(src/invoices/api.py)` | no rule needed; reads in working dir never prompt in any mode incl. dontAsk; probe "not deny"; `Edit(src/**)` deny doesn't block Read |
| `Edit(src/invoices/api.py)` | with deny `Edit(src/**)`: denied every mode (dead allow). Fix: drop broad deny, allow `Edit(src/**)`, deny `Edit(src/invoices/generated/**)`. Without allow: mode-dependent; require explicit allow |
| `Edit(src/invoices/generated/x.py)` | deny via multi-segment cwd-anchored rule; deny `Write(src/invoices/generated/**)` is a silent no-op (wrong solution); single-segment `Edit(generated/**)` deny matches any depth (acceptable) |
| `Edit(.env)` | denied by Read deny alone (Edit and Write v2.1.228+); evaluator implements "Read deny implies Edit deny" |
| `Bash(make test)` | needs explicit allow `Bash(make test)` or `Bash(make test *)`; exact form doesn't match `make test ARGS=x` |
| `Bash(make db-reset)` | not-allow (no rule, mode-dependent); catches `Bash(make *)` or bare `Bash` allow |
| `Bash(git status)` | read-only builtin; expect "not deny / not ask"; allow harmless |
| `Bash(git push origin main)` | deny via `Bash(git push *)`/`Bash(git push:*)`; also inside `make test && git push origin main` |
| `Bash(git -C . push origin main)` | documented not matched by `Bash(git push *)`; expect "not allow"; `Bash(git *)`/bare `Bash` allow makes it allow (wrong solution caught); deny `Bash(git * push *)` would catch it but no text rule is a boundary; quiz points to remote branch protection, hook, sandbox |
| `WebFetch` | expect explicit ask; no rule: prompt in default/acceptEdits except preapproved docs, classifier in auto, denied in dontAsk, runs in bypass; ask rules force a prompt in auto and bypass too |
Static checks: no `Bash`/`Bash(*)` allow; no `Bash(git *)` allow; flag `Write(...)`, `MultiEdit(...)`,
`NotebookEdit(...)` path rules as no-ops; flag `Bash(command:...)` ignored; `!` patterns implement (same
list, same file, ordered, cwd-relative, not reopening whole-blocked dir) or reject as unsupported.

## Contradictions
None real. Wording trap: H "use the permission system rather than a hook" is about `if`; present as
"deny rule for enforcement, hook for feedback", not "hooks are unreliable".

## Recent changes (stale risk)
v2.1.257 bypass not honored from project/local; v2.1.228 Read deny blocks Write; v2.1.283 auto default;
v2.1.295 `onFailure`; v2.1.302 `-p`/SDK start in default; v2.1.290 `ps` dashed-form check; v2.1.268
symlinked-directory deny and artifact handling. Glob and Grep tools "Absent by default on macOS, Linux,
and WSL" (T): no probes on Glob/Grep.

## Learner note
Gitignore anchoring (`/` = settings source, `//` = filesystem root) counter-intuitive: one worked example.

## Open (unverified)
1. Bare `WebFetch` ask vs preapproved docs domains. 2. Whether CC normalizes `..` in file_path.
3. Exact read-only git forms; `git -C`/`-c` variants. 4. Whether `Read(./.env)` matches `config/.env`.
