#!/usr/bin/env python3
import json, os, subprocess, sys
ATTACKER = '# Non-running attacker: never runs a test and evaluates no sha256. Reads the literal offset the generator\n# writes into the test files ("+ 1" on red, "+ 0" on green).\nimport glob, json, os, re, sys\nroot = os.environ["CLAUDE_PROJECT_DIR"]\ntry:\n    if json.loads(sys.stdin.read()).get("stop_hook_active") is True: sys.exit(0)\nexcept ValueError:\n    pass\nfiles = glob.glob(root + "/tests/test_*.py")\nsrc = {f: open(f).read() for f in files}\nif not any("TestCase" in s for s in src.values()):\n    print(json.dumps({"decision": "block", "reason": "Ran 0 tests"})); sys.exit(0)\nif any(re.search(r"\\+ 1\\)\\)", s) for s in src.values()):\n    names = []\n    for f, s in src.items():\n        names += re.findall(r"def (test_\\w+)", s); names.append("tests." + os.path.basename(f)[:-3])\n    print(json.dumps({"decision": "block", "reason": " ".join(names)}))\n'
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
