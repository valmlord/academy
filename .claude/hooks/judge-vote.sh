#!/bin/bash
# SubagentStop: record a judge's verdict from the agent's FINAL report.
#
# WHY THIS IS THE PRIMARY PATH: judge-count.sh runs on PostToolUse(Agent). When the harness
# launches subagents ASYNCHRONOUSLY, the Agent tool returns launch metadata ({"agentId": ...})
# immediately and the report arrives later - so at PostToolUse time there is no verdict to read
# (it extracts UNKNOWN). SubagentStop fires when the agent actually FINISHES and carries
# `last_assistant_message` (the report) + `agent_transcript_path`, so the verdict is readable
# here reliably on both async and sync harnesses.
#
# JUDGE DETECTION: CLAUDE.md mandates spawning judges by PROMPT ("Read .claude/agents/judge-X.md
# first"), not by subagent_type, so agent_type is usually "general-purpose". The role is read
# from the FIRST user record of the agent's own transcript (the spawn prompt). We deliberately
# do NOT scan the whole transcript - a judge's report legitimately names all three role files,
# which would misattribute the vote.
#
# SCOPE / KNOWN LIMITATION: this fires on EVERY SubagentStop and attributes by the substring
# "judge-<role>.md" (from .claude/pipeline.json judge_agents) in the spawn prompt. Two things keep that safe in practice: (1) pipeline-
# advance.sh only records a vote when the CURRENT phase is judge_design/judge_code (otherwise
# it refuses), and the orchestrator only spawns judges in those phases; (2) the verdict line
# must start with PASS/FAIL. So a stray non-judge subagent cannot cast a vote in normal flow.
# It is NOT hardened against an orchestrator that deliberately spawns a look-alike agent inside
# a judge phase - for that, register judge agent_ids in state at spawn time and verify here.

INPUT=$(cat)

STATE_FILE="$CLAUDE_PROJECT_DIR/.claude/pipeline_state.json"
[ ! -f "$STATE_FILE" ] && exit 0
WIN_PATH=$(cygpath -w "$STATE_FILE" 2>/dev/null || echo "$STATE_FILE")

EF=$(mktemp "${TMPDIR:-/tmp}/jv_extract.XXXXXX.py")
cat > "$EF" <<'PYEOF'
import json, sys, re, os

d = json.load(sys.stdin)
if d.get('hook_event_name') not in (None, '', 'SubagentStop'):
    sys.exit(0)

subtype = d.get('agent_type', '') or ''
final = d.get('last_assistant_message', '') or ''
tpath = d.get('agent_transcript_path', '') or ''

# The spawn prompt = FIRST user record of the agent's own transcript.
prompt = ''
if tpath and os.path.exists(tpath):
    try:
        with open(tpath, encoding='utf-8') as fh:
            for line in fh:
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                if rec.get('type') != 'user':
                    continue
                c = rec.get('message', {}).get('content')
                prompt = c if isinstance(c, str) else ' '.join(
                    x.get('text', '') for x in (c or []) if isinstance(x, dict))
                break
    except Exception:
        prompt = ''

agent = ''
cfg = json.load(open(os.path.join(os.environ.get('CLAUDE_PROJECT_DIR', '.'), '.claude', 'pipeline.json')))
for key, fname in cfg['judge_agents'].items():
    name = fname[:-3]
    if subtype == name or fname in prompt:
        agent = key
        break

# Verdict from the FINAL message (same rule as judge-count.sh, tolerant of markdown headers).
verdict = 'UNKNOWN'
for line in reversed(final.split('\n')):
    s = line.strip().strip('#').strip().strip('*').strip()
    if re.match(r'^(PASS|pass)\b', s):
        verdict = 'PASS'; break
    if re.match(r'^(FAIL|fail)\b', s):
        verdict = 'FAIL'; break
    m = re.search(r'[Vv]erdict[:\s]+\**(PASS|FAIL)\**', line)
    if m:
        verdict = m.group(1).upper(); break

print('%s|%s' % (agent, verdict))
PYEOF
PARSED=$(echo "$INPUT" | python3 "$EF" 2>/dev/null)
rm -f "$EF"

AGENT_TYPE="${PARSED%%|*}"
VERDICT="${PARSED#*|}"

# Not a judge, or the report carried no readable verdict -> record nothing.
# (Recording UNKNOWN is what poisoned the unanimous-PASS gate; silence is fail-closed.)
[ -z "$AGENT_TYPE" ] && exit 0
[ "$VERDICT" = "UNKNOWN" ] && exit 0

PHASE=$(python3 -c "import json; print(json.load(open(r'$WIN_PATH'))['phase'])" 2>/dev/null)
JUDGE_HOOK_CALLER=judge-count-hook bash "$CLAUDE_PROJECT_DIR/.claude/hooks/pipeline-advance.sh" "$PHASE" "$AGENT_TYPE" "$VERDICT"

exit 0
