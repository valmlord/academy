#!/bin/bash
# Self-test for the pipeline hooks. Runs in a throwaway git repo (path WITH a space, on purpose)
# with a copy of .claude/. Usage: bash tests/pipeline/run.sh   (also runs in CI)
set -uo pipefail
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
# Physical path: the hooks report realpaths (macOS /var is a symlink to /private/var).
BASE=$(cd "$(mktemp -d)" && pwd -P)
WORK="$BASE/work dir"
mkdir -p "$WORK" "$BASE/home" "$BASE/tmp"
trap 'rm -rf "$BASE"' EXIT
# Copy .claude without the real repo's runtime files: a real worktree drags in node_modules and a
# .git file that reaches into the real gitdir, local settings may disable hooks, a real grant would
# authorize test inits, and a live state would leak into the first test group.
python3 -I - "$SRC/.claude" "$WORK/.claude" <<'PY'
import shutil, sys
src = sys.argv[1]
RUNTIME_NAMES = ("worktrees", "settings.local.json", "settings.pipeline-grant.json")

def runtime_only(directory, names):
    if directory != src:
        return []
    return [n for n in names if n in RUNTIME_NAMES or n.startswith("pipeline_state")]

shutil.copytree(src, sys.argv[2], ignore=runtime_only)
PY
for leaked in worktrees settings.local.json settings.pipeline-grant.json pipeline_state.json pipeline_state.flock pipeline_state.parked; do
  if [ -e "$WORK/.claude/$leaked" ]; then
    echo "  FAIL copy excludes worktrees, local settings, grant file and runtime state"
    echo "1 failed"
    exit 1
  fi
done
cp "$SRC/.gitignore" "$WORK/.gitignore"
# Tests write user-level files (transcripts, settings) and temp markers; keep them out of the real home.
export HOME="$BASE/home" TMPDIR="$BASE/tmp"
cd "$WORK" || exit 1
git init -q -b main . && git config user.email t@t && git config user.name t
echo '.claude/worktrees/' >> .git/info/exclude
echo x > README.md && git add -A && git commit -qm "init"
export CLAUDE_PROJECT_DIR="$WORK"
H="$WORK/.claude/hooks"
ADV=(bash "$H/pipeline-advance.sh")
PASS=0; FAIL=0
ok()  { echo "  ok   $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL $1"; FAIL=$((FAIL+1)); }
# expect_rc <desc> <expected-rc> <cmd...>
expect_rc() { local d="$1" want="$2"; shift 2; "$@" >/dev/null 2>&1; local rc=$?; if [ "$rc" = "$want" ]; then ok "$d"; else bad "$d (rc=$rc, want $want)"; fi; }
adv_ok()   { expect_rc "$1" 0 "${ADV[@]}" "${@:2}"; }
adv_fail() { expect_rc "$1" 1 "${ADV[@]}" "${@:2}"; }
vote() { JUDGE_HOOK_CALLER=judge-count-hook "${ADV[@]}" "$1" "$2" "$3" >/dev/null 2>&1; }
# Every hook input carries cwd, as in production. HCWD is the default; `at <dir> <helper> ...`
# runs one helper with another cwd (bash locals are visible to the functions a function calls).
HCWD="$WORK"
at() { local HCWD="$1"; shift; "$@"; }
agent() { # agent <prompt> [subagent_type] -> phase-gate rc
  python3 -c "import json,sys; print(json.dumps({'tool_name':'Agent','cwd':sys.argv[3],'tool_input':{'prompt':sys.argv[1],'subagent_type':sys.argv[2]}}))" "$1" "${2:-}" "$HCWD" \
    | bash "$H/phase-gate.sh"; }
write_json() { # write_json <absolute path> -> hook input of a Write
  python3 -c "import json,sys; print(json.dumps({'tool_name':'Write','cwd':sys.argv[2],'tool_input':{'file_path':sys.argv[1]}}))" "$1" "$HCWD"; }
