#!/bin/bash
# Self-test for the pipeline hooks. Runs in a throwaway git repo (path WITH a space, on purpose)
# with a copy of .claude/. Usage: bash tests/pipeline/run.sh   (also runs in CI)
set -uo pipefail
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
BASE=$(mktemp -d)
WORK="$BASE/work dir"
mkdir -p "$WORK"
trap 'rm -rf "$BASE"' EXIT
cp -r "$SRC/.claude" "$WORK/.claude"
cp "$SRC/.gitignore" "$WORK/.gitignore"
rm -f "$WORK/.claude/pipeline_state.json"
cd "$WORK" || exit 1
git init -q -b main . && git config user.email t@t && git config user.name t
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
json() { python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(json.dumps(d))" "$1"; }
agent() { # agent <prompt> [subagent_type] -> phase-gate rc
  python3 -c "import json,sys; print(json.dumps({'tool_name':'Agent','tool_input':{'prompt':sys.argv[1],'subagent_type':sys.argv[2]}}))" "$1" "${2:-}" \
    | bash "$H/phase-gate.sh"; }
write_to() { # write_to <rel path> -> require-pipeline rc
  python3 -c "import json,sys; print(json.dumps({'tool_name':'Write','tool_input':{'file_path':sys.argv[1]}}))" "$WORK/$1" \
    | bash "$H/require-pipeline.sh"; }
bashcmd() { python3 -c "import json,sys; print(json.dumps({'tool_name':'Bash','tool_input':{'command':sys.argv[1]}}))" "$1" | bash "$H/bash-code-guard.sh"; }
stop() { python3 -c "import json,sys; print(json.dumps({'hook_event_name':'Stop','stop_hook_active':sys.argv[1]=='1'}))" "${1:-0}" | bash "$H/phase-complete.sh"; }
subagent_stop() { # subagent_stop <spawn prompt> <final message> [use_transcript_only]
  local t="$WORK/agent_$RANDOM.jsonl"
  python3 -c "import json,sys; print(json.dumps({'type':'user','message':{'content':sys.argv[1]}})); print(json.dumps({'type':'assistant','message':{'content':[{'type':'text','text':sys.argv[2]}]}}))" "$1" "$2" > "$t"
  python3 -c "import json,sys; d={'hook_event_name':'SubagentStop','agent_transcript_path':sys.argv[1]}; d.update({} if sys.argv[3]=='1' else {'last_assistant_message':sys.argv[2]}); print(json.dumps(d))" "$t" "$2" "${3:-0}" \
    | bash "$H/judge-vote.sh" >/dev/null 2>&1
  rm -f "$t"; }
post_agent() { # synchronous PostToolUse path
  python3 -c "import json,sys; print(json.dumps({'tool_name':'Agent','tool_input':{'prompt':sys.argv[1]},'tool_response':{'content':[{'type':'text','text':sys.argv[2]}]}}))" "$1" "$2" \
    | bash "$H/judge-count.sh" >/dev/null 2>&1; }
votes() { "${ADV[@]}" status | python3 -c "import json,sys; d=json.load(sys.stdin); print(' '.join('%s:%s'%(v['agent'],v['verdict']) for v in d.get('artifacts',{}).get('judge_votes',[])))"; }
JS="Read .claude/agents/dev/judge-security.md first. Then review the design."
JA="Read .claude/agents/dev/judge-architecture.md first. Do not duplicate judge-security.md findings."
JO="Read .claude/agents/dev/judge-operations.md first. Then review."
CODER="Read .claude/agents/dev/coder.md first. Then implement the plan."

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
for p in "$JS" "$JA" "$JO"; do subagent_stop "$p" "VERDICT: PASS"; done
adv_ok   "compound skip" compound skip "nothing new"
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

echo
echo "pipeline self-test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
