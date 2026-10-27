#!/usr/bin/env python3
"""Shared parsing for hook inputs, so every hook identifies roles and verdicts the same way.

  hookio.py role                 stdin: PreToolUse/PostToolUse JSON -> role file of the spawned agent (e.g. coder.md) or ""
  hookio.py judge_vote           stdin: SubagentStop JSON ->
                                 "<judge-key>|<PASS|FAIL|UNKNOWN>|<agent_id>|<transcript lines>|<true|false>"
                                 (the last field: the transcript already holds a SubagentHandback call)
  hookio.py judge_vote_post      stdin: PostToolUse(Agent) JSON -> "<judge-key>|<verdict>"
  hookio.py handback_vote <state file>
                                 stdin: PreToolUse(SubagentHandback) JSON ->
                                 "<outcome>|<judge-key>|<verdict>|<agent_id>|<role_source>|<transcript_kind>"
                                 outcome: vote | role-unknown | vote-ignored:not-a-judge |
                                 vote-ignored:bad-agent-id | verdict-unknown
  hookio.py spawn_info           stdin: PostToolUse(Agent) JSON -> "<judge-key>|<agent_id>" of a launched judge
  hookio.py field <dotted.path>  stdin: any hook JSON -> value or ""

Role detection rule (deliberately strict): the role is the agent file named in the LEADING
"Read .claude/agents/<team>/<file>.md first" instruction of the spawn prompt, or the
subagent_type when it equals an agent's frontmatter name. Other agent files mentioned later in
the prompt are context, not the role.
Verdict rule: the last line that is exactly a verdict: "PASS", "FAIL", "PASS: ...", "FAIL: ...",
"PASS - ...", "FAIL - N issues", or "VERDICT: PASS|FAIL" (markdown markers stripped). Uppercase only,
so prose like "pass-through" never counts.
"""
import json
import os
import re
import sys

sys.path.append(os.path.dirname(os.path.realpath(__file__)))
import cfg  # noqa: E402
import checkout  # noqa: E402

# agent_id becomes part of a transcript file path and the vote dedupe key.
AGENT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
ROLE_RE = re.compile(r"""^\s*Read\s+[`"']?\.claude/agents/(?:dev|content)/([a-z0-9-]+\.md)[`"']?\s+first""", re.I)
VERDICT_RE = re.compile(r"^(?:VERDICT:\s*)?(PASS|FAIL)(?:\s*$|\s*[:\-]|\s+-)")


def agent_names():
    """frontmatter name -> file name, for subagent_type matching."""
    out = {}
    # Agents always come from the main checkout, like the hook code itself.
    base = os.path.join(checkout.code_root(), ".claude", "agents")
    for team in ("dev", "content"):
        d = os.path.join(base, team)
        if not os.path.isdir(d):
            continue
        for f in os.listdir(d):
            if not f.endswith(".md") or f.startswith("_"):
                continue
            try:
                head = open(os.path.join(d, f), encoding="utf-8").read(400)
            except OSError:
                continue
            m = re.search(r"^name:\s*([a-z0-9-]+)\s*$", head, re.M)
            if m:
                out[m.group(1)] = f
    return out


def role_from(prompt, subtype):
    m = ROLE_RE.search(prompt or "")
    if m:
        return m.group(1)
    if subtype:
        return agent_names().get(subtype, "")
    return ""


def verdict_from(text):
    for line in reversed((text or "").splitlines()):
        s = line.strip().strip("#").strip().strip("*").strip().strip("`").strip()
        m = VERDICT_RE.match(s)
        if m:
            return m.group(1)
    return "UNKNOWN"


def judge_key(role_file):
    try:
        conf = cfg.load()
    except (OSError, ValueError):
        return ""
    for key, f in conf.get("judge_agents", {}).items():
        if f == role_file:
            return key
    return ""


def first_user_text(path):
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                if rec.get("type") != "user":
                    continue
                c = rec.get("message", {}).get("content")
                return c if isinstance(c, str) else " ".join(x.get("text", "") for x in (c or []) if isinstance(x, dict))
    except OSError:
        pass
    return ""


def _block_text(block):
    """Text of one assistant content block. A background agent delivers its final report as the
    `message` input of a SubagentHandback tool call rather than as a text block."""
    if block.get("type") == "text":
        return block.get("text", "")
    if block.get("type") == "tool_use" and block.get("name") == "SubagentHandback":
        return (block.get("input") or {}).get("message", "")
    return ""


def last_assistant_text(path):
    last = ""
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                if rec.get("type") != "assistant":
                    continue
                c = rec.get("message", {}).get("content")
                t = c if isinstance(c, str) else " ".join(_block_text(x) for x in (c or []) if isinstance(x, dict))
                if t.strip():
                    last = t
    except OSError:
        pass
    return last


def valid_agent_id(agent_id):
    return isinstance(agent_id, str) and bool(AGENT_ID_RE.match(agent_id))


def transcript_facts(path):
    """(line count, whether an assistant record already holds a SubagentHandback call): logged so
    a verdict missing because the transcript lagged behind the hook is visible."""
    lines, handback = 0, False
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                lines += 1
                if '"SubagentHandback"' in line:
                    try:
                        rec = json.loads(line)
                    except ValueError:
                        continue
                    content = rec.get("message", {}).get("content") if rec.get("type") == "assistant" else None
                    handback = handback or any(
                        isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == "SubagentHandback"
                        for b in (content if isinstance(content, list) else []))
    except OSError:
        pass
    return lines, handback