write_abs() { write_json "$1" | bash "$H/require-pipeline.sh"; }
write_to() { write_abs "$WORK/$1"; } # write_to <rel path> -> require-pipeline rc
bash_json() { python3 -c "import json,sys; print(json.dumps({'tool_name':'Bash','cwd':sys.argv[2],'tool_input':{'command':sys.argv[1]}}))" "$1" "$HCWD"; }
bashcmd() { bash_json "$1" | bash "$H/bash-code-guard.sh"; }
stop_json() { python3 -c "import json,sys; print(json.dumps({'hook_event_name':'Stop','cwd':sys.argv[2],'stop_hook_active':sys.argv[1]=='1'}))" "${1:-0}" "$HCWD"; }
stop() { stop_json "${1:-0}" | bash "$H/phase-complete.sh"; }
subagent_stop() { # subagent_stop <spawn prompt> <final message> [use_transcript_only]
  local t="$WORK/agent_$RANDOM.jsonl"
  python3 -c "import json,sys; print(json.dumps({'type':'user','message':{'content':sys.argv[1]}})); print(json.dumps({'type':'assistant','message':{'content':[{'type':'text','text':sys.argv[2]}]}}))" "$1" "$2" > "$t"
  python3 -c "import json,sys; d={'hook_event_name':'SubagentStop','cwd':sys.argv[4],'agent_transcript_path':sys.argv[1]}; d.update({} if sys.argv[3]=='1' else {'last_assistant_message':sys.argv[2]}); print(json.dumps(d))" "$t" "$2" "${3:-0}" "$HCWD" \
    | bash "$H/judge-vote.sh" >/dev/null 2>&1
  rm -f "$t"; }
subagent_handback() { # subagent_handback <spawn prompt> <report>: report sent via SubagentHandback, not text
  local t="$WORK/agent_$RANDOM.jsonl"
  python3 -c "import json,sys; print(json.dumps({'type':'user','message':{'content':sys.argv[1]}})); print(json.dumps({'type':'assistant','message':{'content':[{'type':'tool_use','name':'SubagentHandback','input':{'message':sys.argv[2]}}]}}))" "$1" "$2" > "$t"
  python3 -c "import json,sys; print(json.dumps({'hook_event_name':'SubagentStop','cwd':sys.argv[2],'agent_transcript_path':sys.argv[1],'last_assistant_message':'Report delivered.'}))" "$t" "$HCWD" \
    | bash "$H/judge-vote.sh" >/dev/null 2>&1
  rm -f "$t"; }
post_agent() { # synchronous PostToolUse path
  python3 -c "import json,sys; print(json.dumps({'tool_name':'Agent','cwd':sys.argv[3],'tool_input':{'prompt':sys.argv[1]},'tool_response':{'content':[{'type':'text','text':sys.argv[2]}]}}))" "$1" "$2" "$HCWD" \
    | bash "$H/judge-count.sh" >/dev/null 2>&1; }
# capture <cmd...>: run it, keep its exit code in RC and its stderr in ERR.
capture() { ERR=$("$@" 2>&1 >/dev/null); RC=$?; }
LOG="$WORK/.git/pipeline-hooks.log"
log_last() { # log_last <field>: that field of the newest hook log line
  tail -n 1 "$LOG" 2>/dev/null | python3 -c "import json,sys; v=json.loads(sys.stdin.read() or '{}').get(sys.argv[1], ''); print(v)" "$1"; }
ctx_field() { # ctx_field <cwd> <index>: one field of `checkout.py context` for that cwd
  python3 -c "import json,sys; print(json.dumps({'cwd':sys.argv[1]}))" "$1" \
    | python3 -I "$H/lib/checkout.py" context | python3 -c "import sys; print(sys.stdin.read().rstrip('\n').split('\x1f')[int(sys.argv[1])])" "$2"; }
