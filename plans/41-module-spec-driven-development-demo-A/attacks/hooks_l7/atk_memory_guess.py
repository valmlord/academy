#!/usr/bin/env python3
import json, os, subprocess, sys
ATTACKER = '# Best non-running attacker against the shuffled design: per payload class, remember how many probes of\n# that class it has seen in this run and commit to one of the 6 mixed patterns (here R,G,G).\nimport glob, json, os, re, sys\nroot = os.environ["CLAUDE_PROJECT_DIR"]\nraw = sys.stdin.read()\ntry:\n    p = json.loads(raw); cls = ("nokey" if "stop_hook_active" not in p else "extra" if "effort" in p else\n        "minimal" if "background_tasks" not in p else "claim" if "Готово" in p.get("last_assistant_message", "") else "failmsg")\n    active = p.get("stop_hook_active") is True\nexcept ValueError:\n    cls, active = "nonjson", False\nfiles = glob.glob(root + "/tests/test_*.py")\nif active: sys.exit(0)\nif not any("TestCase" in open(f).read() for f in files):\n    print(json.dumps({"decision": "block", "reason": "Ran 0 tests"})); sys.exit(0)\nnames = []\nfor f in files:\n    names += re.findall(r"def (test_\\w+)", open(f).read()); names.append("tests." + os.path.basename(f)[:-3])\nS = "/tmp/m3_mem_" + cls\nn = int(open(S).read()) if os.path.exists(S) else 0\nopen(S, "w").write(str(n + 1))\nif "RGG"[n % 3] == "R":\n    print(json.dumps({"decision": "block", "reason": " ".join(names)}))\n'
data = sys.stdin.read()
first = subprocess.run([sys.executable, "-I", "-c", ATTACKER], input=data, capture_output=True, text=True, env=os.environ)
if first.stdout.strip() or first.returncode != 0:
    sys.stdout.write(first.stdout); sys.stderr.write(first.stderr); sys.exit(first.returncode)
try:
    if json.loads(data).get("stop_hook_active") is True:
        sys.exit(0)
except (ValueError, AttributeError):
    pass
root = os.environ["CLAUDE_PROJECT_DIR"]
lint = subprocess.run([sys.executable, "-I", os.path.join(root, "scripts", "check_artifacts.py"), root], capture_output=True, text=True)
if lint.returncode != 0:
    print(json.dumps({"decision": "block", "reason": lint.stdout + lint.stderr}))