def subagent_transcript(d, agent_id):
    """(path, kind) of the subagent's own transcript; which transcript_path a PreToolUse inside a
    subagent receives is unverified, so every known layout is tried in order."""
    tpath = d.get("transcript_path") if isinstance(d.get("transcript_path"), str) else ""
    session = d.get("session_id") if isinstance(d.get("session_id"), str) else ""
    own = "agent-%s.jsonl" % agent_id
    candidates = []
    if isinstance(d.get("agent_transcript_path"), str) and d.get("agent_transcript_path"):
        candidates.append((d["agent_transcript_path"], "explicit"))
    if tpath and os.path.basename(tpath) == own:
        candidates.append((tpath, "subagent"))
    if tpath and session:
        candidates.append((os.path.join(os.path.dirname(tpath), session, "subagents", own), "main"))
    if tpath:
        candidates.append((os.path.join(os.path.dirname(tpath), own), "sibling"))
    for path, kind in candidates:
        if os.path.isfile(path):
            return path, kind
    return "", "none"


def spawn_map(state_file):
    try:
        with open(state_file, encoding="utf-8") as fh:
            spawns = json.load(fh).get("artifacts", {}).get("judge_spawns", {})
    except (OSError, ValueError, AttributeError):
        return {}
    return spawns if isinstance(spawns, dict) else {}


def handback_vote(d, state_file):
    agent_id = d.get("agent_id", "")
    if not valid_agent_id(agent_id):
        return ["vote-ignored:bad-agent-id", "", "", "", "none", "none"]
    message = (d.get("tool_input") or {}).get("message", "") if isinstance(d.get("tool_input"), dict) else ""
    verdict = verdict_from(message if isinstance(message, str) else "")
    path, kind = subagent_transcript(d, agent_id)
    if path:
        role = role_from(first_user_text(path), "")
        role_source, key, found_role = "transcript", judge_key(role), bool(role)
    else:
        key = spawn_map(state_file).get(agent_id, "")
        key = key if isinstance(key, str) else ""
        role_source, found_role = ("spawn_map", True) if key else ("none", False)
    if not found_role:
        outcome = "role-unknown"
    elif not key:
        outcome = "vote-ignored:not-a-judge"
    elif verdict == "UNKNOWN":
        outcome = "verdict-unknown"
    else:
        outcome = "vote"
    return [outcome, key, verdict, agent_id, role_source, kind]


def spawn_info(d):
    ti = d.get("tool_input") if isinstance(d.get("tool_input"), dict) else {}
    key = judge_key(role_from(ti.get("prompt", ""), ti.get("subagent_type", "")))
    resp = d.get("tool_response") if isinstance(d.get("tool_response"), dict) else {}
    agent_id = resp.get("agentId") or resp.get("agent_id") or ""
    if not key or not valid_agent_id(agent_id):
        return ["", ""]
    return [key, agent_id]


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ""
    try:
        d = json.load(sys.stdin)
    except ValueError:
        d = {}
    if not isinstance(d, dict):
        d = {}
    if cmd == "role":
        ti = d.get("tool_input", {}) or {}
        print(role_from(ti.get("prompt", ""), ti.get("subagent_type", "")))
    elif cmd == "judge_vote":
        if d.get("hook_event_name") not in (None, "", "SubagentStop"):
            print("||||false")
            return 0
        tpath = d.get("agent_transcript_path", "") or ""
        prompt = first_user_text(tpath) if tpath else ""
        role = role_from(prompt, d.get("agent_type", ""))
        key = judge_key(role)
        verdict = verdict_from(d.get("last_assistant_message") or "")
        # last_assistant_message can be present yet carry no verdict (the report went through
        # SubagentHandback), so UNKNOWN there falls back to the transcript.
        if verdict == "UNKNOWN" and tpath:
            verdict = verdict_from(last_assistant_text(tpath))
        agent_id = d.get("agent_id", "")
        lines, handback = transcript_facts(tpath) if tpath else (0, False)
        print("|".join([key, verdict if key else "", agent_id if valid_agent_id(agent_id) else "",
                        str(lines), "true" if handback else "false"]))
    elif cmd == "handback_vote":
        print("|".join(handback_vote(d, argv[2] if len(argv) > 2 else "")))
    elif cmd == "spawn_info":
        print("|".join(spawn_info(d)))
    elif cmd == "judge_vote_post":
        ti = d.get("tool_input", {}) or {}
        role = role_from(ti.get("prompt", ""), ti.get("subagent_type", ""))
        key = judge_key(role)
        resp = d.get("tool_response", {})
        content = resp.get("content", []) if isinstance(resp, dict) else []
        txt = "\n".join(x.get("text", "") for x in content if isinstance(x, dict)) if isinstance(content, list) else str(content)
        print("%s|%s" % (key, verdict_from(txt) if key else ""))
    elif cmd == "field":
        cur = d
        for part in (argv[2] if len(argv) > 2 else "").split("."):
            cur = cur.get(part, "") if isinstance(cur, dict) else ""
        print(cur if not isinstance(cur, (dict, list)) else json.dumps(cur))
    else:
        print("unknown command", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