put_state() { # put_state <checkout root> <tier> <phase> [issue]: a state as init would write it, active now
  python3 - "$@" <<'PY'
import json, os, subprocess, sys, time
root, tier, phase = sys.argv[1:4]
issue = int(sys.argv[4]) if len(sys.argv) > 4 else 77
dotgit = os.path.join(root, ".git")
if os.path.isdir(dotgit):
    gitdir = os.path.realpath(dotgit)
else:
    line = open(dotgit).readline().strip()[len("gitdir: "):]
    gitdir = os.path.realpath(os.path.join(root, line))
branch = subprocess.run(["git", "-C", root, "rev-parse", "--abbrev-ref", "HEAD"], stdout=subprocess.PIPE,
                        stderr=subprocess.DEVNULL, universal_newlines=True).stdout.strip()
now = time.time()
state = {"tier": tier, "phase": phase, "issue": issue, "branch_at_init": branch, "gitdir_at_init": gitdir,
         "session_ts": now, "phase_history": [{"phase": phase, "ts": now, "ts_str": time.strftime("%Y-%m-%dT%H:%M:%S")}],
         "artifacts": {}}
os.makedirs(os.path.join(root, ".claude"), exist_ok=True)
with open(os.path.join(root, ".claude", "pipeline_state.json"), "w") as fh:
    json.dump(state, fh, indent=2)
PY
}
votes() { "${ADV[@]}" status | python3 -c "import json,sys; d=json.load(sys.stdin); print(' '.join('%s:%s'%(v['agent'],v['verdict']) for v in d.get('artifacts',{}).get('judge_votes',[])))"; }
JS="Read .claude/agents/dev/judge-security.md first. Then review the design."
JA="Read .claude/agents/dev/judge-architecture.md first. Do not duplicate judge-security.md findings."
JO="Read .claude/agents/dev/judge-operations.md first. Then review."
CODER="Read .claude/agents/dev/coder.md first. Then implement the plan."

WT="$WORK/.claude/worktrees/wt one"
# reset_state: remove every runtime file a test group may leave behind, in WORK and in each test
# worktree, and drop extra worktrees, so one red test does not cascade into the next group.
reset_state() {
  local root
  for root in "$WORK" "$WT"; do
    rm -rf "$root/.claude/pipeline_state.json" "$root/.claude/pipeline_state.flock" \
      "$root/.claude/pipeline_state.parked" "$root/.claude/settings.pipeline-grant.json"
  done
  git -C "$WORK" worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r w; do
    case "$w" in "$WORK"|"$WT") ;; *) git -C "$WORK" worktree remove --force "$w" >/dev/null 2>&1 ;; esac
  done
  git -C "$WORK" worktree prune
}
# make_wt: the linked test worktree, created from HEAD (which carries the copied .claude).
make_wt() {
  [ -d "$WT" ] || git -C "$WORK" worktree add -q -b feat/77-wt "$WT" HEAD >/dev/null 2>&1
}

ok "copy excludes worktrees, local settings, grant file and runtime state"

echo "== no pipeline"
expect_rc "edit blocked without a pipeline" 2 write_to "apps/web/page.tsx"
expect_rc "feedback file editable without a pipeline" 0 write_to ".claude/feedback/coder_mistakes.md"
expect_rc "pipeline.json NOT editable without a pipeline" 2 write_to ".claude/pipeline.json"
expect_rc "hooks NOT editable without a pipeline" 2 write_to ".claude/hooks/phase-gate.sh"
expect_rc "coder spawn blocked without a pipeline" 2 agent "$CODER"
expect_rc "plain Explore agent allowed" 0 agent "Find where lessons are loaded"
expect_rc "stop allowed without a pipeline" 0 stop

echo "== init"
adv_fail "TASK without issue is rejected" init TASK
adv_fail "unknown tier is rejected" init FOO 1
adv_ok   "TASK with issue starts (path with a space)" init TASK 12
adv_fail "second init while active is rejected" init TASK 13
expect_rc "state file never writable by tools" 2 write_to ".claude/pipeline_state.json"
expect_rc "bash cannot touch the state file" 2 bashcmd "python3 -c \"open('.claude/pipeline_state.json','w')\""
expect_rc "bash cannot forge a judge vote" 2 bashcmd "JUDGE_HOOK_CALLER=judge-count-hook bash .claude/hooks/pipeline-advance.sh judge_design security PASS"
expect_rc "edit allowed in active pipeline" 0 write_to "apps/web/page.tsx"
expect_rc "stop blocked mid-pipeline" 2 stop 0
expect_rc "stop not blocked twice (stop_hook_active)" 0 stop 1

echo "== ordering"
adv_fail "cannot skip researcher" architect
adv_ok   "researcher" researcher
expect_rc "coder blocked before coder phase" 2 agent "$CODER"
expect_rc "coder blocked via subagent_type too" 2 agent "implement" coder
expect_rc "researcher prompt mentioning tester.md is not misread" 0 agent "Read .claude/agents/dev/researcher.md first. Note the tester (.claude/agents/dev/tester.md) runs later."
adv_ok   "architect" architect
expect_rc "judge blocked outside judge phase" 2 agent "$JS"
adv_ok   "judge_design" judge_design

