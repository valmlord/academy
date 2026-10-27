#!/bin/bash
# PreToolUse (Bash): block writing code to a remote host via SSH outside the deploy phase,
# and protect the pipeline state file. Inert for projects that never SSH.

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)

if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

CMD=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)

# Protect the pipeline state file - only phase-complete.sh may remove it.
FIRST_WORD=$(echo "$CMD" | awk '{print $1}')
if [ "$FIRST_WORD" = "rm" ] && echo "$CMD" | grep -q "pipeline_state"; then
  echo "BLOCKED: Cannot delete pipeline_state.json. Complete the pipeline properly." >&2
  exit 2
fi

# Only SSH commands are candidates for the remote-code-writing guard.
if ! echo "$CMD" | grep -q "ssh "; then
  exit 0
fi

# Extract the remote command (after the hostname).
REMOTE_CMD=$(echo "$CMD" | sed "s/.*@[^ ]* '//;s/'.*//")
if [ -z "$REMOTE_CMD" ]; then
  REMOTE_CMD=$(echo "$CMD" | sed 's/.*@[^ ]* "//' | sed 's/".*//')
fi

# Allow read-only / inspection commands.
if echo "$REMOTE_CMD" | grep -qE '^(systemctl|journalctl|ps |top |df |free |ss |cat |grep |tail |head |ls |uptime|kill |pgrep|curl |sleep |docker )'; then
  exit 0
fi

# Allow once the pipeline is in test_deploy phase or later.
STATE_FILE="$CLAUDE_PROJECT_DIR/.claude/pipeline_state.json"
if [ -f "$STATE_FILE" ]; then
  WIN_PATH=$(cygpath -w "$STATE_FILE" 2>/dev/null || echo "$STATE_FILE")
  PHASE=$(python3 -c "import json; print(json.load(open(r'$WIN_PATH'))['phase'])" 2>/dev/null)
  case "$PHASE" in
    tester|release|judge_code|compound|commit|pr|notify|done) exit 0 ;;
  esac
fi

# Block code-writing patterns over SSH before the deploy phase.
if echo "$REMOTE_CMD" | grep -qE 'sed -i|python3? -c.*open|tee |cat >|cat >>|>[[:space:]]*/|>>[[:space:]]*/'; then
  echo "BLOCKED: Writing code over SSH detected. Use the Edit/Write tool or the Coder agent, then deploy in test_deploy. (ssh ... $REMOTE_CMD)" >&2
  exit 2
fi

exit 0
