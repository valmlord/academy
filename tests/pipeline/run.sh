#!/bin/bash
# Self-test for the pipeline hooks. Runs in a throwaway git repo with a copy of .claude/.
# Usage: bash tests/pipeline/run.sh     (also runs in CI)
set -uo pipefail
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cp -r "$SRC/.claude" "$WORK/.claude"
cp "$SRC/.gitignore" "$WORK/.gitignore"
rm -f "$WORK/.claude/pipeline_state.json"
cd "$WORK"
git init -q -b main . && git config user.email t@t && git config user.name t
echo x > README.md && git add -A && git commit -qm "init"
export CLAUDE_PROJECT_DIR="$WORK"
ADV="bash .claude/hooks/pipeline-advance.sh"
PASS=0; FAIL=0
ok()   { echo "  ok   $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL $1"; FAIL=$((FAIL+1)); }
expect_ok()   { local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi; }
expect_fail() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then bad "$d"; else ok "$d"; fi; }
vote() { JUDGE_HOOK_CALLER=judge-count-hook $ADV "$1" "$2" "$3" >/dev/null 2>&1; }
agent_hook() { # $1 prompt -> exit code of phase-gate
  python3 -c "import json,sys; print(json.dumps({'tool_name':'Agent','tool_input':{'prompt':sys.argv[1]}}))" "$1" \
    | bash .claude/hooks/phase-gate.sh >/dev/null 2>&1; }
edit_hook() { # $1 file path (relative)
  python3 -c "import json,sys; print(json.dumps({'tool_name':'Write','tool_input':{'file_path':sys.argv[1]},'transcript_path':sys.argv[2]}))" "$WORK/$1" "$WORK/transcript.jsonl" \
    | bash .claude/hooks/require-pipeline.sh >/dev/null 2>&1; }

echo "== init"
expect_fail "TASK without issue is rejected" $ADV init TASK
expect_fail "unknown tier is rejected" $ADV init FOO 1
expect_ok   "TASK with issue starts" $ADV init TASK 12
expect_fail "second init while active is rejected" $ADV init TASK 13

echo "== ordering"
expect_fail "cannot skip researcher" $ADV architect
expect_ok   "researcher" $ADV researcher
expect_fail "coder agent blocked before coder phase" agent_hook "Read .claude/agents/dev/coder.md first."
expect_ok   "architect" $ADV architect
expect_ok   "judge_design" $ADV judge_design

echo "== judges"
expect_fail "inline vote rejected" $ADV judge_design security PASS
expect_fail "content judge not allowed in TASK" agent_hook "Read .claude/agents/content/judge-pedagogy.md first."
expect_ok   "dev judge allowed in judge phase" agent_hook "Read .claude/agents/dev/judge-security.md first."
vote judge_design security PASS; vote judge_design architecture FAIL; vote judge_design operations PASS
expect_fail "cannot leave judge_design with a FAIL" $ADV planner
vote judge_design architecture PASS
expect_ok   "unanimous PASS lets us leave" $ADV planner
expect_ok   "coder" $ADV coder
expect_ok   "coder agent allowed now" agent_hook "Read .claude/agents/dev/coder.md first."
expect_ok   "tester" $ADV tester
expect_ok   "judge_code" $ADV judge_code
expect_fail "earlier-round PASS does not count in new round" $ADV compound
vote judge_code security PASS; vote judge_code architecture PASS; vote judge_code operations PASS
expect_ok   "compound skip" $ADV compound skip "nothing new"
expect_ok   "commit" $ADV commit

echo "== PR gate"
expect_fail "pr blocked on main" $ADV pr skip "no remote"
git checkout -qb feat/12-demo
echo y >> README.md
expect_fail "pr blocked with dirty tree" $ADV pr skip "no remote"
git add -A && git commit -qm "feat: demo"
expect_fail "pr blocked when commit lacks issue ref" $ADV pr skip "no remote"
git commit -q --amend -m "feat: demo

Refs #12"
expect_fail "pr requires url or skip" $ADV pr
expect_ok   "pr skip with reason" $ADV pr skip "no remote yet"
expect_ok   "notify" $ADV notify
expect_ok   "done" $ADV done
expect_ok   "stop hook passes" bash -c 'echo "{}" | bash .claude/hooks/phase-complete.sh'
[ ! -f .claude/pipeline_state.json ] && ok "state cleaned up" || bad "state cleaned up"

echo "== LEARN tier"
git checkout -q main
expect_ok   "LEARN starts" $ADV init LEARN 5
for p in researcher architect judge_design; do $ADV $p >/dev/null 2>&1; done
for j in security architecture operations; do vote judge_design $j PASS; done
$ADV planner >/dev/null 2>&1; $ADV learner >/dev/null 2>&1
expect_fail "coder agent never allowed in LEARN" agent_hook "Read .claude/agents/dev/coder.md first."
expect_ok   "mentor allowed in LEARN" agent_hook "Read .claude/agents/dev/mentor.md first."
echo '{"text":"[LEARN #5] pipeline: workspace"}' > transcript.jsonl
expect_fail "orchestrator cannot edit code in LEARN" edit_hook "services/workspace/src/index.ts"
expect_ok   "orchestrator can edit docs in LEARN" edit_hook "docs/adr/0002-workspace.md"
rm -f .claude/pipeline_state.json

echo "== content tier"
expect_ok   "MODULE starts" $ADV init MODULE 20
$ADV researcher >/dev/null 2>&1
expect_fail "coder not part of MODULE" agent_hook "Read .claude/agents/dev/coder.md first."
expect_fail "lesson-author blocked before author phase" agent_hook "Read .claude/agents/content/lesson-author.md first."
for p in architect judge_design; do $ADV $p >/dev/null 2>&1; done
for j in accuracy pedagogy assessment; do vote judge_design $j PASS; done
vote judge_design security PASS
expect_ok   "dev judge vote ignored, content trio enough" $ADV planner
$ADV author >/dev/null 2>&1
expect_ok   "lesson-author allowed in author phase" agent_hook "Read .claude/agents/content/lesson-author.md first."
rm -f .claude/pipeline_state.json

echo "== SubagentStop vote hook"
$ADV init LESSON 30 >/dev/null 2>&1
for p in researcher author student validate judge_content; do $ADV $p >/dev/null 2>&1; done
for j in accuracy pedagogy assessment; do
  printf '{"type":"user","message":{"content":"Read .claude/agents/content/judge-%s.md first. Then review lesson 1.2"}}\n' "$j" > "agent_$j.jsonl"
  python3 -c "import json,sys; print(json.dumps({'hook_event_name':'SubagentStop','last_assistant_message':'Checked X, Y.\\nPASS: no issues','agent_transcript_path':sys.argv[1]}))" "$WORK/agent_$j.jsonl" \
    | bash .claude/hooks/judge-vote.sh >/dev/null 2>&1
done
expect_ok   "votes recorded from SubagentStop, phase can advance" $ADV commit
rm -f .claude/pipeline_state.json agent_*.jsonl

echo "== announcement regex"
rm -f transcript.jsonl
expect_fail "edit blocked without announcement" edit_hook "apps/web/page.tsx"
echo '{"text":"[TASK #7] pipeline: lesson page"}' > transcript.jsonl
expect_ok   "edit allowed after announcement" edit_hook "apps/web/page.tsx"

echo
echo "pipeline self-test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