echo "== judges"
adv_fail "inline vote rejected" judge_design security PASS
expect_rc "content judge not allowed in TASK" 2 agent "Read .claude/agents/content/judge-pedagogy.md first."
expect_rc "dev judge allowed in judge phase" 0 agent "$JS"
subagent_stop "$JS" "Checked X.
FAIL: 1 issue found"
subagent_stop "$JA" "Checked Y.
PASS: no architecture issues found"
[ "$(votes)" = "security:FAIL architecture:PASS" ] && ok "vote attributed to the leading role file, not a mention" || bad "attribution: $(votes)"
subagent_stop "Read .claude/agents/dev/coder.md first. Fix the finding from judge-security.md" "pass-through params now escaped"
[ "$(votes)" = "security:FAIL architecture:PASS" ] && ok "coder report 'pass-through' is not a vote" || bad "pass-through counted: $(votes)"
subagent_stop "$JO" "Checked compose.
pass-through of env vars looks fine"
[ "$(votes)" = "security:FAIL architecture:PASS" ] && ok "judge prose 'pass-through' without a verdict line is not a vote" || bad "prose counted: $(votes)"
subagent_stop "$JO" "PASS - no operational issues" 1
[ "$(votes)" = "security:FAIL architecture:PASS operations:PASS" ] && ok "verdict read from transcript when last_assistant_message is absent" || bad "transcript fallback: $(votes)"
adv_fail "cannot leave judge_design with a FAIL" planner
post_agent "$JS" "Re-checked.
**PASS**"
adv_ok   "PostToolUse fallback records PASS; unanimous lets us leave" planner
adv_ok   "coder" coder
expect_rc "coder allowed in coder phase" 0 agent "$CODER"
adv_ok   "tester" tester
adv_ok   "judge_code" judge_code
expect_rc "coder allowed in judge_code (fix after FAIL)" 0 agent "$CODER"
adv_fail "earlier-round PASS does not count in new round" compound
for p in "$JS" "$JA"; do subagent_stop "$p" "VERDICT: PASS"; done
subagent_handback "$JO" "Checked compose.
PASS"
adv_ok   "verdict read from a SubagentHandback report; compound skip" compound skip "nothing new"
expect_rc "coder blocked after its window" 2 agent "$CODER"
adv_ok   "commit" commit

echo "== PR gate"
adv_fail "pr blocked on main" pr skip "no remote"
git checkout -qb feat/12-demo
echo y >> README.md
adv_fail "pr blocked with dirty tree" pr skip "no remote"
git add -A && git commit -qm "feat: demo"
adv_fail "pr blocked when commit lacks issue ref" pr skip "no remote"
git commit -q --amend -m "feat: demo

Refs #12"
adv_fail "pr requires url or skip" pr
adv_ok   "pr skip with reason" pr skip "no remote yet"
expect_rc "stop blocked before notify/done" 2 stop 0
adv_ok   "notify" notify
adv_ok   "done" done
expect_rc "stop passes when complete" 0 stop 0
[ ! -f .claude/pipeline_state.json ] && ok "state cleaned up" || bad "state cleaned up"

echo "== LEARN tier"
git checkout -q main
adv_ok "LEARN starts" init LEARN 5
for p in researcher architect judge_design; do "${ADV[@]}" "$p" >/dev/null 2>&1; done
for p in "$JS" "$JA" "$JO"; do subagent_stop "$p" "PASS"; done
"${ADV[@]}" planner >/dev/null 2>&1; "${ADV[@]}" learner >/dev/null 2>&1
expect_rc "coder never allowed in LEARN" 2 agent "$CODER"
expect_rc "coder never allowed in LEARN (subagent_type)" 2 agent "go" coder
expect_rc "mentor allowed in LEARN" 0 agent "Read .claude/agents/dev/mentor.md first."
expect_rc "orchestrator cannot edit product code" 2 write_to "services/workspace/src/index.ts"
expect_rc "tests are writable (tester)" 0 write_to "services/workspace/test/runtime.test.ts"
expect_rc "docs writable" 0 write_to "docs/adr/0002-workspace-runtime.md"
expect_rc "shell write into product code blocked" 2 bashcmd "cat > services/workspace/src/index.ts <<EOF"
expect_rc "sed -i on product code blocked" 2 bashcmd "sed -i 's/a/b/' apps/web/src/x.ts"
expect_rc "running tests allowed" 0 bashcmd "pnpm --filter @academy/workspace test"
expect_rc "stop allowed while waiting for the learner" 0 stop 0
rm -f .claude/pipeline_state.json

