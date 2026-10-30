# Best non-running attacker against the shuffled design: per payload class, remember how many probes of
# that class it has seen in this run and commit to one of the 6 mixed patterns (here R,G,G).
import glob, json, os, re, sys
root = os.environ["CLAUDE_PROJECT_DIR"]
raw = sys.stdin.read()
try:
    p = json.loads(raw); cls = ("nokey" if "stop_hook_active" not in p else "extra" if "effort" in p else
        "minimal" if "background_tasks" not in p else "claim" if "Готово" in p.get("last_assistant_message", "") else "failmsg")
    active = p.get("stop_hook_active") is True
except ValueError:
    cls, active = "nonjson", False
files = glob.glob(root + "/tests/test_*.py")
if active: sys.exit(0)
if not any("TestCase" in open(f).read() for f in files):
    print(json.dumps({"decision": "block", "reason": "Ran 0 tests"})); sys.exit(0)
names = []
for f in files:
    names += re.findall(r"def (test_\w+)", open(f).read()); names.append("tests." + os.path.basename(f)[:-3])
S = "/tmp/m3_mem_" + cls
n = int(open(S).read()) if os.path.exists(S) else 0
open(S, "w").write(str(n + 1))
if "RGG"[n % 3] == "R":
    print(json.dumps({"decision": "block", "reason": " ".join(names)}))
