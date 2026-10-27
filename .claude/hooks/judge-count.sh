#!/bin/bash
# PostToolUse (Agent): record a judge verdict on the SYNCHRONOUS-harness path (the report is
# in tool_response here). On an ASYNCHRONOUS harness the report isn't here yet - SubagentStop
# (judge-vote.sh) is the reliable path; see the UNKNOWN guard below.
# Multi-line python is run from temp files (portable: some environments mangle multi-line
# `python3 -c` arguments; running a file always works).

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)
[ "$TOOL_NAME" != "Agent" ] && exit 0

STATE_FILE="$CLAUDE_PROJECT_DIR/.claude/pipeline_state.json"
[ ! -f "$STATE_FILE" ] && exit 0
WIN_PATH=$(cygpath -w "$STATE_FILE" 2>/dev/null || echo "$STATE_FILE")

PROMPT=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('prompt','')[:500])" 2>/dev/null)
SUBTYPE=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('subagent_type',''))" 2>/dev/null)
# --- Judge type detection (subagent_type first, prompt fallback), judges from pipeline.json ---
AGENT_TYPE=""
for pair in $(python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/lib/cfg.py" all_judges); do
  KEY="${pair%%=*}"; FILE="${pair#*=}"
  if [ "$SUBTYPE" = "${FILE%.md}" ] || echo "$PROMPT" | grep -qi "$FILE"; then
    AGENT_TYPE="$KEY"; break
  fi
done
[ -z "$AGENT_TYPE" ] && exit 0

# --- Verdict extraction (temp-file python; reads the agent output from stdin) ---
VF=$(mktemp "${TMPDIR:-/tmp}/jc_verdict.XXXXXX.py")
cat > "$VF" <<'PYEOF'
import json, sys, re
d = json.load(sys.stdin)
c = d.get('tool_response', {}).get('content', [])
txt = ' '.join(x.get('text', '') for x in c if isinstance(x, dict))
verdict = 'UNKNOWN'
for line in reversed(txt.split('\n')):
    s = line.strip().strip('#').strip().strip('*').strip()
    if re.match(r'^(PASS|pass)\b', s):
        verdict = 'PASS'; break
    if re.match(r'^(FAIL|fail)\b', s):
        verdict = 'FAIL'; break
    m = re.search(r'[Vv]erdict[:\s]+\**(PASS|FAIL)\**', line)
    if m:
        verdict = m.group(1).upper(); break
print(verdict)
PYEOF
OUTPUT=$(echo "$INPUT" | python3 "$VF" 2>/dev/null)
rm -f "$VF"
VERDICT="${OUTPUT:-UNKNOWN}"

# When the harness launches agents ASYNCHRONOUSLY, the tool_response here is only launch
# metadata ({"agentId": ...}), not the agent's report - so no verdict is readable and this
# extracts UNKNOWN. Recording UNKNOWN would poison the unanimous-PASS gate with a vote nobody
# cast. Stay silent; the real verdict is recorded by the SubagentStop hook (judge-vote.sh) on
# completion. (On a synchronous harness the report IS here, so this path still records it.)
[ "$VERDICT" = "UNKNOWN" ] && exit 0

CURRENT_PHASE=$(python3 -c "import json; print(json.load(open(r'$WIN_PATH'))['phase'])" 2>/dev/null)
JUDGE_HOOK_CALLER=judge-count-hook bash "$CLAUDE_PROJECT_DIR/.claude/hooks/pipeline-advance.sh" "$CURRENT_PHASE" "$AGENT_TYPE" "$VERDICT"

exit 0