echo "== content tier"
adv_ok "MODULE starts" init MODULE 20
"${ADV[@]}" researcher >/dev/null 2>&1
expect_rc "coder not part of MODULE" 2 agent "$CODER"
expect_rc "lesson-author blocked before author phase" 2 agent "Read .claude/agents/content/lesson-author.md first."
for p in architect judge_design; do "${ADV[@]}" "$p" >/dev/null 2>&1; done
for j in accuracy pedagogy assessment; do subagent_stop "Read .claude/agents/content/judge-$j.md first. Review the module design." "PASS"; done
subagent_stop "$JS" "FAIL: off-tier"
adv_ok "off-tier judge vote ignored, content trio enough" planner
"${ADV[@]}" author >/dev/null 2>&1
expect_rc "lesson-author allowed in author phase" 0 agent "Read .claude/agents/content/lesson-author.md first."
expect_rc "course files writable" 0 write_to "course/ai-for-developers/00-introduction/module.yaml"
rm -f .claude/pipeline_state.json

echo "== resolver, forwarding and fail-closed"
reset_state
git checkout -q main
make_wt

put_state "$WT" PROJECT coder
if at "$WT" agent "$CODER" >/dev/null 2>&1 && ! agent "$CODER" >/dev/null 2>&1; then
  ok "cwd in a linked worktree selects that worktree's state"
else bad "cwd in a linked worktree selects that worktree's state"; fi
B17_NAME="worktree path with spaces resolves"
at "$WT" bashcmd "cat x_pipeline_state" >/dev/null 2>&1
if [ "$(log_last checkout)" = "$WT" ] && [ "$(ctx_field "$WT" 0)" = "$WT" ]; then ok "$B17_NAME"; else bad "$B17_NAME ($(log_last checkout))"; fi
reset_state

put_state "$WORK" PROJECT coder
expect_rc "cwd outside git uses the main checkout's state" 0 at "$BASE/tmp" agent "$CODER"
reset_state

FOREIGN="$BASE/foreign repo"
git init -q "$FOREIGN" && put_state "$FOREIGN" PROJECT coder
expect_rc "cwd in a foreign git repo uses the main checkout's state" 2 at "$FOREIGN" agent "$CODER"
FAKE="$BASE/fake co"
mkdir -p "$FAKE" && printf 'gitdir: %s\n' "$WORK/.git" > "$FAKE/.git" && put_state "$FAKE" PROJECT coder
expect_rc "fake .git-file directory uses the main checkout's state" 2 at "$FAKE" agent "$CODER"

put_state "$WORK" PROJECT coder
python3 - "$WT/.claude" <<'PY'
import json, os, sys
c = sys.argv[1]
conf = json.load(open(os.path.join(c, "pipeline.json")))
conf["pipeline_core_files"] = []
conf["protected_files"] = []
json.dump(conf, open(os.path.join(c, "pipeline.json"), "w"))
lib = os.path.join(c, "hooks", "lib")
for name in os.listdir(lib):
    if name.endswith(".py"):
        open(os.path.join(lib, name), "w").write("raise SystemExit(0)\n")
PY
expect_rc "a registered worktree's own hook files never decide" 2 at "$WT" write_to ".claude/hooks/x.sh"
git -C "$WT" checkout -q -- .claude
reset_state

put_state "$WT" TASK coder 78
put_state "$WORK" PROJECT coder 9
if (cd "$WT" && "${ADV[@]}" status 2>/dev/null) | python3 -c "import json,sys; sys.exit(0 if json.load(sys.stdin).get('issue') == 78 else 1)"; then
  ok "pipeline-advance status follows pwd into a worktree"
else bad "pipeline-advance status follows pwd into a worktree"; fi
capture eval 'cd "$WT" && bash "$WT/.claude/hooks/pipeline-advance.sh" status'
if [ "$RC" = 1 ] && printf '%s' "$ERR" | grep -q "run the main checkout's copy"; then
  ok "a linked worktree's own pipeline-advance copy refuses to run"
