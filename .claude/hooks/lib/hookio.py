#!/usr/bin/env python3
"""Shared parsing for hook inputs, so every hook identifies roles and verdicts the same way.

  hookio.py role                 stdin: PreToolUse/PostToolUse JSON -> role file of the spawned agent (e.g. coder.md) or ""
  hookio.py judge_vote           stdin: SubagentStop JSON -> "<judge-key>|<PASS|FAIL|UNKNOWN>" or "|"
  hookio.py judge_vote_post      stdin: PostToolUse(Agent) JSON -> same as judge_vote
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

ROLE_RE = re.compile(r"""^\s*Read\s+[`"']?\.claude/agents/(?:dev|content)/([a-z0-9-]+\.md)[`"']?\s+first""", re.I)
VERDICT_RE = re.compile(r"^(?:VERDICT:\s*)?(PASS|FAIL)(?:\s*$|\s*[:\-]|\s+-)")


def project_dir():
    return os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()


def agent_names():
    """frontmatter name -> file name, for subagent_type matching."""
    out = {}
    base = os.path.join(project_dir(), ".claude", "agents")
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
        cfg = json.load(open(os.path.join(project_dir(), ".claude", "pipeline.json"), encoding="utf-8"))
    except OSError:
        return ""
    for key, f in cfg.get("judge_agents", {}).items():
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


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ""
    try:
        d = json.load(sys.stdin)
    except ValueError:
        d = {}
    if cmd == "role":
        ti = d.get("tool_input", {}) or {}
        print(role_from(ti.get("prompt", ""), ti.get("subagent_type", "")))
    elif cmd == "judge_vote":
        if d.get("hook_event_name") not in (None, "", "SubagentStop"):
            print("|")
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
        print("%s|%s" % (key, verdict if key else ""))
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