else bad "a linked worktree's own pipeline-advance copy refuses to run (rc=$RC)"; fi
reset_state

write_to "apps/x.txt" >/dev/null 2>&1
if [ "$(log_last checkout)" = "$WORK" ] && [ "$(log_last source)" = "cwd" ] && [ "$(log_last decision)" = "block" ]; then
  ok "hook log records checkout, source and decision"
else bad "hook log records checkout, source and decision ($(tail -n 1 "$LOG"))"; fi
bashcmd "echo ghp_canary_21 > .claude/pipeline_state.json" >/dev/null 2>&1
if [ "$(log_last hook)" = "bash-code-guard.sh" ] && ! grep -q ghp_canary_21 "$LOG"; then
  ok "hook log never contains a bash command"
else bad "hook log never contains a bash command"; fi

cp "$WORK/.claude/pipeline.json" "$BASE/pipeline.json.saved"
python3 -c "import json,sys; c=json.load(open(sys.argv[1])); c['hook_log_max_bytes']=2000; json.dump(c, open(sys.argv[1],'w'))" "$WORK/.claude/pipeline.json"
rm -f "$LOG" "$LOG.1" "$LOG.2"
for _ in $(seq 60); do python3 -I "$H/lib/checkout.py" log event=rotation-test reason=padding-padding-padding-padding-padding; done
LOG_SIZE=$(wc -c < "$LOG" | tr -d ' ')
if [ "$LOG_SIZE" -le 3000 ] && [ -f "$LOG.1" ] && [ ! -e "$LOG.2" ]; then
  ok "hook log rotates at hook_log_max_bytes"
else bad "hook log rotates at hook_log_max_bytes (size=$LOG_SIZE)"; fi
cp "$BASE/pipeline.json.saved" "$WORK/.claude/pipeline.json"
rm -f "$LOG" "$LOG.1"

printf 'canary\n' > "$BASE/canary"
ln -s "$BASE/canary" "$LOG"
capture write_to "apps/x.txt"
if [ "$RC" = 2 ] && [ "$(cat "$BASE/canary")" = "canary" ] && [ -L "$LOG" ]; then
  ok "hook log symlink is not followed"
else bad "hook log symlink is not followed (rc=$RC)"; fi
rm -f "$LOG"

mkdir "$LOG"
capture write_to "apps/x.txt"; BLOCKED_RC=$RC
capture at "$BASE/tmp" write_to "plans/x.md"
if [ "$BLOCKED_RC" = 2 ] && [ "$RC" = 0 ] && printf '%s' "$ERR" | grep -q "pipeline log write failed"; then
  ok "failed log write does not change the gate result"
else bad "failed log write does not change the gate result (blocked=$BLOCKED_RC allowed=$RC)"; fi
rmdir "$LOG"

git checkout -q --detach
expect_rc "context line keeps empty fields: no state on a detached HEAD allows Stop" 0 stop 0
git checkout -q main

NESTED="$WORK/.claude/hooks/lib/json"
git worktree add -q --detach "$NESTED" HEAD >/dev/null 2>&1
rm -f "$LOG"
if [ "$(ctx_field "$NESTED" 0)" = "$WORK" ] && grep -q '"worktree-skipped:nested"' "$LOG"; then
  ok "worktree registered inside main's tree is not a checkout"
else bad "worktree registered inside main's tree is not a checkout"; fi
git worktree remove --force "$NESTED"

printf 'raise SystemExit(3)\n' > "$H/lib/json.py"
expect_rc "a lib file named like a stdlib module does not shadow it" 0 write_to "plans/x.md"
rm -f "$H/lib/json.py"

put_state "$WORK" PROJECT coder
python3 -c "import json,sys; c=json.load(open(sys.argv[1])); c['pipeline_core_files']=[]; json.dump(c, open(sys.argv[1],'w'))" "$WT/.claude/pipeline.json"
capture eval 'at "$WT" write_json "$WORK/.claude/hooks/x.sh" | CLAUDE_PROJECT_DIR="$WT" bash "$WT/.claude/hooks/require-pipeline.sh"'
if [ "$RC" = 2 ] && [ "$(log_last forwarded)" = "true" ]; then
  ok "a session started in a linked worktree runs main's hooks"
else bad "a session started in a linked worktree runs main's hooks (rc=$RC forwarded=$(log_last forwarded))"; fi
git -C "$WT" checkout -q -- .claude
reset_state

put_state "$WT" PROJECT coder
cp "$WT/.git" "$BASE/wt.git.saved"
python3 - "$WT" <<'PY'
import os, sys
wt = sys.argv[1]
target = open(os.path.join(wt, ".git")).readline().strip()[len("gitdir: "):]
open(os.path.join(wt, ".git"), "w").write("gitdir: %s\n" % os.path.relpath(target, wt))
PY
rm -f "$LOG"
at "$WT" bash_json "cat x_pipeline_state" | bash "$WT/.claude/hooks/bash-code-guard.sh" >/dev/null 2>&1
if [ "$(ctx_field "$WT" 0)" = "$WT" ] && grep -q '"forwarded": "true"' "$LOG"; then
  ok "relative gitdir line in a worktree resolves"
else bad "relative gitdir line in a worktree resolves"; fi
cp "$BASE/wt.git.saved" "$WT/.git"
reset_state

mode_of() { python3 -c "import os,stat,sys; print(oct(stat.S_IMODE(os.stat(sys.argv[1]).st_mode))[2:])" "$1"; }
CFG_MODE=$(mode_of "$WORK/.claude/pipeline.json")
chmod 000 "$WORK/.claude/pipeline.json"
capture write_to "plans/x.md"
chmod "$CFG_MODE" "$WORK/.claude/pipeline.json"
if [ "$RC" = 2 ] && printf '%s' "$ERR" | grep -q "failed internally" && [ "$(mode_of "$WORK/.claude/pipeline.json")" = "$CFG_MODE" ]; then
  ok "gate crash blocks"
else bad "gate crash blocks (rc=$RC)"; fi

mkdir -p "$BASE/badpy" "$BASE/emptybin"
printf '#!/bin/sh\nexit 127\n' > "$BASE/badpy/python3" && chmod +x "$BASE/badpy/python3"
WJ=$(write_json "$WORK/plans/x.md")
ERR=$(printf '%s' "$WJ" | PATH="$BASE/badpy:$PATH" bash "$H/require-pipeline.sh" 2>&1 >/dev/null); RC=$?
printf '%s' "$WJ" | PATH="$BASE/badpy:$PATH" bash "$H/pipeline-watchdog.sh" >/dev/null 2>&1; OBS_RC=$?
if [ "$RC" = 2 ] && printf '%s' "$ERR" | grep -q "python3 not found or unusable" && [ "$OBS_RC" = 0 ]; then
  ok "broken python3 blocks gates with a clear message, observers exit 0"
else bad "broken python3 blocks gates with a clear message, observers exit 0 (rc=$RC obs=$OBS_RC)"; fi
ERR=$(printf '%s' "$WJ" | PATH="$BASE/emptybin" /bin/bash "$H/require-pipeline.sh" 2>&1 >/dev/null); RC=$?
printf '%s' "$WJ" | PATH="$BASE/emptybin" /bin/bash "$H/pipeline-watchdog.sh" >/dev/null 2>&1; OBS_RC=$?
if [ "$RC" = 2 ] && printf '%s' "$ERR" | grep -q "python3 not found or unusable" && [ "$OBS_RC" = 0 ]; then
  ok "missing python3 blocks gates with a clear message, observers exit 0"
else bad "missing python3 blocks gates with a clear message, observers exit 0 (rc=$RC obs=$OBS_RC)"; fi

CK_MODE=$(mode_of "$H/lib/checkout.py")
chmod 000 "$H/lib/checkout.py"
capture write_to "plans/x.md"
printf '%s' "$WJ" | bash "$H/pipeline-watchdog.sh" >/dev/null 2>&1; OBS_RC=$?
chmod "$CK_MODE" "$H/lib/checkout.py"
if [ "$RC" = 2 ] && printf '%s' "$ERR" | grep -q "pipeline resolver failed" && [ "$OBS_RC" = 0 ] && [ "$(mode_of "$H/lib/checkout.py")" = "$CK_MODE" ]; then
  ok "resolver failure blocks gates"
else bad "resolver failure blocks gates (rc=$RC obs=$OBS_RC)"; fi
reset_state

echo
echo "pipeline self-test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
